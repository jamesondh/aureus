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
  maxImagesPerScene?: number;
  visualCadenceOverride?: number;
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
          console.log('  (Dry run - generating placeholder storyboard)');
          storyboard = this.generatePlaceholderStoryboard(scenes);
        } else {
          storyboard = await this.runStoryboarding(scenes, worldData, constraints);
        }
        await this.saveArtifact('storyboard.json', storyboard);
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
          const imageResult = await this.runImageGeneration(storyboard, constraints, framesDir);
          imageFiles.push(...imageResult.files);
          
          if (imageResult.errors.length > 0) {
            errors.push(...imageResult.errors);
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
  async runAudioOnly(): Promise<{ files: string[]; errors: string[] }> {
    const script = await this.loadEpisodeScript();
    const casting = await this.loadCasting();
    const scenes = this.parser.parseEpisodeScript(script);
    
    const audioDir = path.join(this.getEpisodeDir(), 'audio');
    await fs.mkdir(audioDir, { recursive: true });
    
    const result = await this.runAudioSynthesis(scenes, casting, audioDir);
    return { files: result.files, errors: result.errors };
  }

  /**
   * Run only the image generation stage (for isolated testing).
   * Requires storyboard.json to exist.
   */
  async runImageOnly(): Promise<{ files: string[]; errors: string[] }> {
    const storyboard = await this.loadArtifact('storyboard.json') as EpisodeStoryboard;
    const worldData = await this.loadWorldData();
    const constraints = worldData.constraints.production_constraints || this.getDefaultConstraints();
    
    const framesDir = path.join(this.getEpisodeDir(), 'frames');
    await fs.mkdir(framesDir, { recursive: true });
    
    return this.runImageGeneration(storyboard, constraints, framesDir);
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
  }> {
    const files: string[] = [];
    const manifests: AudioTimingManifest[] = [];
    const errors: string[] = [];
    
    for (const scene of scenes) {
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
      
      // Synthesize audio
      const result = await this.elevenlabs.synthesizeToFiles(
        sceneAudio.audio_segments,
        casting,
        audioDir
      );
      
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
      
      manifests.push({
        scene_id: scene.sceneId,
        audio_segments: audioSegments,
        total_duration_ms: cumulativeOffset,
        inter_turn_silence_ms: 500,
      });
      
      files.push(...result.files.map(f => f.file));
      
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
    
    return { files, manifests, errors };
  }

  private async runImageGeneration(
    storyboard: EpisodeStoryboard,
    constraints: ProductionConstraints,
    framesDir: string
  ): Promise<{ files: string[]; errors: string[] }> {
    const files: string[] = [];
    const errors: string[] = [];
    
    for (const scene of storyboard.scenes) {
      console.log(`  Generating images for ${scene.scene_id}...`);
      
      const result = await this.imageClient.generateToFiles(
        scene.shots,
        constraints,
        framesDir
      );
      
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
    }
    
    return { files, errors };
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
}

// ============================================================================
// Factory Function
// ============================================================================

export function createProductionOrchestrator(config: ProductionConfig): ProductionOrchestrator {
  return new ProductionOrchestrator(config);
}
