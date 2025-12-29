#!/usr/bin/env node
/**
 * CLI: Regenerate Audio
 * 
 * Regenerates audio files for characters whose voice configuration has changed
 * in casting.json. Detects changes automatically by comparing current config
 * against a cached hash of what was used to generate existing audio.
 * 
 * Usage:
 *   npm run regenerate:audio                         # Auto-detect and regenerate changed voices
 *   npm run regenerate:audio -- --character char_id  # Regenerate specific character
 *   npm run regenerate:audio -- --list               # List all characters and their change status
 *   npm run regenerate:audio -- --dry-run            # Preview what would be regenerated
 *   npm run regenerate:audio -- --bump-version       # Auto-increment voice_version in casting.json
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { CastingRegistry, VoiceMapping, AudioTimingManifest } from '../types/production.js';

// ============================================================================
// Types
// ============================================================================

interface VoiceConfigHash {
  character_id: string;
  hash: string;
  eleven_voice_id: string;
  voice_name: string;
  voice_version: number;
  generated_at: string;
}

interface VoiceHashCache {
  version: '1.0';
  hashes: VoiceConfigHash[];
  last_updated: string;
}

interface ChangeDetectionResult {
  character_id: string;
  voice_name: string;
  status: 'unchanged' | 'changed' | 'new' | 'removed';
  old_voice_id?: string;
  new_voice_id?: string;
  old_voice_name?: string;
  new_voice_name?: string;
  segments_affected: number;
}

interface CliArgs {
  episode: string;
  season: string;
  character?: string;
  list: boolean;
  dryRun: boolean;
  bumpVersion: boolean;
  force: boolean;
  help: boolean;
}

// ============================================================================
// Voice Config Hashing
// ============================================================================

/**
 * Compute a hash of the voice-relevant fields in a VoiceMapping.
 * Changes to any of these fields should trigger audio regeneration (API call).
 * 
 * Note: audio_processing (gain, limiter) is intentionally EXCLUDED because
 * those settings are applied during master audio concatenation, not during
 * synthesis. Changing gain doesn't require re-calling the ElevenLabs API.
 */
function computeVoiceHash(mapping: VoiceMapping): string {
  const hashable = {
    eleven_voice_id: mapping.eleven_voice_id,
    voice_name: mapping.voice_name,
    voice_version: mapping.voice_version,
    default_settings: mapping.default_settings,
    tone_overrides: mapping.tone_overrides,
    // audio_processing excluded - applied at concatenation, not synthesis
  };
  
  const json = JSON.stringify(hashable, Object.keys(hashable).sort());
  return crypto.createHash('sha256').update(json).digest('hex').substring(0, 16);
}

/**
 * Build hash cache from current casting registry.
 */
function buildHashCache(casting: CastingRegistry): VoiceHashCache {
  const hashes: VoiceConfigHash[] = casting.casting.voice_mappings.map(mapping => ({
    character_id: mapping.character_id,
    hash: computeVoiceHash(mapping),
    eleven_voice_id: mapping.eleven_voice_id,
    voice_name: mapping.voice_name,
    voice_version: mapping.voice_version ?? 1,
    generated_at: new Date().toISOString(),
  }));
  
  return {
    version: '1.0',
    hashes,
    last_updated: new Date().toISOString(),
  };
}

// ============================================================================
// Change Detection
// ============================================================================

async function detectChanges(
  casting: CastingRegistry,
  cachedHashes: VoiceHashCache | null,
  audioManifests: AudioTimingManifest[]
): Promise<ChangeDetectionResult[]> {
  const results: ChangeDetectionResult[] = [];
  
  // Count segments per character across all manifests
  const segmentCounts = new Map<string, number>();
  for (const manifest of audioManifests) {
    for (const segment of manifest.audio_segments) {
      const count = segmentCounts.get(segment.character_id) || 0;
      segmentCounts.set(segment.character_id, count + 1);
    }
  }
  
  // Check each current voice mapping
  for (const mapping of casting.casting.voice_mappings) {
    const currentHash = computeVoiceHash(mapping);
    const cached = cachedHashes?.hashes.find(h => h.character_id === mapping.character_id);
    const segmentsAffected = segmentCounts.get(mapping.character_id) || 0;
    
    if (!cached) {
      // New character or no cache exists
      results.push({
        character_id: mapping.character_id,
        voice_name: mapping.voice_name,
        status: segmentsAffected > 0 ? 'new' : 'unchanged',
        new_voice_id: mapping.eleven_voice_id,
        new_voice_name: mapping.voice_name,
        segments_affected: segmentsAffected,
      });
    } else if (cached.hash !== currentHash) {
      // Voice config has changed
      results.push({
        character_id: mapping.character_id,
        voice_name: mapping.voice_name,
        status: 'changed',
        old_voice_id: cached.eleven_voice_id,
        new_voice_id: mapping.eleven_voice_id,
        old_voice_name: cached.voice_name,
        new_voice_name: mapping.voice_name,
        segments_affected: segmentsAffected,
      });
    } else {
      // No change
      results.push({
        character_id: mapping.character_id,
        voice_name: mapping.voice_name,
        status: 'unchanged',
        segments_affected: segmentsAffected,
      });
    }
  }
  
  // Check for removed characters (in cache but not in current casting)
  if (cachedHashes) {
    for (const cached of cachedHashes.hashes) {
      const stillExists = casting.casting.voice_mappings.some(
        m => m.character_id === cached.character_id
      );
      if (!stillExists) {
        results.push({
          character_id: cached.character_id,
          voice_name: cached.voice_name,
          status: 'removed',
          old_voice_id: cached.eleven_voice_id,
          old_voice_name: cached.voice_name,
          segments_affected: segmentCounts.get(cached.character_id) || 0,
        });
      }
    }
  }
  
  return results;
}

// ============================================================================
// Version Bumping
// ============================================================================

async function bumpVoiceVersion(
  characterId: string,
  castingPath: string,
  casting: CastingRegistry
): Promise<boolean> {
  const mapping = casting.casting.voice_mappings.find(
    m => m.character_id === characterId
  );
  
  if (!mapping) {
    console.error(`  Cannot bump version: character ${characterId} not found`);
    return false;
  }
  
  const oldVersion = mapping.voice_version ?? 1;
  mapping.voice_version = oldVersion + 1;
  
  // Update last_updated
  casting.casting.last_updated = new Date().toISOString();
  
  // Write back to file
  await fs.writeFile(castingPath, JSON.stringify(casting, null, 2));
  
  console.log(`  Bumped ${characterId} voice_version: ${oldVersion} -> ${mapping.voice_version}`);
  return true;
}

// ============================================================================
// File I/O
// ============================================================================

async function loadCasting(basePath: string): Promise<CastingRegistry> {
  const castingPath = path.join(basePath, 'casting', 'casting.json');
  const content = await fs.readFile(castingPath, 'utf-8');
  return JSON.parse(content);
}

async function loadVoiceHashCache(episodeDir: string): Promise<VoiceHashCache | null> {
  const cachePath = path.join(episodeDir, '.audio_progress', 'voice_hashes.json');
  try {
    const content = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function saveVoiceHashCache(episodeDir: string, cache: VoiceHashCache): Promise<void> {
  const progressDir = path.join(episodeDir, '.audio_progress');
  await fs.mkdir(progressDir, { recursive: true });
  
  const cachePath = path.join(progressDir, 'voice_hashes.json');
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2));
}

async function loadAudioManifests(episodeDir: string): Promise<AudioTimingManifest[]> {
  const progressPath = path.join(episodeDir, '.audio_progress', 'manifests.json');
  try {
    const content = await fs.readFile(progressPath, 'utf-8');
    const data = JSON.parse(content) as { manifests: AudioTimingManifest[] };
    return data.manifests || [];
  } catch {
    return [];
  }
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    episode: '01',
    season: '01',
    list: false,
    dryRun: false,
    bumpVersion: false,
    force: false,
    help: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--episode' || arg === '-e') {
      result.episode = args[++i] || '01';
    } else if (arg === '--season' || arg === '-s') {
      result.season = args[++i] || '01';
    } else if (arg === '--character' || arg === '-c') {
      result.character = args[++i];
    } else if (arg === '--list' || arg === '-l') {
      result.list = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--bump-version' || arg === '-b') {
      result.bumpVersion = true;
    } else if (arg === '--force' || arg === '-f') {
      result.force = true;
    }
  }
  
  return result;
}

function showHelp(): void {
  console.log(`
Aureus Audio Regeneration Tool

Detects changes to voice configurations in casting.json and helps regenerate
affected audio files. Useful when changing a character's voice actor or settings.

Usage:
  npm run regenerate:audio [options]

Options:
  -e, --episode <num>     Episode number (default: 01)
  -s, --season <num>      Season number (default: 01)
  -c, --character <id>    Regenerate specific character only
  -l, --list              List all characters and their change status
  --dry-run               Preview what would be regenerated without making changes
  -b, --bump-version      Auto-increment voice_version in casting.json for changed voices
  -f, --force             Force regeneration even if no changes detected
  -h, --help              Show this help message

Workflow:
  1. Edit casting.json to change eleven_voice_id, voice_name, or settings
  2. Run: npm run regenerate:audio -- --list
     This shows which characters have changed configurations
  3. Run: npm run regenerate:audio -- --bump-version
     This bumps voice_version for changed characters
  4. Run: npm run produce:episode -- --stage audio --force
     This regenerates all audio with the new voices

Examples:
  npm run regenerate:audio -- --list
  npm run regenerate:audio -- --character char_caelus_varo --bump-version
  npm run regenerate:audio -- --bump-version --dry-run
`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();
  
  if (args.help) {
    showHelp();
    process.exit(0);
  }
  
  const basePath = path.resolve(process.cwd());
  const seasonId = `season_${args.season.padStart(2, '0')}`;
  const episodeId = `episode_${args.episode.padStart(2, '0')}`;
  const episodeDir = path.join(basePath, 'seasons', seasonId, episodeId);
  const castingPath = path.join(basePath, 'casting', 'casting.json');
  
  console.log(`\nAureus Audio Regeneration Tool`);
  console.log(`==============================`);
  console.log(`Season: ${seasonId}`);
  console.log(`Episode: ${episodeId}`);
  if (args.dryRun) console.log(`Mode: dry-run`);
  if (args.character) console.log(`Character filter: ${args.character}`);
  
  try {
    // Load data
    const casting = await loadCasting(basePath);
    const cachedHashes = await loadVoiceHashCache(episodeDir);
    const audioManifests = await loadAudioManifests(episodeDir);
    
    console.log(`\nLoaded ${casting.casting.voice_mappings.length} voice mappings`);
    console.log(`Cached hashes: ${cachedHashes ? cachedHashes.hashes.length : 'none'}`);
    console.log(`Audio manifests: ${audioManifests.length} scenes\n`);
    
    // Detect changes
    let changes = await detectChanges(casting, cachedHashes, audioManifests);
    
    // Filter by character if specified
    if (args.character) {
      changes = changes.filter(c => c.character_id === args.character);
      if (changes.length === 0) {
        console.log(`Character ${args.character} not found or has no audio segments.`);
        process.exit(1);
      }
    }
    
    // List mode
    if (args.list) {
      console.log('Voice Configuration Status:');
      console.log('─'.repeat(80));
      console.log(
        'Character ID'.padEnd(30) +
        'Voice Name'.padEnd(15) +
        'Status'.padEnd(12) +
        'Segments'
      );
      console.log('─'.repeat(80));
      
      for (const change of changes) {
        const statusIcon = {
          unchanged: ' ',
          changed: '*',
          new: '+',
          removed: '-',
        }[change.status];
        
        console.log(
          `${statusIcon} ${change.character_id}`.padEnd(30) +
          change.voice_name.padEnd(15) +
          change.status.padEnd(12) +
          change.segments_affected.toString()
        );
        
        if (change.status === 'changed') {
          console.log(
            '  '.padEnd(30) +
            `  Voice: ${change.old_voice_name} -> ${change.new_voice_name}`
          );
          if (change.old_voice_id !== change.new_voice_id) {
            console.log(
              '  '.padEnd(30) +
              `  ID: ${change.old_voice_id?.substring(0, 12)}... -> ${change.new_voice_id?.substring(0, 12)}...`
            );
          }
        }
      }
      
      console.log('─'.repeat(80));
      const changedCount = changes.filter(c => c.status === 'changed').length;
      const newCount = changes.filter(c => c.status === 'new').length;
      console.log(`\nSummary: ${changedCount} changed, ${newCount} new`);
      
      if (changedCount > 0) {
        console.log(`\nTo regenerate audio for changed voices:`);
        console.log(`  1. Run: npm run regenerate:audio -- --bump-version`);
        console.log(`  2. Run: npm run produce:episode -- --stage audio --force`);
      }
      
      process.exit(0);
    }
    
    // Get changed characters
    const changedCharacters = changes.filter(
      c => c.status === 'changed' || (args.force && c.segments_affected > 0)
    );
    
    if (changedCharacters.length === 0 && !args.force) {
      console.log('No voice configuration changes detected.');
      console.log('Use --list to see all characters, or --force to regenerate anyway.');
      process.exit(0);
    }
    
    console.log(`Found ${changedCharacters.length} character(s) with changes:`);
    for (const c of changedCharacters) {
      console.log(`  - ${c.character_id} (${c.segments_affected} segments)`);
    }
    
    // Bump versions if requested
    if (args.bumpVersion) {
      console.log('\nBumping voice versions...');
      for (const c of changedCharacters) {
        if (args.dryRun) {
          const mapping = casting.casting.voice_mappings.find(m => m.character_id === c.character_id);
          const currentVersion = mapping?.voice_version ?? 1;
          console.log(`  Would bump ${c.character_id}: ${currentVersion} -> ${currentVersion + 1}`);
        } else {
          // Reload casting for each bump to avoid conflicts
          const freshCasting = await loadCasting(basePath);
          await bumpVoiceVersion(c.character_id, castingPath, freshCasting);
        }
      }
    }
    
    // Update voice hash cache
    if (!args.dryRun) {
      console.log('\nUpdating voice hash cache...');
      const freshCasting = await loadCasting(basePath);
      const newCache = buildHashCache(freshCasting);
      await saveVoiceHashCache(episodeDir, newCache);
      console.log('  Saved voice_hashes.json');
    }
    
    // Summary and next steps
    console.log('\n--- Summary ---');
    if (args.dryRun) {
      console.log('Dry run complete. No changes were made.');
    } else {
      console.log('Voice versions and hash cache updated.');
    }
    
    const totalSegments = changedCharacters.reduce((sum, c) => sum + c.segments_affected, 0);
    if (totalSegments > 0) {
      console.log(`\nNext step: Regenerate ${totalSegments} audio segments by running:`);
      console.log(`  npm run produce:episode -- --stage audio --force`);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
