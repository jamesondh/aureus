# Aureus

A **neuro-symbolic narrative engine** for generating serialized drama. Produces ~30-minute episodes set in the late Roman Republic, combining symbolic planning and verification with neural (LLM) prose generation.

> "A soap engine wearing a thriller suit" — interpersonal volatility drives character motivation while the surface plot feels like a financial/political thriller.

## Quick Start

```bash
# Install dependencies
npm install

# Set your Anthropic API key
export ANTHROPIC_API_KEY=your_key_here

# Build the project
npm run build

# Generate an episode
npm run generate:episode
```

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
│   └── types/
│       ├── world.ts                  # World state schemas
│       ├── operators.ts              # Operator schemas
│       └── episode.ts                # Episode artifact schemas
├── world/                            # Canonical world state
│   ├── world.json                    # Time, locations, global metrics
│   ├── characters.json               # Principals with BDI models
│   ├── relationships.json            # Directed weighted edges
│   ├── secrets.json                  # Information asymmetries
│   ├── assets.json                   # Money, contracts, networks
│   ├── threads.json                  # Open narrative questions
│   └── constraints.json              # Hard/soft rules
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

## Roadmap

### v3.0 — Foundation (Current)
- [x] JSON world bible + Git commits
- [x] Expression language evaluator
- [x] State store and delta engine
- [x] GraphRAG-lite retrieval
- [x] Director + Writer + Verifier pipeline
- [x] BDI-lite agent proposals
- [x] Pipeline orchestrator
- [ ] End-to-end episode generation testing

### v3.1 — Production Pipeline
- [ ] Voice synthesis via ElevenLabs
- [ ] Image generation via DALL-E 3
- [ ] Video assembly via FFmpeg

### v3.2 — Performance
- [ ] SQLite index for state queries
- [ ] Prompt caching
- [ ] Analytics dashboard

## License

MIT
