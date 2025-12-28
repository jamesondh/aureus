# Appendix E: Production Pipeline (Voice + Video)

This appendix specifies Stage I of the Aureus pipeline: transforming episode scripts into synthesized audio and video output.

---

## E.1 Overview

After the Writer produces `episode_script.md` and verification passes, the Production stage synthesizes:

1. **Voice audio** for all dialogue (via ElevenLabs)
2. **Visual frames** for key narrative beats (via GPT Image)
3. **Final video** assembly (via FFmpeg/MoviePy)

### Pipeline Flow

```
episode_script.md
       ↓
┌──────────────────┐
│  Storyboarder    │ ← LLM identifies visual beats
│  (Stage I-A)     │
└──────────────────┘
       ↓
   storyboard.json
       ↓
┌──────────────────┐     ┌──────────────────┐
│  Audio Synth     │     │  Image Generator │
│  (Stage I-B)     │     │  (Stage I-C)     │
└──────────────────┘     └──────────────────┘
       ↓                        ↓
   /audio/*.mp3            /frames/*.png
       ↓                        ↓
┌──────────────────────────────────────────┐
│         Video Assembly (Stage I-D)       │
└──────────────────────────────────────────┘
       ↓
   episode_final.mp4
```

---

## E.2 Visual DNA

Since image generation models have no memory between prompts, every character and location must have a portable visual description.

### E.2.1 Character Visual DNA

Added to `characters.json` for all principals and named supporting characters.

```json
{
  "id": "char_caelus_varo",
  "visual_dna": {
    "physical": "A man in his late 50s with a sharp, hawkish nose and deep-set weary eyes. Clean-shaven with short-cropped gray hair. Lean, wiry build suggesting restless energy.",
    "costume_default": "A short working tunic in undyed wool, deliberately plain. A single iron ring on his left hand. Leather sandals, road-worn.",
    "distinguishing_marks": "A thin scar across his right palm (old knife wound). Ink stains on his fingertips.",
    "posture_energy": "Always in motion—pacing, drumming fingers, checking sight lines. Never fully relaxed."
  }
}
```

**Fields:**
- `physical`: Face, build, age, coloring (immutable)
- `costume_default`: Standard attire (may change per scene via packet override)
- `distinguishing_marks`: Scars, jewelry, tattoos that persist across appearances
- `posture_energy`: Movement quality for pose selection

### E.2.2 Location Visual DNA

Added to `world.json` locations array.

```json
{
  "locations": [
    {
      "id": "villa_varo_tablinum",
      "name": "Varo's Study",
      "visual_dna": {
        "architecture": "A rectangular room with high ceilings. Faded frescoes of maritime scenes on the walls. A large wooden table dominates the center, covered in scrolls and wax tablets.",
        "lighting_default": "Oil lamps casting long shadows. A single high window admits gray daylight.",
        "atmosphere": "Controlled chaos—organized disorder of a working space. Maps pinned to the walls. The smell of ink and old papyrus.",
        "key_props": ["large oak table", "bronze map stand", "iron strongbox in corner", "clay oil lamps"]
      }
    }
  ]
}
```

### E.2.3 Visual DNA for Extras

Unnamed extras (crowd members, servants, guards) use template descriptors:

```json
{
  "extra_templates": {
    "roman_crowd_plebeian": "Common Roman citizens in rough-spun tunics, weathered faces, calloused hands.",
    "roman_guard": "A soldier in iron-banded leather armor, short sword at hip, helmet under arm.",
    "household_slave": "A young person in simple gray tunic, barefoot, eyes downcast."
  }
}
```

The Storyboarder references these templates when generating visual prompts for crowd scenes.

---

## E.3 Casting Registry

### E.3.1 casting.json Schema

Maps Aureus character IDs to ElevenLabs voice IDs.

```json
{
  "casting": {
    "version": "1.0",
    "last_updated": "2024-01-15T10:30:00Z",
    "voice_mappings": [
      {
        "character_id": "NARRATOR",
        "eleven_voice_id": "onwK4e9ZLuTAKqWW03F9",
        "voice_name": "Daniel",
        "is_narrator": true,
        "default_settings": {
          "stability": 0.8,
          "similarity_boost": 0.7,
          "style": 0.2,
          "use_speaker_boost": true
        },
        "notes": "British gravitas, documentary style. Authoritative but not cold. Adjust stability per tone tag.",
        "tone_overrides": {
          "Neutral": { "stability": 0.8 },
          "Ominous": { "stability": 0.7, "style": 0.3 },
          "Urgent": { "stability": 0.6, "style": 0.4 },
          "Ironic": { "stability": 0.75, "style": 0.25 }
        }
      },
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

### E.3.2 Human-in-the-Loop Workflow

1. **Detection:** When the Writer introduces a new speaking character, the Verifier flags it.
2. **Queueing:** The character is added to `unassigned` with `status: "VOICE_REQUIRED"`.
3. **Blocking:** Stage I-B (Audio Synth) cannot proceed until all speakers have mappings.
4. **Resolution:** Human reviews `unassigned`, selects voice from ElevenLabs library, moves to `voice_mappings`.
5. **Commit:** Updated `casting.json` is committed; production resumes.

---

## E.4 Global Visual Style

Defined once in `constraints.json` and applied to all image generation.

```json
{
  "production_constraints": {
    "visual_style_prompt": "All images rendered in the style of 1st-century BCE charcoal sketches on rough papyrus. Heavy use of crosshatching for shadows. Sepia and ochre tones with occasional deep crimson accents. No photorealism.",
    "aspect_ratio": "16:9",
    "resolution": "1920x1080",
    "image_format": "png"
  }
}
```

This prompt is prepended to every visual generation request, ensuring consistent aesthetic across the episode.

---

## E.5 Performance Blocks

The Writer embeds performance hints inline with dialogue to guide voice synthesis.

### E.5.1 Syntax

```
CHARACTER: (Emotion, Delivery) [Stability: X.X] "Dialogue text here."
```

**Components:**
- `(Emotion, Delivery)`: Human-readable acting notes, stripped before synthesis
- `[Stability: X.X]`: ElevenLabs stability override (0.0-1.0)
- Optional: `[Style: X.X]` for style exaggeration override

### E.5.2 Examples

```markdown
VARO: (Manic, rapid-fire) [Stability: 0.3] "Three days. That's what we have. Three days before every fool in the Forum realizes what we knew last week."

DRUSILLA: (Measured, clinical) [Stability: 0.8] "You're not angry. You're afraid."

MARCUS: (Whispered, terrified) [Stability: 0.25] [Style: 0.6] "The ships... they aren't coming, are they?"
```

### E.5.3 Punctuation as Prosody

ElevenLabs interprets punctuation for pacing:
- **Ellipsis (`...`):** Hesitation, trailing off
- **Dash (`--`):** Interruption, abrupt stop
- **Exclamation (`!`):** Increased volume/intensity
- **Question (`?`):** Rising intonation
- **Comma (`,`):** Brief pause
- **Period (`.`):** Full stop, finality

The Writer should use punctuation deliberately for performance effect.

### E.5.4 Pre-Processing

Before sending to ElevenLabs API, the Audio Synth middleware:

1. Extracts stability/style overrides from brackets
2. Strips stage directions in parentheses
3. Applies character's `default_settings` as base, then overrides
4. Sends clean dialogue text to API

### E.5.5 Narrator Performance Blocks

The narrator uses a distinct voice in `casting.json` (ID: `NARRATOR`) with specific synthesis rules.

#### Syntax in Script

```
[NARRATOR]: (Tone) [Stability: X.X] Prose text here.
```

Or for multi-paragraph blocks:

```
---NARRATOR---
(Tone) [Stability: X.X]
Extended prose passage describing scene atmosphere,
character movement, or transitional information.
---END NARRATOR---
```

#### Tone Options

| Tone | Description | Default Stability |
|------|-------------|-------------------|
| `(Neutral)` | Default documentary delivery | 0.8 |
| `(Ominous)` | Lower, slower for foreshadowing | 0.7 |
| `(Urgent)` | Faster tempo for action sequences | 0.6 |
| `(Ironic)` | Slight detachment for dramatic irony | 0.75 |

#### Examples

```markdown
[NARRATOR]: (Ominous) [Stability: 0.7] The dead keep better ledgers than the living.

[NARRATOR]: (Neutral) [Stability: 0.8] Three locations. Three breaths held. In the warehouse, 
Varo's hand stops mid-reach for a wine cup.

---NARRATOR---
(Urgent) [Stability: 0.6]
The Forum erupted. Ten thousand voices rose and fell like surf against stone. 
Merchants slammed shutters. The crash of bronze tablets echoed off temple walls.
---END NARRATOR---
```

#### Pre-Processing for Narrator

Before sending to ElevenLabs API:

1. Detect narrator block (starts with `[NARRATOR]:` or `---NARRATOR---`)
2. Extract tone tag from parentheses
3. Look up tone in narrator's `tone_overrides` for base settings
4. Apply any explicit stability/style overrides from brackets
5. Strip formatting markers, send clean prose text to API

#### Narrator Constraints (enforced by Verifier)

| Constraint | Limit |
|------------|-------|
| Max narrator word count per scene | 30% of scene total |
| Min narrator blocks per scene | 1 (establishing shot) |
| Max narrator blocks per scene | 5 |
| Narrator + dialogue at scene end | Only one, not both |

---

## E.6 Storyboarder (Stage I-A)

An LLM pass that identifies visual beats and generates shot descriptions.

### E.6.1 Visual Cadence

Configurable per-scene via scene packet:

```json
{
  "scene_id": "SC04",
  "production_settings": {
    "visual_cadence": 0.4
  }
}
```

| Cadence | Images per 2.5-min scene | Style |
|---------|--------------------------|-------|
| 0.1 | 1 (establishing only) | Minimalist podcast |
| 0.3 | 2-3 | Standard narrative |
| 0.4 | 3-5 | Default |
| 0.6 | 5-8 | Dramatic emphasis |
| 1.0 | 10+ | High-budget feel |

### E.6.2 Storyboarder Prompt

**Model:** Sonnet

```
SYSTEM:
You are the Storyboarder. Identify key visual beats and generate shot descriptions.

INPUTS:
- SCENE_TEXT: {{scene_text}}
- SCENE_PACKET: {{scene_packet_json}}
- VISUAL_DNA_CHARACTERS: {{visual_dna_characters}}
- VISUAL_DNA_LOCATIONS: {{visual_dna_locations}}
- VISUAL_STYLE: {{visual_style_prompt}}
- VISUAL_CADENCE: {{cadence_value}}

TASK:
1. Read the scene and identify emotional/narrative peaks
2. Based on visual_cadence, select {{N}} moments for illustration
3. For each shot, expand character/location references into full Visual DNA descriptions
4. Output structured shot list

SHOT SELECTION PRIORITY:
- Scene-opening establishing shot (always include)
- Character reveals / entrances
- Key emotional beats (shock, anger, intimacy)
- Physical action (violence, gestures, exchanges)
- Scene-closing button moment

OUTPUT:
{
  "scene_id": "...",
  "shot_count": N,
  "shots": [...]
}
```

### E.6.3 Shot Schema

```json
{
  "shot_id": "SC04_shot_001",
  "sequence": 1,
  "beat_reference": "Scene opening - establishing",
  "timestamp_anchor": "00:00",
  "shot_type": "wide",
  "visual_prompt": "A wide cinematic shot of a rectangular Roman study with high ceilings. Faded frescoes of maritime scenes on the walls. A large wooden table dominates the center, covered in scrolls. Oil lamps cast long shadows. At the center stands a man in his late 50s with a sharp hawkish nose and deep-set weary eyes, wearing a short undyed wool tunic. He paces restlessly, drumming fingers on the table. Heavy rain streams down the single high window. The atmosphere is tense, chaotic.",
  "gpt_image_params": {
    "style_suffix": "Rendered in charcoal sketch style on rough papyrus, heavy crosshatching, sepia and ochre tones.",
    "mood": "tense",
    "lighting": "dramatic side-lighting from oil lamps"
  },
  "motion_hint": "slow_zoom_in"
}
```

**Shot Types:**
- `wide`: Full environment, multiple characters
- `medium`: Waist-up, 1-2 characters
- `close`: Face/hands detail
- `extreme_close`: Eyes, object detail
- `over_shoulder`: POV conversation

**Motion Hints:** Applied during video assembly
- `static`: No movement
- `slow_zoom_in`: Ken Burns push
- `slow_zoom_out`: Ken Burns pull
- `slow_pan_left` / `slow_pan_right`: Horizontal drift
- `subtle_shake`: Handheld tension effect

---

## E.7 Audio Synthesis (Stage I-B)

### E.7.1 Extraction

Parse `episode_script.md` to extract dialogue turns AND narrator blocks:

```json
{
  "scene_id": "SC04",
  "audio_segments": [
    {
      "segment_id": "SC04_n001",
      "type": "narrator",
      "character_id": "NARRATOR",
      "raw_text": "(Ominous) [Stability: 0.7] The dead keep better ledgers than the living.",
      "clean_text": "The dead keep better ledgers than the living.",
      "performance": {
        "tone": "Ominous",
        "stability_override": 0.7,
        "style_override": null
      }
    },
    {
      "segment_id": "SC04_d001",
      "type": "dialogue",
      "character_id": "char_caelus_varo",
      "raw_text": "(Manic, rapid-fire) [Stability: 0.3] \"Three days. That's what we have.\"",
      "clean_text": "Three days. That's what we have.",
      "performance": {
        "stage_direction": "Manic, rapid-fire",
        "stability_override": 0.3,
        "style_override": null
      }
    }
  ]
}
```

#### Segment Type Detection

| Pattern | Type | Character ID |
|---------|------|--------------|
| `[NARRATOR]:` or `---NARRATOR---` | `narrator` | `NARRATOR` |
| `CHARACTER_NAME:` | `dialogue` | Lookup from characters.json |

#### Ordering

Segments are extracted in script order to maintain narrative flow. The timing manifest preserves this order for audio concatenation.
```

### E.7.2 Voice Assignment

For each dialogue turn:
1. Look up `character_id` in `casting.json`
2. If found: retrieve `eleven_voice_id` and `default_settings`
3. If not found: halt and add to `unassigned` queue
4. Merge `default_settings` with any overrides from performance block

### E.7.3 ElevenLabs API Call

```python
# Pseudocode
response = elevenlabs.generate(
    text=clean_text,
    voice=eleven_voice_id,
    model="eleven_multilingual_v2",
    voice_settings={
        "stability": merged_stability,
        "similarity_boost": default_similarity,
        "style": merged_style,
        "use_speaker_boost": True
    }
)
```

### E.7.4 Output

Individual audio files per dialogue turn:
```
/audio/
  SC04_d001_varo.mp3
  SC04_d002_drusilla.mp3
  ...
```

Plus a timing manifest:
```json
{
  "scene_id": "SC04",
  "audio_segments": [
    {
      "turn_id": "SC04_d001",
      "file": "SC04_d001_varo.mp3",
      "duration_ms": 2340,
      "cumulative_offset_ms": 0
    },
    {
      "turn_id": "SC04_d002",
      "file": "SC04_d002_drusilla.mp3", 
      "duration_ms": 1890,
      "cumulative_offset_ms": 2840
    }
  ],
  "total_duration_ms": 142500,
  "inter_turn_silence_ms": 500
}
```

### E.7.5 Failure Handling

| Failure | Response |
|---------|----------|
| API timeout | Retry 3x with exponential backoff |
| Rate limit | Queue and retry after cooldown |
| Voice not found | Add to `unassigned`, block scene |
| Content filter | Flag for manual review, skip turn |
| Persistent failure | Log error, generate silence placeholder, continue |

---

## E.8 Image Generation (Stage I-C)

### E.8.1 Prompt Assembly

For each shot in `storyboard.json`:

```python
full_prompt = f"{visual_style_prompt}\n\n{shot.visual_prompt}\n\n{shot.gpt_image_params.style_suffix}"
```

### E.8.2 GPT Image API Call

```python
# Pseudocode
response = openai.images.generate(
    model="dall-e-3",
    prompt=full_prompt,
    size="1792x1024",  # Closest to 16:9
    quality="hd",
    n=1
)
```

### E.8.3 Output

```
/frames/
  SC04_shot_001.png
  SC04_shot_002.png
  ...
```

### E.8.4 Failure Handling

| Failure | Response |
|---------|----------|
| Content policy rejection | Simplify prompt, remove potentially flagged terms, retry |
| API timeout | Retry 3x |
| Persistent failure | Use solid color frame with scene text overlay, log for manual fix |
| Quality issue | No automatic detection; logged for manual review |

### E.8.5 Regeneration Budget

- **Per shot:** 2 retry attempts
- **Per episode:** 20 total image regenerations
- **Fallback:** Placeholder frame + manual queue

---

## E.9 Video Assembly (Stage I-D)

### E.9.1 Production Manifest

Generated after audio and images are complete:

```json
{
  "episode_id": "ep_01",
  "video_settings": {
    "resolution": "1920x1080",
    "fps": 24,
    "codec": "h264",
    "audio_codec": "aac",
    "audio_bitrate": "192k"
  },
  "scenes": [
    {
      "scene_id": "SC04",
      "audio_track": "SC04_master.mp3",
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
          }
        },
        {
          "shot_id": "SC04_shot_002",
          "image_file": "frames/SC04_shot_002.png",
          "start_ms": 28500,
          "end_ms": 71200,
          "motion": {
            "type": "slow_pan_right",
            "pan_distance_percent": 10,
            "easing": "linear"
          }
        }
      ]
    }
  ]
}
```

### E.9.2 Timing Authority

**Audio track length is authoritative** for final timing.

Process:
1. Concatenate all dialogue audio with inter-turn silences
2. Calculate total scene duration from audio
3. Distribute shots across duration based on `timestamp_anchor` hints
4. Adjust shot boundaries to align with audio cues where possible

### E.9.3 Motion Effects

To prevent static frames from feeling "dead":

| Effect | Parameters | Use Case |
|--------|------------|----------|
| `slow_zoom_in` | scale 1.0→1.15 | Tension building |
| `slow_zoom_out` | scale 1.15→1.0 | Reveal, context |
| `slow_pan_left/right` | 5-10% frame | Following action |
| `subtle_shake` | 2-3px random | Handheld urgency |
| `static` | none | Formal, composed shots |

### E.9.4 Assembly Process

Using FFmpeg or MoviePy:

1. **Audio track:** Concatenate scene audio files with silences
2. **Video track:** 
   - Load each frame
   - Apply motion effect as transform sequence
   - Set duration based on manifest timing
3. **Transitions:** Crossfade between shots (default 500ms)
4. **Merge:** Combine audio and video tracks
5. **Export:** H.264 MP4, 1080p, 24fps

### E.9.5 Output

```
/seasons/season_01/episode_01/
  episode_final.mp4
  production_manifest.json
  /audio/
    SC01_master.mp3
    ...
  /frames/
    SC01_shot_001.png
    ...
```

---

## E.10 Episode Repository Layout (Updated)

```
/seasons/
  season_01/
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
        SC01_d001_varo.mp3
        SC01_d002_drusilla.mp3
        SC01_master.mp3
        ...
      /frames/
        SC01_shot_001.png
        SC01_shot_002.png
        ...
      episode_final.mp4
```

---

## E.11 Production Verification

### E.11.1 Pre-Production Checks

Before Stage I can begin:

- [ ] All speaking characters have `voice_mapping` in `casting.json`
- [ ] All scene locations have `visual_dna` in `world.json`
- [ ] Global `visual_style_prompt` defined in `constraints.json`
- [ ] `visual_cadence` set per scene (or default 0.4)

### E.11.2 Post-Production Checks

After Stage I completes:

- [ ] All dialogue turns have corresponding audio files
- [ ] All shots in storyboard have corresponding image files
- [ ] `production_manifest.json` timing totals match audio duration
- [ ] `episode_final.mp4` exists and is playable
- [ ] No placeholder frames remain (or flagged for manual review)

---

## E.12 Model Routing (Production Stage)

| Role | Model | Notes |
|------|-------|-------|
| Storyboarder | Sonnet | Visual beat identification |
| Image Generation | DALL-E 3 | Via GPT Image API |
| Audio Synthesis | ElevenLabs Multilingual v2 | Character voices |
| Video Assembly | FFmpeg/MoviePy | Local processing |

---

## E.13 Production Budget Limits

| Resource | Limit | Rationale |
|----------|-------|-----------|
| Images per episode | 60-100 | ~4 per scene × 20 scenes |
| Audio API calls | 300-400 | ~15 dialogue turns × 20 scenes |
| Storyboarder calls | 20 | 1 per scene |
| Video render time | ~10 min | Local processing |
| Total ElevenLabs characters | ~50,000 | ~30 min dialogue |

---

## E.14 Manual Review Queue

Items requiring human intervention:

```json
{
  "review_queue": [
    {
      "type": "voice_assignment",
      "character_id": "char_senate_guard_01",
      "reason": "New speaking character",
      "blocking": true
    },
    {
      "type": "image_failure",
      "shot_id": "SC12_shot_003",
      "reason": "Content policy rejection after 2 retries",
      "blocking": false,
      "placeholder_used": true
    },
    {
      "type": "audio_content_flag",
      "turn_id": "SC08_d015",
      "reason": "Content filter triggered",
      "blocking": true
    }
  ]
}
```

**Blocking items** prevent `episode_final.mp4` generation until resolved.

**Non-blocking items** result in placeholders; video is generated but flagged for post-production fix.
