/**
 * Video Assembler
 * 
 * Generates FFmpeg commands and production manifests for video assembly.
 * Stage I-D of the production pipeline.
 * 
 * Note: Actual video generation requires FFmpeg to be installed.
 * This module generates the commands and manifests; execution is separate.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import type {
  Storyboard,
  AudioTimingManifest,
  ProductionManifest,
  ProductionScene,
  ProductionShot,
  MotionEffect,
  VideoSettings,
  MotionHint,
} from '../types/production.js';

// ============================================================================
// Types
// ============================================================================

export interface AssemblyConfig {
  outputDir: string;
  audioDir: string;
  framesDir: string;
  videoSettings?: Partial<VideoSettings>;
  crossfadeDurationMs?: number;
  interTurnSilenceMs?: number;
}

export interface AssemblyResult {
  success: boolean;
  outputFile?: string;
  manifest?: ProductionManifest;
  ffmpegCommands?: string[];
  errors?: string[];
}

// ============================================================================
// Video Assembler
// ============================================================================

export class VideoAssembler {
  private config: AssemblyConfig;
  private defaultSettings: VideoSettings = {
    resolution: '1920x1080',
    fps: 24,
    codec: 'h264',
    audio_codec: 'aac',
    audio_bitrate: '192k',
  };

  constructor(config: AssemblyConfig) {
    this.config = config;
  }

  /**
   * Generate a production manifest for an episode.
   */
  generateManifest(
    episodeId: string,
    storyboards: Storyboard[],
    audioManifests: AudioTimingManifest[]
  ): ProductionManifest {
    const videoSettings: VideoSettings = {
      ...this.defaultSettings,
      ...this.config.videoSettings,
    };

    const scenes: ProductionScene[] = [];
    let totalDurationMs = 0;

    for (const storyboard of storyboards) {
      const audioManifest = audioManifests.find(
        a => a.scene_id === storyboard.scene_id
      );
      
      const sceneDurationMs = audioManifest?.total_duration_ms || 150000; // Default 2.5 min
      const shots = this.distributeShots(storyboard, sceneDurationMs);
      
      scenes.push({
        scene_id: storyboard.scene_id,
        audio_track: `${storyboard.scene_id}_master.mp3`,
        duration_ms: sceneDurationMs,
        shots,
      });
      
      totalDurationMs += sceneDurationMs;
    }

    return {
      episode_id: episodeId,
      video_settings: videoSettings,
      scenes,
      total_duration_ms: totalDurationMs,
    };
  }

  /**
   * Generate FFmpeg commands for assembling a scene.
   */
  generateSceneFFmpegCommands(scene: ProductionScene): string[] {
    const commands: string[] = [];
    const settings = {
      ...this.defaultSettings,
      ...this.config.videoSettings,
    };
    
    // 1. Create audio concatenation list for scene
    commands.push(`# Create audio concatenation list for ${scene.scene_id}`);
    
    // 2. Create video from images with motion effects
    for (const shot of scene.shots) {
      const duration = (shot.end_ms - shot.start_ms) / 1000;
      const inputImage = path.join(this.config.framesDir, shot.image_file);
      const outputClip = path.join(this.config.outputDir, `${shot.shot_id}_clip.mp4`);
      
      const filter = this.buildMotionFilter(shot.motion, duration, settings);
      
      commands.push(
        `ffmpeg -loop 1 -i "${inputImage}" -t ${duration} ` +
        `-vf "${filter}" ` +
        `-c:v ${settings.codec} -pix_fmt yuv420p -r ${settings.fps} ` +
        `"${outputClip}"`
      );
    }
    
    // 3. Concatenate video clips
    const clipListFile = path.join(this.config.outputDir, `${scene.scene_id}_clip_list.txt`);
    const rawVideoFile = path.join(this.config.outputDir, `${scene.scene_id}_raw.mp4`);
    
    commands.push(
      `# Concatenate clips for ${scene.scene_id}`,
      `ffmpeg -f concat -safe 0 -i "${clipListFile}" -c copy "${rawVideoFile}"`
    );
    
    // 4. Merge audio and video
    const audioFile = path.join(this.config.audioDir, scene.audio_track);
    const outputFile = path.join(this.config.outputDir, `${scene.scene_id}_final.mp4`);
    
    commands.push(
      `# Merge audio and video for ${scene.scene_id}`,
      `ffmpeg -i "${rawVideoFile}" -i "${audioFile}" ` +
      `-c:v copy -c:a ${settings.audio_codec} -b:a ${settings.audio_bitrate} ` +
      `"${outputFile}"`
    );
    
    return commands;
  }

  /**
   * Generate FFmpeg commands for the full episode.
   */
  generateEpisodeFFmpegCommands(manifest: ProductionManifest): string[] {
    const commands: string[] = [];
    const settings = manifest.video_settings;
    
    // Generate commands for each scene
    for (const scene of manifest.scenes) {
      commands.push(`# === Scene ${scene.scene_id} ===`);
      commands.push(...this.generateSceneFFmpegCommands(scene));
      commands.push('');
    }
    
    // Concatenate all scenes
    const sceneListFile = path.join(this.config.outputDir, 'scene_list.txt');
    const outputFile = path.join(this.config.outputDir, `${manifest.episode_id}_final.mp4`);
    
    commands.push(
      '# === Concatenate All Scenes ===',
      `ffmpeg -f concat -safe 0 -i "${sceneListFile}" ` +
      `-c:v ${settings.codec} -c:a ${settings.audio_codec} ` +
      `"${outputFile}"`
    );
    
    return commands;
  }

  /**
   * Write a manifest file to disk.
   */
  async writeManifest(manifest: ProductionManifest): Promise<string> {
    const outputPath = path.join(
      this.config.outputDir,
      `${manifest.episode_id}_manifest.json`
    );
    await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));
    return outputPath;
  }

  /**
   * Write FFmpeg command script to disk.
   */
  async writeFFmpegScript(
    episodeId: string,
    commands: string[]
  ): Promise<string> {
    const scriptPath = path.join(this.config.outputDir, `${episodeId}_assemble.sh`);
    const script = [
      '#!/bin/bash',
      '# Auto-generated video assembly script for ' + episodeId,
      '# Requires FFmpeg to be installed',
      '',
      'set -e',
      '',
      ...commands,
    ].join('\n');
    
    await fs.writeFile(scriptPath, script);
    await fs.chmod(scriptPath, 0o755);
    return scriptPath;
  }

  /**
   * Generate concatenation file lists needed by FFmpeg.
   */
  async writeListFiles(manifest: ProductionManifest): Promise<void> {
    // Scene list for final concatenation
    const sceneEntries = manifest.scenes.map(
      scene => `file '${scene.scene_id}_final.mp4'`
    ).join('\n');
    
    await fs.writeFile(
      path.join(this.config.outputDir, 'scene_list.txt'),
      sceneEntries
    );
    
    // Per-scene clip lists
    for (const scene of manifest.scenes) {
      const clipEntries = scene.shots.map(
        shot => `file '${shot.shot_id}_clip.mp4'`
      ).join('\n');
      
      await fs.writeFile(
        path.join(this.config.outputDir, `${scene.scene_id}_clip_list.txt`),
        clipEntries
      );
    }
  }

  /**
   * Concatenate audio segments into a master track.
   * Uses FFmpeg for proper audio concatenation with silences.
   */
  async concatenateAudio(
    audioFiles: string[],
    outputFile: string,
    silenceMs: number = 500
  ): Promise<{ success: boolean; error?: string }> {
    // Use concat demuxer with silence files
    const silenceFile = `silence_${silenceMs}ms.mp3`;
    const listFile = outputFile.replace('.mp3', '_list.txt');
    const entries: string[] = [];
    
    for (let i = 0; i < audioFiles.length; i++) {
      entries.push(`file '${audioFiles[i]}'`);
      if (i < audioFiles.length - 1) {
        // Reference a pre-generated silence file
        entries.push(`file '${silenceFile}'`);
      }
    }
    
    await fs.writeFile(listFile, entries.join('\n'));
    
    // Run FFmpeg
    const command = `ffmpeg -f concat -safe 0 -i "${listFile}" -c:a libmp3lame "${outputFile}"`;
    
    return this.runFFmpegCommand(command);
  }

  /**
   * Check if FFmpeg is available.
   */
  async checkFFmpegAvailable(): Promise<boolean> {
    try {
      const result = await this.runFFmpegCommand('ffmpeg -version');
      return result.success;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private distributeShots(
    storyboard: Storyboard,
    totalDurationMs: number
  ): ProductionShot[] {
    const crossfade = this.config.crossfadeDurationMs || 500;
    const shotCount = storyboard.shots.length;
    
    if (shotCount === 0) return [];
    
    // Distribute time evenly with crossfades
    const effectiveDuration = totalDurationMs - (crossfade * (shotCount - 1));
    const shotDuration = effectiveDuration / shotCount;
    
    return storyboard.shots.map((shot, index) => {
      const startMs = index * (shotDuration + crossfade);
      const endMs = startMs + shotDuration;
      
      return {
        shot_id: shot.shot_id,
        image_file: `${shot.shot_id}.png`,
        start_ms: Math.round(startMs),
        end_ms: Math.round(endMs),
        motion: this.buildMotionEffect(shot.motion_hint),
      };
    });
  }

  private buildMotionEffect(hint: MotionHint): MotionEffect {
    switch (hint) {
      case 'slow_zoom_in':
        return {
          type: 'slow_zoom_in',
          start_scale: 1.0,
          end_scale: 1.15,
          easing: 'ease_in_out',
        };
      case 'slow_zoom_out':
        return {
          type: 'slow_zoom_out',
          start_scale: 1.15,
          end_scale: 1.0,
          easing: 'ease_in_out',
        };
      case 'slow_pan_left':
        return {
          type: 'slow_pan_left',
          pan_distance_percent: 10,
          easing: 'linear',
        };
      case 'slow_pan_right':
        return {
          type: 'slow_pan_right',
          pan_distance_percent: 10,
          easing: 'linear',
        };
      case 'subtle_shake':
        return {
          type: 'subtle_shake',
          easing: 'linear',
        };
      case 'static':
      default:
        return {
          type: 'static',
          easing: 'linear',
        };
    }
  }

  private buildMotionFilter(
    motion: MotionEffect | undefined,
    duration: number,
    settings: VideoSettings
  ): string {
    const [width, height] = settings.resolution.split('x').map(Number);
    const fps = settings.fps;
    
    if (!motion || motion.type === 'static') {
      return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
    }
    
    const frames = Math.round(duration * fps);
    
    switch (motion.type) {
      case 'slow_zoom_in': {
        const startScale = motion.start_scale || 1.0;
        const endScale = motion.end_scale || 1.15;
        return `zoompan=z='${startScale}+${(endScale - startScale)}*on/${frames}':d=${frames}:s=${width}x${height}`;
      }
      case 'slow_zoom_out': {
        const startScale = motion.start_scale || 1.15;
        const endScale = motion.end_scale || 1.0;
        return `zoompan=z='${startScale}-${(startScale - endScale)}*on/${frames}':d=${frames}:s=${width}x${height}`;
      }
      case 'slow_pan_left': {
        const distance = motion.pan_distance_percent || 10;
        return `zoompan=z='1.1':x='(iw-iw/zoom)*${distance}/100*on/${frames}':d=${frames}:s=${width}x${height}`;
      }
      case 'slow_pan_right': {
        const distance = motion.pan_distance_percent || 10;
        return `zoompan=z='1.1':x='(iw-iw/zoom)*(1-${distance}/100*on/${frames})':d=${frames}:s=${width}x${height}`;
      }
      case 'subtle_shake':
        return `zoompan=z='1':x='iw/2-(iw/zoom/2)+random(0)*3':y='ih/2-(ih/zoom/2)+random(1)*3':d=${frames}:s=${width}x${height}`;
      default:
        return `scale=${width}:${height}`;
    }
  }

  private runFFmpegCommand(command: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const parts = command.split(' ');
      const ffmpeg = spawn(parts[0], parts.slice(1), { shell: true });
      
      let stderr = '';
      
      ffmpeg.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: stderr });
        }
      });
      
      ffmpeg.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createVideoAssembler(config: AssemblyConfig): VideoAssembler {
  return new VideoAssembler(config);
}
