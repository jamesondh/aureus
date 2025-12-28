/**
 * Delta Engine
 * 
 * Handles applying state changes (deltas) to the world state.
 * Supports: add, subtract, set, multiply, transfer, append, remove operations.
 * All paths are absolute and map to the repository structure.
 */

import type { WorldState } from './state-store.js';
import type { Effect, DeltaOperation } from '../types/operators.js';
import type { CommittedDelta } from '../types/episode.js';

// ============================================================================
// Types
// ============================================================================

export interface DeltaResult {
  success: boolean;
  error?: string;
  appliedDelta?: CommittedDelta;
}

export interface BatchDeltaResult {
  success: boolean;
  applied: CommittedDelta[];
  failed: Array<{ delta: Effect; error: string }>;
}

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Resolves a dot-separated path to the containing object and final key.
 * Returns { parent, key } where parent[key] is the target.
 */
function resolvePath(
  state: WorldState,
  path: string
): { parent: Record<string, unknown>; key: string } | null {
  const parts = path.split('.');
  
  if (parts.length < 2) {
    return null;
  }
  
  const rootKey = parts[0];
  const propertyPath = parts.slice(1);
  
  // Map root to state property
  let root: unknown;
  switch (rootKey) {
    case 'world':
      root = state.world;
      break;
    case 'characters':
      root = state.characters;
      break;
    case 'relationships':
      root = state.relationships;
      break;
    case 'assets':
      root = state.assets;
      break;
    case 'secrets':
      root = state.secrets;
      break;
    case 'threads':
      root = state.threads;
      break;
    case 'factions':
      root = state.factions;
      break;
    case 'constraints':
      root = state.constraints;
      break;
    default:
      return null;
  }
  
  // Navigate to parent of final key
  let current = root as Record<string, unknown>;
  for (let i = 0; i < propertyPath.length - 1; i++) {
    const part = propertyPath[i];
    
    // Handle array access in path
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const propName = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      const arr = current[propName];
      if (!Array.isArray(arr) || index >= arr.length) {
        return null;
      }
      current = arr[index] as Record<string, unknown>;
    } else {
      // Find by ID in arrays (characters.char_varo -> characters.characters[id=char_varo])
      if (Array.isArray(current[part])) {
        current = current[part] as unknown as Record<string, unknown>;
      } else if (current[part] !== undefined) {
        current = current[part] as Record<string, unknown>;
      } else {
        // Try to find by ID in parent array
        if (Array.isArray(current)) {
          const item = current.find((c: Record<string, unknown>) => c.id === part);
          if (item) {
            current = item;
          } else {
            return null;
          }
        } else {
          return null;
        }
      }
    }
  }
  
  const finalKey = propertyPath[propertyPath.length - 1];
  return { parent: current, key: finalKey };
}

/**
 * Extended path resolution that handles entity IDs in the path.
 * Example: characters.char_varo.stats.wealth
 */
function resolveEntityPath(
  state: WorldState,
  path: string
): { parent: Record<string, unknown>; key: string } | null {
  const parts = path.split('.');
  
  if (parts.length < 2) {
    return null;
  }
  
  const rootKey = parts[0];
  
  // Get the root collection
  let root: unknown;
  let collection: string | null = null;
  
  switch (rootKey) {
    case 'world':
      root = state.world;
      break;
    case 'characters':
      root = state.characters.characters;
      collection = 'characters';
      break;
    case 'relationships':
      root = state.relationships.edges;
      collection = 'edges';
      break;
    case 'assets':
      root = state.assets.assets;
      break;
    case 'secrets':
      root = state.secrets.secrets;
      collection = 'secrets';
      break;
    case 'threads':
      root = state.threads.threads;
      collection = 'threads';
      break;
    case 'factions':
      root = state.factions.factions;
      collection = 'factions';
      break;
    case 'constraints':
      root = state.constraints;
      break;
    default:
      return null;
  }
  
  // If it's a collection type, the second part is likely an ID
  if (collection && Array.isArray(root) && parts.length >= 3) {
    const entityId = parts[1];
    const entity = root.find((item: Record<string, unknown>) => item.id === entityId);
    
    if (!entity) {
      return null;
    }
    
    // Navigate from entity to target
    let current = entity as Record<string, unknown>;
    for (let i = 2; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined) {
        return null;
      }
      current = current[part] as Record<string, unknown>;
    }
    
    return { parent: current, key: parts[parts.length - 1] };
  }
  
  // Fall back to standard path resolution
  return resolvePath(state, path);
}

// ============================================================================
// Delta Operations
// ============================================================================

function applyOperation(
  parent: Record<string, unknown>,
  key: string,
  op: DeltaOperation,
  value: unknown,
  delta: Effect
): void {
  const current = parent[key];
  
  switch (op) {
    case 'set':
      parent[key] = value;
      break;
      
    case 'add':
      if (typeof current !== 'number' || typeof value !== 'number') {
        throw new Error(`'add' requires numeric values, got ${typeof current} and ${typeof value}`);
      }
      parent[key] = current + value;
      break;
      
    case 'subtract':
      if (typeof current !== 'number' || typeof value !== 'number') {
        throw new Error(`'subtract' requires numeric values, got ${typeof current} and ${typeof value}`);
      }
      parent[key] = current - value;
      break;
      
    case 'multiply':
      if (typeof current !== 'number' || typeof value !== 'number') {
        throw new Error(`'multiply' requires numeric values, got ${typeof current} and ${typeof value}`);
      }
      parent[key] = current * value;
      break;
      
    case 'append':
      if (!Array.isArray(current)) {
        throw new Error(`'append' requires an array target, got ${typeof current}`);
      }
      current.push(value);
      break;
      
    case 'remove':
      if (!Array.isArray(current)) {
        throw new Error(`'remove' requires an array target, got ${typeof current}`);
      }
      if (delta.match) {
        // Remove by matching object properties
        const matchKey = Object.keys(delta.match)[0];
        const matchValue = delta.match[matchKey];
        const index = current.findIndex(
          (item: Record<string, unknown>) => item[matchKey] === matchValue
        );
        if (index !== -1) {
          current.splice(index, 1);
        }
      } else {
        // Remove by value equality
        const index = current.indexOf(value);
        if (index !== -1) {
          current.splice(index, 1);
        }
      }
      break;
      
    case 'transfer':
      // Transfer is handled specially in applyDelta
      throw new Error("'transfer' should be handled before applyOperation");
      
    default:
      throw new Error(`Unknown operation: ${op}`);
  }
}

// ============================================================================
// Main Delta Application
// ============================================================================

/**
 * Apply a single delta to the state.
 */
export function applyDelta(
  state: WorldState,
  delta: Effect,
  sceneId?: string,
  reason?: string
): DeltaResult {
  try {
    // Handle transfer operation specially (for cash_ledger)
    if (delta.op === 'transfer') {
      return applyTransfer(state, delta, sceneId, reason);
    }
    
    // Resolve path
    const resolved = resolveEntityPath(state, delta.path);
    if (!resolved) {
      return {
        success: false,
        error: `Could not resolve path: ${delta.path}`,
      };
    }
    
    // Apply the operation
    applyOperation(resolved.parent, resolved.key, delta.op, delta.value, delta);
    
    return {
      success: true,
      appliedDelta: {
        ...delta,
        scene_id: sceneId,
        reason,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Apply a transfer between cash ledger entries.
 */
function applyTransfer(
  state: WorldState,
  delta: Effect,
  sceneId?: string,
  reason?: string
): DeltaResult {
  if (!delta.from || !delta.to || delta.denarii === undefined) {
    return {
      success: false,
      error: 'Transfer requires from, to, and denarii fields',
    };
  }
  
  const ledger = state.assets.assets.cash_ledger;
  if (!ledger) {
    return {
      success: false,
      error: 'No cash_ledger in assets',
    };
  }
  
  const fromEntry = ledger.find(e => e.holder === delta.from);
  const toEntry = ledger.find(e => e.holder === delta.to);
  
  if (!fromEntry) {
    return {
      success: false,
      error: `No ledger entry for: ${delta.from}`,
    };
  }
  
  if (fromEntry.denarii < delta.denarii) {
    return {
      success: false,
      error: `Insufficient funds: ${delta.from} has ${fromEntry.denarii}, needs ${delta.denarii}`,
    };
  }
  
  // Apply transfer
  fromEntry.denarii -= delta.denarii;
  
  if (toEntry) {
    toEntry.denarii += delta.denarii;
  } else {
    // Create new entry for recipient
    ledger.push({ holder: delta.to, denarii: delta.denarii });
  }
  
  return {
    success: true,
    appliedDelta: {
      ...delta,
      scene_id: sceneId,
      reason,
    },
  };
}

/**
 * Apply multiple deltas in order.
 */
export function applyDeltas(
  state: WorldState,
  deltas: Effect[],
  sceneId?: string
): BatchDeltaResult {
  const applied: CommittedDelta[] = [];
  const failed: Array<{ delta: Effect; error: string }> = [];
  
  for (const delta of deltas) {
    const result = applyDelta(state, delta, sceneId);
    
    if (result.success && result.appliedDelta) {
      applied.push(result.appliedDelta);
    } else {
      failed.push({ delta, error: result.error || 'Unknown error' });
    }
  }
  
  return {
    success: failed.length === 0,
    applied,
    failed,
  };
}

// ============================================================================
// Shorthand Expansion
// ============================================================================

export interface ShorthandContext {
  actorId: string;
  targetId?: string;
  relationshipId?: string;
}

/**
 * Expand shorthand paths to absolute paths.
 * - actor.stats.wealth -> characters.char_varo.stats.wealth
 * - target.bdi.intentions -> characters.char_quintus.bdi.intentions
 * - relationship.weights.fear -> relationships.rel_varo_quintus.weights.fear
 */
export function expandShorthandPath(path: string, context: ShorthandContext): string {
  if (path.startsWith('actor.')) {
    return `characters.${context.actorId}.${path.slice(6)}`;
  }
  
  if (path.startsWith('target.') && context.targetId) {
    return `characters.${context.targetId}.${path.slice(7)}`;
  }
  
  if (path.startsWith('relationship.') && context.relationshipId) {
    return `relationships.${context.relationshipId}.${path.slice(13)}`;
  }
  
  // Already absolute
  return path;
}

/**
 * Expand all shorthand paths in a list of effects.
 */
export function expandEffects(effects: Effect[], context: ShorthandContext): Effect[] {
  return effects.map(effect => ({
    ...effect,
    path: expandShorthandPath(effect.path, context),
  }));
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that a delta can be applied without actually applying it.
 */
export function validateDelta(state: WorldState, delta: Effect): { valid: boolean; error?: string } {
  if (delta.op === 'transfer') {
    if (!delta.from || !delta.to || delta.denarii === undefined) {
      return { valid: false, error: 'Transfer requires from, to, and denarii fields' };
    }
    
    const ledger = state.assets.assets.cash_ledger;
    if (!ledger) {
      return { valid: false, error: 'No cash_ledger in assets' };
    }
    
    const fromEntry = ledger.find(e => e.holder === delta.from);
    if (!fromEntry) {
      return { valid: false, error: `No ledger entry for: ${delta.from}` };
    }
    
    if (fromEntry.denarii < delta.denarii) {
      return { valid: false, error: `Insufficient funds: ${delta.from} has ${fromEntry.denarii}, needs ${delta.denarii}` };
    }
    
    return { valid: true };
  }
  
  const resolved = resolveEntityPath(state, delta.path);
  if (!resolved) {
    return { valid: false, error: `Could not resolve path: ${delta.path}` };
  }
  
  return { valid: true };
}
