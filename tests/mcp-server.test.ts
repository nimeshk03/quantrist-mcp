/**
 * MCP Server Tests
 *
 * Tests the MCP protocol implementation including:
 * - Health check endpoint
 * - JSON-RPC 2.0 protocol handling
 * - Tool listing and execution
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MCPServer, RegisteredTool } from '../src/mcp/server';
import { Env } from '../src/types';

// Mock environment
const mockEnv: Env = {};

// Helper to create a mock Request
function createRequest(method: string, body?: unknown, path = '/'): Request {
  const url = `http://localhost${path}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  return new Request(url, options);
}

// Helper to parse response
async function parseResponse(response: Response): Promise<unknown> {
  return response.json();
}

describe('MCPServer', () => {
  let server: MCPServer;

  beforeEach(() => {
    server = new MCPServer({
      name: 'test-server',
      version: '1.0.0',
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const request = createRequest('GET', undefined, '/health');
      const response = await server.handleRequest(request, mockEnv);

      expect(response.status).toBe(200);

      const body = (await parseResponse(response)) as {
        status: string;
        server: string;
        version: string;
        tools: string[];
      };
      expect(body.status).toBe('healthy');
      expect(body.server).toBe('test-server');
      expect(body.version).toBe('1.0.0');
      expect(body.tools).toEqual([]);
    });

    it('should include registered tools in health check', async () => {
      server.registerTool({
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        handler: async () => ({ result: 'ok' }),
      });

      const request = createRequest('GET', undefined, '/health');
      const response = await server.handleRequest(request, mockEnv);
      const body = (await parseResponse(response)) as { tools: string[] };

      expect(body.tools).toContain('test_tool');
    });
  });

  describe('CORS', () => {
    it('should handle OPTIONS preflight request', async () => {
      const request = createRequest('OPTIONS');
      const response = await server.handleRequest(request, mockEnv);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should include CORS headers in JSON responses', async () => {
      const request = createRequest('GET', undefined, '/health');
      const response = await server.handleRequest(request, mockEnv);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('JSON-RPC Protocol', () => {
    it('should reject non-POST requests to MCP endpoint', async () => {
      const request = createRequest('GET');
      const response = await server.handleRequest(request, mockEnv);

      expect(response.status).toBe(405);
      const body = (await parseResponse(response)) as { error: { code: number } };
      expect(body.error.code).toBe(-32600);
    });

    it('should reject invalid JSON', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      });
      const response = await server.handleRequest(request, mockEnv);

      expect(response.status).toBe(400);
      const body = (await parseResponse(response)) as { error: { code: number } };
      expect(body.error.code).toBe(-32700);
    });

    it('should reject missing jsonrpc version', async () => {
      const request = createRequest('POST', { id: 1, method: 'test' });
      const response = await server.handleRequest(request, mockEnv);

      expect(response.status).toBe(400);
      const body = (await parseResponse(response)) as { error: { code: number } };
      expect(body.error.code).toBe(-32600);
    });

    it('should return method not found for unknown methods', async () => {
      const request = createRequest('POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown_method',
      });
      const response = await server.handleRequest(request, mockEnv);
      const body = (await parseResponse(response)) as { error: { code: number; message: string } };

      expect(body.error.code).toBe(-32601);
      expect(body.error.message).toContain('unknown_method');
    });
  });

  describe('initialize', () => {
    it('should return server info and capabilities', async () => {
      const request = createRequest('POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      });
      const response = await server.handleRequest(request, mockEnv);
      const body = (await parseResponse(response)) as {
        jsonrpc: string;
        id: number;
        result: {
          protocolVersion: string;
          serverInfo: { name: string; version: string };
          capabilities: { tools: object };
        };
      };

      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
      expect(body.result.protocolVersion).toBe('2024-11-05');
      expect(body.result.serverInfo.name).toBe('test-server');
      expect(body.result.serverInfo.version).toBe('1.0.0');
      expect(body.result.capabilities.tools).toBeDefined();
    });
  });

  describe('tools/list', () => {
    it('should return empty tools list when no tools registered', async () => {
      const request = createRequest('POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      });
      const response = await server.handleRequest(request, mockEnv);
      const body = (await parseResponse(response)) as {
        result: { tools: unknown[] };
      };

      expect(body.result.tools).toEqual([]);
    });

    it('should return registered tools with schemas', async () => {
      const testTool: RegisteredTool = {
        name: 'test_tool',
        description: 'A test tool for testing',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
        },
        handler: async () => ({ result: 'ok' }),
      };
      server.registerTool(testTool);

      const request = createRequest('POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      });
      const response = await server.handleRequest(request, mockEnv);
      const body = (await parseResponse(response)) as {
        result: {
          tools: Array<{ name: string; description: string; inputSchema: object }>;
        };
      };

      expect(body.result.tools).toHaveLength(1);
      expect(body.result.tools[0].name).toBe('test_tool');
      expect(body.result.tools[0].description).toBe('A test tool for testing');
      expect(body.result.tools[0].inputSchema).toEqual(testTool.inputSchema);
    });
  });

  describe('tools/call', () => {
    beforeEach(() => {
      server.registerTool({
        name: 'add',
        description: 'Add two numbers',
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' },
          },
        },
        handler: async (input) => {
          const { a, b } = input as { a: number; b: number };
          return { result: { sum: a + b } };
        },
      });

      server.registerTool({
        name: 'failing_tool',
        description: 'A tool that always fails',
        inputSchema: { type: 'object' },
        handler: async () => {
          return { error: 'This tool always fails' };
        },
      });

      server.registerTool({
        name: 'throwing_tool',
        description: 'A tool that throws an exception',
        inputSchema: { type: 'object' },
        handler: async () => {
          throw new Error('Unexpected error');
        },
      });
    });

    it('should return error for missing tool name', async () => {
      const request = createRequest('POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {},
      });
      const response = await server.handleRequest(request, mockEnv);
      const body = (await parseResponse(response)) as { error: { code: number } };

      expect(body.error.code).toBe(-32602);
    });

    it('should return error for unknown tool', async () => {
      const request = createRequest('POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'nonexistent_tool' },
      });
      const response = await server.handleRequest(request, mockEnv);
      const body = (await parseResponse(response)) as { error: { code: number; message: string } };

      expect(body.error.code).toBe(-32602);
      expect(body.error.message).toContain('nonexistent_tool');
    });

    it('should execute tool and return result', async () => {
      const request = createRequest('POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'add',
          arguments: { a: 5, b: 3 },
        },
      });
      const response = await server.handleRequest(request, mockEnv);
      const body = (await parseResponse(response)) as {
        result: {
          content: Array<{ type: string; text: string }>;
          _meta: { duration_ms: number };
        };
      };

      expect(body.result.content).toHaveLength(1);
      expect(body.result.content[0].type).toBe('text');

      const toolResult = JSON.parse(body.result.content[0].text);
      expect(toolResult.sum).toBe(8);
      expect(body.result._meta.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should handle tool returning error', async () => {
      const request = createRequest('POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'failing_tool' },
      });
      const response = await server.handleRequest(request, mockEnv);
      const body = (await parseResponse(response)) as { error: { code: number; message: string } };

      expect(body.error.code).toBe(-32000);
      expect(body.error.message).toBe('This tool always fails');
    });

    it('should handle tool throwing exception', async () => {
      const request = createRequest('POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'throwing_tool' },
      });
      const response = await server.handleRequest(request, mockEnv);
      const body = (await parseResponse(response)) as { error: { code: number; message: string } };

      expect(body.error.code).toBe(-32000);
      expect(body.error.message).toContain('Unexpected error');
    });
  });

  describe('ping', () => {
    it('should respond to ping', async () => {
      const request = createRequest('POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
      });
      const response = await server.handleRequest(request, mockEnv);
      const body = (await parseResponse(response)) as { result: { pong: boolean } };

      expect(body.result.pong).toBe(true);
    });
  });
});
