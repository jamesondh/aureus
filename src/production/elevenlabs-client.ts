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
   */
  async synthesizeSegment(
    segment: AudioSegment,
    casting: CastingRegistry
  ): Promise<SynthesisResult> {
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

    return this.synthesize(segment.clean_text, mapping.eleven_voice_id, settings);
  }

  /**
   * Synthesize multiple segments and save to files.
   */
  async synthesizeToFiles(
    segments: AudioSegment[],
    casting: CastingRegistry,
    outputDir: string
  ): Promise<{
    success: boolean;
    files: Array<{ segmentId: string; file: string; durationMs: number }>;
    errors: Array<{ segmentId: string; error: string }>;
  }> {
    await fs.mkdir(outputDir, { recursive: true });

    const files: Array<{ segmentId: string; file: string; durationMs: number }> = [];
    const errors: Array<{ segmentId: string; error: string }> = [];

    for (const segment of segments) {
      console.log(`  Synthesizing ${segment.segment_id}...`);
      
      const result = await this.synthesizeSegment(segment, casting);

      if (result.success && result.audioBuffer) {
        const filename = `${segment.segment_id}.mp3`;
        const filePath = path.join(outputDir, filename);
        
        await fs.writeFile(filePath, result.audioBuffer);
        
        files.push({
          segmentId: segment.segment_id,
          file: filename,
          durationMs: result.durationMs || 0,
        });
      } else {
        errors.push({
          segmentId: segment.segment_id,
          error: result.error || 'Unknown error',
        });
      }
    }

    return {
      success: errors.length === 0,
      files,
      errors,
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
