/**
 * Script Parser
 * 
 * Parses episode scripts to extract dialogue and narrator segments
 * for audio synthesis. Handles performance hints, stability overrides,
 * and character name resolution.
 */

import type {
  AudioSegment,
  SceneAudio,
  PerformanceHints,
} from '../types/production.js';

// ============================================================================
// Types
// ============================================================================

export interface ParsedScene {
  sceneId: string;
  header: string;
  text: string;
  locationId: string;
  timeOfDay: string;
}

export interface CharacterMapping {
  displayName: string;
  characterId: string;
}

// ============================================================================
// Regular Expressions
// ============================================================================

// Scene header: ## SC01 — INT. LOCATION - TIME or ## SC01 — EXT. LOCATION - TIME
const SCENE_HEADER_REGEX = /^## (SC\d+)\s*[—–-]\s*((?:INT|EXT)\.\s*[^-]+)\s*-\s*(.+)$/i;

// Dialogue line: CHARACTER_NAME: (Stage Direction) [Stability: X.X] "Dialogue text"
// Supports both quoted and unquoted dialogue
const DIALOGUE_REGEX = /^([A-Z][A-Z\s]+):\s*(?:\(([^)]+)\))?\s*(?:\[Stability:\s*([\d.]+)\])?\s*(?:\[Style:\s*([\d.]+)\])?\s*"?(.+?)"?$/;

// Narrator single line: [NARRATOR]: (Tone) [Stability: X.X] Text
const NARRATOR_SINGLE_REGEX = /^\[NARRATOR\]:\s*(?:\((\w+)\))?\s*(?:\[Stability:\s*([\d.]+)\])?\s*(?:\[Style:\s*([\d.]+)\])?\s*(.+)$/i;

// Narrator block start: ---NARRATOR---
const NARRATOR_BLOCK_START = /^---NARRATOR---$/i;

// Narrator block end: ---END NARRATOR---
const NARRATOR_BLOCK_END = /^---END NARRATOR---$/i;

// Performance hints inside narrator block: (Tone) [Stability: X.X]
const NARRATOR_BLOCK_HINTS = /^\((\w+)\)\s*(?:\[Stability:\s*([\d.]+)\])?\s*(?:\[Style:\s*([\d.]+)\])?$/;

// Scene separator (used for splitting scenes in concatenated scripts)
const _SCENE_SEPARATOR = /^---$/;
void _SCENE_SEPARATOR; // Suppress unused variable warning

// ============================================================================
// Script Parser
// ============================================================================

export class ScriptParser {
  private characterMappings: Map<string, string>;
  private locationMappings: Map<string, string>;

  constructor(characterMappings?: CharacterMapping[], locationMappings?: LocationMapping[]) {
    this.characterMappings = new Map();
    this.locationMappings = new Map();
    
    if (characterMappings) {
      for (const mapping of characterMappings) {
        this.characterMappings.set(
          mapping.displayName.toUpperCase(),
          mapping.characterId
        );
      }
    }
    
    if (locationMappings) {
      for (const mapping of locationMappings) {
        this.locationMappings.set(
          mapping.displayName.toUpperCase(),
          mapping.locationId
        );
      }
    }
  }

  /**
   * Add a character name to ID mapping.
   */
  addCharacterMapping(displayName: string, characterId: string): void {
    this.characterMappings.set(displayName.toUpperCase(), characterId);
  }

  /**
   * Parse a full episode script into scenes.
   */
  parseEpisodeScript(script: string): ParsedScene[] {
    const lines = script.split('\n');
    const scenes: ParsedScene[] = [];
    
    let currentScene: ParsedScene | null = null;
    const currentText: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(SCENE_HEADER_REGEX);
      
      if (headerMatch) {
        // Save previous scene if exists
        if (currentScene) {
          currentScene.text = currentText.join('\n');
          scenes.push(currentScene);
          currentText.length = 0;
        }
        
        // Start new scene
        currentScene = {
          sceneId: headerMatch[1],
          header: line,
          text: '',
          locationId: this.parseLocationId(headerMatch[2]),
          timeOfDay: headerMatch[3].trim().toLowerCase(),
        };
      } else if (currentScene) {
        currentText.push(line);
      }
    }
    
    // Don't forget the last scene
    if (currentScene) {
      currentScene.text = currentText.join('\n');
      scenes.push(currentScene);
    }
    
    return scenes;
  }

  /**
   * Extract audio segments from a scene.
   */
  extractAudioSegments(sceneId: string, sceneText: string): SceneAudio {
    const lines = sceneText.split('\n');
    const segments: AudioSegment[] = [];
    let segmentIndex = 0;
    let inNarratorBlock = false;
    let narratorBlockText: string[] = [];
    let narratorBlockHints: PerformanceHints = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) continue;

      // Check for narrator block start
      if (NARRATOR_BLOCK_START.test(line)) {
        inNarratorBlock = true;
        narratorBlockText = [];
        narratorBlockHints = {};
        continue;
      }

      // Check for narrator block end
      if (NARRATOR_BLOCK_END.test(line)) {
        if (narratorBlockText.length > 0) {
          segmentIndex++;
          const characterSlug = 'narrator';
          segments.push({
            segment_id: `${sceneId}_n${String(segmentIndex).padStart(3, '0')}_${characterSlug}`,
            type: 'narrator',
            character_id: 'NARRATOR',
            character_slug: characterSlug,
            raw_text: narratorBlockText.join(' '),
            clean_text: narratorBlockText.join(' '),
            performance: Object.keys(narratorBlockHints).length > 0 ? narratorBlockHints : undefined,
          });
        }
        inNarratorBlock = false;
        continue;
      }

      // Inside narrator block
      if (inNarratorBlock) {
        // Check for performance hints at start of block
        const hintsMatch = line.match(NARRATOR_BLOCK_HINTS);
        if (hintsMatch && narratorBlockText.length === 0) {
          narratorBlockHints = {
            tone: hintsMatch[1] as PerformanceHints['tone'],
            stability_override: hintsMatch[2] ? parseFloat(hintsMatch[2]) : undefined,
            style_override: hintsMatch[3] ? parseFloat(hintsMatch[3]) : undefined,
          };
          continue;
        }
        narratorBlockText.push(line);
        continue;
      }

      // Check for single-line narrator
      const narratorMatch = line.match(NARRATOR_SINGLE_REGEX);
      if (narratorMatch) {
        segmentIndex++;
        const characterSlug = 'narrator';
        segments.push({
          segment_id: `${sceneId}_n${String(segmentIndex).padStart(3, '0')}_${characterSlug}`,
          type: 'narrator',
          character_id: 'NARRATOR',
          character_slug: characterSlug,
          raw_text: line,
          clean_text: narratorMatch[4].trim(),
          performance: {
            tone: narratorMatch[1] as PerformanceHints['tone'],
            stability_override: narratorMatch[2] ? parseFloat(narratorMatch[2]) : undefined,
            style_override: narratorMatch[3] ? parseFloat(narratorMatch[3]) : undefined,
          },
        });
        continue;
      }

      // Check for dialogue
      const dialogueMatch = line.match(DIALOGUE_REGEX);
      if (dialogueMatch) {
        const characterName = dialogueMatch[1].trim();
        const characterId = this.resolveCharacterId(characterName);
        const characterSlug = this.extractCharacterSlug(characterId);
        
        segmentIndex++;
        segments.push({
          segment_id: `${sceneId}_d${String(segmentIndex).padStart(3, '0')}_${characterSlug}`,
          type: 'dialogue',
          character_id: characterId,
          character_slug: characterSlug,
          raw_text: line,
          clean_text: this.cleanDialogueText(dialogueMatch[5]),
          performance: {
            stage_direction: dialogueMatch[2],
            stability_override: dialogueMatch[3] ? parseFloat(dialogueMatch[3]) : undefined,
            style_override: dialogueMatch[4] ? parseFloat(dialogueMatch[4]) : undefined,
          },
        });
      }
    }

    return {
      scene_id: sceneId,
      audio_segments: segments,
    };
  }

  /**
   * Extract a short slug from a character ID.
   * e.g., "char_caelus_varo" -> "varo", "char_marcus_accountant" -> "marcus"
   */
  private extractCharacterSlug(characterId: string): string {
    if (characterId === 'NARRATOR') {
      return 'narrator';
    }
    
    // Remove char_ prefix if present
    const withoutPrefix = characterId.replace(/^char_/, '');
    
    // Split by underscore and take the last meaningful part
    // For "caelus_varo" -> "varo", for "marcus_accountant" -> "marcus"
    const parts = withoutPrefix.split('_');
    
    // If it's a two-part name like "caelus_varo", use the second part (family name)
    // If it's a descriptor like "marcus_accountant", use the first part (name)
    // Heuristic: descriptors tend to be longer common words
    const descriptors = ['accountant', 'vendor', 'guard', 'slave', 'merchant', 'soldier', 'senator'];
    
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      if (descriptors.includes(lastPart.toLowerCase())) {
        // It's a descriptor, use the name part
        return parts[0].toLowerCase();
      }
      // It's likely a family name, use it
      return lastPart.toLowerCase();
    }
    
    return parts[0].toLowerCase();
  }

  /**
   * Extract audio segments from all scenes in an episode.
   */
  extractAllAudioSegments(scenes: ParsedScene[]): SceneAudio[] {
    return scenes.map(scene => this.extractAudioSegments(scene.sceneId, scene.text));
  }

  /**
   * Find all unique speakers in the script.
   */
  findSpeakers(script: string): Set<string> {
    const speakers = new Set<string>();
    const lines = script.split('\n');

    for (const line of lines) {
      const dialogueMatch = line.trim().match(DIALOGUE_REGEX);
      if (dialogueMatch) {
        speakers.add(dialogueMatch[1].trim());
      }
    }

    // Add narrator if present
    if (script.includes('[NARRATOR]') || script.includes('---NARRATOR---')) {
      speakers.add('NARRATOR');
    }

    return speakers;
  }

  /**
   * Get speakers that don't have character ID mappings.
   */
  getUnmappedSpeakers(script: string): string[] {
    const speakers = this.findSpeakers(script);
    const unmapped: string[] = [];

    for (const speaker of speakers) {
      if (speaker === 'NARRATOR') continue;
      if (!this.characterMappings.has(speaker.toUpperCase())) {
        unmapped.push(speaker);
      }
    }

    return unmapped;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private parseLocationId(locationString: string): string {
    // Strip INT./EXT. prefix and normalize
    const normalized = locationString
      .replace(/^(?:INT|EXT)\.\s*/i, '')
      .trim()
      .toUpperCase();
    
    // Check explicit mapping first
    if (this.locationMappings.has(normalized)) {
      return this.locationMappings.get(normalized)!;
    }
    
    // Try partial matches (e.g., "FABIUS HOUSE - ATRIUM" should match "FABIUS HOUSE")
    for (const [displayName, locationId] of this.locationMappings) {
      if (normalized.includes(displayName) || displayName.includes(normalized)) {
        return locationId;
      }
    }
    
    // Fallback: convert to snake_case ID (may not match world.json)
    const fallbackId = locationString
      .replace(/^(?:INT|EXT)\.\s*/i, '')
      .toLowerCase()
      .replace(/['']/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    
    return fallbackId;
  }

  private resolveCharacterId(displayName: string): string {
    const normalized = displayName.toUpperCase();
    
    // Check explicit mapping
    if (this.characterMappings.has(normalized)) {
      return this.characterMappings.get(normalized)!;
    }
    
    // Try common patterns
    // "CAELUS VARO" -> "char_caelus_varo"
    // "QUINTUS FABIUS MAXIMUS" -> "char_quintus_fabius"
    const nameParts = normalized.toLowerCase().split(/\s+/);
    
    // Try first + second name
    if (nameParts.length >= 2) {
      const attempt = `char_${nameParts[0]}_${nameParts[1]}`;
      return attempt;
    }
    
    // Single name
    return `char_${nameParts[0]}`;
  }

  private cleanDialogueText(text: string): string {
    // Remove any remaining quotation marks
    let cleaned = text.replace(/^[""]|[""]$/g, '').trim();
    
    // Remove stage directions that might have been captured
    cleaned = cleaned.replace(/\s*\([^)]+\)\s*/g, ' ');
    
    // Remove stability/style overrides
    cleaned = cleaned.replace(/\[Stability:\s*[\d.]+\]/gi, '');
    cleaned = cleaned.replace(/\[Style:\s*[\d.]+\]/gi, '');
    
    return cleaned.trim();
  }
}

// ============================================================================
// Default Character Mappings
// ============================================================================

export const DEFAULT_CHARACTER_MAPPINGS: CharacterMapping[] = [
  { displayName: 'CAELUS VARO', characterId: 'char_caelus_varo' },
  { displayName: 'VARO', characterId: 'char_caelus_varo' },
  { displayName: 'QUINTUS FABIUS MAXIMUS', characterId: 'char_quintus_fabius' },
  { displayName: 'QUINTUS FABIUS', characterId: 'char_quintus_fabius' },
  { displayName: 'QUINTUS', characterId: 'char_quintus_fabius' },
  { displayName: 'DRUSILLA', characterId: 'char_drusilla' },
  { displayName: 'MARCUS LICINIUS', characterId: 'char_marcus_accountant' },
  { displayName: 'MARCUS', characterId: 'char_marcus_accountant' },
  { displayName: 'GAIUS CRASSIPES', characterId: 'char_gaius_crassipes' },
  { displayName: 'GAIUS', characterId: 'char_gaius_crassipes' },
  { displayName: 'CRASSIPES', characterId: 'char_gaius_crassipes' },
];

// ============================================================================
// Default Location Mappings
// ============================================================================

export interface LocationMapping {
  displayName: string;  // As it appears in script (e.g., "THE ROMAN FORUM")
  locationId: string;   // As it appears in world.json (e.g., "rome_forum")
}

export const DEFAULT_LOCATION_MAPPINGS: LocationMapping[] = [
  // Forum
  { displayName: 'THE ROMAN FORUM', locationId: 'rome_forum' },
  { displayName: 'ROMAN FORUM', locationId: 'rome_forum' },
  { displayName: 'FORUM', locationId: 'rome_forum' },
  
  // Varo's Study
  { displayName: "VARO'S STUDY", locationId: 'villa_varo_tablinum' },
  { displayName: 'VAROS STUDY', locationId: 'villa_varo_tablinum' },
  { displayName: "VARO'S TABLINUM", locationId: 'villa_varo_tablinum' },
  
  // Fabius House
  { displayName: 'FABIUS HOUSE', locationId: 'domus_fabius_atrium' },
  { displayName: 'FABIUS HOUSE - ATRIUM', locationId: 'domus_fabius_atrium' },
  { displayName: 'FABIUS ATRIUM', locationId: 'domus_fabius_atrium' },
  { displayName: 'DOMUS FABIUS', locationId: 'domus_fabius_atrium' },
  
  // Public Baths
  { displayName: 'PUBLIC BATHS', locationId: 'thermae_publicae' },
  { displayName: 'PUBLIC BATHS - PRIVATE ALCOVE', locationId: 'thermae_publicae' },
  { displayName: 'THERMAE', locationId: 'thermae_publicae' },
  { displayName: 'BATHS', locationId: 'thermae_publicae' },
  
  // Tavern
  { displayName: 'THE CROOKED CUP TAVERN', locationId: 'subura_tavern' },
  { displayName: 'CROOKED CUP TAVERN', locationId: 'subura_tavern' },
  { displayName: 'THE CROOKED CUP', locationId: 'subura_tavern' },
  { displayName: 'CROOKED CUP', locationId: 'subura_tavern' },
  { displayName: 'TAVERN', locationId: 'subura_tavern' },
  { displayName: 'SUBURA TAVERN', locationId: 'subura_tavern' },
];

// ============================================================================
// Factory Function
// ============================================================================

export function createScriptParser(
  characterMappings?: CharacterMapping[],
  locationMappings?: LocationMapping[]
): ScriptParser {
  return new ScriptParser(
    characterMappings || DEFAULT_CHARACTER_MAPPINGS,
    locationMappings || DEFAULT_LOCATION_MAPPINGS
  );
}
