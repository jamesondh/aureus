/**
 * Aureus: Neuro-Symbolic Narrative Engine
 * 
 * Main entry point and exports.
 */

// Core
export { evaluateExpression, evaluatePrereqs } from './core/expression-evaluator.js';

// Engine
export { StateStore } from './engine/state-store.js';
export { applyDelta, applyDeltas, expandShorthandPath, expandEffects, validateDelta } from './engine/delta-engine.js';
export { Retriever } from './engine/retriever.js';

// LLM
export { LLMClient, getLLMClient } from './llm/client.js';

// Pipeline
export { Director } from './pipeline/director.js';
export { AgentProposalGenerator } from './pipeline/agents.js';
export { Writer } from './pipeline/writer.js';
export { Verifier } from './pipeline/verifier.js';
export { PipelineOrchestrator } from './pipeline/orchestrator.js';

// Types - World
export type {
  World,
  Character,
  Relationship,
  Faction,
  Secret,
  Thread,
  Location,
  BDI,
} from './types/world.js';

// Types - Operators
export type {
  Operator,
  Effect,
  PrereqExpression,
  SideEffectRisk,
} from './types/operators.js';

// Types - Episode
export type {
  EpisodePlan,
  Beat,
  Scene,
  ScenePacket,
  WriterOutput,
  VerifierReport,
  AgentProposal,
  CliffhangerConstraints,
} from './types/episode.js';
