/**
 * Environment bindings for Cloudflare Workers
 */
export interface Env {
  RETURNS_CACHE?: KVNamespace;
  ENVIRONMENT?: string;
}

/**
 * MCP Tool Result wrapper
 * Used by tool handlers to return results or errors
 */
export interface MCPToolResult<T> {
  result?: T;
  error?: string;
}

/**
 * MCP JSON-RPC Request
 * Follows JSON-RPC 2.0 specification
 */
export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC Response
 * Follows JSON-RPC 2.0 specification
 */
export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: MCPError;
}

/**
 * MCP Error object
 */
export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP Tool Definition
 * Returned by tools/list endpoint
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP Tool Content Item
 * Used in tool call responses
 */
export interface MCPContentItem {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
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
