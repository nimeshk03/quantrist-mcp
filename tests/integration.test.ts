/**
 * Integration Tests
 *
 * End-to-end tests for the MCP server via HTTP requests.
 * Tests the full request/response cycle including:
 * - MCP protocol handling
 * - All four risk tools
 * - Error handling
 * - CORS support
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Env } from '../src/types';
import { MCPServer } from '../src/mcp/server';
import {
  portfolioRiskToolDefinition,
  portfolioRiskHandler,
} from '../src/tools/portfolio_risk';
import {
  tickerRiskToolDefinition,
  tickerRiskHandler,
} from '../src/tools/ticker_risk';
import {
  stressTestToolDefinition,
  stressTestHandler,
} from '../src/tools/stress_test';
import {
  correlationRegimeToolDefinition,
  correlationRegimeHandler,
} from '../src/tools/correlation';

/**
 * Create a test MCP server instance
 */
function createTestServer(): MCPServer {
  return new MCPServer({
    name: 'quantrisk-mcp-test',
    version: '1.0.0',
    tools: [
      { ...portfolioRiskToolDefinition, handler: portfolioRiskHandler },
      { ...tickerRiskToolDefinition, handler: tickerRiskHandler },
      { ...stressTestToolDefinition, handler: stressTestHandler },
      { ...correlationRegimeToolDefinition, handler: correlationRegimeHandler },
    ],
  });
}

/**
 * Helper to create a JSON-RPC request
 */
function createRequest(
  method: string,
  params?: Record<string, unknown>,
  id: number | string = 1
): Request {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params,
  });

  return new Request('http://localhost:8787', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

/**
 * Helper to parse JSON-RPC response
 */
async function parseResponse(response: Response): Promise<{
  jsonrpc: string;
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}> {
  return response.json();
}

describe('Integration Tests', () => {
  let server: MCPServer;
  const env: Env = {};

  beforeAll(() => {
    server = createTestServer();
  });

  describe('MCP Protocol', () => {
    it('should handle initialize request', async () => {
      const request = createRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(1);
      expect(data.result).toBeDefined();
      expect(data.result).toHaveProperty('protocolVersion');
      expect(data.result).toHaveProperty('serverInfo');
      expect(data.result).toHaveProperty('capabilities');
    });

    it('should handle tools/list request', async () => {
      const request = createRequest('tools/list');

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.result).toBeDefined();
      expect(data.result).toHaveProperty('tools');

      const tools = (data.result as { tools: Array<{ name: string }> }).tools;
      expect(tools.length).toBeGreaterThanOrEqual(4);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('portfolio_risk');
      expect(toolNames).toContain('ticker_risk');
      expect(toolNames).toContain('stress_test');
      expect(toolNames).toContain('correlation_regime');
    });

    it('should return error for unknown method', async () => {
      const request = createRequest('unknown/method');

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.error).toBeDefined();
      expect(data.error!.code).toBe(-32601); // Method not found
    });

    it('should return error for malformed JSON', async () => {
      const request = new Request('http://localhost:8787', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{',
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.error).toBeDefined();
      expect(data.error!.code).toBe(-32700); // Parse error
    });

    it('should return error for invalid JSON-RPC structure', async () => {
      const request = new Request('http://localhost:8787', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foo: 'bar' }), // Missing jsonrpc, id, method
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.error).toBeDefined();
      expect(data.error!.code).toBe(-32600); // Invalid request
    });
  });

  describe('Health Endpoint', () => {
    it('should return healthy status', async () => {
      const request = new Request('http://localhost:8787/health', {
        method: 'GET',
      });

      const response = await server.handleRequest(request, env);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status', 'healthy');
      expect(data).toHaveProperty('server', 'quantrisk-mcp-test');
    });
  });

  describe('CORS Handling', () => {
    it('should handle OPTIONS preflight request', async () => {
      const request = new Request('http://localhost:8787', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://example.com',
          'Access-Control-Request-Method': 'POST',
        },
      });

      const response = await server.handleRequest(request, env);
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain(
        'POST'
      );
    });

    it('should include CORS headers in POST response', async () => {
      const request = createRequest('tools/list');

      const response = await server.handleRequest(request, env);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('Portfolio Risk Tool', () => {
    it('should calculate risk for valid portfolio', async () => {
      const request = createRequest('tools/call', {
        name: 'portfolio_risk',
        arguments: {
          holdings: { SPY: 0.6, TLT: 0.4 },
          simulations: 1000,
          useMockData: true,
        },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.error).toBeUndefined();
      expect(data.result).toBeDefined();

      const content = (data.result as { content: Array<{ text: string }> })
        .content;
      expect(content).toBeDefined();
      expect(content[0].text).toBeDefined();

      const result = JSON.parse(content[0].text);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.var95).toBeGreaterThanOrEqual(0);
      expect(result.metrics.var99).toBeGreaterThanOrEqual(0);
      expect(result.decision).toMatch(/^(PROCEED|REDUCE|VETO)$/);
    });

    it('should return error for invalid holdings', async () => {
      const request = createRequest('tools/call', {
        name: 'portfolio_risk',
        arguments: {
          holdings: { SPY: 0.5, TLT: 0.3 }, // Doesn't sum to 1
          useMockData: true,
        },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      // Tool errors are returned as JSON-RPC errors with code -32000
      expect(data.error).toBeDefined();
      expect(data.error!.code).toBe(-32000);
      expect(data.error!.message).toContain('sum to 1');
    });

    it('should return error for empty holdings', async () => {
      const request = createRequest('tools/call', {
        name: 'portfolio_risk',
        arguments: {
          holdings: {},
          useMockData: true,
        },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.error).toBeDefined();
      expect(data.error!.code).toBe(-32000);
      expect(data.error!.message).toContain('empty');
    });
  });

  describe('Ticker Risk Tool', () => {
    it('should analyze ticker risk', async () => {
      const request = createRequest('tools/call', {
        name: 'ticker_risk',
        arguments: {
          ticker: 'NVDA',
          proposedAllocation: 0.2,
          simulations: 500,
          useMockData: true,
        },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.error).toBeUndefined();
      const content = (data.result as { content: Array<{ text: string }> })
        .content;
      const result = JSON.parse(content[0].text);

      expect(result.ticker).toBe('NVDA');
      expect(result.beta).toBeDefined();
      expect(result.decision).toMatch(/^(PROCEED|REDUCE|VETO)$/);
    });

    it('should return error for invalid allocation', async () => {
      const request = createRequest('tools/call', {
        name: 'ticker_risk',
        arguments: {
          ticker: 'AAPL',
          proposedAllocation: 1.5, // Over 100%
          useMockData: true,
        },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.error).toBeDefined();
      expect(data.error!.code).toBe(-32000);
      expect(data.error!.message).toContain('proposedAllocation');
    });

    it('should return error for missing ticker', async () => {
      const request = createRequest('tools/call', {
        name: 'ticker_risk',
        arguments: {
          proposedAllocation: 0.2,
          useMockData: true,
        },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.error).toBeDefined();
      expect(data.error!.code).toBe(-32000);
      expect(data.error!.message).toContain('ticker');
    });
  });

  describe('Stress Test Tool', () => {
    it('should run stress test', async () => {
      const request = createRequest('tools/call', {
        name: 'stress_test',
        arguments: {
          holdings: { AAPL: 0.25, JPM: 0.25, GLD: 0.25, TLT: 0.25 },
          useMockData: true,
        },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.error).toBeUndefined();
      const content = (data.result as { content: Array<{ text: string }> })
        .content;
      const result = JSON.parse(content[0].text);

      expect(result.scenarios).toBeDefined();
      expect(result.scenarios.gfc_2008).toBeDefined();
      expect(result.scenarios.covid_2020).toBeDefined();
      expect(result.worstScenario).toBeDefined();
      expect(result.decision).toMatch(/^(PROCEED|REDUCE|VETO)$/);
    });

    it('should run specific scenarios', async () => {
      const request = createRequest('tools/call', {
        name: 'stress_test',
        arguments: {
          holdings: { SPY: 1.0 },
          scenarios: ['gfc_2008'],
          useMockData: true,
        },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      const content = (data.result as { content: Array<{ text: string }> })
        .content;
      const result = JSON.parse(content[0].text);

      expect(Object.keys(result.scenarios)).toHaveLength(1);
      expect(result.scenarios.gfc_2008).toBeDefined();
    });
  });

  describe('Correlation Regime Tool', () => {
    it('should analyze correlation regime', async () => {
      const request = createRequest('tools/call', {
        name: 'correlation_regime',
        arguments: {
          tickers: ['SPY', 'TLT', 'GLD'],
          useMockData: true,
        },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.error).toBeUndefined();
      const content = (data.result as { content: Array<{ text: string }> })
        .content;
      const result = JSON.parse(content[0].text);

      expect(result.currentRegime).toMatch(/^(normal|elevated|crisis)$/);
      expect(result.averageCorrelation).toBeDefined();
      expect(result.matrices).toBeDefined();
      expect(result.decision).toMatch(/^(PROCEED|REDUCE|VETO)$/);
    });

    it('should use default tickers when none provided', async () => {
      const request = createRequest('tools/call', {
        name: 'correlation_regime',
        arguments: {
          useMockData: true,
        },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      const content = (data.result as { content: Array<{ text: string }> })
        .content;
      const result = JSON.parse(content[0].text);

      expect(result.matrices.tickers.length).toBeGreaterThanOrEqual(2);
    });

    it('should return error for insufficient tickers', async () => {
      const request = createRequest('tools/call', {
        name: 'correlation_regime',
        arguments: {
          tickers: ['SPY'], // Need at least 2
          useMockData: true,
        },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.error).toBeDefined();
      expect(data.error!.code).toBe(-32000);
      expect(data.error!.message).toContain('2 tickers');
    });
  });

  describe('Unknown Tool', () => {
    it('should return error for unknown tool name', async () => {
      const request = createRequest('tools/call', {
        name: 'unknown_tool',
        arguments: {},
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.error).toBeDefined();
      expect(data.error!.code).toBe(-32602); // Invalid params
      expect(data.error!.message).toContain('unknown_tool');
    });
  });

  describe('Response Structure', () => {
    it('should return proper JSON-RPC response structure', async () => {
      const request = createRequest('tools/list', undefined, 42);

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(42);
      expect(data.result).toBeDefined();
      expect(data.error).toBeUndefined();
    });

    it('should preserve request ID in response', async () => {
      const request = createRequest('tools/list', undefined, 'custom-id-123');

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      expect(data.id).toBe('custom-id-123');
    });

    it('should return correct content type', async () => {
      const request = createRequest('tools/list');

      const response = await server.handleRequest(request, env);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('Edge Cases', () => {
    it('should handle unknown ticker gracefully', async () => {
      const request = createRequest('tools/call', {
        name: 'portfolio_risk',
        arguments: {
          holdings: { UNKNOWN_TICKER_XYZ: 1.0 },
          simulations: 500,
          useMockData: true,
        },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      // Should work with fallback profile
      const content = (data.result as { content: Array<{ text: string }> })
        .content;
      const result = JSON.parse(content[0].text);
      expect(result.metrics).toBeDefined();
    });

    it('should handle large portfolio', async () => {
      const holdings: Record<string, number> = {};
      const tickers = [
        'AAPL',
        'MSFT',
        'GOOGL',
        'AMZN',
        'NVDA',
        'JPM',
        'TLT',
        'GLD',
        'SPY',
        'BND',
      ];
      tickers.forEach((t) => (holdings[t] = 0.1));

      const request = createRequest('tools/call', {
        name: 'portfolio_risk',
        arguments: {
          holdings,
          simulations: 500,
          useMockData: true,
        },
      });

      const response = await server.handleRequest(request, env);
      const data = await parseResponse(response);

      const content = (data.result as { content: Array<{ text: string }> })
        .content;
      const result = JSON.parse(content[0].text);
      expect(result.portfolio.tickers).toHaveLength(10);
    });

    it('should handle concurrent requests', async () => {
      const requests = [
        createRequest('tools/call', {
          name: 'portfolio_risk',
          arguments: { holdings: { SPY: 1.0 }, simulations: 100, useMockData: true },
        }),
        createRequest('tools/call', {
          name: 'ticker_risk',
          arguments: { ticker: 'AAPL', proposedAllocation: 0.2, simulations: 100, useMockData: true },
        }),
        createRequest('tools/call', {
          name: 'stress_test',
          arguments: { holdings: { SPY: 1.0 }, useMockData: true },
        }),
      ];

      const responses = await Promise.all(
        requests.map((r) => server.handleRequest(r, env))
      );

      for (const response of responses) {
        expect(response.status).toBe(200);
        const data = await parseResponse(response);
        expect(data.error).toBeUndefined();
      }
    });
  });
});
