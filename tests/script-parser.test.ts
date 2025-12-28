/**
 * Script Parser Tests
 * 
 * Tests for parsing episode scripts and extracting audio segments.
 */

import { describe, it, expect } from 'vitest';
import { 
  ScriptParser, 
  DEFAULT_CHARACTER_MAPPINGS,
  createScriptParser 
} from '../src/production/script-parser.js';

describe('ScriptParser', () => {
  describe('parseEpisodeScript', () => {
    it('should parse scenes from a script', () => {
      const parser = createScriptParser();
      const script = `## SC01 — INT. VARO'S STUDY - MORNING

Some scene text here.

VARO: (Angry) [Stability: 0.5] "This is dialogue."

More text.

---

## SC02 — EXT. THE ROMAN FORUM - AFTERNOON

Another scene with content.

QUINTUS: "Simple dialogue."`;

      const scenes = parser.parseEpisodeScript(script);
      
      expect(scenes).toHaveLength(2);
      expect(scenes[0].sceneId).toBe('SC01');
      expect(scenes[0].locationId).toContain('varos_study');
      expect(scenes[0].timeOfDay).toBe('morning');
      expect(scenes[1].sceneId).toBe('SC02');
      expect(scenes[1].locationId).toContain('the_roman_forum');
      expect(scenes[1].timeOfDay).toBe('afternoon');
    });

    it('should handle various scene header formats', () => {
      const parser = createScriptParser();
      const script = `## SC01 - INT. FABIUS HOUSE - ATRIUM - NIGHT

Text

## SC02 – EXT. FORUM - DAY

Text`;

      const scenes = parser.parseEpisodeScript(script);
      
      expect(scenes).toHaveLength(2);
      expect(scenes[0].sceneId).toBe('SC01');
      expect(scenes[1].sceneId).toBe('SC02');
    });
  });

  describe('extractAudioSegments', () => {
    it('should extract dialogue segments with performance hints', () => {
      const parser = createScriptParser();
      const text = `
Some narrative prose.

CAELUS VARO: (Manic, rapid-fire) [Stability: 0.3] "Three days. That's what we have."

More prose.

MARCUS LICINIUS: (Nervous, Precise) [Stability: 0.4] "Seven, Patron."
`;

      const result = parser.extractAudioSegments('SC01', text);
      
      expect(result.scene_id).toBe('SC01');
      expect(result.audio_segments).toHaveLength(2);
      
      const varo = result.audio_segments[0];
      expect(varo.type).toBe('dialogue');
      expect(varo.character_id).toBe('char_caelus_varo');
      expect(varo.clean_text).toBe("Three days. That's what we have.");
      expect(varo.performance?.stage_direction).toBe('Manic, rapid-fire');
      expect(varo.performance?.stability_override).toBe(0.3);
      
      const marcus = result.audio_segments[1];
      expect(marcus.type).toBe('dialogue');
      expect(marcus.character_id).toBe('char_marcus_accountant');
    });

    it('should extract narrator single-line segments', () => {
      const parser = createScriptParser();
      const text = `
[NARRATOR]: (Ominous) [Stability: 0.7] The dead keep better ledgers than the living.

Some other text.

[NARRATOR]: (Neutral) [Stability: 0.8] The Forum lies empty.
`;

      const result = parser.extractAudioSegments('SC01', text);
      
      expect(result.audio_segments).toHaveLength(2);
      
      const first = result.audio_segments[0];
      expect(first.type).toBe('narrator');
      expect(first.character_id).toBe('NARRATOR');
      expect(first.clean_text).toBe('The dead keep better ledgers than the living.');
      expect(first.performance?.tone).toBe('Ominous');
      expect(first.performance?.stability_override).toBe(0.7);
    });

    it('should extract narrator block segments', () => {
      const parser = createScriptParser();
      const text = `
---NARRATOR---
(Urgent) [Stability: 0.6]
The Forum erupted. Ten thousand voices rose and fell.
Merchants slammed shutters.
---END NARRATOR---
`;

      const result = parser.extractAudioSegments('SC01', text);
      
      expect(result.audio_segments).toHaveLength(1);
      
      const narrator = result.audio_segments[0];
      expect(narrator.type).toBe('narrator');
      expect(narrator.character_id).toBe('NARRATOR');
      expect(narrator.clean_text).toContain('The Forum erupted');
      expect(narrator.clean_text).toContain('Merchants slammed shutters');
      expect(narrator.performance?.tone).toBe('Urgent');
      expect(narrator.performance?.stability_override).toBe(0.6);
    });

    it('should handle dialogue without quotes', () => {
      const parser = createScriptParser();
      const text = `QUINTUS: (Measured) [Stability: 0.7] The ancestors watch and judge.`;

      const result = parser.extractAudioSegments('SC01', text);
      
      expect(result.audio_segments).toHaveLength(1);
      expect(result.audio_segments[0].clean_text).toBe('The ancestors watch and judge.');
    });

    it('should handle style overrides', () => {
      const parser = createScriptParser();
      const text = `MARCUS: (Whispered, terrified) [Stability: 0.25] [Style: 0.6] "The ships... they aren't coming."`;

      const result = parser.extractAudioSegments('SC01', text);
      
      expect(result.audio_segments).toHaveLength(1);
      expect(result.audio_segments[0].performance?.stability_override).toBe(0.25);
      expect(result.audio_segments[0].performance?.style_override).toBe(0.6);
    });
  });

  describe('findSpeakers', () => {
    it('should find all unique speakers', () => {
      const parser = createScriptParser();
      const script = `
VARO: "Line one."
QUINTUS: "Line two."
VARO: "Line three."
[NARRATOR]: Some narration.
DRUSILLA: "Line four."
`;

      const speakers = parser.findSpeakers(script);
      
      expect(speakers.size).toBe(4);
      expect(speakers.has('VARO')).toBe(true);
      expect(speakers.has('QUINTUS')).toBe(true);
      expect(speakers.has('DRUSILLA')).toBe(true);
      expect(speakers.has('NARRATOR')).toBe(true);
    });
  });

  describe('getUnmappedSpeakers', () => {
    it('should identify speakers without mappings', () => {
      const parser = createScriptParser();
      const script = `
VARO: "Known character."
UNKNOWN GUARD: "Unknown character."
FRUIT VENDOR: "Another unknown."
`;

      const unmapped = parser.getUnmappedSpeakers(script);
      
      expect(unmapped).toContain('UNKNOWN GUARD');
      expect(unmapped).toContain('FRUIT VENDOR');
      expect(unmapped).not.toContain('VARO');
    });
  });

  describe('character mapping', () => {
    it('should use default mappings', () => {
      const parser = createScriptParser();
      
      // Verify default mappings include main characters
      const mappings = DEFAULT_CHARACTER_MAPPINGS;
      expect(mappings.find(m => m.displayName === 'CAELUS VARO')).toBeDefined();
      expect(mappings.find(m => m.displayName === 'QUINTUS FABIUS MAXIMUS')).toBeDefined();
      expect(mappings.find(m => m.displayName === 'DRUSILLA')).toBeDefined();
    });

    it('should allow custom mappings', () => {
      const parser = new ScriptParser([
        { displayName: 'CUSTOM CHARACTER', characterId: 'char_custom' }
      ]);
      
      const text = `CUSTOM CHARACTER: "Hello."`;
      const result = parser.extractAudioSegments('SC01', text);
      
      expect(result.audio_segments[0].character_id).toBe('char_custom');
    });

    it('should add mappings dynamically', () => {
      const parser = createScriptParser();
      parser.addCharacterMapping('NEW SPEAKER', 'char_new_speaker');
      
      const text = `NEW SPEAKER: "Hello."`;
      const result = parser.extractAudioSegments('SC01', text);
      
      expect(result.audio_segments[0].character_id).toBe('char_new_speaker');
    });
  });
});
