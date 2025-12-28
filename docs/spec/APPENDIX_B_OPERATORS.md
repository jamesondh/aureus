# Appendix B: Operator Library

Operators are the atomic "moves" available to agents and the Director. They encode prerequisites, effects, risks, and writer guidance.

---

## B.1 Operator Schema

```json
{
  "id": "OP_EXAMPLE",
  "type": "thriller|soap",
  "tags": ["category", "subcategory"],
  "prereqs": [
    { "expr": "condition that must be true" }
  ],
  "effects": [
    { "path": "state.path.to.modify", "op": "add|subtract|set|multiply", "value": 10 }
  ],
  "side_effect_risks": [
    { 
      "id": "risk_id", 
      "text": "What might go wrong", 
      "prob": 0.3,
      "consequence_operator": "OP_CONSEQUENCE_ID",
      "consequence_delay": "immediate|same_episode|next_episode"
    }
  ],
  "scene_suggestions": ["scene_type_1", "scene_type_2"],
  "allowed_inventions": { "extras": 2, "new_facts": 1 },
  "writer_guidance": {
    "visual_cues": "What the scene should look like",
    "dialogue_flavor": "Tone for character speech",
    "success_beat": "How to write if operator succeeds",
    "fail_beat": "How to write if operator fails"
  }
}
```

**Fields:**
- `prereqs`: Conditions checked before operator can fire (all must pass). See Section 4.4 in the main spec for expression language syntax.
- `effects`: State modifications applied on success. Paths use absolute notation (see Section 8.3).
- `side_effect_risks`: Probabilistic complications resolved during Director planning (see Section 4.5).
  - `consequence_operator`: Optional operator triggered if side effect fires
  - `consequence_delay`: When the consequence occurs (`immediate`, `same_episode`, `next_episode`)
- `allowed_inventions`: Limits on what the Writer can create (extras, minor facts)

---

## B.2 Thriller Operators

These change external world state: assets, legal exposure, public narrative.

### OP_WITNESS_FLIP_FINANCIAL

Bribe or pressure a witness to change testimony.

```json
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
    { 
      "id": "risk_double_cross", 
      "text": "Witness takes money but stays loyal", 
      "prob": 0.2,
      "consequence_operator": "OP_WITNESS_BETRAYAL",
      "consequence_delay": "same_episode"
    },
    { 
      "id": "risk_entrapment", 
      "text": "Offer recorded by opponent", 
      "prob": 0.1,
      "consequence_operator": "OP_EVIDENCE_SURFACES",
      "consequence_delay": "next_episode"
    }
  ],
  "scene_suggestions": ["bathhouse_meeting", "slave_proxy_exchange", "midnight_garden"],
  "writer_guidance": {
    "visual_cues": "Private location, nervous body language, physical exchange of coins/tokens",
    "success_beat": "The witness accepts and commits; actor feels powerful but exposed",
    "fail_beat": "The witness refuses or demands more; actor must escalate or retreat"
  }
}
```

---

### OP_ASSET_FREEZE

Use legal authority to lock opponent's resources.

```json
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
    { 
      "id": "risk_market_crash", 
      "text": "Panic in the Forum causes general market dip", 
      "prob": 0.4,
      "consequence_operator": null,
      "consequence_delay": "immediate"
    }
  ],
  "scene_suggestions": ["forum_proclamation", "bank_run", "doorstep_writ_delivery"],
  "writer_guidance": {
    "visual_cues": "Official seals, public announcement, crowds gathering",
    "success_beat": "Target is publicly humiliated; their allies start to distance",
    "fail_beat": "Legal challenge delays the freeze; actor looks overreaching"
  }
}
```

---

### OP_INFORMATION_ARBITRAGE

Exploit advance knowledge to gain financial advantage.

```json
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
  "allowed_inventions": { "new_facts": 0, "extras": 1 },
  "writer_guidance": {
    "visual_cues": "Maps, ledgers, exhausted messengers, urgent whispered orders",
    "success_beat": "The trade executes; actor's wealth visibly increases",
    "fail_beat": "News leaks early; the market moves before actor can act"
  }
}
```

---

### OP_RUMOR_CAMPAIGN

Deploy gossip to damage opponent's reputation.

```json
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
  "scene_suggestions": ["graffiti_painting", "tavern_gossip", "opponent_heckled_in_forum"],
  "writer_guidance": {
    "visual_cues": "Street scenes, laughing crowds, crude graffiti",
    "success_beat": "Target is mocked publicly; they cannot appear without jeers",
    "fail_beat": "Rumor doesn't stick; target gains sympathy as victim"
  }
}
```

---

### OP_DESTROY_EVIDENCE

Eliminate proof before it can be used.

```json
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
  "scene_suggestions": ["burning_ledger", "sinking_boat", "bribing_scribe"],
  "writer_guidance": {
    "visual_cues": "Fire, water, physical destruction, paranoid glances",
    "success_beat": "Evidence is gone; actor breathes relief but knows they've crossed a line",
    "fail_beat": "Interrupted mid-act; must flee or explain"
  }
}
```

---

### OP_FOMENT_RIOT

Weaponize public unrest for political ends.

```json
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
  "scene_suggestions": ["demagogic_speech", "storefront_smashing", "senators_fleeing"],
  "writer_guidance": {
    "visual_cues": "Crowds, torches, broken glass, panicked nobles",
    "success_beat": "Courts close; legal proceedings halted; actor has bought time",
    "fail_beat": "Riot turns against actor's allies; unintended casualties"
  }
}
```

---

### OP_SUBPOENA_WITNESS

Use legal authority to compel testimony.

```json
{
  "id": "OP_SUBPOENA_WITNESS",
  "type": "thriller",
  "tags": ["legal", "investigation", "procedural"],
  "prereqs": [
    { "expr": "actor.offices includes 'powers.SUBPOENA'" },
    { "expr": "target.status.wanted == false" }
  ],
  "effects": [
    { "path": "target.status.subpoenaed", "op": "set", "value": true },
    { "path": "world.global.legal_exposure", "op": "add", "value": 1 }
  ],
  "side_effect_risks": [
    { "id": "risk_flight", "text": "Witness flees jurisdiction", "prob": 0.2 }
  ],
  "scene_suggestions": ["writ_delivery", "courtroom_announcement", "witness_cornered"],
  "writer_guidance": {
    "visual_cues": "Official documents, nervous recipients, legal formality",
    "success_beat": "Witness is compelled; their patron must decide whether to intervene",
    "fail_beat": "Witness has immunity or protector; subpoena is blocked"
  }
}
```

---

## B.3 Soap Operators

These change internal agent state: beliefs, relationships, secrets, status.

### OP_PUBLIC_SNUB

Deliberate social humiliation.

```json
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
  "scene_suggestions": ["refusing_handshake", "taking_best_seat", "ignoring_greeting"],
  "writer_guidance": {
    "visual_cues": "Public setting, witnesses, frozen moment of shock",
    "success_beat": "Target is visibly diminished; onlookers take note",
    "fail_beat": "Target recovers with wit; actor looks petty"
  }
}
```

---

### OP_CONFESSION_VULNERABLE

Share a secret to build trust (and create leverage).

```json
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
  "scene_suggestions": ["late_night_wine", "post_defeat_collapse", "pillow_talk"],
  "writer_guidance": {
    "visual_cues": "Private setting, low light, physical proximity, emotional vulnerability",
    "success_beat": "Bond deepens; both feel closer but actor is now exposed",
    "fail_beat": "Target recoils or judges; intimacy rejected"
  }
}
```

---

### OP_MARRIAGE_ALLIANCE_OFFER

Propose dynastic union for political gain.

```json
{
  "id": "OP_MARRIAGE_ALLIANCE_OFFER",
  "type": "soap",
  "tags": ["family", "transaction", "long_game"],
  "prereqs": [
    { "expr": "actor.family.eligible_members > 0" },
    { "expr": "target.family.eligible_members > 0" }
  ],
  "effects": [
    { "path": "relationship.type", "op": "set", "value": "betrothed" },
    { "path": "actor.assets.wealth", "op": "add", "value": "dowry_amount" },
    { "path": "actor.factions.political_capital", "op": "add", "value": 5 }
  ],
  "side_effect_risks": [
    { "id": "risk_unhappy", "text": "Personal misery penalty to efficiency", "prob": 0.6 }
  ],
  "scene_suggestions": ["fathers_negotiating", "awkward_introduction", "signing_contract"],
  "writer_guidance": {
    "visual_cues": "Formal setting, legal documents, uncomfortable young people",
    "success_beat": "Alliance sealed; families now bound by obligation",
    "fail_beat": "Terms rejected; insult to both houses"
  }
}
```

---

### OP_BACKCHANNEL_NEGOTIATION

Secret talks between public enemies.

```json
{
  "id": "OP_BACKCHANNEL_NEGOTIATION",
  "type": "soap",
  "tags": ["diplomacy", "secret", "pragmatic"],
  "prereqs": [
    { "expr": "actor.relationship(target).type == 'adversary'" },
    { "expr": "actor.relationship(target).respect > 20" }
  ],
  "effects": [
    { "path": "world.global.tension", "op": "subtract", "value": 2 },
    { "path": "relationship.agreement", "op": "set", "value": "temporary_truce" }
  ],
  "side_effect_risks": [
    { "id": "risk_base_anger", "text": "Core supporters feel betrayed", "prob": 0.4 }
  ],
  "scene_suggestions": ["unmarked_carriage", "neutral_ground_temple", "written_cipher"],
  "writer_guidance": {
    "visual_cues": "Secrecy, disguises, coded language, mutual wariness",
    "success_beat": "Truce achieved; both gain breathing room",
    "fail_beat": "Talks collapse; positions harden"
  }
}
```

---

### OP_STOIC_COUNSEL

Use philosophy/logic to calm an agitated ally.

```json
{
  "id": "OP_STOIC_COUNSEL",
  "type": "soap",
  "tags": ["psychology", "calm", "manipulation"],
  "prereqs": [
    { "expr": "actor.archetype == 'stoic_broker' OR actor.voice.tags includes 'clinical'" },
    { "expr": "target.stats.impulse_control < 30" }
  ],
  "effects": [
    { "path": "target.bdi.intentions", "op": "remove", "value": "RASH_ACTION" },
    { "path": "relationship.dependency", "op": "add", "value": 5 }
  ],
  "side_effect_risks": [],
  "scene_suggestions": ["garden_walk", "quoting_philosophy", "cold_stare"],
  "writer_guidance": {
    "visual_cues": "Calm body language contrasting with agitation, measured speech",
    "success_beat": "Target de-escalates; sees actor as wise counselor",
    "fail_beat": "Target rejects advice; may resent the attempt to control"
  }
}
```

---

### OP_BETRAYAL_FOR_SURVIVAL

Sacrifice an ally to save yourself.

```json
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
  "scene_suggestions": ["courtroom_finger_point", "locking_door", "tearful_apology"],
  "writer_guidance": {
    "visual_cues": "High stakes, witnesses, irreversible moment",
    "success_beat": "Actor escapes; target is destroyed; relationship is irrecoverable",
    "fail_beat": "Betrayal is exposed before it lands; actor loses everything"
  }
}
```

---

### OP_MEDIATE_CONFLICT

Attempt to broker peace between warring parties.

```json
{
  "id": "OP_MEDIATE_CONFLICT",
  "type": "soap",
  "tags": ["diplomacy", "relationship", "risky"],
  "prereqs": [
    { "expr": "actor.relationship(target_a).loyalty > 50" },
    { "expr": "actor.relationship(target_b).loyalty > 50" }
  ],
  "effects": [
    { "path": "relationship(target_a, target_b).resentment", "op": "subtract", "value": 10 },
    { "path": "actor.stats.auctoritas", "op": "add", "value": 5 }
  ],
  "side_effect_risks": [
    { "id": "risk_blamed", "text": "Both sides blame mediator for failure", "prob": 0.3 }
  ],
  "scene_suggestions": ["neutral_dinner", "shuttle_diplomacy", "forced_handshake"],
  "writer_guidance": {
    "visual_cues": "Actor between two hostile parties, careful word choice",
    "success_beat": "Tension reduced; actor gains reputation as peacemaker",
    "fail_beat": "Talks explode; actor caught in crossfire"
  }
}
```

---

## B.4 Episode Operator Requirements

Every episode must include a minimum operator mix:

| Category | Minimum | Maximum |
|----------|---------|---------|
| Thriller operators | 10 | 14 |
| Soap operators | 6 | 10 |
| Total operators | 16 | 24 |

**Mandatory beats per episode:**
- At least 1 REVEAL (secret exposed or discovered)
- At least 1 REVERSAL (plan backfires or unexpected consequence)
- At least 1 CONFRONTATION (relationship materially changes)
- Exactly 1 CLIFFHANGER (final scene)

---

## B.5 Secret Decay and Operator Timing

Agents are aware of secret decay. The BDI Planning layer treats high-value secrets as perishable assets:

- **High Decay (half_life < 3 episodes):** Encourages "hot" operators (immediate blackmail, swift publication)
- **Low Decay (half_life > 6 episodes):** Encourages "cold" operators (hoarding, long-term leverage)

If an agent waits too long, the secret becomes "inert" and leverage is lost.
