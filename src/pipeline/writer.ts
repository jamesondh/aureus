/**
 * Writer
 * 
 * Generates scene prose from scene packets.
 * Outputs structured text with claims and scene events.
 */

import type { LLMClient } from '../llm/client.js';
import type { StateStore } from '../engine/state-store.js';
import type { 
  ScenePacket, 
  WriterOutput, 
  Claim, 
  SceneEvent 
} from '../types/episode.js';
// Character type used for cast details

// ============================================================================
// Types
// ============================================================================

export interface WriterConfig {
  maxSceneWords: number;
  styleGuide: string;
  lexicon: string;
}

const DEFAULT_STYLE_GUIDE = `
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

PERFORMANCE BLOCKS:
- Format: CHARACTER: (Emotion, Delivery) [Stability: X.X] "Dialogue"
- Low stability (0.2-0.4): Fear, grief, manic
- Mid stability (0.5-0.6): Tense, argumentative
- High stability (0.7-0.9): Formal, controlled
`;

const DEFAULT_LEXICON = `
FORBIDDEN WORDS -> REPLACEMENTS:
- minute, second, hour -> "a breath", "third watch", "noon"
- okay, ok, sure -> "It is well", "So be it", "Done"
- police, cop, lawyer, boss -> Lictor, Guard, Advocate, Patron
- percent, percentage -> "One part in ten", "The weight of it"
- stressed, anxious -> troubled, uneasy
`;

const DEFAULT_CONFIG: WriterConfig = {
  maxSceneWords: 500,
  styleGuide: DEFAULT_STYLE_GUIDE,
  lexicon: DEFAULT_LEXICON,
};

// ============================================================================
// Writer
// ============================================================================

export class Writer {
  private llm: LLMClient;
  private store: StateStore;
  private config: WriterConfig;

  constructor(store: StateStore, llm: LLMClient, config: Partial<WriterConfig> = {}) {
    this.store = store;
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate scene text from a scene packet.
   */
  async writeScene(packet: ScenePacket): Promise<WriterOutput> {
    // Get full character data for cast
    const castWithDetails = packet.cast.map(member => {
      const char = this.store.getCharacter(member.character_id);
      return {
        ...member,
        name: char?.name || member.character_id,
        voice: char?.voice,
        visual_dna: char?.visual_dna,
      };
    });

    // Get location details
    const state = this.store.getWorldState();
    const location = state.world.locations.find(l => l.id === packet.setting.location_id);

    const prompt = this.buildPrompt(packet, castWithDetails, location);

    const { data } = await this.llm.completeJson<{
      scene_text: string;
      claims: Claim[];
      scene_events: SceneEvent[];
    }>(
      {
        system: `You are the Writer for a Roman political drama. Generate compelling, authentic scenes that follow the style guide strictly.

${this.config.styleGuide}

${this.config.lexicon}`,
        prompt,
        model: 'standard',
        maxTokens: 4096,
      }
    );

    return {
      scene_id: packet.packet_meta.scene_id,
      scene_text: data.scene_text,
      claims: data.claims,
      scene_events: data.scene_events,
    };
  }

  /**
   * Build the prompt for scene generation.
   */
  private buildPrompt(
    packet: ScenePacket,
    castWithDetails: Array<{
      character_id: string;
      name: string;
      mood?: string;
      active_objective?: string;
      voice?: { tags: string[]; tells?: string[] };
    }>,
    location?: { id: string; name: string; visual_dna?: unknown }
  ): string {
    const beatSequence = packet.director_instructions.sequence.map(beat => ({
      beat_id: beat.beat_id,
      operator: beat.operator_id,
      actor: beat.actor,
      target: beat.target,
      outcome: beat.outcome,
      directives: beat.narrative_directives,
      required_deltas: beat.required_deltas,
    }));

    return `
SCENE: ${packet.packet_meta.scene_id}
LOCATION: ${location?.name || packet.setting.location_id}
TIME: ${packet.setting.time_of_day || 'day'}
ATMOSPHERE: ${packet.setting.atmosphere?.join(', ') || 'neutral'}
${packet.setting.weather ? `WEATHER: ${packet.setting.weather}` : ''}

CAST:
${castWithDetails.map(c => `
- ${c.name} (${c.character_id})
  Mood: ${c.mood || 'neutral'}
  Objective: ${c.active_objective || 'none specified'}
  Voice tags: ${c.voice?.tags.join(', ') || 'default'}
  Tells: ${c.voice?.tells?.join(', ') || 'none'}
`).join('')}

RELATIONSHIPS IN THIS SCENE:
${JSON.stringify(packet.retrieved_subgraph.relationships, null, 2)}

RELEVANT BELIEFS:
${packet.retrieved_subgraph.relevant_beliefs?.map(b => `- ${b.holder}: "${b.text}"`).join('\n') || 'None specified'}

DIRECTOR'S INSTRUCTIONS:
Beat type: ${packet.director_instructions.beat_type}
Pacing: ${packet.director_instructions.pacing || 'standard'}
Conflict: ${packet.director_instructions.conflict || 'as specified in beats'}

BEAT SEQUENCE (execute in order):
${JSON.stringify(beatSequence, null, 2)}

CONSTRAINTS:
- Required deltas to depict: ${JSON.stringify(packet.constraints?.required_deltas || [])}
- Forbidden facts: ${packet.constraints?.forbidden_facts?.join(', ') || 'none'}
- Allowed inventions: ${JSON.stringify(packet.constraints?.allowed_inventions || { extras: 2 })}
- Hook requirement: ${packet.constraints?.hook_requirement || 'End with a button line'}

TASK:
Write this scene as screenplay-style prose with dialogue. Include:
1. Opening with sensory detail establishing the location
2. Dialogue with performance blocks: CHARACTER: (Emotion, Delivery) [Stability: X.X] "Line"
3. Action lines describing physical movement and reactions
4. A closing hook line

Maximum length: ${this.config.maxSceneWords} words

After the scene text, output:
1. CLAIMS: Any new facts introduced (should be minimal and within allowed_inventions)
2. SCENE_EVENTS: What happened, aligned to operators

Output JSON:
{
  "scene_text": "## SC04 — INT. LOCATION - TIME\\n\\n[screenplay prose with dialogue]",
  "claims": [
    { "type": "prop|extra|fact", "content": "description", "source_character": "who introduced it" }
  ],
  "scene_events": [
    { "event": "What happened", "operator_alignment": "OP_...", "outcome": "SUCCESS|FAIL", "delta": "state change depicted" }
  ]
}
`;
  }

  /**
   * Punch-up pass: improve the ending of a scene that failed quality checks.
   */
  async punchUpEnding(
    originalOutput: WriterOutput,
    instructions: string[]
  ): Promise<WriterOutput> {
    const prompt = `
The following scene ending needs improvement:

ORIGINAL SCENE TEXT:
${originalOutput.scene_text}

ISSUES TO FIX:
${instructions.join('\n')}

Rewrite ONLY the last 30-40% of the scene to address these issues.
Keep the opening and middle intact.
Ensure the scene ends with a strong hook line.

Output the complete revised scene in the same JSON format:
{
  "scene_text": "full scene text",
  "claims": [...],
  "scene_events": [...]
}
`;

    const { data } = await this.llm.completeJson<{
      scene_text: string;
      claims: Claim[];
      scene_events: SceneEvent[];
    }>(
      {
        system: `You are improving a scene ending. Focus on creating a stronger hook line and better emotional resolution.`,
        prompt,
        model: 'standard',
        maxTokens: 2048,
      }
    );

    return {
      scene_id: originalOutput.scene_id,
      scene_text: data.scene_text,
      claims: data.claims,
      scene_events: data.scene_events,
    };
  }
}
