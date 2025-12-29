#!/usr/bin/env node
/**
 * CLI: Produce Episode
 * 
 * Runs the production pipeline (Stage I) to generate audio, images, and video
 * from an episode script.
 * 
 * Usage:
 *   npm run produce:episode                    # Full pipeline on episode_01
 *   npm run produce:episode -- --episode 02   # Specific episode
 *   npm run produce:episode -- --dry-run      # Generate manifests only
 *   npm run produce:episode -- --stage audio  # Audio only
 *   npm run produce:episode -- --stage image  # Images only
 *   npm run produce:episode -- --stage storyboard  # Storyboard only
 */

import * as path from 'path';
import { ProductionOrchestrator } from '../production/production-orchestrator.js';

// ============================================================================
// Parse Arguments
// ============================================================================

interface CliArgs {
  episode: string;
  season: string;
  stage?: 'all' | 'storyboard' | 'audio' | 'image' | 'video';
  dryRun: boolean;
  force: boolean;
  preview: boolean;
  cadence?: number;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    episode: '01',
    season: '01',
    stage: 'all',
    dryRun: false,
    force: false,
    preview: false,
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
    } else if (arg === '--stage') {
      result.stage = args[++i] as CliArgs['stage'] || 'all';
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--force' || arg === '-f') {
      result.force = true;
    } else if (arg === '--preview' || arg === '-p') {
      result.preview = true;
    } else if (arg === '--cadence') {
      result.cadence = parseFloat(args[++i]) || undefined;
    }
  }
  
  return result;
}

function showHelp(): void {
  console.log(`
Aureus Production Pipeline

Usage:
  npm run produce:episode [options]

Options:
  -e, --episode <num>   Episode number (default: 01)
  -s, --season <num>    Season number (default: 01)
  --stage <stage>       Run specific stage only:
                        - storyboard: Visual beat identification
                        - audio: Voice synthesis via ElevenLabs
                        - image: Image generation via DALL-E 3
                        - video: Video assembly (requires FFmpeg)
                        - all: Run complete pipeline (default)
  --dry-run             Generate manifests without calling APIs
  -f, --force           Regenerate all files (ignore existing progress)
  -p, --preview         Preview mode: generate video only for scenes with
                        complete assets (all audio + all real images).
                        Use this to test casting, image quality, and video
                        assembly before committing to expensive full generation.
  --cadence <value>     Override visual cadence (0.1-1.0)
  -h, --help            Show this help message

Environment Variables:
  ELEVENLABS_API_KEY    Required for audio synthesis
  OPENAI_API_KEY        Required for image generation

Examples:
  npm run produce:episode
  npm run produce:episode -- --episode 02 --dry-run
  npm run produce:episode -- --stage audio
  npm run produce:episode -- --stage storyboard --cadence 0.6
  npm run produce:episode -- --preview   # Generate preview from complete scenes
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
  
  console.log(`\nAureus Production Pipeline`);
  console.log(`==========================`);
  console.log(`Season: ${seasonId}`);
  console.log(`Episode: ${episodeId}`);
  if (args.preview) {
    console.log(`Mode: preview`);
  } else {
    console.log(`Stage: ${args.stage}`);
    console.log(`Dry run: ${args.dryRun}`);
  }
  if (args.force) {
    console.log(`Force: true (ignoring existing progress)`);
  }
  
  // Check environment
  if (!args.dryRun && !args.preview) {
    if (args.stage === 'all' || args.stage === 'audio') {
      if (!process.env.ELEVENLABS_API_KEY) {
        console.warn('\nWarning: ELEVENLABS_API_KEY not set. Audio synthesis will fail.');
      }
    }
    if (args.stage === 'all' || args.stage === 'image') {
      if (!process.env.OPENAI_API_KEY) {
        console.warn('\nWarning: OPENAI_API_KEY not set. Image generation will fail.');
      }
    }
  }
  
  // Configure orchestrator based on stage
  const orchestrator = new ProductionOrchestrator({
    basePath,
    seasonId,
    episodeId,
    runStoryboard: args.stage === 'all' || args.stage === 'storyboard',
    runAudioSynth: args.stage === 'all' || args.stage === 'audio',
    runImageGen: args.stage === 'all' || args.stage === 'image',
    runVideoAssembly: args.stage === 'all' || args.stage === 'video',
    dryRun: args.dryRun,
    force: args.force,
    visualCadenceOverride: args.cadence,
  });
  
  // Run appropriate stage(s)
  let result;
  
  if (args.preview) {
    console.log('\nRunning preview mode...');
    const previewResult = await orchestrator.runPreview();
    console.log(`\nComplete scenes: ${previewResult.complete_scenes.length}`);
    console.log(`Incomplete scenes: ${previewResult.incomplete_scenes.length}`);
    if (previewResult.preview_file) {
      console.log(`Preview video: ${previewResult.preview_file}`);
    }
    result = previewResult;
  } else if (args.stage === 'storyboard') {
    console.log('\nRunning storyboard stage only...');
    const storyboard = await orchestrator.runStoryboardOnly();
    if (storyboard) {
      console.log(`\nGenerated ${storyboard.total_shots} shots`);
      result = { success: true };
    } else {
      result = { success: false, errors: ['Storyboard generation failed'] };
    }
  } else if (args.stage === 'audio') {
    console.log('\nRunning audio synthesis only...');
    const audioResult = await orchestrator.runAudioOnly() as { files: string[]; errors: string[]; skipped?: number };
    console.log(`\nAudio files: ${audioResult.files.length}`);
    if (audioResult.skipped && audioResult.skipped > 0) {
      console.log(`Skipped (existing): ${audioResult.skipped}`);
    }
    if (audioResult.errors.length > 0) {
      console.log(`Errors: ${audioResult.errors.length}`);
    }
    result = { success: audioResult.errors.length === 0 };
  } else if (args.stage === 'image') {
    console.log('\nRunning image generation only...');
    const imageResult = await orchestrator.runImageOnly() as { files: string[]; errors: string[]; skipped?: number };
    console.log(`\nImage files: ${imageResult.files.length}`);
    if (imageResult.skipped && imageResult.skipped > 0) {
      console.log(`Skipped (existing): ${imageResult.skipped}`);
    }
    if (imageResult.errors.length > 0) {
      console.log(`Errors: ${imageResult.errors.length}`);
    }
    result = { success: imageResult.errors.length === 0 };
  } else {
    result = await orchestrator.run();
  }
  
  // Summary
  console.log('\n--- Summary ---');
  if (result.success) {
    console.log('Production completed successfully!');
  } else {
    console.log('Production completed with errors.');
    if ('errors' in result && result.errors) {
      for (const err of result.errors) {
        console.log(`  - ${err}`);
      }
    }
    // Show blocking review items if present
    if ('review_queue' in result && result.review_queue) {
      const blocking = result.review_queue.filter((item: { blocking?: boolean }) => item.blocking);
      if (blocking.length > 0) {
        console.log(`\nBlocking issues (${blocking.length}):`);
        for (const item of blocking) {
          const details = 'character_id' in item ? ` [${item.character_id}]` : 
                         'shot_id' in item ? ` [${item.shot_id}]` : '';
          console.log(`  - ${item.type}${details}: ${item.reason}`);
        }
      }
    }
  }
  
  process.exit(result.success ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
