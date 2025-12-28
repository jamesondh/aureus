# Appendix A: Schema Reference

This appendix contains the complete JSON schemas for all data structures in the Aureus system.

---

## A.1 World State

### world.json

Global simulation state including time, locations, and world-level metrics.

```json
{
  "world_id": "res_publica_v2",
  "time": { 
    "year_bce": 68, 
    "season": "winter", 
    "day": 12 
  },
  "locations": [
    {
      "id": "rome_forum",
      "name": "The Roman Forum",
      "visual_dna": {
        "architecture": "A massive marble plaza stretching between the Capitoline and Palatine hills. Weathered pillars line the edges, casting long shadows. Statues of ancestors watch from pedestals.",
        "lighting_default": "Harsh Mediterranean sun, deep shadows under colonnades.",
        "atmosphere": "Crowds of citizens, merchants shouting, the smell of incense from nearby temples mixed with sweat and dust.",
        "key_props": ["rostra speaking platform", "temple steps", "bronze statues", "merchant stalls"]
      }
    },
    {
      "id": "villa_varo_tablinum",
      "name": "Varo's Study",
      "visual_dna": {
        "architecture": "A rectangular room with high ceilings. Faded frescoes of maritime scenes on the walls. A large wooden table dominates the center, covered in scrolls and wax tablets.",
        "lighting_default": "Oil lamps casting long shadows. A single high window admits gray daylight.",
        "atmosphere": "Controlled chaos—organized disorder of a working space. Maps pinned to walls. The smell of ink and old papyrus.",
        "key_props": ["large oak table", "bronze map stand", "iron strongbox in corner", "clay oil lamps"]
      }
    }
  ],
  "global": {
    "unrest": 3,
    "grain_price_index": 1.1,
    "scandal_temperature": 2,
    "legal_exposure": 0
  },
  "extra_templates": {
    "roman_crowd_plebeian": "Common Roman citizens in rough-spun tunics, weathered faces, calloused hands.",
    "roman_guard": "A soldier in iron-banded leather armor, short sword at hip, helmet under arm.",
    "household_slave": "A young person in simple gray tunic, barefoot, eyes downcast.",
    "roman_senator": "An older man in a white toga with purple border, dignified bearing, silver hair."
  }
}
```

**Fields:**
- `world_id`: Unique identifier for this world configuration
- `time`: Current simulation timestamp (BCE calendar)
- `locations`: All valid locations with Visual DNA for image generation
- `global`: World-level numeric metrics that operators can modify
- `extra_templates`: Visual descriptions for unnamed background characters

---

### factions.json

Political/economic groupings that characters belong to.

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

**Stat Ranges:** All stats use a -3 to +3 scale where 0 is neutral.

---

## A.2 Characters

### characters.json

Full character definitions including BDI (Belief-Desire-Intention) models.

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
          { 
            "id": "b_varo_1", 
            "text": "Information arriving one hour early is worth more than a province.", 
            "confidence": 1.0 
          }
        ],
        "desires": [
          { 
            "id": "d_varo_1", 
            "text": "Crush the Asian tax contract auction before news of the Pontic revolt reaches the Forum.", 
            "priority": 1.0 
          }
        ],
        "intentions": [
          { 
            "id": "i_varo_1", 
            "operator_id": "OP_INFO_ARBITRAGE", 
            "commitment": 0.9, 
            "target": "contract_asia_minor" 
          }
        ],
        "constraints": ["MUST_NOT_HOLD_PUBLIC_OFFICE"]
      },
      "voice": {
        "tags": ["staccato", "mathematical", "profane", "impatient"],
        "tells": ["tugs at short tunic", "checks sun position frequently", "interrupts pleasantries"]
      },
      "visual_dna": {
        "physical": "A man in his late 50s with a sharp, hawkish nose and deep-set weary eyes. Clean-shaven with short-cropped gray hair. Lean, wiry build suggesting restless energy.",
        "costume_default": "A short working tunic in undyed wool, deliberately plain. A single iron ring on his left hand. Leather sandals, road-worn.",
        "distinguishing_marks": "A thin scar across his right palm (old knife wound). Ink stains on his fingertips.",
        "posture_energy": "Always in motion—pacing, drumming fingers, checking sight lines. Never fully relaxed."
      }
    }
  ]
}
```

**BDI Model:**
- `beliefs`: What the character thinks is true (may differ from objective reality)
- `desires`: Long-term goals with priority weights (0.0-1.0)
- `intentions`: Committed actions referencing operator IDs
- `constraints`: Hard rules the character cannot violate

**Voice Tags:** Used by the Writer to maintain consistent character dialogue.

**Visual DNA:** Used by the Storyboarder and Image Generator for consistent visual representation.
- `physical`: Face, build, age, coloring (immutable across scenes)
- `costume_default`: Standard attire (can be overridden per scene)
- `distinguishing_marks`: Scars, jewelry, tattoos that persist
- `posture_energy`: Movement quality for pose selection

---

## A.3 Relationships

### relationships.json

Directed weighted edges between characters.

```json
{
  "edges": [
    {
      "id": "rel_varo_quintus",
      "from": "char_caelus_varo",
      "to": "char_quintus_fabius",
      "type": "adversary",
      "weights": { 
        "loyalty": 0, 
        "fear": 10, 
        "resentment": 40, 
        "respect": 20 
      },
      "flags": { "public_feud": true }
    },
    {
      "id": "rel_varo_drusilla",
      "from": "char_caelus_varo",
      "to": "char_drusilla",
      "type": "confidante",
      "weights": { 
        "loyalty": 85, 
        "fear": 5, 
        "resentment": 0, 
        "dependency": 70 
      },
      "flags": { 
        "transactional": true, 
        "therapist_dynamic": true 
      }
    }
  ]
}
```

**Weight Ranges:** 0-100 for all numeric weights.

**Relationship Types:**
- `adversary`: Active opposition
- `patron_of` / `client_of`: Formal patronage
- `spouse`: Marriage alliance
- `confidante`: Trusted advisor
- `nemesis`: Irreparable enmity (post-betrayal)

**Flags:** Boolean markers for special relationship dynamics.

---

## A.4 Secrets

### secrets.json

Information asymmetries that drive dramatic tension.

```json
{
  "secrets": [
    {
      "id": "sec_drusilla_short_position",
      "subject_ids": ["char_drusilla", "char_caelus_varo"],
      "holders": ["char_drusilla", "char_caelus_varo", "char_varo_chief_clerk"],
      "description": "Drusilla is using knowledge of her husband's upcoming indictments to short-sell tax shares through Varo's syndicate.",
      "proof": { 
        "type": "ledger_entry", 
        "credibility": 1.0, 
        "location": "villa_varo_aventine_safe" 
      },
      "stats": {
        "legal_value": 1.0,
        "public_damage": 1.0,
        "credibility": 1.0
      },
      "decay": { 
        "half_life_episodes": 6,
        "applies_to": ["legal_value", "public_damage"],
        "last_decayed_episode": 0
      },
      "status": "active",
      "narrative_function": "The ticking time bomb that destroys the marriage."
    }
  ]
}
```

**Status Values:**
- `active`: Secret is live and can be used
- `revealed`: Secret has been exposed publicly
- `inert`: Secret has decayed below relevance threshold (0.15)

**Decay Mechanics:** After each episode, apply: `new_value = current_value * (0.5 ^ (1 / half_life_episodes))`

---

## A.5 Assets

### assets.json

Tangible resources: money, goods, contracts, networks.

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
    ],
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

## A.6 Threads

### threads.json

Open narrative questions the audience is tracking.

```json
{
  "threads": [
    {
      "id": "thr_grain_shortage",
      "priority": 0.9,
      "question": "Will grain ships arrive before unrest breaks into violence?",
      "status": "open",
      "advance_cadence": { "max_episodes_without_progress": 2 },
      "last_advanced_episode": 0
    },
    {
      "id": "thr_inquiry_forms",
      "priority": 0.8,
      "question": "Will the praetor secure a commission and witnesses?",
      "status": "open",
      "advance_cadence": { "max_episodes_without_progress": 2 },
      "last_advanced_episode": 0
    }
  ]
}
```

**Status Values:** `open`, `resolved`, `abandoned`

---

## A.7 Constraints

### constraints.json

Rules enforced by the Verifier.

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
  ],
  "production_constraints": {
    "visual_style_prompt": "All images rendered in the style of 1st-century BCE charcoal sketches on rough papyrus. Heavy use of crosshatching for shadows. Sepia and ochre tones with occasional deep crimson accents. No photorealism.",
    "aspect_ratio": "16:9",
    "resolution": "1920x1080",
    "image_format": "png",
    "default_visual_cadence": 0.4
  }
}
```

**Hard vs Soft:**
- Hard constraints trigger regeneration on violation
- Soft constraints trigger warnings but allow pass with LLM critic approval

**Production Constraints:**
- `visual_style_prompt`: Prepended to all image generation prompts for consistent aesthetic
- `default_visual_cadence`: Default images per scene (0.1-1.0); can be overridden per-scene

---

## A.8 Cliffhanger Constraints

### cliffhanger_constraints.json

Carries forward between episodes to ensure continuity.

```json
{
  "cliffhanger_constraints": {
    "source_episode": "ep_01",
    "target_episode": "ep_02",
    "narrative_state": {
      "unresolved_scene_id": "SC24",
      "cliffhanger_type": "physical_danger"
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

**Cliffhanger Types:**
- `physical_danger`: Violence/threat (must_start_immediately = true)
- `revelation`: Information bomb (time skip allowed)
- `social_shame`: Public humiliation (time skip allowed)

---

## A.9 Episode Outputs

### episode_deltas.json

State changes produced by a committed episode.

```json
{
  "episode_id": "ep_01",
  "deltas": [
    { 
      "path": "world.global.unrest", 
      "op": "add", 
      "value": 2, 
      "reason": "GRAIN_SHOCK_DELAYED_SHIPS",
      "scene_id": "SC04"
    },
    { 
      "path": "assets.cash_ledger", 
      "op": "transfer", 
      "from": "char_marcus_livius", 
      "to": "char_operator_wags", 
      "denarii": 20000,
      "scene_id": "SC08"
    },
    {
      "path": "relationships.rel_varo_drusilla.weights.fear",
      "op": "add",
      "value": 10,
      "reason": "OP_STOIC_COUNSEL failed",
      "scene_id": "SC04"
    }
  ]
}
```

**Operations:**
- `add`: Increment numeric value
- `subtract`: Decrement numeric value  
- `set`: Replace value
- `multiply`: Scale numeric value
- `transfer`: Move quantity between holders (for ledger)

---

### episode_metrics.json

Drama management tracking.

```json
{
  "episode_id": "ep_01",
  "tension": 7,
  "pacing": 6,
  "volatility": 8,
  "thread_progress": {
    "thr_grain_shortage": { "advanced": true, "delta": 1 },
    "thr_inquiry_forms": { "advanced": false, "delta": 0 }
  },
  "beat_counts": {
    "reveals": 1,
    "reversals": 1,
    "confrontations": 2,
    "cliffhangers": 1
  }
}
```

---

## A.10 Repository Layout

Recommended directory structure:

```
/world/
  world.json              # Includes location visual_dna
  factions.json
  characters.json         # Includes character visual_dna
  relationships.json
  assets.json
  secrets.json
  threads.json
  constraints.json        # Includes production_constraints
/operators/
  operators.json
/style/
  style_guide.md
  lexicon.md
/casting/
  casting.json            # Character → ElevenLabs voice mappings
/seasons/
  season_01/
    season_goals.json
    pacing_targets.json
    episode_01/
      episode_plan.json
      episode_outline.json
      episode_script.md
      episode_scene_packets/
        SC01.json
        SC02.json
        ...
      episode_deltas.json
      episode_recaps.json
      episode_metrics.json
      verifier_report.json
      cliffhanger_constraints.json
      # Production artifacts (Stage I)
      storyboard.json
      audio_manifest.json
      production_manifest.json
      /audio/
        SC01_d001_varo.mp3
        SC01_master.mp3
        ...
      /frames/
        SC01_shot_001.png
        SC01_shot_002.png
        ...
      episode_final.mp4
```

Each episode commit captures:
- The plan that drove generation
- State snapshot at start/end
- All deltas applied
- Verifier reports (audit trail)
- Production artifacts (storyboard, audio, frames, video)

---

## A.11 Production Schemas

Schemas for Stage I (Voice + Video Production). See [Appendix E](APPENDIX_E_PRODUCTION.md) for full pipeline details.

### casting.json

Maps Aureus character IDs to ElevenLabs voice IDs.

```json
{
  "casting": {
    "version": "1.0",
    "last_updated": "2024-01-15T10:30:00Z",
    "voice_mappings": [
      {
        "character_id": "char_caelus_varo",
        "eleven_voice_id": "pNInz6obpgDQGcFmaJgB",
        "voice_name": "Adam",
        "default_settings": {
          "stability": 0.5,
          "similarity_boost": 0.75,
          "style": 0.4,
          "use_speaker_boost": true
        },
        "notes": "Sharp, clipped delivery. Reduce stability for emotional scenes."
      },
      {
        "character_id": "char_drusilla",
        "eleven_voice_id": "EXAVITQu4vr4xnSDxMaL",
        "voice_name": "Bella",
        "default_settings": {
          "stability": 0.7,
          "similarity_boost": 0.8,
          "style": 0.3,
          "use_speaker_boost": true
        },
        "notes": "Calm, measured. Increase stability for stoic counsel scenes."
      }
    ],
    "unassigned": [
      {
        "character_id": "char_senate_guard_01",
        "first_appearance": "ep_02_SC08",
        "line_count": 3,
        "suggested_type": "male_authoritative",
        "status": "VOICE_REQUIRED"
      }
    ]
  }
}
```

**Fields:**
- `voice_mappings`: Approved character-to-voice assignments
- `unassigned`: Characters awaiting human voice selection (blocks production)
- `default_settings`: Base ElevenLabs parameters, overridable via performance blocks

---

### storyboard.json

Shot list generated by the Storyboarder (Stage I-A).

```json
{
  "episode_id": "ep_01",
  "generated_at": "2024-01-15T12:00:00Z",
  "scenes": [
    {
      "scene_id": "SC04",
      "visual_cadence": 0.4,
      "shot_count": 4,
      "shots": [
        {
          "shot_id": "SC04_shot_001",
          "sequence": 1,
          "beat_reference": "Scene opening - establishing",
          "timestamp_anchor": "00:00",
          "shot_type": "wide",
          "visual_prompt": "A wide cinematic shot of a rectangular Roman study with high ceilings. Faded frescoes of maritime scenes on the walls. A large wooden table dominates the center, covered in scrolls. Oil lamps cast long shadows. At the center stands a man in his late 50s with a sharp hawkish nose and deep-set weary eyes, wearing a short undyed wool tunic. He paces restlessly. Heavy rain streams down the single high window.",
          "gpt_image_params": {
            "style_suffix": "Rendered in charcoal sketch style on rough papyrus, heavy crosshatching, sepia and ochre tones.",
            "mood": "tense",
            "lighting": "dramatic side-lighting from oil lamps"
          },
          "motion_hint": "slow_zoom_in"
        },
        {
          "shot_id": "SC04_shot_002",
          "sequence": 2,
          "beat_reference": "Drusilla enters",
          "timestamp_anchor": "00:28",
          "shot_type": "medium",
          "visual_prompt": "A woman in her early 40s with sharp aristocratic features stands in a doorway. She wears an elegant stola in deep blue, gold pins at the shoulders. Her posture is perfectly composed, chin slightly raised. Behind her, rain-slicked marble corridor. She regards the chaotic study with clinical detachment.",
          "gpt_image_params": {
            "style_suffix": "Rendered in charcoal sketch style on rough papyrus, heavy crosshatching, sepia and ochre tones.",
            "mood": "controlled",
            "lighting": "backlit from corridor"
          },
          "motion_hint": "static"
        }
      ]
    }
  ]
}
```

**Shot Types:** `wide`, `medium`, `close`, `extreme_close`, `over_shoulder`

**Motion Hints:** `static`, `slow_zoom_in`, `slow_zoom_out`, `slow_pan_left`, `slow_pan_right`, `subtle_shake`

---

### production_manifest.json

Assembly instructions for video generation (Stage I-D).

```json
{
  "episode_id": "ep_01",
  "created_at": "2024-01-15T14:00:00Z",
  "video_settings": {
    "resolution": "1920x1080",
    "fps": 24,
    "codec": "h264",
    "audio_codec": "aac",
    "audio_bitrate": "192k"
  },
  "total_duration_ms": 1800000,
  "scenes": [
    {
      "scene_id": "SC04",
      "audio_track": "audio/SC04_master.mp3",
      "duration_ms": 142500,
      "shots": [
        {
          "shot_id": "SC04_shot_001",
          "image_file": "frames/SC04_shot_001.png",
          "start_ms": 0,
          "end_ms": 28500,
          "motion": {
            "type": "slow_zoom_in",
            "start_scale": 1.0,
            "end_scale": 1.15,
            "easing": "ease_in_out"
          },
          "transition_in": "cut",
          "transition_out": "crossfade_500ms"
        },
        {
          "shot_id": "SC04_shot_002",
          "image_file": "frames/SC04_shot_002.png",
          "start_ms": 28500,
          "end_ms": 71200,
          "motion": {
            "type": "static"
          },
          "transition_in": "crossfade_500ms",
          "transition_out": "crossfade_500ms"
        }
      ]
    }
  ],
  "review_queue": [
    {
      "type": "image_failure",
      "shot_id": "SC12_shot_003",
      "reason": "Content policy rejection after 2 retries",
      "placeholder_used": true
    }
  ]
}
```

**Timing Authority:** Audio track length is authoritative; shot timings are calculated to fit audio duration.

---

### audio_manifest.json

Generated during Stage I-B, tracks individual dialogue audio files.

```json
{
  "episode_id": "ep_01",
  "scenes": [
    {
      "scene_id": "SC04",
      "master_file": "audio/SC04_master.mp3",
      "total_duration_ms": 142500,
      "inter_turn_silence_ms": 500,
      "dialogue_turns": [
        {
          "turn_id": "SC04_d001",
          "character_id": "char_caelus_varo",
          "file": "audio/SC04_d001_varo.mp3",
          "duration_ms": 2340,
          "cumulative_offset_ms": 0,
          "performance_applied": {
            "stability": 0.3,
            "style": 0.4
          }
        },
        {
          "turn_id": "SC04_d002",
          "character_id": "char_drusilla",
          "file": "audio/SC04_d002_drusilla.mp3",
          "duration_ms": 1890,
          "cumulative_offset_ms": 2840,
          "performance_applied": {
            "stability": 0.8,
            "style": 0.3
          }
        }
      ]
    }
  ]
}
```
