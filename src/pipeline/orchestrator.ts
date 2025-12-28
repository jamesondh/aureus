/**
 * Pipeline Orchestrator
 * 
 * Coordinates the full episode generation pipeline (Stages A-H).
 * Handles error recovery, regeneration budgets, and checkpointing.
 */

import { StateStore, type WorldState } from '../engine/state-store.js';
import { Retriever } from '../engine/retriever.js';
import { applyDeltas, expandEffects } from '../engine/delta-engine.js';
import { getLLMClient, type LLMClient } from '../llm/client.js';
import { Director, type PlanningContext } from './director.js';
import { AgentProposalGenerator } from './agents.js';
import { Writer } from './writer.js';
import { Verifier } from './verifier.js';
import type {
  EpisodePlan,
  ScenePacket,
  WriterOutput,
  VerifierReport,
  EpisodeDeltas,
  EpisodeMetrics,
  CliffhangerConstraints,
  AgentProposal,
  BeatInstruction,
  CommittedDelta,
  Beat,
} from '../types/episode.js';
import type { EditorialReviewResult, RepetitionViolation } from './verifier.js';
// Effect type used in delta operations

// ============================================================================
// Types
// ============================================================================

export interface PipelineConfig {
  basePath: string;
  seasonId: string;
  episodeId: string;
  maxSceneRetries: number;
  maxEpisodeRegenerations: number;
  checkpointOnFailure: boolean;
}

export interface PipelineResult {
  success: boolean;
  episodePlan?: EpisodePlan;
  sceneOutputs?: WriterOutput[];
  episodeDeltas?: EpisodeDeltas;
  episodeMetrics?: EpisodeMetrics;
  cliffhangerConstraints?: CliffhangerConstraints;
  editorialReview?: EditorialReviewResult;
  repetitionViolations?: RepetitionViolation[];
  errors?: string[];
  checkpointPath?: string;
}

interface SceneGenerationResult {
  output: WriterOutput;
  report: VerifierReport;
  attempts: number;
}

// ============================================================================
// Pipeline Orchestrator
// ============================================================================

export class PipelineOrchestrator {
  private config: PipelineConfig;
  private store: StateStore;
  private llm: LLMClient;
  private director: Director;
  private agentGenerator: AgentProposalGenerator;
  private writer: Writer;
  private verifier: Verifier;
  private retriever: Retriever;
  
  private stateSnapshot: WorldState | null = null;
  private totalRegenerations = 0;

  constructor(config: PipelineConfig) {
    this.config = config;
    
    this.store = new StateStore({ basePath: config.basePath });
    this.llm = getLLMClient();
    this.retriever = new Retriever(this.store);
    this.director = new Director(this.store, this.llm);
    this.agentGenerator = new AgentProposalGenerator(this.store, this.llm);
    this.writer = new Writer(this.store, this.llm);
    this.verifier = new Verifier(this.store, this.llm);
  }

  /**
   * Run the complete episode generation pipeline.
   */
  async run(): Promise<PipelineResult> {
    const errors: string[] = [];
    
    try {
      console.log(`\n=== Starting Episode ${this.config.episodeId} Generation ===\n`);

      // Stage A: Snapshot
      console.log('Stage A: Loading state snapshot...');
      await this.stageA_Snapshot();
      
      // Stage B: Agent Proposals
      console.log('Stage B: Generating agent proposals...');
      const proposals = await this.stageB_Proposals();
      
      // Stage C: Planning
      console.log('Stage C: Director planning...');
      const plan = await this.stageC_Planning(proposals);
      
      // Stage D: Scene Packets
      console.log('Stage D: Building scene packets...');
      const packets = await this.stageD_Packets(plan);
      
      // Stage E & F: Writing and Verification (per scene)
      console.log('Stages E-F: Writing and verifying scenes...');
      const sceneResults = await this.stagesEF_WriteAndVerify(packets, plan);
      
      // Stage F.5a: Episode-level Repetition Check
      console.log('Stage F.5a: Checking episode-level repetition...');
      const repetitionResult = await this.stageF5a_RepetitionCheck(sceneResults, packets);
      
      if (repetitionResult.blockingViolations.length > 0) {
        console.log(`  Found ${repetitionResult.blockingViolations.length} blocking repetition violations`);
        // For now, log and continue - could trigger regeneration in future
        for (const v of repetitionResult.blockingViolations) {
          console.log(`    [${v.rule}] ${v.pattern}: ${v.count}x (max ${v.threshold})`);
        }
      }
      
      // Stage F.5b: Editorial Review (Claude Opus)
      console.log('Stage F.5b: Running editorial review...');
      const editorialResult = await this.stageF5b_EditorialReview(sceneResults, plan);
      
      console.log(`  Editorial grade: ${editorialResult.overall_grade}`);
      console.log(`  Recommendation: ${editorialResult.proceed_recommendation}`);
      
      // Handle editorial review result
      if (editorialResult.proceed_recommendation === 'revise' || 
          editorialResult.overall_grade === 'D' || 
          editorialResult.overall_grade === 'F') {
        console.log(`  Major issues found - logging for review`);
        const majorIssues = editorialResult.issues.filter(
          (issue: { severity: string }) => issue.severity === 'major'
        );
        for (const issue of majorIssues) {
          console.log(`    [${issue.category}] ${issue.location}: ${issue.description}`);
        }
      }
      
      // Stage G: Repair (if needed)
      // Already handled in stagesEF_WriteAndVerify for scene-level issues
      // Episode-level repair would be triggered here based on editorial review
      
      // Stage H: Commit
      console.log('Stage H: Committing episode...');
      const commitResult = await this.stageH_Commit(plan, sceneResults);
      
      // Save artifacts
      await this.saveArtifacts(plan, sceneResults, packets, commitResult);
      
      console.log(`\n=== Episode ${this.config.episodeId} Complete ===\n`);
      
      return {
        success: true,
        episodePlan: plan,
        sceneOutputs: sceneResults.map(r => r.output),
        episodeDeltas: commitResult.deltas,
        episodeMetrics: commitResult.metrics,
        cliffhangerConstraints: commitResult.cliffhanger,
        editorialReview: editorialResult,
        repetitionViolations: repetitionResult.allViolations,
      };
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      console.error('Pipeline error:', message);
      
      // Checkpoint on failure
      if (this.config.checkpointOnFailure && this.stateSnapshot) {
        const checkpointPath = await this.saveCheckpoint();
        return {
          success: false,
          errors,
          checkpointPath,
        };
      }
      
      return { success: false, errors };
    }
  }

  // ==========================================================================
  // Stage A: Snapshot
  // ==========================================================================

  private async stageA_Snapshot(): Promise<void> {
    await this.store.loadWorldState();
    await this.store.loadOperators();
    this.stateSnapshot = this.store.createSnapshot();
  }

  // ==========================================================================
  // Stage B: Agent Proposals
  // ==========================================================================

  private async stageB_Proposals(): Promise<AgentProposal[]> {
    return this.agentGenerator.generateAllProposals();
  }

  // ==========================================================================
  // Stage C: Planning
  // ==========================================================================

  private async stageC_Planning(proposals: AgentProposal[]): Promise<EpisodePlan> {
    // Load season goals
    const seasonGoals = await this.store.loadSeasonGoals(this.config.seasonId);
    
    // Load cliffhanger constraints from previous episode (if any)
    const prevEpisodeNum = parseInt(this.config.episodeId.replace(/\D/g, '')) - 1;
    const prevEpisodeId = `episode_${String(prevEpisodeNum).padStart(2, '0')}`;
    const cliffhangerConstraints = prevEpisodeNum > 0
      ? await this.store.loadCliffhangerConstraints(this.config.seasonId, prevEpisodeId)
      : null;
    
    // Get thread status
    const urgentThreads = this.store.getUrgentThreads();
    const activeThreads = this.store.getOpenThreads();
    
    const context: PlanningContext = {
      seasonGoals,
      cliffhangerConstraints,
      agentProposals: proposals,
      urgentThreads,
      activeThreads,
    };
    
    return this.director.planEpisode(this.config.episodeId, context);
  }

  // ==========================================================================
  // Stage D: Scene Packets
  // ==========================================================================

  private async stageD_Packets(plan: EpisodePlan): Promise<ScenePacket[]> {
    const packets: ScenePacket[] = [];
    
    for (let i = 0; i < plan.scenes.length; i++) {
      const scene = plan.scenes[i];
      
      // Get beats for this scene
      const sceneBeats = plan.beats.filter(b => scene.beats_included.includes(b.id));
      
      // Build cast list with objectives
      const cast = scene.characters.map(charId => {
        // Find if this character is an actor in any beat
        const actorBeat = sceneBeats.find(b => 
          b.associated_operators.some(op => op.actor_id === charId)
        );
        
        return {
          character_id: charId,
          mood: this.inferMood(charId, sceneBeats),
          active_objective: actorBeat?.required_outcome,
        };
      });
      
      // Extract relevant subgraph
      const subgraph = this.retriever.extractSubgraph(
        scene.characters,
        sceneBeats.map(b => b.primary_thread_id).filter(Boolean) as string[],
        scene.location_id
      );
      
      // Build beat instructions
      const beatSequence: BeatInstruction[] = sceneBeats.flatMap(beat => 
        beat.associated_operators.map(op => ({
          beat_id: beat.id,
          operator_id: op.operator_id,
          actor: op.actor_id,
          target: op.target_id,
          outcome: op.intent === 'pass' ? 'SUCCESS' as const : 'FAIL' as const,
          narrative_directives: {
            action: beat.description,
            beat_resolution: beat.required_outcome,
          },
          required_deltas: this.getRequiredDeltas(op.operator_id),
        }))
      );
      
      // Determine primary beat type for director instructions
      const primaryBeat = sceneBeats[0];
      
      // Build required deltas from operators
      const requiredDeltas = beatSequence.flatMap(bi => bi.required_deltas || []);
      
      const packet: ScenePacket = {
        packet_meta: {
          episode_id: this.config.episodeId,
          scene_id: scene.scene_id,
          sequence: i + 1,
          estimated_duration_min: 2.5,
        },
        setting: {
          location_id: scene.location_id,
          time_of_day: scene.time_of_day,
          atmosphere: scene.pacing_notes ? [scene.pacing_notes] : undefined,
        },
        cast,
        retrieved_subgraph: subgraph,
        director_instructions: {
          beat_type: primaryBeat?.type || 'SETUP',
          pacing: scene.pacing_notes,
          sequence: beatSequence,
        },
        constraints: {
          required_deltas: requiredDeltas.map(d => ({
            path: d.path,
            op: d.op || 'set',
            value: d.value,
            narrative_trigger: d.description,
          })),
          forbidden_facts: scene.constraints?.forbidden_facts,
          allowed_inventions: scene.constraints?.allowed_inventions || { extras: 2 },
          hook_requirement: 'End with a button line that creates anticipation',
        },
      };
      
      packets.push(packet);
    }
    
    return packets;
  }

  private inferMood(characterId: string, beats: Beat[]): string {
    // Check if character is actor or target in any beat
    for (const beat of beats) {
      for (const op of beat.associated_operators) {
        if (op.actor_id === characterId) {
          if (op.intent === 'pass') return 'determined';
          return 'frustrated';
        }
        if (op.target_id === characterId) {
          if (op.intent === 'fail') return 'under_pressure';
          return 'defensive';
        }
      }
    }
    return 'neutral';
  }

  private getRequiredDeltas(operatorId: string): Array<{ path: string; op?: string; value?: unknown; description?: string }> {
    const op = this.store.getOperator(operatorId);
    if (!op) return [];
    
    return op.effects.map(e => ({
      path: e.path,
      op: e.op,
      value: e.value,
      description: `Effect from ${operatorId}`,
    }));
  }

  // ==========================================================================
  // Stages E-F: Write and Verify
  // ==========================================================================

  /**
   * Check if an error is a fatal SDK error that should not be retried.
   */
  private isFatalSDKError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    
    // These errors indicate SDK/infrastructure issues, not scene content issues
    return (
      message.includes('error_max_turns') ||
      message.includes('cli not found') ||
      message.includes('not authenticated') ||
      message.includes('rate limit') ||
      message.includes('api key') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused')
    );
  }

  private async stagesEF_WriteAndVerify(
    packets: ScenePacket[],
    _plan: EpisodePlan
  ): Promise<SceneGenerationResult[]> {
    const results: SceneGenerationResult[] = [];
    
    for (const packet of packets) {
      console.log(`  Writing scene ${packet.packet_meta.scene_id}...`);
      
      let output: WriterOutput;
      let report: VerifierReport;
      let attempts = 0;
      
      while (attempts < this.config.maxSceneRetries) {
        attempts++;
        
        try {
          // Stage E: Write
          output = await this.writer.writeScene(packet);
          
          // Stage F: Verify
          report = await this.verifier.verifyScene(packet, output);
          
          // Check if passed
          if (report.violations.length === 0) {
            // Passed deterministic checks
            if (!report.llm_critic_result || report.llm_critic_result.verdict === 'PASS') {
              // Fully passed
              break;
            }
            
            // Failed LLM critic - try punch-up
            if (!report.llm_critic_result.hook_present) {
              output = await this.writer.punchUpEnding(output, report.fix_instructions);
            }
          } else {
            // Failed deterministic checks
            console.log(`    Attempt ${attempts} failed: ${report.violations[0]?.message}`);
            this.totalRegenerations++;
            
            if (this.totalRegenerations > this.config.maxEpisodeRegenerations) {
              throw new Error(`Exceeded episode regeneration budget (${this.config.maxEpisodeRegenerations})`);
            }
          }
        } catch (error) {
          // Check if this is a fatal SDK error that shouldn't be retried
          if (this.isFatalSDKError(error)) {
            console.error(`  Fatal SDK error on scene ${packet.packet_meta.scene_id}: ${error instanceof Error ? error.message : String(error)}`);
            throw error; // Re-throw immediately, don't retry
          }
          
          // For other errors (e.g., JSON parse failures), retry up to the limit
          console.log(`    Attempt ${attempts} error: ${error instanceof Error ? error.message : String(error)}`);
          if (attempts >= this.config.maxSceneRetries) {
            throw error;
          }
        }
      }
      
      results.push({
        output: output!,
        report: report!,
        attempts,
      });
    }
    
    return results;
  }

  // ==========================================================================
  // Stage F.5a: Episode-Level Repetition Check
  // ==========================================================================

  private async stageF5a_RepetitionCheck(
    sceneResults: SceneGenerationResult[],
    packets: ScenePacket[]
  ): Promise<{
    allViolations: RepetitionViolation[];
    blockingViolations: RepetitionViolation[];
  }> {
    // Compile full episode script
    const fullScript = sceneResults.map(r => r.output.scene_text).join('\n\n---\n\n');
    
    // Extract scene headers from packets
    const sceneHeaders = packets.map(p => {
      const intExt = p.setting.location_id.includes('forum') ? 'EXT' : 'INT';
      const location = p.setting.location_id.replace(/_/g, ' ').toUpperCase();
      const time = (p.setting.time_of_day || 'day').toUpperCase();
      return `${intExt}. ${location} - ${time}`;
    });
    
    // Run repetition checking
    const allViolations = this.verifier.checkRepetition(fullScript, sceneHeaders);
    
    // Filter to blocking violations (FAIL verdict)
    const blockingViolations = allViolations.filter(v => v.verdict === 'FAIL');
    
    return { allViolations, blockingViolations };
  }

  // ==========================================================================
  // Stage F.5b: Editorial Review (Claude Opus)
  // ==========================================================================

  private async stageF5b_EditorialReview(
    sceneResults: SceneGenerationResult[],
    plan: EpisodePlan
  ): Promise<EditorialReviewResult> {
    // Compile full episode script
    const fullScript = sceneResults.map(r => r.output.scene_text).join('\n\n---\n\n');
    
    // Get character data for context
    const characters: Record<string, unknown> = {};
    const state = this.store.getWorldState();
    for (const char of state.characters.characters) {
      characters[char.id] = {
        name: char.name,
        archetype: char.archetype,
        voice: char.voice,
      };
    }
    
    // Run editorial review
    const result = await this.verifier.runEditorialReview(
      fullScript,
      {
        episode_id: plan.episode_id,
        beats: plan.beats,
        scenes: plan.scenes,
      },
      characters
    );
    
    return result;
  }

  // ==========================================================================
  // Stage H: Commit
  // ==========================================================================

  private async stageH_Commit(
    episodePlan: EpisodePlan,
    sceneResults: SceneGenerationResult[]
  ): Promise<{
    deltas: EpisodeDeltas;
    metrics: EpisodeMetrics;
    cliffhanger: CliffhangerConstraints;
  }> {
    const state = this.store.getWorldState();
    const allDeltas: CommittedDelta[] = [];
    
    // Collect deltas from all scene events
    for (const result of sceneResults) {
      for (const event of result.output.scene_events) {
        if (event.delta && event.operator_alignment) {
          // Parse the delta from the event
          const operator = this.store.getOperator(event.operator_alignment);
          if (operator) {
            // Apply operator effects
            const expanded = expandEffects(operator.effects, {
              actorId: 'unknown', // Would need to track this
              targetId: 'unknown',
            });
            
            const batchResult = applyDeltas(state, expanded, result.output.scene_id);
            allDeltas.push(...batchResult.applied);
          }
        }
      }
    }
    
    // Apply secret decay
    this.applySecretDecay(state);
    
    // Build deltas file
    const episodeDeltas: EpisodeDeltas = {
      episode_id: this.config.episodeId,
      deltas: allDeltas,
    };
    
    // Calculate metrics
    const metrics = this.calculateMetrics(episodePlan, sceneResults);
    
    // Extract cliffhanger constraints
    const cliffhanger = this.extractCliffhanger(episodePlan, sceneResults);
    
    // Save updated state
    await this.store.saveWorldState(state);
    
    return { deltas: episodeDeltas, metrics, cliffhanger };
  }

  private applySecretDecay(state: WorldState): void {
    for (const secret of state.secrets.secrets) {
      if (secret.status !== 'active') continue;
      
      const factor = Math.pow(0.5, 1 / secret.decay.half_life_episodes);
      
      for (const statName of secret.decay.applies_to) {
        if (statName in secret.stats) {
          (secret.stats as Record<string, number>)[statName] *= factor;
        }
      }
      
      // Check for inert threshold
      if (secret.stats.legal_value < 0.15 && secret.stats.public_damage < 0.15) {
        secret.status = 'inert';
      }
    }
  }

  private calculateMetrics(
    plan: EpisodePlan,
    _results: SceneGenerationResult[]
  ): EpisodeMetrics {
    // Count beat types
    const beatCounts = {
      reveals: plan.beats.filter(b => b.type === 'REVEAL').length,
      reversals: plan.beats.filter(b => b.type === 'REVERSAL').length,
      confrontations: plan.beats.filter(b => b.type === 'CONFRONTATION').length,
      cliffhangers: plan.beats.filter(b => b.type === 'CLIFFHANGER').length,
    };
    
    // Calculate drama metrics (simplified)
    const state = this.store.getWorldState();
    const tension = Math.min(10, (state.world.global.unrest + state.world.global.scandal_temperature + state.world.global.legal_exposure) / 3);
    const pacing = Math.min(10, (plan.beats.length / 20) * 10);
    const volatility = Math.min(10, (beatCounts.reversals * 2 + beatCounts.confrontations) / 3);
    
    // Track thread progress
    const threadProgress: Record<string, { advanced: boolean; delta: number }> = {};
    for (const thread of this.store.getOpenThreads()) {
      const beatsForThread = plan.beats.filter(b => b.primary_thread_id === thread.id);
      threadProgress[thread.id] = {
        advanced: beatsForThread.length > 0,
        delta: beatsForThread.length,
      };
    }
    
    return {
      episode_id: this.config.episodeId,
      tension,
      pacing,
      volatility,
      thread_progress: threadProgress,
      beat_counts: beatCounts,
    };
  }

  private extractCliffhanger(
    plan: EpisodePlan,
    _results: SceneGenerationResult[]
  ): CliffhangerConstraints {
    const lastBeat = plan.beats[plan.beats.length - 1];
    const lastScene = plan.scenes[plan.scenes.length - 1];
    
    // Determine cliffhanger type based on beat
    let cliffhangerType: 'physical_danger' | 'revelation' | 'social_shame' = 'revelation';
    if (lastBeat.type === 'CLIFFHANGER') {
      const tags = lastBeat.associated_operators.flatMap(op => {
        const operator = this.store.getOperator(op.operator_id);
        return operator?.tags || [];
      });
      
      if (tags.includes('violence') || tags.includes('urgent')) {
        cliffhangerType = 'physical_danger';
      } else if (tags.includes('status') || tags.includes('humiliation')) {
        cliffhangerType = 'social_shame';
      }
    }
    
    const episodeNum = parseInt(this.config.episodeId.replace(/\D/g, ''));
    const nextEpisodeId = `episode_${String(episodeNum + 1).padStart(2, '0')}`;
    
    return {
      source_episode: this.config.episodeId,
      target_episode: nextEpisodeId,
      narrative_state: {
        unresolved_scene_id: lastScene.scene_id,
        cliffhanger_type: cliffhangerType,
      },
      temporal_constraints: {
        must_start_immediately: cliffhangerType === 'physical_danger',
        max_time_skip_allowed: cliffhangerType === 'physical_danger' ? '0 minutes' : '1 day',
      },
      location_constraints: {
        forced_start_location: cliffhangerType === 'physical_danger' ? lastScene.location_id : undefined,
        locked_characters: lastScene.characters,
      },
    };
  }

  // ==========================================================================
  // Save Artifacts
  // ==========================================================================

  private async saveArtifacts(
    plan: EpisodePlan,
    sceneResults: SceneGenerationResult[],
    packets: ScenePacket[],
    commit: { deltas: EpisodeDeltas; metrics: EpisodeMetrics; cliffhanger: CliffhangerConstraints }
  ): Promise<void> {
    const { seasonId, episodeId } = this.config;
    
    // Save episode plan
    await this.store.saveEpisodeArtifact(seasonId, episodeId, 'episode_plan.json', plan);
    
    // Save scene packets (subset - exclude large retrieved_subgraph for storage efficiency)
    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      const packetSubset = {
        packet_meta: packet.packet_meta,
        setting: packet.setting,
        cast: packet.cast,
        director_instructions: packet.director_instructions,
        constraints: packet.constraints,
      };
      await this.store.saveEpisodeArtifact(
        seasonId,
        episodeId,
        `episode_scene_packets/${packet.packet_meta.scene_id}.json`,
        packetSubset
      );
    }
    
    // Compile episode script
    const script = sceneResults.map(r => r.output.scene_text).join('\n\n---\n\n');
    await this.store.saveEpisodeArtifact(seasonId, episodeId, 'episode_script.md', script);
    
    // Save deltas
    await this.store.saveEpisodeArtifact(seasonId, episodeId, 'episode_deltas.json', commit.deltas);
    
    // Save metrics
    await this.store.saveEpisodeArtifact(seasonId, episodeId, 'episode_metrics.json', commit.metrics);
    
    // Save cliffhanger constraints
    await this.store.saveEpisodeArtifact(seasonId, episodeId, 'cliffhanger_constraints.json', commit.cliffhanger);
    
    // Save verifier reports
    const verifierReport = {
      episode_id: episodeId,
      scenes: sceneResults.map(r => ({
        scene_id: r.output.scene_id,
        attempts: r.attempts,
        violations: r.report.violations,
        warnings: r.report.warnings,
      })),
      total_regenerations: this.totalRegenerations,
    };
    await this.store.saveEpisodeArtifact(seasonId, episodeId, 'verifier_report.json', verifierReport);
  }

  private async saveCheckpoint(): Promise<string> {
    const checkpointPath = `checkpoint_${this.config.episodeId}_${Date.now()}.json`;
    await this.store.saveEpisodeArtifact(
      this.config.seasonId,
      this.config.episodeId,
      checkpointPath,
      {
        snapshot: this.stateSnapshot,
        timestamp: new Date().toISOString(),
        regenerations: this.totalRegenerations,
      }
    );
    return checkpointPath;
  }
}
