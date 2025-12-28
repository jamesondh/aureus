import { z } from 'zod';

// ============================================================================
// Time & Location
// ============================================================================

export const TimeSchema = z.object({
  year_bce: z.number(),
  season: z.enum(['spring', 'summer', 'autumn', 'winter']),
  day: z.number().min(1).max(30),
});

export const VisualDNALocationSchema = z.object({
  architecture: z.string(),
  lighting_default: z.string(),
  atmosphere: z.string(),
  key_props: z.array(z.string()),
});

export const LocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  visual_dna: VisualDNALocationSchema.optional(),
});

export const GlobalMetricsSchema = z.object({
  unrest: z.number().min(0).max(10),
  grain_price_index: z.number(),
  scandal_temperature: z.number().min(0).max(10),
  legal_exposure: z.number().min(0).max(10),
});

export const WorldSchema = z.object({
  world_id: z.string(),
  time: TimeSchema,
  locations: z.array(LocationSchema),
  global: GlobalMetricsSchema,
  extra_templates: z.record(z.string(), z.string()).optional(),
});

export type Time = z.infer<typeof TimeSchema>;
export type VisualDNALocation = z.infer<typeof VisualDNALocationSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type GlobalMetrics = z.infer<typeof GlobalMetricsSchema>;
export type World = z.infer<typeof WorldSchema>;

// ============================================================================
// Factions
// ============================================================================

export const FactionStatsSchema = z.object({
  economic_position: z.number().min(-3).max(3),
  legal_exposure: z.number().min(-3).max(3),
  political_capital: z.number().min(-3).max(3),
  public_narrative: z.number().min(-3).max(3),
});

export const FactionSchema = z.object({
  id: z.string(),
  name: z.string(),
  stats: FactionStatsSchema,
});

export const FactionsFileSchema = z.object({
  factions: z.array(FactionSchema),
});

export type FactionStats = z.infer<typeof FactionStatsSchema>;
export type Faction = z.infer<typeof FactionSchema>;
export type FactionsFile = z.infer<typeof FactionsFileSchema>;

// ============================================================================
// Characters
// ============================================================================

export const CharacterStatsSchema = z.object({
  dignitas: z.number().min(0).max(100),
  auctoritas: z.number().min(0).max(100),
  wealth: z.number().min(0).max(100),
  popularity: z.number().min(0).max(100),
});

export const CharacterStatusSchema = z.object({
  alive: z.boolean(),
  location_id: z.string(),
  injured: z.boolean().optional(),
  wanted: z.boolean().optional(),
  subpoenaed: z.boolean().optional(),
});

export const BeliefSchema = z.object({
  id: z.string(),
  text: z.string(),
  confidence: z.number().min(0).max(1),
});

export const DesireSchema = z.object({
  id: z.string(),
  text: z.string(),
  priority: z.number().min(0).max(1),
});

export const IntentionSchema = z.object({
  id: z.string(),
  operator_id: z.string(),
  commitment: z.number().min(0).max(1),
  target: z.string().optional(),
});

export const BDISchema = z.object({
  beliefs: z.array(BeliefSchema),
  desires: z.array(DesireSchema),
  intentions: z.array(IntentionSchema),
  constraints: z.array(z.string()).optional(),
});

export const VoiceSchema = z.object({
  tags: z.array(z.string()),
  tells: z.array(z.string()).optional(),
});

export const VisualDNACharacterSchema = z.object({
  physical: z.string(),
  costume_default: z.string(),
  distinguishing_marks: z.string().optional(),
  posture_energy: z.string().optional(),
});

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  archetype: z.string().optional(),
  faction_id: z.string().optional(),
  stats: CharacterStatsSchema,
  status: CharacterStatusSchema,
  bdi: BDISchema,
  voice: VoiceSchema,
  visual_dna: VisualDNACharacterSchema.optional(),
});

export const CharactersFileSchema = z.object({
  characters: z.array(CharacterSchema),
});

export type CharacterStats = z.infer<typeof CharacterStatsSchema>;
export type CharacterStatus = z.infer<typeof CharacterStatusSchema>;
export type Belief = z.infer<typeof BeliefSchema>;
export type Desire = z.infer<typeof DesireSchema>;
export type Intention = z.infer<typeof IntentionSchema>;
export type BDI = z.infer<typeof BDISchema>;
export type Voice = z.infer<typeof VoiceSchema>;
export type VisualDNACharacter = z.infer<typeof VisualDNACharacterSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type CharactersFile = z.infer<typeof CharactersFileSchema>;

// ============================================================================
// Relationships
// ============================================================================

export const RelationshipWeightsSchema = z.object({
  loyalty: z.number().min(0).max(100).optional(),
  fear: z.number().min(0).max(100).optional(),
  resentment: z.number().min(0).max(100).optional(),
  respect: z.number().min(0).max(100).optional(),
  dependency: z.number().min(0).max(100).optional(),
});

export const RelationshipSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.enum([
    'adversary',
    'patron_of',
    'client_of',
    'spouse',
    'confidante',
    'nemesis',
    'ally',
  ]),
  weights: RelationshipWeightsSchema,
  flags: z.record(z.string(), z.boolean()).optional(),
});

export const RelationshipsFileSchema = z.object({
  edges: z.array(RelationshipSchema),
});

export type RelationshipWeights = z.infer<typeof RelationshipWeightsSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type RelationshipsFile = z.infer<typeof RelationshipsFileSchema>;

// ============================================================================
// Secrets
// ============================================================================

export const SecretProofSchema = z.object({
  type: z.string(),
  credibility: z.number().min(0).max(1),
  location: z.string().optional(),
});

export const SecretStatsSchema = z.object({
  legal_value: z.number().min(0).max(1),
  public_damage: z.number().min(0).max(1),
  credibility: z.number().min(0).max(1),
});

export const SecretDecaySchema = z.object({
  half_life_episodes: z.number(),
  applies_to: z.array(z.string()),
  last_decayed_episode: z.number(),
});

export const SecretSchema = z.object({
  id: z.string(),
  subject_ids: z.array(z.string()),
  holders: z.array(z.string()),
  description: z.string(),
  proof: SecretProofSchema.optional(),
  stats: SecretStatsSchema,
  decay: SecretDecaySchema,
  status: z.enum(['active', 'revealed', 'inert']),
  narrative_function: z.string().optional(),
});

export const SecretsFileSchema = z.object({
  secrets: z.array(SecretSchema),
});

export type SecretProof = z.infer<typeof SecretProofSchema>;
export type SecretStats = z.infer<typeof SecretStatsSchema>;
export type SecretDecay = z.infer<typeof SecretDecaySchema>;
export type Secret = z.infer<typeof SecretSchema>;
export type SecretsFile = z.infer<typeof SecretsFileSchema>;

// ============================================================================
// Assets
// ============================================================================

export const GrainAssetSchema = z.object({
  inventory_units: z.number(),
  controlled_by: z.array(z.string()),
  warehouse_locations: z.array(z.string()),
});

export const ContractSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.enum(['pending', 'active', 'completed', 'cancelled']),
  stakeholders: z.array(z.string()),
});

export const CashLedgerEntrySchema = z.object({
  holder: z.string(),
  denarii: z.number(),
});

export const NetworkSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  type: z.string(),
  stats: z.object({
    velocity_bonus_days: z.number().optional(),
    reliability: z.number().optional(),
  }),
  upkeep_cost: z.number().optional(),
});

export const OfficeSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  type: z.string(),
  powers: z.array(z.string()),
});

export const AssetsFileSchema = z.object({
  assets: z.object({
    grain: GrainAssetSchema.optional(),
    contracts: z.array(ContractSchema).optional(),
    cash_ledger: z.array(CashLedgerEntrySchema).optional(),
    networks: z.array(NetworkSchema).optional(),
    offices: z.array(OfficeSchema).optional(),
  }),
});

export type GrainAsset = z.infer<typeof GrainAssetSchema>;
export type Contract = z.infer<typeof ContractSchema>;
export type CashLedgerEntry = z.infer<typeof CashLedgerEntrySchema>;
export type Network = z.infer<typeof NetworkSchema>;
export type Office = z.infer<typeof OfficeSchema>;
export type AssetsFile = z.infer<typeof AssetsFileSchema>;

// ============================================================================
// Threads
// ============================================================================

export const ThreadCadenceSchema = z.object({
  max_episodes_without_progress: z.number(),
});

export const ThreadSchema = z.object({
  id: z.string(),
  priority: z.number().min(0).max(1),
  question: z.string(),
  status: z.enum(['open', 'resolved', 'abandoned']),
  advance_cadence: ThreadCadenceSchema,
  last_advanced_episode: z.number(),
  episodes_since_progress: z.number(),
  related_state_paths: z.array(z.string()).optional(),
  related_secrets: z.array(z.string()).optional(),
});

export const ThreadsFileSchema = z.object({
  threads: z.array(ThreadSchema),
});

export type ThreadCadence = z.infer<typeof ThreadCadenceSchema>;
export type Thread = z.infer<typeof ThreadSchema>;
export type ThreadsFile = z.infer<typeof ThreadsFileSchema>;

// ============================================================================
// Constraints
// ============================================================================

export const ConstraintRuleSchema = z.object({
  id: z.string(),
  rule: z.string(),
});

export const ProductionConstraintsSchema = z.object({
  visual_style_prompt: z.string().optional(),
  aspect_ratio: z.string().optional(),
  resolution: z.string().optional(),
  image_format: z.string().optional(),
  default_visual_cadence: z.number().optional(),
});

export const ConstraintsFileSchema = z.object({
  hard_constraints: z.array(ConstraintRuleSchema),
  soft_constraints: z.array(ConstraintRuleSchema),
  production_constraints: ProductionConstraintsSchema.optional(),
});

export type ConstraintRule = z.infer<typeof ConstraintRuleSchema>;
export type ProductionConstraints = z.infer<typeof ProductionConstraintsSchema>;
export type ConstraintsFile = z.infer<typeof ConstraintsFileSchema>;
