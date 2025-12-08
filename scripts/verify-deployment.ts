/**
 * Deployment Verification Script
 *
 * Verifies that the deployed Cloudflare Worker is working correctly.
 * Can be used to test both staging and production deployments.
 *
 * Usage:
 *   npx tsx scripts/verify-deployment.ts <worker-url>
 *   npx tsx scripts/verify-deployment.ts https://quantrisk-mcp.your-account.workers.dev
 */

interface VerificationResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration?: number;
  message?: string;
}

interface DeploymentReport {
  url: string;
  timestamp: string;
  results: VerificationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
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
 * Make an HTTP request with timeout
 */
async function makeRequest(
  url: string,
  options: RequestInit,
  timeoutMs: number = 30000
): Promise<{ response: Response; duration: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const start = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const duration = Date.now() - start;
    return { response, duration };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Verify health endpoint
 */
async function verifyHealth(baseUrl: string): Promise<VerificationResult> {
  try {
    const { response, duration } = await makeRequest(`${baseUrl}/health`, {
      method: 'GET',
    });
    const data = await response.json();

    if (data.status === 'healthy') {
      return {
        name: 'Health Check',
        status: 'PASS',
        duration,
        message: `Healthy, Version: ${data.version || 'unknown'}`,
      };
    }
    return {
      name: 'Health Check',
      status: 'FAIL',
      duration,
      message: `Unexpected status: ${data.status}`,
    };
  } catch (error) {
    return {
      name: 'Health Check',
      status: 'FAIL',
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify MCP initialize
 */
async function verifyInitialize(baseUrl: string): Promise<VerificationResult> {
  try {
    const body = createJsonRpcRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'verify-deployment', version: '1.0.0' },
    });

    const { response, duration } = await makeRequest(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await response.json();

    if (data.result?.protocolVersion) {
      return {
        name: 'MCP Initialize',
        status: 'PASS',
        duration,
        message: `Protocol: ${data.result.protocolVersion}`,
      };
    }
    return {
      name: 'MCP Initialize',
      status: 'FAIL',
      duration,
      message: 'Invalid response',
    };
  } catch (error) {
    return {
      name: 'MCP Initialize',
      status: 'FAIL',
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify tools list
 */
async function verifyToolsList(baseUrl: string): Promise<VerificationResult> {
  try {
    const body = createJsonRpcRequest('tools/list');

    const { response, duration } = await makeRequest(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await response.json();

    const tools = data.result?.tools;
    if (Array.isArray(tools) && tools.length >= 4) {
      const toolNames = tools.map((t: { name: string }) => t.name).join(', ');
      return {
        name: 'Tools List',
        status: 'PASS',
        duration,
        message: `${tools.length} tools: ${toolNames}`,
      };
    }
    return {
      name: 'Tools List',
      status: 'FAIL',
      duration,
      message: `Expected 4+ tools, got ${tools?.length || 0}`,
    };
  } catch (error) {
    return {
      name: 'Tools List',
      status: 'FAIL',
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify portfolio_risk tool
 */
async function verifyPortfolioRisk(
  baseUrl: string
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

    const { response, duration } = await makeRequest(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await response.json();

    const content = data.result?.content?.[0]?.text;
    if (content) {
      const result = JSON.parse(content);
      if (result.metrics?.var95 !== undefined) {
        const latencyOk = duration < 3000;
        return {
          name: 'Portfolio Risk',
          status: latencyOk ? 'PASS' : 'FAIL',
          duration,
          message: latencyOk
            ? `VaR95: ${(result.metrics.var95 * 100).toFixed(2)}%`
            : `Latency ${duration}ms exceeds 3s target`,
        };
      }
    }
    return {
      name: 'Portfolio Risk',
      status: 'FAIL',
      duration,
      message: 'Invalid response structure',
    };
  } catch (error) {
    return {
      name: 'Portfolio Risk',
      status: 'FAIL',
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify ticker_risk tool
 */
async function verifyTickerRisk(baseUrl: string): Promise<VerificationResult> {
  try {
    const body = createJsonRpcRequest('tools/call', {
      name: 'ticker_risk',
      arguments: {
        ticker: 'AAPL',
        proposedAllocation: 0.1,
        useMockData: true,
      },
    });

    const { response, duration } = await makeRequest(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await response.json();

    const content = data.result?.content?.[0]?.text;
    if (content) {
      const result = JSON.parse(content);
      if (result.ticker && result.decision) {
        return {
          name: 'Ticker Risk',
          status: 'PASS',
          duration,
          message: `${result.ticker}: ${result.decision}`,
        };
      }
    }
    return {
      name: 'Ticker Risk',
      status: 'FAIL',
      duration,
      message: 'Invalid response structure',
    };
  } catch (error) {
    return {
      name: 'Ticker Risk',
      status: 'FAIL',
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify stress_test tool
 */
async function verifyStressTest(baseUrl: string): Promise<VerificationResult> {
  try {
    const body = createJsonRpcRequest('tools/call', {
      name: 'stress_test',
      arguments: {
        holdings: { SPY: 0.5, TLT: 0.3, GLD: 0.2 },
        useMockData: true,
      },
    });

    const { response, duration } = await makeRequest(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await response.json();

    const content = data.result?.content?.[0]?.text;
    if (content) {
      const result = JSON.parse(content);
      if (result.scenarios && result.worstScenario) {
        const count = Object.keys(result.scenarios).length;
        return {
          name: 'Stress Test',
          status: 'PASS',
          duration,
          message: `${count} scenarios, worst: ${result.worstScenario.name}`,
        };
      }
    }
    return {
      name: 'Stress Test',
      status: 'FAIL',
      duration,
      message: 'Invalid response structure',
    };
  } catch (error) {
    return {
      name: 'Stress Test',
      status: 'FAIL',
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify correlation_regime tool
 */
async function verifyCorrelationRegime(
  baseUrl: string
): Promise<VerificationResult> {
  try {
    const body = createJsonRpcRequest('tools/call', {
      name: 'correlation_regime',
      arguments: {
        tickers: ['SPY', 'TLT', 'GLD'],
        useMockData: true,
      },
    });

    const { response, duration } = await makeRequest(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await response.json();

    const content = data.result?.content?.[0]?.text;
    if (content) {
      const result = JSON.parse(content);
      if (result.currentRegime) {
        return {
          name: 'Correlation Regime',
          status: 'PASS',
          duration,
          message: `Regime: ${result.currentRegime}`,
        };
      }
    }
    return {
      name: 'Correlation Regime',
      status: 'FAIL',
      duration,
      message: 'Invalid response structure',
    };
  } catch (error) {
    return {
      name: 'Correlation Regime',
      status: 'FAIL',
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Run all verifications
 */
async function verifyDeployment(baseUrl: string): Promise<DeploymentReport> {
  console.log('Deployment Verification');
  console.log('=======================');
  console.log(`URL: ${baseUrl}`);
  console.log('');

  const results: VerificationResult[] = [];

  const checks = [
    { name: 'Health', fn: verifyHealth },
    { name: 'Initialize', fn: verifyInitialize },
    { name: 'Tools List', fn: verifyToolsList },
    { name: 'Portfolio Risk', fn: verifyPortfolioRisk },
    { name: 'Ticker Risk', fn: verifyTickerRisk },
    { name: 'Stress Test', fn: verifyStressTest },
    { name: 'Correlation Regime', fn: verifyCorrelationRegime },
  ];

  for (const { name, fn } of checks) {
    process.stdout.write(`Testing ${name}... `);
    const result = await fn(baseUrl);
    results.push(result);

    const icon = result.status === 'PASS' ? '[OK]' : '[X]';
    const latency = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`${icon} ${result.message}${latency}`);
  }

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: results.filter((r) => r.status === 'FAIL').length,
  };

  return {
    url: baseUrl,
    timestamp: new Date().toISOString(),
    results,
    summary,
    overallStatus: summary.failed === 0 ? 'PASS' : 'FAIL',
  };
}

/**
 * Print summary report
 */
function printReport(report: DeploymentReport): void {
  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`Total: ${report.summary.total}`);
  console.log(`Passed: ${report.summary.passed}`);
  console.log(`Failed: ${report.summary.failed}`);
  console.log('');

  // Latency table
  const withLatency = report.results.filter((r) => r.duration !== undefined);
  if (withLatency.length > 0) {
    console.log('Latency');
    console.log('-------');
    for (const r of withLatency) {
      const status = r.duration! < 3000 ? 'OK' : 'SLOW';
      console.log(`  ${r.name}: ${r.duration}ms [${status}]`);
    }
    console.log('');
  }

  console.log('-------------------');
  console.log(`Overall: ${report.overallStatus}`);
  console.log(`Timestamp: ${report.timestamp}`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/verify-deployment.ts <worker-url>');
    console.error('Example: npx tsx scripts/verify-deployment.ts https://quantrisk-mcp.your-account.workers.dev');
    process.exit(1);
  }

  const url = args[0];

  try {
    const report = await verifyDeployment(url);
    printReport(report);
    process.exit(report.overallStatus === 'PASS' ? 0 : 1);
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  }
}

// Export for testing
export { verifyDeployment, DeploymentReport };

// Run if executed directly
if (process.argv[1]?.includes('verify-deployment')) {
  main();
}
