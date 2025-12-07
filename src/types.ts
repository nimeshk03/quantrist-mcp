/**
 * Environment bindings for Cloudflare Workers
 */
export interface Env {
  RETURNS_CACHE?: KVNamespace;
  ENVIRONMENT?: string;
}

/**
 * MCP Tool Result wrapper
 */
export interface MCPToolResult<T> {
  result?: T;
  error?: string;
}

/**
 * MCP JSON-RPC Request
 */
export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC Response
 */
export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCP Tool Definition
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Risk decision types
 */
export type RiskDecision = 'PROCEED' | 'REDUCE' | 'VETO';

/**
 * Correlation regime types
 */
export type CorrelationRegime = 'normal' | 'elevated' | 'crisis';

/**
 * Correlation impact levels
 */
export type CorrelationImpact = 'low' | 'medium' | 'high';
