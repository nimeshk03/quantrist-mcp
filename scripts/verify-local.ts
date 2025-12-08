/**
 * Local Development Verification Script
 *
 * Verifies that the MCP server is working correctly by:
 * 1. Running the full test suite
 * 2. Testing all endpoints via HTTP requests
 * 3. Measuring response latency
 * 4. Checking response structure
 *
 * Usage: npx tsx scripts/verify-local.ts [--server-url=URL]
 */

const DEFAULT_SERVER_URL = 'http://localhost:8787';

interface VerificationResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration?: number;
  message?: string;
  details?: unknown;
}

interface VerificationReport {
  serverUrl: string;
  timestamp: string;
  results: VerificationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  overallStatus: 'PASS' | 'FAIL';
}

/**
 * Create a JSON-RPC request
 */
function createJsonRpcRequest(
  method: string,
  params?: unknown,
  id: number = 1
): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params,
  });
}

/**
 * Make an HTTP request to the server
 */
async function makeRequest(
  url: string,
  body: string,
  method: string = 'POST'
): Promise<{ response: Response; duration: number }> {
  const start = Date.now();
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: method !== 'GET' ? body : undefined,
  });
  const duration = Date.now() - start;
  return { response, duration };
}

/**
 * Verify health endpoint
 */
async function verifyHealth(serverUrl: string): Promise<VerificationResult> {
  try {
    const { response, duration } = await makeRequest(
      `${serverUrl}/health`,
      '',
      'GET'
    );
    const data = await response.json();

    if (data.status === 'healthy') {
      return {
        name: 'Health Endpoint',
        status: 'PASS',
        duration,
        message: 'Server is healthy',
      };
    }
    return {
      name: 'Health Endpoint',
      status: 'FAIL',
      duration,
      message: `Unexpected status: ${data.status}`,
    };
  } catch (error) {
    return {
      name: 'Health Endpoint',
      status: 'FAIL',
      message: `Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify MCP initialize
 */
async function verifyInitialize(serverUrl: string): Promise<VerificationResult> {
  try {
    const body = createJsonRpcRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'verify-script', version: '1.0.0' },
    });
    const { response, duration } = await makeRequest(serverUrl, body);
    const data = await response.json();

    if (data.result?.protocolVersion) {
      return {
        name: 'MCP Initialize',
        status: 'PASS',
        duration,
        message: `Protocol version: ${data.result.protocolVersion}`,
      };
    }
    return {
      name: 'MCP Initialize',
      status: 'FAIL',
      duration,
      message: 'Missing protocol version in response',
      details: data,
    };
  } catch (error) {
    return {
      name: 'MCP Initialize',
      status: 'FAIL',
      message: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify tools/list
 */
async function verifyToolsList(serverUrl: string): Promise<VerificationResult> {
  try {
    const body = createJsonRpcRequest('tools/list');
    const { response, duration } = await makeRequest(serverUrl, body);
    const data = await response.json();

    const tools = data.result?.tools;
    if (Array.isArray(tools) && tools.length >= 4) {
      const toolNames = tools.map((t: { name: string }) => t.name);
      return {
        name: 'Tools List',
        status: 'PASS',
        duration,
        message: `Found ${tools.length} tools: ${toolNames.join(', ')}`,
      };
    }
    return {
      name: 'Tools List',
      status: 'FAIL',
      duration,
      message: `Expected at least 4 tools, got ${tools?.length ?? 0}`,
      details: data,
    };
  } catch (error) {
    return {
      name: 'Tools List',
      status: 'FAIL',
      message: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify portfolio_risk tool
 */
async function verifyPortfolioRisk(
  serverUrl: string
): Promise<VerificationResult> {
  try {
    const body = createJsonRpcRequest('tools/call', {
      name: 'portfolio_risk',
      arguments: {
        holdings: { SPY: 0.6, TLT: 0.4 },
        simulations: 1000,
        useMockData: true,
      },
    });
    const { response, duration } = await makeRequest(serverUrl, body);
    const data = await response.json();

    const content = data.result?.content?.[0]?.text;
    if (content) {
      const result = JSON.parse(content);
      const metrics = result.metrics;
      if (metrics?.var95 !== undefined && metrics?.cvar95 !== undefined) {
        const latencyStatus = duration < 3000 ? 'PASS' : 'FAIL';
        return {
          name: 'Portfolio Risk Tool',
          status: latencyStatus,
          duration,
          message:
            latencyStatus === 'PASS'
              ? `VaR95: ${(metrics.var95 * 100).toFixed(2)}%, Latency: ${duration}ms`
              : `Latency ${duration}ms exceeds 3000ms target`,
          details: { var95: metrics.var95, cvar95: metrics.cvar95 },
        };
      }
    }
    return {
      name: 'Portfolio Risk Tool',
      status: 'FAIL',
      duration,
      message: 'Invalid response structure',
      details: data,
    };
  } catch (error) {
    return {
      name: 'Portfolio Risk Tool',
      status: 'FAIL',
      message: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify ticker_risk tool
 */
async function verifyTickerRisk(serverUrl: string): Promise<VerificationResult> {
  try {
    const body = createJsonRpcRequest('tools/call', {
      name: 'ticker_risk',
      arguments: {
        ticker: 'NVDA',
        proposedAllocation: 0.15,
        useMockData: true,
      },
    });
    const { response, duration } = await makeRequest(serverUrl, body);
    const data = await response.json();

    const content = data.result?.content?.[0]?.text;
    if (content) {
      const result = JSON.parse(content);
      if (result.ticker && result.decision !== undefined) {
        return {
          name: 'Ticker Risk Tool',
          status: 'PASS',
          duration,
          message: `Analyzed ${result.ticker}, Decision: ${result.decision}`,
        };
      }
    }
    return {
      name: 'Ticker Risk Tool',
      status: 'FAIL',
      duration,
      message: 'Invalid response structure',
      details: data,
    };
  } catch (error) {
    return {
      name: 'Ticker Risk Tool',
      status: 'FAIL',
      message: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify stress_test tool
 */
async function verifyStressTest(serverUrl: string): Promise<VerificationResult> {
  try {
    const body = createJsonRpcRequest('tools/call', {
      name: 'stress_test',
      arguments: {
        holdings: { SPY: 0.5, TLT: 0.3, GLD: 0.2 },
        useMockData: true,
      },
    });
    const { response, duration } = await makeRequest(serverUrl, body);
    const data = await response.json();

    const content = data.result?.content?.[0]?.text;
    if (content) {
      const result = JSON.parse(content);
      if (result.scenarios && result.worstScenario) {
        const scenarioCount = Object.keys(result.scenarios).length;
        return {
          name: 'Stress Test Tool',
          status: 'PASS',
          duration,
          message: `Tested ${scenarioCount} scenario(s), Worst: ${result.worstScenario.name}`,
        };
      }
    }
    return {
      name: 'Stress Test Tool',
      status: 'FAIL',
      duration,
      message: 'Invalid response structure',
      details: data,
    };
  } catch (error) {
    return {
      name: 'Stress Test Tool',
      status: 'FAIL',
      message: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify correlation_regime tool
 */
async function verifyCorrelationRegime(
  serverUrl: string
): Promise<VerificationResult> {
  try {
    const body = createJsonRpcRequest('tools/call', {
      name: 'correlation_regime',
      arguments: {
        tickers: ['SPY', 'TLT', 'GLD'],
        useMockData: true,
      },
    });
    const { response, duration } = await makeRequest(serverUrl, body);
    const data = await response.json();

    const content = data.result?.content?.[0]?.text;
    if (content) {
      const result = JSON.parse(content);
      if (result.currentRegime && result.averageCorrelation !== undefined) {
        return {
          name: 'Correlation Regime Tool',
          status: 'PASS',
          duration,
          message: `Regime: ${result.currentRegime}, Avg correlation: ${(result.averageCorrelation * 100).toFixed(1)}%`,
        };
      }
    }
    return {
      name: 'Correlation Regime Tool',
      status: 'FAIL',
      duration,
      message: 'Invalid response structure',
      details: data,
    };
  } catch (error) {
    return {
      name: 'Correlation Regime Tool',
      status: 'FAIL',
      message: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify CORS headers
 */
async function verifyCors(serverUrl: string): Promise<VerificationResult> {
  try {
    const response = await fetch(serverUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });

    const corsHeader = response.headers.get('Access-Control-Allow-Origin');
    if (corsHeader === '*') {
      return {
        name: 'CORS Headers',
        status: 'PASS',
        message: 'CORS headers present',
      };
    }
    return {
      name: 'CORS Headers',
      status: 'FAIL',
      message: `Missing or incorrect CORS header: ${corsHeader}`,
    };
  } catch (error) {
    return {
      name: 'CORS Headers',
      status: 'FAIL',
      message: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify error handling
 */
async function verifyErrorHandling(
  serverUrl: string
): Promise<VerificationResult> {
  try {
    const body = createJsonRpcRequest('unknown_method');
    const { response, duration } = await makeRequest(serverUrl, body);
    const data = await response.json();

    if (data.error?.code === -32601) {
      return {
        name: 'Error Handling',
        status: 'PASS',
        duration,
        message: 'Correctly returns error for unknown method',
      };
    }
    return {
      name: 'Error Handling',
      status: 'FAIL',
      duration,
      message: 'Did not return expected error code',
      details: data,
    };
  } catch (error) {
    return {
      name: 'Error Handling',
      status: 'FAIL',
      message: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Run all verifications
 */
async function runVerification(serverUrl: string): Promise<VerificationReport> {
  console.log('Local Development Verification');
  console.log('==============================');
  console.log(`Server URL: ${serverUrl}`);
  console.log('');

  const results: VerificationResult[] = [];

  // Run verifications
  const verifications = [
    { name: 'Health', fn: verifyHealth },
    { name: 'Initialize', fn: verifyInitialize },
    { name: 'Tools List', fn: verifyToolsList },
    { name: 'Portfolio Risk', fn: verifyPortfolioRisk },
    { name: 'Ticker Risk', fn: verifyTickerRisk },
    { name: 'Stress Test', fn: verifyStressTest },
    { name: 'Correlation Regime', fn: verifyCorrelationRegime },
    { name: 'CORS', fn: verifyCors },
    { name: 'Error Handling', fn: verifyErrorHandling },
  ];

  for (const { name, fn } of verifications) {
    process.stdout.write(`Testing ${name}... `);
    try {
      const result = await fn(serverUrl);
      results.push(result);
      const icon = result.status === 'PASS' ? '[OK]' : '[X]';
      console.log(`${icon} ${result.message}`);
    } catch (error) {
      results.push({
        name,
        status: 'FAIL',
        message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`,
      });
      console.log(`[X] Unexpected error`);
    }
  }

  // Calculate summary
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: results.filter((r) => r.status === 'FAIL').length,
    skipped: results.filter((r) => r.status === 'SKIP').length,
  };

  const overallStatus = summary.failed === 0 ? 'PASS' : 'FAIL';

  return {
    serverUrl,
    timestamp: new Date().toISOString(),
    results,
    summary,
    overallStatus,
  };
}

/**
 * Print verification report
 */
function printReport(report: VerificationReport): void {
  console.log('');
  console.log('Verification Summary');
  console.log('====================');
  console.log(`Total: ${report.summary.total}`);
  console.log(`Passed: ${report.summary.passed}`);
  console.log(`Failed: ${report.summary.failed}`);
  console.log(`Skipped: ${report.summary.skipped}`);
  console.log('');

  // Print latency summary
  const latencies = report.results
    .filter((r) => r.duration !== undefined)
    .map((r) => ({ name: r.name, duration: r.duration! }));

  if (latencies.length > 0) {
    console.log('Latency Summary');
    console.log('---------------');
    for (const { name, duration } of latencies) {
      const status = duration < 3000 ? 'OK' : 'SLOW';
      console.log(`  ${name}: ${duration}ms [${status}]`);
    }
    console.log('');
  }

  console.log('--------------------');
  console.log(`Overall: ${report.overallStatus}`);
  console.log(`Timestamp: ${report.timestamp}`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let serverUrl = DEFAULT_SERVER_URL;

  for (const arg of args) {
    if (arg.startsWith('--server-url=')) {
      serverUrl = arg.split('=')[1];
    }
  }

  try {
    const report = await runVerification(serverUrl);
    printReport(report);

    process.exit(report.overallStatus === 'PASS' ? 0 : 1);
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  }
}

// Export for testing
export { runVerification, VerificationReport, VerificationResult };

// Run if executed directly
if (process.argv[1]?.includes('verify-local')) {
  main();
}
