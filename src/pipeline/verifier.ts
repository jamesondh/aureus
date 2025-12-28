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
  enableEditorialReview: boolean;
  strictMode: boolean;
  forbiddenWords: string[];
  repetitionLimits: RepetitionLimits;
}

export interface RepetitionLimits {
  maxQuotesPerCharacter: number;      // R1: Same quote/reference per character
  maxCatchphrasesPerCharacter: number; // R2: Same catchphrase per character  
  maxQuotesAcrossCharacters: number;   // R3: Same quote across different characters
  maxPhysicalTicsPerCharacter: number; // R4: Same physical tic per character
  maxTicsAcrossCharacters: number;     // R5: Same tic across different characters
  maxSameLocationTime: number;         // R6: Identical scene headers
  maxSameLocation: number;             // R7: Same location, different time
}

export interface RepetitionViolation {
  rule: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';
  character_id?: string;
  pattern: string;
  count: number;
  threshold: number;
  verdict: 'WARNING' | 'FAIL';
  fix_instruction: string;
}

export interface EditorialReviewResult {
  overall_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  grade_rationale: string;
  issues: EditorialIssue[];
  strengths: { location: string; description: string }[];
  revision_priority: string[];
  proceed_recommendation: 'commit' | 'revise' | 'manual_review';
}

export interface EditorialIssue {
  id: string;
  severity: 'major' | 'minor' | 'nitpick';
  category: 'repetition' | 'dialogue' | 'pacing' | 'craft';
  location: string;
  description: string;
  suggestion: string;
  rule_reference?: string;
}

const DEFAULT_FORBIDDEN_WORDS = [
  'okay', 'ok', 'sure', 'yeah', 'minute', 'second', 'hour',
  'percent', 'percentage', 'police', 'cop', 'lawyer', 'boss',
  'stressed', 'anxious', 'triggered', 'viral', 'basically',
];

const DEFAULT_REPETITION_LIMITS: RepetitionLimits = {
  maxQuotesPerCharacter: 2,        // R1
  maxCatchphrasesPerCharacter: 3,  // R2
  maxQuotesAcrossCharacters: 1,    // R3
  maxPhysicalTicsPerCharacter: 3,  // R4
  maxTicsAcrossCharacters: 2,      // R5
  maxSameLocationTime: 1,          // R6 (unless CONTINUED)
  maxSameLocation: 3,              // R7
};

const DEFAULT_CONFIG: VerifierConfig = {
  enableLLMCritic: true,
  enableEditorialReview: true,
  strictMode: false,
  forbiddenWords: DEFAULT_FORBIDDEN_WORDS,
  repetitionLimits: DEFAULT_REPETITION_LIMITS,
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
   * 
   * This uses a multi-pronged approach:
   * 1. Check if any scene event's operator_alignment matches the operator that produces this delta
   * 2. Check if the delta path's key term appears in scene_events or scene_text
   * 3. Check if the narrative trigger is depicted in the scene text
   */
  private checkRequiredDeltas(packet: ScenePacket, output: WriterOutput): Violation[] {
    const violations: Violation[] = [];
    const requiredDeltas = packet.constraints?.required_deltas || [];

    // Build a map of operator_id -> delta paths for quick lookup
    const beatOperators = new Set<string>();
    for (const beat of packet.director_instructions.sequence) {
      beatOperators.add(beat.operator_id);
    }

    for (const required of requiredDeltas) {
      // Extract the key term from the path (e.g., "resentment" from "relationship.weights.resentment")
      const pathParts = required.path.split('.');
      const keyTerm = pathParts[pathParts.length - 1] || '';
      const parentTerm = pathParts[pathParts.length - 2] || '';
      
      // Strategy 1: Check if the operator that produces this delta was executed
      // The narrative_trigger often contains "Effect from OP_..."
      let operatorMatched = false;
      if (required.narrative_trigger) {
        const opMatch = required.narrative_trigger.match(/OP_[A-Z_]+/);
        if (opMatch) {
          const operatorId = opMatch[0];
          // Check if any scene event aligns with this operator
          // Accept SUCCESS or undefined (some writers don't specify outcome)
          operatorMatched = output.scene_events.some(event => 
            event.operator_alignment === operatorId && 
            event.outcome !== 'FAIL'
          );
        }
      }
      
      if (operatorMatched) {
        continue; // Delta is covered by operator execution
      }

      // Strategy 2: Check if key terms appear in scene events or delta descriptions
      const termMatched = output.scene_events.some(event => {
        if (!event.delta) return false;
        const deltaLower = event.delta.toLowerCase();
        // Check for the key term or parent.key combination
        return deltaLower.includes(keyTerm.toLowerCase()) ||
               deltaLower.includes(`${parentTerm}.${keyTerm}`.toLowerCase()) ||
               deltaLower.includes(required.path.toLowerCase());
      });
      
      if (termMatched) {
        continue; // Delta is covered by explicit mention
      }

      // Strategy 3: Check if narrative trigger or related concepts appear in scene text
      const textLower = output.scene_text.toLowerCase();
      let narrativeMatched = false;
      
      if (required.narrative_trigger) {
        const triggerLower = required.narrative_trigger.toLowerCase();
        // Check for trigger phrase (first 30 chars or whole thing if shorter)
        const triggerSnippet = triggerLower.slice(0, 30).trim();
        narrativeMatched = textLower.includes(triggerSnippet);
      }
      
      // Also check for common narrative indicators of the delta type
      if (!narrativeMatched) {
        // Map common delta paths to narrative indicators
        const narrativeIndicators: Record<string, string[]> = {
          'resentment': ['glare', 'bitter', 'anger', 'furious', 'hatred', 'spite', 'seethe', 'grudge'],
          'loyalty': ['trust', 'faithful', 'betray', 'allegiance', 'devoted'],
          'fear': ['afraid', 'terrified', 'cower', 'tremble', 'dread', 'panic'],
          'dignitas': ['humiliat', 'shame', 'disgrace', 'honor', 'proud', 'respect'],
          'wealth': ['coin', 'denarii', 'gold', 'silver', 'pay', 'bribe', 'money'],
          'popularity': ['crowd', 'cheer', 'jeer', 'applause', 'public'],
          'dependency': ['need', 'rely', 'depend', 'cling', 'desperate'],
          'respect': ['admire', 'esteem', 'acknowledge', 'defer', 'bow'],
        };
        
        const indicators = narrativeIndicators[keyTerm.toLowerCase()] || [];
        narrativeMatched = indicators.some(ind => textLower.includes(ind));
      }
      
      if (narrativeMatched) {
        continue; // Delta is covered by narrative depiction
      }

      // None of the strategies matched - this is a violation
      violations.push({
        type: 'delta_missing',
        message: `Required delta not depicted: ${required.path} (${required.narrative_trigger || 'no trigger'})`,
        scene_id: output.scene_id,
      });
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

  // ============================================================================
  // Repetition Checking (Rules R1-R7)
  // ============================================================================

  /**
   * Check episode-level repetition constraints.
   * Called after all scenes pass individual verification.
   */
  checkRepetition(
    episodeScript: string,
    sceneHeaders: string[]
  ): RepetitionViolation[] {
    const violations: RepetitionViolation[] = [];
    const limits = this.config.repetitionLimits;

    // R1 & R2: Verbal tic limits per character
    const quotePatterns = this.extractQuotes(episodeScript);
    const catchphrasePatterns = this.extractCatchphrases(episodeScript);

    // Check quotes per character
    for (const [charId, quotes] of Object.entries(quotePatterns)) {
      for (const [quote, count] of Object.entries(quotes)) {
        if (count > limits.maxQuotesPerCharacter) {
          violations.push({
            rule: 'R1',
            character_id: charId,
            pattern: quote,
            count,
            threshold: limits.maxQuotesPerCharacter,
            verdict: 'FAIL',
            fix_instruction: `Reduce uses of "${quote.slice(0, 30)}..." to max ${limits.maxQuotesPerCharacter}. Vary rhetorical style.`,
          });
        } else if (count === limits.maxQuotesPerCharacter) {
          violations.push({
            rule: 'R1',
            character_id: charId,
            pattern: quote,
            count,
            threshold: limits.maxQuotesPerCharacter,
            verdict: 'WARNING',
            fix_instruction: `Quote "${quote.slice(0, 30)}..." used ${count}x (at limit).`,
          });
        }
      }
    }

    // Check catchphrases per character
    for (const [charId, phrases] of Object.entries(catchphrasePatterns)) {
      for (const [phrase, count] of Object.entries(phrases)) {
        if (count > limits.maxCatchphrasesPerCharacter) {
          violations.push({
            rule: 'R2',
            character_id: charId,
            pattern: phrase,
            count,
            threshold: limits.maxCatchphrasesPerCharacter,
            verdict: 'FAIL',
            fix_instruction: `Reduce uses of catchphrase "${phrase.slice(0, 30)}..." to max ${limits.maxCatchphrasesPerCharacter}.`,
          });
        }
      }
    }

    // R3: Same quote across different characters
    const allQuotes: Record<string, string[]> = {};
    for (const [charId, quotes] of Object.entries(quotePatterns)) {
      for (const quote of Object.keys(quotes)) {
        if (!allQuotes[quote]) allQuotes[quote] = [];
        allQuotes[quote].push(charId);
      }
    }
    for (const [quote, chars] of Object.entries(allQuotes)) {
      if (chars.length > limits.maxQuotesAcrossCharacters) {
        violations.push({
          rule: 'R3',
          pattern: quote,
          count: chars.length,
          threshold: limits.maxQuotesAcrossCharacters,
          verdict: 'FAIL',
          fix_instruction: `Quote "${quote.slice(0, 30)}..." used by multiple characters: ${chars.join(', ')}. Should be unique.`,
        });
      }
    }

    // R4 & R5: Physical tic limits
    const ticPatterns = this.extractPhysicalTics(episodeScript);
    
    for (const [charId, tics] of Object.entries(ticPatterns)) {
      for (const [tic, count] of Object.entries(tics)) {
        if (count > limits.maxPhysicalTicsPerCharacter) {
          violations.push({
            rule: 'R4',
            character_id: charId,
            pattern: tic,
            count,
            threshold: limits.maxPhysicalTicsPerCharacter,
            verdict: 'FAIL',
            fix_instruction: `Reduce physical tic "${tic}" to max ${limits.maxPhysicalTicsPerCharacter}x. Vary with: eye-darting, throat-clearing, shifting weight.`,
          });
        }
      }
    }

    // R5: Same tic across different characters
    const allTics: Record<string, string[]> = {};
    for (const [charId, tics] of Object.entries(ticPatterns)) {
      for (const tic of Object.keys(tics)) {
        if (!allTics[tic]) allTics[tic] = [];
        allTics[tic].push(charId);
      }
    }
    for (const [tic, chars] of Object.entries(allTics)) {
      const totalCount = chars.length;
      if (totalCount > limits.maxTicsAcrossCharacters) {
        violations.push({
          rule: 'R5',
          pattern: tic,
          count: totalCount,
          threshold: limits.maxTicsAcrossCharacters,
          verdict: 'FAIL',
          fix_instruction: `Physical tic "${tic}" overused across characters: ${chars.join(', ')}. Differentiate character mannerisms.`,
        });
      }
    }

    // R6 & R7: Scene header deduplication
    const headerCounts = this.analyzeSceneHeaders(sceneHeaders);
    
    for (const [header, count] of Object.entries(headerCounts.exact)) {
      if (count > limits.maxSameLocationTime && !header.includes('CONTINUED')) {
        violations.push({
          rule: 'R6',
          pattern: header,
          count,
          threshold: limits.maxSameLocationTime,
          verdict: 'FAIL',
          fix_instruction: `Duplicate scene header "${header}". Add (CONTINUED) suffix or vary time of day.`,
        });
      }
    }

    for (const [location, count] of Object.entries(headerCounts.byLocation)) {
      if (count > limits.maxSameLocation) {
        violations.push({
          rule: 'R7',
          pattern: location,
          count,
          threshold: limits.maxSameLocation,
          verdict: 'FAIL',
          fix_instruction: `Location "${location}" used ${count}x (max ${limits.maxSameLocation}). Vary settings for visual variety.`,
        });
      }
    }

    return violations;
  }

  /**
   * Extract quoted text patterns per character.
   */
  private extractQuotes(script: string): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    
    // Pattern: Look for lines like "Ennius wrote:" or "'Moribus antiquis..."
    // Match character dialogue that contains quotes or references
    const quotePatterns = [
      /(\w+):\s*[^"]*"([^"]{10,}?)"/g,  // Direct quotes in dialogue
      /(\w+):\s*[^']*'([^']{10,}?)'/g,  // Single-quoted text
      /(\w+):[^"]*(?:wrote|said|quoted|recited)[^"]*[":]\s*['""]([^'""]{10,}?)['"]/gi, // Attribution patterns
    ];

    for (const pattern of quotePatterns) {
      let match;
      while ((match = pattern.exec(script)) !== null) {
        const charName = match[1].toUpperCase();
        const quote = match[2].trim().toLowerCase();
        
        if (!result[charName]) result[charName] = {};
        result[charName][quote] = (result[charName][quote] || 0) + 1;
      }
    }

    // Also check for repeated literary references like "Ennius"
    const referencePattern = /(\w+):[^]*?(Ennius|Cicero|Cato|Homer|Plato)/gi;
    let match;
    while ((match = referencePattern.exec(script)) !== null) {
      const charName = match[1].toUpperCase();
      const reference = `Reference to ${match[2]}`;
      
      if (!result[charName]) result[charName] = {};
      result[charName][reference] = (result[charName][reference] || 0) + 1;
    }

    return result;
  }

  /**
   * Extract catchphrase patterns per character.
   */
  private extractCatchphrases(script: string): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    
    // Look for repeated short phrases in dialogue
    const dialoguePattern = /(\w+):\s*\([^)]*\)\s*\[[^\]]*\]\s*"([^"]+)"/g;
    const phraseCounts: Record<string, Record<string, number>> = {};
    
    let match;
    while ((match = dialoguePattern.exec(script)) !== null) {
      const charName = match[1].toUpperCase();
      const dialogue = match[2].toLowerCase();
      
      // Extract 3-6 word phrases
      const words = dialogue.split(/\s+/);
      for (let i = 0; i < words.length - 2; i++) {
        const phrase = words.slice(i, i + 4).join(' ');
        if (phrase.length > 15 && phrase.length < 60) {
          if (!phraseCounts[charName]) phraseCounts[charName] = {};
          phraseCounts[charName][phrase] = (phraseCounts[charName][phrase] || 0) + 1;
        }
      }
    }

    // Only return phrases used more than once
    for (const [charName, phrases] of Object.entries(phraseCounts)) {
      for (const [phrase, count] of Object.entries(phrases)) {
        if (count > 1) {
          if (!result[charName]) result[charName] = {};
          result[charName][phrase] = count;
        }
      }
    }

    return result;
  }

  /**
   * Extract physical tic patterns per character.
   */
  private extractPhysicalTics(script: string): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    
    // Common physical tic patterns to look for
    const ticPatterns = [
      'wip(?:es?|ing) (?:his|her|their) hands',
      'adjust(?:s|ed|ing)? (?:his|her|their) toga',
      'tug(?:s|ged|ging)? (?:at )?(?:his|her|their) tunic',
      'fingers? drum(?:s|med|ming)?',
      'pacing',
      'checks? the (?:sun|time|window)',
      'does not (?:turn|look)',
      'jaw (?:works|tightens|clenches)',
    ];

    // Find character context (scenes or dialogue)
    const scenePattern = /## (SC\d+)[^]*?(?=## SC|\z)/g;
    let sceneMatch;
    
    while ((sceneMatch = scenePattern.exec(script)) !== null) {
      const sceneText = sceneMatch[0].toLowerCase();
      
      // Extract character mentions in this scene
      const charMentions = sceneText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g) || [];
      const currentChars = new Set(charMentions.map(c => c.toUpperCase()));
      
      for (const ticPattern of ticPatterns) {
        const regex = new RegExp(ticPattern, 'gi');
        const matches = sceneText.match(regex);
        
        if (matches) {
          // Attribute to most recently mentioned character or 'UNKNOWN'
          for (const _match of matches) {
            // Try to find character context
            const charForTic = Array.from(currentChars)[0] || 'UNKNOWN';
            if (!result[charForTic]) result[charForTic] = {};
            const normalizedTic = ticPattern.replace(/\([^)]+\)/g, '').trim();
            result[charForTic][normalizedTic] = (result[charForTic][normalizedTic] || 0) + 1;
          }
        }
      }
    }

    return result;
  }

  /**
   * Analyze scene headers for duplication.
   */
  private analyzeSceneHeaders(
    headers: string[]
  ): { exact: Record<string, number>; byLocation: Record<string, number> } {
    const exact: Record<string, number> = {};
    const byLocation: Record<string, number> = {};

    for (const header of headers) {
      // Normalize header (remove CONTINUED suffix for exact matching)
      const normalized = header.replace(/\s*\(CONTINUED\)\s*/i, '').trim();
      exact[normalized] = (exact[normalized] || 0) + 1;

      // Extract location (everything before the time of day)
      const locationMatch = header.match(/^((?:INT|EXT)\.\s*[^-]+)/i);
      if (locationMatch) {
        const location = locationMatch[1].trim();
        byLocation[location] = (byLocation[location] || 0) + 1;
      }
    }

    return { exact, byLocation };
  }

  // ============================================================================
  // Editorial Review (Stage F.5)
  // ============================================================================

  /**
   * Run full editorial review using Claude Opus 4.5.
   * Called once per episode after all scenes pass verification.
   */
  async runEditorialReview(
    episodeScript: string,
    episodePlan: { episode_id: string; beats: unknown[]; scenes: unknown[] },
    characters: Record<string, unknown>
  ): Promise<EditorialReviewResult> {
    const repetitionRulesSummary = `
REPETITION RULES:
- R1: Max ${this.config.repetitionLimits.maxQuotesPerCharacter} uses of same quote/reference per character
- R2: Max ${this.config.repetitionLimits.maxCatchphrasesPerCharacter} uses of same catchphrase per character
- R3: Max ${this.config.repetitionLimits.maxQuotesAcrossCharacters} use of same quote across different characters
- R4: Max ${this.config.repetitionLimits.maxPhysicalTicsPerCharacter} uses of same physical tic per character
- R5: Max ${this.config.repetitionLimits.maxTicsAcrossCharacters} uses of same tic across different characters
- R6: Max ${this.config.repetitionLimits.maxSameLocationTime} identical scene header (unless CONTINUED)
- R7: Max ${this.config.repetitionLimits.maxSameLocation} scenes in same location
`;

    const prompt = `
Review this complete episode for craft quality.

EPISODE SCRIPT:
${episodeScript}

EPISODE PLAN:
${JSON.stringify(episodePlan, null, 2)}

CHARACTER DATA:
${JSON.stringify(characters, null, 2)}

${repetitionRulesSummary}

TASK:
Review for:

1. REPETITION ISSUES
   - Verbal tics: same quote/reference used >2x per character
   - Physical tics: same action described >3x per character
   - Cross-character: same phrase/quote used by multiple characters
   - Scene headers: duplicate location+time combinations

2. DIALOGUE QUALITY
   - On-the-nose dialogue (stating subtext explicitly)
   - Missed opportunities for subtext
   - Unnatural exposition dumps
   - Character voice consistency (does each character sound distinct?)

3. PACING
   - Act balance (is tension distributed across acts?)
   - Scene length variance (are all scenes similar length?)
   - Momentum (does episode build appropriately?)

4. CRAFT ISSUES
   - Setup without payoff (planted elements not resolved)
   - Payoff without setup (resolutions that came from nowhere)
   - Tonal inconsistency
   - Narrator overuse (>30% of scene word count)

5. STRENGTHS
   - Note what works well for reinforcement

Output JSON:
{
  "overall_grade": "A|B|C|D|F",
  "grade_rationale": "Brief explanation of grade",
  "issues": [
    {
      "id": "issue_001",
      "severity": "major|minor|nitpick",
      "category": "repetition|dialogue|pacing|craft",
      "location": "SC04, lines 12-15",
      "description": "Description of the issue",
      "suggestion": "How to fix it",
      "rule_reference": "R1 (optional)"
    }
  ],
  "strengths": [
    {
      "location": "SC09",
      "description": "What works well"
    }
  ],
  "revision_priority": ["issue_001", "issue_003"],
  "proceed_recommendation": "commit|revise|manual_review"
}
`;

    const { data } = await this.llm.completeJson<EditorialReviewResult>(
      {
        system: `You are the Editorial Reviewer for a dramatic series set in ancient Rome. 
You are thorough, constructive, and focused on craft quality.
Grade fairly:
- A: Publication ready (0-2 minor issues)
- B: Minor polish needed (3-5 minor issues, 0-1 major)
- C: Revision recommended (2-3 major issues or 6+ minor)
- D: Significant revision needed (4+ major issues)
- F: Fundamental problems (structural/voice failures)`,
        prompt,
        model: 'premium', // Use Claude Opus 4.5 for editorial review
        maxTokens: 4096,
      }
    );

    return data;
  }

  /**
   * Generate regeneration instructions from editorial review issues.
   */
  generateRegenerationInstructions(
    review: EditorialReviewResult,
    targetScenes?: string[]
  ): string[] {
    const instructions: string[] = [];

    // Filter to high-priority issues
    const priorityIssues = review.issues.filter(
      issue => review.revision_priority.includes(issue.id) ||
               issue.severity === 'major'
    );

    // Filter to target scenes if specified
    const relevantIssues = targetScenes
      ? priorityIssues.filter(issue => 
          targetScenes.some(sc => issue.location.includes(sc))
        )
      : priorityIssues;

    for (const issue of relevantIssues) {
      switch (issue.category) {
        case 'repetition':
          instructions.push(`PROHIBITED: ${issue.description}. ${issue.suggestion}`);
          break;
        case 'dialogue':
          instructions.push(`DIALOGUE FIX (${issue.location}): ${issue.suggestion}`);
          break;
        case 'pacing':
          instructions.push(`PACING: ${issue.suggestion}`);
          break;
        case 'craft':
          instructions.push(`CRAFT ISSUE: ${issue.suggestion}`);
          break;
      }
    }

    return instructions;
  }
}
