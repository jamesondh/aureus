# Appendix C: Example Artifacts

Working examples of the data structures produced during episode generation.

---

## C.1 Scene Packet

A scene packet is the input passed to the Writer. It contains exactly enough context to write the scene.

### Scenario

**Scene 04:** Varo's private villa. Varo has just received early intelligence about a rebellion in Asia Minor via his fast horses. He is manic, preparing to short-sell tax contracts before the Senate finds out. Drusilla arrives to warn him that this move will destroy her husband's reputation.

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
          "action": "Actor uses logic/philosophy to cool the Target.",
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
    "hook_requirement": "End with the runner leaving into the rain. The deed is done. Drusilla is left standing alone."
  }
}
```

### Why This Works

1. **Deterministic Logic:** The `required_deltas` tell the Writer exactly what state changes must be depicted. The Writer doesn't decide if Varo succeeds; the packet dictates it.

2. **Operator Alignment:** Marking `OP_STOIC_COUNSEL` as `FAIL` instructs the Writer to generate dialogue where Drusilla makes good arguments, but Varo overrides them.

3. **GraphRAG Context:** The `retrieved_subgraph` prevents hallucination. The Writer knows about "The Relay" and the Asian Contract but doesn't need unrelated details.

---

## C.2 Episode Plan

The Director outputs two arrays: `beats` (logical flow) and `scenes` (physical containers).

### Beat Schema

A beat is a promise to execute an operator.

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
- `type`: SETUP, REVEAL, REVERSAL, CONFRONTATION, DECISION, CLIFFHANGER
- `associated_operators`: The moves this beat executes
- `intent`: Does the operator succeed (`pass`) or fail (`fail`)?

### Scene Schema

A scene clusters beats in one location/time.

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

### Full Episode Plan Example

```json
{
  "episode_plan": {
    "episode_id": "ep_01_wolves_of_rome",
    "objectives": {
      "f_capital": "Execute information arbitrage before news spreads",
      "f_law": "Identify and approach a key witness"
    },
    "beats": [
      {
        "id": "b_01_a",
        "type": "SETUP",
        "description": "Establish grain crisis and public unrest.",
        "associated_operators": [
          { "operator_id": "OP_GRAIN_SHOCK", "actor_id": "world", "intent": "pass" }
        ]
      },
      {
        "id": "b_04_a",
        "type": "ACTION",
        "description": "Varo receives the courier and orders the short sell.",
        "associated_operators": [
          { "operator_id": "OP_INFORMATION_ARBITRAGE", "actor_id": "char_caelus_varo", "intent": "pass" }
        ]
      },
      {
        "id": "b_04_b",
        "type": "CONFRONTATION",
        "description": "Drusilla attempts to intervene but is steamrolled.",
        "associated_operators": [
          { "operator_id": "OP_STOIC_COUNSEL", "actor_id": "char_drusilla", "intent": "fail" }
        ]
      },
      {
        "id": "b_24_a",
        "type": "CLIFFHANGER",
        "description": "Quintus discovers Drusilla's ledger entry.",
        "associated_operators": [
          { "operator_id": "OP_REVEAL_SECRET", "actor_id": "world", "intent": "pass" }
        ]
      }
    ],
    "scenes": [
      {
        "scene_id": "SC01",
        "beats_included": ["b_01_a"],
        "location_id": "rome_forum",
        "characters": ["crowd", "char_grain_merchant"]
      },
      {
        "scene_id": "SC04",
        "beats_included": ["b_04_a", "b_04_b"],
        "location_id": "villa_varo_tablinum",
        "characters": ["char_caelus_varo", "char_drusilla"]
      },
      {
        "scene_id": "SC24",
        "beats_included": ["b_24_a"],
        "location_id": "domus_fabius_study",
        "characters": ["char_quintus_fabius"]
      }
    ],
    "acceptance_checks": [
      "At least 2 threads advanced",
      "No more than 1 thread fully resolved",
      "Contains REVEAL, REVERSAL, CONFRONTATION, CLIFFHANGER"
    ]
  }
}
```

### Structure Benefits

1. **Scannability:** Read `beats` for plot summary without scene details
2. **Regeneration:** Keep beats, regenerate only scene text if style fails
3. **Complex Scenes:** Pack multiple beats into one scene (dinner party with 5 beats)

---

## C.3 Agent Proposal

Output from BDI-lite proposal pass (Stage B).

```json
{
  "character_id": "char_caelus_varo",
  "current_context": {
    "location": "villa_varo_aventine",
    "active_threads": ["thr_asian_contract", "thr_rivalry_quintus"],
    "recent_events": ["courier_arrived_with_pontic_news"]
  },
  "moves": [
    {
      "operator_id": "OP_INFORMATION_ARBITRAGE",
      "target": "contract_asia_minor",
      "rationale": "I have 3-day velocity advantage. The contract will crash when rebellion news hits Forum. This is the trade of a lifetime.",
      "expected_deltas": {
        "wealth": "+50%",
        "scandal_temperature": "+1"
      },
      "risk": "Senate inquiry if traced",
      "priority": 1.0
    },
    {
      "operator_id": "OP_PUBLIC_SNUB",
      "target": "char_quintus_fabius",
      "rationale": "Humiliate him publicly to shake his confidence before the commission forms.",
      "expected_deltas": {
        "target.dignitas": -8,
        "relationship.resentment": +15
      },
      "risk": "May accelerate his investigation timeline",
      "priority": 0.6
    },
    {
      "operator_id": "OP_BACKCHANNEL_NEGOTIATION",
      "target": "char_quintus_fabius",
      "rationale": "Offer a truce - I stay out of politics, he drops the investigation.",
      "expected_deltas": {
        "tension": -2
      },
      "risk": "Appears weak to my allies",
      "priority": 0.3
    }
  ]
}
```

---

## C.4 Verifier Report

Output from Stage F verification.

```json
{
  "scene_id": "SC04",
  "deterministic_checks": {
    "json_valid": true,
    "invariants_passed": true,
    "prereqs_satisfied": true,
    "accounting_balanced": true,
    "claims_within_limits": true,
    "required_deltas_covered": true
  },
  "llm_critic_result": {
    "verdict": "PASS",
    "plan_compliance": true,
    "hook_present": true,
    "notes": "Scene accomplishes both beats. Dialogue feels authentic to character voices."
  },
  "violations": [],
  "warnings": [
    {
      "type": "soft_constraint",
      "rule": "S2",
      "message": "Hook line could be stronger - consider more dramatic phrasing"
    }
  ],
  "fix_instructions": []
}
```

### Failed Verification Example

```json
{
  "scene_id": "SC08",
  "deterministic_checks": {
    "json_valid": true,
    "invariants_passed": false,
    "prereqs_satisfied": true,
    "accounting_balanced": false,
    "claims_within_limits": true,
    "required_deltas_covered": false
  },
  "llm_critic_result": {
    "verdict": "FAIL",
    "plan_compliance": false,
    "hook_present": true,
    "notes": "Scene shows character spending 10,000 denarii but ledger only has 5,000. Required delta for witness flip not depicted."
  },
  "violations": [
    {
      "type": "hard_constraint",
      "rule": "H3",
      "message": "Cash spent exceeds available balance"
    },
    {
      "type": "delta_missing",
      "expected": "target.bdi.intentions += TESTIFY_FOR_ACTOR",
      "message": "Witness flip not shown in scene"
    }
  ],
  "fix_instructions": [
    "Reduce bribe amount to 5,000 or show character obtaining additional funds first",
    "Add dialogue where witness explicitly agrees to testify"
  ]
}
```

---

## C.5 Instantiated Character Data

Complete character definitions for the "Titan Trio" - the three principals driving Season 1.

### Caelus Varo (The Financier)

```json
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
}
```

### Quintus Fabius Maximus (The Prosecutor)

```json
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
}
```

### Drusilla (The Broker)

```json
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
```

---

## C.6 Relationship Triangle

The asymmetric edges between the three principals.

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

**Note the asymmetry:** Quintus hates Varo (resentment: 95), but Varo mostly views Quintus as an obstacle (resentment: 40). Drusilla is the bridge connecting them.

---

## C.7 Production Artifacts

Examples of Stage I (Voice + Video Production) outputs.

### C.7.1 Scene Script with Performance Blocks

The Writer outputs dialogue with embedded performance hints for audio synthesis.

```markdown
## SC04 — INT. VARO'S VILLA - TABLINUM - NIGHT

**Cast:** Varo, Drusilla

Rain hammered the roof tiles like a thousand tiny fists. Varo stood at the map 
table, fingers tracing the coast of Asia Minor. His tunic was damp—he hadn't 
waited for his slave to bring the cloak. The courier's news was still hot in 
his blood.

The door opened. Drusilla stepped into the lamplight, untouched by the rain, 
her stola perfectly arranged. She took in the chaos of the room—the scattered 
scrolls, the overturned wine cup, the man vibrating with barely contained energy.

VARO: (Manic, rapid-fire) [Stability: 0.3] "Three days. That's what we have. Three 
days before every fool in the Forum realizes what we knew last week. So. Are you 
in or are you poor?"

DRUSILLA: (Measured, clinical) [Stability: 0.8] "Sit down."

VARO: (Dismissive, pacing) [Stability: 0.35] "I don't have time to sit. The runners 
are already-- the eastern contracts will collapse the moment the Senate gets wind 
of Mithridates. We short-sell tonight, we triple our position by the Kalends."

He grabbed a stylus, began scratching figures on a wax tablet. His hand shook—
not from fear. From hunger.

DRUSILLA: (Quiet, diagnostic) [Stability: 0.75] "You're not thinking. You're 
reacting. That's how men like you end up in exile."

VARO: (Sharp, defensive) [Stability: 0.4] "Men like me?"

DRUSILLA: (Unflinching) [Stability: 0.85] "Men who mistake velocity for wisdom. 
Sit. Down."

A long beat. The rain filled the silence. Varo's fingers stopped drumming.

VARO: (Quieter, calculating) [Stability: 0.55] "You came here in the rain. In the 
third watch. You know something I don't."

DRUSILLA: (Slight smile) [Stability: 0.7] "I know several things you don't. The 
question is which one matters tonight."

She moved to the map table. Her finger traced the same coastline his had.

DRUSILLA: (Low, warning) [Stability: 0.65] "My husband received a letter today. 
From the Pontus. Three days ahead of the public post."

VARO: (Frozen) [Stability: 0.5] "How."

DRUSILLA: (Matter-of-fact) [Stability: 0.8] "He has friends in the East. Old 
soldiers. They write when the ground shakes."

Varo stared at her. The rain continued. The oil lamp flickered.

VARO: (Very quiet) [Stability: 0.6] "So he knows."

DRUSILLA: (Steady) [Stability: 0.85] "He knows there's opportunity. He doesn't 
yet know that you intend to seize it. I am giving you... one watch. To reconsider."

She turned to leave. At the door:

DRUSILLA: (Final) [Stability: 0.9] "The ships aren't coming, Varo. Make sure you're 
not on the dock when everyone realizes it."

> The door closed. The rain continued. Varo stood alone with his maps and his 
> calculations. After a long moment, he called for the runner anyway.

---CLAIMS---
[]

---SCENE_EVENTS---
[
  {
    "event": "Drusilla warns Varo that Quintus has intelligence about the Pontic situation",
    "operator_alignment": "OP_STOIC_COUNSEL",
    "outcome": "FAIL",
    "delta": "relationship.fear +10"
  }
]
```

### C.7.2 Storyboard Output for SC04

Generated by the Storyboarder (Stage I-A) from the scene above.

```json
{
  "scene_id": "SC04",
  "visual_cadence": 0.4,
  "shot_count": 4,
  "shots": [
    {
      "shot_id": "SC04_shot_001",
      "sequence": 1,
      "beat_reference": "Opening - Varo alone with map",
      "timestamp_anchor": "00:00",
      "shot_type": "wide",
      "visual_prompt": "A wide cinematic shot of a rectangular Roman study with high ceilings and faded maritime frescoes. A large wooden table dominates the center, covered in scattered scrolls and a toppled wine cup. Oil lamps cast long, dramatic shadows. A man in his late 50s with a sharp hawkish nose and short gray hair stands at the table in a damp wool tunic, fingers tracing a map. His posture radiates restless energy. Heavy rain streams down the single high window. The atmosphere is tense, chaotic.",
      "gpt_image_params": {
        "style_suffix": "Rendered in charcoal sketch style on rough papyrus, heavy crosshatching, sepia and ochre tones with occasional deep crimson accents.",
        "mood": "manic_tension",
        "lighting": "dramatic side-lighting from oil lamps, rain-gray from window"
      },
      "motion_hint": "slow_zoom_in"
    },
    {
      "shot_id": "SC04_shot_002",
      "sequence": 2,
      "beat_reference": "Drusilla enters - power shift",
      "timestamp_anchor": "00:25",
      "shot_type": "medium",
      "visual_prompt": "A woman in her early 40s with sharp aristocratic features stands framed in an arched doorway. She wears an elegant deep blue stola with gold pins at the shoulders, untouched by the rain outside. Her posture is perfectly composed, chin raised, unblinking eyes surveying the chaos of the room. Backlit by the rain-slicked marble corridor behind her. Her expression is clinical, diagnostic.",
      "gpt_image_params": {
        "style_suffix": "Rendered in charcoal sketch style on rough papyrus, heavy crosshatching, sepia and ochre tones.",
        "mood": "controlled_power",
        "lighting": "backlit, face in soft shadow"
      },
      "motion_hint": "static"
    },
    {
      "shot_id": "SC04_shot_003",
      "sequence": 3,
      "beat_reference": "Confrontation - both at map table",
      "timestamp_anchor": "01:30",
      "shot_type": "medium",
      "visual_prompt": "Two figures stand on opposite sides of a large oak table covered in scrolls and maps. The man (late 50s, hawkish nose, gray hair, damp tunic) has stopped moving, his fingers frozen mid-gesture. The woman (early 40s, blue stola, gold pins) traces the coastline on a map between them. Their eyes meet across the table. Oil lamp between them casts shadows upward on both faces. Rain visible through window behind.",
      "gpt_image_params": {
        "style_suffix": "Rendered in charcoal sketch style on rough papyrus, heavy crosshatching, sepia and ochre tones.",
        "mood": "standoff",
        "lighting": "under-lighting from table lamp, faces half-shadowed"
      },
      "motion_hint": "slow_pan_left"
    },
    {
      "shot_id": "SC04_shot_004",
      "sequence": 4,
      "beat_reference": "Button - Varo alone, decision moment",
      "timestamp_anchor": "02:15",
      "shot_type": "close",
      "visual_prompt": "Close-up of a man's face—late 50s, sharp hawkish nose, deep-set weary eyes, short gray hair. His expression is complex: calculation warring with something like fear. Oil lamp light flickers across his features. In the blurred background, an empty doorway. Rain sound implied. His lips are slightly parted, as if about to speak or call out.",
      "gpt_image_params": {
        "style_suffix": "Rendered in charcoal sketch style on rough papyrus, heavy crosshatching, sepia and ochre tones with deep crimson in the shadows.",
        "mood": "decision_point",
        "lighting": "dramatic chiaroscuro, single lamp source"
      },
      "motion_hint": "slow_zoom_in"
    }
  ]
}
```

### C.7.3 Audio Manifest for SC04

Generated by Audio Synth (Stage I-B).

```json
{
  "scene_id": "SC04",
  "master_file": "audio/SC04_master.mp3",
  "total_duration_ms": 145200,
  "inter_turn_silence_ms": 500,
  "dialogue_turns": [
    {
      "turn_id": "SC04_d001",
      "character_id": "char_caelus_varo",
      "text": "Three days. That's what we have. Three days before every fool in the Forum realizes what we knew last week. So. Are you in or are you poor?",
      "file": "audio/SC04_d001_varo.mp3",
      "duration_ms": 7200,
      "cumulative_offset_ms": 0,
      "performance_applied": {
        "stability": 0.3,
        "style": 0.4
      }
    },
    {
      "turn_id": "SC04_d002",
      "character_id": "char_drusilla",
      "text": "Sit down.",
      "file": "audio/SC04_d002_drusilla.mp3",
      "duration_ms": 1100,
      "cumulative_offset_ms": 7700,
      "performance_applied": {
        "stability": 0.8,
        "style": 0.3
      }
    },
    {
      "turn_id": "SC04_d003",
      "character_id": "char_caelus_varo",
      "text": "I don't have time to sit. The runners are already-- the eastern contracts will collapse the moment the Senate gets wind of Mithridates. We short-sell tonight, we triple our position by the Kalends.",
      "file": "audio/SC04_d003_varo.mp3",
      "duration_ms": 9800,
      "cumulative_offset_ms": 9300,
      "performance_applied": {
        "stability": 0.35,
        "style": 0.4
      }
    },
    {
      "turn_id": "SC04_d004",
      "character_id": "char_drusilla",
      "text": "You're not thinking. You're reacting. That's how men like you end up in exile.",
      "file": "audio/SC04_d004_drusilla.mp3",
      "duration_ms": 4200,
      "cumulative_offset_ms": 19600,
      "performance_applied": {
        "stability": 0.75,
        "style": 0.3
      }
    }
  ]
}
```

### C.7.4 Production Manifest for SC04

Assembly instructions for video generation (Stage I-D).

```json
{
  "scene_id": "SC04",
  "audio_track": "audio/SC04_master.mp3",
  "duration_ms": 145200,
  "shots": [
    {
      "shot_id": "SC04_shot_001",
      "image_file": "frames/SC04_shot_001.png",
      "start_ms": 0,
      "end_ms": 25000,
      "motion": {
        "type": "slow_zoom_in",
        "start_scale": 1.0,
        "end_scale": 1.12,
        "easing": "ease_in_out"
      },
      "transition_out": "crossfade_500ms"
    },
    {
      "shot_id": "SC04_shot_002",
      "image_file": "frames/SC04_shot_002.png",
      "start_ms": 25000,
      "end_ms": 55000,
      "motion": {
        "type": "static"
      },
      "transition_out": "crossfade_500ms"
    },
    {
      "shot_id": "SC04_shot_003",
      "image_file": "frames/SC04_shot_003.png",
      "start_ms": 55000,
      "end_ms": 115000,
      "motion": {
        "type": "slow_pan_left",
        "pan_distance_percent": 8,
        "easing": "linear"
      },
      "transition_out": "crossfade_500ms"
    },
    {
      "shot_id": "SC04_shot_004",
      "image_file": "frames/SC04_shot_004.png",
      "start_ms": 115000,
      "end_ms": 145200,
      "motion": {
        "type": "slow_zoom_in",
        "start_scale": 1.0,
        "end_scale": 1.15,
        "easing": "ease_out"
      },
      "transition_out": "cut"
    }
  ]
}
```

### C.7.5 Character Visual DNA Examples

Extended visual descriptions for the three principals.

```json
{
  "char_caelus_varo": {
    "visual_dna": {
      "physical": "A man in his late 50s with a sharp, hawkish nose and deep-set weary eyes that miss nothing. Clean-shaven with short-cropped gray hair, slightly disheveled. Lean, wiry build suggesting restless energy and poor sleep. Weathered skin from years of travel. Thin lips often pressed tight.",
      "costume_default": "A short working tunic in undyed wool, deliberately plain despite his wealth. A single iron ring on his left hand (superstition). Well-worn leather sandals. Never wears a toga unless forced to by circumstance.",
      "distinguishing_marks": "A thin scar across his right palm from an old knife wound. Ink stains on his fingertips that never fully wash out. Slight limp in his left leg (old racing injury).",
      "posture_energy": "Always in motion—pacing, drumming fingers, checking sight lines. Sits only when calculating. Never fully relaxed. Eyes constantly moving. Stands too close when making a point."
    }
  },
  "char_drusilla": {
    "visual_dna": {
      "physical": "A woman in her early 40s with sharp aristocratic features—high cheekbones, straight nose, strong jaw. Cool gray eyes that rarely blink. Dark hair pulled back severely, streaked with early silver at the temples. Tall for a Roman woman. Elegant bone structure.",
      "costume_default": "An elegant stola in deep blue or charcoal gray, always perfectly draped. Gold pins at the shoulders. A single gold bracelet (serpent design). Minimal jewelry otherwise. Expensive but understated.",
      "distinguishing_marks": "Small mole above her left eyebrow. Calloused fingertips from writing (unusual for a woman of her class). Slight crease between eyebrows from years of concentration.",
      "posture_energy": "Perfect stillness as a weapon. Economical movements. Never gestures unnecessarily. Unblinking eye contact. Speaks at low volume, forcing others to lean in. Enters rooms without sound."
    }
  },
  "char_quintus_fabius": {
    "visual_dna": {
      "physical": "A man in his mid-40s with a broad, honest face showing the strain of principle. Strong Roman features—pronounced nose, heavy brow. Dark hair with distinguished gray at temples. Athletic build going soft. Deep lines around mouth from righteous frowning.",
      "costume_default": "A proper toga praetexta with purple border (his office). Always formally dressed, even at home. Wears his grandfather's signet ring. Simple leather shoes, well-maintained. Every fold precise.",
      "distinguishing_marks": "Scar on left forearm from military service (displayed proudly). Slight squint in right eye from years of reading documents. Habitually adjusts toga fold when agitated.",
      "posture_energy": "Studied dignity. Moves with deliberate formality. Gestures in oratorical patterns even in private. Stands straighter when challenged. Avoids touching gold or silver."
    }
  }
}
```
