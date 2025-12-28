/**
 * Unit tests for Delta Engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyDelta,
  applyDeltas,
  expandShorthandPath,
  expandEffects,
  validateDelta,
} from '../src/engine/delta-engine.js';
import type { WorldState } from '../src/engine/state-store.js';
import type { Effect } from '../src/types/operators.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockState(): WorldState {
  return {
    world: {
      global: {
        unrest: 5,
        scandal_temperature: 3,
        legal_exposure: 2,
      },
      locations: [
        {
          id: 'loc_forum',
          name: 'Roman Forum',
          type: 'public',
          description: 'The heart of Roman political life',
          visual_dna: {
            architecture: 'classical',
            lighting: 'daylight',
            atmosphere: 'bustling',
          },
        },
      ],
      factions: [],
      time: {
        day: 15,
        month: 'Martius',
        year: 45,
      },
    },
    characters: {
      characters: [
        {
          id: 'char_varo',
          name: 'Marcus Varo',
          role: 'protagonist',
          faction_id: 'fac_senate',
          status: {
            alive: true,
            available: true,
            location_id: 'loc_forum',
          },
          stats: {
            wealth: 80,
            influence: 65,
            reputation: 70,
            ruthlessness: 40,
            cunning: 75,
          },
          bdi: {
            beliefs: ['The Senate is corrupt'],
            desires: ['Expand empire'],
            intentions: ['Secure contract'],
            emotional_state: {
              dominant: 'determined',
              valence: 0.3,
              arousal: 0.6,
            },
          },
          visual_dna: {
            hair: 'gray',
            eyes: 'brown',
            build: 'stocky',
            distinguishing_features: [],
          },
        },
        {
          id: 'char_quintus',
          name: 'Quintus Severus',
          role: 'antagonist',
          faction_id: 'fac_merchants',
          status: {
            alive: true,
            available: true,
            location_id: 'loc_forum',
          },
          stats: {
            wealth: 90,
            influence: 50,
            reputation: 55,
            ruthlessness: 70,
            cunning: 60,
          },
          bdi: {
            beliefs: ['Varo is weak'],
            desires: ['Destroy Varo'],
            intentions: ['Sabotage fleet'],
            emotional_state: {
              dominant: 'ambitious',
              valence: 0.4,
              arousal: 0.5,
            },
          },
          visual_dna: {
            hair: 'black',
            eyes: 'dark',
            build: 'thin',
            distinguishing_features: [],
          },
        },
      ],
    },
    relationships: {
      edges: [
        {
          id: 'rel_varo_quintus',
          source_id: 'char_varo',
          target_id: 'char_quintus',
          type: 'rival',
          weights: {
            trust: -0.5,
            fear: 0.2,
            obligation: 0.0,
          },
          history: [],
        },
      ],
    },
    assets: {
      assets: {
        cash_ledger: [
          { holder: 'char_varo', denarii: 10000 },
          { holder: 'char_quintus', denarii: 15000 },
        ],
        contracts: [],
        offices: [],
        networks: [],
      },
    },
    secrets: {
      secrets: [
        {
          id: 'sec_embezzlement',
          owner_id: 'char_quintus',
          label: 'Embezzlement scheme',
          description: 'Quintus has been skimming from grain shipments',
          status: 'active',
          holders: ['char_varo'],
          decay: {
            half_life_episodes: 5,
            applies_to: ['legal_value', 'public_damage'],
          },
          stats: {
            legal_value: 0.8,
            public_damage: 0.6,
          },
        },
      ],
    },
    threads: {
      threads: [
        {
          id: 'thread_contract',
          title: 'The Ostia Contract',
          status: 'active',
          phase: 'rising',
          progress: 3,
          principals: ['char_varo', 'char_quintus'],
          stakes: 'Control of grain shipping',
          deadline_episode: 10,
          tension_level: 6,
        },
      ],
    },
    factions: {
      factions: [],
    },
    constraints: {
      hard: [],
      soft: [],
    },
  };
}

// ============================================================================
// Set Operation
// ============================================================================

describe('Delta Engine - Set Operation', () => {
  let state: WorldState;

  beforeEach(() => {
    state = createMockState();
  });

  it('sets a numeric stat', () => {
    const delta: Effect = {
      path: 'characters.char_varo.stats.wealth',
      op: 'set',
      value: 100,
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(true);

    const char = state.characters.characters.find(c => c.id === 'char_varo');
    expect(char?.stats.wealth).toBe(100);
  });

  it('sets a string value', () => {
    const delta: Effect = {
      path: 'characters.char_varo.status.location_id',
      op: 'set',
      value: 'loc_villa',
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(true);

    const char = state.characters.characters.find(c => c.id === 'char_varo');
    expect(char?.status.location_id).toBe('loc_villa');
  });

  it('sets world global value', () => {
    const delta: Effect = {
      path: 'world.global.unrest',
      op: 'set',
      value: 8,
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(true);
    expect(state.world.global.unrest).toBe(8);
  });
});

// ============================================================================
// Add Operation
// ============================================================================

describe('Delta Engine - Add Operation', () => {
  let state: WorldState;

  beforeEach(() => {
    state = createMockState();
  });

  it('adds to a numeric stat', () => {
    const delta: Effect = {
      path: 'characters.char_varo.stats.wealth',
      op: 'add',
      value: 10,
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(true);

    const char = state.characters.characters.find(c => c.id === 'char_varo');
    expect(char?.stats.wealth).toBe(90); // 80 + 10
  });

  it('adds negative value (decrease)', () => {
    const delta: Effect = {
      path: 'characters.char_varo.stats.influence',
      op: 'add',
      value: -15,
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(true);

    const char = state.characters.characters.find(c => c.id === 'char_varo');
    expect(char?.stats.influence).toBe(50); // 65 - 15
  });
});

// ============================================================================
// Subtract Operation
// ============================================================================

describe('Delta Engine - Subtract Operation', () => {
  let state: WorldState;

  beforeEach(() => {
    state = createMockState();
  });

  it('subtracts from a numeric stat', () => {
    const delta: Effect = {
      path: 'characters.char_quintus.stats.reputation',
      op: 'subtract',
      value: 10,
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(true);

    const char = state.characters.characters.find(c => c.id === 'char_quintus');
    expect(char?.stats.reputation).toBe(45); // 55 - 10
  });
});

// ============================================================================
// Multiply Operation
// ============================================================================

describe('Delta Engine - Multiply Operation', () => {
  let state: WorldState;

  beforeEach(() => {
    state = createMockState();
  });

  it('multiplies a numeric stat', () => {
    const delta: Effect = {
      path: 'world.global.scandal_temperature',
      op: 'multiply',
      value: 2,
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(true);
    expect(state.world.global.scandal_temperature).toBe(6); // 3 * 2
  });

  it('multiplies by fraction (decay)', () => {
    const delta: Effect = {
      path: 'secrets.sec_embezzlement.stats.legal_value',
      op: 'multiply',
      value: 0.5,
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(true);

    const secret = state.secrets.secrets.find(s => s.id === 'sec_embezzlement');
    expect(secret?.stats.legal_value).toBe(0.4); // 0.8 * 0.5
  });
});

// ============================================================================
// Append Operation
// ============================================================================

describe('Delta Engine - Append Operation', () => {
  let state: WorldState;

  beforeEach(() => {
    state = createMockState();
  });

  it('appends to beliefs array', () => {
    const delta: Effect = {
      path: 'characters.char_varo.bdi.beliefs',
      op: 'append',
      value: 'Quintus cannot be trusted',
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(true);

    const char = state.characters.characters.find(c => c.id === 'char_varo');
    expect(char?.bdi.beliefs).toContain('Quintus cannot be trusted');
    expect(char?.bdi.beliefs).toHaveLength(2);
  });

  it('appends to relationship history', () => {
    const delta: Effect = {
      path: 'relationships.rel_varo_quintus.history',
      op: 'append',
      value: 'Public confrontation at forum',
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(true);

    const rel = state.relationships.edges.find(e => e.id === 'rel_varo_quintus');
    expect(rel?.history).toContain('Public confrontation at forum');
  });
});

// ============================================================================
// Remove Operation
// ============================================================================

describe('Delta Engine - Remove Operation', () => {
  let state: WorldState;

  beforeEach(() => {
    state = createMockState();
  });

  it('removes from beliefs array by value', () => {
    const delta: Effect = {
      path: 'characters.char_varo.bdi.beliefs',
      op: 'remove',
      value: 'The Senate is corrupt',
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(true);

    const char = state.characters.characters.find(c => c.id === 'char_varo');
    expect(char?.bdi.beliefs).not.toContain('The Senate is corrupt');
    expect(char?.bdi.beliefs).toHaveLength(0);
  });
});

// ============================================================================
// Transfer Operation
// ============================================================================

describe('Delta Engine - Transfer Operation', () => {
  let state: WorldState;

  beforeEach(() => {
    state = createMockState();
  });

  it('transfers money between characters', () => {
    const delta: Effect = {
      path: 'assets.cash_ledger',
      op: 'transfer',
      from: 'char_varo',
      to: 'char_quintus',
      denarii: 2000,
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(true);

    const ledger = state.assets.assets.cash_ledger!;
    const varoEntry = ledger.find(e => e.holder === 'char_varo');
    const quintusEntry = ledger.find(e => e.holder === 'char_quintus');

    expect(varoEntry?.denarii).toBe(8000); // 10000 - 2000
    expect(quintusEntry?.denarii).toBe(17000); // 15000 + 2000
  });

  it('fails transfer with insufficient funds', () => {
    const delta: Effect = {
      path: 'assets.cash_ledger',
      op: 'transfer',
      from: 'char_varo',
      to: 'char_quintus',
      denarii: 50000, // More than Varo has
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient funds');
  });

  it('creates new ledger entry for new recipient', () => {
    const delta: Effect = {
      path: 'assets.cash_ledger',
      op: 'transfer',
      from: 'char_varo',
      to: 'char_gaius',
      denarii: 1000,
    };

    const result = applyDelta(state, delta, 'scene_01');
    expect(result.success).toBe(true);

    const ledger = state.assets.assets.cash_ledger!;
    const gaiusEntry = ledger.find(e => e.holder === 'char_gaius');
    expect(gaiusEntry?.denarii).toBe(1000);
  });
});

// ============================================================================
// Batch Operations
// ============================================================================

describe('Delta Engine - Batch Operations', () => {
  let state: WorldState;

  beforeEach(() => {
    state = createMockState();
  });

  it('applies multiple deltas', () => {
    const deltas: Effect[] = [
      { path: 'characters.char_varo.stats.wealth', op: 'add', value: 10 },
      { path: 'characters.char_quintus.stats.reputation', op: 'subtract', value: 5 },
      { path: 'world.global.unrest', op: 'add', value: 1 },
    ];

    const result = applyDeltas(state, deltas, 'scene_01');
    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(3);
    expect(result.failed).toHaveLength(0);

    const varo = state.characters.characters.find(c => c.id === 'char_varo');
    const quintus = state.characters.characters.find(c => c.id === 'char_quintus');

    expect(varo?.stats.wealth).toBe(90);
    expect(quintus?.stats.reputation).toBe(50);
    expect(state.world.global.unrest).toBe(6);
  });

  it('reports failed deltas in batch', () => {
    const deltas: Effect[] = [
      { path: 'characters.char_varo.stats.wealth', op: 'add', value: 10 },
      { path: 'characters.nonexistent.stats.wealth', op: 'add', value: 10 }, // Will fail
      { path: 'world.global.unrest', op: 'add', value: 1 },
    ];

    const result = applyDeltas(state, deltas, 'scene_01');
    expect(result.success).toBe(false);
    expect(result.applied).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toContain('Could not resolve path');
  });
});

// ============================================================================
// Path Shorthand Expansion
// ============================================================================

describe('Delta Engine - Shorthand Expansion', () => {
  it('expands actor path', () => {
    const expanded = expandShorthandPath('actor.stats.wealth', {
      actorId: 'char_varo',
    });
    expect(expanded).toBe('characters.char_varo.stats.wealth');
  });

  it('expands target path', () => {
    const expanded = expandShorthandPath('target.stats.reputation', {
      actorId: 'char_varo',
      targetId: 'char_quintus',
    });
    expect(expanded).toBe('characters.char_quintus.stats.reputation');
  });

  it('expands relationship path', () => {
    const expanded = expandShorthandPath('relationship.weights.trust', {
      actorId: 'char_varo',
      targetId: 'char_quintus',
      relationshipId: 'rel_varo_quintus',
    });
    expect(expanded).toBe('relationships.rel_varo_quintus.weights.trust');
  });

  it('leaves absolute paths unchanged', () => {
    const expanded = expandShorthandPath('world.global.unrest', {
      actorId: 'char_varo',
    });
    expect(expanded).toBe('world.global.unrest');
  });

  it('expands effects array', () => {
    const effects: Effect[] = [
      { path: 'actor.stats.wealth', op: 'add', value: 10 },
      { path: 'target.stats.reputation', op: 'subtract', value: 5 },
      { path: 'world.global.unrest', op: 'add', value: 1 },
    ];

    const expanded = expandEffects(effects, {
      actorId: 'char_varo',
      targetId: 'char_quintus',
    });

    expect(expanded[0].path).toBe('characters.char_varo.stats.wealth');
    expect(expanded[1].path).toBe('characters.char_quintus.stats.reputation');
    expect(expanded[2].path).toBe('world.global.unrest');
  });
});

// ============================================================================
// Validation
// ============================================================================

describe('Delta Engine - Validation', () => {
  let state: WorldState;

  beforeEach(() => {
    state = createMockState();
  });

  it('validates valid delta', () => {
    const delta: Effect = {
      path: 'characters.char_varo.stats.wealth',
      op: 'add',
      value: 10,
    };

    const result = validateDelta(state, delta);
    expect(result.valid).toBe(true);
  });

  it('validates invalid path', () => {
    const delta: Effect = {
      path: 'characters.nonexistent.stats.wealth',
      op: 'add',
      value: 10,
    };

    const result = validateDelta(state, delta);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Could not resolve path');
  });

  it('validates transfer with insufficient funds', () => {
    const delta: Effect = {
      path: 'assets.cash_ledger',
      op: 'transfer',
      from: 'char_varo',
      to: 'char_quintus',
      denarii: 50000,
    };

    const result = validateDelta(state, delta);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Insufficient funds');
  });
});
