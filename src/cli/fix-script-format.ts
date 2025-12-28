#!/usr/bin/env node
/**
 * CLI: Fix Episode Script Format
 * 
 * Fixes episode_script.md files that were incorrectly saved as JSON-escaped strings.
 * This can happen when the script is passed through JSON.stringify() instead of
 * being written as raw markdown.
 * 
 * Usage:
 *   npx tsx src/cli/fix-script-format.ts [path]
 *   npm run fix:script -- [path]
 * 
 * Arguments:
 *   path    Path to episode_script.md (default: seasons/season_01/episode_01/episode_script.md)
 * 
 * Options:
 *   --help, -h        Show this help message
 *   --dry-run         Show what would be fixed without writing
 *   --all             Fix all episode_script.md files in seasons/
 * 
 * Examples:
 *   # Fix default episode
 *   npm run fix:script
 * 
 *   # Fix specific episode
 *   npm run fix:script -- seasons/season_01/episode_03/episode_script.md
 * 
 *   # Fix all episodes
 *   npm run fix:script -- --all
 * 
 *   # Preview changes without writing
 *   npm run fix:script -- --dry-run
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface CLIOptions {
  paths: string[];
  dryRun: boolean;
  all: boolean;
  help: boolean;
}

interface FixResult {
  path: string;
  status: 'fixed' | 'skipped' | 'error';
  message: string;
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    paths: [],
    dryRun: false,
    all: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--all':
        options.all = true;
        break;
      default:
        if (!arg.startsWith('-')) {
          options.paths.push(arg);
        }
    }
  }

  // Default path if none specified and not --all
  if (options.paths.length === 0 && !options.all) {
    options.paths.push('seasons/season_01/episode_01/episode_script.md');
  }

  return options;
}

function printHelp(): void {
  console.log(`
Fix Episode Script Format
=========================

Fixes episode_script.md files that were incorrectly saved as JSON-escaped strings.

Usage:
  npx tsx src/cli/fix-script-format.ts [path]
  npm run fix:script -- [path]

Arguments:
  path    Path to episode_script.md file(s)

Options:
  --help, -h    Show this help message
  --dry-run     Show what would be fixed without writing
  --all         Fix all episode_script.md files in seasons/

Examples:
  # Fix default episode (season_01/episode_01)
  npm run fix:script

  # Fix specific episode
  npm run fix:script -- seasons/season_01/episode_03/episode_script.md

  # Fix all episodes
  npm run fix:script -- --all

  # Preview changes without writing
  npm run fix:script -- --dry-run
`);
}

// ============================================================================
// Script Fixing Logic
// ============================================================================

/**
 * Check if content appears to be JSON-escaped (wrapped in quotes with literal \n)
 */
function isJsonEscaped(content: string): boolean {
  const trimmed = content.trim();
  
  // Check if it's a JSON string (starts and ends with quotes)
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return true;
  }
  
  // Check if it contains literal \n sequences (not actual newlines)
  // A properly formatted markdown file should have actual newlines
  if (trimmed.includes('\\n') && !trimmed.includes('\n')) {
    return true;
  }
  
  // Check if the content is very long single line with \n literals
  const lines = content.split('\n');
  if (lines.length === 1 && content.includes('\\n')) {
    return true;
  }
  
  return false;
}

/**
 * Fix JSON-escaped content by parsing it as JSON or manually unescaping
 */
function fixJsonEscaped(content: string): string {
  const trimmed = content.trim();
  
  // Try to parse as JSON first (handles quoted strings)
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to manual fix
    }
  }
  
  // Manual unescape for literal \n sequences
  let fixed = content
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
  
  // Remove surrounding quotes if present
  if (fixed.startsWith('"') && fixed.endsWith('"')) {
    fixed = fixed.slice(1, -1);
  }
  
  return fixed;
}

/**
 * Recursively find all episode_script.md files in a directory
 */
async function findAllEpisodeScripts(dir: string): Promise<string[]> {
  const results: string[] = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subResults = await findAllEpisodeScripts(fullPath);
        results.push(...subResults);
      } else if (entry.name === 'episode_script.md') {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read, skip
  }
  
  return results;
}

/**
 * Process a single file
 */
async function processFile(filePath: string, dryRun: boolean): Promise<FixResult> {
  const resolvedPath = path.resolve(filePath);
  
  try {
    // Check if file exists
    await fs.access(resolvedPath);
  } catch {
    return {
      path: filePath,
      status: 'error',
      message: 'File not found',
    };
  }
  
  try {
    const content = await fs.readFile(resolvedPath, 'utf-8');
    
    if (!isJsonEscaped(content)) {
      return {
        path: filePath,
        status: 'skipped',
        message: 'Already properly formatted',
      };
    }
    
    const fixed = fixJsonEscaped(content);
    
    if (dryRun) {
      console.log(`\n--- Preview: ${filePath} ---`);
      console.log(`Original length: ${content.length} chars, ${content.split('\n').length} lines`);
      console.log(`Fixed length: ${fixed.length} chars, ${fixed.split('\n').length} lines`);
      console.log(`\nFirst 500 chars of fixed content:`);
      console.log(fixed.slice(0, 500));
      console.log('...');
      
      return {
        path: filePath,
        status: 'fixed',
        message: 'Would fix (dry run)',
      };
    }
    
    await fs.writeFile(resolvedPath, fixed, 'utf-8');
    
    return {
      path: filePath,
      status: 'fixed',
      message: `Fixed: ${content.split('\n').length} lines -> ${fixed.split('\n').length} lines`,
    };
    
  } catch (error) {
    return {
      path: filePath,
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
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
  console.log('     FIX EPISODE SCRIPT FORMAT         ');
  console.log('========================================\n');

  if (options.dryRun) {
    console.log('DRY RUN MODE - No files will be modified\n');
  }

  // Gather all paths to process
  let paths = options.paths;
  
  if (options.all) {
    // Find all episode_script.md files by scanning seasons directory
    paths = await findAllEpisodeScripts('seasons');
    console.log(`Found ${paths.length} episode script(s) to check\n`);
  }

  if (paths.length === 0) {
    console.log('No files to process.');
    process.exit(0);
  }

  // Process each file
  const results: FixResult[] = [];
  
  for (const filePath of paths) {
    const result = await processFile(filePath, options.dryRun);
    results.push(result);
    
    const icon = result.status === 'fixed' ? '✓' : result.status === 'skipped' ? '-' : '✗';
    console.log(`${icon} ${result.path}: ${result.message}`);
  }

  // Summary
  console.log('\n========================================');
  console.log('              SUMMARY                  ');
  console.log('========================================\n');
  
  const fixed = results.filter(r => r.status === 'fixed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;
  
  console.log(`Fixed:   ${fixed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors:  ${errors}`);
  
  if (errors > 0) {
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
