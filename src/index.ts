/**
 * QuantRisk MCP Server
 * Quantitative Risk Analysis via Model Context Protocol
 *
 * Entry point for Cloudflare Workers
 */

import { Env } from './types';
import { MCPServer } from './mcp/server';
import {
  portfolioRiskToolDefinition,
  portfolioRiskHandler,
} from './tools/portfolio_risk';
import {
  tickerRiskToolDefinition,
  tickerRiskHandler,
} from './tools/ticker_risk';

/**
 * Create and configure the MCP server
 */
const mcpServer = new MCPServer({
  name: 'quantrisk-mcp',
  version: '1.0.0',
  tools: [
    // Portfolio Risk Tool - Main risk analysis
    {
      ...portfolioRiskToolDefinition,
      handler: portfolioRiskHandler,
    },

    // Ticker Risk Tool - Single ticker analysis
    {
      ...tickerRiskToolDefinition,
      handler: tickerRiskHandler,
    },

    // Echo tool for testing MCP protocol
    {
      name: 'echo',
      description: 'Echo back the input for testing. Returns the input message.',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Message to echo back',
          },
        },
        required: ['message'],
      },
      handler: async (input) => {
        const { message } = input as { message?: string };
        if (!message) {
          return { error: 'Missing required parameter: message' };
        }
        return {
          result: {
            echo: message,
            timestamp: new Date().toISOString(),
          },
        };
      },
    },
  ],
});

/**
 * Cloudflare Workers entry point
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return mcpServer.handleRequest(request, env);
  },
};
