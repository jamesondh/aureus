/**
 * Director
 * 
 * The Director is responsible for episode planning:
 * - Selecting operators based on agent proposals
 * - Creating the beat sheet
 * - Organizing beats into scenes
 * - Resolving side effects
 */

import type { StateStore } from '../engine/state-store.js';
import type { LLMClient } from '../llm/client.js';
import type { Operator, SideEffectRoll } from '../types/operators.js';
import type { 
  EpisodePlan, 
  Beat, 
  Scene, 
  AgentProposal,
  SeasonGoals,
  CliffhangerConstraints,
  BeatType,
} from '../types/episode.js';
import type { Thread } from '../types/world.js';
import { evaluatePrereqs, type EvaluationContext } from '../core/expression-evaluator.js';

// ============================================================================
// Types
// ============================================================================

export interface DirectorConfig {
  minThrillerOps: number;
  maxThrillerOps: number;
  minSoapOps: number;
  maxSoapOps: number;
  targetSceneCount: number;
  maxPlanningRetries: number;
}

const DEFAULT_CONFIG: DirectorConfig = {
  minThrillerOps: 10,
  maxThrillerOps: 14,
  minSoapOps: 6,
  maxSoapOps: 10,
  targetSceneCount: 20,
  maxPlanningRetries: 3,
};

export interface PlanningContext {
  seasonGoals: SeasonGoals;
  cliffhangerConstraints: CliffhangerConstraints | null;
  agentProposals: AgentProposal[];
  urgentThreads: Thread[];
  activeThreads: Thread[];
}

// ============================================================================
// Director
// ============================================================================

export class Director {
  private store: StateStore;
  private llm: LLMClient;
  private config: DirectorConfig;

  constructor(store: StateStore, llm: LLMClient, config: Partial<DirectorConfig> = {}) {
    this.store = store;
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Plan an episode given the current context.
   */
  async planEpisode(
    episodeId: string,
    context: PlanningContext
  ): Promise<EpisodePlan> {
    const operators = this.store.getOperators();

    // 1. Filter eligible operators based on prerequisites
    const eligibleOperators = this.filterEligibleOperators(operators.operators, context);

    // 2. Select operators from proposals + add required ones
    const selectedOperators = this.selectOperators(eligibleOperators, context);

    // 3. Roll for side effects
    const sideEffectRolls = this.rollSideEffects(selectedOperators);

    // 4. Generate beat sheet via LLM
    const beats = await this.generateBeatSheet(episodeId, selectedOperators, sideEffectRolls, context);

    // 5. Organize beats into scenes via LLM
    const scenes = await this.organizeScenes(episodeId, beats, context);

    // 6. Build the episode plan
    const plan: EpisodePlan = {
      episode_id: episodeId,
      objectives: this.extractObjectives(context),
      beats,
      scenes,
      acceptance_checks: [
        'At least 2 threads advanced',
        'No more than 1 thread fully resolved',
        'Contains REVEAL, REVERSAL, CONFRONTATION, CLIFFHANGER',
      ],
      side_effect_rolls: sideEffectRolls,
    };

    // 7. Validate the plan
    const validation = this.validatePlan(plan);
    if (!validation.valid) {
      console.warn('Plan validation warnings:', validation.warnings);
    }

    return plan;
  }

  /**
   * Filter operators to only those with satisfied prerequisites.
   */
  private filterEligibleOperators(
    operators: Operator[],
    _context: PlanningContext
  ): Operator[] {
    // Note: _context reserved for future context-based filtering
    const principals = this.store.getPrincipals();
    
    return operators.filter(op => {
      // Check if any principal can execute this operator
      for (const actor of principals) {
        // Build evaluation context for each potential actor-target pair
        for (const target of principals) {
          if (actor.id === target.id) continue;
          
          const stateForEval = this.store.getWorldState();
          const relationship = this.store.getRelationship(actor.id, target.id);
          
          const evalContext: EvaluationContext = {
            actor,
            target,
            world: stateForEval.world,
            relationship,
            assets: stateForEval.assets,
            secrets: stateForEval.secrets,
          };
          
          const result = evaluatePrereqs(op.prereqs, evalContext);
          if (result.allPassed) {
            return true;
          }
        }
      }
      return false;
    });
  }

  /**
   * Select operators for the episode based on proposals and requirements.
   */
  private selectOperators(
    eligible: Operator[],
    context: PlanningContext
  ): Array<{ operator: Operator; actorId: string; targetId?: string; fromProposal: boolean }> {
    const selected: Array<{ operator: Operator; actorId: string; targetId?: string; fromProposal: boolean }> = [];
    
    // Track counts by type
    let thrillerCount = 0;
    let soapCount = 0;

    // 1. Add operators from high-priority proposals
    for (const proposal of context.agentProposals) {
      for (const move of proposal.moves) {
        if (move.priority < 0.5) continue;
        
        const op = eligible.find(o => o.id === move.operator_id);
        if (!op) continue;

        // Check type limits
        if (op.type === 'thriller' && thrillerCount >= this.config.maxThrillerOps) continue;
        if (op.type === 'soap' && soapCount >= this.config.maxSoapOps) continue;

        selected.push({
          operator: op,
          actorId: proposal.character_id,
          targetId: move.target,
          fromProposal: true,
        });

        if (op.type === 'thriller') thrillerCount++;
        else soapCount++;
      }
    }

    // 2. Fill remaining slots to meet minimums
    const allPrincipals = this.store.getPrincipals();
    
    while (thrillerCount < this.config.minThrillerOps) {
      const thrillerOps = eligible.filter(
        o => o.type === 'thriller' && !selected.some(s => s.operator.id === o.id)
      );
      if (thrillerOps.length === 0) break;
      
      const op = thrillerOps[Math.floor(Math.random() * thrillerOps.length)];
      const actor = allPrincipals[Math.floor(Math.random() * allPrincipals.length)];
      const targets = allPrincipals.filter(p => p.id !== actor.id);
      const target = targets[Math.floor(Math.random() * targets.length)];
      
      selected.push({
        operator: op,
        actorId: actor.id,
        targetId: target?.id,
        fromProposal: false,
      });
      thrillerCount++;
    }

    while (soapCount < this.config.minSoapOps) {
      const soapOps = eligible.filter(
        o => o.type === 'soap' && !selected.some(s => s.operator.id === o.id)
      );
      if (soapOps.length === 0) break;
      
      const op = soapOps[Math.floor(Math.random() * soapOps.length)];
      const actor = allPrincipals[Math.floor(Math.random() * allPrincipals.length)];
      const targets = allPrincipals.filter(p => p.id !== actor.id);
      const target = targets[Math.floor(Math.random() * targets.length)];
      
      selected.push({
        operator: op,
        actorId: actor.id,
        targetId: target?.id,
        fromProposal: false,
      });
      soapCount++;
    }

    return selected;
  }

  /**
   * Roll for side effects during planning.
   */
  private rollSideEffects(
    selectedOps: Array<{ operator: Operator; actorId: string; targetId?: string }>
  ): SideEffectRoll[] {
    const rolls: SideEffectRoll[] = [];
    
    for (let i = 0; i < selectedOps.length; i++) {
      const { operator } = selectedOps[i];
      const beatId = `b_${String(i + 1).padStart(2, '0')}`;
      
      if (!operator.side_effect_risks) continue;
      
      for (const risk of operator.side_effect_risks) {
        const roll = Math.random();
        rolls.push({
          beat_id: beatId,
          operator_id: operator.id,
          risk_id: risk.id,
          prob: risk.prob,
          roll,
          triggered: roll < risk.prob,
        });
      }
    }
    
    return rolls;
  }

  /**
   * Generate the beat sheet via LLM.
   */
  private async generateBeatSheet(
    episodeId: string,
    selectedOps: Array<{ operator: Operator; actorId: string; targetId?: string; fromProposal: boolean }>,
    sideEffectRolls: SideEffectRoll[],
    context: PlanningContext
  ): Promise<Beat[]> {
    // Note: state reserved for future state-based beat generation
    
    // Build prompt context
    const operatorSummaries = selectedOps.map((s, i) => ({
      index: i,
      operator_id: s.operator.id,
      type: s.operator.type,
      actor: s.actorId,
      target: s.targetId,
      tags: s.operator.tags,
      guidance: s.operator.writer_guidance,
    }));

    const triggeredSideEffects = sideEffectRolls.filter(r => r.triggered);
    
    const threadSummaries = context.activeThreads.map(t => ({
      id: t.id,
      question: t.question,
      priority: t.priority,
      urgent: t.episodes_since_progress >= t.advance_cadence.max_episodes_without_progress,
    }));

    const prompt = `
You are planning Episode ${episodeId}.

SEASON GOALS:
${JSON.stringify(context.seasonGoals, null, 2)}

${context.cliffhangerConstraints ? `CLIFFHANGER FROM PREVIOUS EPISODE:
${JSON.stringify(context.cliffhangerConstraints, null, 2)}` : 'This is the first episode or no cliffhanger constraints.'}

ACTIVE THREADS (must advance at least 2):
${JSON.stringify(threadSummaries, null, 2)}

SELECTED OPERATORS (assign to beats):
${JSON.stringify(operatorSummaries, null, 2)}

TRIGGERED SIDE EFFECTS (must be incorporated):
${JSON.stringify(triggeredSideEffects, null, 2)}

REQUIREMENTS:
- Create 16-24 beats
- Include exactly: 1 REVEAL, 1 REVERSAL, 1 CONFRONTATION, 1 CLIFFHANGER (last beat)
- CLIFFHANGER must be the final beat
- Each beat references 1-2 operators
- Assign intent (pass/fail) to each operator
- Distribute beats across 3 acts roughly evenly

Output a JSON array of beats with this structure:
{
  "beats": [
    {
      "id": "b_01",
      "type": "SETUP|REVEAL|REVERSAL|CONFRONTATION|DECISION|CLIFFHANGER",
      "description": "Brief description of what happens",
      "primary_thread_id": "thread_id or null",
      "associated_operators": [
        { "operator_id": "OP_...", "actor_id": "char_...", "target_id": "char_...", "intent": "pass|fail" }
      ],
      "emotional_value": { "tension_delta": -2 to 2, "hope_delta": -2 to 2 },
      "required_outcome": "What must happen in this beat"
    }
  ]
}
`;

    const { data } = await this.llm.completeJson<{ beats: Beat[] }>(
      {
        system: 'You are the Director for a Roman political drama. Create compelling, well-structured beat sheets.',
        prompt,
        model: 'standard',
        maxTokens: 4096,
      }
    );

    return data.beats;
  }

  /**
   * Organize beats into scenes via LLM.
   */
  private async organizeScenes(
    episodeId: string,
    beats: Beat[],
    _context: PlanningContext
  ): Promise<Scene[]> {
    // Note: _context reserved for future context-based scene organization
    const worldState = this.store.getWorldState();
    const locations = worldState.world.locations.map(l => ({ id: l.id, name: l.name }));

    const prompt = `
Given these beats for Episode ${episodeId}:
${JSON.stringify(beats, null, 2)}

And these available locations:
${JSON.stringify(locations, null, 2)}

Organize the beats into ${this.config.targetSceneCount} scenes.

Rules:
- Each scene should have 1-3 beats
- Consecutive beats in the same location can share a scene
- Confrontation beats often work as single-beat scenes
- The final scene contains only the CLIFFHANGER beat

Output JSON:
{
  "scenes": [
    {
      "scene_id": "SC01",
      "slug": "INT. LOCATION_NAME - TIME_OF_DAY",
      "location_id": "location_id",
      "time_of_day": "dawn|morning|noon|afternoon|evening|night|late_night",
      "characters": ["char_id_1", "char_id_2"],
      "beats_included": ["b_01", "b_02"],
      "pacing_notes": "Brief note on scene pacing",
      "transition_out": "Cut to..."
    }
  ]
}
`;

    const { data } = await this.llm.completeJson<{ scenes: Scene[] }>(
      {
        system: 'You are organizing a dramatic episode into scenes. Create natural groupings with good pacing.',
        prompt,
        model: 'standard',
        maxTokens: 4096,
      }
    );

    return data.scenes;
  }

  /**
   * Extract faction objectives from context.
   */
  private extractObjectives(context: PlanningContext): Record<string, string> {
    return context.seasonGoals.faction_goals;
  }

  /**
   * Validate the generated plan.
   */
  private validatePlan(plan: EpisodePlan): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // Check beat type requirements
    const beatTypes = new Map<BeatType, number>();
    for (const beat of plan.beats) {
      beatTypes.set(beat.type, (beatTypes.get(beat.type) || 0) + 1);
    }

    if (!beatTypes.has('REVEAL')) warnings.push('Missing REVEAL beat');
    if (!beatTypes.has('REVERSAL')) warnings.push('Missing REVERSAL beat');
    if (!beatTypes.has('CONFRONTATION')) warnings.push('Missing CONFRONTATION beat');
    if (!beatTypes.has('CLIFFHANGER')) warnings.push('Missing CLIFFHANGER beat');

    // Check cliffhanger is last
    if (plan.beats.length > 0 && plan.beats[plan.beats.length - 1].type !== 'CLIFFHANGER') {
      warnings.push('CLIFFHANGER is not the final beat');
    }

    // Check scene count
    if (plan.scenes.length < 16 || plan.scenes.length > 24) {
      warnings.push(`Scene count ${plan.scenes.length} is outside target range 16-24`);
    }

    // Check all beats are assigned to scenes
    const assignedBeats = new Set(plan.scenes.flatMap(s => s.beats_included));
    for (const beat of plan.beats) {
      if (!assignedBeats.has(beat.id)) {
        warnings.push(`Beat ${beat.id} is not assigned to any scene`);
      }
    }

    return {
      valid: warnings.length === 0,
      warnings,
    };
  }
}
