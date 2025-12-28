/**
 * Unit tests for Expression Evaluator
 */

import { describe, it, expect } from 'vitest';
import { evaluateExpression, evaluatePrereqs, type EvaluationContext } from '../src/core/expression-evaluator.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockContext: EvaluationContext = {
  actor: {
    id: 'char_varo',
    name: 'Marcus Varo',
    role: 'protagonist',
    faction_id: 'fac_senate_moderates',
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
      beliefs: ['The Senate is corrupt', 'Gold solves most problems'],
      desires: ['Expand shipping empire', 'Protect family legacy'],
      intentions: ['Secure the Ostia contract', 'Neutralize Quintus'],
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
      distinguishing_features: ['Roman nose', 'stern expression'],
    },
  },
  target: {
    id: 'char_quintus',
    name: 'Quintus Severus',
    role: 'antagonist',
    faction_id: 'fac_optimate_merchants',
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
      beliefs: ['Varo is weak', 'Profit justifies methods'],
      desires: ['Destroy Varo Shipping', 'Control grain trade'],
      intentions: ['Sabotage Varo fleet', 'Bribe officials'],
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
      distinguishing_features: ['sharp features', 'calculating gaze'],
    },
  },
  world: {
    global: {
      unrest: 6,
      scandal_temperature: 4,
      legal_exposure: 3,
    },
    locations: [
      {
        id: 'loc_forum',
        name: 'Roman Forum',
        type: 'public',
        description: 'The heart of Roman political life',
        visual_dna: {
          architecture: 'classical columns',
          lighting: 'daylight',
          atmosphere: 'bustling',
        },
      },
    ],
    factions: [
      {
        id: 'fac_senate_moderates',
        name: 'Senate Moderates',
        alignment: 1,
        resources: 70,
      },
    ],
    time: {
      day: 15,
      month: 'Martius',
      year: 45,
    },
  },
  relationship: {
    id: 'rel_varo_quintus',
    source_id: 'char_varo',
    target_id: 'char_quintus',
    type: 'rival',
    weights: {
      trust: -0.7,
      fear: 0.2,
      obligation: 0.0,
    },
    history: ['Business rivalry began 3 years ago'],
  },
};

// ============================================================================
// Basic Comparisons
// ============================================================================

describe('Expression Evaluator - Comparisons', () => {
  it('evaluates equality (==)', () => {
    const result = evaluateExpression('actor.stats.wealth == 80', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('evaluates inequality (!=)', () => {
    const result = evaluateExpression('actor.stats.wealth != 100', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('evaluates greater than (>)', () => {
    const result = evaluateExpression('actor.stats.wealth > 50', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('evaluates less than (<)', () => {
    const result = evaluateExpression('target.stats.ruthlessness < 80', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('evaluates greater than or equal (>=)', () => {
    const result = evaluateExpression('actor.stats.influence >= 65', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('evaluates less than or equal (<=)', () => {
    const result = evaluateExpression('world.global.unrest <= 10', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('evaluates string equality', () => {
    const result = evaluateExpression('actor.id == "char_varo"', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('evaluates nested property access', () => {
    const result = evaluateExpression('actor.bdi.emotional_state.dominant == "determined"', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });
});

// ============================================================================
// Existence Checks
// ============================================================================

describe('Expression Evaluator - Existence', () => {
  it('checks existing property', () => {
    const result = evaluateExpression('actor.stats.wealth exists', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('checks non-existing property', () => {
    const result = evaluateExpression('actor.stats.magic exists', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(false);
  });

  it('checks nested existence', () => {
    const result = evaluateExpression('actor.bdi.emotional_state exists', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });
});

// ============================================================================
// Membership Tests
// ============================================================================

describe('Expression Evaluator - Membership', () => {
  it('checks array includes value', () => {
    const result = evaluateExpression('actor.bdi.beliefs includes "The Senate is corrupt"', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('checks array does not include value', () => {
    const result = evaluateExpression('actor.bdi.beliefs includes "Money is evil"', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(false);
  });

  it('checks visual_dna features', () => {
    const result = evaluateExpression('actor.visual_dna.distinguishing_features includes "Roman nose"', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });
});

// ============================================================================
// Relationship Weights
// ============================================================================

describe('Expression Evaluator - Relationships', () => {
  it('evaluates relationship trust', () => {
    const result = evaluateExpression('relationship.weights.trust < 0', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('evaluates relationship type', () => {
    const result = evaluateExpression('relationship.type == "rival"', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('evaluates relationship fear', () => {
    const result = evaluateExpression('relationship.weights.fear >= 0.2', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });
});

// ============================================================================
// World State
// ============================================================================

describe('Expression Evaluator - World State', () => {
  it('evaluates global unrest', () => {
    const result = evaluateExpression('world.global.unrest > 5', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('evaluates scandal temperature', () => {
    const result = evaluateExpression('world.global.scandal_temperature <= 5', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });
});

// ============================================================================
// Arithmetic
// ============================================================================

describe('Expression Evaluator - Arithmetic', () => {
  it('evaluates addition', () => {
    const result = evaluateExpression('actor.stats.wealth + 20 == 100', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('evaluates subtraction', () => {
    const result = evaluateExpression('actor.stats.wealth - 30 == 50', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  it('evaluates comparison with arithmetic', () => {
    const result = evaluateExpression('actor.stats.wealth + target.stats.wealth > 150', mockContext);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });
});

// ============================================================================
// Error Handling
// ============================================================================

describe('Expression Evaluator - Error Handling', () => {
  it('returns error for unknown context', () => {
    const result = evaluateExpression('unknown.stats.wealth > 50', mockContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown context');
  });

  it('returns error for missing context', () => {
    const result = evaluateExpression('actor.stats.wealth > 50', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('returns error for invalid syntax', () => {
    const result = evaluateExpression('actor.stats.wealth @@ 50', mockContext);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// Batch Evaluation
// ============================================================================

describe('Expression Evaluator - Batch Prereqs', () => {
  it('evaluates multiple prereqs - all pass', () => {
    const prereqs = [
      { expr: 'actor.stats.wealth > 50' },
      { expr: 'target.stats.ruthlessness > 60' },
      { expr: 'relationship.weights.trust < 0' },
    ];
    
    const result = evaluatePrereqs(prereqs, mockContext);
    expect(result.allPassed).toBe(true);
    expect(result.results.every(r => r.passed)).toBe(true);
  });

  it('evaluates multiple prereqs - some fail', () => {
    const prereqs = [
      { expr: 'actor.stats.wealth > 50' },
      { expr: 'actor.stats.wealth > 100' }, // Fails
      { expr: 'relationship.weights.trust < 0' },
    ];
    
    const result = evaluatePrereqs(prereqs, mockContext);
    expect(result.allPassed).toBe(false);
    expect(result.results[0].passed).toBe(true);
    expect(result.results[1].passed).toBe(false);
    expect(result.results[2].passed).toBe(true);
  });

  it('handles empty prereqs', () => {
    const result = evaluatePrereqs([], mockContext);
    expect(result.allPassed).toBe(true);
    expect(result.results).toHaveLength(0);
  });
});
