/**
 * LLM Client
 * 
 * Unified wrapper for LLM interactions supporting two authentication modes:
 * 1. API Key mode: Direct Anthropic API access (requires ANTHROPIC_API_KEY)
 * 2. Agent SDK mode: Uses Claude Code CLI with Claude Max subscription
 * 
 * The mode is auto-detected based on available credentials, or can be
 * explicitly set via the `mode` config option.
 */

import Anthropic from '@anthropic-ai/sdk';
import { AgentSDKClient } from './agent-sdk-client.js';

// ============================================================================
// Types
// ============================================================================

export type ModelTier = 'fast' | 'standard' | 'premium';
export type AuthMode = 'api' | 'agent-sdk';

export interface LLMConfig {
  /** Anthropic API key (required for 'api' mode) */
  apiKey?: string;
  /** Default model tier to use */
  defaultModel?: string;
  /** Maximum retry attempts for failed requests */
  maxRetries?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** 
   * Authentication mode:
   * - 'api': Use Anthropic API directly (requires ANTHROPIC_API_KEY)
   * - 'agent-sdk': Use Claude Agent SDK (requires Claude Code CLI with Claude Max auth)
   * - undefined: Auto-detect based on available credentials
   */
  mode?: AuthMode;
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
  premium: 'claude-opus-4-20250514', // Claude Opus 4.5 for editorial review and escalation
};

// ============================================================================
// LLM Client Interface
// ============================================================================

export interface ILLMClient {
  complete(request: LLMRequest): Promise<LLMResponse>;
  completeJson<T>(request: LLMRequest, validator?: (data: unknown) => T): Promise<{ data: T; response: LLMResponse }>;
  estimateTokens(text: string): number;
}

// ============================================================================
// API Client (Direct Anthropic API)
// ============================================================================

class APIClient implements ILLMClient {
  private client: Anthropic;
  private config: Required<Omit<LLMConfig, 'mode'>>;

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
        
        if (lastError.message.includes('invalid_api_key')) {
          throw lastError;
        }

        if (attempt < this.config.maxRetries - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError || new Error('Unknown error after retries');
  }

  async completeJson<T>(
    request: LLMRequest,
    validator?: (data: unknown) => T
  ): Promise<{ data: T; response: LLMResponse }> {
    const jsonSystem = `${request.system}\n\nIMPORTANT: You must respond with valid JSON only. No markdown code blocks, no explanation, just the JSON object.`;

    const response = await this.complete({
      ...request,
      system: jsonSystem,
      jsonMode: true,
    });

    let content = response.content.trim();
    
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

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Unified LLM Client
// ============================================================================

export class LLMClient implements ILLMClient {
  private delegate: ILLMClient;
  private mode: AuthMode;

  constructor(config: LLMConfig = {}) {
    // Determine authentication mode
    this.mode = config.mode || this.detectMode(config);
    
    if (this.mode === 'api') {
      this.delegate = new APIClient(config);
    } else {
      this.delegate = new AgentSDKClient({
        maxTurns: 5, // Provide headroom for SDK internals
        timeout: config.timeout,
      });
    }
  }

  /**
   * Get the current authentication mode.
   */
  getMode(): AuthMode {
    return this.mode;
  }

  /**
   * Auto-detect authentication mode based on available credentials.
   * Prefers API key if available, falls back to Agent SDK.
   */
  private detectMode(config: LLMConfig): AuthMode {
    const hasApiKey = !!(config.apiKey || process.env.ANTHROPIC_API_KEY);
    
    if (hasApiKey) {
      return 'api';
    }
    
    // Check if USE_AGENT_SDK is explicitly set
    if (process.env.USE_AGENT_SDK === '1' || process.env.USE_AGENT_SDK === 'true') {
      return 'agent-sdk';
    }
    
    // Check if Claude Code CLI might be available (check for claude max env hint)
    if (process.env.USE_CLAUDE_MAX === '1' || process.env.USE_CLAUDE_MAX === 'true') {
      return 'agent-sdk';
    }
    
    // Default to agent-sdk if no API key is found
    // This allows Claude Max users to just run without setting anything
    return 'agent-sdk';
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    return this.delegate.complete(request);
  }

  async completeJson<T>(
    request: LLMRequest,
    validator?: (data: unknown) => T
  ): Promise<{ data: T; response: LLMResponse }> {
    return this.delegate.completeJson(request, validator);
  }

  estimateTokens(text: string): number {
    return this.delegate.estimateTokens(text);
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let defaultClient: LLMClient | null = null;

/**
 * Get the default LLM client instance.
 * Auto-detects authentication mode based on available credentials.
 */
export function getLLMClient(config?: LLMConfig): LLMClient {
  if (!defaultClient || config) {
    defaultClient = new LLMClient(config);
  }
  return defaultClient;
}

/**
 * Reset the default client (useful for testing or reconfiguration).
 */
export function resetLLMClient(): void {
  defaultClient = null;
}
