import { z } from 'zod';
import { EffectSchema, SideEffectRollSchema } from './operators.js';

// ============================================================================
// Beat Types
// ============================================================================

export const BeatTypeSchema = z.enum([
  'SETUP',
  'REVEAL',
  'REVERSAL',
  'CONFRONTATION',
  'DECISION',
  'CLIFFHANGER',
]);

export type BeatType = z.infer<typeof BeatTypeSchema>;

// ============================================================================
// Associated Operator (in beats)
// ============================================================================

export const AssociatedOperatorSchema = z.object({
  operator_id: z.string(),
  actor_id: z.string(),
  target_id: z.string().optional(),
  intent: z.enum(['pass', 'fail']),
});

export type AssociatedOperator = z.infer<typeof AssociatedOperatorSchema>;

// ============================================================================
// Beat
// ============================================================================

export const BeatSchema = z.object({
  id: z.string(),
  type: BeatTypeSchema,
  description: z.string(),
  primary_thread_id: z.string().optional(),
  associated_operators: z.array(AssociatedOperatorSchema),
  emotional_value: z.object({
    tension_delta: z.number().optional(),
    hope_delta: z.number().optional(),
  }).optional(),
  required_outcome: z.string().optional(),
  triggered_side_effects: z.array(z.string()).optional(),
});

export type Beat = z.infer<typeof BeatSchema>;

// ============================================================================
// Scene
// ============================================================================

export const SceneConstraintsSchema = z.object({
  must_include_prop: z.string().optional(),
  max_length_words: z.number().optional(),
  forbidden_facts: z.array(z.string()).optional(),
  allowed_inventions: z.object({
    extras: z.number().optional(),
    new_props: z.array(z.string()).optional(),
  }).optional(),
  hook_requirement: z.string().optional(),
});

export const SceneSchema = z.object({
  scene_id: z.string(),
  slug: z.string(),
  location_id: z.string(),
  time_of_day: z.string().optional(),
  characters: z.array(z.string()),
  beats_included: z.array(z.string()),
  pacing_notes: z.string().optional(),
  constraints: SceneConstraintsSchema.optional(),
  transition_out: z.string().optional(),
});

export type SceneConstraints = z.infer<typeof SceneConstraintsSchema>;
export type Scene = z.infer<typeof SceneSchema>;

// ============================================================================
// Episode Plan
// ============================================================================

export const EpisodePlanSchema = z.object({
  episode_id: z.string(),
  objectives: z.record(z.string(), z.string()),
  beats: z.array(BeatSchema),
  scenes: z.array(SceneSchema),
  acceptance_checks: z.array(z.string()).optional(),
  side_effect_rolls: z.array(SideEffectRollSchema).optional(),
});

export type EpisodePlan = z.infer<typeof EpisodePlanSchema>;

// ============================================================================
// Scene Packet (input to Writer)
// ============================================================================

export const CastMemberSchema = z.object({
  character_id: z.string(),
  mood: z.string().optional(),
  active_objective: z.string().optional(),
});

export const NarrativeDirectiveSchema = z.object({
  action: z.string(),
  beat_resolution: z.string().optional(),
});

export const BeatInstructionSchema = z.object({
  beat_id: z.string(),
  operator_id: z.string(),
  actor: z.string(),
  target: z.string().optional(),
  outcome: z.enum(['SUCCESS', 'FAIL']),
  narrative_directives: NarrativeDirectiveSchema.optional(),
  required_deltas: z.array(z.object({
    path: z.string(),
    op: z.string().optional(),
    change: z.string().optional(),
    value: z.any().optional(),
    description: z.string().optional(),
  })).optional(),
});

export const DirectorInstructionsSchema = z.object({
  beat_type: BeatTypeSchema,
  pacing: z.string().optional(),
  conflict: z.string().optional(),
  sequence: z.array(BeatInstructionSchema),
});

export const RetrievedSubgraphSchema = z.object({
  note: z.string().optional(),
  relationships: z.array(z.object({
    source: z.string(),
    target: z.string(),
    type: z.string(),
    dynamic: z.string().optional(),
    weights: z.record(z.number()).optional(),
  })),
  relevant_assets: z.array(z.object({
    id: z.string(),
    status: z.string().optional(),
    context: z.string().optional(),
  })).optional(),
  relevant_beliefs: z.array(z.object({
    holder: z.string(),
    text: z.string(),
  })).optional(),
  relevant_secrets: z.array(z.object({
    id: z.string(),
    holders: z.array(z.string()),
    summary: z.string(),
  })).optional(),
});

export const ScenePacketSchema = z.object({
  packet_meta: z.object({
    episode_id: z.string(),
    scene_id: z.string(),
    sequence: z.number(),
    estimated_duration_min: z.number().optional(),
  }),
  setting: z.object({
    location_id: z.string(),
    location_name: z.string().optional(),
    time_of_day: z.string().optional(),
    atmosphere: z.array(z.string()).optional(),
    weather: z.string().optional(),
  }),
  cast: z.array(CastMemberSchema),
  retrieved_subgraph: RetrievedSubgraphSchema,
  director_instructions: DirectorInstructionsSchema,
  constraints: z.object({
    required_deltas: z.array(z.object({
      path: z.string(),
      op: z.string(),
      value: z.any(),
      narrative_trigger: z.string().optional(),
    })).optional(),
    forbidden_facts: z.array(z.string()).optional(),
    allowed_inventions: z.object({
      extras: z.number().optional(),
      new_props: z.array(z.string()).optional(),
    }).optional(),
    hook_requirement: z.string().optional(),
  }).optional(),
});

export type CastMember = z.infer<typeof CastMemberSchema>;
export type NarrativeDirective = z.infer<typeof NarrativeDirectiveSchema>;
export type BeatInstruction = z.infer<typeof BeatInstructionSchema>;
export type DirectorInstructions = z.infer<typeof DirectorInstructionsSchema>;
export type RetrievedSubgraph = z.infer<typeof RetrievedSubgraphSchema>;
export type ScenePacket = z.infer<typeof ScenePacketSchema>;

// ============================================================================
// Writer Output
// ============================================================================

export const ClaimSchema = z.object({
  type: z.string(),
  subject: z.string().optional(),
  content: z.string(),
  source_character: z.string().optional(),
});

export const SceneEventSchema = z.object({
  event: z.string(),
  operator_alignment: z.string().optional(),
  outcome: z.enum(['SUCCESS', 'FAIL']).optional(),
  delta: z.string().optional(),
});

export const WriterOutputSchema = z.object({
  scene_id: z.string(),
  scene_text: z.string(),
  claims: z.array(ClaimSchema),
  scene_events: z.array(SceneEventSchema),
});

export type Claim = z.infer<typeof ClaimSchema>;
export type SceneEvent = z.infer<typeof SceneEventSchema>;
export type WriterOutput = z.infer<typeof WriterOutputSchema>;

// ============================================================================
// Episode Deltas
// ============================================================================

export const CommittedDeltaSchema = EffectSchema.extend({
  reason: z.string().optional(),
  scene_id: z.string().optional(),
});

export const EpisodeDeltasSchema = z.object({
  episode_id: z.string(),
  deltas: z.array(CommittedDeltaSchema),
});

export type CommittedDelta = z.infer<typeof CommittedDeltaSchema>;
export type EpisodeDeltas = z.infer<typeof EpisodeDeltasSchema>;

// ============================================================================
// Episode Metrics
// ============================================================================

export const ThreadProgressSchema = z.object({
  advanced: z.boolean(),
  delta: z.number().optional(),
});

export const EpisodeMetricsSchema = z.object({
  episode_id: z.string(),
  tension: z.number().min(0).max(10),
  pacing: z.number().min(0).max(10),
  volatility: z.number().min(0).max(10),
  thread_progress: z.record(z.string(), ThreadProgressSchema),
  beat_counts: z.object({
    reveals: z.number(),
    reversals: z.number(),
    confrontations: z.number(),
    cliffhangers: z.number(),
  }),
});

export type ThreadProgress = z.infer<typeof ThreadProgressSchema>;
export type EpisodeMetrics = z.infer<typeof EpisodeMetricsSchema>;

// ============================================================================
// Cliffhanger Constraints
// ============================================================================

export const CliffhangerConstraintsSchema = z.object({
  source_episode: z.string(),
  target_episode: z.string(),
  narrative_state: z.object({
    unresolved_scene_id: z.string(),
    cliffhanger_type: z.enum(['physical_danger', 'revelation', 'social_shame']),
  }),
  temporal_constraints: z.object({
    must_start_immediately: z.boolean(),
    max_time_skip_allowed: z.string().optional(),
  }),
  location_constraints: z.object({
    forced_start_location: z.string().optional(),
    locked_characters: z.array(z.string()).optional(),
  }).optional(),
  mandatory_opening_beat: z.object({
    description: z.string(),
    allowed_resolutions: z.array(z.string()).optional(),
  }).optional(),
  pending_consequences: z.array(z.object({
    operator_id: z.string(),
    from_beat_id: z.string(),
    risk_id: z.string(),
  })).optional(),
});

export type CliffhangerConstraints = z.infer<typeof CliffhangerConstraintsSchema>;

// ============================================================================
// Verifier Report
// ============================================================================

export const ViolationSchema = z.object({
  type: z.enum(['hard_constraint', 'soft_constraint', 'delta_missing', 'schema_error']),
  rule: z.string().optional(),
  message: z.string(),
  scene_id: z.string().optional(),
});

export const VerifierReportSchema = z.object({
  scene_id: z.string(),
  deterministic_checks: z.object({
    json_valid: z.boolean(),
    invariants_passed: z.boolean(),
    prereqs_satisfied: z.boolean(),
    accounting_balanced: z.boolean(),
    claims_within_limits: z.boolean(),
    required_deltas_covered: z.boolean(),
  }),
  llm_critic_result: z.object({
    verdict: z.enum(['PASS', 'FAIL']),
    plan_compliance: z.boolean(),
    hook_present: z.boolean(),
    notes: z.string().optional(),
  }).optional(),
  violations: z.array(ViolationSchema),
  warnings: z.array(ViolationSchema),
  fix_instructions: z.array(z.string()),
});

export type Violation = z.infer<typeof ViolationSchema>;
export type VerifierReport = z.infer<typeof VerifierReportSchema>;

// ============================================================================
// Agent Proposal
// ============================================================================

export const AgentMoveSchema = z.object({
  operator_id: z.string(),
  target: z.string().optional(),
  rationale: z.string(),
  expected_deltas: z.record(z.string(), z.any()),
  risk: z.string().optional(),
  priority: z.number().min(0).max(1),
});

export const AgentProposalSchema = z.object({
  character_id: z.string(),
  current_context: z.object({
    location: z.string(),
    active_threads: z.array(z.string()).optional(),
    recent_events: z.array(z.string()).optional(),
  }).optional(),
  moves: z.array(AgentMoveSchema),
});

export type AgentMove = z.infer<typeof AgentMoveSchema>;
export type AgentProposal = z.infer<typeof AgentProposalSchema>;

// ============================================================================
// Season Goals
// ============================================================================

export const SeasonGoalsSchema = z.object({
  season_id: z.string(),
  arc_description: z.string(),
  faction_goals: z.record(z.string(), z.string()),
  major_threads: z.array(z.string()),
  target_episodes: z.number(),
});

export type SeasonGoals = z.infer<typeof SeasonGoalsSchema>;

// ============================================================================
// Editorial Review (Stage F.5)
// ============================================================================

export const EditorialIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(['major', 'minor', 'nitpick']),
  category: z.enum(['repetition', 'dialogue', 'pacing', 'craft']),
  location: z.string(),
  description: z.string(),
  suggestion: z.string(),
  rule_reference: z.string().optional(),
});

export const EditorialReviewSchema = z.object({
  overall_grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  grade_rationale: z.string(),
  issues: z.array(EditorialIssueSchema),
  strengths: z.array(z.object({
    location: z.string(),
    description: z.string(),
  })),
  revision_priority: z.array(z.string()),
  proceed_recommendation: z.enum(['commit', 'revise', 'manual_review']),
});

export type EditorialIssue = z.infer<typeof EditorialIssueSchema>;
export type EditorialReview = z.infer<typeof EditorialReviewSchema>;

// ============================================================================
// Repetition Violation (§9.5)
// ============================================================================

export const RepetitionViolationSchema = z.object({
  rule: z.enum(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']),
  character_id: z.string().optional(),
  pattern: z.string(),
  count: z.number(),
  threshold: z.number(),
  verdict: z.enum(['WARNING', 'FAIL']),
  fix_instruction: z.string(),
});

export type RepetitionViolation = z.infer<typeof RepetitionViolationSchema>;
