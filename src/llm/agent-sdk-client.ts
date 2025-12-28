/**
 * Agent SDK Client
 * 
 * Wrapper around @anthropic-ai/claude-agent-sdk for using Claude Max subscription.
 * Uses Claude Code as its runtime, which handles authentication via OAuth.
 */

import { query, type Options, type SDKResultMessage, type SDKAssistantMessage } from '@anthropic-ai/claude-agent-sdk';
import type { LLMRequest, LLMResponse } from './client.js';

// ============================================================================
// Types
// ============================================================================

export interface AgentSDKConfig {
  maxTurns?: number;
  timeout?: number;
}

// ============================================================================
// Agent SDK Client
// ============================================================================

export class AgentSDKClient {
  private config: AgentSDKConfig;

  constructor(config: AgentSDKConfig = {}) {
    this.config = {
      // Use 5 turns to provide headroom for SDK internals
      // Each "completion" should still be a single response, but the SDK
      // may count internal operations as turns
      maxTurns: config.maxTurns || 5,
      timeout: config.timeout || 120000,
    };
  }

  /**
   * Send a completion request via the Agent SDK.
   * This uses Claude Code's authentication (Claude Max subscription).
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const options: Options = {
      maxTurns: this.config.maxTurns,
      systemPrompt: request.system,
      // Don't allow any tools - we just want text completion
      allowedTools: [],
      // Bypass permissions since we're not using tools
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    };

    let content = '';
    let model = 'claude-agent-sdk';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const message of query({
        prompt: request.prompt,
        options,
      })) {
        // Handle different message types
        if (message.type === 'assistant') {
          const assistantMsg = message as SDKAssistantMessage;
          // Extract text from assistant messages via the API message
          if (assistantMsg.message && assistantMsg.message.content) {
            for (const block of assistantMsg.message.content) {
              if (block.type === 'text') {
                content += block.text;
              }
            }
          }
        } else if (message.type === 'result') {
          const resultMsg = message as SDKResultMessage;
          // Extract usage and result from success messages
          if (resultMsg.subtype === 'success') {
            if (resultMsg.result) {
              // If we didn't get content from assistant messages, use the result
              if (!content) {
                content = resultMsg.result;
              }
            }
            if (resultMsg.usage) {
              inputTokens = resultMsg.usage.input_tokens || 0;
              outputTokens = resultMsg.usage.output_tokens || 0;
            }
          } else {
            // Error result
            const errors = 'errors' in resultMsg ? resultMsg.errors : [];
            throw new Error(`Agent SDK error: ${errors.join(', ') || resultMsg.subtype}`);
          }
        } else if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
          // Session initialization - capture model info if available
          if ('model' in message && message.model) {
            model = message.model as string;
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for common Agent SDK errors
      if (errorMessage.includes('CLI not found') || errorMessage.includes('claude')) {
        throw new Error(
          'Claude Code CLI not found. Please install it first:\n' +
          '  curl -fsSL https://claude.ai/install.sh | bash\n' +
          'Then authenticate with your Claude Max subscription by running: claude'
        );
      }
      
      if (errorMessage.includes('auth') || errorMessage.includes('login')) {
        throw new Error(
          'Not authenticated with Claude Code. Run "claude" and log in with your Claude Max account.'
        );
      }
      
      throw error;
    }

    return {
      content: content.trim(),
      model,
      usage: {
        inputTokens,
        outputTokens,
      },
    };
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
}
