# Aureus

A **neuro-symbolic narrative engine** for generating serialized drama. Produces ~30-minute episodes set in the late Roman Republic, combining symbolic planning and verification with neural (LLM) prose generation.

> "A soap engine wearing a thriller suit" — interpersonal volatility drives character motivation while the surface plot feels like a financial/political thriller.

## Quick Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Generate an episode (see Authentication below)
npm run generate:episode
```

## Authentication

Aureus supports two authentication methods for LLM access:

### Option 1: Anthropic API Key

For direct API access (pay-per-use):

```bash
export ANTHROPIC_API_KEY=your_key_here
npm run generate:episode
```

### Option 2: Claude Max Subscription (Recommended for Personal Use)

Use your existing Claude Max subscription via the Claude Code CLI:

```bash
# 1. Install Claude Code CLI
curl -fsSL https://claude.ai/install.sh | bash

# 2. Authenticate (select "Claude App" and sign in with your Claude Max account)
claude

# 3. Run the generator
npm run generate:episode -- --use-claude-max

# Or set the environment variable for convenience
export USE_CLAUDE_MAX=1
npm run generate:episode
```

### Auto-Detection

If neither flag is specified:
- Uses **API mode** if `ANTHROPIC_API_KEY` is set
- Uses **Claude Max mode** otherwise (requires Claude Code CLI to be installed and authenticated)

## Architecture

Aureus uses a **neuro-symbolic architecture** that separates concerns:

```
Symbolic Planner (Director) → Neural Realizer (Writer) → Symbolic Verifier → Commit State
```

**Key Principle:** LLMs propose and render; **truth lives outside the LLM** in version-controlled JSON.

### Core Components

| Component | Type | Responsibility |
|-----------|------|----------------|
| **State Store** | Symbolic | Canonical truth in JSON files |
| **Expression Evaluator** | Symbolic | Evaluate operator prerequisites |
| **Delta Engine** | Symbolic | Apply state changes with validation |
| **Retriever** | Symbolic | GraphRAG-lite subgraph extraction |
| **Director** | Hybrid | HTN-lite planning, beat sheet generation |
| **Agent Generator** | Hybrid | BDI-lite character proposals |
| **Writer** | Neural | Scene prose generation |
| **Verifier** | Hybrid | Hard/soft constraint checking |

### Pipeline Stages

| Stage | Description | Model |
|-------|-------------|-------|
| **A. Snapshot** | Load state, apply cliffhanger constraints | None |
| **B. Proposals** | Generate agent move proposals | Haiku |
| **C. Planning** | Select operators, create beat sheet | Sonnet |
| **D. Packets** | Build scene packets with retrieved context | None |
| **E. Writing** | Generate scene prose | Sonnet |
| **F. Verification** | Check constraints, validate output | Haiku + deterministic |
| **G. Repair** | Regenerate failed scenes | Sonnet |
| **H. Commit** | Apply deltas, save artifacts | None |
| **I-A. Storyboard** | Visual beat identification | Sonnet |
| **I-B. Audio** | Voice synthesis | ElevenLabs |
| **I-C. Images** | Frame generation | DALL-E 3 |
| **I-D. Video** | Assembly with motion | FFmpeg |

## Project Structure

```
aureus/
├── src/
│   ├── core/
│   │   └── expression-evaluator.ts   # DSL for operator prerequisites
│   ├── engine/
│   │   ├── state-store.ts            # JSON state management
│   │   ├── delta-engine.ts           # State change operations
│   │   └── retriever.ts              # GraphRAG-lite extraction
│   ├── llm/
│   │   └── client.ts                 # Anthropic API wrapper
│   ├── pipeline/
│   │   ├── orchestrator.ts           # Main pipeline coordinator
│   │   ├── director.ts               # Episode planning
│   │   ├── agents.ts                 # BDI-lite proposals
│   │   ├── writer.ts                 # Scene generation
│   │   └── verifier.ts               # Constraint checking
│   ├── production/
│   │   ├── production-orchestrator.ts # Stage I coordinator
│   │   ├── storyboarder.ts           # Visual beat identification
│   │   ├── script-parser.ts          # Dialogue extraction
│   │   ├── elevenlabs-client.ts      # Voice synthesis API
│   │   ├── image-client.ts           # DALL-E 3 API
│   │   └── video-assembler.ts        # FFmpeg generation
│   └── types/
│       ├── world.ts                  # World state schemas
│       ├── operators.ts              # Operator schemas
│       ├── episode.ts                # Episode artifact schemas
│       └── production.ts             # Production pipeline schemas
├── world/                            # Canonical world state
│   ├── world.json                    # Time, locations, global metrics
│   ├── characters.json               # Principals with BDI models
│   ├── relationships.json            # Directed weighted edges
│   ├── secrets.json                  # Information asymmetries
│   ├── assets.json                   # Money, contracts, networks
│   ├── threads.json                  # Open narrative questions
│   └── constraints.json              # Hard/soft rules
├── casting/
│   └── casting.json                  # Character → voice mappings
├── operators/
│   └── operators.json                # Operator library
├── seasons/
│   └── season_01/
│       ├── season_goals.json
│       └── episode_01/               # Generated artifacts
├── docs/
│   ├── SPEC_V3.md                    # Main specification
│   └── spec/                         # Appendices A-E
└── package.json
```

## Expression Language

Operator prerequisites use a simple DSL:

```json
{
  "prereqs": [
    { "expr": "actor.stats.wealth > target.stats.wealth * 10" },
    { "expr": "target.stats.loyalty < 50" },
    { "expr": "actor.offices includes 'powers.SUBPOENA'" }
  ]
}
```

**Supported operations:**
- Comparisons: `==`, `!=`, `>`, `<`, `>=`, `<=`
- Membership: `includes`
- Existence: `exists`
- Arithmetic: `+`, `-`, `*`, `/`

**Context variables:** `actor`, `target`, `world`, `relationship`

## Delta Operations

State changes use absolute paths:

```json
{
  "deltas": [
    { "path": "world.global.unrest", "op": "add", "value": 2 },
    { "path": "characters.char_varo.stats.wealth", "op": "subtract", "value": 5000 },
    { "path": "assets.cash_ledger", "op": "transfer", "from": "char_a", "to": "char_b", "denarii": 10000 }
  ]
}
```

**Operations:** `add`, `subtract`, `set`, `multiply`, `transfer`, `append`, `remove`

## Seed World

The project includes a complete seed world based on the "Titan Trio" scenario:

- **Caelus Varo** — ruthless financier with an intelligence network
- **Quintus Fabius** — moral prosecutor hunting Varo
- **Drusilla** — Quintus's wife, secretly managing money through Varo

Key threads:
- Grain shortage threatening public unrest
- Investigation into Varo's pirate bribes
- Drusilla's hidden investment portfolio
- Marcus the accountant's potential to flip

## Development

```bash
# Run tests
npm test

# Watch mode development
npm run dev

# Type check
npm run build
```

## Specification

Full specification available in `/docs`:

- [SPEC_V3.md](docs/SPEC_V3.md) — Main specification (v3.2)
- [Appendix A](docs/spec/APPENDIX_A_SCHEMAS.md) — Complete schemas
- [Appendix B](docs/spec/APPENDIX_B_OPERATORS.md) — Operator library
- [Appendix C](docs/spec/APPENDIX_C_EXAMPLES.md) — Example artifacts
- [Appendix D](docs/spec/APPENDIX_D_STYLE.md) — Style guide & lexicon
- [Appendix E](docs/spec/APPENDIX_E_PRODUCTION.md) — Voice/video pipeline

## Production Pipeline

Stage I transforms episode scripts into synthesized audio and video.

### Environment Setup

```bash
# For voice synthesis (ElevenLabs)
export ELEVENLABS_API_KEY=your_key_here

# For image generation (OpenAI/DALL-E 3)
export OPENAI_API_KEY=your_key_here
```

### Running Production

```bash
# Full production pipeline
npm run produce:episode

# Specific episode
npm run produce:episode -- --episode 02

# Dry run (generates manifests without API calls)
npm run produce:episode -- --dry-run

# Individual stages (for isolated testing)
npm run produce:storyboard      # Stage I-A: Visual beat identification
npm run produce:audio           # Stage I-B: Voice synthesis
npm run produce:image           # Stage I-C: Image generation

# Preview mode (see below)
npm run produce:episode -- --preview
```

### Preview Mode

Preview mode generates a video using only scenes that have complete assets (all audio segments + all real images). This allows you to:

- Test voice casting before committing to full audio generation
- Validate image quality and style before generating all frames
- Check video assembly and pacing
- Avoid expensive regeneration if changes are needed

```bash
# Generate preview video from complete scenes
npm run produce:episode -- --preview

# Preview for a specific episode
npm run produce:episode -- --episode 02 --preview
```

**How it works:**
1. Scans for "complete" scenes (scenes with all audio files + all non-placeholder images)
2. Generates master audio tracks by concatenating dialogue clips
3. Assembles a preview video (`episode_XX_preview.mp4`) using only complete scenes
4. Reports which scenes were included vs. incomplete

**Example output:**
```
=== Preview Mode: episode_01 ===

Scanning for complete scenes (real audio + real images)...

Complete scenes: SC01
Incomplete scenes: SC02, SC03, SC04, ...

Generating master audio tracks for complete scenes...
  Generating SC01_master.mp3...

Generating preview manifest...
Assembling preview video...
  Processing SC01...

=== Preview Complete ===
Scenes included: SC01
Preview video: seasons/season_01/episode_01/episode_01_preview.mp4
```

### Production Stages

| Stage | Description | Output |
|-------|-------------|--------|
| **I-A** | Storyboarder identifies visual beats | `storyboard.json` |
| **I-B** | ElevenLabs synthesizes dialogue | `/audio/*.mp3` |
| **I-C** | DALL-E 3 generates frames | `/frames/*.png` |
| **I-D** | FFmpeg assembles video | `episode_final.mp4` |

### Casting Registry

Voice mappings are defined in `casting/casting.json`:

```json
{
  "casting": {
    "voice_mappings": [
      {
        "character_id": "char_caelus_varo",
        "eleven_voice_id": "pNInz6obpgDQGcFmaJgB",
        "voice_name": "Adam",
        "default_settings": {
          "stability": 0.5,
          "similarity_boost": 0.75
        }
      }
    ]
  }
}
```

New speaking characters trigger a blocking review item until voice is assigned.

### Visual DNA

Characters and locations require Visual DNA for consistent image generation:

```json
{
  "visual_dna": {
    "physical": "A man in his late 50s with a sharp, hawkish nose...",
    "costume_default": "A short working tunic in undyed wool...",
    "distinguishing_marks": "A thin scar across his right palm..."
  }
}
```

### Testing the Production Pipeline

1. **Test storyboarding only** (no API keys needed):
   ```bash
   npm run produce:storyboard
   ```
   This uses the LLM to identify visual beats and generates `storyboard.json`.

2. **Test with dry run**:
   ```bash
   npm run produce:episode -- --dry-run
   ```
   Generates all manifests without calling external APIs.

3. **Test audio synthesis** (requires ELEVENLABS_API_KEY):
   ```bash
   npm run produce:audio
   ```

4. **Test image generation** (requires OPENAI_API_KEY):
   ```bash
   npm run produce:image
   ```

5. **Test with preview mode** (requires FFmpeg):
   ```bash
   # Generate a few audio clips and images first, then:
   npm run produce:episode -- --preview
   ```
   Assembles a video using only scenes with complete assets. Useful for validating 
   casting choices, image style, and video quality before committing to full generation.

## Roadmap

### v3.0 — Foundation
- [x] JSON world bible + Git commits
- [x] Expression language evaluator
- [x] State store and delta engine
- [x] GraphRAG-lite retrieval
- [x] Director + Writer + Verifier pipeline
- [x] BDI-lite agent proposals
- [x] Pipeline orchestrator
- [x] End-to-end episode generation testing

### v3.1 — Production Pipeline (Current)
- [x] Voice synthesis via ElevenLabs
- [x] Image generation via DALL-E 3
- [x] Video assembly via FFmpeg
- [x] Storyboarder for visual beat selection
- [x] Script parser for dialogue extraction
- [x] Casting registry with human-in-the-loop
- [x] Production orchestrator

### v3.2 — Performance
- [ ] SQLite index for state queries
- [ ] Prompt caching
- [ ] Analytics dashboard

## License

MIT
