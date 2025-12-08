/**
 * MCP Server Implementation
 *
 * Handles the Model Context Protocol (JSON-RPC 2.0) for tool discovery and execution.
 * This is the core protocol layer that routes requests to registered tools.
 */

import { Env, MCPRequest, MCPResponse, MCPToolDefinition } from '../types';

/**
 * Tool handler function signature
 */
export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  env: Env
) => Promise<{ result?: TOutput; error?: string }>;

/**
 * Registered tool with handler
 */
export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  name: string;
  version: string;
  tools?: RegisteredTool[];
}

/**
 * MCP Server class
 *
 * Implements the MCP protocol for Cloudflare Workers.
 * Handles JSON-RPC 2.0 requests and routes them to registered tools.
 */
export class MCPServer {
  private config: MCPServerConfig;
  private tools: Map<string, RegisteredTool>;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.tools = new Map();

    // Register initial tools if provided
    if (config.tools) {
      for (const tool of config.tools) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  /**
   * Register a new tool with the server
   */
  registerTool(tool: RegisteredTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Main request handler for Cloudflare Workers
   */
  async handleRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return this.corsResponse();
    }

    // Health check endpoint (non-MCP, for monitoring)
    if (url.pathname === '/health') {
      return this.handleHealthCheck();
    }

    // All other requests should be MCP JSON-RPC
    if (request.method !== 'POST') {
      return this.jsonResponse(
        {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Invalid Request: MCP requires POST method',
          },
        },
        405
      );
    }

    // Parse JSON-RPC request
    let mcpRequest: MCPRequest;
    try {
      mcpRequest = await request.json();
    } catch {
      return this.jsonResponse(
        {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error: Invalid JSON',
          },
        },
        400
      );
    }

    // Validate JSON-RPC structure
    if (!mcpRequest.jsonrpc || mcpRequest.jsonrpc !== '2.0') {
      return this.jsonResponse(
        {
          jsonrpc: '2.0',
          id: mcpRequest.id ?? null,
          error: {
            code: -32600,
            message: 'Invalid Request: Missing or invalid jsonrpc version',
          },
        },
        400
      );
    }

    // Route to appropriate handler
    const response = await this.handleMCPRequest(mcpRequest, env);
    return this.jsonResponse(response);
  }

  /**
   * Route MCP methods to handlers
   */
  private async handleMCPRequest(request: MCPRequest, env: Env): Promise<MCPResponse> {
    const { id, method, params } = request;

    switch (method) {
      case 'initialize':
        return this.handleInitialize(id);

      case 'initialized':
        // Client acknowledgment - no response needed but we return success
        return {
          jsonrpc: '2.0',
          id,
          result: {},
        };

      case 'tools/list':
        return this.handleToolsList(id);

      case 'tools/call':
        return this.handleToolCall(id, params as { name: string; arguments?: unknown }, env);

      case 'ping':
        return {
          jsonrpc: '2.0',
          id,
          result: { pong: true },
        };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  }

  /**
   * Handle initialize request
   *
   * Returns server info and capabilities per MCP spec.
   */
  private handleInitialize(id: string | number): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: this.config.name,
          version: this.config.version,
        },
        capabilities: {
          tools: {
            listChanged: false, // We don't support dynamic tool changes
          },
        },
      },
    };
  }

  /**
   * Handle tools/list request
   *
   * Returns all registered tools with their schemas.
   */
  private handleToolsList(id: string | number): MCPResponse {
    const tools: MCPToolDefinition[] = Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    return {
      jsonrpc: '2.0',
      id,
      result: { tools },
    };
  }

  /**
   * Handle tools/call request
   *
   * Executes the specified tool with provided arguments.
   */
  private async handleToolCall(
    id: string | number,
    params: { name: string; arguments?: unknown } | undefined,
    env: Env
  ): Promise<MCPResponse> {
    // Validate params
    if (!params || !params.name) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: 'Invalid params: Missing tool name',
        },
      };
    }

    const tool = this.tools.get(params.name);

    if (!tool) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: `Unknown tool: ${params.name}`,
        },
      };
    }

    try {
      const startTime = Date.now();
      const result = await tool.handler(params.arguments ?? {}, env);
      const duration = Date.now() - startTime;

      if (result.error) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32000,
            message: result.error,
          },
        };
      }

      // MCP spec: tool results are returned as content array
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.result),
            },
          ],
          _meta: {
            duration_ms: duration,
          },
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: `Tool execution failed: ${message}`,
        },
      };
    }
  }

  /**
   * Handle health check endpoint
   */
  private handleHealthCheck(): Response {
    const toolNames = Array.from(this.tools.keys());

    return this.jsonResponse({
      status: 'healthy',
      server: this.config.name,
      version: this.config.version,
      tools: toolNames,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Create JSON response with CORS headers
   */
  private jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  /**
   * Create CORS preflight response
   */
  private corsResponse(): Response {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
}
