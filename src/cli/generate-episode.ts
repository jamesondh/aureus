#!/usr/bin/env node
/**
 * CLI: Generate Episode
 * 
 * Runs the Aureus pipeline to generate a single episode.
 * 
 * Usage:
 *   npx tsx src/cli/generate-episode.ts [options]
 *   npm run generate:episode -- [options]
 * 
 * Options:
 *   --season <id>      Season ID (default: season_01)
 *   --episode <id>     Episode ID (default: episode_01)
 *   --world <path>     Path to world data directory (default: ./world)
 *   --output <path>    Path to output directory (default: ./seasons)
 *   --dry-run          Plan only, don't write scenes
 *   --verbose          Enable verbose logging
 *   --use-api          Force API mode (requires ANTHROPIC_API_KEY)
 *   --use-claude-max   Force Claude Max mode (requires Claude Code CLI)
 *   --help             Show this help message
 * 
 * Authentication:
 *   The CLI supports two authentication modes:
 *   
 *   1. API Key (default if ANTHROPIC_API_KEY is set):
 *      export ANTHROPIC_API_KEY=your-key-here
 *   
 *   2. Claude Max subscription (via Claude Code CLI):
 *      - Install: curl -fsSL https://claude.ai/install.sh | bash
 *      - Login: claude (select "Claude App" and log in with your Claude Max account)
 *      - Run with: --use-claude-max flag or set USE_CLAUDE_MAX=1
 */

import { PipelineOrchestrator, type PipelineConfig } from '../pipeline/orchestrator.js';
import { getLLMClient, resetLLMClient, type AuthMode } from '../llm/client.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CLIOptions {
  season: string;
  episode: string;
  worldPath: string;
  outputPath: string;
  dryRun: boolean;
  verbose: boolean;
  help: boolean;
  authMode?: AuthMode;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    season: 'season_01',
    episode: 'episode_01',
    worldPath: './world',
    outputPath: './seasons',
    dryRun: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--season':
        options.season = args[++i] || options.season;
        break;
      case '--episode':
        options.episode = args[++i] || options.episode;
        break;
      case '--world':
        options.worldPath = args[++i] || options.worldPath;
        break;
      case '--output':
        options.outputPath = args[++i] || options.outputPath;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--use-api':
        options.authMode = 'api';
        break;
      case '--use-claude-max':
      case '--use-agent-sdk':
        options.authMode = 'agent-sdk';
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Aureus Episode Generator
========================

Generates a single episode using the Aureus narrative pipeline.

Usage:
  npx tsx src/cli/generate-episode.ts [options]
  npm run generate:episode -- [options]

Options:
  --season <id>      Season ID (default: season_01)
  --episode <id>     Episode ID (default: episode_01)
  --world <path>     Path to world data directory (default: ./world)
  --output <path>    Path to output directory (default: ./seasons)
  --dry-run          Plan episode only, don't generate scene prose
  --verbose          Enable verbose logging
  --use-api          Force API mode (requires ANTHROPIC_API_KEY)
  --use-claude-max   Force Claude Max mode (requires Claude Code CLI)
  --help, -h         Show this help message

Authentication:
  The CLI supports two authentication modes:

  1. API Key Mode (requires ANTHROPIC_API_KEY):
     export ANTHROPIC_API_KEY=your-key-here
     npm run generate:episode

  2. Claude Max Mode (uses your Claude Max subscription):
     a. Install Claude Code CLI:
        curl -fsSL https://claude.ai/install.sh | bash
     
     b. Authenticate with your Claude Max account:
        claude
        (Select "Claude App" during login, then sign in with your Claude Max account)
     
     c. Run the generator:
        npm run generate:episode -- --use-claude-max
        
        Or set the environment variable:
        export USE_CLAUDE_MAX=1
        npm run generate:episode

  Auto-detection:
    If ANTHROPIC_API_KEY is set, API mode is used.
    Otherwise, Claude Max mode is attempted automatically.

Examples:
  # Generate episode 1 of season 1 (auto-detect auth)
  npm run generate:episode

  # Generate using Claude Max subscription
  npm run generate:episode -- --use-claude-max

  # Generate episode 3 of season 1 with API key
  npm run generate:episode -- --episode episode_03 --use-api

  # Dry run (planning only)
  npm run generate:episode -- --dry-run --verbose

  # Custom paths
  npm run generate:episode -- --world ./my-world --output ./my-output
`);
}

// ============================================================================
// Validation
// ============================================================================

async function validateEnvironment(options: CLIOptions): Promise<void> {
  // Check authentication based on mode
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  if (options.authMode === 'api' && !hasApiKey) {
    throw new Error(
      'API mode requires ANTHROPIC_API_KEY environment variable.\n' +
      'Set it with: export ANTHROPIC_API_KEY=your-key-here\n\n' +
      'Or use --use-claude-max to authenticate with your Claude Max subscription.'
    );
  }

  if (!options.authMode && !hasApiKey) {
    // Will use agent-sdk mode, just print info
    console.log('No ANTHROPIC_API_KEY found. Using Claude Max mode via Claude Code CLI.\n');
  }

  // Check world directory exists
  const worldPath = path.resolve(options.worldPath);
  try {
    await fs.access(worldPath);
  } catch {
    throw new Error(`World directory not found: ${worldPath}`);
  }

  // Check required world files
  const requiredFiles = [
    'world.json',
    'characters.json',
    'relationships.json',
    'secrets.json',
    'threads.json',
    'constraints.json',
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(worldPath, file);
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`Required world file not found: ${filePath}`);
    }
  }

  // Check operators
  const operatorsPath = path.resolve('./operators/operators.json');
  try {
    await fs.access(operatorsPath);
  } catch {
    throw new Error(`Operators file not found: ${operatorsPath}`);
  }

  // Check season goals
  const seasonGoalsPath = path.resolve(
    options.outputPath,
    options.season,
    'season_goals.json'
  );
  try {
    await fs.access(seasonGoalsPath);
  } catch {
    // Season goals might be in a different location, try alternate
    const altPath = path.resolve('./seasons', options.season, 'season_goals.json');
    try {
      await fs.access(altPath);
    } catch {
      console.warn(`Warning: Season goals not found at ${seasonGoalsPath} or ${altPath}`);
      console.warn('Creating default season goals...');
      await createDefaultSeasonGoals(options);
    }
  }
}

async function createDefaultSeasonGoals(options: CLIOptions): Promise<void> {
  const seasonDir = path.resolve(options.outputPath, options.season);
  await fs.mkdir(seasonDir, { recursive: true });

  const defaultGoals = {
    season_id: options.season,
    theme: "Power, betrayal, and survival in ancient Rome",
    arc_description: "A shipping magnate's empire is threatened by rivals, secrets, and family ambition",
    target_episodes: 10,
    major_milestones: [
      {
        episode_target: 3,
        milestone: "Major secret begins to surface",
        required_threads: []
      },
      {
        episode_target: 6,
        milestone: "Alliance shifts create new power dynamics",
        required_threads: []
      },
      {
        episode_target: 10,
        milestone: "Season climax - major confrontation and resolution",
        required_threads: []
      }
    ],
    character_arcs: {},
    forbidden_resolutions: [],
    required_payoffs: []
  };

  await fs.writeFile(
    path.join(seasonDir, 'season_goals.json'),
    JSON.stringify(defaultGoals, null, 2)
  );
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  console.log('\n========================================');
  console.log('       AUREUS EPISODE GENERATOR        ');
  console.log('========================================\n');

  console.log('Configuration:');
  console.log(`  Season:     ${options.season}`);
  console.log(`  Episode:    ${options.episode}`);
  console.log(`  World:      ${options.worldPath}`);
  console.log(`  Output:     ${options.outputPath}`);
  console.log(`  Dry Run:    ${options.dryRun}`);
  console.log(`  Verbose:    ${options.verbose}`);
  console.log('');

  // Validate environment
  try {
    await validateEnvironment(options);
    console.log('Environment validated.\n');
  } catch (error) {
    console.error('Validation Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Initialize LLM client with explicit mode if specified
  resetLLMClient();
  const llmClient = getLLMClient(options.authMode ? { mode: options.authMode } : undefined);
  const authMode = llmClient.getMode();

  console.log(`Authentication: ${authMode === 'api' ? 'Anthropic API' : 'Claude Max (via Claude Code)'}`);
  console.log('');

  // Configure pipeline
  const config: PipelineConfig = {
    basePath: path.resolve('.'),
    seasonId: options.season,
    episodeId: options.episode,
    maxSceneRetries: 3,
    maxEpisodeRegenerations: 10,
    checkpointOnFailure: true,
  };

  if (options.verbose) {
    console.log('Pipeline Config:', JSON.stringify(config, null, 2), '\n');
  }

  // Create output directory
  const episodeDir = path.resolve(options.outputPath, options.season, options.episode);
  await fs.mkdir(episodeDir, { recursive: true });

  // Run pipeline
  const startTime = Date.now();
  const orchestrator = new PipelineOrchestrator(config);

  try {
    const result = await orchestrator.run();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success) {
      console.log('\n========================================');
      console.log('         GENERATION COMPLETE           ');
      console.log('========================================\n');

      console.log(`Time Elapsed: ${elapsed}s`);
      console.log(`Scenes Generated: ${result.sceneOutputs?.length || 0}`);

      if (result.episodeMetrics) {
        console.log('\nMetrics:');
        console.log(`  Tension:     ${result.episodeMetrics.tension.toFixed(1)}/10`);
        console.log(`  Pacing:      ${result.episodeMetrics.pacing.toFixed(1)}/10`);
        console.log(`  Volatility:  ${result.episodeMetrics.volatility.toFixed(1)}/10`);
        console.log(`  Beats:       ${JSON.stringify(result.episodeMetrics.beat_counts)}`);
      }

      console.log(`\nArtifacts saved to: ${episodeDir}`);
      console.log('\nGenerated files:');
      console.log('  - episode_plan.json');
      console.log('  - episode_script.md');
      console.log('  - episode_deltas.json');
      console.log('  - episode_metrics.json');
      console.log('  - cliffhanger_constraints.json');
      console.log('  - verifier_report.json');

    } else {
      console.error('\n========================================');
      console.error('         GENERATION FAILED             ');
      console.error('========================================\n');

      console.error(`Time Elapsed: ${elapsed}s`);
      console.error('Errors:', result.errors?.join('\n  '));

      if (result.checkpointPath) {
        console.error(`\nCheckpoint saved: ${result.checkpointPath}`);
      }

      process.exit(1);
    }
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.error('\n========================================');
    console.error('         UNEXPECTED ERROR              ');
    console.error('========================================\n');

    console.error(`Time Elapsed: ${elapsed}s`);
    console.error('Error:', error instanceof Error ? error.message : error);

    if (options.verbose && error instanceof Error) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
