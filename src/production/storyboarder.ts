/**
 * Storyboarder
 * 
 * LLM pass to identify visual beats and generate shot descriptions.
 * Stage I-A of the production pipeline.
 * 
 * Supports incremental saving and recovery:
 * - Saves each scene to a temporary file as it completes
 * - Can resume from partial progress if interrupted
 * - Merges partial results into final storyboard.json
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getLLMClient, type LLMClient } from '../llm/client.js';
import type {
  Shot,
  ShotType,
  MotionHint,
  Storyboard,
  EpisodeStoryboard,
  CharacterVisualDNA,
  LocationVisualDNA,
  ProductionConstraints,
} from '../types/production.js';

// ============================================================================
// Types
// ============================================================================

export interface StoryboarderConfig {
  llmClient?: LLMClient;
  defaultCadence?: number;
  outputDir?: string;  // Directory for saving progress files
}

export interface SceneContext {
  sceneId: string;
  sceneText: string;
  locationId: string;
  locationVisualDNA?: LocationVisualDNA;
  characterVisualDNA: Record<string, CharacterVisualDNA>;
  visualCadence?: number;
}

interface LLMStoryboardResponse {
  scene_id: string;
  shot_count: number;
  shots: Array<{
    shot_id: string;
    sequence: number;
    beat_reference: string;
    timestamp_anchor?: string;
    shot_type: string;
    visual_prompt: string;
    mood?: string;
    lighting?: string;
    motion_hint?: string;
  }>;
}

// ============================================================================
// Storyboarder
// ============================================================================

export class Storyboarder {
  private llm: LLMClient;
  private defaultCadence: number;
  private outputDir?: string;

  constructor(config: StoryboarderConfig = {}) {
    this.llm = config.llmClient || getLLMClient();
    this.defaultCadence = config.defaultCadence || 0.4;
    this.outputDir = config.outputDir;
  }

  /**
   * Set the output directory for saving progress files.
   */
  setOutputDir(dir: string): void {
    this.outputDir = dir;
  }

  /**
   * Generate a storyboard for a single scene.
   */
  async storyboardScene(
    context: SceneContext,
    constraints: ProductionConstraints
  ): Promise<Storyboard> {
    const cadence = context.visualCadence ?? constraints.default_visual_cadence ?? this.defaultCadence;
    const targetShots = this.calculateShotCount(cadence);

    const system = this.buildSystemPrompt();
    const prompt = this.buildScenePrompt(context, constraints, targetShots);

    const { data } = await this.llm.completeJson<LLMStoryboardResponse>(
      {
        system,
        prompt,
        model: 'standard', // Sonnet for visual beat identification
      },
      (data) => this.validateStoryboardResponse(data, context.sceneId)
    );

    return this.transformResponse(data, context, constraints);
  }

  /**
   * Generate storyboards for all scenes in an episode.
   * Supports incremental saving and recovery from interrupted runs.
   */
  async storyboardEpisode(
    scenes: SceneContext[],
    constraints: ProductionConstraints
  ): Promise<EpisodeStoryboard> {
    const storyboards: Storyboard[] = [];
    let totalShots = 0;
    
    // Try to load existing progress
    const existingProgress = await this.loadProgress(scenes);
    const completedSceneIds = new Set(existingProgress.map(s => s.scene_id));
    
    if (existingProgress.length > 0) {
      console.log(`  Resuming from checkpoint: ${existingProgress.length}/${scenes.length} scenes already completed`);
      storyboards.push(...existingProgress);
      totalShots = existingProgress.reduce((sum, s) => sum + s.shot_count, 0);
    }

    // Process remaining scenes
    for (const scene of scenes) {
      // Skip already completed scenes
      if (completedSceneIds.has(scene.sceneId)) {
        continue;
      }
      
      console.log(`  Storyboarding ${scene.sceneId}...`);
      
      try {
        const storyboard = await this.storyboardScene(scene, constraints);
        storyboards.push(storyboard);
        totalShots += storyboard.shot_count;
        
        // Save progress after each successful scene
        await this.saveSceneProgress(scene.sceneId, storyboard);
        console.log(`    ✓ Saved ${storyboard.shot_count} shots (${storyboards.length}/${scenes.length} complete)`);
      } catch (error) {
        // Save partial progress before re-throwing
        await this.savePartialStoryboard(scenes, storyboards);
        console.error(`  ✗ Failed on ${scene.sceneId}. Progress saved. Run again to resume.`);
        throw error;
      }
    }
    
    // Clean up progress files on successful completion
    await this.cleanupProgress(scenes);

    return {
      episode_id: scenes[0]?.sceneId.split('_')[0] || 'unknown',
      scenes: storyboards,
      total_shots: totalShots,
    };
  }

  // ==========================================================================
  // Progress Saving & Recovery
  // ==========================================================================

  /**
   * Get the progress directory path.
   */
  private getProgressDir(): string {
    if (!this.outputDir) {
      return process.cwd();
    }
    return path.join(this.outputDir, '.storyboard_progress');
  }

  /**
   * Save a single scene's storyboard to a progress file.
   */
  private async saveSceneProgress(sceneId: string, storyboard: Storyboard): Promise<void> {
    if (!this.outputDir) return;
    
    const progressDir = this.getProgressDir();
    await fs.mkdir(progressDir, { recursive: true });
    
    const filePath = path.join(progressDir, `${sceneId}.json`);
    await fs.writeFile(filePath, JSON.stringify(storyboard, null, 2));
  }

  /**
   * Save partial storyboard on failure.
   */
  private async savePartialStoryboard(
    scenes: SceneContext[],
    completedStoryboards: Storyboard[]
  ): Promise<void> {
    if (!this.outputDir) return;
    
    const progressDir = this.getProgressDir();
    await fs.mkdir(progressDir, { recursive: true });
    
    // Save a manifest of what's been completed
    const manifest = {
      total_scenes: scenes.length,
      completed_scenes: completedStoryboards.length,
      completed_scene_ids: completedStoryboards.map(s => s.scene_id),
      last_updated: new Date().toISOString(),
    };
    
    const manifestPath = path.join(progressDir, '_manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Load existing progress from checkpoint files.
   */
  private async loadProgress(scenes: SceneContext[]): Promise<Storyboard[]> {
    if (!this.outputDir) return [];
    
    const progressDir = this.getProgressDir();
    const storyboards: Storyboard[] = [];
    
    try {
      await fs.access(progressDir);
    } catch {
      // Progress directory doesn't exist - starting fresh
      return [];
    }
    
    // Load each scene's progress file if it exists
    for (const scene of scenes) {
      const filePath = path.join(progressDir, `${scene.sceneId}.json`);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const storyboard = JSON.parse(content) as Storyboard;
        storyboards.push(storyboard);
      } catch {
        // Scene not yet completed - will be processed
      }
    }
    
    return storyboards;
  }

  /**
   * Clean up progress files after successful completion.
   */
  private async cleanupProgress(scenes: SceneContext[]): Promise<void> {
    if (!this.outputDir) return;
    
    const progressDir = this.getProgressDir();
    
    try {
      await fs.access(progressDir);
    } catch {
      // Nothing to clean up
      return;
    }
    
    // Remove all progress files
    for (const scene of scenes) {
      const filePath = path.join(progressDir, `${scene.sceneId}.json`);
      try {
        await fs.unlink(filePath);
      } catch {
        // File may not exist
      }
    }
    
    // Remove manifest
    try {
      await fs.unlink(path.join(progressDir, '_manifest.json'));
    } catch {
      // Manifest may not exist
    }
    
    // Try to remove the progress directory (will fail if not empty)
    try {
      await fs.rmdir(progressDir);
    } catch {
      // Directory may not be empty or may not exist
    }
    
    console.log('  Cleaned up progress files');
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private buildSystemPrompt(): string {
    return `You are the Storyboarder. Identify key visual beats and generate shot descriptions.
Output valid JSON only.

Your role is to analyze scene text and identify the most impactful moments for illustration.
Each shot description should be detailed enough for an image generation model to create a consistent visual.

IMPORTANT RULES:
1. Always include character Visual DNA descriptions (physical appearance, costume, distinguishing marks)
2. Always include location Visual DNA (architecture, lighting, key props)
3. Describe composition, camera angle, and mood explicitly
4. Reference the global visual style in your prompts
5. Select shots that capture emotional peaks and narrative turning points

SHOT TYPES:
- wide: Full environment, multiple characters or establishing shot
- medium: Waist-up, 1-2 characters in conversation or action
- close: Face detail, emotional reaction shots
- extreme_close: Eyes, hands, object detail for emphasis
- over_shoulder: POV conversation, reveals

MOTION HINTS (for video assembly):
- static: No movement, formal/composed shots
- slow_zoom_in: Building tension, focus narrowing
- slow_zoom_out: Reveal, context expansion
- slow_pan_left/slow_pan_right: Following action, scanning
- subtle_shake: Handheld urgency, instability`;
  }

  private buildScenePrompt(
    context: SceneContext,
    constraints: ProductionConstraints,
    targetShots: number
  ): string {
    // Build Visual DNA sections
    const locationDNA = context.locationVisualDNA
      ? `LOCATION VISUAL DNA (${context.locationId}):
Architecture: ${context.locationVisualDNA.architecture}
Lighting: ${context.locationVisualDNA.lighting_default}
Atmosphere: ${context.locationVisualDNA.atmosphere}
Key Props: ${context.locationVisualDNA.key_props?.join(', ') || 'none specified'}`
      : `LOCATION: ${context.locationId} (no Visual DNA available)`;

    const characterDNAs = Object.entries(context.characterVisualDNA)
      .map(([charId, dna]) => `${charId}:
  Physical: ${dna.physical}
  Costume: ${dna.costume_default}
  Marks: ${dna.distinguishing_marks || 'none'}
  Energy: ${dna.posture_energy || 'not specified'}`)
      .join('\n\n');

    return `SCENE_TEXT:
${context.sceneText}

${locationDNA}

CHARACTER VISUAL DNA:
${characterDNAs || 'No character Visual DNA available'}

VISUAL_STYLE:
${constraints.visual_style_prompt}

VISUAL_CADENCE: ${context.visualCadence ?? constraints.default_visual_cadence ?? this.defaultCadence}
TARGET_SHOTS: ${targetShots}

TASK:
1. Read the scene and identify emotional/narrative peaks
2. Select ${targetShots} moments for illustration
3. For each shot, expand character/location references into full Visual DNA descriptions
4. Output structured shot list

SHOT SELECTION PRIORITY:
- Scene-opening establishing shot (always include)
- Character reveals / entrances
- Key emotional beats (shock, anger, intimacy)
- Physical action (violence, gestures, exchanges)
- Scene-closing button moment

OUTPUT FORMAT:
{
  "scene_id": "${context.sceneId}",
  "shot_count": ${targetShots},
  "shots": [
    {
      "shot_id": "${context.sceneId}_shot_001",
      "sequence": 1,
      "beat_reference": "Scene opening - establishing",
      "timestamp_anchor": "00:00",
      "shot_type": "wide|medium|close|extreme_close|over_shoulder",
      "visual_prompt": "Detailed description incorporating Visual DNA...",
      "mood": "tense|calm|chaotic|intimate|...",
      "lighting": "description of lighting for this shot",
      "motion_hint": "static|slow_zoom_in|slow_zoom_out|slow_pan_left|slow_pan_right|subtle_shake"
    }
  ]
}`;
  }

  private calculateShotCount(cadence: number): number {
    // Based on visual cadence table from spec
    // Cadence 0.1 = 1 shot, 0.4 = 3-5 shots, 1.0 = 10+ shots
    // For a ~2.5 minute scene
    if (cadence <= 0.1) return 1;
    if (cadence <= 0.3) return 2 + Math.round(cadence * 3);
    if (cadence <= 0.4) return 3 + Math.round(cadence * 5);
    if (cadence <= 0.6) return 5 + Math.round(cadence * 5);
    return 10 + Math.round((cadence - 0.6) * 10);
  }

  private validateStoryboardResponse(data: unknown, _sceneId: string): LLMStoryboardResponse {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid storyboard response: not an object');
    }

    const response = data as Record<string, unknown>;
    
    if (typeof response.scene_id !== 'string') {
      throw new Error('Invalid storyboard response: missing scene_id');
    }
    
    if (typeof response.shot_count !== 'number') {
      throw new Error('Invalid storyboard response: missing shot_count');
    }
    
    if (!Array.isArray(response.shots)) {
      throw new Error('Invalid storyboard response: shots must be an array');
    }

    // Validate each shot
    for (const shot of response.shots) {
      if (typeof shot !== 'object' || shot === null) {
        throw new Error('Invalid shot: not an object');
      }
      if (typeof (shot as Record<string, unknown>).visual_prompt !== 'string') {
        throw new Error('Invalid shot: missing visual_prompt');
      }
      if (typeof (shot as Record<string, unknown>).shot_type !== 'string') {
        throw new Error('Invalid shot: missing shot_type');
      }
    }

    return response as unknown as LLMStoryboardResponse;
  }

  private transformResponse(
    response: LLMStoryboardResponse,
    context: SceneContext,
    constraints: ProductionConstraints
  ): Storyboard {
    const shots: Shot[] = response.shots.map((shot, index) => ({
      shot_id: shot.shot_id || `${context.sceneId}_shot_${String(index + 1).padStart(3, '0')}`,
      sequence: shot.sequence || index + 1,
      beat_reference: shot.beat_reference || 'Unspecified',
      timestamp_anchor: shot.timestamp_anchor,
      shot_type: this.normalizeShotType(shot.shot_type),
      visual_prompt: shot.visual_prompt,
      gpt_image_params: {
        style_suffix: constraints.visual_style_prompt,
        mood: shot.mood,
        lighting: shot.lighting,
      },
      motion_hint: this.normalizeMotionHint(shot.motion_hint),
    }));

    return {
      scene_id: context.sceneId,
      shot_count: shots.length,
      shots,
    };
  }

  private normalizeShotType(type: string): ShotType {
    const normalized = type.toLowerCase().replace(/[_-]/g, '_');
    const validTypes: ShotType[] = ['wide', 'medium', 'close', 'extreme_close', 'over_shoulder'];
    
    if (validTypes.includes(normalized as ShotType)) {
      return normalized as ShotType;
    }
    
    // Map common alternatives
    if (normalized.includes('establish')) return 'wide';
    if (normalized.includes('closeup') || normalized.includes('close_up')) return 'close';
    if (normalized.includes('extreme') || normalized.includes('detail')) return 'extreme_close';
    if (normalized.includes('shoulder') || normalized.includes('pov')) return 'over_shoulder';
    
    return 'medium'; // Default
  }

  private normalizeMotionHint(hint?: string): MotionHint {
    if (!hint) return 'slow_zoom_in'; // Default
    
    const normalized = hint.toLowerCase().replace(/[_-]/g, '_');
    const validHints: MotionHint[] = [
      'static', 'slow_zoom_in', 'slow_zoom_out',
      'slow_pan_left', 'slow_pan_right', 'subtle_shake'
    ];
    
    if (validHints.includes(normalized as MotionHint)) {
      return normalized as MotionHint;
    }
    
    // Map alternatives
    if (normalized.includes('zoom') && normalized.includes('in')) return 'slow_zoom_in';
    if (normalized.includes('zoom') && normalized.includes('out')) return 'slow_zoom_out';
    if (normalized.includes('pan') && normalized.includes('left')) return 'slow_pan_left';
    if (normalized.includes('pan') && normalized.includes('right')) return 'slow_pan_right';
    if (normalized.includes('shake') || normalized.includes('hand')) return 'subtle_shake';
    if (normalized.includes('static') || normalized.includes('still')) return 'static';
    
    return 'slow_zoom_in'; // Default
  }
}

// ============================================================================
// Singleton
// ============================================================================

let defaultStoryboarder: Storyboarder | null = null;

export function getStoryboarder(config?: StoryboarderConfig): Storyboarder {
  if (!defaultStoryboarder || config) {
    defaultStoryboarder = new Storyboarder(config);
  }
  return defaultStoryboarder;
}

export function resetStoryboarder(): void {
  defaultStoryboarder = null;
}
