# SPEC_V2 — Aureus: Neuro-Symbolic Narrative Engine

## 0) Summary

SPEC_V2 is a practical neuro-symbolic architecture for generating serialized ~30-minute “soap engine wearing a thriller suit” episodes set in late Roman Republic vibes. It incorporates the critique’s valid points (explicit state persistence, planner→writer→verifier “sandwich,” agent mental models, causality via preconditions, drama/tension metrics) while preserving SPEC_V1’s buildability (structured JSON world bible, prompt chains, deterministic verification, Git-based persistence, incremental complexity).

The core contract is:

**Symbolic Planner (Director) → Neural Realizer (Writer) → Symbolic Verifier → Commit State**

LLMs propose and render; **truth and state transitions live outside** the LLM.

---

## 1) Goals and non-goals

### Goals

* Generate coherent **serialized** episodes (~30 min; 18–24 scenes).
* Maintain long-horizon continuity via an external, inspectable **world state** (facts, relationships, resources, secrets, threads).
* Produce “Billions-style” surface plots using repeatable Roman arenas: **courts + elections + grain**.
* Produce “soap-style” emotional propulsion: **betrayals, alliances, confessions, humiliation, status injury**.
* Provide an architecture that is:

  * auditable (why did a scene happen?)
  * correctable (regenerate only what failed)
  * branchable (alternate timelines)
  * incrementally upgradeable (JSON→Neo4j later, HTN-lite→HTN solver later)

### Non-goals (v2)

* Full historical simulation of 300 senators and strict chronology.
* A full HTN planner or full BDI agent framework with autonomous multi-day scheduling.
* On-the-fly ingestion of external datasets (e.g., DPRR). (You can add later; v2 assumes curated seed state.)

---

## 2) High-level system design

### 2.1 Components

1. **State Store (World Bible as Code)**

* Canonical truth lives in version-controlled JSON files.
* Every episode is a commit: plan, script, deltas, recaps.

2. **Director (HTN-lite / operator-based planner)**

* Selects goals and decomposes them into beats using an operator library.
* Ensures causal preconditions, pacing requirements, and mandatory beats.

3. **Agents (BDI-lite proposal layer)**

* Characters maintain Beliefs/Desires/Intentions; may diverge from objective world truth.
* Agents propose moves; Director chooses (scheduled autonomy).

4. **Retriever (GraphRAG-lite)**

* Builds local subgraphs from JSON (k-hop neighborhood, strongest edges, relevant secrets/threads) to condition writing.

5. **Writer (LLM)**

* Produces scene text *under constraints* and outputs structured “CLAIMS” and “SCENE_EVENTS” for verification.

6. **Verifier (Deterministic + LLM critic)**

* Deterministic checks enforce invariants and state accounting.
* LLM critic checks plan compliance and “did it actually do the deltas?”

7. **State Transition Engine**

* Applies approved deltas to the state store (not freeform text).
* Generates recaps and summaries from deltas.

---

## 3) Data model and persistence

### 3.1 Repository layout (recommended)

```
/world/
  world.json
  factions.json
  characters.json
  relationships.json
  assets.json
  secrets.json
  threads.json
  constraints.json
  operators.json
  style_guide.md
  lexicon.md
/seasons/
  season_01/
    season_goals.json
    pacing_targets.json
    episode_01/
      episode_plan.json
      episode_outline.json
      episode_script.md
      episode_scene_packets/SC01.json ... SC24.json
      episode_deltas.json
      episode_recaps.json
      episode_metrics.json
      verifier_report.json
```

### 3.2 Persistence strategy

* **Source of truth:** JSON files on disk.
* **Version control:** each episode commit captures:

  * the plan
  * the exact state at start/end
  * the deltas applied
  * verifier reports (why changes were accepted)

This supports:

* rollback
* debugging
* branching alternate timelines (“what if” seasons)

### 3.3 Core schemas

#### 3.3.1 `world.json`

```json
{
  "world_id": "res_publica_v2",
  "time": { "year_bce": 68, "season": "winter", "day": 12 },
  "locations": ["rome_forum", "senate_house", "ostia_port", "warehouses_aventine"],
  "global": {
    "unrest": 3,
    "grain_price_index": 1.1,
    "scandal_temperature": 2
  }
}
```

#### 3.3.2 `factions.json`

```json
{
  "factions": [
    {
      "id": "f_capital",
      "name": "Publicani Consortium",
      "stats": {
        "economic_position": 2,
        "legal_exposure": 1,
        "political_capital": 2,
        "public_narrative": 1
      }
    },
    {
      "id": "f_law",
      "name": "Moral Prosecutors",
      "stats": {
        "economic_position": 0,
        "legal_exposure": 0,
        "political_capital": 2,
        "public_narrative": 3
      }
    }
  ]
}
```

#### 3.3.3 `characters.json` (BDI-lite included)

```json
{
  "characters": [
    {
      "id": "char_marcus_livius",
      "name": "Marcus Livius",
      "archetype": "axe_like_financier",
      "faction_id": "f_capital",
      "stats": {
        "dignitas": 62,
        "auctoritas": 38,
        "wealth": 78,
        "popularity": 41
      },
      "status": {
        "alive": true,
        "location_id": "rome_forum",
        "injured": false,
        "wanted": false
      },
      "bdi": {
        "beliefs": [
          { "id": "b1", "text": "The praetor serves Senator Varro.", "confidence": 0.6 }
        ],
        "desires": [
          { "id": "d1", "text": "Avoid a public prosecution.", "priority": 0.9 },
          { "id": "d2", "text": "Control grain contracts this year.", "priority": 0.7 }
        ],
        "intentions": [
          { "id": "i1", "operator_id": "WITNESS_FLIP_OFFER", "commitment": 0.7 }
        ],
        "constraints": ["CANNOT_MAGICALLY_CREATE_FUNDS"]
      },
      "voice": {
        "tags": ["dry", "surgical", "counts-favors"],
        "tells": ["names debts precisely", "never raises his voice"]
      }
    }
  ]
}
```

#### 3.3.4 `relationships.json` (directed weighted edges)

```json
{
  "edges": [
    {
      "id": "rel_001",
      "from": "char_marcus_livius",
      "to": "char_praetor_cassianus",
      "type": "enemy",
      "weights": { "loyalty": 0, "fear": 22, "resentment": 71, "debt": 0 },
      "flags": { "knows_secrets": ["sec_ledger_kickbacks"] }
    },
    {
      "id": "rel_002",
      "from": "char_praetor_cassianus",
      "to": "char_senator_varro",
      "type": "patron_of",
      "weights": { "loyalty": 64, "fear": 10, "resentment": 5, "debt": 12 }
    }
  ]
}
```

#### 3.3.5 `assets.json` (money/grain/contracts)

```json
{
  "assets": {
    "grain": {
      "inventory_units": 120,
      "controlled_by": ["char_marcus_livius"],
      "warehouse_locations": ["warehouses_aventine"]
    },
    "contracts": [
      {
        "id": "con_grain_auction_68",
        "type": "grain_supply",
        "status": "pending",
        "stakeholders": ["char_marcus_livius", "char_senator_varro"]
      }
    ],
    "cash_ledger": [
      { "holder": "char_marcus_livius", "denarii": 800000 },
      { "holder": "char_praetor_cassianus", "denarii": 120000 }
    ]
  }
}
```

#### 3.3.6 `secrets.json`

```json
{
  "secrets": [
    {
      "id": "sec_ledger_kickbacks",
      "status": "active", // active, revealed, inert
      "stats": {
        "legal_value": 0.9,     // Use for court/arrest logic
        "public_damage": 0.8,   // Use for reputation/shame logic
        "credibility": 0.7      // The probability the secret is believed
      },
      "decay": {
        "half_life_episodes": 3,
        "applies_to": ["legal_value", "public_damage"], // Credibility usually doesn't decay naturally
        "last_decayed_episode": 1
      }
    }
  ]
}
```

#### 3.3.7 `threads.json`

```json
{
  "threads": [
    {
      "id": "thr_grain_shortage",
      "priority": 0.9,
      "question": "Will grain ships arrive before unrest breaks into violence?",
      "status": "open",
      "advance_cadence": { "max_episodes_without_progress": 2 }
    },
    {
      "id": "thr_inquiry_forms",
      "priority": 0.8,
      "question": "Will the praetor secure a commission and witnesses?",
      "status": "open",
      "advance_cadence": { "max_episodes_without_progress": 2 }
    }
  ]
}
```

#### 3.3.8 `constraints.json` (hard rules + soft style constraints)

```json
{
  "hard_constraints": [
    { "id": "H1", "rule": "A dead character cannot speak or act." },
    { "id": "H2", "rule": "A character cannot be in two locations in the same scene." },
    { "id": "H3", "rule": "Cash cannot be spent twice; ledger must balance." },
    { "id": "H4", "rule": "Major events must be triggered by an operator with satisfied prerequisites." }
  ],
  "soft_constraints": [
    { "id": "S1", "rule": "Avoid modern bureaucratic language; maintain Rome vibes." },
    { "id": "S2", "rule": "Every scene ends on a hook/button line." }
  ]
}
```

#### 3.3.9 `cliffhanger_constraints.json`

```json
{
  "cliffhanger_constraints": {
    "source_episode": "ep_01",
    "target_episode": "ep_02",
    "narrative_state": {
      "unresolved_scene_id": "SC24",
      "cliffhanger_type": "physical_danger" // or "revelation", "social_shame"
    },
    "temporal_constraints": {
      "must_start_immediately": true,
      "max_time_skip_allowed": "0 minutes"
    },
    "location_constraints": {
      "forced_start_location": "villa_varo_atrium",
      "locked_characters": ["char_caelus_varo", "char_quintus_fabius"]
    },
    "mandatory_opening_beat": {
      "description": "Must resolve the immediate threat of the knife.",
      "allowed_resolutions": ["fight", "surrender", "interruption"]
    }
  }
}
```

---

## 4) Operator library (HTN-lite backbone)

Operators are the “symbolic verbs” of the system. They encode:

* prerequisites (preconditions)
* intended deltas (what changes)
* costs/risks (heat, backlash)
* typical scene types

Note on Secret Decay: Agents are aware of decay. The BDI Planning layer (Stage B) treats high-value secrets as perishable assets.
  * High Decay: Encourages "Hot" operators (Immediate blackmail, swift publication).
  * Low Decay: Encourages "Cold" operators (Hoarding, long-term leverage).

If an agent waits too long, the secret becomes "old news" (inert) and the leverage is lost.

### 4.1 `operators.json` schema

```json
{
  "operators": [
    {
      "id": "GRAIN_SHOCK_DELAYED_SHIPS",
      "type": "thriller",
      "tags": ["grain", "market", "public_unrest"],
      "writer_guidance": {
        "visual_cues": "The grain ships are delayed. The sky is dark. The crowd is restless.",
        "dialogue_flavor": "The characters are worried about the grain shortage. They are discussing the potential for violence.",
        "success_beat": "The grain ships arrive. The crowd is relieved.",
        "fail_beat": "The grain ships do not arrive. The crowd is angry. The characters are worried about the potential for violence."
      },
      "prereqs": [
        { "expr": "world.global.grain_price_index >= 1.0" },
        { "expr": "assets.grain.inventory_units > 0" }
      ],
      "effects": [
        { "path": "world.global.unrest", "op": "add", "value": 2 },
        { "path": "world.global.grain_price_index", "op": "add", "value": 0.2 }
      ],
      "side_effect_risks": [
        { "id": "R1", "text": "Triggers Forum narrative backlash", "prob": 0.4 }
      ],
      "scene_suggestions": ["port_rumor", "warehouse_confrontation", "forum_speech"],
      "allowed_inventions": { "extras": 2, "new_facts": 1 }
    }
  ]
}
```

### 4.2 Two operator classes

* **Thriller operators:** ledger leak, witness flip, procedural delay, jury capture push, forum narrative blast, grain shock, contract rigging, legislative gambit, street pressure.
* **Soap operators:** betrayal for protection, misplaced trust, sacrifice play, forbidden alliance, humiliation, intimacy-as-leverage.

**Rule:** every episode must use a mix (e.g., 10–14 thriller ops; 6–10 soap ops), and every scene must map to ≥1 operator effect.

---

## 5) Planning and generation pipeline

### 5.1 Episode generation stages

**Stage A — Snapshot + Targets**
Inputs:

* `cliffhanger_constraints.json` (from previous episode)
* current world state (all JSON)
* season goals
* pacing targets
* active threads

Director Logic:

* If `cliffhanger_constraints` exists:
  * The Episode Plan MUST assign `Scene_01` to the `forced_start_location`.
  * `Scene_01` MUST address `mandatory_opening_beat`.
  * The Director is forbidden from scheduling unrelated events until this constraint is resolved (usually just Scene 1 or 2).

Outputs:

* `episode_context.json` (selected threads, characters, objectives)

**Stage B — Agent Proposals (BDI-lite)**
For each principal (or for 6–8 most relevant), produce 2–3 candidate moves:

* operator_id
* target(s)
* rationale
* expected deltas
* risk

Output:

* `agent_proposals.json`

**Stage C — Director Plan (HTN-lite)**
Director chooses:

* episode objectives per faction
* beat sheet (A/B/C threads)
* mandatory beats: reversal, reveal, confrontation, cliffhanger
* explicit operator selection with prerequisites and required deltas

Outputs:

* `episode_plan.json` (beats and scene targets)
* `episode_outline.json` (scene list with purpose)

**Stage D — Scene Packet Construction (GraphRAG-lite retrieval)**
For each scene:

* Hydrate Operators: Look up the selected `operator_id` in the library.
  * If the Plan says the operator SUCCEEDS: Copy `writer_guidance.success_beat` into the packet.
  * If the Plan says the operator FAILS: Copy `writer_guidance.fail_beat` into the packet.
  * Copy `visual_cues` and `dialogue_flavor` into the packet.
* Compile constraints: allowed inventions, forbidden facts, required deltas

Output per scene:

* `episode_scene_packets/SCxx.json`

**Stage E — Writing**
Writer generates:

* scene text (screenplay-ish)
* `CLAIMS` (new facts introduced)
* `SCENE_EVENTS` (structured event list aligned to operator effects)

Output:

* `episode_script.md` + per-scene text or embedded

**Stage F — Verification**

1. deterministic verifier:

* invariants (life, location, accounting, operator prerequisites)
* claims whitelist (max counts)
* scene-event alignment (did SCENE_EVENTS cover required deltas?)

2. LLM critic:

* plan compliance (did the scene accomplish the emotional and strategic turn?)
* hook requirement

Output:

* `verifier_report.json`

**Stage G — Repair / Regeneration**
If failure:

* regenerate only the failed scene (or minimal contiguous block)
* tighten forbidden list and explicitly restate what must happen
* escalate model only after repeated failures

**Stage H — Commit & Handover ... 3. Generate Cliffhanger Constraints:**

* Identify the final scene (SC24).
* Extract the closing situation (e.g., "Varo is arrested").
* Generate `cliffhanger_constraints.json` mapping the consequences for the immediate start of the next episode.
* Rule: If the cliffhanger was "High Urgency" (violence, arrest), set `must_start_immediately: true`. If "Low Urgency" (a letter arrives), allow time skip.

---

## 6) Prompt templates (concrete)

All prompts are designed to be cacheable and stable, with the changing inputs passed as variables.

### 6.1 Director: plan an episode (JSON only)

**Model:** Claude Sonnet (default); escalate to Opus on repeated plan failures.

```text
SYSTEM:
You are the Director. Output valid JSON only. No prose.

INPUTS:
CURRENT_STATE: {{state_snapshot_json}}
SEASON_GOALS: {{season_goals_json}}
PACING_TARGETS: {{pacing_targets_json}}
THREADS: {{threads_json}}
OPERATOR_LIBRARY: {{operators_json}}

TASK:
Plan a serialized 30-minute episode (18–24 scenes). Use courts+elections+grain.
Requirements:
- Advance at least 2 threads; do not fully resolve more than 1 major thread.
- Include exactly one: REVEAL beat, REVERSAL beat, CONFRONTATION beat, CLIFFHANGER beat.
- Every beat must reference operator_id(s) and list prereqs.
- Every beat must specify required_deltas (numeric) that update CURRENT_STATE paths.
- Produce an ordered scene list with scene_id, location_id, characters, beats_covered.

OUTPUT (JSON):
{
  "episode_id": "...",
  "objectives": {...},
  "beats": [...],
  "scenes": [...],
  "acceptance_checks": [...]
}
```

### 6.2 Agent move proposal (JSON only)

**Model:** Claude Haiku

```text
SYSTEM: Output JSON only.

INPUTS:
CHARACTER: {{character_json}}
CURRENT_STATE: {{state_snapshot_json}}
OPERATOR_LIBRARY: {{operators_subset_json}}

TASK:
Propose 3 candidate moves (operator_id + target) consistent with this character's BDI and constraints.
Return expected deltas and one key risk each.

OUTPUT JSON:
{ "character_id": "...", "moves": [ ... ] }
```

### 6.3 Scene writer (text + claims + events)

**Model:** Sonnet (default), Opus for marquee scenes (e.g., E1 cold open, midseason reversal, finales).

```text
SYSTEM:
You are the Writer. 
STYLE_GUIDE: {{style_guide_md}}
LEXICON: {{lexicon_md}}
SCENE_PACKET: {{scene_packet_json}}

INSTRUCTIONS:
1. Review the 'director_instructions.sequence'.
2. For each beat, strictly follow the 'narrative_directives'. 
   - If the directive says the action FAILS, you must write the failure (even if the character is competent).
   - Adopt the 'visual_cues' specified in the operator data.
3. Include all REQUIRED_DELTAS via explicit events/dialogue.
4. VOICE CONTROL:
   - Check every line of dialogue against the 'Forbidden Anachronisms' list.
   - If the scene is in a Court or Villa, use 1 instance of 'Anaphora' or 'Sententia'.
   - If the scene is in the Subura or Port, use 'Thriller Mode' (short sentences).

```

### 6.4 Deterministic verifier (non-LLM)

Rules:

* JSON validity
* invariants
* prereqs satisfied
* accounting balances
* claims count constraints
* SCENE_EVENTS includes all required delta triggers

### 6.5 LLM critic verifier (JSON only)

**Model:** Haiku (default), Sonnet if Haiku is too lax.

```text
SYSTEM: Output JSON only.

INPUTS:
SCENE_TEXT: {{scene_text}}
SCENE_PACKET: {{scene_packet_json}}
CLAIMS: {{claims_json}}
SCENE_EVENTS: {{scene_events_json}}

TASK:
Return PASS/FAIL.
If FAIL: list minimal changes needed (not a rewrite plan), and specify which constraints were violated.

OUTPUT:
{ "verdict": "PASS|FAIL", "violations": [...], "fix_instructions": [...] }
```

---

## 7) Model routing (recommended)

### Default routing

* **Director / Planner:** Sonnet
* **Writer:** Sonnet
* **Extractor / Critic / Summarizer:** Haiku
* **Escalation (hard planning, repeated failures, season bible synthesis):** Opus

### Escalation policy

* If a scene fails deterministically twice → regenerate with tighter constraints and escalate writer once.
* If an episode plan repeatedly produces infeasible prereqs → escalate Director or increase operator availability.

---

## 8) State transitions and truth management

### 8.1 Truth sources

* **Objective truth:** world state JSON files.
* **Agent beliefs:** stored per character and may disagree with objective truth.
* **Narrated text:** never considered truth unless converted into structured deltas and accepted by verifier.

### 8.2 State updates

Only `episode_deltas.json` updates the world bible.

Example delta record:

```json
{
  "deltas": [
    { "path": "world.global.unrest", "op": "add", "value": 2, "reason": "GRAIN_SHOCK_DELAYED_SHIPS" },
    { "path": "assets.cash_ledger", "op": "transfer", "from": "char_marcus_livius", "to": "char_operator_wags", "denarii": 20000 }
  ]
}
```

### 8.3 Claims handling

Writer-produced claims are:

* checked against “allowed inventions”
* either:

  * accepted and written into canonical state (minor extras, minor location details)
  * rejected and forced out via regeneration
  * downgraded into rumors/beliefs (if useful but not canon)

### 8.4 Automatic State Evolution (The "Entropy" Pass)

Before the final commit of `episode_deltas.json`, the State Transition Engine runs the Entropy Pass. This is a deterministic calculation applied to `secrets` and `rumors`.

The Logic:

1. Identify all secrets with `status: "active"`.
2. Calculate decay factor: `factor = 0.5 ^ (1 / half_life_episodes)`.
3. Apply `new_value = current_value * factor` to all fields listed in `decay.applies_to`.
4. Rounding: Round to 2 decimal places.

The "Inert" Threshold:
  * If a secret's `public_damage` AND `legal_value` both drop below 0.15, the secret's status automatically transitions to `"inert"`.
  * Effect: Inert secrets are removed from the GraphRAG index. They exist in the file but are invisible to the Director and Writer (meaning characters "forget" to care about them).

---

## 9) Verification and error handling (explicit)

### 9.1 Deterministic invariants (hard fail)

* Dead characters cannot act/speak.
* No double-spend; ledger balances.
* No teleportation within a scene.
* Operator prerequisites must be satisfied before applying effects.
* Required deltas must be represented by SCENE_EVENTS for that scene.

### 9.2 Soft checks (quality gates)

* Each scene ends with a hook/button line.
* Episode includes: reveal, reversal, confrontation, cliffhanger.
* Threads progress within cadence constraints.
* Mechanism plausibility: the thriller move has at least minimal causal explanation (one or two lines; not an essay).

### 9.3 Regeneration budgets (defaults)

* **Per scene:** max 2 regenerations.
* **Per episode:** max 12 scene regenerations total.
* If budget exceeded:

  * fallback to “repair mode”: rewrite the smallest broken block (2–3 scenes) with a simplified operator set.

### 9.4 Failure classification and response

1. **Schema/format errors:** regenerate with stricter “JSON only” and lower creativity.
2. **Invariant violations:** regenerate scene with explicit prohibitions and canonical facts at top.
3. **Plan compliance failures:** regenerate with required deltas restated and SCENE_EVENTS template included.
4. **Quality failures:** do a “punch-up pass” rather than full regen (rewrite last 30–40% of the scene).

---

## 10) Drama management metrics (lightweight)

Maintain an `episode_metrics.json`:

* `tension` (0–10): derived from threat to goals + scandal temp + unrest.
* `pacing` (0–10): count of meaningful deltas per scene and per act.
* `volatility` (0–10): swings in public narrative + betrayals + reversals.
* `thread_progress`: per thread, last advanced episode index.

Director uses metrics to decide:

* inject complication operator if pacing too low
* schedule confrontation if tension plateaued
* avoid resolving too many threads early

---

## 11) Output specifications

### 11.1 Episode output

* `episode_script.md`: scenes in order; each scene labeled.
* Each scene includes:

  * location/time stamp
  * cast
  * concise action
  * dialogue
  * ending hook line

### 11.2 Recaps

Generated from deltas (not from script):

* Previously on…
* “State of play” dashboard: unrest, grain index, legal exposure, top secrets in motion (hidden to audience if desired), thread status.

---

## 12) Security and safety (project-level)

* Avoid glorifying cruelty; treat violence as consequential.
* If depicting slavery (historically present), handle with care; avoid fetishization; prefer implication over graphic detail unless explicitly desired.
* Keep content levels configurable.

---

## 13) Roadmap (incremental upgrades)

### V2.0 (this spec)

* JSON world bible + Git commits
* operator library (25–40 operators)
* Director + Writer + Verifier pipeline
* BDI-lite proposals
* GraphRAG-lite subgraph retrieval
* regeneration budgets + metrics

### V2.1 (optional)

* SQLite or lightweight graph index for faster queries
* richer event log (JSONL) + analytics

### V2.2 (optional)

* Neo4j migration behind the same `retrieved_subgraph_json` interface
* GraphRAG improvements (path queries: patron chains, leverage paths)

### V2.3 (optional)

* HTN solver integration (only if operator planning becomes limiting)
* stronger agent autonomy (off-screen simulation ticks)

---

## 14) Minimum viable “season starter kit” (what you should define first)

1. **Cast pack:** 10 principals with BDI, voice tags, initial relationships.
2. **Operator library v1:** 25 operators with prereqs/effects/risks.
3. **Threads list:** 6–10 season threads with cadence rules.
4. **Style guide + lexicon:** short constraints for Roman vibes, rhetoric markers, forbidden anachronisms list.
5. **Episode 1 plan:** run end-to-end pipeline and tune budgets/constraints based on failures.

---

## Appendix A: Instantiated Data Samples (The "Titan" Trio)

*Note: These files represent the state at the start of S01E01. This data validates the BDI, Relationship, and Secret schemas.*

### A.1 `characters.json`

This file instantiates the three principals. Note the specific BDI entries that drive the conflict: Varo plays offense (velocity), Quintus plays defense (morality), and Drusilla plays the referee (psychology).

```json
{
  "characters": [
    {
      "id": "char_caelus_varo",
      "name": "Caelus Varo",
      "archetype": "titan_financier",
      "faction_id": "f_capital",
      "stats": {
        "dignitas": 15,
        "auctoritas": 95,
        "wealth": 99,
        "popularity": 40
      },
      "status": {
        "alive": true,
        "location_id": "villa_varo_aventine",
        "injured": false,
        "wanted": false
      },
      "bdi": {
        "beliefs": [
          { "id": "b_varo_1", "text": "Information arriving one hour early is worth more than a province.", "confidence": 1.0 },
          { "id": "b_varo_2", "text": "The Senate is a theater for ugly people to pretend they are noble.", "confidence": 0.9 }
        ],
        "desires": [
          { "id": "d_varo_1", "text": "Crush the Asian tax contract auction before news of the Pontic revolt reaches the Forum.", "priority": 1.0 },
          { "id": "d_varo_2", "text": "Humiliate Quintus Fabius without technically breaking the law.", "priority": 0.6 }
        ],
        "intentions": [
          { "id": "i_varo_1", "operator_id": "OP_INFO_ARBITRAGE", "commitment": 0.9, "target": "contract_asia_minor" }
        ],
        "constraints": ["MUST_NOT_HOLD_PUBLIC_OFFICE"]
      },
      "voice": {
        "tags": ["staccato", "mathematical", "profane", "impatient"],
        "tells": ["tugs at short tunic", "checks sun position frequently", "interrupts pleasantries"]
      }
    },
    {
      "id": "char_quintus_fabius",
      "name": "Quintus Fabius Maximus",
      "archetype": "dogmatic_prosecutor",
      "faction_id": "f_law",
      "stats": {
        "dignitas": 90,
        "auctoritas": 60,
        "wealth": 15,
        "popularity": 45
      },
      "status": {
        "alive": true,
        "location_id": "domus_fabius_palatine",
        "injured": false,
        "wanted": false
      },
      "bdi": {
        "beliefs": [
          { "id": "b_quin_1", "text": "Profit without labor is a cancer on the Republic.", "confidence": 1.0 },
          { "id": "b_quin_2", "text": "My wife is the only thing keeping this house standing.", "confidence": 0.8 }
        ],
        "desires": [
          { "id": "d_quin_1", "text": "Secure the Consulship to restore the family name.", "priority": 1.0 },
          { "id": "d_quin_2", "text": "Find the 'smoking gun' ledger that links Varo to the pirate bribes.", "priority": 0.9 }
        ],
        "intentions": [
          { "id": "i_quin_1", "operator_id": "OP_SUBPOENA_WITNESS", "commitment": 0.8, "target": "char_varo_accountant" }
        ],
        "constraints": ["CANNOT_ACCEPT_BRIBE", "MUST_CITE_PRECEDENT"]
      },
      "voice": {
        "tags": ["archaic", "moralizing", "latin-purist", "defensive"],
        "tells": ["adjusts toga fold", "quotes Ennius", "refuses to look at gold coins"]
      }
    },
    {
      "id": "char_drusilla",
      "name": "Drusilla",
      "archetype": "stoic_broker",
      "faction_id": "f_law",
      "stats": {
        "dignitas": 85,
        "auctoritas": 75,
        "wealth": 60,
        "popularity": 30
      },
      "status": {
        "alive": true,
        "location_id": "domus_fabius_palatine",
        "injured": false,
        "wanted": false
      },
      "bdi": {
        "beliefs": [
          { "id": "b_dru_1", "text": "Men differ only in the price of their toys.", "confidence": 0.9 },
          { "id": "b_dru_2", "text": "Varo is a sharp blade; Quintus is a heavy shield. I need both.", "confidence": 0.95 }
        ],
        "desires": [
          { "id": "d_dru_1", "text": "Prevent Quintus from discovering my investment portfolio managed by Varo.", "priority": 1.0 },
          { "id": "d_dru_2", "text": "Talk Varo out of a rage state before he does something rash.", "priority": 0.8 }
        ],
        "intentions": [
          { "id": "i_dru_1", "operator_id": "OP_MEDIATE_CONFLICT", "commitment": 0.7, "target": "rel_varo_quintus" }
        ],
        "constraints": ["CANNOT_BE_SEEN_IN_SUBURA"]
      },
      "voice": {
        "tags": ["clinical", "stoic", "low-volume", "diagnostic"],
        "tells": ["unblinking eye contact", "perfect posture", "silence as a weapon"]
      }
    }
  ]
}

```

### A.2 `relationships.json`

This defines the "Triangle of Tension." Note the asymmetric weights: Quintus hates Varo, but Varo mostly views Quintus as an obstacle. Drusilla is the bridge.

```json
{
  "edges": [
    {
      "id": "rel_varo_quintus",
      "from": "char_caelus_varo",
      "to": "char_quintus_fabius",
      "type": "adversary",
      "weights": { "loyalty": 0, "fear": 10, "resentment": 40, "respect": 20 },
      "flags": { "public_feud": true }
    },
    {
      "id": "rel_quintus_varo",
      "from": "char_quintus_fabius",
      "to": "char_caelus_varo",
      "type": "adversary",
      "weights": { "loyalty": 0, "fear": 30, "resentment": 95, "respect": 5 },
      "flags": { "public_feud": true }
    },
    {
      "id": "rel_varo_drusilla",
      "from": "char_caelus_varo",
      "to": "char_drusilla",
      "type": "confidante",
      "weights": { "loyalty": 85, "fear": 5, "resentment": 0, "dependency": 70 },
      "flags": { "transactional": true, "therapist_dynamic": true }
    },
    {
      "id": "rel_quintus_drusilla",
      "from": "char_quintus_fabius",
      "to": "char_drusilla",
      "type": "spouse",
      "weights": { "loyalty": 90, "fear": 40, "resentment": 10, "dependency": 90 },
      "flags": { "financial_separation": true }
    }
  ]
}

```

### A.3 `secrets.json`

Here is the "instantiated data" that creates the plot hook. This secret binds the three characters together in a way that generates immediate dramatic tension.

```json
{
  "secrets": [
    {
      "id": "sec_drusilla_short_position",
      "subject_ids": ["char_drusilla", "char_caelus_varo"],
      "holders": ["char_drusilla", "char_caelus_varo", "char_varo_chief_clerk"],
      "description": "Drusilla is using knowledge of her husband's upcoming indictments to short-sell tax shares through Varo's syndicate.",
      "proof": { "type": "ledger_entry", "credibility": 1.0, "location": "villa_varo_aventine_safe" },
      "legal_value": 1.0,
      "public_damage": 1.0,
      "decay": { "half_life_episodes": 6 },
      "visibility": "hidden",
      "narrative_function": "The ticking time bomb that destroys the marriage."
    }
  ]
}

```

### A.4 `assets.json` (Snippet)

Validating the "Superpower" mechanics described in the character breakdown.

```json
{
  "assets": {
    "networks": [
      {
        "id": "net_varo_express",
        "name": "The Relay",
        "owner": "char_caelus_varo",
        "type": "intelligence",
        "stats": { "velocity_bonus_days": 3, "reliability": 0.9 },
        "upkeep_cost": 5000
      }
    ],
    "offices": [
      {
        "id": "off_quaestio_repetundis",
        "name": "Extortion Court Presidency",
        "owner": "char_quintus_fabius",
        "type": "legal_authority",
        "powers": ["SUBPOENA", "FREEZE_ASSETS", "INDICT"]
      }
    ]
  }
}

```

---

## Appendix B: Core Operator Library

*Note: In the final file, these are all inside a single `operators` array. They are grouped here for design clarity.*

### B.1 The "Thriller" Operators (Strategy, Law, Finance)

These operators change the *external* world state (Assets, Laws, Public Opinion).

```json
{
  "operators": [
    {
      "id": "OP_WITNESS_FLIP_FINANCIAL",
      "type": "thriller",
      "tags": ["legal", "corruption", "investigation"],
      "prereqs": [
        { "expr": "actor.wealth > target.wealth * 10" },
        { "expr": "target.stats.loyalty < 50" }
      ],
      "effects": [
        { "path": "actor.assets.cash_ledger", "op": "subtract", "value": 5000 },
        { "path": "target.bdi.intentions", "op": "add", "value": "TESTIFY_FOR_ACTOR" }
      ],
      "side_effect_risks": [
        { "id": "risk_double_cross", "text": "Witness takes money but stays loyal", "prob": 0.2 },
        { "id": "risk_entrapment", "text": "Offer recorded by opponent", "prob": 0.1 }
      ],
      "scene_suggestions": ["bathhouse_meeting", "slave_proxy_exchange", "midnight_garden"]
    },
    {
      "id": "OP_ASSET_FREEZE",
      "type": "thriller",
      "tags": ["legal", "attack", "aggressive"],
      "prereqs": [
        { "expr": "actor.offices includes 'powers.FREEZE_ASSETS'" },
        { "expr": "world.global.legal_exposure > 2" }
      ],
      "effects": [
        { "path": "target.assets.frozen", "op": "set", "value": true },
        { "path": "target.stats.dignitas", "op": "subtract", "value": 10 },
        { "path": "world.global.unrest", "op": "add", "value": 1 }
      ],
      "side_effect_risks": [
        { "id": "risk_market_crash", "text": "Panic in the Forum causes general market dip", "prob": 0.4 }
      ],
      "scene_suggestions": ["forum_proclamation", "bank_run", "doorstep_writ_delivery"]
    },
    {
      "id": "OP_INFORMATION_ARBITRAGE",
      "type": "thriller",
      "tags": ["finance", "market", "speed"],
      "prereqs": [
        { "expr": "actor.assets.networks.velocity_bonus_days >= 2" },
        { "expr": "actor.assets.cash_ledger > 10000" }
      ],
      "effects": [
        { "path": "actor.assets.cash_ledger", "op": "multiply", "value": 1.5 },
        { "path": "target.stats.wealth", "op": "subtract", "value": 20 }
      ],
      "side_effect_risks": [
        { "id": "risk_senate_inquiry", "text": "Senate investigates insider trading", "prob": 0.3 }
      ],
      "scene_suggestions": ["courier_arrival_exhausted", "quiet_buying_spree", "war_room_calculations"],
      "allowed_inventions": { "new_facts": 0, "extras": 1 }
    },
    {
      "id": "OP_RUMOR_CAMPAIGN",
      "type": "thriller",
      "tags": ["politics", "reputation", "low_blow"],
      "prereqs": [
        { "expr": "actor.knowledge includes target_secret_id" }
      ],
      "effects": [
        { "path": "target.stats.popularity", "op": "subtract", "value": 15 },
        { "path": "target.stats.dignitas", "op": "subtract", "value": 5 },
        { "path": "world.global.scandal_temperature", "op": "add", "value": 2 }
      ],
      "side_effect_risks": [
        { "id": "risk_blowback", "text": "Source traced back to actor", "prob": 0.25 }
      ],
      "scene_suggestions": ["graffiti_painting", "tavern_gossip", "opponent_heckled_in_forum"]
    },
    {
      "id": "OP_DESTROY_EVIDENCE",
      "type": "thriller",
      "tags": ["crime", "coverup", "urgent"],
      "prereqs": [
        { "expr": "actor.location == evidence.location" }
      ],
      "effects": [
        { "path": "evidence.status", "op": "set", "value": "destroyed" },
        { "path": "world.global.legal_exposure", "op": "subtract", "value": 2 }
      ],
      "side_effect_risks": [
        { "id": "risk_witnessed", "text": "A servant sees the destruction", "prob": 0.5 }
      ],
      "scene_suggestions": ["burning_ledger", "sinking_boat", "bribing_scribe"]
    },
    {
      "id": "OP_FOMENT_RIOT",
      "type": "thriller",
      "tags": ["violence", "chaos", "last_resort"],
      "prereqs": [
        { "expr": "world.global.unrest > 4" },
        { "expr": "actor.stats.popularity > 60" }
      ],
      "effects": [
        { "path": "world.global.unrest", "op": "add", "value": 3 },
        { "path": "world.locations.courts", "op": "set", "value": "closed" }
      ],
      "side_effect_risks": [
        { "id": "risk_assassination", "text": "Actor targeted by rival gangs", "prob": 0.3 }
      ],
      "scene_suggestions": ["demagogic_speech", "storefront_smashing", "senators_fleeing"]
    }
  ]
}

```

### B.2 The "Soap" Operators (Relationships, Emotions, Status)

These operators change the *internal* agent models (Beliefs, Loyalty, Secrets).

```json
{
  "operators": [
    {
      "id": "OP_PUBLIC_SNUB",
      "type": "soap",
      "tags": ["status", "humiliation", "power_move"],
      "prereqs": [
        { "expr": "actor.stats.auctoritas > target.stats.auctoritas" },
        { "expr": "actor.location == target.location" }
      ],
      "effects": [
        { "path": "target.stats.dignitas", "op": "subtract", "value": 8 },
        { "path": "relationship.resentment", "op": "add", "value": 15 },
        { "path": "target.bdi.desires", "op": "add", "value": "REVENGE" }
      ],
      "side_effect_risks": [
        { "id": "risk_sympathy", "text": "Crowd sides with the victim", "prob": 0.1 }
      ],
      "scene_suggestions": ["refusing_handshake", "taking_best_seat", "ignoring_greeting"]
    },
    {
      "id": "OP_CONFESSION_VULNERABLE",
      "type": "soap",
      "tags": ["intimacy", "trust", "bonding"],
      "prereqs": [
        { "expr": "relationship.trust > 60" }
      ],
      "effects": [
        { "path": "actor.stats.stress", "op": "subtract", "value": 5 },
        { "path": "relationship.loyalty", "op": "add", "value": 10 },
        { "path": "target.knowledge", "op": "add", "value": "actor_secret_id" }
      ],
      "side_effect_risks": [
        { "id": "risk_leverage", "text": "Target now owns dangerous info", "prob": 1.0 }
      ],
      "scene_suggestions": ["late_night_wine", "post_defeat_collapse", "pillow_talk"]
    },
    {
      "id": "OP_MARRIAGE_ALLIANCE_OFFER",
      "type": "soap",
      "tags": ["family", "transaction", "long_game"],
      "prereqs": [
        { "expr": "actor.family.status == 'unmarried'" },
        { "expr": "target.family.status == 'unmarried'" }
      ],
      "effects": [
        { "path": "relationship.type", "op": "set", "value": "betrothed" },
        { "path": "actor.assets.wealth", "op": "add", "value": "dowry_amount" },
        { "path": "actor.factions.political_capital", "op": "add", "value": 5 }
      ],
      "side_effect_risks": [
        { "id": "risk_unhappy", "text": "Personal misery penalty to efficiency", "prob": 0.6 }
      ],
      "scene_suggestions": ["fathers_negotiating", "awkward_introduction", "signing_contract"]
    },
    {
      "id": "OP_BACKCHANNEL_NEGOTIATION",
      "type": "soap",
      "tags": ["diplomacy", "secret", "pragmatic"],
      "prereqs": [
        { "expr": "actor.relationship(target).type == 'adversary'" },
        { "expr": "actor.relationship(target).hidden_respect > 20" }
      ],
      "effects": [
        { "path": "world.global.tension", "op": "subtract", "value": 2 },
        { "path": "relationship.agreement", "op": "set", "value": "temporary_truce" }
      ],
      "side_effect_risks": [
        { "id": "risk_base_anger", "text": "Core supporters feel betrayed", "prob": 0.4 }
      ],
      "scene_suggestions": ["unmarked_carriage", "neutral_ground_temple", "written_cipher"]
    },
    {
      "id": "OP_STOIC_COUNSEL",
      "type": "soap",
      "tags": ["psychology", "calm", "manipulation"],
      "prereqs": [
        { "expr": "actor.archetype == 'stoic_broker'" },
        { "expr": "target.stats.impulse_control < 30" }
      ],
      "effects": [
        { "path": "target.bdi.intentions", "op": "remove", "value": "RASH_ACTION" },
        { "path": "relationship.dependency", "op": "add", "value": 5 }
      ],
      "side_effect_risks": [],
      "scene_suggestions": ["garden_walk", "quoting_philosophy", "cold_stare"]
    },
    {
      "id": "OP_BETRAYAL_FOR_SURVIVAL",
      "type": "soap",
      "tags": ["reversal", "tragedy", "climactic"],
      "prereqs": [
        { "expr": "actor.stats.legal_jeopardy > 80" },
        { "expr": "relationship.loyalty < actor.stats.fear" }
      ],
      "effects": [
        { "path": "actor.stats.legal_jeopardy", "op": "set", "value": 0 },
        { "path": "target.stats.legal_jeopardy", "op": "set", "value": 100 },
        { "path": "relationship.type", "op": "set", "value": "nemesis" }
      ],
      "side_effect_risks": [
        { "id": "risk_social_death", "text": "Actor labeled a traitor by society", "prob": 0.9 }
      ],
      "scene_suggestions": ["courtroom_finger_point", "locking_door", "tearful_apology"]
    }
  ]
}

```

---

## Appendix C: Scene Packet Schema (The Interface)

*This file (`/episode_scene_packets/SC04.json`) represents the input state passed to the Writer. It contains exactly enough world state for the LLM to write the scene, and no more.*

### Scenario Context

**Scene 04:** Varo’s private villa. Varo has just received early intelligence about a rebellion in Asia Minor via his fast horses. He is manic, preparing to short-sell tax contracts before the Senate finds out. Drusilla arrives to warn him that this move will destroy her husband's reputation (since he is the judge overseeing these contracts).

```json
{
  "packet_meta": {
    "episode_id": "ep_01_wolves_of_rome",
    "scene_id": "SC04",
    "sequence": 4,
    "estimated_duration_min": 2.5
  },
  "setting": {
    "location_id": "villa_varo_tablinum",
    "time_of_day": "late_night",
    "atmosphere": ["manic energy", "shadows", "scuttering slaves"],
    "weather": "heavy rain"
  },
  "cast": [
    {
      "character_id": "char_caelus_varo",
      "mood": "euphoric_aggressive",
      "active_objective": "Execute the trade before sunrise."
    },
    {
      "character_id": "char_drusilla",
      "mood": "calculated_fear",
      "active_objective": "Talk him down using Stoic logic, not emotional pleading."
    }
  ],
  "retrieved_subgraph": {
    "note": "GraphRAG-lite extraction (k=1 hops from participants + active threads)",
    "relationships": [
      {
        "source": "char_caelus_varo",
        "target": "char_drusilla",
        "type": "confidante",
        "dynamic": "Varo respects her intellect but underestimates her agency."
      }
    ],
    "relevant_assets": [
      {
        "id": "net_varo_express",
        "status": "active",
        "context": "Couriers just arrived 3 days ahead of Senate mail."
      },
      {
        "id": "contract_asia_minor",
        "status": "stable",
        "context": "Currently priced high; will crash when rebellion news hits."
      }
    ],
    "relevant_beliefs": [
      {
        "holder": "char_caelus_varo",
        "text": "Information velocity is the only real currency."
      },
      {
        "holder": "char_drusilla",
        "text": "Varo is a sharp blade that cuts the hand if held too tight."
      }
    ]
  },
  "director_instructions": {
    "beat_type": "confrontation",
    "pacing": "fast",
    "conflict": "Varo wants chaos; Drusilla wants order.",
    "sequence": [
      {
        "beat_id": "b_04_a",
        "operator_id": "OP_INFORMATION_ARBITRAGE",
        "actor": "char_caelus_varo",
        "outcome": "SUCCESS",
        "narrative_directives": {
          "action": "The exchange of money/orders must be physical. Focus on speed.",
          "beat_resolution": "The runner departs immediately. The deed is done."
        },
        "required_deltas": [
           { "path": "assets.cash", "change": "-500", "description": "Varo pays the runner" }
        ]
      },
      {
        "beat_id": "b_04_b",
        "operator_id": "OP_STOIC_COUNSEL",
        "actor": "char_drusilla",
        "outcome": "FAIL",
        "narrative_directives": {
          "action": "Actor uses logic/philosophy to cool the Target. Target is too manic/emotional to hear it.",
          "beat_resolution": "Target interrupts or talks over the Actor. The counsel is rejected."
        }
      }
    ]
  },
  "constraints": {
    "required_deltas": [
      {
        "path": "actor.assets.cash_ledger",
        "op": "multiply",
        "value": 1.5,
        "narrative_trigger": "Varo hands the sealed order to his runner."
      },
      {
        "path": "relationship.fear",
        "op": "add",
        "value": 10,
        "narrative_trigger": "Drusilla realizes Varo does not care about collateral damage."
      }
    ],
    "forbidden_facts": [
      "Cannot mention the specific name of the rebel leader (history undefined).",
      "Drusilla cannot reveal her 'short position' secret yet."
    ],
    "allowed_inventions": {
      "extras": 2, 
      "new_props": ["a soaked map of Asia Minor", "a half-eaten fig"]
    },
    "hook_requirement": "End with the runner leaving into the rain. The deed is done. Drusilla is left standing alone in the room."
  }
}

```

### Why this Schema Works

1. **Deterministic Logic:** The `required_deltas` tell the Writer *exactly* what state changes must be depicted in the text. The Writer doesn't decide if Varo succeeds; the packet dictates it.
2. **Operator Alignment:** By marking `OP_STOIC_COUNSEL` as "MUST_FAIL," we instruct the Writer to generate dialogue where Drusilla makes her best arguments, but Varo overrides them. This creates specific dramatic friction.
3. **GraphRAG Context:** The `retrieved_subgraph` prevents hallucination. The Writer knows about the "Couriers" and the "Asian Contract" but doesn't need to know about unrelated grain prices in Ostia.

This fills the gap between the high-level **Plan** and the low-level **Scene Packet**. The Director's output is essentially a "compiled" list of these objects.

---

## Appendix D: Director Output Schemas (`episode_plan.json`)

The Director (Stage C) outputs a JSON file containing two primary arrays: `beats` (the logical flow of drama) and `scenes` (the physical container for that drama).

### D.1 The Beat Schema

A "Beat" is the atomic unit of narrative progress. In this architecture, **a beat is a promise to execute an Operator.**

```json
{
  "beat_schema": {
    "id": "beat_04_b",
    "type": "CONFRONTATION", 
    "description": "Drusilla tries to talk Varo out of the market attack using stoic logic.",
    "primary_thread_id": "thr_main_rivalry",
    "associated_operators": [
      {
        "operator_id": "OP_STOIC_COUNSEL",
        "actor_id": "char_drusilla",
        "target_id": "char_caelus_varo",
        "intent": "fail"
      }
    ],
    "emotional_value": {
      "tension_delta": 2,
      "hope_delta": -1
    },
    "required_outcome": "Varo rejects the counsel; Drusilla realizes he is dangerous."
  }
}

```

**Key Fields:**

* **`type`**: Standard dramatic units (SETUP, REVEAL, REVERSAL, CONFRONTATION, DECISION, CLIFFHANGER).
* **`associated_operators`**: The specific moves from `operators.json` this beat acts out.
* **`intent`**: Crucial for the Writer. Does the operator succeed (`pass`) or fail (`fail`)? This determines the dialogue.

### D.2 The Scene Schema

A "Scene" is a cluster of beats occurring in one location at one time.

```json
{
  "scene_schema": {
    "scene_id": "SC04",
    "slug": "INT. VARO'S VILLA - NIGHT",
    "location_id": "villa_varo_tablinum",
    "characters": ["char_caelus_varo", "char_drusilla", "char_extra_courier"],
    "beats_included": ["beat_04_a", "beat_04_b"],
    "pacing_notes": "Starts chaotic and fast, ends silent and heavy.",
    "constraints": {
      "must_include_prop": "wet_map_of_asia",
      "max_length_words": 450
    },
    "transition_out": "Cut to black on the thunderclap."
  }
}

```

### D.3 Example: How They Fit Together

Here is how the Director groups two beats into the Varo/Drusilla scene (SC04).

**Beat A (The Action):** Varo executes the trade (Thriller Operator).
**Beat B (The Reaction):** Drusilla fails to stop him (Soap Operator).

```json
{
  "episode_plan": {
    "beats": [
      {
        "id": "b_04_a",
        "type": "ACTION",
        "description": "Varo receives the courier and orders the short sell.",
        "associated_operators": [{ "operator_id": "OP_INFORMATION_ARBITRAGE", "actor_id": "char_caelus_varo" }]
      },
      {
        "id": "b_04_b",
        "type": "REACTION/CONFLICT",
        "description": "Drusilla attempts to intervene but is steamrolled.",
        "associated_operators": [{ "operator_id": "OP_STOIC_COUNSEL", "intent": "fail" }]
      }
    ],
    "scenes": [
      {
        "scene_id": "SC04",
        "beats_included": ["b_04_a", "b_04_b"],
        "location_id": "villa_varo_tablinum",
        "characters": ["char_caelus_varo", "char_drusilla"]
      }
    ]
  }
}

```

### Why this structure matters for your project:

1. **Scannability:** You can read the `beats` array to see the plot summary without wading through scene descriptions.
2. **Regeneration:** If the user dislikes *how* the scene was written but likes the *plot*, you keep the `beats` and just regenerate the `scene` text.
3. **Complex Scenes:** You can pack multiple beats into one scene (e.g., a dinner party might have 5 distinct beats: Arrival, Toast, Insult, Argument, Departure).

---

## Appendix E: Voice and Style Standards

These files are injected into the Writer's context to enforce the "Roman Noir" aesthetic.

### E.1 `style_guide.md`

**Core Pillars:**

1. **High Consequence:** Every conversation is a duel. No small talk. Even a greeting measures status.
2. **Specific Materiality:** Don't say "he was rich." Say "his tunic was dyed with Tyrian purple, double-dipped."
3. **The "Roman No"**: Romans rarely say "No" directly. They say "That would be difficult," or "The auguries are unclear." (Direct refusal is an insult).

**Mode Switching:**

* **Thriller Mode (The Street/The Port):** Short sentences. Active verbs. *Tacitus style.* "He stabbed. The boy fell. The grain spilled."
* **Soap Mode (The Villa/The Senate):** Complex sentences. Subordinate clauses. *Cicero style.* "Though he claims friendship, and though he breaks bread at my table, his hand yet seeks the dagger."

### E.2 `lexicon.md`

#### 1. Forbidden Anachronisms (The "Kill List")

*If the Writer generates these, the Verifier rejects the chunk.*

| Modern Concept | Forbidden Word | Roman Replacement |
| --- | --- | --- |
| **Time** | minute, second, hour, o'clock | "space of a breath," "while water flows," "third watch," "noon" |
| **Agreement** | okay, ok, sure, right, yeah | "It is well," "So be it," "Done," "Agreed" |
| **Authority** | police, cop, lawyer, boss | "Lictor," "Guard," "Advocate," "Patron," "Dominus" |
| **Math** | percent, statistic, average | "One part in ten," "The weight of it," "The count" |
| **Medical** | virus, germ, infection, depression | "Miasma," "The bad air," "Melancholia," "Black bile" |
| **Metaphor** | steam, train, clockwork, gunpowder | "millstone," "tide," "chariot wheel," "wildfire" |

#### 2. Rhetorical Markers (The "Flavor List")

*Use these sparingly (max 1 per scene) to flavor the dialogue.*

* **Sententia (The Maxim):** Ending a speech with a punchy, universal truth.
* *Example:* "Gold has no smell." / "The wolf does not bargain with the sheep."


* **Litotes (Understatement):** Denying the opposite to affirm the positive.
* *Example:* "He is not unknown to me" (He is my close friend/enemy). / "That is no small thing."


* **Anaphora (Repetition):** Repeating the start of phrases for emphasis (Senate/Formal only).
* *Example:* "He betrayed the city. He betrayed his father. He betrayed himself."


* **Casual Piety:** Treating gods as neighbors, not holy figures.
* *Example:* "By Hercules," "Castor's luck," "Juno's tits" (vulgar).
