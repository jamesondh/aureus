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
      console.log('Generating master audio tracks for complete scenes...');
      for (const manifest of completeManifests) {
        const masterFile = path.join(audioDir, `${manifest.scene_id}_master.mp3`);
        const audioFiles = manifest.audio_segments.map(s => path.join(audioDir, s.file));
        
        // Check if master already exists
        try {
          await fs.access(masterFile);
          console.log(`  ${manifest.scene_id}_master.mp3 already exists, skipping`);
        } catch {
          console.log(`  Generating ${manifest.scene_id}_master.mp3...`);
          const result = await this.concatenateAudioFiles(audioFiles, masterFile, 500);
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
   * Concatenate audio files with silence between them using FFmpeg.
   */
  private async concatenateAudioFiles(
    inputFiles: string[],
    outputFile: string,
    _silenceMs: number
  ): Promise<{ success: boolean; error?: string }> {
    if (inputFiles.length === 0) {
      return { success: false, error: 'No input files provided' };
    }
    
    // For simplicity, use FFmpeg's concat filter with adelay for silences
    // This approach works without pre-generating silence files
    
    const episodeDir = this.getEpisodeDir();
    const listFile = path.join(episodeDir, 'temp_audio_list.txt');
    
    // Create concat list file
    const entries = inputFiles.map(f => `file '${f}'`).join('\n');
    await fs.writeFile(listFile, entries);
    
    // Use concat demuxer - silences will be handled by the inter_turn_silence in manifest
    // For preview, we'll concatenate directly without silences for simplicity
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
        console.log(`  Processing ${scene.scene_id}...`);
        
        // Check if master audio exists
        const masterAudio = path.join(audioDir, scene.audio_track);
        try {
          await fs.access(masterAudio);
        } catch {
          errors.push(`Master audio not found: ${scene.audio_track}`);
          continue;
        }
        
        // For each scene, we'll create a video with the shots distributed over the audio duration
        // Using a simpler approach: use the first image for the whole scene duration
        // (Full shot distribution would require more complex FFmpeg filter graphs)
        
        const firstShot = scene.shots[0];
        if (!firstShot) {
          errors.push(`No shots in scene ${scene.scene_id}`);
          continue;
        }
        
        const imageFile = path.join(framesDir, firstShot.image_file);
        const sceneVideo = path.join(episodeDir, `${scene.scene_id}_preview.mp4`);
        tempFiles.push(sceneVideo);
        
        // Get audio duration
        const durationSec = scene.duration_ms / 1000;
        
        // Create video from image + audio
        // Using zoompan for subtle motion effect
        const command = [
          'ffmpeg', '-y',
          '-loop', '1',
          '-i', imageFile,
          '-i', masterAudio,
          '-c:v', 'libx264',
          '-tune', 'stillimage',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-pix_fmt', 'yuv420p',
          '-vf', `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,zoompan=z='1.0+0.001*on':d=${Math.ceil(durationSec * 24)}:s=1920x1080:fps=24`,
          '-shortest',
          sceneVideo
        ];
        
        const result = await this.runCommand(command);
        if (!result.success) {
          errors.push(`Failed to create video for ${scene.scene_id}: ${result.error}`);
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
      
      // Build manifest
      let cumulativeOffset = 0;
      const audioSegments = result.files.map(f => {
        const segment = {
          turn_id: f.segmentId,
          file: f.file,
          duration_ms: f.durationMs,
          cumulative_offset_ms: cumulativeOffset,
        };
        cumulativeOffset += f.durationMs + 500; // 500ms silence between turns
        return segment;
      });
      
      const sceneManifest: AudioTimingManifest = {
        scene_id: scene.sceneId,
        audio_segments: audioSegments,
        total_duration_ms: cumulativeOffset,
        inter_turn_silence_ms: 500,
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
          turn_id: err.segmentId,
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
