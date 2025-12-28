# SPEC_V3 — Aureus: Neuro-Symbolic Narrative Engine

> **Version:** 3.2  
> **Status:** Working Draft  
> **Last Updated:** 2024-12-28  
> **Appendices:** [Schemas](spec/APPENDIX_A_SCHEMAS.md) | [Operators](spec/APPENDIX_B_OPERATORS.md) | [Examples](spec/APPENDIX_C_EXAMPLES.md) | [Style](spec/APPENDIX_D_STYLE.md) | [Production](spec/APPENDIX_E_PRODUCTION.md)

---

## 0. Executive Summary

Aureus generates serialized ~30-minute episodes set in a late Roman Republic setting. It uses a **neuro-symbolic architecture** that separates concerns:

- **Symbolic systems** handle state, planning, and verification
- **Neural systems** (LLMs) handle prose generation

**Core Contract:**
```
Symbolic Planner (Director) → Neural Realizer (Writer) → Symbolic Verifier → Commit State
```

LLMs propose and render; **truth lives outside the LLM**.

---

## 1. Goals & Non-Goals

### Goals
- Generate coherent serialized episodes (18–24 scenes, ~30 min)
- Maintain long-horizon continuity via external world state
- Produce "Billions-style" thriller plots: courts, elections, grain markets
- Produce "soap-style" emotional propulsion: betrayals, alliances, status injury
- Enable: auditing, correction, branching, incremental upgrade

### Non-Goals (v3)
- Full historical simulation (300 senators, strict chronology)
- Complete HTN planner or full BDI agent autonomy
- External dataset ingestion (DPRR integration deferred)

---

## 2. Architecture

### 2.1 Component Overview

| Component | Type | Responsibility |
|-----------|------|----------------|
| **State Store** | Symbolic | Canonical truth in version-controlled JSON |
| **Director** | Symbolic | HTN-lite planning, operator selection, beat sheet |
| **Agents** | Hybrid | BDI-lite proposals, character mental models |
| **Retriever** | Symbolic | GraphRAG-lite subgraph extraction |
| **Writer** | Neural | Scene prose, dialogue, structured outputs |
| **Verifier** | Hybrid | Deterministic checks + LLM critic |
| **State Engine** | Symbolic | Apply approved deltas, generate recaps |

### 2.2 What "Lite" Means

**HTN-lite:** Not a full hierarchical task network solver. The Director:
1. Maintains a library of decomposition rules (operators)
2. Selects applicable operators based on prerequisites
3. Orders them into a beat sheet
4. Does NOT do automated backtracking or constraint propagation

**BDI-lite:** Not full autonomous scheduling. Agents:
1. Maintain explicit beliefs, desires, intentions
2. Propose 2-3 candidate moves per episode
3. Director selects which proposals to activate
4. Agents do NOT act between episodes without Director approval

**GraphRAG-lite:** Not a full graph database query. Retriever:
1. Walks k-hop neighborhood from scene participants (k=1 or 2)
2. Filters edges by relevance (active threads, recent changes)
3. Returns flat JSON subgraph, not Cypher query results

### 2.3 Data Flow

**Planning Phase:**
1. Load state snapshot from previous episode
2. Generate agent proposals (each principal suggests 2-3 moves)
3. Director selects operators, orders beats, assigns to scenes
4. Retriever extracts relevant subgraphs for each scene

**Scene Loop** (repeated for each scene):
1. Writer generates prose from scene packet
2. Verifier checks output (deterministic + LLM critic)
3. If PASS: accept scene, move to next
4. If FAIL: regenerate with tighter constraints (max 2 retries)

**Commit Phase:**
1. Apply approved deltas to state store
2. Generate recap from deltas
3. Extract cliffhanger constraints for next episode
4. Commit all artifacts to version control

---

## 3. Data Model

All state lives in version-controlled JSON files. See [Appendix A](spec/APPENDIX_A_SCHEMAS.md) for complete schemas.

### 3.1 Repository Layout

```
/world/
  world.json          # Time, locations, global metrics
  factions.json       # Political groupings
  characters.json     # Principals with BDI models
  relationships.json  # Directed weighted edges
  assets.json         # Money, goods, contracts, networks
  secrets.json        # Information asymmetries
  threads.json        # Open narrative questions
  constraints.json    # Hard/soft rules
/operators/
  operators.json      # Full operator library
/style/
  style_guide.md      # Voice and tone rules
  lexicon.md          # Forbidden words, Roman replacements
/seasons/
  season_01/
    season_goals.json
    episode_01/
      episode_plan.json
      episode_script.md
      episode_deltas.json
      verifier_report.json
      cliffhanger_constraints.json
      # Production artifacts (Stage I)
      storyboard.json
      production_manifest.json
      /audio/
      /frames/
      episode_final.mp4
/casting/
  casting.json              # Character → voice mappings
```

### 3.2 Core Entities (Summary)

| Entity | Key Fields | Purpose |
|--------|------------|---------|
| **Character** | stats, status, bdi, voice | Agent with goals and mental model |
| **Relationship** | from, to, weights, flags | Directed edge with loyalty/fear/debt |
| **Secret** | holders, stats, decay | Information that can be revealed/used |
| **Thread** | question, priority, cadence | Audience-facing narrative promise |
| **Operator** | prereqs, effects, risks | Atomic "move" in the simulation |

### 3.3 Stat Scales

All numeric stats use consistent scales:

| Category | Range | Description |
|----------|-------|-------------|
| **Character stats** | 0-100 | dignitas, auctoritas, wealth, popularity |
| **Relationship weights** | 0-100 | loyalty, fear, resentment, respect, dependency |
| **Faction stats** | -3 to +3 | Relative position (economic, legal, political, narrative) |
| **World metrics** | 0-10 | unrest, scandal_temperature, legal_exposure |
| **Secret stats** | 0.0-1.0 | legal_value, public_damage, credibility |
| **BDI weights** | 0.0-1.0 | priority, confidence, commitment |
| **Thread priority** | 0.0-1.0 | Importance for episode selection |

**Faction Stats Note:** Faction stats use a relative scale because they represent competitive position. A faction at +3 dominates; at -3, they're losing ground. Zero is neutral/stable.

### 3.4 Persistence Strategy

Each episode commit captures:
1. The plan that drove generation
2. State snapshot at episode start
3. All deltas applied
4. Verifier reports (audit trail)
5. Cliffhanger constraints for next episode

This enables: rollback, debugging, branching ("what if" seasons).

---

## 4. Operators

Operators are the "verbs" of the system. They encode what characters can do and what happens when they do it. See [Appendix B](spec/APPENDIX_B_OPERATORS.md) for the full library.

### 4.1 Operator Structure

```json
{
  "id": "OP_WITNESS_FLIP",
  "type": "thriller",
  "prereqs": [{ "expr": "actor.wealth > target.wealth * 10" }],
  "effects": [{ "path": "target.bdi.intentions", "op": "add", "value": "TESTIFY" }],
  "side_effect_risks": [{ "text": "Double-cross", "prob": 0.2 }],
  "writer_guidance": { "success_beat": "...", "fail_beat": "..." }
}
```

### 4.2 Categories

| Type | Changes | Examples |
|------|---------|----------|
| **Thriller** | External state (assets, legal, public) | Witness flip, asset freeze, rumor campaign |
| **Soap** | Internal state (beliefs, relationships) | Public snub, confession, betrayal |

### 4.3 Episode Requirements

- **Thriller operators:** 10-14 per episode
- **Soap operators:** 6-10 per episode
- **Mandatory beats:** 1 reveal, 1 reversal, 1 confrontation, 1 cliffhanger

### 4.4 Expression Language

Operator prerequisites and effects use a simple expression DSL for evaluating conditions and specifying state changes.

#### 4.4.1 Grammar

```
expression     := comparison | membership | existence
comparison     := path operator value
membership     := path "includes" value
existence      := path "exists"

path           := context "." property ("." property)*
context        := "actor" | "target" | "world" | "relationship"
property       := identifier | array_access
array_access   := identifier "[" (number | string) "]"

operator       := "==" | "!=" | ">" | "<" | ">=" | "<="
value          := number | string | boolean | path
```

#### 4.4.2 Context Variables

| Context | Description | Resolution |
|---------|-------------|------------|
| `actor` | Character performing the operator | Resolved from operator's `actor_id` |
| `target` | Character receiving the action | Resolved from operator's `target_id` |
| `world` | Global world state | Resolved from `world.json` |
| `relationship` | Edge between actor and target | Resolved from `relationships.json` where `from=actor` and `to=target` |

#### 4.4.3 Path Resolution

Paths are dot-separated property accessors:

```
actor.stats.wealth          → characters[actor_id].stats.wealth
target.bdi.desires[0].text  → characters[target_id].bdi.desires[0].text
world.global.unrest         → world.global.unrest
relationship.weights.fear   → relationships[actor→target].weights.fear
```

**Special Paths:**
- `actor.offices` → Flattened list of office IDs held by actor (from `assets.offices`)
- `actor.knowledge` → List of secret IDs known by actor (from `secrets.holders`)
- `actor.location` → Current location ID (from `characters[id].status.location_id`)

#### 4.4.4 Operators and Semantics

| Operator | Example | Meaning |
|----------|---------|---------|
| `==` | `actor.faction_id == "f_capital"` | Equality check |
| `!=` | `target.status.alive != false` | Inequality check |
| `>` | `actor.stats.wealth > 50` | Greater than |
| `>=` | `relationship.weights.loyalty >= 60` | Greater than or equal |
| `<` | `world.global.unrest < 8` | Less than |
| `<=` | `target.stats.dignitas <= actor.stats.dignitas` | Less than or equal |
| `includes` | `actor.offices includes "powers.SUBPOENA"` | List membership |
| `exists` | `target.bdi.intentions exists` | Non-null check |

#### 4.4.5 Compound Expressions

Multiple prerequisites are evaluated with implicit AND:

```json
{
  "prereqs": [
    { "expr": "actor.stats.wealth > target.stats.wealth * 10" },
    { "expr": "target.stats.loyalty < 50" }
  ]
}
```

All expressions must evaluate to `true` for the operator to be eligible.

**Arithmetic in Comparisons:**
- Basic arithmetic (`+`, `-`, `*`, `/`) is supported on the right-hand side
- Example: `actor.stats.wealth > target.stats.wealth * 10`

#### 4.4.6 Effect Paths

Effects use the same path syntax but are always **absolute** (resolved against the full state):

```json
{
  "effects": [
    { "path": "characters.char_varo.stats.wealth", "op": "subtract", "value": 5000 },
    { "path": "world.global.unrest", "op": "add", "value": 2 },
    { "path": "relationships.rel_varo_quintus.weights.fear", "op": "add", "value": 10 }
  ]
}
```

**Shorthand Expansion:** In scene packets, relative paths are expanded by the Director:
- `actor.stats.wealth` → `characters.{actor_id}.stats.wealth`
- `target.bdi.intentions` → `characters.{target_id}.bdi.intentions`
- `relationship.weights.fear` → `relationships.{rel_id}.weights.fear`

### 4.5 Side Effect Resolution

Side effects are probabilistic complications that add unpredictability to operator execution.

#### 4.5.1 Resolution Timing

Side effects are resolved **during Director planning** (Stage C), not at write-time. This ensures:
1. The Writer receives deterministic instructions
2. Beat sheets reflect actual outcomes
3. Downstream scenes can react to triggered side effects

#### 4.5.2 Resolution Process

```
For each operator selected by Director:
  1. Roll against each side_effect_risk.prob
  2. If triggered, add side effect to beat's triggered_side_effects
  3. Director must schedule consequences (may require additional beats)
```

#### 4.5.3 Side Effect Schema

```json
{
  "side_effect_risks": [
    { 
      "id": "risk_double_cross", 
      "text": "Witness takes money but stays loyal", 
      "prob": 0.2,
      "consequence_operator": "OP_WITNESS_BETRAYAL",
      "consequence_delay": "immediate|same_episode|next_episode"
    }
  ]
}
```

#### 4.5.4 Director Response

When a side effect triggers:

| Delay | Director Action |
|-------|-----------------|
| `immediate` | Insert consequence beat directly after triggering beat |
| `same_episode` | Schedule consequence beat later in episode (Act 2 or 3) |
| `next_episode` | Add to `cliffhanger_constraints.pending_consequences` |

#### 4.5.5 Audit Trail

All rolls are logged in `episode_plan.json`:

```json
{
  "side_effect_rolls": [
    {
      "beat_id": "b_04_a",
      "operator_id": "OP_WITNESS_FLIP_FINANCIAL",
      "risk_id": "risk_double_cross",
      "prob": 0.2,
      "roll": 0.73,
      "triggered": false
    }
  ]
}
```

---

## 5. Generation Pipeline

### 5.1 Stage Overview

| Stage | Input | Output | Model |
|-------|-------|--------|-------|
| A. Snapshot | Previous state, cliffhanger constraints | episode_context.json | None |
| B. Proposals | Character BDIs | agent_proposals.json | Haiku |
| C. Planning | Proposals, threads, operators | episode_plan.json | Sonnet |
| D. Packets | Plan + retrieved subgraphs | SC01.json...SC24.json | None |
| E. Writing | Scene packets | Scene text + claims | Sonnet |
| F. Verification | Scene text, packet | Pass/fail + report | Haiku + deterministic |
| G. Repair | Failed scenes | Regenerated text | Sonnet/Opus |
| H. Commit | Approved scenes | Deltas + cliffhanger | None |
| I. Production | Episode script | Audio, frames, video | Sonnet + DALL-E 3 + ElevenLabs |

### 5.2 Stage Details

**Stage A — Snapshot**
- Load current world state
- Apply any cliffhanger constraints from previous episode
- Identify active threads and their cadence status

**Stage B — Agent Proposals**
- For each principal (6-8 characters), generate 2-3 candidate moves
- Each move: operator_id, target, rationale, expected deltas, risk
- Proposals are suggestions; Director decides which to use

**Stage C — Director Planning**
- Select faction objectives for the episode
- Choose operators that satisfy thread cadence requirements
- Ensure mandatory beats are scheduled (reveal, reversal, confrontation, cliffhanger)
- Output: ordered beat sheet and scene list

**Stage D — Scene Packets**
- For each scene, compile:
  - Setting (location, time, atmosphere)
  - Cast with moods and objectives
  - Retrieved subgraph (relevant relationships, assets, beliefs)
  - Director instructions (which operators, success/fail outcomes)
  - Constraints (required deltas, forbidden facts, allowed inventions)

**Stage E — Writing**
- Writer generates scene prose from packet
- Must output structured `CLAIMS` (new facts) and `SCENE_EVENTS` (what happened)
- Must depict all required deltas through dialogue/action

**Stage F — Verification**
1. **Deterministic checks:**
   - JSON validity
   - Invariants (dead can't speak, no teleportation, ledger balances)
   - Prerequisites satisfied before operator effects
   - Claims within allowed limits
   - Required deltas represented in scene events

2. **LLM critic:**
   - Plan compliance (did scene achieve its purpose?)
   - Hook requirement (does scene end with button line?)

**Stage G — Repair**
- If deterministic fail: regenerate with explicit prohibitions
- If quality fail: punch-up pass on last 30-40% of scene
- Budget: max 2 regenerations per scene, 12 total per episode
- Escalate to Opus after 2 failures on same scene

**Stage H — Commit**
1. Apply approved deltas to state store
2. Generate recap from deltas (not from prose)
3. Extract cliffhanger constraints for next episode:
   - If physical danger: `must_start_immediately: true`
   - If revelation: time skip allowed
4. Commit all artifacts to version control

**Stage I — Production** (See [Appendix E](spec/APPENDIX_E_PRODUCTION.md))

Transforms episode script into synthesized audio and video. Four sub-stages:

1. **I-A Storyboarder:** LLM identifies visual beats based on `visual_cadence` (configurable per-scene). Outputs `storyboard.json` with shot descriptions using Visual DNA.

2. **I-B Audio Synth:** Extracts dialogue with performance hints, maps characters to ElevenLabs voices via `casting.json`. Generates per-turn audio files.

3. **I-C Image Generation:** Sends visual prompts (with global style from `constraints.json`) to DALL-E 3. Generates frames for each storyboard shot.

4. **I-D Video Assembly:** Combines audio and frames via FFmpeg/MoviePy. Applies motion effects (slow zoom, pan) to prevent static frames. Exports final `episode_final.mp4`.

**Human-in-the-Loop:**
- New speaking characters block production until voice is assigned in `casting.json`
- Visual style is set globally in `constraints.json`; no per-episode approval needed

**Implementation Note:** Stage I is implemented after Stages A-H are stable. The text generation pipeline (A-H) is the core deliverable; production is an enhancement layer.

### 5.3 Pipeline Error Recovery

When failures exceed normal regeneration budgets, the pipeline enters error recovery mode.

#### 5.3.1 Failure Categories

| Category | Trigger | Recovery Strategy |
|----------|---------|-------------------|
| **Planning Failure** | Director produces infeasible plan 3x | Reduce operator set, simplify constraints |
| **Scene Failure** | Same scene fails 3x after regeneration | Fallback to simplified beat, log for manual review |
| **Episode Failure** | >12 scene regenerations total | Checkpoint, allow manual intervention |
| **Verification Loop** | Verifier and Writer disagree 3x | Escalate to Opus with both perspectives |

#### 5.3.2 Circuit Breakers

```json
{
  "pipeline_limits": {
    "max_director_retries": 3,
    "max_scene_retries": 3,
    "max_episode_regenerations": 12,
    "max_verification_loops": 3,
    "checkpoint_on_failure": true
  }
}
```

#### 5.3.3 Graceful Degradation

When recovery fails, the system can degrade gracefully:

1. **Simplify Operators:** Replace complex multi-prerequisite operators with simpler alternatives
2. **Reduce Beat Count:** Drop optional beats, keep mandatory types only
3. **Checkpoint State:** Save partial progress to allow manual continuation
4. **Generate Diagnostic Report:** Output failure analysis for human review

#### 5.3.4 Failure Report Schema

```json
{
  "failure_report": {
    "episode_id": "ep_03",
    "failure_type": "scene_failure",
    "failed_scene_id": "SC12",
    "attempts": 3,
    "last_error": {
      "type": "invariant_violation",
      "rule": "H3",
      "message": "Cash ledger imbalance: spent 50000, available 30000"
    },
    "state_checkpoint": "ep_03_checkpoint_sc11.json",
    "suggested_fixes": [
      "Reduce bribe amount in OP_WITNESS_FLIP",
      "Add wealth transfer in earlier scene"
    ]
  }
}
```

---

## 6. Prompts

### 6.1 Director Prompt

**Model:** Sonnet (escalate to Opus on repeated failures)

```
SYSTEM:
You are the Director. Output valid JSON only.

INPUTS:
- CURRENT_STATE: {{state_snapshot_json}}
- SEASON_GOALS: {{season_goals_json}}
- THREADS: {{threads_json}}
- OPERATORS: {{operators_json}}
- CLIFFHANGER_CONSTRAINTS: {{cliffhanger_json}}

TASK:
Plan a 30-minute episode (18-24 scenes).

Requirements:
- Advance at least 2 threads
- Do not fully resolve more than 1 major thread
- Include exactly one: REVEAL, REVERSAL, CONFRONTATION, CLIFFHANGER
- Every beat must reference operator_id(s) and list prereqs
- Every beat must specify required_deltas

OUTPUT:
{
  "episode_id": "...",
  "objectives": { "faction_id": "goal" },
  "beats": [...],
  "scenes": [...],
  "acceptance_checks": [...]
}
```

### 6.2 Agent Proposal Prompt

**Model:** Haiku

```
SYSTEM:
Output JSON only.

INPUTS:
- CHARACTER: {{character_json}}
- CURRENT_STATE: {{state_snapshot_json}}
- OPERATORS: {{relevant_operators_json}}

TASK:
Propose 3 candidate moves consistent with this character's BDI.
Return expected deltas and key risk for each.

OUTPUT:
{
  "character_id": "...",
  "moves": [
    {
      "operator_id": "...",
      "target": "...",
      "rationale": "...",
      "expected_deltas": {...},
      "risk": "...",
      "priority": 0.0-1.0
    }
  ]
}
```

### 6.3 Writer Prompt

**Model:** Sonnet (Opus for marquee scenes: cold opens, reversals, finales)

```
SYSTEM:
You are the Writer.

STYLE_GUIDE: {{style_guide_md}}
LEXICON: {{lexicon_md}}
SCENE_PACKET: {{scene_packet_json}}

INSTRUCTIONS:
1. Review director_instructions.sequence
2. For each beat, follow narrative_directives strictly
   - If outcome is FAIL, write the failure
   - Use visual_cues from operator data
3. Include all REQUIRED_DELTAS via explicit events/dialogue
4. Voice control:
   - Check every line against Forbidden Anachronisms
   - Court/Villa: use 1 rhetorical device (anaphora, sententia)
   - Street/Port: use Thriller Mode (short sentences)
5. End with hook line per constraints.hook_requirement

OUTPUT FORMAT:
---SCENE_TEXT---
[screenplay-style prose]

---CLAIMS---
[JSON array of new facts introduced]

---SCENE_EVENTS---
[JSON array of events with operator alignments]
```

### 6.4 Verifier Prompt (LLM Critic)

**Model:** Haiku (escalate to Sonnet if too lax)

```
SYSTEM:
Output JSON only.

INPUTS:
- SCENE_TEXT: {{scene_text}}
- SCENE_PACKET: {{scene_packet_json}}
- CLAIMS: {{claims_json}}
- SCENE_EVENTS: {{scene_events_json}}

TASK:
Evaluate scene for:
1. Plan compliance - did it accomplish required beats?
2. Delta coverage - are all required_deltas depicted?
3. Hook presence - does it end with a button line?
4. Voice consistency - no anachronisms, correct register?

OUTPUT:
{
  "verdict": "PASS|FAIL",
  "violations": [{"type": "...", "rule": "...", "message": "..."}],
  "warnings": [...],
  "fix_instructions": [...]
}
```

---

## 7. Model Routing

### 7.1 Default Assignment

| Role | Model | Notes |
|------|-------|-------|
| Director/Planner | Sonnet | Complex multi-constraint reasoning |
| Writer | Sonnet | Creative prose generation |
| Agent Proposals | Haiku | Simple character-voice tasks |
| Critic/Summarizer | Haiku | Quick evaluation passes |
| Escalation | Opus | Repeated failures, season synthesis |

### 7.2 Escalation Policy

- Scene fails deterministically 2x → tighten constraints, escalate Writer to Opus
- Episode plan produces infeasible prereqs → escalate Director or expand operator set
- Same scene fails 3x → fallback to simplified operator set, log for manual review

---

## 8. State Transitions

### 8.1 Truth Hierarchy

1. **Objective truth:** World state JSON files (authoritative)
2. **Agent beliefs:** Per-character BDI (may contradict reality)
3. **Narrated text:** Never truth unless converted to approved deltas

### 8.2 Delta Operations

```json
{
  "deltas": [
    { "path": "world.global.unrest", "op": "add", "value": 2 },
    { "path": "assets.cash_ledger", "op": "transfer", "from": "char_a", "to": "char_b", "denarii": 5000 },
    { "path": "secrets.sec_001.status", "op": "set", "value": "revealed" }
  ]
}
```

**Operations:** `add`, `subtract`, `set`, `multiply`, `transfer`, `append`, `remove`

### 8.3 Delta Path Resolution

All delta paths are **absolute** and map directly to the repository structure:

| Path Prefix | Resolves To |
|-------------|-------------|
| `world.*` | `world.json` |
| `characters.*` | `characters.json` |
| `relationships.*` | `relationships.json` |
| `assets.*` | `assets.json` |
| `secrets.*` | `secrets.json` |
| `threads.*` | `threads.json` |
| `factions.*` | `factions.json` |

**Examples:**

```json
// Modify a character stat
{ "path": "characters.char_varo.stats.wealth", "op": "subtract", "value": 5000 }

// Modify a relationship weight
{ "path": "relationships.rel_varo_quintus.weights.fear", "op": "add", "value": 10 }

// Append to an array
{ "path": "characters.char_varo.bdi.intentions", "op": "append", "value": { "id": "i_new", "operator_id": "OP_FLEE", "commitment": 0.8 } }

// Remove from an array (by ID)
{ "path": "characters.char_varo.bdi.intentions", "op": "remove", "match": { "id": "i_varo_1" } }

// Transfer between ledger entries
{ "path": "assets.cash_ledger", "op": "transfer", "from": "char_varo", "to": "char_drusilla", "denarii": 10000 }
```

### 8.4 Scene Packet Delta Shorthand

In scene packets, the Director may use **shorthand paths** for readability:

| Shorthand | Expansion (given actor=char_varo, target=char_quintus) |
|-----------|--------------------------------------------------------|
| `actor.stats.wealth` | `characters.char_varo.stats.wealth` |
| `target.bdi.intentions` | `characters.char_quintus.bdi.intentions` |
| `relationship.weights.fear` | `relationships.rel_varo_quintus.weights.fear` |

The State Engine expands shorthand before applying deltas. Committed deltas in `episode_deltas.json` always use absolute paths.

### 8.5 Claims Handling

Writer claims are:
1. Checked against `allowed_inventions` limits
2. Accepted → written to canonical state
3. Rejected → forced out via regeneration
4. Downgraded → converted to rumors/beliefs (if useful but not canon)

### 8.6 Automatic Decay (Entropy Pass)

Before commit, apply decay to active secrets:

```
factor = 0.5 ^ (1 / half_life_episodes)
new_value = current_value * factor
```

If `legal_value` AND `public_damage` both drop below 0.15, secret becomes `inert` and is removed from retrieval index.

---

## 9. Verification

### 9.1 Hard Constraints (Deterministic)

Violations trigger immediate regeneration:
- Dead characters cannot act/speak
- No double-spend (ledger must balance)
- No teleportation within scene
- Operator prerequisites must be satisfied
- Required deltas must appear in scene events

### 9.2 Soft Constraints (Quality Gates)

Violations trigger warnings; may pass with LLM critic approval:
- Each scene ends with hook/button line
- Episode includes all mandatory beat types
- Threads progress within cadence constraints
- Mechanism plausibility (minimal causal explanation)

### 9.3 Regeneration Budget

| Scope | Limit |
|-------|-------|
| Per scene | 2 attempts |
| Per episode | 12 total scene regenerations |
| Fallback | Repair mode: rewrite 2-3 scene block with simplified operators |

### 9.4 Failure Response

| Failure Type | Response |
|--------------|----------|
| Schema/format | Regenerate with stricter JSON-only instructions |
| Invariant violation | Regenerate with explicit prohibitions at prompt top |
| Plan compliance | Regenerate with required deltas restated |
| Quality | Punch-up pass on scene ending only |

---

## 10. Drama Metrics

Track in `episode_metrics.json`:

### 10.1 Metric Definitions

| Metric | Range | Calculation |
|--------|-------|-------------|
| **Tension** | 0-10 | `(threat_to_goals + scandal_temp + unrest) / 3` |
| **Pacing** | 0-10 | `meaningful_deltas_this_act / expected_deltas_per_act` |
| **Volatility** | 0-10 | `(narrative_swings + betrayals + reversals) / act_count` |

### 10.2 Director Response

| Condition | Action |
|-----------|--------|
| Pacing < 4 for 2 acts | Inject complication operator |
| Tension plateau (same value 3+ scenes) | Schedule confrontation |
| >2 threads near resolution | Defer one to next episode |

### 10.3 Thread Tracking

```json
{
  "thread_progress": {
    "thr_grain_shortage": { 
      "advanced": true, 
      "last_episode": 1,
      "episodes_since_progress": 0
    }
  }
}
```

Threads with `episodes_since_progress > max_cadence` get priority in next episode plan.

### 10.4 Thread Advancement Lifecycle

A thread is considered **advanced** when any of the following occur:

| Advancement Type | Criteria | Example |
|------------------|----------|---------|
| **Beat Reference** | A beat explicitly references the thread in `primary_thread_id` | Beat resolves a complication in the grain shortage |
| **Delta Impact** | An applied delta modifies state relevant to the thread | `world.global.grain_price_index` changes |
| **Secret Reveal** | A secret linked to the thread is revealed | Grain hoarding scheme exposed |
| **Relationship Shift** | A relationship central to the thread changes by ≥20 in any weight | Alliance between grain factions breaks |

**Thread State Transitions:**

```
open → advancing → resolved
         ↓
      stalled (if episodes_since_progress > max_cadence)
         ↓
      urgent (Director must prioritize)
```

**Update Process (Stage H - Commit):**

1. For each thread, check if any advancement criteria were met
2. If advanced: set `last_advanced_episode = current_episode`, `episodes_since_progress = 0`
3. If not advanced: increment `episodes_since_progress`
4. If thread is fully resolved: set `status = "resolved"`

### 10.5 Beat Type Taxonomy

Beats are the logical units of narrative action. Each beat has a type that defines its dramatic function.

| Type | Description | Requirements |
|------|-------------|--------------|
| **SETUP** | Establish situation, introduce problem | Must create tension or question |
| **REVEAL** | Expose hidden information | Must change at least one character's knowledge state |
| **REVERSAL** | Plan backfires, unexpected consequence | Must negate or invert a previous beat's outcome |
| **CONFRONTATION** | Direct conflict between characters | Must materially change a relationship |
| **DECISION** | Character commits to significant choice | Must trigger at least one operator |
| **CLIFFHANGER** | Unresolved tension at episode end | Must create immediate or near-term threat/question |

**Episode Requirements (Clarified):**

Every episode must include:
- At least 1 REVEAL
- At least 1 REVERSAL  
- At least 1 CONFRONTATION
- Exactly 1 CLIFFHANGER (always final beat)

Additional beat types (SETUP, DECISION) are used as needed but not mandated.

**Verification:** The Verifier checks beat type distribution during Stage F. Missing mandatory types trigger a planning-level failure, requiring Director regeneration.

---

## 11. Output Specifications

### 11.1 Episode Script

`episode_script.md` contains scenes in order:

```markdown
## SC04 — INT. VARO'S VILLA - NIGHT

**Cast:** Varo, Drusilla, Courier

Rain hammered the roof tiles. Varo stood at the map table, 
fingers tracing the coast of Asia Minor...

[dialogue and action]

> DRUSILLA: You're not angry. You're afraid.

The courier disappeared into the rain. The deed was done.
```

### 11.2 Recaps

Generated from deltas (not prose):
- "Previously on..." summary
- State dashboard: unrest, grain index, legal exposure, thread status

---

## 12. Safety

- Avoid glorifying cruelty; violence is consequential
- Handle slavery with care (historically present, not fetishized)
- Prefer implication over graphic detail
- Content levels are configurable per deployment

---

## 13. Roadmap

### v3.0 (Foundation — Core Pipeline)
**Priority: Implement First**

- JSON world bible + Git commits
- Expression language evaluator
- Operator library (25-40 operators)
- Director + Writer + Verifier pipeline (Stages A-H)
- BDI-lite proposals
- GraphRAG-lite retrieval (k-hop neighborhood extraction)
- Regeneration budgets + metrics
- Pipeline error recovery

### v3.1 (Production Pipeline)
**Priority: Implement After v3.0 is Stable**

- Voice synthesis via ElevenLabs (Stage I-B)
- Image generation via DALL-E 3 (Stage I-C)
- Video assembly via FFmpeg/MoviePy (Stage I-D)
- Visual DNA for characters and locations
- Performance blocks for dialogue delivery
- Casting registry with human-in-the-loop
- Storyboarder for visual beat selection (Stage I-A)

### v3.2 (Performance)
- SQLite index for faster state queries
- Event log (JSONL) + analytics dashboard
- Prompt caching for static world data

### v3.3 (Graph)
- Neo4j migration (same `retrieved_subgraph_json` interface)
- Path queries: patron chains, leverage paths

### v3.4 (Autonomy)
- HTN solver integration (if operator planning becomes limiting)
- Off-screen simulation ticks (agent actions between episodes)

---

## 14. Getting Started

### Minimum Viable Season Starter Kit

1. **Cast pack:** 10 principals with BDI, voice tags, initial relationships
2. **Operator library v1:** 25 operators with prereqs/effects/risks
3. **Threads list:** 6-10 season threads with cadence rules
4. **Style guide + lexicon:** Forbidden anachronisms, rhetorical markers
5. **Episode 1 plan:** Run end-to-end pipeline, tune budgets based on failures

### First Run Checklist

- [ ] Populate `/world/` with seed state
- [ ] Define season goals in `season_goals.json`
- [ ] Configure model routing (API keys, escalation thresholds)
- [ ] Run Stage A-H for Episode 1
- [ ] Review verifier reports
- [ ] Adjust constraints based on failure patterns
- [ ] Commit episode artifacts

---

## Appendices

| Appendix | Contents |
|----------|----------|
| [A. Schemas](spec/APPENDIX_A_SCHEMAS.md) | Complete JSON schemas for all data structures |
| [B. Operators](spec/APPENDIX_B_OPERATORS.md) | Full operator library with examples |
| [C. Examples](spec/APPENDIX_C_EXAMPLES.md) | Scene packets, episode plans, verifier reports, production artifacts |
| [D. Style](spec/APPENDIX_D_STYLE.md) | Voice rules, forbidden words, rhetorical devices, performance blocks |
| [E. Production](spec/APPENDIX_E_PRODUCTION.md) | Voice synthesis, image generation, video assembly pipeline |
