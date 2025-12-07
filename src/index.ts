/**
 * QuantRisk MCP Server
 * Quantitative Risk Analysis via Model Context Protocol
 *
 * Entry point for Cloudflare Workers
 */

import { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Placeholder - will be replaced with MCPServer in Milestone 1.2
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'healthy',
          version: '1.0.0',
          tools: [],
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Default response for MCP endpoint
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32601,
          message: 'MCP server not yet implemented. See Milestone 1.2.',
        },
      }),
      {
        status: 501,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  },
};
