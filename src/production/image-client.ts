/**
 * Image Generation Client
 * 
 * Handles image generation via OpenAI's DALL-E 3 or GPT Image API.
 * Stage I-C of the production pipeline.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  Shot,
  ProductionConstraints,
} from '../types/production.js';

// ============================================================================
// Types
// ============================================================================

export interface ImageClientConfig {
  apiKey?: string;
  model?: 'gpt-image-1.5';
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface GenerationResult {
  success: boolean;
  imageBuffer?: Buffer;
  revisedPrompt?: string;
  error?: string;
}

export interface ImageGenerationOptions {
  size?: '1024x1024' | '1792x1024' | '1024x1792';
}

// ============================================================================
// Image Client
// ============================================================================

export class ImageClient {
  private apiKey: string;
  private model = 'gpt-image-1.5';
  private maxRetries: number;
  private retryDelayMs: number;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(config: ImageClientConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    this.maxRetries = config.maxRetries || 3;
    this.retryDelayMs = config.retryDelayMs || 2000;
  }

  /**
   * Check if the client is configured with an API key.
   */
  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Generate an image from a prompt.
   */
  async generate(
    prompt: string,
    options: ImageGenerationOptions = {}
  ): Promise<GenerationResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'OpenAI API key not configured. Set OPENAI_API_KEY environment variable.',
      };
    }

    const url = `${this.baseUrl}/images/generations`;

    const body = JSON.stringify({
      model: this.model,
      prompt,
      n: 1,
      size: options.size || '1792x1024', // 16:9 landscape
    });

    let lastError: string | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
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

          // Check for content policy violation
          if (response.status === 400 && errorText.includes('content_policy')) {
            return {
              success: false,
              error: 'Content policy violation. Please simplify or modify the prompt.',
            };
          }

          lastError = `API error ${response.status}: ${errorText}`;

          // Don't retry on most client errors
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            break;
          }

          await this.sleep(this.retryDelayMs * Math.pow(2, attempt));
          continue;
        }

        const data = await response.json() as {
          data: Array<{ b64_json: string; revised_prompt?: string }>;
        };

        if (!data.data || data.data.length === 0) {
          lastError = 'No image data in response';
          continue;
        }

        const imageData = data.data[0];
        const imageBuffer = Buffer.from(imageData.b64_json, 'base64');

        return {
          success: true,
          imageBuffer,
          revisedPrompt: imageData.revised_prompt,
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
      error: lastError || 'Unknown error during generation',
    };
  }

  /**
   * Generate an image for a storyboard shot.
   */
  async generateShot(
    shot: Shot,
    constraints: ProductionConstraints
  ): Promise<GenerationResult> {
    // Build the full prompt with style constraints
    const styleSuffix = shot.gpt_image_params?.style_suffix || '';
    const fullPrompt = this.buildPrompt(
      shot.visual_prompt,
      constraints.visual_style_prompt,
      styleSuffix
    );

    // Determine size based on aspect ratio
    const size = this.parseAspectRatio(constraints.aspect_ratio) as
      | "1024x1024"
      | "1792x1024"
      | "1024x1792"
      | undefined;

    return this.generate(fullPrompt, { size });
  }

  /**
   * Check if an image file already exists (for recovery).
   */
  async checkExistingFile(shotId: string, outputDir: string, format: string = 'png'): Promise<{
    exists: boolean;
    file?: string;
  }> {
    const filename = `${shotId}.${format}`;
    const filePath = path.join(outputDir, filename);

    try {
      const stats = await fs.stat(filePath);
      // Check that it's not a placeholder (placeholder is tiny, ~70 bytes)
      if (stats.size > 1000) {
        return { exists: true, file: filename };
      }
    } catch {
      // File doesn't exist
    }

    return { exists: false };
  }

  /**
   * Generate images for multiple shots and save to files.
   * Supports recovery by skipping shots that already have image files.
   */
  async generateToFiles(
    shots: Shot[],
    constraints: ProductionConstraints,
    outputDir: string,
    options: { force?: boolean } = {}
  ): Promise<{
    success: boolean;
    files: Array<{ shotId: string; file: string }>;
    errors: Array<{ shotId: string; error: string }>;
    skipped: number;
  }> {
    await fs.mkdir(outputDir, { recursive: true });

    const files: Array<{ shotId: string; file: string }> = [];
    const errors: Array<{ shotId: string; error: string }> = [];
    const ext = constraints.image_format || 'png';
    let skipped = 0;

    for (const shot of shots) {
      // Check for existing file (recovery)
      if (!options.force) {
        const existing = await this.checkExistingFile(shot.shot_id, outputDir, ext);
        if (existing.exists && existing.file) {
          files.push({
            shotId: shot.shot_id,
            file: existing.file,
          });
          skipped++;
          continue;
        }
      }

      console.log(`    Generating image for ${shot.shot_id}...`);

      const result = await this.generateShot(shot, constraints);

      if (result.success && result.imageBuffer) {
        const filename = `${shot.shot_id}.${ext}`;
        const filePath = path.join(outputDir, filename);

        await fs.writeFile(filePath, result.imageBuffer);

        files.push({
          shotId: shot.shot_id,
          file: filename,
        });
      } else {
        errors.push({
          shotId: shot.shot_id,
          error: result.error || 'Unknown error',
        });
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
   * Generate a placeholder image for failed generations.
   */
  async generatePlaceholder(
    shotId: string,
    sceneText: string,
    outputDir: string,
    format: string = 'png'
  ): Promise<string> {
    // Create a simple placeholder using a canvas-like approach
    // For now, we'll just create an empty file as a marker
    const filename = `${shotId}_placeholder.${format}`;
    const filePath = path.join(outputDir, filename);

    // Create a minimal 1x1 pixel PNG as placeholder
    // This is a valid PNG with a single transparent pixel
    const minimalPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, // RGBA, filters
      0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
      0x08, 0xd7, 0x63, 0x60, 0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
      0xae, 0x42, 0x60, 0x82
    ]);

    await fs.writeFile(filePath, minimalPng);

    // Also write metadata about what should be here
    const metaPath = path.join(outputDir, `${shotId}_placeholder.json`);
    await fs.writeFile(metaPath, JSON.stringify({
      shot_id: shotId,
      status: 'placeholder',
      scene_text_preview: sceneText.slice(0, 200),
      needs_manual_generation: true,
    }, null, 2));

    return filename;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private buildPrompt(
    visualPrompt: string,
    stylePrompt: string,
    styleSuffix: string
  ): string {
    const parts: string[] = [];

    if (stylePrompt) {
      parts.push(stylePrompt);
    }

    parts.push(visualPrompt);

    if (styleSuffix) {
      parts.push(styleSuffix);
    }

    return parts.join('\n\n');
  }

  private parseAspectRatio(ratio: string): '1024x1024' | '1536x1024' | '1024x1536' {
    if (ratio === '16:9' || ratio === '1920x1080') {
      return '1536x1024'; // Closest to 16:9
    }
    if (ratio === '9:16') {
      return '1024x1536'; // Portrait
    }
    return '1024x1024'; // Default square
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton
// ============================================================================

let defaultClient: ImageClient | null = null;

export function getImageClient(config?: ImageClientConfig): ImageClient {
  if (!defaultClient || config) {
    defaultClient = new ImageClient(config);
  }
  return defaultClient;
}

export function resetImageClient(): void {
  defaultClient = null;
}
