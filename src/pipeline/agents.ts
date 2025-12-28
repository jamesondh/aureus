/**
 * Agent Proposals (BDI-lite)
 * 
 * Generates move proposals for principal characters based on their
 * Beliefs, Desires, and Intentions.
 */

import type { StateStore } from '../engine/state-store.js';
import type { LLMClient } from '../llm/client.js';
import type { Character } from '../types/world.js';
import type { Operator } from '../types/operators.js';
import type { AgentProposal, AgentMove } from '../types/episode.js';
import { evaluatePrereqs, type EvaluationContext } from '../core/expression-evaluator.js';

// ============================================================================
// Types
// ============================================================================

export interface AgentConfig {
  movesPerAgent: number;
  maxOperatorsToConsider: number;
}

const DEFAULT_CONFIG: AgentConfig = {
  movesPerAgent: 3,
  maxOperatorsToConsider: 15,
};

// ============================================================================
// Agent Proposal Generator
// ============================================================================

export class AgentProposalGenerator {
  private store: StateStore;
  private llm: LLMClient;
  private config: AgentConfig;

  constructor(store: StateStore, llm: LLMClient, config: Partial<AgentConfig> = {}) {
    this.store = store;
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate proposals for all principal characters.
   */
  async generateAllProposals(): Promise<AgentProposal[]> {
    const principals = this.store.getPrincipals();
    
    // Generate proposals in parallel
    const proposals = await Promise.all(
      principals.map(char => this.generateProposal(char))
    );
    
    return proposals;
  }

  /**
   * Generate proposals for a single character.
   */
  async generateProposal(character: Character): Promise<AgentProposal> {
    const operators = this.store.getOperators();

    // 1. Find operators this character can execute
    const eligibleOperators = this.findEligibleOperators(character, operators.operators);

    // 2. Get character context
    const relationships = this.store.getRelationshipsFor(character.id);
    const secrets = this.store.getSecretsKnownBy(character.id);
    const activeThreads = this.store.getOpenThreads();

    // 3. Generate moves via LLM
    const moves = await this.generateMoves(
      character,
      eligibleOperators,
      relationships,
      secrets,
      activeThreads
    );

    return {
      character_id: character.id,
      current_context: {
        location: character.status.location_id,
        active_threads: activeThreads.map(t => t.id),
        recent_events: [], // TODO: Track recent events
      },
      moves,
    };
  }

  /**
   * Find operators this character can execute.
   */
  private findEligibleOperators(
    character: Character,
    operators: Operator[]
  ): Array<{ operator: Operator; possibleTargets: string[] }> {
    const principals = this.store.getPrincipals();
    const eligible: Array<{ operator: Operator; possibleTargets: string[] }> = [];

    for (const op of operators) {
      const possibleTargets: string[] = [];
      const stateForEval = this.store.getWorldState();

      for (const target of principals) {
        if (target.id === character.id) continue;

        const relationship = this.store.getRelationship(character.id, target.id);

          const evalContext: EvaluationContext = {
            actor: character,
            target,
            world: stateForEval.world,
            relationship,
            assets: stateForEval.assets,
            secrets: stateForEval.secrets,
          };

        const result = evaluatePrereqs(op.prereqs, evalContext);
        if (result.allPassed) {
          possibleTargets.push(target.id);
        }
      }

      if (possibleTargets.length > 0) {
        eligible.push({ operator: op, possibleTargets });
      }
    }

    // Limit to top operators by relevance to character's desires
    return eligible.slice(0, this.config.maxOperatorsToConsider);
  }

  /**
   * Generate move proposals via LLM.
   */
  private async generateMoves(
    character: Character,
    eligibleOperators: Array<{ operator: Operator; possibleTargets: string[] }>,
    relationships: Array<{ from: string; to: string; type: string }>,
    secrets: Array<{ id: string; description: string }>,
    activeThreads: Array<{ id: string; question: string }>
  ): Promise<AgentMove[]> {
    if (eligibleOperators.length === 0) {
      return [];
    }

    const operatorSummaries = eligibleOperators.map(e => ({
      id: e.operator.id,
      type: e.operator.type,
      tags: e.operator.tags,
      possible_targets: e.possibleTargets,
      effects_summary: e.operator.effects.map(ef => `${ef.path}: ${ef.op} ${ef.value}`).join(', '),
      risks: e.operator.side_effect_risks?.map(r => r.text),
    }));

    const prompt = `
You are ${character.name} (${character.archetype || 'principal character'}).

YOUR BELIEFS:
${character.bdi.beliefs.map(b => `- ${b.text} (confidence: ${b.confidence})`).join('\n')}

YOUR DESIRES:
${character.bdi.desires.map(d => `- ${d.text} (priority: ${d.priority})`).join('\n')}

YOUR CURRENT INTENTIONS:
${character.bdi.intentions.map(i => `- ${i.operator_id} targeting ${i.target || 'N/A'} (commitment: ${i.commitment})`).join('\n')}

YOUR CONSTRAINTS:
${character.bdi.constraints?.join('\n') || 'None'}

YOUR VOICE TAGS: ${character.voice.tags.join(', ')}

RELATIONSHIPS:
${relationships.map(r => `- ${r.from === character.id ? 'You → ' + r.to : r.from + ' → You'}: ${r.type}`).join('\n')}

SECRETS YOU KNOW:
${secrets.map(s => `- ${s.id}: ${s.description}`).join('\n') || 'None'}

ACTIVE THREADS:
${activeThreads.map(t => `- ${t.question}`).join('\n')}

AVAILABLE OPERATORS (moves you can make):
${JSON.stringify(operatorSummaries, null, 2)}

Based on your personality, desires, and current situation, propose ${this.config.movesPerAgent} moves you want to make this episode.

For each move, explain:
1. Which operator and target
2. Why this aligns with your desires
3. What you expect to happen
4. What risk you're willing to accept
5. How urgent this is (priority 0.0-1.0)

Output JSON:
{
  "moves": [
    {
      "operator_id": "OP_...",
      "target": "char_... or asset_id",
      "rationale": "Why I want to do this, in character voice",
      "expected_deltas": { "path": "expected change" },
      "risk": "What could go wrong",
      "priority": 0.0-1.0
    }
  ]
}
`;

    const { data } = await this.llm.completeJson<{ moves: AgentMove[] }>(
      {
        system: `You are playing the role of ${character.name} in a Roman political drama. Think and respond in character, making strategic choices that align with your beliefs and desires.`,
        prompt,
        model: 'fast', // Use Haiku for proposals
        maxTokens: 2048,
      }
    );

    return data.moves;
  }
}
