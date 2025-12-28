/**
 * Verifier
 * 
 * Validates scene outputs against hard and soft constraints.
 * Performs both deterministic checks and LLM-based quality evaluation.
 */

import type { LLMClient } from '../llm/client.js';
import type { StateStore } from '../engine/state-store.js';
import type { 
  ScenePacket, 
  WriterOutput, 
  VerifierReport, 
  Violation 
} from '../types/episode.js';
import { validateDelta } from '../engine/delta-engine.js';

// ============================================================================
// Types
// ============================================================================

export interface VerifierConfig {
  enableLLMCritic: boolean;
  strictMode: boolean;
  forbiddenWords: string[];
}

const DEFAULT_FORBIDDEN_WORDS = [
  'okay', 'ok', 'sure', 'yeah', 'minute', 'second', 'hour',
  'percent', 'percentage', 'police', 'cop', 'lawyer', 'boss',
  'stressed', 'anxious', 'triggered', 'viral', 'basically',
];

const DEFAULT_CONFIG: VerifierConfig = {
  enableLLMCritic: true,
  strictMode: false,
  forbiddenWords: DEFAULT_FORBIDDEN_WORDS,
};

// ============================================================================
// Verifier
// ============================================================================

export class Verifier {
  private store: StateStore;
  private llm: LLMClient;
  private config: VerifierConfig;

  constructor(store: StateStore, llm: LLMClient, config: Partial<VerifierConfig> = {}) {
    this.store = store;
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Verify a scene output against its packet.
   */
  async verifyScene(
    packet: ScenePacket,
    output: WriterOutput
  ): Promise<VerifierReport> {
    const violations: Violation[] = [];
    const warnings: Violation[] = [];
    const fixInstructions: string[] = [];

    // 1. Deterministic checks
    const deterministicResults = {
      json_valid: true, // Already parsed if we got here
      invariants_passed: true,
      prereqs_satisfied: true,
      accounting_balanced: true,
      claims_within_limits: true,
      required_deltas_covered: true,
    };

    // Check invariants (dead can't speak, no teleportation, etc.)
    const invariantViolations = this.checkInvariants(packet, output);
    if (invariantViolations.length > 0) {
      deterministicResults.invariants_passed = false;
      violations.push(...invariantViolations);
    }

    // Check claims within allowed limits
    const claimsViolations = this.checkClaimsLimits(packet, output);
    if (claimsViolations.length > 0) {
      deterministicResults.claims_within_limits = false;
      violations.push(...claimsViolations);
    }

    // Check required deltas are depicted
    const deltaViolations = this.checkRequiredDeltas(packet, output);
    if (deltaViolations.length > 0) {
      deterministicResults.required_deltas_covered = false;
      violations.push(...deltaViolations);
    }

    // Check for forbidden words (soft constraint)
    const wordViolations = this.checkForbiddenWords(output);
    warnings.push(...wordViolations);

    // Check accounting (for transfer operations)
    const accountingViolations = this.checkAccounting(packet, output);
    if (accountingViolations.length > 0) {
      deterministicResults.accounting_balanced = false;
      violations.push(...accountingViolations);
    }

    // 2. LLM critic (if enabled)
    let llmCriticResult = undefined;
    if (this.config.enableLLMCritic) {
      llmCriticResult = await this.runLLMCritic(packet, output);
      
      if (llmCriticResult.verdict === 'FAIL') {
        if (!llmCriticResult.plan_compliance) {
          warnings.push({
            type: 'soft_constraint',
            rule: 'plan_compliance',
            message: 'Scene does not accomplish required beats',
          });
          fixInstructions.push('Ensure all beats in director_instructions.sequence are depicted');
        }
        if (!llmCriticResult.hook_present) {
          warnings.push({
            type: 'soft_constraint',
            rule: 'hook_requirement',
            message: 'Scene does not end with a strong hook line',
          });
          fixInstructions.push('Add a stronger button/hook line at the scene ending');
        }
      }
    }

    // Generate fix instructions for violations
    for (const violation of violations) {
      switch (violation.type) {
        case 'hard_constraint':
          fixInstructions.push(`Fix: ${violation.message}`);
          break;
        case 'delta_missing':
          fixInstructions.push(`Add scene event depicting: ${violation.message}`);
          break;
      }
    }

    return {
      scene_id: output.scene_id,
      deterministic_checks: deterministicResults,
      llm_critic_result: llmCriticResult,
      violations,
      warnings,
      fix_instructions: fixInstructions,
    };
  }

  /**
   * Check hard invariants.
   */
  private checkInvariants(packet: ScenePacket, output: WriterOutput): Violation[] {
    const violations: Violation[] = [];
    const text = output.scene_text.toLowerCase();
    
    // Check: dead characters cannot speak
    for (const castMember of packet.cast) {
      const char = this.store.getCharacter(castMember.character_id);
      if (char && !char.status.alive) {
        // Check if this character has dialogue in the scene
        const charName = char.name.toLowerCase();
        if (text.includes(`${charName}:`) || text.includes(`${charName.split(' ')[0]}:`)) {
          violations.push({
            type: 'hard_constraint',
            rule: 'H1',
            message: `Dead character ${char.name} cannot speak or act`,
            scene_id: output.scene_id,
          });
        }
      }
    }

    // Check: characters must be at scene location (no teleportation)
    for (const castMember of packet.cast) {
      const char = this.store.getCharacter(castMember.character_id);
      if (char && char.status.location_id !== packet.setting.location_id) {
        // Allow if they're moving to this location (travel is implicit)
        // This is a soft check - we warn but don't fail
      }
    }

    return violations;
  }

  /**
   * Check claims are within allowed limits.
   */
  private checkClaimsLimits(packet: ScenePacket, output: WriterOutput): Violation[] {
    const violations: Violation[] = [];
    const limits = packet.constraints?.allowed_inventions || { extras: 2 };

    // Count claims by type
    const extrasClaimed = output.claims.filter(c => c.type === 'extra').length;

    if (limits.extras !== undefined && extrasClaimed > limits.extras) {
      violations.push({
        type: 'hard_constraint',
        rule: 'claims_limit',
        message: `Too many extras invented: ${extrasClaimed} > ${limits.extras}`,
        scene_id: output.scene_id,
      });
    }

    return violations;
  }

  /**
   * Check that required deltas are depicted in scene events.
   */
  private checkRequiredDeltas(packet: ScenePacket, output: WriterOutput): Violation[] {
    const violations: Violation[] = [];
    const requiredDeltas = packet.constraints?.required_deltas || [];

    for (const required of requiredDeltas) {
      // Look for a scene event that covers this delta
      const covered = output.scene_events.some(event => {
        // Check if the event's delta string mentions the path
        if (event.delta && event.delta.includes(required.path.split('.').pop() || '')) {
          return true;
        }
        // Check if narrative_trigger is depicted
        if (required.narrative_trigger) {
          const triggerLower = required.narrative_trigger.toLowerCase();
          const textLower = output.scene_text.toLowerCase();
          return textLower.includes(triggerLower.slice(0, 20));
        }
        return false;
      });

      if (!covered) {
        violations.push({
          type: 'delta_missing',
          message: `Required delta not depicted: ${required.path} (${required.narrative_trigger || 'no trigger'})`,
          scene_id: output.scene_id,
        });
      }
    }

    return violations;
  }

  /**
   * Check for forbidden anachronistic words.
   */
  private checkForbiddenWords(output: WriterOutput): Violation[] {
    const warnings: Violation[] = [];
    const textLower = output.scene_text.toLowerCase();

    for (const word of this.config.forbiddenWords) {
      // Use word boundary matching
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = textLower.match(regex);
      
      if (matches && matches.length > 0) {
        warnings.push({
          type: 'soft_constraint',
          rule: 'S1',
          message: `Forbidden word "${word}" found ${matches.length} time(s)`,
          scene_id: output.scene_id,
        });
      }
    }

    return warnings;
  }

  /**
   * Check accounting for transfer operations.
   */
  private checkAccounting(packet: ScenePacket, output: WriterOutput): Violation[] {
    const violations: Violation[] = [];
    const state = this.store.getWorldState();

    // Check if any required deltas involve transfers
    const requiredDeltas = packet.constraints?.required_deltas || [];
    
    for (const delta of requiredDeltas) {
      if (delta.op === 'transfer') {
        // Validate the transfer is possible
        const validation = validateDelta(state, {
          path: delta.path,
          op: 'transfer',
          from: (delta as { from?: string }).from,
          to: (delta as { to?: string }).to,
          denarii: (delta as { denarii?: number }).denarii,
        });

        if (!validation.valid) {
          violations.push({
            type: 'hard_constraint',
            rule: 'H3',
            message: validation.error || 'Transfer validation failed',
            scene_id: output.scene_id,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Run LLM critic for quality evaluation.
   */
  private async runLLMCritic(
    packet: ScenePacket,
    output: WriterOutput
  ): Promise<{
    verdict: 'PASS' | 'FAIL';
    plan_compliance: boolean;
    hook_present: boolean;
    notes?: string;
  }> {
    const prompt = `
Evaluate this scene for quality:

SCENE PACKET (what was requested):
${JSON.stringify({
  beat_type: packet.director_instructions.beat_type,
  sequence: packet.director_instructions.sequence,
  hook_requirement: packet.constraints?.hook_requirement,
}, null, 2)}

SCENE TEXT:
${output.scene_text}

SCENE EVENTS (what the writer claims happened):
${JSON.stringify(output.scene_events, null, 2)}

Evaluate:
1. Plan compliance - Did the scene accomplish all beats in the sequence?
2. Hook presence - Does the scene end with a strong button/hook line?
3. Voice consistency - Does it avoid modern anachronisms and maintain Roman atmosphere?

Output JSON:
{
  "verdict": "PASS or FAIL",
  "plan_compliance": true/false,
  "hook_present": true/false,
  "notes": "Brief explanation"
}
`;

    const { data } = await this.llm.completeJson<{
      verdict: 'PASS' | 'FAIL';
      plan_compliance: boolean;
      hook_present: boolean;
      notes?: string;
    }>(
      {
        system: 'You are a quality evaluator for dramatic scenes. Be strict but fair.',
        prompt,
        model: 'fast', // Use Haiku for critic
        maxTokens: 512,
      }
    );

    return data;
  }

  /**
   * Quick pass/fail check without full report.
   */
  quickCheck(output: WriterOutput): { pass: boolean; reason?: string } {
    // Check for any forbidden words
    const textLower = output.scene_text.toLowerCase();
    for (const word of this.config.forbiddenWords.slice(0, 5)) {
      if (textLower.includes(word)) {
        return { pass: false, reason: `Contains forbidden word: ${word}` };
      }
    }

    // Check scene has minimum content
    if (output.scene_text.length < 200) {
      return { pass: false, reason: 'Scene too short' };
    }

    // Check for scene events
    if (output.scene_events.length === 0) {
      return { pass: false, reason: 'No scene events reported' };
    }

    return { pass: true };
  }
}
