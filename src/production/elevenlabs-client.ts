/**
 * ElevenLabs Client
 * 
 * Handles voice synthesis via the ElevenLabs API.
 * Stage I-B of the production pipeline.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  VoiceSettings,
  VoiceMapping,
  AudioSegment,
  CastingRegistry,
  PerformanceHints,
} from '../types/production.js';

// ============================================================================
// Types
// ============================================================================

export interface ElevenLabsConfig {
  apiKey?: string;
  modelId?: string;
  outputFormat?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface SynthesisResult {
  success: boolean;
  audioBuffer?: Buffer;
  durationMs?: number;
  error?: string;
  requestId?: string;
}

export interface VoiceInfo {
  voiceId: string;
  voiceName: string;
  voiceVersion: number;
}

// ============================================================================
// ElevenLabs Client
// ============================================================================

export class ElevenLabsClient {
  private apiKey: string;
  private modelId: string;
  private outputFormat: string;
  private maxRetries: number;
  private retryDelayMs: number;
  private baseUrl = 'https://api.elevenlabs.io/v1';

  constructor(config: ElevenLabsConfig = {}) {
    this.apiKey = config.apiKey || process.env.ELEVENLABS_API_KEY || '';
    this.modelId = config.modelId || 'eleven_multilingual_v2';
    this.outputFormat = config.outputFormat || 'mp3_44100_128';
    this.maxRetries = config.maxRetries || 3;
    this.retryDelayMs = config.retryDelayMs || 1000;
  }

  /**
   * Check if the client is configured with an API key.
   */
  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Synthesize speech from text using a specific voice.
   */
  async synthesize(
    text: string,
    voiceId: string,
    settings?: Partial<VoiceSettings>
  ): Promise<SynthesisResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'ElevenLabs API key not configured. Set ELEVENLABS_API_KEY environment variable.',
      };
    }

    const url = `${this.baseUrl}/text-to-speech/${voiceId}?output_format=${this.outputFormat}`;
    
    const voiceSettings = {
      stability: settings?.stability ?? 0.5,
      similarity_boost: settings?.similarity_boost ?? 0.75,
      style: settings?.style ?? 0,
      use_speaker_boost: settings?.use_speaker_boost ?? true,
    };

    const body = JSON.stringify({
      text,
      model_id: this.modelId,
      voice_settings: voiceSettings,
    });

    let lastError: string | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          body,
        });

        if (!response.ok) {
          const errorText = await response.text();
          
          // Check for rate limiting
          if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after');
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : this.retryDelayMs * Math.pow(2, attempt);
            console.log(`Rate limited, waiting ${delay}ms before retry...`);
            await this.sleep(delay);
            continue;
          }
          
          lastError = `API error ${response.status}: ${errorText}`;
          
          // Don't retry on client errors (except rate limit)
          if (response.status >= 400 && response.status < 500) {
            break;
          }
          
          await this.sleep(this.retryDelayMs * Math.pow(2, attempt));
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuffer);
        
        // Estimate duration based on file size (rough approximation for MP3)
        // MP3 at 128kbps = 16KB per second
        const estimatedDurationMs = Math.round((audioBuffer.length / 16000) * 1000);

        return {
          success: true,
          audioBuffer,
          durationMs: estimatedDurationMs,
          requestId: response.headers.get('x-request-id') || undefined,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        
        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.retryDelayMs * Math.pow(2, attempt));
        }
      }
    }

    return {
      success: false,
      error: lastError || 'Unknown error during synthesis',
    };
  }

  /**
   * Synthesize an audio segment using casting registry.
   * Returns both the synthesis result and voice info for filename generation.
   */
  async synthesizeSegment(
    segment: AudioSegment,
    casting: CastingRegistry
  ): Promise<SynthesisResult & { voiceInfo?: VoiceInfo }> {
    // Find voice mapping
    const mapping = casting.casting.voice_mappings.find(
      m => m.character_id === segment.character_id
    );

    if (!mapping) {
      return {
        success: false,
        error: `No voice mapping found for character: ${segment.character_id}`,
      };
    }

    // Build voice settings
    const settings = this.buildVoiceSettings(mapping, segment.performance);

    const result = await this.synthesize(segment.clean_text, mapping.eleven_voice_id, settings);
    
    return {
      ...result,
      voiceInfo: {
        voiceId: mapping.eleven_voice_id,
        voiceName: mapping.voice_name.toLowerCase(),
        voiceVersion: mapping.voice_version ?? 1,
      },
    };
  }

  /**
   * Get voice info for a character from the casting registry.
   */
  getVoiceInfo(characterId: string, casting: CastingRegistry): VoiceInfo | null {
    const mapping = casting.casting.voice_mappings.find(
      m => m.character_id === characterId
    );
    
    if (!mapping) {
      return null;
    }
    
    return {
      voiceId: mapping.eleven_voice_id,
      voiceName: mapping.voice_name.toLowerCase(),
      voiceVersion: mapping.voice_version ?? 1,
    };
  }

  /**
   * Generate the filename for an audio segment.
   * Format: {segment_id}_{voice_slug}-v{version}.mp3
   * Example: SC04_d001_varo_adam-v1.mp3
   */
  generateFilename(segment: AudioSegment, voiceInfo: VoiceInfo): string {
    const voiceSlug = voiceInfo.voiceName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${segment.segment_id}_${voiceSlug}-v${voiceInfo.voiceVersion}.mp3`;
  }

  /**
   * Check if an audio file already exists (for recovery).
   * Now checks for files matching the new naming pattern with any version.
   */
  async checkExistingFile(
    segment: AudioSegment,
    voiceInfo: VoiceInfo,
    outputDir: string
  ): Promise<{
    exists: boolean;
    file?: string;
    durationMs?: number;
    isCurrentVersion?: boolean;
  }> {
    const expectedFilename = this.generateFilename(segment, voiceInfo);
    const filePath = path.join(outputDir, expectedFilename);
    
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > 0) {
        // Estimate duration from file size (MP3 at 128kbps = 16KB per second)
        const estimatedDurationMs = Math.round((stats.size / 16000) * 1000);
        return { 
          exists: true, 
          file: expectedFilename, 
          durationMs: estimatedDurationMs,
          isCurrentVersion: true,
        };
      }
    } catch {
      // File with current version doesn't exist
    }
    
    return { exists: false };
  }

  /**
   * Synthesize multiple segments and save to files.
   * Uses new descriptive filename format: {segment_id}_{voice_slug}-v{version}.mp3
   * Supports recovery by skipping segments that already have audio files with matching version.
   */
  async synthesizeToFiles(
    segments: AudioSegment[],
    casting: CastingRegistry,
    outputDir: string,
    options: { force?: boolean } = {}
  ): Promise<{
    success: boolean;
    files: Array<{ 
      segmentId: string; 
      file: string; 
      durationMs: number;
      characterId: string;
      voiceId: string;
      voiceName: string;
      voiceVersion: number;
    }>;
    errors: Array<{ segmentId: string; error: string }>;
    skipped: number;
  }> {
    await fs.mkdir(outputDir, { recursive: true });

    const files: Array<{ 
      segmentId: string; 
      file: string; 
      durationMs: number;
      characterId: string;
      voiceId: string;
      voiceName: string;
      voiceVersion: number;
    }> = [];
    const errors: Array<{ segmentId: string; error: string }> = [];
    let skipped = 0;

    for (const segment of segments) {
      // Get voice info for this character
      const voiceInfo = this.getVoiceInfo(segment.character_id, casting);
      
      if (!voiceInfo) {
        errors.push({
          segmentId: segment.segment_id,
          error: `No voice mapping found for character: ${segment.character_id}`,
        });
        continue;
      }
      
      // Check for existing file with current voice version (recovery)
      if (!options.force) {
        const existing = await this.checkExistingFile(segment, voiceInfo, outputDir);
        if (existing.exists && existing.file && existing.isCurrentVersion) {
          files.push({
            segmentId: segment.segment_id,
            file: existing.file,
            durationMs: existing.durationMs || 0,
            characterId: segment.character_id,
            voiceId: voiceInfo.voiceId,
            voiceName: voiceInfo.voiceName,
            voiceVersion: voiceInfo.voiceVersion,
          });
          skipped++;
          continue;
        }
      }
      
      const filename = this.generateFilename(segment, voiceInfo);
      console.log(`    Synthesizing ${filename}...`);
      
      const result = await this.synthesizeSegment(segment, casting);

      if (result.success && result.audioBuffer && result.audioBuffer.length > 0) {
        const filePath = path.join(outputDir, filename);
        
        await fs.writeFile(filePath, result.audioBuffer);
        console.log(`      ✓ Saved: ${filename} (${result.audioBuffer.length} bytes)`);
        
        files.push({
          segmentId: segment.segment_id,
          file: filename,
          durationMs: result.durationMs || 0,
          characterId: segment.character_id,
          voiceId: voiceInfo.voiceId,
          voiceName: voiceInfo.voiceName,
          voiceVersion: voiceInfo.voiceVersion,
        });
      } else {
        const errorMsg = result.error || (result.audioBuffer?.length === 0 ? 'Empty audio buffer returned' : 'Unknown error');
        errors.push({
          segmentId: segment.segment_id,
          error: errorMsg,
        });
        console.error(`      ✗ FAILED: ${errorMsg}`);
      }
    }

    return {
      success: errors.length === 0,
      files,
      errors,
      skipped,
    };
  }

  /**
   * Get available voices from ElevenLabs.
   */
  async getVoices(): Promise<{
    success: boolean;
    voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }>;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'ElevenLabs API key not configured.',
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `API error ${response.status}: ${await response.text()}`,
        };
      }

      const data = await response.json() as { voices: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> };
      return {
        success: true,
        voices: data.voices,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get user subscription info and character quota.
   */
  async getSubscriptionInfo(): Promise<{
    success: boolean;
    characterCount?: number;
    characterLimit?: number;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'ElevenLabs API key not configured.',
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/user/subscription`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `API error ${response.status}: ${await response.text()}`,
        };
      }

      const data = await response.json() as { 
        character_count: number; 
        character_limit: number 
      };
      return {
        success: true,
        characterCount: data.character_count,
        characterLimit: data.character_limit,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private buildVoiceSettings(
    mapping: VoiceMapping,
    performance?: PerformanceHints
  ): Partial<VoiceSettings> {
    // Start with default settings
    const settings: Partial<VoiceSettings> = { ...mapping.default_settings };

    // Apply narrator tone overrides if applicable
    if (mapping.is_narrator && performance?.tone && mapping.tone_overrides) {
      const toneOverride = mapping.tone_overrides[performance.tone];
      if (toneOverride) {
        Object.assign(settings, toneOverride);
      }
    }

    // Apply explicit performance overrides
    if (performance?.stability_override !== undefined) {
      settings.stability = performance.stability_override;
    }
    if (performance?.style_override !== undefined) {
      settings.style = performance.style_override;
    }

    return settings;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton
// ============================================================================

let defaultClient: ElevenLabsClient | null = null;

export function getElevenLabsClient(config?: ElevenLabsConfig): ElevenLabsClient {
  if (!defaultClient || config) {
    defaultClient = new ElevenLabsClient(config);
  }
  return defaultClient;
}

export function resetElevenLabsClient(): void {
  defaultClient = null;
}
