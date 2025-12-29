/**
 * Production Orchestrator
 * 
 * Coordinates the full production pipeline (Stage I):
 * - I-A: Storyboarder (visual beat identification)
 * - I-B: Audio Synthesis (ElevenLabs)
 * - I-C: Image Generation (DALL-E 3)
 * - I-D: Video Assembly (FFmpeg)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { ElevenLabsClient } from './elevenlabs-client.js';
import { ImageClient } from './image-client.js';
import { Storyboarder, type SceneContext } from './storyboarder.js';
import { ScriptParser, DEFAULT_CHARACTER_MAPPINGS, DEFAULT_LOCATION_MAPPINGS } from './script-parser.js';
import { VideoAssembler } from './video-assembler.js';
import type {
  CastingRegistry,
  ProductionConstraints,
  ProductionResult,
  ReviewItem,
  EpisodeStoryboard,
  AudioTimingManifest,
  CharacterVisualDNA,
  LocationVisualDNA,
  ProductionManifest,
  ProductionShot,
} from '../types/production.js';

// ============================================================================
// Types
// ============================================================================

export interface ProductionConfig {
  basePath: string;
  seasonId: string;
  episodeId: string;
  
  // Stage toggles (for isolated testing)
  runStoryboard?: boolean;
  runAudioSynth?: boolean;
  runImageGen?: boolean;
  runVideoAssembly?: boolean;
  
  // Options
  dryRun?: boolean;  // Generate manifests but don't call APIs
  force?: boolean;   // Regenerate all files, ignoring existing progress
  maxImagesPerScene?: number;
  visualCadenceOverride?: number;
  disableMotion?: boolean;  // Use static images without pan/zoom effects
}

export interface PreviewResult {
  success: boolean;
  episode_id: string;
  preview_file?: string;
  complete_scenes: string[];
  incomplete_scenes: string[];
  errors?: string[];
}

export interface WorldData {
  characters: Record<string, { visual_dna?: CharacterVisualDNA }>;
  locations: Record<string, { visual_dna?: LocationVisualDNA }>;
  constraints: { production_constraints?: ProductionConstraints };
}

// ============================================================================
// Production Orchestrator
// ============================================================================

export class ProductionOrchestrator {
  private config: ProductionConfig;
  private elevenlabs: ElevenLabsClient;
  private imageClient: ImageClient;
  private storyboarder: Storyboarder;
  private parser: ScriptParser;
  
  private reviewQueue: ReviewItem[] = [];

  constructor(config: ProductionConfig) {
    this.config = {
      runStoryboard: true,
      runAudioSynth: true,
      runImageGen: true,
      runVideoAssembly: true,
      dryRun: false,
      force: false,
      ...config,
    };
    
    this.elevenlabs = new ElevenLabsClient();
    this.imageClient = new ImageClient();
    this.storyboarder = new Storyboarder();
    this.parser = new ScriptParser(DEFAULT_CHARACTER_MAPPINGS, DEFAULT_LOCATION_MAPPINGS);
  }

  /**
   * Run the complete production pipeline.
   */
  async run(): Promise<ProductionResult> {
    const errors: string[] = [];
    const audioFiles: string[] = [];
    const imageFiles: string[] = [];
    
    console.log(`\n=== Production Pipeline: ${this.config.episodeId} ===\n`);
    
    try {
      // Load required data
      const script = await this.loadEpisodeScript();
      const casting = await this.loadCasting();
      const worldData = await this.loadWorldData();
      const constraints = worldData.constraints.production_constraints || this.getDefaultConstraints();
      
      // Pre-production checks
      await this.runPreProductionChecks(script, casting, worldData);
      
      if (this.reviewQueue.some(item => item.blocking)) {
        console.log('\nBlocking issues found in pre-production checks.');
        
        // Save review_queue.json even on blocking failures so user can see the issues
        if (this.reviewQueue.length > 0) {
          await this.saveArtifact('review_queue.json', { 
            review_queue: this.reviewQueue,
            blocking_count: this.reviewQueue.filter(i => i.blocking).length,
            non_blocking_count: this.reviewQueue.filter(i => !i.blocking).length,
          });
          console.log(`\nSaved ${this.reviewQueue.length} issues to review_queue.json`);
          console.log(`Review and fix blocking issues, then re-run the pipeline.`);
        }
        
        return {
          success: false,
          episode_id: this.config.episodeId,
          review_queue: this.reviewQueue,
          errors: ['Blocking issues prevent production. See review_queue.json in episode folder.'],
        };
      }
      
      // Parse script into scenes
      const scenes = this.parser.parseEpisodeScript(script);
      console.log(`Parsed ${scenes.length} scenes from script`);
      
      // Create output directories
      const episodeDir = this.getEpisodeDir();
      const audioDir = path.join(episodeDir, 'audio');
      const framesDir = path.join(episodeDir, 'frames');
      
      await fs.mkdir(audioDir, { recursive: true });
      await fs.mkdir(framesDir, { recursive: true });
      
      // Stage I-A: Storyboard
      let storyboard: EpisodeStoryboard | undefined;
      if (this.config.runStoryboard) {
        console.log('\n--- Stage I-A: Storyboarding ---');
        
        if (this.config.dryRun) {
          // In dry-run mode, use existing storyboard if available and not a placeholder
          const existingStoryboard = await this.tryLoadExistingStoryboard();
          if (existingStoryboard && !this.isPlaceholderStoryboard(existingStoryboard)) {
            console.log('  (Dry run - using existing storyboard.json)');
            storyboard = existingStoryboard;
          } else {
            console.log('  (Dry run - generating placeholder storyboard)');
            storyboard = this.generatePlaceholderStoryboard(scenes);
            await this.saveArtifact('storyboard.json', storyboard);
          }
        } else {
          // Real run - check if we're about to use placeholder data
          const existingStoryboard = await this.tryLoadExistingStoryboard();
          if (existingStoryboard && this.isPlaceholderStoryboard(existingStoryboard)) {
            console.log('  Existing storyboard.json is a placeholder - regenerating...');
          }
          storyboard = await this.runStoryboarding(scenes, worldData, constraints);
          await this.saveArtifact('storyboard.json', storyboard);
        }
        console.log(`Generated ${storyboard!.total_shots} shots across ${storyboard!.scenes.length} scenes`);
      }
      
      // Stage I-B: Audio Synthesis
      const audioManifests: AudioTimingManifest[] = [];
      if (this.config.runAudioSynth) {
        console.log('\n--- Stage I-B: Audio Synthesis ---');
        
        if (this.config.dryRun) {
          console.log('  (Dry run - skipping API calls)');
        } else {
          const audioResult = await this.runAudioSynthesis(scenes, casting, audioDir);
          audioFiles.push(...audioResult.files);
          audioManifests.push(...audioResult.manifests);
          
          if (audioResult.errors.length > 0) {
            errors.push(...audioResult.errors);
          }
        }
      }
      
      // Stage I-C: Image Generation
      if (this.config.runImageGen && storyboard) {
        console.log('\n--- Stage I-C: Image Generation ---');
        
        if (this.config.dryRun) {
          console.log('  (Dry run - skipping API calls)');
        } else {
          // Validate storyboard before generating images
          if (!this.validateStoryboardForProduction(storyboard)) {
            errors.push('Cannot generate images from placeholder storyboard. Run storyboard stage first.');
          } else {
            const imageResult = await this.runImageGeneration(storyboard, constraints, framesDir);
            imageFiles.push(...imageResult.files);
            
            if (imageResult.errors.length > 0) {
              errors.push(...imageResult.errors);
            }
          }
        }
      }
      
      // Stage I-D: Video Assembly
      let manifest: ProductionManifest | undefined;
      let videoFile: string | undefined;
      if (this.config.runVideoAssembly && storyboard) {
        console.log('\n--- Stage I-D: Video Assembly ---');
        
        const assembler = new VideoAssembler({
          outputDir: episodeDir,
          audioDir,
          framesDir,
        });
        
        // Generate manifest
        manifest = assembler.generateManifest(
          this.config.episodeId,
          storyboard.scenes,
          audioManifests
        );
        
        await this.saveArtifact('production_manifest.json', manifest);
        
        // Generate FFmpeg commands
        const commands = assembler.generateEpisodeFFmpegCommands(manifest);
        await assembler.writeFFmpegScript(this.config.episodeId, commands);
        await assembler.writeListFiles(manifest);
        
        console.log(`Generated production manifest and FFmpeg script`);
        
        // Check if we should attempt assembly
        if (!this.config.dryRun && imageFiles.length > 0 && audioFiles.length > 0) {
          const hasFFmpeg = await assembler.checkFFmpegAvailable();
          if (hasFFmpeg) {
            console.log('FFmpeg available - video assembly ready to run');
            videoFile = path.join(episodeDir, `${this.config.episodeId}_final.mp4`);
          } else {
            console.log('FFmpeg not available - manual assembly required');
            console.log(`Run: ${episodeDir}/${this.config.episodeId}_assemble.sh`);
          }
        }
      }
      
      // Save review queue
      if (this.reviewQueue.length > 0) {
        await this.saveArtifact('review_queue.json', { review_queue: this.reviewQueue });
      }
      
      // Clean up progress files on successful completion (not in dry-run mode)
      if (errors.length === 0 && !this.config.dryRun) {
        await this.cleanupAudioProgress();
        await this.cleanupImageProgress();
        console.log('  Cleaned up progress files');
      }
      
      console.log(`\n=== Production Complete ===`);
      console.log(`Audio files: ${audioFiles.length}`);
      console.log(`Image files: ${imageFiles.length}`);
      console.log(`Review items: ${this.reviewQueue.length}`);
      
      return {
        success: errors.length === 0,
        episode_id: this.config.episodeId,
        storyboard,
        manifest,
        audio_files: audioFiles,
        image_files: imageFiles,
        video_file: videoFile,
        review_queue: this.reviewQueue.length > 0 ? this.reviewQueue : undefined,
        errors: errors.length > 0 ? errors : undefined,
      };
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      console.error('Production error:', message);
      
      return {
        success: false,
        episode_id: this.config.episodeId,
        errors,
        review_queue: this.reviewQueue,
      };
    }
  }

  /**
   * Run only the storyboarding stage (for isolated testing).
   */
  async runStoryboardOnly(): Promise<EpisodeStoryboard | null> {
    const script = await this.loadEpisodeScript();
    const worldData = await this.loadWorldData();
    const constraints = worldData.constraints.production_constraints || this.getDefaultConstraints();
    const scenes = this.parser.parseEpisodeScript(script);
    
    const storyboard = await this.runStoryboarding(scenes, worldData, constraints);
    await this.saveArtifact('storyboard.json', storyboard);
    
    return storyboard;
  }

  /**
   * Run only the audio synthesis stage (for isolated testing).
   */
  async runAudioOnly(): Promise<{ files: string[]; errors: string[]; skipped: number }> {
    const script = await this.loadEpisodeScript();
    const casting = await this.loadCasting();
    const scenes = this.parser.parseEpisodeScript(script);
    
    const audioDir = path.join(this.getEpisodeDir(), 'audio');
    await fs.mkdir(audioDir, { recursive: true });
    
    const result = await this.runAudioSynthesis(scenes, casting, audioDir);
    return { files: result.files, errors: result.errors, skipped: result.skipped };
  }

  /**
   * Run only the image generation stage (for isolated testing).
   * Requires storyboard.json to exist.
   */
  async runImageOnly(): Promise<{ files: string[]; errors: string[]; skipped: number }> {
    const storyboard = await this.loadArtifact('storyboard.json') as EpisodeStoryboard;
    const worldData = await this.loadWorldData();
    const constraints = worldData.constraints.production_constraints || this.getDefaultConstraints();
    
    const framesDir = path.join(this.getEpisodeDir(), 'frames');
    await fs.mkdir(framesDir, { recursive: true });
    
    return this.runImageGeneration(storyboard, constraints, framesDir);
  }

  /**
   * Run preview mode: assemble video only for scenes with complete assets.
   * A "complete" scene has:
   * - All audio segments generated (non-empty audio files)
   * - All images generated (non-placeholder PNG files)
   * 
   * This allows testing casting, image quality, and video assembly
   * before committing to expensive full generation.
   */
  async runPreview(): Promise<PreviewResult> {
    const errors: string[] = [];
    
    console.log(`\n=== Preview Mode: ${this.config.episodeId} ===\n`);
    console.log('Scanning for complete scenes (real audio + real images)...\n');
    
    try {
      const episodeDir = this.getEpisodeDir();
      const audioDir = path.join(episodeDir, 'audio');
      const framesDir = path.join(episodeDir, 'frames');
      
      // Load storyboard to know expected shots per scene
      const storyboard = await this.loadArtifact('storyboard.json') as EpisodeStoryboard;
      
      // Load audio manifests to know expected audio segments per scene
      const audioManifests = await this.loadAudioProgress();
      
      // Load casting for per-character audio processing
      const casting = await this.loadCasting();
      
      // Detect which scenes are complete
      const { complete, incomplete } = await this.detectCompleteScenes(
        storyboard,
        audioManifests,
        audioDir,
        framesDir
      );
      
      console.log(`Complete scenes: ${complete.length > 0 ? complete.join(', ') : 'none'}`);
      console.log(`Incomplete scenes: ${incomplete.length > 0 ? incomplete.join(', ') : 'none'}\n`);
      
      if (complete.length === 0) {
        return {
          success: false,
          episode_id: this.config.episodeId,
          complete_scenes: [],
          incomplete_scenes: incomplete,
          errors: ['No complete scenes found. Generate audio and images first.'],
        };
      }
      
      // Create preview video assembler early to check FFmpeg availability
      const assembler = new VideoAssembler({
        outputDir: episodeDir,
        audioDir,
        framesDir,
      });
      
      // Check FFmpeg availability before doing any work
      const hasFFmpeg = await assembler.checkFFmpegAvailable();
      if (!hasFFmpeg) {
        return {
          success: false,
          episode_id: this.config.episodeId,
          complete_scenes: complete,
          incomplete_scenes: incomplete,
          errors: ['FFmpeg not available. Install FFmpeg to generate preview video (brew install ffmpeg on macOS).'],
        };
      }
      
      // Filter storyboard and manifests to only complete scenes
      const completeStoryboard: EpisodeStoryboard = {
        episode_id: storyboard.episode_id,
        scenes: storyboard.scenes.filter(s => complete.includes(s.scene_id)),
        total_shots: storyboard.scenes
          .filter(s => complete.includes(s.scene_id))
          .reduce((sum, s) => sum + s.shot_count, 0),
      };
      
      const completeManifests = audioManifests.filter(m => complete.includes(m.scene_id));
      
      // Generate master audio files for each complete scene
      // Applies per-character audio processing (gain, limiter) from casting.json
      console.log('Generating master audio tracks for complete scenes...');
      for (const manifest of completeManifests) {
        const masterFile = path.join(audioDir, `${manifest.scene_id}_master.mp3`);
        
        // Check if master already exists (skip unless --force)
        let shouldGenerate = this.config.force;
        if (!shouldGenerate) {
          try {
            await fs.access(masterFile);
            console.log(`  ${manifest.scene_id}_master.mp3 already exists, skipping`);
            console.log(`    (use --force to regenerate with updated audio_processing settings)`);
          } catch {
            shouldGenerate = true;
          }
        }
        
        if (shouldGenerate) {
          console.log(`  Generating ${manifest.scene_id}_master.mp3...`);
          const result = await this.concatenateAudioFilesWithProcessing(
            manifest.audio_segments,
            audioDir,
            masterFile,
            casting
          );
          if (!result.success) {
            errors.push(`Failed to create master audio for ${manifest.scene_id}: ${result.error}`);
          }
        }
      }
      
      // Generate preview manifest
      console.log('\nGenerating preview manifest...');
      const previewManifest = assembler.generateManifest(
        `${this.config.episodeId}_preview`,
        completeStoryboard.scenes,
        completeManifests
      );
      
      await this.saveArtifact('preview_manifest.json', previewManifest);
      
      // Generate preview video
      console.log('Assembling preview video...');
      const previewFile = path.join(episodeDir, `${this.config.episodeId}_preview.mp4`);
      
      const assemblyResult = await this.assemblePreviewVideo(
        previewManifest,
        audioDir,
        framesDir,
        previewFile
      );
      
      if (!assemblyResult.success) {
        errors.push(...(assemblyResult.errors || []));
      }
      
      console.log(`\n=== Preview Complete ===`);
      console.log(`Scenes included: ${complete.join(', ')}`);
      if (assemblyResult.success) {
        console.log(`Preview video: ${previewFile}`);
      }
      
      return {
        success: errors.length === 0,
        episode_id: this.config.episodeId,
        preview_file: assemblyResult.success ? previewFile : undefined,
        complete_scenes: complete,
        incomplete_scenes: incomplete,
        errors: errors.length > 0 ? errors : undefined,
      };
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      console.error('Preview error:', message);
      
      return {
        success: false,
        episode_id: this.config.episodeId,
        complete_scenes: [],
        incomplete_scenes: [],
        errors,
      };
    }
  }

  /**
   * Detect which scenes have complete assets (all audio + all real images).
   */
  private async detectCompleteScenes(
    storyboard: EpisodeStoryboard,
    audioManifests: AudioTimingManifest[],
    audioDir: string,
    framesDir: string
  ): Promise<{ complete: string[]; incomplete: string[] }> {
    const complete: string[] = [];
    const incomplete: string[] = [];
    
    for (const scene of storyboard.scenes) {
      const sceneId = scene.scene_id;
      
      // Check audio: scene must have a manifest entry with all segments existing
      const audioManifest = audioManifests.find(m => m.scene_id === sceneId);
      if (!audioManifest || audioManifest.audio_segments.length === 0) {
        incomplete.push(sceneId);
        continue;
      }
      
      // Verify all audio files exist
      let audioComplete = true;
      for (const segment of audioManifest.audio_segments) {
        const audioPath = path.join(audioDir, segment.file);
        try {
          const stats = await fs.stat(audioPath);
          if (stats.size === 0) {
            audioComplete = false;
            break;
          }
        } catch {
          audioComplete = false;
          break;
        }
      }
      
      if (!audioComplete) {
        incomplete.push(sceneId);
        continue;
      }
      
      // Check images: all shots must have non-placeholder images
      let imagesComplete = true;
      for (const shot of scene.shots) {
        const imageFile = `${shot.shot_id}.png`;
        const imagePath = path.join(framesDir, imageFile);
        const placeholderPath = path.join(framesDir, `${shot.shot_id}_placeholder.png`);
        
        try {
          // Check if real image exists (not placeholder)
          const stats = await fs.stat(imagePath);
          if (stats.size === 0) {
            imagesComplete = false;
            break;
          }
        } catch {
          // Real image doesn't exist - check if only placeholder exists
          try {
            await fs.stat(placeholderPath);
            // Placeholder exists but real image doesn't
            imagesComplete = false;
            break;
          } catch {
            // Neither exists
            imagesComplete = false;
            break;
          }
        }
      }
      
      if (!imagesComplete) {
        incomplete.push(sceneId);
        continue;
      }
      
      // Scene is complete!
      complete.push(sceneId);
    }
    
    return { complete, incomplete };
  }

  /**
   * Concatenate audio files with per-character audio processing (gain, limiter).
   * Uses FFmpeg's filter_complex to apply individual filters to each input before concatenating.
   */
  private async concatenateAudioFilesWithProcessing(
    segments: AudioTimingManifest['audio_segments'],
    audioDir: string,
    outputFile: string,
    casting: CastingRegistry
  ): Promise<{ success: boolean; error?: string }> {
    if (segments.length === 0) {
      return { success: false, error: 'No segments provided' };
    }
    
    // Build per-character gain map from casting
    const characterGains = new Map<string, { gain_db: number; apply_limiter: boolean }>();
    for (const mapping of casting.casting.voice_mappings) {
      if (mapping.audio_processing) {
        characterGains.set(mapping.character_id, {
          gain_db: mapping.audio_processing.gain_db ?? 0,
          apply_limiter: mapping.audio_processing.apply_limiter ?? false,
        });
      }
    }
    
    // Check if any processing is needed
    const needsProcessing = segments.some(s => {
      const proc = characterGains.get(s.character_id);
      return proc && (proc.gain_db !== 0 || proc.apply_limiter);
    });
    
    if (!needsProcessing) {
      // No processing needed, use simple concat
      return this.concatenateAudioFilesSimple(
        segments.map(s => path.join(audioDir, s.file)),
        outputFile
      );
    }
    
    // Build FFmpeg command with filter_complex for per-segment processing
    const inputArgs: string[] = [];
    const filterParts: string[] = [];
    const concatInputs: string[] = [];
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const filePath = path.join(audioDir, segment.file);
      const proc = characterGains.get(segment.character_id);
      
      inputArgs.push('-i', filePath);
      
      // Build filter for this input
      const filters: string[] = [];
      if (proc?.gain_db && proc.gain_db !== 0) {
        filters.push(`volume=${proc.gain_db}dB`);
      }
      if (proc?.apply_limiter) {
        filters.push('alimiter=limit=0.891:attack=5:release=50');
      }
      
      if (filters.length > 0) {
        filterParts.push(`[${i}:a]${filters.join(',')}[a${i}]`);
        concatInputs.push(`[a${i}]`);
      } else {
        concatInputs.push(`[${i}:a]`);
      }
    }
    
    // Build the concat filter
    const concatFilter = `${concatInputs.join('')}concat=n=${segments.length}:v=0:a=1[out]`;
    const fullFilter = filterParts.length > 0 
      ? `${filterParts.join('; ')}; ${concatFilter}`
      : concatFilter;
    
    const command = [
      'ffmpeg', '-y',
      ...inputArgs,
      '-filter_complex', fullFilter,
      '-map', '[out]',
      '-c:a', 'libmp3lame',
      '-q:a', '2',
      outputFile
    ];
    
    return this.runCommand(command);
  }

  /**
   * Simple concatenation without per-segment processing.
   */
  private async concatenateAudioFilesSimple(
    inputFiles: string[],
    outputFile: string
  ): Promise<{ success: boolean; error?: string }> {
    if (inputFiles.length === 0) {
      return { success: false, error: 'No input files provided' };
    }
    
    const episodeDir = this.getEpisodeDir();
    const listFile = path.join(episodeDir, 'temp_audio_list.txt');
    
    // Create concat list file
    const entries = inputFiles.map(f => `file '${f}'`).join('\n');
    await fs.writeFile(listFile, entries);
    
    const command = [
      'ffmpeg', '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c:a', 'libmp3lame',
      '-q:a', '2',
      outputFile
    ];
    
    const result = await this.runCommand(command);
    
    // Clean up temp file
    try {
      await fs.unlink(listFile);
    } catch {
      // Ignore cleanup errors
    }
    
    return result;
  }

  /**
   * Assemble the preview video from complete scenes.
   * Uses all shots from the manifest, distributing them across the scene duration.
   */
  private async assemblePreviewVideo(
    manifest: ProductionManifest,
    audioDir: string,
    framesDir: string,
    outputFile: string
  ): Promise<{ success: boolean; errors?: string[] }> {
    const errors: string[] = [];
    const episodeDir = this.getEpisodeDir();
    const tempFiles: string[] = [];
    
    try {
      const sceneVideos: string[] = [];
      
      for (const scene of manifest.scenes) {
        console.log(`  Processing ${scene.scene_id} (${scene.shots.length} shots)...`);
        
        // Check if master audio exists
        const masterAudio = path.join(audioDir, scene.audio_track);
        try {
          await fs.access(masterAudio);
        } catch {
          errors.push(`Master audio not found: ${scene.audio_track}`);
          continue;
        }
        
        if (scene.shots.length === 0) {
          errors.push(`No shots in scene ${scene.scene_id}`);
          continue;
        }
        
        // Generate video clips for each shot
        const shotClips: string[] = [];
        
        for (const shot of scene.shots) {
          const imageFile = path.join(framesDir, shot.image_file);
          const clipFile = path.join(episodeDir, `${shot.shot_id}_clip.mp4`);
          tempFiles.push(clipFile);
          
          // Verify image exists
          try {
            await fs.access(imageFile);
          } catch {
            errors.push(`Image not found: ${shot.image_file}`);
            continue;
          }
          
          const durationSec = (shot.end_ms - shot.start_ms) / 1000;
          const frames = Math.ceil(durationSec * 24);
          
          // Build the video filter based on motion type
          const vf = this.buildMotionFilter(shot.motion, frames);
          
          // Create video clip from image
          const clipCommand = [
            'ffmpeg', '-y',
            '-loop', '1',
            '-i', imageFile,
            '-t', durationSec.toFixed(3),
            '-c:v', 'libx264',
            '-tune', 'stillimage',
            '-pix_fmt', 'yuv420p',
            '-r', '24',
            '-vf', vf,
            clipFile
          ];
          
          const clipResult = await this.runCommand(clipCommand);
          if (!clipResult.success) {
            errors.push(`Failed to create clip for ${shot.shot_id}: ${clipResult.error}`);
            continue;
          }
          
          shotClips.push(clipFile);
        }
        
        if (shotClips.length === 0) {
          errors.push(`No shot clips created for ${scene.scene_id}`);
          continue;
        }
        
        // Concatenate shot clips into a scene video (without audio first)
        const sceneVideoNoAudio = path.join(episodeDir, `${scene.scene_id}_noaudio.mp4`);
        tempFiles.push(sceneVideoNoAudio);
        
        if (shotClips.length === 1) {
          await fs.copyFile(shotClips[0], sceneVideoNoAudio);
        } else {
          const clipListFile = path.join(episodeDir, `${scene.scene_id}_clips.txt`);
          const clipEntries = shotClips.map(f => `file '${f}'`).join('\n');
          await fs.writeFile(clipListFile, clipEntries);
          tempFiles.push(clipListFile);
          
          const concatClipsCommand = [
            'ffmpeg', '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', clipListFile,
            '-c', 'copy',
            sceneVideoNoAudio
          ];
          
          const concatClipsResult = await this.runCommand(concatClipsCommand);
          if (!concatClipsResult.success) {
            errors.push(`Failed to concat clips for ${scene.scene_id}: ${concatClipsResult.error}`);
            continue;
          }
        }
        
        // Merge video with audio
        const sceneVideo = path.join(episodeDir, `${scene.scene_id}_preview.mp4`);
        tempFiles.push(sceneVideo);
        
        const mergeCommand = [
          'ffmpeg', '-y',
          '-i', sceneVideoNoAudio,
          '-i', masterAudio,
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-shortest',
          sceneVideo
        ];
        
        const mergeResult = await this.runCommand(mergeCommand);
        if (!mergeResult.success) {
          errors.push(`Failed to merge audio for ${scene.scene_id}: ${mergeResult.error}`);
          continue;
        }
        
        sceneVideos.push(sceneVideo);
      }
      
      if (sceneVideos.length === 0) {
        return { success: false, errors: ['No scene videos were created'] };
      }
      
      // Concatenate all scene videos
      if (sceneVideos.length === 1) {
        // Just copy the single scene video
        await fs.copyFile(sceneVideos[0], outputFile);
      } else {
        // Create concat list
        const concatList = path.join(episodeDir, 'preview_concat_list.txt');
        const entries = sceneVideos.map(f => `file '${f}'`).join('\n');
        await fs.writeFile(concatList, entries);
        tempFiles.push(concatList);
        
        const concatCommand = [
          'ffmpeg', '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', concatList,
          '-c', 'copy',
          outputFile
        ];
        
        const concatResult = await this.runCommand(concatCommand);
        if (!concatResult.success) {
          errors.push(`Failed to concatenate scene videos: ${concatResult.error}`);
        }
      }
      
      // Clean up temp files
      for (const tempFile of tempFiles) {
        try {
          await fs.unlink(tempFile);
        } catch {
          // Ignore cleanup errors
        }
      }
      
      return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      return { success: false, errors };
    }
  }

  /**
   * Build FFmpeg video filter for motion effect.
   * Respects the disableMotion config option.
   */
  private buildMotionFilter(
    motion: ProductionShot['motion'],
    frames: number
  ): string {
    const baseScale = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
    
    // If motion is disabled globally, use static
    if (this.config.disableMotion) {
      return baseScale;
    }
    
    // If no motion specified or static, use simple scale
    if (!motion || motion.type === 'static') {
      return baseScale;
    }
    
    // Apply motion effects via zoompan filter
    switch (motion.type) {
      case 'slow_zoom_in': {
        const startScale = motion.start_scale || 1.0;
        const endScale = motion.end_scale || 1.15;
        const delta = (endScale - startScale) / frames;
        return `${baseScale},zoompan=z='${startScale}+${delta}*on':d=${frames}:s=1920x1080:fps=24`;
      }
      case 'slow_zoom_out': {
        const startScale = motion.start_scale || 1.15;
        const endScale = motion.end_scale || 1.0;
        const delta = (startScale - endScale) / frames;
        return `${baseScale},zoompan=z='${startScale}-${delta}*on':d=${frames}:s=1920x1080:fps=24`;
      }
      case 'slow_pan_left': {
        const distance = motion.pan_distance_percent || 10;
        return `${baseScale},zoompan=z='1.1':x='(iw-iw/zoom)*${distance}/100*on/${frames}':d=${frames}:s=1920x1080:fps=24`;
      }
      case 'slow_pan_right': {
        const distance = motion.pan_distance_percent || 10;
        return `${baseScale},zoompan=z='1.1':x='(iw-iw/zoom)*(1-${distance}/100*on/${frames})':d=${frames}:s=1920x1080:fps=24`;
      }
      case 'subtle_shake':
        return `${baseScale},zoompan=z='1':x='iw/2-(iw/zoom/2)+random(0)*3':y='ih/2-(ih/zoom/2)+random(1)*3':d=${frames}:s=1920x1080:fps=24`;
      default:
        return baseScale;
    }
  }

  /**
   * Run a command and return the result.
   */
  private runCommand(args: string[]): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const proc = spawn(args[0], args.slice(1), { shell: false });
      
      let stderr = '';
      
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: stderr || `Exit code: ${code}` });
        }
      });
      
      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  // ==========================================================================
  // Stage Implementations
  // ==========================================================================

  private async runStoryboarding(
    scenes: Array<{ sceneId: string; text: string; locationId: string }>,
    worldData: WorldData,
    constraints: ProductionConstraints
  ): Promise<EpisodeStoryboard> {
    // Set output directory for progress saving
    this.storyboarder.setOutputDir(this.getEpisodeDir());
    
    const sceneContexts: SceneContext[] = scenes.map(scene => {
      // Gather Visual DNA for characters in this scene
      const characterDNA: Record<string, CharacterVisualDNA> = {};
      for (const [charId, charData] of Object.entries(worldData.characters)) {
        if (charData.visual_dna) {
          characterDNA[charId] = charData.visual_dna;
        }
      }
      
      // Get location Visual DNA
      const locationDNA = worldData.locations[scene.locationId]?.visual_dna;
      
      return {
        sceneId: scene.sceneId,
        sceneText: scene.text,
        locationId: scene.locationId,
        locationVisualDNA: locationDNA,
        characterVisualDNA: characterDNA,
        visualCadence: this.config.visualCadenceOverride,
      };
    });
    
    return this.storyboarder.storyboardEpisode(sceneContexts, constraints);
  }

  /**
   * Generate a placeholder storyboard for dry-run mode.
   * Creates one placeholder shot per scene.
   */
  private generatePlaceholderStoryboard(
    scenes: Array<{ sceneId: string; text: string; locationId: string }>
  ): EpisodeStoryboard {
    const storyboards = scenes.map(scene => ({
      scene_id: scene.sceneId,
      shot_count: 1,
      shots: [{
        shot_id: `${scene.sceneId}_shot_001`,
        sequence: 1,
        beat_reference: 'Placeholder for dry-run',
        shot_type: 'wide' as const,
        visual_prompt: `[DRY RUN] Establishing shot of ${scene.locationId}`,
        gpt_image_params: {
          style_suffix: 'placeholder',
        },
        motion_hint: 'static' as const,
      }],
    }));

    return {
      episode_id: scenes[0]?.sceneId.split('_')[0] || 'unknown',
      scenes: storyboards,
      total_shots: storyboards.length,
    };
  }

  private async runAudioSynthesis(
    scenes: Array<{ sceneId: string; text: string }>,
    casting: CastingRegistry,
    audioDir: string
  ): Promise<{
    files: string[];
    manifests: AudioTimingManifest[];
    errors: string[];
    skipped: number;
  }> {
    const files: string[] = [];
    const manifests: AudioTimingManifest[] = [];
    const errors: string[] = [];
    let totalSkipped = 0;
    
    // Load existing audio progress if available
    const existingManifests = await this.loadAudioProgress();
    const completedSceneIds = new Set(existingManifests.map(m => m.scene_id));
    
    if (existingManifests.length > 0 && !this.config.force) {
      console.log(`  Resuming from checkpoint: ${existingManifests.length} scenes have existing audio`);
      manifests.push(...existingManifests);
      for (const m of existingManifests) {
        files.push(...m.audio_segments.map(s => s.file));
      }
    }
    
    for (const scene of scenes) {
      // Skip fully completed scenes (all segments exist)
      if (completedSceneIds.has(scene.sceneId) && !this.config.force) {
        continue;
      }
      
      console.log(`  Processing ${scene.sceneId}...`);
      
      const sceneAudio = this.parser.extractAudioSegments(scene.sceneId, scene.text);
      
      if (sceneAudio.audio_segments.length === 0) {
        console.log(`    No audio segments found`);
        continue;
      }
      
      // Check for missing voice mappings
      const missingVoices = sceneAudio.audio_segments
        .map(s => s.character_id)
        .filter(id => !casting.casting.voice_mappings.some(m => m.character_id === id));
      
      const uniqueMissing = [...new Set(missingVoices)];
      for (const charId of uniqueMissing) {
        this.reviewQueue.push({
          type: 'voice_assignment',
          character_id: charId,
          reason: `No voice mapping for ${charId}`,
          blocking: true,
        });
      }
      
      if (uniqueMissing.length > 0) {
        errors.push(`Missing voice mappings: ${uniqueMissing.join(', ')}`);
        continue;
      }
      
      // Synthesize audio (with recovery support)
      const result = await this.elevenlabs.synthesizeToFiles(
        sceneAudio.audio_segments,
        casting,
        audioDir,
        { force: this.config.force }
      );
      
      totalSkipped += result.skipped;
      
      if (result.skipped > 0) {
        console.log(`    Skipped ${result.skipped} existing segments`);
      }
      
      // Build manifest with voice tracking info
      let cumulativeOffset = 0;
      const audioSegments = result.files.map(f => {
        const segment = {
          segment_id: f.segmentId,
          file: f.file,
          character_id: f.characterId,
          voice_id: f.voiceId,
          voice_name: f.voiceName,
          voice_version: f.voiceVersion,
          duration_ms: f.durationMs,
          cumulative_offset_ms: cumulativeOffset,
        };
        cumulativeOffset += f.durationMs + 1000; // 1 second silence between turns
        return segment;
      });
      
      const sceneManifest: AudioTimingManifest = {
        scene_id: scene.sceneId,
        audio_segments: audioSegments,
        total_duration_ms: cumulativeOffset,
        inter_turn_silence_ms: 1000, // 1 second between dialogue turns
      };
      
      manifests.push(sceneManifest);
      files.push(...result.files.map(f => f.file));
      
      // Save progress after each scene
      await this.saveAudioProgress(manifests);
      console.log(`    ✓ Saved audio progress (${manifests.length} scenes complete)`);
      
      for (const err of result.errors) {
        errors.push(`${err.segmentId}: ${err.error}`);
        this.reviewQueue.push({
          type: 'audio_content_flag',
          segment_id: err.segmentId,
          reason: err.error,
          blocking: false,
        });
      }
    }
    
    return { files, manifests, errors, skipped: totalSkipped };
  }

  // ==========================================================================
  // Audio Progress Saving & Recovery
  // ==========================================================================

  private getAudioProgressPath(): string {
    return path.join(this.getEpisodeDir(), '.audio_progress', 'manifests.json');
  }

  private async loadAudioProgress(): Promise<AudioTimingManifest[]> {
    if (this.config.force) return [];
    
    try {
      const progressPath = this.getAudioProgressPath();
      const content = await fs.readFile(progressPath, 'utf-8');
      const data = JSON.parse(content) as { manifests: AudioTimingManifest[] };
      return data.manifests || [];
    } catch {
      return [];
    }
  }

  private async saveAudioProgress(manifests: AudioTimingManifest[]): Promise<void> {
    const progressDir = path.join(this.getEpisodeDir(), '.audio_progress');
    await fs.mkdir(progressDir, { recursive: true });
    
    const progressPath = this.getAudioProgressPath();
    await fs.writeFile(progressPath, JSON.stringify({
      manifests,
      last_updated: new Date().toISOString(),
    }, null, 2));
  }

  private async cleanupAudioProgress(): Promise<void> {
    try {
      const progressDir = path.join(this.getEpisodeDir(), '.audio_progress');
      await fs.rm(progressDir, { recursive: true });
    } catch {
      // Directory may not exist
    }
  }

  private async runImageGeneration(
    storyboard: EpisodeStoryboard,
    constraints: ProductionConstraints,
    framesDir: string
  ): Promise<{ files: string[]; errors: string[]; skipped: number }> {
    const files: string[] = [];
    const errors: string[] = [];
    let totalSkipped = 0;
    
    // Load existing image progress
    const existingProgress = await this.loadImageProgress();
    const completedSceneIds = new Set(existingProgress.completed_scenes || []);
    
    if (completedSceneIds.size > 0 && !this.config.force) {
      console.log(`  Resuming from checkpoint: ${completedSceneIds.size} scenes have existing images`);
    }
    
    for (const scene of storyboard.scenes) {
      console.log(`  Generating images for ${scene.scene_id}...`);
      
      // Note: Individual shot recovery is handled by generateToFiles
      // Scene-level tracking is for progress reporting only
      
      const result = await this.imageClient.generateToFiles(
        scene.shots,
        constraints,
        framesDir,
        { force: this.config.force }
      );
      
      totalSkipped += result.skipped;
      
      if (result.skipped > 0) {
        console.log(`    Skipped ${result.skipped} existing images`);
      }
      
      files.push(...result.files.map(f => f.file));
      
      for (const err of result.errors) {
        errors.push(`${err.shotId}: ${err.error}`);
        this.reviewQueue.push({
          type: 'image_failure',
          shot_id: err.shotId,
          reason: err.error,
          blocking: false,
          placeholder_used: true,
        });
        
        // Generate placeholder
        await this.imageClient.generatePlaceholder(
          err.shotId,
          `Scene ${scene.scene_id}`,
          framesDir
        );
      }
      
      // Mark scene as complete if no errors
      if (result.errors.length === 0) {
        completedSceneIds.add(scene.scene_id);
        await this.saveImageProgress({
          completed_scenes: Array.from(completedSceneIds),
          total_shots: files.length,
        });
        console.log(`    ✓ Saved image progress (${completedSceneIds.size} scenes complete)`);
      }
    }
    
    return { files, errors, skipped: totalSkipped };
  }

  // ==========================================================================
  // Image Progress Saving & Recovery
  // ==========================================================================

  private getImageProgressPath(): string {
    return path.join(this.getEpisodeDir(), '.image_progress', 'progress.json');
  }

  private async loadImageProgress(): Promise<{
    completed_scenes: string[];
    total_shots: number;
  }> {
    if (this.config.force) return { completed_scenes: [], total_shots: 0 };
    
    try {
      const progressPath = this.getImageProgressPath();
      const content = await fs.readFile(progressPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { completed_scenes: [], total_shots: 0 };
    }
  }

  private async saveImageProgress(progress: {
    completed_scenes: string[];
    total_shots: number;
  }): Promise<void> {
    const progressDir = path.join(this.getEpisodeDir(), '.image_progress');
    await fs.mkdir(progressDir, { recursive: true });
    
    const progressPath = this.getImageProgressPath();
    await fs.writeFile(progressPath, JSON.stringify({
      ...progress,
      last_updated: new Date().toISOString(),
    }, null, 2));
  }

  private async cleanupImageProgress(): Promise<void> {
    try {
      const progressDir = path.join(this.getEpisodeDir(), '.image_progress');
      await fs.rm(progressDir, { recursive: true });
    } catch {
      // Directory may not exist
    }
  }

  // ==========================================================================
  // Pre-Production Checks
  // ==========================================================================

  private async runPreProductionChecks(
    script: string,
    casting: CastingRegistry,
    worldData: WorldData
  ): Promise<void> {
    console.log('Running pre-production checks...');
    
    // Check for unmapped speakers
    const speakers = this.parser.findSpeakers(script);
    for (const speaker of speakers) {
      if (speaker === 'NARRATOR') continue;
      
      const charId = this.resolveCharacterId(speaker);
      const hasMapping = casting.casting.voice_mappings.some(
        m => m.character_id === charId
      );
      
      if (!hasMapping) {
        this.reviewQueue.push({
          type: 'voice_assignment',
          character_id: charId,
          reason: `New speaking character: ${speaker}`,
          blocking: true,
        });
      }
    }
    
    // Check for Visual DNA coverage
    if (this.config.runImageGen) {
      const scenes = this.parser.parseEpisodeScript(script);
      for (const scene of scenes) {
        if (!worldData.locations[scene.locationId]?.visual_dna) {
          console.log(`  Warning: No Visual DNA for location ${scene.locationId}`);
        }
      }
    }
    
    // Check API configurations
    if (this.config.runAudioSynth && !this.config.dryRun) {
      if (!this.elevenlabs.isConfigured()) {
        this.reviewQueue.push({
          type: 'voice_assignment',
          reason: 'ElevenLabs API key not configured',
          blocking: true,
        });
      }
    }
    
    if (this.config.runImageGen && !this.config.dryRun) {
      if (!this.imageClient.isConfigured()) {
        this.reviewQueue.push({
          type: 'image_failure',
          reason: 'OpenAI API key not configured',
          blocking: true,
        });
      }
    }
    
    console.log(`  Found ${this.reviewQueue.length} issues`);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private getEpisodeDir(): string {
    return path.join(
      this.config.basePath,
      'seasons',
      this.config.seasonId,
      this.config.episodeId
    );
  }

  private async loadEpisodeScript(): Promise<string> {
    const scriptPath = path.join(this.getEpisodeDir(), 'episode_script.md');
    return fs.readFile(scriptPath, 'utf-8');
  }

  private async loadCasting(): Promise<CastingRegistry> {
    const castingPath = path.join(this.config.basePath, 'casting', 'casting.json');
    const content = await fs.readFile(castingPath, 'utf-8');
    return JSON.parse(content);
  }

  private async loadWorldData(): Promise<WorldData> {
    const worldDir = path.join(this.config.basePath, 'world');
    const constraintsPath = path.join(worldDir, 'constraints.json');
    const worldPath = path.join(worldDir, 'world.json');
    const charactersPath = path.join(worldDir, 'characters.json');
    
    const [constraintsContent, worldContent, charactersContent] = await Promise.all([
      fs.readFile(constraintsPath, 'utf-8'),
      fs.readFile(worldPath, 'utf-8'),
      fs.readFile(charactersPath, 'utf-8'),
    ]);
    
    const constraints = JSON.parse(constraintsContent);
    const world = JSON.parse(worldContent);
    const characters = JSON.parse(charactersContent);
    
    // Build locations map
    const locations: Record<string, { visual_dna?: LocationVisualDNA }> = {};
    for (const loc of world.locations || []) {
      locations[loc.id] = { visual_dna: loc.visual_dna };
    }
    
    // Build characters map
    const charsMap: Record<string, { visual_dna?: CharacterVisualDNA }> = {};
    for (const char of characters.characters || []) {
      charsMap[char.id] = { visual_dna: char.visual_dna };
    }
    
    return {
      characters: charsMap,
      locations,
      constraints,
    };
  }

  private async loadArtifact(filename: string): Promise<unknown> {
    const filePath = path.join(this.getEpisodeDir(), filename);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  private async saveArtifact(filename: string, data: unknown): Promise<void> {
    const filePath = path.join(this.getEpisodeDir(), filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  private resolveCharacterId(displayName: string): string {
    const mapping = DEFAULT_CHARACTER_MAPPINGS.find(
      m => m.displayName.toUpperCase() === displayName.toUpperCase()
    );
    return mapping?.characterId || `char_${displayName.toLowerCase().replace(/\s+/g, '_')}`;
  }

  private getDefaultConstraints(): ProductionConstraints {
    return {
      visual_style_prompt: 'Rendered in the style of 1st-century BCE charcoal sketches on rough papyrus. Heavy use of crosshatching for shadows. Sepia and ochre tones.',
      aspect_ratio: '16:9',
      resolution: '1920x1080',
      image_format: 'png',
      default_visual_cadence: 0.4,
    };
  }

  // ==========================================================================
  // Storyboard Helpers
  // ==========================================================================

  /**
   * Try to load an existing storyboard.json file.
   * Returns null if file doesn't exist or can't be parsed.
   */
  private async tryLoadExistingStoryboard(): Promise<EpisodeStoryboard | null> {
    try {
      return await this.loadArtifact('storyboard.json') as EpisodeStoryboard;
    } catch {
      return null;
    }
  }

  /**
   * Check if a storyboard is a placeholder (generated by dry-run).
   * Placeholders have specific markers in their content.
   */
  private isPlaceholderStoryboard(storyboard: EpisodeStoryboard): boolean {
    if (!storyboard.scenes || storyboard.scenes.length === 0) {
      return true;
    }
    
    const firstShot = storyboard.scenes[0]?.shots?.[0];
    if (!firstShot) {
      return true;
    }
    
    // Check for placeholder markers
    return (
      firstShot.beat_reference === 'Placeholder for dry-run' ||
      firstShot.visual_prompt?.startsWith('[DRY RUN]') ||
      firstShot.gpt_image_params?.style_suffix === 'placeholder'
    );
  }

  /**
   * Validate storyboard before using it for production.
   * Logs warnings for placeholder storyboards.
   */
  private validateStoryboardForProduction(storyboard: EpisodeStoryboard): boolean {
    if (this.isPlaceholderStoryboard(storyboard)) {
      console.warn('  Warning: storyboard.json contains placeholder data from a dry-run.');
      console.warn('  Run storyboard stage without --dry-run to generate real storyboard.');
      return false;
    }
    return true;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createProductionOrchestrator(config: ProductionConfig): ProductionOrchestrator {
  return new ProductionOrchestrator(config);
}
