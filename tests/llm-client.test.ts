/**
 * LLM Client Authentication Mode Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getLLMClient, resetLLMClient, type AuthMode } from '../src/llm/client.js';

describe('LLMClient Auth Mode Detection', () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalUseClaudeMax = process.env.USE_CLAUDE_MAX;
  const originalUseAgentSdk = process.env.USE_AGENT_SDK;

  beforeEach(() => {
    resetLLMClient();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.USE_CLAUDE_MAX;
    delete process.env.USE_AGENT_SDK;
  });

  afterEach(() => {
    resetLLMClient();
    if (originalApiKey) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (originalUseClaudeMax) {
      process.env.USE_CLAUDE_MAX = originalUseClaudeMax;
    }
    if (originalUseAgentSdk) {
      process.env.USE_AGENT_SDK = originalUseAgentSdk;
    }
  });

  it('defaults to agent-sdk mode when no API key is set', () => {
    const client = getLLMClient();
    expect(client.getMode()).toBe('agent-sdk');
  });

  it('uses api mode when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const client = getLLMClient();
    expect(client.getMode()).toBe('api');
  });

  it('uses agent-sdk mode when USE_CLAUDE_MAX=1', () => {
    process.env.USE_CLAUDE_MAX = '1';
    const client = getLLMClient();
    expect(client.getMode()).toBe('agent-sdk');
  });

  it('uses agent-sdk mode when USE_AGENT_SDK=1', () => {
    process.env.USE_AGENT_SDK = '1';
    const client = getLLMClient();
    expect(client.getMode()).toBe('agent-sdk');
  });

  it('respects explicit mode: api', () => {
    const client = getLLMClient({ mode: 'api' });
    expect(client.getMode()).toBe('api');
  });

  it('respects explicit mode: agent-sdk', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'; // Even with API key
    const client = getLLMClient({ mode: 'agent-sdk' });
    expect(client.getMode()).toBe('agent-sdk');
  });

  it('prefers API key over USE_CLAUDE_MAX when auto-detecting', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.USE_CLAUDE_MAX = '1';
    const client = getLLMClient();
    // API key takes precedence in auto-detection
    expect(client.getMode()).toBe('api');
  });
});
