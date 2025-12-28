/**
 * LLM Client
 * 
 * Wrapper around Anthropic API for structured LLM interactions.
 * Handles model routing, retries, and response parsing.
 */

import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// Types
// ============================================================================

export type ModelTier = 'fast' | 'standard' | 'premium';

export interface LLMConfig {
  apiKey?: string;
  defaultModel?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface LLMRequest {
  system: string;
  prompt: string;
  model?: ModelTier;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ============================================================================
// Model Routing
// ============================================================================

const MODEL_MAP: Record<ModelTier, string> = {
  fast: 'claude-3-5-haiku-latest',
  standard: 'claude-sonnet-4-20250514',
  premium: 'claude-sonnet-4-20250514', // Use Sonnet for premium too, can upgrade to Opus if needed
};

// ============================================================================
// LLM Client
// ============================================================================

export class LLMClient {
  private client: Anthropic;
  private config: Required<LLMConfig>;

  constructor(config: LLMConfig = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || '',
      defaultModel: config.defaultModel || 'standard',
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 120000,
    };

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
    });
  }

  /**
   * Send a completion request to the LLM.
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const modelTier = request.model || (this.config.defaultModel as ModelTier);
    const model = MODEL_MAP[modelTier];

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model,
          max_tokens: request.maxTokens || 4096,
          system: request.system,
          messages: [
            {
              role: 'user',
              content: request.prompt,
            },
          ],
        });

        // Extract text content
        const textContent = response.content.find(c => c.type === 'text');
        if (!textContent || textContent.type !== 'text') {
          throw new Error('No text content in response');
        }

        return {
          content: textContent.text,
          model: response.model,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on certain errors
        if (lastError.message.includes('invalid_api_key')) {
          throw lastError;
        }

        // Wait before retrying
        if (attempt < this.config.maxRetries - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError || new Error('Unknown error after retries');
  }

  /**
   * Send a request expecting JSON output.
   */
  async completeJson<T>(
    request: LLMRequest,
    validator?: (data: unknown) => T
  ): Promise<{ data: T; response: LLMResponse }> {
    // Add JSON instruction to system prompt
    const jsonSystem = `${request.system}\n\nIMPORTANT: You must respond with valid JSON only. No markdown code blocks, no explanation, just the JSON object.`;

    const response = await this.complete({
      ...request,
      system: jsonSystem,
      jsonMode: true,
    });

    // Parse JSON from response
    let content = response.content.trim();
    
    // Strip markdown code blocks if present
    if (content.startsWith('```json')) {
      content = content.slice(7);
    } else if (content.startsWith('```')) {
      content = content.slice(3);
    }
    if (content.endsWith('```')) {
      content = content.slice(0, -3);
    }
    content = content.trim();

    try {
      const parsed = JSON.parse(content);
      const data = validator ? validator(parsed) : (parsed as T);
      return { data, response };
    } catch (error) {
      throw new Error(
        `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}\n\nResponse was:\n${content}`
      );
    }
  }

  /**
   * Estimate token count for a string (rough approximation).
   */
  estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let defaultClient: LLMClient | null = null;

export function getLLMClient(config?: LLMConfig): LLMClient {
  if (!defaultClient || config) {
    defaultClient = new LLMClient(config);
  }
  return defaultClient;
}
