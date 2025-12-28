import { z } from 'zod';

// ============================================================================
// Expression Language
// ============================================================================

export const PrereqExpressionSchema = z.object({
  expr: z.string(),
});

export type PrereqExpression = z.infer<typeof PrereqExpressionSchema>;

// ============================================================================
// Effects
// ============================================================================

export const DeltaOperationSchema = z.enum([
  'add',
  'subtract',
  'set',
  'multiply',
  'transfer',
  'append',
  'remove',
]);

export const EffectSchema = z.object({
  path: z.string(),
  op: DeltaOperationSchema,
  value: z.union([z.number(), z.string(), z.boolean(), z.record(z.any())]).optional(),
  // For transfer operations
  from: z.string().optional(),
  to: z.string().optional(),
  denarii: z.number().optional(),
  // For remove operations
  match: z.record(z.any()).optional(),
});

export type DeltaOperation = z.infer<typeof DeltaOperationSchema>;
export type Effect = z.infer<typeof EffectSchema>;

// ============================================================================
// Side Effects
// ============================================================================

export const SideEffectDelaySchema = z.enum([
  'immediate',
  'same_episode',
  'next_episode',
]);

export const SideEffectRiskSchema = z.object({
  id: z.string(),
  text: z.string(),
  prob: z.number().min(0).max(1),
  consequence_operator: z.string().nullable().optional(),
  consequence_delay: SideEffectDelaySchema.optional(),
});

export type SideEffectDelay = z.infer<typeof SideEffectDelaySchema>;
export type SideEffectRisk = z.infer<typeof SideEffectRiskSchema>;

// ============================================================================
// Writer Guidance
// ============================================================================

export const WriterGuidanceSchema = z.object({
  visual_cues: z.string().optional(),
  dialogue_flavor: z.string().optional(),
  success_beat: z.string().optional(),
  fail_beat: z.string().optional(),
});

export const AllowedInventionsSchema = z.object({
  extras: z.number().optional(),
  new_facts: z.number().optional(),
  new_props: z.array(z.string()).optional(),
});

export type WriterGuidance = z.infer<typeof WriterGuidanceSchema>;
export type AllowedInventions = z.infer<typeof AllowedInventionsSchema>;

// ============================================================================
// Operator
// ============================================================================

export const OperatorTypeSchema = z.enum(['thriller', 'soap']);

export const OperatorSchema = z.object({
  id: z.string(),
  type: OperatorTypeSchema,
  tags: z.array(z.string()).optional(),
  prereqs: z.array(PrereqExpressionSchema),
  effects: z.array(EffectSchema),
  side_effect_risks: z.array(SideEffectRiskSchema).optional(),
  scene_suggestions: z.array(z.string()).optional(),
  allowed_inventions: AllowedInventionsSchema.optional(),
  writer_guidance: WriterGuidanceSchema.optional(),
});

export const OperatorsFileSchema = z.object({
  operators: z.array(OperatorSchema),
});

export type OperatorType = z.infer<typeof OperatorTypeSchema>;
export type Operator = z.infer<typeof OperatorSchema>;
export type OperatorsFile = z.infer<typeof OperatorsFileSchema>;

// ============================================================================
// Side Effect Roll (for audit trail)
// ============================================================================

export const SideEffectRollSchema = z.object({
  beat_id: z.string(),
  operator_id: z.string(),
  risk_id: z.string(),
  prob: z.number(),
  roll: z.number(),
  triggered: z.boolean(),
});

export type SideEffectRoll = z.infer<typeof SideEffectRollSchema>;
