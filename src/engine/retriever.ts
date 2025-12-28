/**
 * GraphRAG-lite Retriever
 * 
 * Extracts relevant subgraphs for scene generation by walking k-hop neighborhoods
 * from scene participants. Filters by relevance (active threads, recent changes).
 */

import type { StateStore } from './state-store.js';
import type { Character, Relationship, Secret, Thread } from '../types/world.js';
import type { RetrievedSubgraph } from '../types/episode.js';

// ============================================================================
// Types
// ============================================================================

export interface RetrieverConfig {
  maxHops: number;           // k in k-hop neighborhood (default: 2)
  maxRelationships: number;  // Limit total relationships returned
  maxSecrets: number;        // Limit secrets returned
  maxBeliefs: number;        // Limit beliefs per character
  includeInactiveSecrets: boolean;
}

const DEFAULT_CONFIG: RetrieverConfig = {
  maxHops: 2,
  maxRelationships: 15,
  maxSecrets: 5,
  maxBeliefs: 3,
  includeInactiveSecrets: false,
};

interface RelationshipNode {
  source: string;
  target: string;
  type: string;
  dynamic?: string;
  weights?: Record<string, number>;
  hopDistance: number;
}

// ============================================================================
// Retriever
// ============================================================================

export class Retriever {
  private store: StateStore;
  private config: RetrieverConfig;

  constructor(store: StateStore, config: Partial<RetrieverConfig> = {}) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract a subgraph relevant to a set of scene participants.
   */
  extractSubgraph(
    participantIds: string[],
    activeThreadIds?: string[],
    _sceneLocationId?: string
  ): RetrievedSubgraph {
    // Note: _sceneLocationId reserved for future location-based filtering
    
    // 1. Collect relationships via k-hop walk
    const relationships = this.walkRelationships(participantIds);
    
    // 2. Get relevant secrets
    const secrets = this.getRelevantSecrets(participantIds, activeThreadIds);
    
    // 3. Get relevant beliefs from participants
    const beliefs = this.getRelevantBeliefs(participantIds);
    
    // 4. Get relevant assets (owned by or affecting participants)
    const assets = this.getRelevantAssets(participantIds);
    
    return {
      note: `GraphRAG-lite extraction (k=${this.config.maxHops} hops from ${participantIds.length} participants)`,
      relationships: relationships.slice(0, this.config.maxRelationships).map(r => ({
        source: r.source,
        target: r.target,
        type: r.type,
        dynamic: r.dynamic,
        weights: r.weights,
      })),
      relevant_assets: assets,
      relevant_beliefs: beliefs,
      relevant_secrets: secrets.slice(0, this.config.maxSecrets).map(s => ({
        id: s.id,
        holders: s.holders,
        summary: s.description,
      })),
    };
  }

  /**
   * Walk k-hop neighborhood from seed characters.
   */
  private walkRelationships(seedIds: string[]): RelationshipNode[] {
    const state = this.store.getWorldState();
    const visited = new Set<string>();
    const result: RelationshipNode[] = [];
    
    // BFS from seed nodes
    let frontier = new Set(seedIds);
    let hopDistance = 0;
    
    while (frontier.size > 0 && hopDistance < this.config.maxHops) {
      const nextFrontier = new Set<string>();
      
      for (const charId of frontier) {
        if (visited.has(charId)) continue;
        visited.add(charId);
        
        // Find all relationships involving this character
        const relationships = state.relationships.edges.filter(
          r => r.from === charId || r.to === charId
        );
        
        for (const rel of relationships) {
          const otherId = rel.from === charId ? rel.to : rel.from;
          
          // Skip if we've already visited from this direction
          const relKey = `${rel.from}->${rel.to}`;
          if (!visited.has(relKey)) {
            visited.add(relKey);
            
            result.push({
              source: rel.from,
              target: rel.to,
              type: rel.type,
              dynamic: this.generateDynamic(rel),
              weights: rel.weights as Record<string, number>,
              hopDistance: hopDistance + 1,
            });
            
            // Add other end to next frontier
            if (!visited.has(otherId)) {
              nextFrontier.add(otherId);
            }
          }
        }
      }
      
      frontier = nextFrontier;
      hopDistance++;
    }
    
    // Sort by hop distance (closer relationships first) then by relevance weight
    return result.sort((a, b) => {
      if (a.hopDistance !== b.hopDistance) {
        return a.hopDistance - b.hopDistance;
      }
      // Secondary sort by strongest weight
      const aMax = Math.max(...Object.values(a.weights || {}));
      const bMax = Math.max(...Object.values(b.weights || {}));
      return bMax - aMax;
    });
  }

  /**
   * Generate a human-readable dynamic description for a relationship.
   */
  private generateDynamic(rel: Relationship): string {
    const dynamics: string[] = [];
    
    if (rel.weights.loyalty && rel.weights.loyalty > 70) {
      dynamics.push('strong loyalty');
    }
    if (rel.weights.fear && rel.weights.fear > 50) {
      dynamics.push('fear-based');
    }
    if (rel.weights.resentment && rel.weights.resentment > 60) {
      dynamics.push('bitter resentment');
    }
    if (rel.weights.respect && rel.weights.respect > 70) {
      dynamics.push('mutual respect');
    }
    if (rel.weights.dependency && rel.weights.dependency > 60) {
      dynamics.push('strong dependency');
    }
    
    // Add flag information
    if (rel.flags?.public_feud) {
      dynamics.push('public feud');
    }
    if (rel.flags?.transactional) {
      dynamics.push('transactional relationship');
    }
    
    if (dynamics.length === 0) {
      return `${rel.type} relationship`;
    }
    
    return dynamics.join(', ');
  }

  /**
   * Get secrets relevant to the scene participants.
   */
  private getRelevantSecrets(
    participantIds: string[],
    _activeThreadIds?: string[]
  ): Secret[] {
    // Note: _activeThreadIds reserved for future thread-based filtering
    const state = this.store.getWorldState();
    
    return state.secrets.secrets
      .filter(secret => {
        // Must be active (unless configured otherwise)
        if (!this.config.includeInactiveSecrets && secret.status !== 'active') {
          return false;
        }
        
        // Must involve at least one participant
        const involvesParticipant = 
          secret.subject_ids.some(id => participantIds.includes(id)) ||
          secret.holders.some(id => participantIds.includes(id));
        
        return involvesParticipant;
      })
      .sort((a, b) => {
        // Sort by relevance: higher legal_value and public_damage first
        const aScore = a.stats.legal_value + a.stats.public_damage;
        const bScore = b.stats.legal_value + b.stats.public_damage;
        return bScore - aScore;
      });
  }

  /**
   * Get relevant beliefs from participant characters.
   */
  private getRelevantBeliefs(participantIds: string[]): Array<{ holder: string; text: string }> {
    const beliefs: Array<{ holder: string; text: string }> = [];
    
    for (const charId of participantIds) {
      const character = this.store.getCharacter(charId);
      if (!character) continue;
      
      // Get highest-confidence beliefs
      const charBeliefs = [...character.bdi.beliefs]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, this.config.maxBeliefs)
        .map(b => ({ holder: charId, text: b.text }));
      
      beliefs.push(...charBeliefs);
    }
    
    return beliefs;
  }

  /**
   * Get assets relevant to participants.
   */
  private getRelevantAssets(participantIds: string[]): Array<{ id: string; status?: string; context?: string }> {
    const state = this.store.getWorldState();
    const assets: Array<{ id: string; status?: string; context?: string }> = [];
    
    // Networks owned by participants
    const networks = state.assets.assets.networks?.filter(
      n => participantIds.includes(n.owner)
    ) || [];
    
    for (const network of networks) {
      assets.push({
        id: network.id,
        status: 'active',
        context: `${network.name} (${network.type}) owned by ${network.owner}`,
      });
    }
    
    // Offices held by participants
    const offices = state.assets.assets.offices?.filter(
      o => participantIds.includes(o.owner)
    ) || [];
    
    for (const office of offices) {
      assets.push({
        id: office.id,
        status: 'held',
        context: `${office.name} with powers: ${office.powers.join(', ')}`,
      });
    }
    
    // Contracts involving participants
    const contracts = state.assets.assets.contracts?.filter(
      c => c.stakeholders.some(s => participantIds.includes(s))
    ) || [];
    
    for (const contract of contracts) {
      assets.push({
        id: contract.id,
        status: contract.status,
        context: `${contract.type} contract`,
      });
    }
    
    return assets;
  }

  /**
   * Get context for a specific thread.
   */
  getThreadContext(threadId: string): {
    thread: Thread | undefined;
    relatedCharacters: string[];
    relatedSecrets: string[];
  } {
    const thread = this.store.getThread(threadId);
    if (!thread) {
      return { thread: undefined, relatedCharacters: [], relatedSecrets: [] };
    }
    
    // Find characters related to the thread's state paths
    const relatedCharacters: string[] = [];
    if (thread.related_state_paths) {
      for (const path of thread.related_state_paths) {
        if (path.startsWith('characters.')) {
          const charId = path.split('.')[1];
          if (charId && !relatedCharacters.includes(charId)) {
            relatedCharacters.push(charId);
          }
        }
      }
    }
    
    // Get related secrets
    const relatedSecrets = thread.related_secrets || [];
    
    return { thread, relatedCharacters, relatedSecrets };
  }

  /**
   * Build a complete context package for scene generation.
   */
  buildSceneContext(
    participantIds: string[],
    activeThreadIds: string[],
    locationId: string
  ): {
    subgraph: RetrievedSubgraph;
    characters: Character[];
    location: { id: string; name?: string; visual_dna?: unknown };
    threads: Thread[];
  } {
    // Extract subgraph
    const subgraph = this.extractSubgraph(participantIds, activeThreadIds, locationId);
    
    // Get full character data for participants
    const characters = participantIds
      .map(id => this.store.getCharacter(id))
      .filter((c): c is Character => c !== undefined);
    
    // Get location data
    const stateForLocation = this.store.getWorldState();
    const locationData = stateForLocation.world.locations.find(l => l.id === locationId);
    const location = locationData || { id: locationId };
    
    // Get active threads
    const threads = activeThreadIds
      .map(id => this.store.getThread(id))
      .filter((t): t is Thread => t !== undefined);
    
    return { subgraph, characters, location, threads };
  }
}
