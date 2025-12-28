/**
 * State Store
 * 
 * Manages loading, saving, and querying the world state from JSON files.
 * Provides a unified interface to all world data.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

import {
  World,
  WorldSchema,
  FactionsFile,
  FactionsFileSchema,
  CharactersFile,
  CharactersFileSchema,
  RelationshipsFile,
  RelationshipsFileSchema,
  SecretsFile,
  SecretsFileSchema,
  AssetsFile,
  AssetsFileSchema,
  ThreadsFile,
  ThreadsFileSchema,
  ConstraintsFile,
  ConstraintsFileSchema,
  Character,
  Relationship,
  Faction,
  Secret,
  Thread,
} from '../types/world.js';

import {
  OperatorsFile,
  OperatorsFileSchema,
  Operator,
} from '../types/operators.js';

import {
  SeasonGoals,
  SeasonGoalsSchema,
  CliffhangerConstraints,
  CliffhangerConstraintsSchema,
} from '../types/episode.js';

// ============================================================================
// Types
// ============================================================================

export interface WorldState {
  world: World;
  factions: FactionsFile;
  characters: CharactersFile;
  relationships: RelationshipsFile;
  secrets: SecretsFile;
  assets: AssetsFile;
  threads: ThreadsFile;
  constraints: ConstraintsFile;
}

export interface StateStoreConfig {
  basePath: string;
  worldDir?: string;
  operatorsDir?: string;
  seasonsDir?: string;
}

// ============================================================================
// State Store
// ============================================================================

export class StateStore {
  private basePath: string;
  private worldDir: string;
  private operatorsDir: string;
  private seasonsDir: string;
  
  private worldState: WorldState | null = null;
  private operators: OperatorsFile | null = null;

  constructor(config: StateStoreConfig) {
    this.basePath = config.basePath;
    this.worldDir = config.worldDir || 'world';
    this.operatorsDir = config.operatorsDir || 'operators';
    this.seasonsDir = config.seasonsDir || 'seasons';
  }

  // ==========================================================================
  // Loading
  // ==========================================================================

  async loadWorldState(): Promise<WorldState> {
    const worldPath = join(this.basePath, this.worldDir);
    
    const [
      world,
      factions,
      characters,
      relationships,
      secrets,
      assets,
      threads,
      constraints,
    ] = await Promise.all([
      this.loadJsonFile(join(worldPath, 'world.json'), WorldSchema),
      this.loadJsonFile(join(worldPath, 'factions.json'), FactionsFileSchema),
      this.loadJsonFile(join(worldPath, 'characters.json'), CharactersFileSchema),
      this.loadJsonFile(join(worldPath, 'relationships.json'), RelationshipsFileSchema),
      this.loadJsonFile(join(worldPath, 'secrets.json'), SecretsFileSchema),
      this.loadJsonFile(join(worldPath, 'assets.json'), AssetsFileSchema),
      this.loadJsonFile(join(worldPath, 'threads.json'), ThreadsFileSchema),
      this.loadJsonFile(join(worldPath, 'constraints.json'), ConstraintsFileSchema),
    ]);

    this.worldState = {
      world,
      factions,
      characters,
      relationships,
      secrets,
      assets,
      threads,
      constraints,
    };

    return this.worldState;
  }

  async loadOperators(): Promise<OperatorsFile> {
    const operatorsPath = join(this.basePath, this.operatorsDir, 'operators.json');
    this.operators = await this.loadJsonFile(operatorsPath, OperatorsFileSchema);
    return this.operators;
  }

  async loadSeasonGoals(seasonId: string): Promise<SeasonGoals> {
    const seasonPath = join(this.basePath, this.seasonsDir, seasonId, 'season_goals.json');
    return this.loadJsonFile(seasonPath, SeasonGoalsSchema);
  }

  async loadCliffhangerConstraints(seasonId: string, episodeId: string): Promise<CliffhangerConstraints | null> {
    const constraintsPath = join(
      this.basePath,
      this.seasonsDir,
      seasonId,
      episodeId,
      'cliffhanger_constraints.json'
    );
    
    if (!existsSync(constraintsPath)) {
      return null;
    }
    
    return this.loadJsonFile(constraintsPath, CliffhangerConstraintsSchema);
  }

  // ==========================================================================
  // Saving
  // ==========================================================================

  async saveWorldState(state: WorldState): Promise<void> {
    const worldPath = join(this.basePath, this.worldDir);
    
    await Promise.all([
      this.saveJsonFile(join(worldPath, 'world.json'), state.world),
      this.saveJsonFile(join(worldPath, 'factions.json'), state.factions),
      this.saveJsonFile(join(worldPath, 'characters.json'), state.characters),
      this.saveJsonFile(join(worldPath, 'relationships.json'), state.relationships),
      this.saveJsonFile(join(worldPath, 'secrets.json'), state.secrets),
      this.saveJsonFile(join(worldPath, 'assets.json'), state.assets),
      this.saveJsonFile(join(worldPath, 'threads.json'), state.threads),
      this.saveJsonFile(join(worldPath, 'constraints.json'), state.constraints),
    ]);

    this.worldState = state;
  }

  async saveEpisodeArtifact(
    seasonId: string,
    episodeId: string,
    filename: string,
    data: unknown
  ): Promise<void> {
    const episodePath = join(this.basePath, this.seasonsDir, seasonId, episodeId);
    await this.ensureDir(episodePath);
    await this.saveJsonFile(join(episodePath, filename), data);
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  getWorldState(): WorldState {
    if (!this.worldState) {
      throw new Error('World state not loaded. Call loadWorldState() first.');
    }
    return this.worldState;
  }

  getOperators(): OperatorsFile {
    if (!this.operators) {
      throw new Error('Operators not loaded. Call loadOperators() first.');
    }
    return this.operators;
  }

  // Character queries
  getCharacter(id: string): Character | undefined {
    return this.getWorldState().characters.characters.find(c => c.id === id);
  }

  getCharactersByFaction(factionId: string): Character[] {
    return this.getWorldState().characters.characters.filter(c => c.faction_id === factionId);
  }

  getPrincipals(): Character[] {
    // Characters with high auctoritas or explicit archetype are principals
    return this.getWorldState().characters.characters.filter(
      c => c.stats.auctoritas >= 60 || c.archetype
    );
  }

  // Relationship queries
  getRelationship(fromId: string, toId: string): Relationship | undefined {
    return this.getWorldState().relationships.edges.find(
      r => r.from === fromId && r.to === toId
    );
  }

  getRelationshipsFor(characterId: string): Relationship[] {
    return this.getWorldState().relationships.edges.filter(
      r => r.from === characterId || r.to === characterId
    );
  }

  // Faction queries
  getFaction(id: string): Faction | undefined {
    return this.getWorldState().factions.factions.find(f => f.id === id);
  }

  // Secret queries
  getSecret(id: string): Secret | undefined {
    return this.getWorldState().secrets.secrets.find(s => s.id === id);
  }

  getSecretsKnownBy(characterId: string): Secret[] {
    return this.getWorldState().secrets.secrets.filter(
      s => s.holders.includes(characterId)
    );
  }

  getActiveSecrets(): Secret[] {
    return this.getWorldState().secrets.secrets.filter(s => s.status === 'active');
  }

  // Thread queries
  getThread(id: string): Thread | undefined {
    return this.getWorldState().threads.threads.find(t => t.id === id);
  }

  getOpenThreads(): Thread[] {
    return this.getWorldState().threads.threads.filter(t => t.status === 'open');
  }

  getUrgentThreads(): Thread[] {
    return this.getWorldState().threads.threads.filter(
      t => t.status === 'open' && 
           t.episodes_since_progress >= t.advance_cadence.max_episodes_without_progress
    );
  }

  // Operator queries
  getOperator(id: string): Operator | undefined {
    return this.getOperators().operators.find(o => o.id === id);
  }

  getOperatorsByType(type: 'thriller' | 'soap'): Operator[] {
    return this.getOperators().operators.filter(o => o.type === type);
  }

  getOperatorsByTags(tags: string[]): Operator[] {
    return this.getOperators().operators.filter(
      o => o.tags?.some(t => tags.includes(t))
    );
  }

  // Asset queries
  getCashBalance(characterId: string): number {
    const entry = this.getWorldState().assets.assets.cash_ledger?.find(
      e => e.holder === characterId
    );
    return entry?.denarii ?? 0;
  }

  getOfficesHeldBy(characterId: string): string[] {
    return this.getWorldState().assets.assets.offices
      ?.filter(o => o.owner === characterId)
      .map(o => o.id) ?? [];
  }

  getOfficePowers(characterId: string): string[] {
    return this.getWorldState().assets.assets.offices
      ?.filter(o => o.owner === characterId)
      .flatMap(o => o.powers) ?? [];
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private async loadJsonFile<T>(path: string, schema: { parse: (data: unknown) => T }): Promise<T> {
    const content = await readFile(path, 'utf-8');
    const data = JSON.parse(content);
    return schema.parse(data);
  }

  private async saveJsonFile(path: string, data: unknown): Promise<void> {
    await this.ensureDir(dirname(path));
    
    // Handle markdown files as raw text, not JSON
    if (path.endsWith('.md') && typeof data === 'string') {
      await writeFile(path, data);
    } else {
      await writeFile(path, JSON.stringify(data, null, 2));
    }
  }

  private async ensureDir(path: string): Promise<void> {
    if (!existsSync(path)) {
      await mkdir(path, { recursive: true });
    }
  }

  // ==========================================================================
  // Snapshot (for episode start)
  // ==========================================================================

  createSnapshot(): WorldState {
    const state = this.getWorldState();
    // Deep clone to create immutable snapshot
    return JSON.parse(JSON.stringify(state));
  }
}
