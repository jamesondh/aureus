#!/usr/bin/env node
/**
 * CLI: Editorial Review
 * 
 * Runs the editorial review pass on an existing episode script.
 * This is Stage F.5 from the pipeline, running independently.
 * 
 * Usage:
 *   npx tsx src/cli/editorial-review.ts [options]
 *   npm run editorial-review -- [options]
 * 
 * Options:
 *   --season <id>      Season ID (default: season_01)
 *   --episode <id>     Episode ID (default: episode_01)
 *   --output <path>    Save review to file (default: prints to console)
 *   --verbose          Enable verbose logging
 *   --use-api          Force API mode (requires ANTHROPIC_API_KEY)
 *   --use-claude-max   Force Claude Max mode (requires Claude Code CLI)
 *   --help             Show this help message
 */

import { StateStore } from '../engine/state-store.js';
import { Verifier } from '../pipeline/verifier.js';
import { getLLMClient, resetLLMClient, type AuthMode } from '../llm/client.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CLIOptions {
  season: string;
  episode: string;
  outputPath?: string;
  verbose: boolean;
  help: boolean;
  authMode?: AuthMode;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    season: 'season_01',
    episode: 'episode_01',
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
      case '--output':
        options.outputPath = args[++i];
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
Aureus Editorial Review
========================

Runs the editorial review pass (Stage F.5) on an existing episode script.
Uses Claude Opus 4.5 for comprehensive quality analysis.

Usage:
  npx tsx src/cli/editorial-review.ts [options]
  npm run editorial-review -- [options]

Options:
  --season <id>      Season ID (default: season_01)
  --episode <id>     Episode ID (default: episode_01)
  --output <path>    Save review to JSON file (default: prints to console)
  --verbose          Enable verbose logging
  --use-api          Force API mode (requires ANTHROPIC_API_KEY)
  --use-claude-max   Force Claude Max mode (requires Claude Code CLI)
  --help, -h         Show this help message

Examples:
  # Review episode 1 of season 1
  npm run editorial-review

  # Review with verbose output
  npm run editorial-review -- --verbose

  # Save review to file
  npm run editorial-review -- --output ./review.json

  # Review episode 3
  npm run editorial-review -- --episode episode_03
`);
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
  console.log('       AUREUS EDITORIAL REVIEW         ');
  console.log('========================================\n');

  console.log('Configuration:');
  console.log(`  Season:     ${options.season}`);
  console.log(`  Episode:    ${options.episode}`);
  console.log(`  Verbose:    ${options.verbose}`);
  console.log('');

  // Initialize LLM client
  resetLLMClient();
  const llmClient = getLLMClient(options.authMode ? { mode: options.authMode } : undefined);
  const authMode = llmClient.getMode();
  console.log(`Authentication: ${authMode === 'api' ? 'Anthropic API' : 'Claude Max (via Claude Code)'}`);
  console.log('');

  // Load state store
  const store = new StateStore({ basePath: path.resolve('.') });
  await store.loadWorldState();

  // Create verifier
  const verifier = new Verifier(store, llmClient);

  // Load episode script
  const episodePath = path.resolve('./seasons', options.season, options.episode);
  const scriptPath = path.join(episodePath, 'episode_script.md');
  const planPath = path.join(episodePath, 'episode_plan.json');

  let script: string;
  let plan: { episode_id: string; beats: unknown[]; scenes: unknown[] };

  try {
    script = await fs.readFile(scriptPath, 'utf-8');
    console.log(`Loaded script: ${scriptPath}`);
    console.log(`Script length: ${script.length} characters\n`);
  } catch {
    console.error(`Error: Could not find episode script at ${scriptPath}`);
    process.exit(1);
  }

  try {
    const planContent = await fs.readFile(planPath, 'utf-8');
    plan = JSON.parse(planContent);
    console.log(`Loaded plan: ${planPath}`);
    console.log(`Beats: ${plan.beats.length}, Scenes: ${plan.scenes.length}\n`);
  } catch {
    console.error(`Error: Could not find episode plan at ${planPath}`);
    process.exit(1);
  }

  // Get character data
  const state = store.getWorldState();
  const characters: Record<string, unknown> = {};
  for (const char of state.characters.characters) {
    characters[char.id] = {
      name: char.name,
      archetype: char.archetype,
      voice: char.voice,
    };
  }

  // Also run repetition check
  console.log('Running repetition check...');
  
  // Extract scene headers from script
  const headerRegex = /## SC\d+ — ([^\n]+)/g;
  const sceneHeaders: string[] = [];
  let match;
  while ((match = headerRegex.exec(script)) !== null) {
    sceneHeaders.push(match[1]);
  }
  
  const repetitionViolations = verifier.checkRepetition(script, sceneHeaders);
  
  if (repetitionViolations.length > 0) {
    console.log(`\nRepetition Issues Found: ${repetitionViolations.length}`);
    console.log('─'.repeat(50));
    
    const failures = repetitionViolations.filter(v => v.verdict === 'FAIL');
    const warnings = repetitionViolations.filter(v => v.verdict === 'WARNING');
    
    if (failures.length > 0) {
      console.log(`\n🚫 FAILURES (${failures.length}):`);
      for (const v of failures) {
        console.log(`  [${v.rule}] ${v.pattern.slice(0, 50)}${v.pattern.length > 50 ? '...' : ''}`);
        console.log(`       Count: ${v.count} (max: ${v.threshold})`);
        if (v.character_id) console.log(`       Character: ${v.character_id}`);
        console.log(`       Fix: ${v.fix_instruction}`);
        console.log('');
      }
    }
    
    if (warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
      for (const v of warnings) {
        console.log(`  [${v.rule}] ${v.pattern.slice(0, 50)}${v.pattern.length > 50 ? '...' : ''}`);
        console.log(`       Count: ${v.count} (max: ${v.threshold})`);
        console.log('');
      }
    }
  } else {
    console.log('✓ No repetition issues found\n');
  }

  // Run editorial review
  console.log('\nRunning editorial review (this may take a minute)...\n');
  const startTime = Date.now();

  try {
    const review = await verifier.runEditorialReview(script, plan, characters);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('─'.repeat(50));
    console.log('EDITORIAL REVIEW RESULTS');
    console.log('─'.repeat(50));
    console.log(`\nTime: ${elapsed}s`);
    console.log(`\nOverall Grade: ${review.overall_grade}`);
    console.log(`Rationale: ${review.grade_rationale}`);
    console.log(`Recommendation: ${review.proceed_recommendation}`);

    if (review.issues.length > 0) {
      console.log(`\n📋 ISSUES (${review.issues.length}):`);
      console.log('─'.repeat(50));
      
      // Group by severity
      const major = review.issues.filter(i => i.severity === 'major');
      const minor = review.issues.filter(i => i.severity === 'minor');
      const nitpicks = review.issues.filter(i => i.severity === 'nitpick');

      if (major.length > 0) {
        console.log(`\n🔴 MAJOR (${major.length}):`);
        for (const issue of major) {
          console.log(`\n  [${issue.category.toUpperCase()}] ${issue.location}`);
          console.log(`  ${issue.description}`);
          console.log(`  → ${issue.suggestion}`);
          if (issue.rule_reference) console.log(`  (Rule: ${issue.rule_reference})`);
        }
      }

      if (minor.length > 0) {
        console.log(`\n🟡 MINOR (${minor.length}):`);
        for (const issue of minor) {
          console.log(`\n  [${issue.category.toUpperCase()}] ${issue.location}`);
          console.log(`  ${issue.description}`);
          console.log(`  → ${issue.suggestion}`);
        }
      }

      if (nitpicks.length > 0 && options.verbose) {
        console.log(`\n⚪ NITPICKS (${nitpicks.length}):`);
        for (const issue of nitpicks) {
          console.log(`  [${issue.category}] ${issue.location}: ${issue.description}`);
        }
      } else if (nitpicks.length > 0) {
        console.log(`\n(${nitpicks.length} nitpicks omitted - use --verbose to see)`);
      }
    }

    if (review.strengths.length > 0) {
      console.log(`\n✨ STRENGTHS:`);
      console.log('─'.repeat(50));
      for (const strength of review.strengths) {
        console.log(`  ${strength.location}: ${strength.description}`);
      }
    }

    if (review.revision_priority.length > 0) {
      console.log(`\n🎯 REVISION PRIORITY:`);
      console.log(`  ${review.revision_priority.join(' → ')}`);
    }

    // Save to file if requested
    if (options.outputPath) {
      const fullReview = {
        episode_id: options.episode,
        timestamp: new Date().toISOString(),
        repetition_violations: repetitionViolations,
        editorial_review: review,
      };
      await fs.writeFile(options.outputPath, JSON.stringify(fullReview, null, 2));
      console.log(`\nReview saved to: ${options.outputPath}`);
    }

    // Also save to episode directory
    const reviewPath = path.join(episodePath, 'editorial_review.json');
    const fullReview = {
      episode_id: options.episode,
      timestamp: new Date().toISOString(),
      repetition_violations: repetitionViolations,
      editorial_review: review,
    };
    await fs.writeFile(reviewPath, JSON.stringify(fullReview, null, 2));
    console.log(`\nReview saved to: ${reviewPath}`);

    console.log('\n========================================');
    console.log('        EDITORIAL REVIEW COMPLETE      ');
    console.log('========================================\n');

  } catch (error) {
    console.error('\nError running editorial review:');
    console.error(error instanceof Error ? error.message : error);
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
