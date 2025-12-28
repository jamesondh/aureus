# SPEC_V3 — Aureus: Neuro-Symbolic Narrative Engine

> **Version:** 3.0  
> **Status:** Working Draft  
> **Appendices:** [Schemas](spec/APPENDIX_A_SCHEMAS.md) | [Operators](spec/APPENDIX_B_OPERATORS.md) | [Examples](spec/APPENDIX_C_EXAMPLES.md) | [Style](spec/APPENDIX_D_STYLE.md)

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
```

### 3.2 Core Entities (Summary)

| Entity | Key Fields | Purpose |
|--------|------------|---------|
| **Character** | stats, status, bdi, voice | Agent with goals and mental model |
| **Relationship** | from, to, weights, flags | Directed edge with loyalty/fear/debt |
| **Secret** | holders, stats, decay | Information that can be revealed/used |
| **Thread** | question, priority, cadence | Audience-facing narrative promise |
| **Operator** | prereqs, effects, risks | Atomic "move" in the simulation |

### 3.3 Persistence Strategy

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

**Operations:** `add`, `subtract`, `set`, `multiply`, `transfer`

### 8.3 Claims Handling

Writer claims are:
1. Checked against `allowed_inventions` limits
2. Accepted → written to canonical state
3. Rejected → forced out via regeneration
4. Downgraded → converted to rumors/beliefs (if useful but not canon)

### 8.4 Automatic Decay (Entropy Pass)

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

### v3.0 (This Spec)
- JSON world bible + Git commits
- Operator library (25-40 operators)
- Director + Writer + Verifier pipeline
- BDI-lite proposals
- GraphRAG-lite retrieval
- Regeneration budgets + metrics

### v3.1 (Performance)
- SQLite index for faster state queries
- Event log (JSONL) + analytics dashboard
- Prompt caching for static world data

### v3.2 (Graph)
- Neo4j migration (same `retrieved_subgraph_json` interface)
- Path queries: patron chains, leverage paths

### v3.3 (Autonomy)
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
| [C. Examples](spec/APPENDIX_C_EXAMPLES.md) | Scene packets, episode plans, verifier reports |
| [D. Style](spec/APPENDIX_D_STYLE.md) | Voice rules, forbidden words, rhetorical devices |
