## Scope and creative target

**Format:** serialized, ~30-minute episodes (typically 18–24 scenes).
**Setting:** late Roman Republic with “vibes accuracy” (institutions/texture feel right; you are not obligated to be fully historically precise).
**Core pitch:** a **soap engine** (secrets, status, loyalties) driving character motivation and fallout, wrapped in a **thriller suit** (courts + elections + grain market).

**Default time window recommendation:** “late 70s sliding into early 60s BCE” as a flexible composite era (post–Sulla power vacuum, rising prosecutions, populist agitation, increasing street violence). You can keep all characters fictional but let institutions be recognizably Roman.

---

## Option B architecture (two-layer planner)

### Layer 1: Thriller Beat Planner (deterministic, stateful)

Purpose: produce a coherent strategic chess match with explicit causality.

Outputs per episode:

* **Strategic objective** for each faction (e.g., “neutralize prosecution,” “win tribunate,” “break grain corner”)
* **Beat sheet** (A/B/C threads) with “moves” that change measurable state
* **Required evidence chain** / voting math / market mechanics for each move (lightweight, not fully simulated)

### Layer 2: Soap Fallout Planner (semi-deterministic, stateful)

Purpose: convert moves into emotional consequences and interpersonal detonations.

Outputs per episode:

* **Confrontation scenes** (two-handers) that spend/accumulate pressure
* **Reversal + reveal** placement
* **Cliffhanger** that creates a new constraint for the thriller planner next episode

---

## Season structure

A 10-episode season template that stays automatable:

1. **Ignition:** a scandal in grain/contracting; prosecutor announces inquiry.
2. **First squeeze:** ledger rumors; a witness is approached.
3. **Counter-squeeze:** smear campaign + procedural trap.
4. **Public eruption:** Forum speech + street incident shifts narrative.
5. **Midseason reversal:** “the evidence points at the wrong patron.”
6. **The commission forms:** formal legal arena locks in.
7. **Market crisis:** grain shock forces elections/legislation linkage.
8. **Betrayal episode:** a key lieutenant flips; alliance fractures.
9. **Trial/vote climax:** verdict or decisive vote.
10. **Escalation hook:** promotion/exile/province posting; “bigger arena” threat for next season.

---

## World bible (minimal but sufficient)

### Institutions you will use (vibes-accurate)

* **Courts/prosecution:** praetor, quaestiones (standing courts), advocates, juries, witnesses, procedural delays.
* **Elections/legislation:** assemblies, tribunes, senatorial maneuvering, patronage, vote-buying as favors.
* **Grain economy:** shipping, warehousing, contracts, shortages, price spikes, public anger, “moral panic.”
* **Street layer:** collegia/gangs, clients, public spectacles, rumors, threats.

### Tone rules

* Dialogue is modern-readable but avoids anachronistic concepts.
* The show is prestige-thriller pacing with soap-level interpersonal volatility.
* Violence is mostly off-screen leverage; on-screen violence is rare and consequential.

---

## Core cast design (Billions archetypes translated)

Define 6–10 principals and 10–20 recurring. Keep them fictional.

**Faction A (Capital / “Axe”)**

* *Equestrian grain financier / contractor kingpin* (the predator)
* *Operator lieutenant* (bribes, intimidation, logistics)
* *Counsel/fixer* (jurist or priestly insider; “edge provider”)
* *Analyst savant* (Greek accountant; patterns from manifests and ledgers)

**Faction B (Law / “Chuck”)**

* *Ambitious prosecutor-politician* (praetor/tribune-aligned)
* *Idealist aide who compromises over time*
* *Senatorial patron with a spotless public face*
* *Street ally* (can mobilize crowds, rumors, disruption)

**Faction C (Swing power / chaos)**

* *Populist tribune candidate*
* *Grain prefect / logistics official*
* *Provincial governor returning with secrets*

Each character gets a compact “engine”:

* **Core drive** (status, control, revenge, legacy, security)
* **Weak spot**
* **Default tactic** (charm, threaten, martyr, stonewall, seduce, moralize)
* **Tells/voice tags** (cadence, favorite metaphors, taboo topics)

---

## State model (what your system tracks)

This is the backbone that makes automation reliable.

### 1) Relationship graph (soap)

Edges between characters with numeric values:

* loyalty, fear, resentment, attraction (optional), debt
* “knows secret X” flags

### 2) Power & legitimacy (thriller)

Per faction + key individuals:

* **Legal exposure:** investigation stage, evidence strength, witness availability, jury capture risk
* **Political capital:** patronage points, bloc support, election viability, “forum sentiment”
* **Economic position:** cash reserves, grain inventory, contract stakes, credit/debt web
* **Public narrative:** rumor heat, scandal heat, moral framing advantage

### 3) Secrets and leverage inventory (soap-thriller bridge)

Each secret object has:

* subject(s), holder(s), proof type (ledger, witness, seal, overheard), credibility, blast radius, monetization value, legal value, and “decay” (how fast it becomes stale).

### 4) Threads (open loops)

A thread is a promise/question the audience is tracking:

* “Who forged the seal?”, “Will the witness testify?”, “Can X win tribunate?”, “Will grain ships arrive?”

Threads have priority and required advancement cadence (e.g., every 2 episodes).

---

## Operator library (the “moves” your planner uses)

### Thriller operators (change courts/elections/grain state)

* **Ledger surfaces** (authenticity contested; chain of custody becomes a mini-thread)
* **Witness flip attempt** (offer, threat, manumission, relocation)
* **Procedural delay** (challenge jurisdiction, disqualify advocate, attack evidence)
* **Jury capture push** (patrons lean, favors called, intimidation risk)
* **Forum narrative blast** (speech, pamphlets, staged outrage, “moral framing”)
* **Grain shock** (delayed ships, warehouse fire, piracy rumor, strike)
* **Contract bid rig** (tax/grain contract steered to allies; creates paper trail)
* **Legislation gambit** (reform bill that is actually targeted enforcement)
* **Provincial recall threat** (force enemy into legal jeopardy on return)
* **Street pressure** (riot risk, staged brawl, crowd intimidation—always with blowback)

### Soap operators (convert moves into emotional fallout)

* **Betrayal for protection** (ally sells someone out “to save the family”)
* **Misplaced trust** (confidant leaks; secret changes hands)
* **Sacrifice play** (minor character takes blame; creates long-term resentment)
* **Forbidden alliance** (two enemies cooperate quietly for mutual survival)
* **Humiliation scene** (status injury that forces escalation next episode)
* **Intimacy as leverage** (not necessarily sexual; confidences traded)

Each operator has:

* prerequisites, state deltas, and “cost” (heat generated, loyalty lost, risk increased)

---

## Episode template (30 minutes)

**Target scene mix (18–24 scenes):**

* 6–8 thriller-procedural scenes (planning, negotiation, evidence, votes, logistics)
* 6–8 soap fallout scenes (two-handers, betrayals, confessions, threats)
* 2–3 public scenes (Forum/courthouse/crowd) for narrative temperature
* 1 cold open + 1 tag (cliffhanger)

**Mandatory beats:**

* one **reversal** (a move helps the enemy more than expected)
* one **reveal** (new fact or proof changes leverage map)
* one **confrontation** (relationship edge shifts materially)
* one **cliffhanger** that imposes a concrete constraint for next episode

---

## Generation loop (Claude Code API-friendly)

For each episode:

1. **State snapshot + goals**

* Ingest prior episode deltas; pick faction goals and 2–4 prioritized threads.

2. **Thriller beat plan (LLM + constraints)**

* Produce an outline with explicit “move → mechanism → state delta”.
* Output in structured JSON (beats with operator IDs, prerequisites, deltas).

3. **Soap fallout plan (LLM constrained by thriller plan)**

* Place confrontations/reversals/reveals; assign POV and emotional target per scene.

4. **Scene drafting (LLM)**

* Generate scenes one-by-one with strict inputs:

  * allowed facts, required actions, forbidden contradictions, target deltas, style constraints

5. **Verification pass**

* Rule checks (deterministic): no dead characters speaking; secrets don’t teleport; deltas applied; thread cadence met.
* LLM critic check: “does this scene accomplish required deltas without adding unauthorized facts?”

6. **Revision / regeneration**

* If a scene fails, regenerate that scene only (or the last 2 scenes if the failure is causal).

7. **Commit**

* Update state store from the planned deltas (not from freeform text), then generate:

  * “Previously on…” recap (from deltas)
  * episode logline + end-of-episode hooks list

---

## Prompting spec (high-level templates)

### A) Planner prompt (thriller)

Inputs: state snapshot, active threads, faction goals, operator library.
Outputs: JSON beats with fields:

* `beat_id, thread, operator_id, location, characters, intent, mechanism, required_info, state_delta, hook`

### B) Fallout prompt (soap)

Inputs: thriller beats + relationship graph + secrets inventory.
Outputs: scene list mapping beats to confrontations:

* `scene_id, anchors(beat_ids), emotional_turn, relationship_delta, secret_transfer, button_line_goal`

### C) Scene prompt (writer)

Inputs per scene:

* “canon facts,” “what must happen,” “what may be invented,” “state deltas,” “tone/style”
  Output: screenplay-style scene text + a structured “claimed facts” list (to validate).

### D) Critic prompt

Inputs: scene + required deltas + forbidden list.
Outputs:

* pass/fail, violations, minimal fix suggestions

---

## Quality gates (what “good” means for automation)

An episode is accepted if:

* Every scene applies at least one approved delta (relationship, leverage, narrative heat, legal exposure, economic position).
* No new “major facts” appear unless whitelisted as creatable.
* At least 1 thread advances materially; no more than 1 thread resolves fully (to preserve serialization).
* Cliffhanger creates a **hard constraint** (a deadline, a captured witness, a sealed tablet, a vote scheduled).

---

## Configuration knobs (so you can tune output)

* Soap intensity (0–3): how often secrets/relationships override strategy.
* Thriller tightness (0–3): how strict mechanism explanations must be.
* Heat tolerance: how quickly scandals escalate.
* Realism: “vibes” vs “plausible” (later you can tighten).
* Violence level, sexual content level.
* Determinism: seed controls planner outputs; writer can be more free.

---

## Deliverables to build first (minimal viable system)

1. **State schema** (relationships, secrets, threads, faction stats) + a small seed world.
2. **Operator library v1** (15–25 operators total).
3. **Episode generator v1**:

* planner → fallout planner → scene writer → critic → commit

4. **Recap generator** driven from deltas.
5. **Regression tests** as “story invariants” (no teleporting secrets, no contradictory evidence chains).
