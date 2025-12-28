/**
 * Expression Language Evaluator
 * 
 * Evaluates prerequisite expressions against the current state.
 * Supports: comparisons, membership tests, existence checks, and arithmetic.
 * 
 * Grammar:
 *   expression     := comparison | membership | existence
 *   comparison     := path operator value
 *   membership     := path "includes" value
 *   existence      := path "exists"
 *   path           := context "." property ("." property)*
 *   context        := "actor" | "target" | "world" | "relationship"
 *   operator       := "==" | "!=" | ">" | "<" | ">=" | "<="
 */

import type { Character, Relationship, World, AssetsFile, SecretsFile } from '../types/world.js';

// ============================================================================
// Types
// ============================================================================

export interface EvaluationContext {
  actor?: Character;
  target?: Character;
  world?: World;
  relationship?: Relationship;
  assets?: AssetsFile;
  secrets?: SecretsFile;
  // Derived lookups
  actorOffices?: string[];
  actorKnowledge?: string[];
  targetOffices?: string[];
  targetKnowledge?: string[];
}

export interface EvaluationResult {
  success: boolean;
  value?: unknown;
  error?: string;
}

// ============================================================================
// Tokenizer
// ============================================================================

type TokenType = 
  | 'PATH' 
  | 'OPERATOR' 
  | 'NUMBER' 
  | 'STRING' 
  | 'BOOLEAN' 
  | 'KEYWORD'
  | 'ARITHMETIC'
  | 'LPAREN'
  | 'RPAREN';

interface Token {
  type: TokenType;
  value: string;
}

const OPERATORS = ['==', '!=', '>=', '<=', '>', '<'];
const KEYWORDS = ['includes', 'exists', 'true', 'false', 'AND', 'OR'];
const ARITHMETIC = ['+', '-', '*', '/'];

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  
  while (i < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[i])) {
      i++;
      continue;
    }
    
    // Check for parentheses
    if (expr[i] === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (expr[i] === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }
    
    // Check for two-character operators
    if (i + 1 < expr.length) {
      const twoChar = expr.substring(i, i + 2);
      if (OPERATORS.includes(twoChar)) {
        tokens.push({ type: 'OPERATOR', value: twoChar });
        i += 2;
        continue;
      }
    }
    
    // Check for single-character operators
    if (OPERATORS.includes(expr[i])) {
      tokens.push({ type: 'OPERATOR', value: expr[i] });
      i++;
      continue;
    }
    
    // Check for arithmetic operators
    if (ARITHMETIC.includes(expr[i])) {
      tokens.push({ type: 'ARITHMETIC', value: expr[i] });
      i++;
      continue;
    }
    
    // Check for string literals
    if (expr[i] === '"' || expr[i] === "'") {
      const quote = expr[i];
      let str = '';
      i++;
      while (i < expr.length && expr[i] !== quote) {
        str += expr[i];
        i++;
      }
      i++; // Skip closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }
    
    // Check for numbers
    if (/[\d.]/.test(expr[i])) {
      let num = '';
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }
    
    // Check for identifiers (paths and keywords)
    if (/[a-zA-Z_]/.test(expr[i])) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_.\[\]]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      
      if (KEYWORDS.includes(ident)) {
        if (ident === 'true' || ident === 'false') {
          tokens.push({ type: 'BOOLEAN', value: ident });
        } else {
          tokens.push({ type: 'KEYWORD', value: ident });
        }
      } else {
        tokens.push({ type: 'PATH', value: ident });
      }
      continue;
    }
    
    // Unknown character
    throw new Error(`Unexpected character at position ${i}: '${expr[i]}'`);
  }
  
  return tokens;
}

// ============================================================================
// Path Resolution
// ============================================================================

function resolvePath(path: string, context: EvaluationContext): unknown {
  const parts = path.split('.');
  const contextName = parts[0];
  const propertyPath = parts.slice(1);
  
  let root: unknown;
  
  switch (contextName) {
    case 'actor':
      root = context.actor;
      break;
    case 'target':
      root = context.target;
      break;
    case 'world':
      root = context.world;
      break;
    case 'relationship':
      root = context.relationship;
      break;
    default:
      throw new Error(`Unknown context: ${contextName}`);
  }
  
  if (root === undefined) {
    throw new Error(`Context '${contextName}' is not available`);
  }
  
  // Handle special paths
  if (contextName === 'actor' || contextName === 'target') {
    const fullPath = propertyPath.join('.');
    
    // actor.offices -> list of office powers
    if (fullPath === 'offices') {
      const charId = (contextName === 'actor' ? context.actor?.id : context.target?.id);
      if (context.assets?.assets.offices) {
        const offices = context.assets.assets.offices.filter(o => o.owner === charId);
        return offices.flatMap(o => o.powers.map(p => `powers.${p}`));
      }
      return [];
    }
    
    // actor.knowledge -> list of secret IDs known
    if (fullPath === 'knowledge') {
      const charId = (contextName === 'actor' ? context.actor?.id : context.target?.id);
      if (context.secrets?.secrets) {
        return context.secrets.secrets
          .filter(s => s.holders.includes(charId!))
          .map(s => s.id);
      }
      return [];
    }
    
    // actor.location -> location_id
    if (fullPath === 'location') {
      const char = contextName === 'actor' ? context.actor : context.target;
      return char?.status.location_id;
    }
  }
  
  // Standard path traversal
  let current: unknown = root;
  for (const part of propertyPath) {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    // Handle array access: property[index] or property["key"]
    const arrayMatch = part.match(/^(\w+)\[(\d+|"[^"]+"|'[^']+')\]$/);
    if (arrayMatch) {
      const propName = arrayMatch[1];
      let index: string | number = arrayMatch[2];
      
      // Remove quotes if present
      if (index.startsWith('"') || index.startsWith("'")) {
        index = index.slice(1, -1);
      } else {
        index = parseInt(index, 10);
      }
      
      current = (current as Record<string, unknown>)[propName];
      if (Array.isArray(current) && typeof index === 'number') {
        current = current[index];
      } else if (typeof current === 'object' && current !== null) {
        current = (current as Record<string, unknown>)[index];
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  
  return current;
}

// ============================================================================
// Expression Evaluation
// ============================================================================

export function evaluateExpression(expr: string, context: EvaluationContext): EvaluationResult {
  try {
    const tokens = tokenize(expr);
    const result = parseAndEvaluate(tokens, context);
    return { success: true, value: result };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

function parseAndEvaluate(tokens: Token[], context: EvaluationContext): boolean {
  let i = 0;
  
  function parseValue(): unknown {
    const token = tokens[i];
    
    if (!token) {
      throw new Error('Unexpected end of expression');
    }
    
    if (token.type === 'NUMBER') {
      i++;
      return parseFloat(token.value);
    }
    
    if (token.type === 'STRING') {
      i++;
      return token.value;
    }
    
    if (token.type === 'BOOLEAN') {
      i++;
      return token.value === 'true';
    }
    
    if (token.type === 'PATH') {
      i++;
      return resolvePath(token.value, context);
    }
    
    if (token.type === 'LPAREN') {
      i++; // Skip (
      const result = parseArithmetic();
      if (tokens[i]?.type === 'RPAREN') {
        i++; // Skip )
      }
      return result;
    }
    
    throw new Error(`Unexpected token: ${token.type} (${token.value})`);
  }
  
  function parseArithmetic(): unknown {
    let left = parseValue();
    
    while (i < tokens.length && tokens[i]?.type === 'ARITHMETIC') {
      const op = tokens[i].value;
      i++;
      const right = parseValue();
      
      if (typeof left !== 'number' || typeof right !== 'number') {
        throw new Error(`Arithmetic requires numeric operands, got ${typeof left} and ${typeof right}`);
      }
      
      switch (op) {
        case '+': left = left + right; break;
        case '-': left = left - right; break;
        case '*': left = left * right; break;
        case '/': left = right !== 0 ? left / right : 0; break;
      }
    }
    
    return left;
  }
  
  function parseComparison(): boolean {
    // Check for existence check: path exists
    if (tokens[i]?.type === 'PATH' && tokens[i + 1]?.type === 'KEYWORD' && tokens[i + 1]?.value === 'exists') {
      const path = tokens[i].value;
      i += 2;
      const value = resolvePath(path, context);
      return value !== undefined && value !== null;
    }
    
    // Check for membership check: path includes value
    if (tokens[i]?.type === 'PATH' && tokens[i + 1]?.type === 'KEYWORD' && tokens[i + 1]?.value === 'includes') {
      const path = tokens[i].value;
      i += 2;
      const searchValue = parseValue();
      const arrayValue = resolvePath(path, context);
      
      if (Array.isArray(arrayValue)) {
        return arrayValue.includes(searchValue);
      }
      if (typeof arrayValue === 'string') {
        return arrayValue.includes(String(searchValue));
      }
      return false;
    }
    
    // Standard comparison: left op right
    const left = parseArithmetic();
    
    if (i >= tokens.length || tokens[i].type !== 'OPERATOR') {
      // Just a value, treat as truthy check
      return Boolean(left);
    }
    
    const op = tokens[i].value;
    i++;
    const right = parseArithmetic();
    
    switch (op) {
      case '==': return left === right;
      case '!=': return left !== right;
      case '>': return (left as number) > (right as number);
      case '<': return (left as number) < (right as number);
      case '>=': return (left as number) >= (right as number);
      case '<=': return (left as number) <= (right as number);
      default:
        throw new Error(`Unknown operator: ${op}`);
    }
  }
  
  return parseComparison();
}

// ============================================================================
// Batch Evaluation (for multiple prereqs)
// ============================================================================

export function evaluatePrereqs(
  prereqs: Array<{ expr: string }>,
  context: EvaluationContext
): { allPassed: boolean; results: Array<{ expr: string; passed: boolean; error?: string }> } {
  const results = prereqs.map(prereq => {
    const result = evaluateExpression(prereq.expr, context);
    return {
      expr: prereq.expr,
      passed: result.success && result.value === true,
      error: result.error,
    };
  });
  
  return {
    allPassed: results.every(r => r.passed),
    results,
  };
}
