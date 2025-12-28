# Appendix D: Style Guide & Lexicon

Rules for the Writer to maintain authentic "Roman Noir" aesthetic and support audio synthesis.

---

## D.1 Core Pillars

### High Consequence
Every conversation is a duel. No small talk. Even a greeting measures status.

**Bad:** "Good morning, Senator."  
**Good:** "Senator. You're early. That's unlike you."

### Specific Materiality
Don't tell us someone is rich. Show the material evidence.

**Bad:** "He was wealthy."  
**Good:** "His tunic was dyed with Tyrian purple, double-dipped."

### The "Roman No"
Romans rarely refuse directly. Direct refusal is an insult.

**Bad:** "No, I won't help you."  
**Good:** "That would be... difficult. The auguries are unclear."

---

## D.2 Mode Switching

The Writer must shift register based on scene location.

### Thriller Mode (Street / Port / Subura)
- Short sentences
- Active verbs
- Tacitus-style compression
- Violence implied, not belabored

**Example:**
> He stabbed. The boy fell. Grain spilled across the stones. No one screamed. They knew better.

### Soap Mode (Villa / Senate / Court)
- Complex sentences
- Subordinate clauses
- Cicero-style rhetoric
- Emotional subtext beneath formal surface

**Example:**
> "Though he claims friendship, and though he breaks bread at my table, his hand yet seeks the dagger. I ask you, Conscript Fathers: what name do we give such a man?"

---

## D.3 Forbidden Anachronisms

If the Writer generates these words, the Verifier rejects the scene.

| Category | Forbidden | Roman Replacement |
|----------|-----------|-------------------|
| **Time** | minute, second, hour, o'clock | "a breath," "while water flows," "third watch," "noon" |
| **Agreement** | okay, ok, sure, right, yeah | "It is well," "So be it," "Done," "Agreed" |
| **Authority** | police, cop, lawyer, boss | "Lictor," "Guard," "Advocate," "Patron," "Dominus" |
| **Math** | percent, percentage, statistic | "One part in ten," "The weight of it," "The count" |
| **Medical** | virus, germ, infection, depression | "Miasma," "Bad air," "Melancholia," "Black bile" |
| **Metaphor** | steam, train, clockwork, gunpowder | "millstone," "tide," "chariot wheel," "wildfire" |
| **Emotion** | stressed, anxious, triggered | "troubled," "uneasy," "provoked" |
| **Bureaucracy** | paperwork, filing, report, office | "tablets," "scrolls," "the record," "the chamber" |
| **Modern Idiom** | on the same page, moving forward | "of one mind," "henceforth" |

### Borderline (Use Sparingly)
These aren't strictly wrong but feel modern:
- "situation" (prefer "circumstance" or "affair")
- "problem" (prefer "difficulty" or "obstacle")
- "information" (prefer "intelligence" or "word")

---

## D.4 Rhetorical Markers

Use sparingly (max 1 per scene) to flavor formal dialogue.

### Sententia (The Maxim)
Ending a speech with a punchy, universal truth.

**Examples:**
- "Gold has no smell."
- "The wolf does not bargain with the sheep."
- "Fire purifies. So does ruin."

### Litotes (Understatement)
Denying the opposite to affirm the positive.

**Examples:**
- "He is not unknown to me." (He is my close friend/enemy)
- "That is no small thing." (It is significant)
- "I would not say he lacks ambition." (He is extremely ambitious)

### Anaphora (Repetition)
Repeating the start of phrases for emphasis. Senate/formal speeches only.

**Example:**
> "He betrayed the city. He betrayed his father. He betrayed himself."

### Tricolon (Rule of Three)
Three parallel elements, often with crescendo.

**Example:**
> "He came. He spoke. He conquered nothing."

---

## D.5 Casual Piety

Romans treat gods as neighbors, not distant holy figures. Invoke them casually.

**Mild oaths:**
- "By Hercules"
- "Castor's luck"
- "Jupiter willing"

**Stronger oaths:**
- "By the Styx"
- "Juno's tits" (vulgar, lower class)
- "Mars and all his sons"

**Invocations:**
- "The gods see this"
- "May Mercury speed your message"
- "Fortune favors..." (ironic use acceptable)

---

## D.6 Character Voice Tags

Each character should have consistent speech patterns defined in their `voice` object.

### Varo (Financier)
- **Tags:** staccato, mathematical, profane, impatient
- **Tells:** tugs at short tunic, checks sun position, interrupts pleasantries
- **Sample:** "Three days. That's what we have. Three days before the price collapses and every fool in the Forum realizes what we knew last week. So. Are you in or are you poor?"

### Quintus (Prosecutor)
- **Tags:** archaic, moralizing, latin-purist, defensive
- **Tells:** adjusts toga fold, quotes Ennius, refuses to look at gold
- **Sample:** "The ancestors did not build this Republic so that men like him could strip it for parts. I will not be the generation that failed to act."

### Drusilla (Broker)
- **Tags:** clinical, stoic, low-volume, diagnostic
- **Tells:** unblinking eye contact, perfect posture, silence as weapon
- **Sample:** "You're not angry. You're afraid. And when you're afraid, you make mistakes. Sit down. Breathe. Tell me what actually happened."

---

## D.7 Scene Structure

### Opening
- Establish location with sensory detail (sound, smell, light)
- First line of dialogue should reveal power dynamic

### Middle
- Each speech advances plot or reveals character
- No filler exchanges ("How are you?" "Fine.")
- Physical action breaks up dialogue blocks

### Closing (The Button)
- Every scene ends on a hook line
- Types: threat, revelation, question, ironic reversal
- Leave the audience wanting more

**Examples:**
- **Threat:** "I'll remember this. I remember everything."
- **Revelation:** "The ledger isn't in the safe. It never was."
- **Question:** "And where, exactly, was your wife last night?"
- **Ironic reversal:** "Welcome to the Senate, Senator. Try not to bleed on the marble."

---

## D.8 Violence Guidelines

Violence is rare and consequential. Not action-movie choreography.

### Do
- Show aftermath (blood, shock, silence)
- Use violence to permanently change relationships
- Make witnesses react with appropriate horror

### Don't
- Extended fight scenes
- Graphic torture description
- Consequence-free violence
- Modern fight choreography

**Example:**
> The blade went in below the ribs. Quieter than he expected. Marcus looked surprised more than hurt—the pain would come later, if there was a later. The cup fell from his hand. Wine mixed with blood on the tiles. Someone should clean that, Varo thought. Someone always cleaned it up.

---

## D.9 Intimacy Guidelines

Treat intimacy as leverage and vulnerability, not titillation.

### Do
- Focus on power dynamics
- Show emotional consequence
- Use implication over explicit description

### Don't
- Gratuitous detail
- Modern sexual vocabulary
- Intimacy without narrative purpose

**Example:**
> She didn't speak until afterward. Then: "You know I could destroy you with what you just told me." He smiled at the ceiling. "That's why I told you."

---

## D.10 Setting Description Palette

Sensory details appropriate to Roman contexts.

### Sounds
- Fountain water
- Sandals on marble
- Distant crowd roar
- Pigeons in the eaves
- Hammer on anvil

### Smells
- Incense (temples, villas)
- Garum (fish sauce, streets)
- Sweat (crowds, baths)
- Smoke (cooking, sacrifice)
- Perfumed oil (wealthy characters)

### Light
- Oil lamp flicker
- Harsh noon sun
- Dawn gray
- Torch shadow
- Impluvium reflection

### Weather
- Oppressive heat
- Sudden rain
- Dust storms
- Cold marble floors in winter
- Sea wind (coastal scenes)

---

## D.11 Naming Conventions

### Roman Names (Citizens)
- Praenomen (personal): Marcus, Gaius, Lucius
- Nomen (family): Julius, Cornelius, Fabius
- Cognomen (branch/nickname): Caesar, Scipio, Maximus

**Use cognomen in dialogue** after first introduction: "Varo said" not "Caelus said"

### Women
- Take feminized family name: Julia, Cornelia, Fabia
- May have personal name or distinguishing mark: "Drusilla" (from a cognomen)
- Informal address uses first name: "Drusilla" not "Fabia"

### Slaves/Freedmen
- Single name (often Greek): Tiro, Sosigenes, Chrysippus
- Freedmen add patron's name: Marcus Tullius Tiro (Cicero's freedman)

### Foreigners
- Keep native naming conventions
- Greeks: single name + place: "Apollonius of Rhodes"
- Gauls, Germans: transliterate appropriately

---

## D.12 Performance Blocks

The Writer embeds performance hints inline with dialogue to guide voice synthesis in Stage I.

### D.12.1 Syntax

```
CHARACTER: (Emotion, Delivery) [Stability: X.X] "Dialogue text here."
```

**Components:**
- `(Emotion, Delivery)`: Human-readable acting notes (stripped before synthesis)
- `[Stability: X.X]`: ElevenLabs stability override (0.0-1.0, lower = more emotional variation)
- `[Style: X.X]`: Optional style exaggeration override (0.0-1.0)

### D.12.2 Stability Guidelines

| Range | Effect | Use For |
|-------|--------|---------|
| 0.2-0.3 | High variability, breath, crackle | Terror, grief, manic episodes |
| 0.4-0.5 | Moderate variability | Tense conversation, arguments |
| 0.6-0.7 | Balanced | Normal dialogue |
| 0.8-0.9 | Consistent, controlled | Formal speeches, stoic delivery |

### D.12.3 Examples

```markdown
VARO: (Manic, rapid-fire) [Stability: 0.3] "Three days. That's what we have. Three days before every fool in the Forum realizes what we knew last week."

DRUSILLA: (Measured, clinical) [Stability: 0.8] "You're not angry. You're afraid."

MARCUS: (Whispered, terrified) [Stability: 0.25] [Style: 0.6] "The ships... they aren't coming, are they?"

QUINTUS: (Formal oration) [Stability: 0.85] "The ancestors did not build this Republic so that men like him could strip it for parts."
```

### D.12.4 Punctuation as Prosody

ElevenLabs interprets punctuation for pacing. Use deliberately:

| Mark | Effect |
|------|--------|
| `...` | Hesitation, trailing off |
| `--` | Interruption, abrupt stop |
| `!` | Increased volume/intensity |
| `?` | Rising intonation |
| `,` | Brief pause |
| `.` | Full stop, finality |

**Example:**
```
VARO: "The price will-- no. Listen. The price... it doesn't matter anymore."
```

This renders as: confident start, interruption, hesitation, resignation.

### D.12.5 Performance Block Placement

- Place performance hints on **every dialogue turn** for named characters
- Extras/crowd can use generic tags: `(Background, murmur)` without stability overrides
- For action lines (non-dialogue), omit performance blocks entirely

---

## D.13 Quick Reference Card

For injection into Writer prompts:

```
VOICE RULES:
- No modern idioms (okay, percent, boss, stressed)
- Time: watches, breaths, noon - not hours/minutes
- Agreement: "It is well" / "So be it" - not okay/sure
- Authority: Patron, Dominus, Advocate - not boss/lawyer

REGISTER:
- Street/Port: Short sentences. Tacitus style.
- Villa/Senate: Complex clauses. Cicero style.

SCENE STRUCTURE:
- Open with sensory detail + power dynamic
- Close with hook line (threat/reveal/question/irony)
- No filler dialogue

RHETORIC (max 1 per scene):
- Sententia: Universal truth at speech end
- Litotes: "Not unknown" = well known
- Anaphora: "He betrayed X. He betrayed Y."
- Tricolon: Rule of three

PIETY:
- Casual oaths: "By Hercules" / "Castor's luck"
- Stronger: "Juno's tits" (vulgar) / "By the Styx"

PERFORMANCE BLOCKS:
- Format: CHARACTER: (Emotion, Delivery) [Stability: X.X] "Dialogue"
- Low stability (0.2-0.4): Fear, grief, manic
- Mid stability (0.5-0.6): Tense, argumentative
- High stability (0.7-0.9): Formal, controlled
- Use punctuation for pacing: ... hesitation, -- interruption
```
