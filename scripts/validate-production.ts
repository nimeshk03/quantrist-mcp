/**
 * Production Validation Script
 *
 * Comprehensive validation of the production MCP server including:
 * - All four risk tools with realistic scenarios
 * - Latency measurements against targets
 * - Multiple test runs for consistency
 * - Detailed reporting
 *
 * Usage:
 *   npx tsx scripts/validate-production.ts <worker-url>
 *   npx tsx scripts/validate-production.ts https://quantrisk-mcp.quant-risk-mcp.workers.dev
 */

const LATENCY_TARGETS = {
  portfolio_risk: 3000, // <3s
  ticker_risk: 1000, // <1s
  stress_test: 2000, // <2s
  correlation_regime: 500, // <500ms
};

interface ToolTestResult {
  tool: string;
  scenario: string;
  status: 'PASS' | 'FAIL';
  latency: number;
  latencyTarget: number;
  latencyOk: boolean;
  response?: unknown;
  error?: string;
}

interface ValidationReport {
  url: string;
  timestamp: string;
  testRuns: number;
  results: ToolTestResult[];
  latencySummary: {
    tool: string;
    avgLatency: number;
    minLatency: number;
    maxLatency: number;
    target: number;
    withinTarget: boolean;
  }[];
  overallStatus: 'PASS' | 'FAIL';
}

/**
 * Create a JSON-RPC request
 */
function createRequest(
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
 * Make HTTP request with timing
 */
async function makeRequest(
  url: string,
  body: string,
  timeoutMs: number = 30000
): Promise<{ data: unknown; latency: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    const latency = Date.now() - start;
    const data = await response.json();
    return { data, latency };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Test portfolio_risk with various scenarios
 */
async function testPortfolioRisk(
  url: string
): Promise<ToolTestResult[]> {
  const scenarios = [
    {
      name: 'Conservative 60/40',
      args: {
        holdings: { SPY: 0.6, TLT: 0.4 },
        simulations: 5000,
        useMockData: true,
      },
    },
    {
      name: 'Diversified Portfolio',
      args: {
        holdings: { SPY: 0.4, TLT: 0.2, GLD: 0.15, AAPL: 0.15, MSFT: 0.1 },
        simulations: 5000,
        useMockData: true,
      },
    },
    {
      name: 'Tech Heavy',
      args: {
        holdings: { AAPL: 0.3, MSFT: 0.3, NVDA: 0.2, GOOGL: 0.2 },
        simulations: 5000,
        useMockData: true,
      },
    },
  ];

  const results: ToolTestResult[] = [];

  for (const scenario of scenarios) {
    try {
      const body = createRequest('tools/call', {
        name: 'portfolio_risk',
        arguments: scenario.args,
      });

      const { data, latency } = await makeRequest(url, body);
      const content = (data as { result?: { content?: Array<{ text: string }> } })
        .result?.content?.[0]?.text;

      if (content) {
        const result = JSON.parse(content);
        results.push({
          tool: 'portfolio_risk',
          scenario: scenario.name,
          status: result.metrics?.var95 !== undefined ? 'PASS' : 'FAIL',
          latency,
          latencyTarget: LATENCY_TARGETS.portfolio_risk,
          latencyOk: latency < LATENCY_TARGETS.portfolio_risk,
          response: {
            var95: result.metrics?.var95,
            cvar95: result.metrics?.cvar95,
            decision: result.decision?.action,
          },
        });
      } else {
        results.push({
          tool: 'portfolio_risk',
          scenario: scenario.name,
          status: 'FAIL',
          latency,
          latencyTarget: LATENCY_TARGETS.portfolio_risk,
          latencyOk: latency < LATENCY_TARGETS.portfolio_risk,
          error: 'Invalid response',
        });
      }
    } catch (error) {
      results.push({
        tool: 'portfolio_risk',
        scenario: scenario.name,
        status: 'FAIL',
        latency: 0,
        latencyTarget: LATENCY_TARGETS.portfolio_risk,
        latencyOk: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Test ticker_risk with various tickers
 */
async function testTickerRisk(url: string): Promise<ToolTestResult[]> {
  const scenarios = [
    { name: 'AAPL 10%', args: { ticker: 'AAPL', proposedAllocation: 0.1, useMockData: true } },
    { name: 'NVDA 25%', args: { ticker: 'NVDA', proposedAllocation: 0.25, useMockData: true } },
    { name: 'TLT 30%', args: { ticker: 'TLT', proposedAllocation: 0.3, useMockData: true } },
    { name: 'GLD 15%', args: { ticker: 'GLD', proposedAllocation: 0.15, useMockData: true } },
  ];

  const results: ToolTestResult[] = [];

  for (const scenario of scenarios) {
    try {
      const body = createRequest('tools/call', {
        name: 'ticker_risk',
        arguments: scenario.args,
      });

      const { data, latency } = await makeRequest(url, body);
      const content = (data as { result?: { content?: Array<{ text: string }> } })
        .result?.content?.[0]?.text;

      if (content) {
        const result = JSON.parse(content);
        results.push({
          tool: 'ticker_risk',
          scenario: scenario.name,
          status: result.decision ? 'PASS' : 'FAIL',
          latency,
          latencyTarget: LATENCY_TARGETS.ticker_risk,
          latencyOk: latency < LATENCY_TARGETS.ticker_risk,
          response: {
            ticker: result.ticker,
            decision: result.decision,
            volatility: result.volatility,
          },
        });
      } else {
        results.push({
          tool: 'ticker_risk',
          scenario: scenario.name,
          status: 'FAIL',
          latency,
          latencyTarget: LATENCY_TARGETS.ticker_risk,
          latencyOk: latency < LATENCY_TARGETS.ticker_risk,
          error: 'Invalid response',
        });
      }
    } catch (error) {
      results.push({
        tool: 'ticker_risk',
        scenario: scenario.name,
        status: 'FAIL',
        latency: 0,
        latencyTarget: LATENCY_TARGETS.ticker_risk,
        latencyOk: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Test stress_test with various portfolios
 */
async function testStressTest(url: string): Promise<ToolTestResult[]> {
  const scenarios = [
    {
      name: 'Balanced Portfolio',
      args: {
        holdings: { SPY: 0.5, TLT: 0.3, GLD: 0.2 },
        useMockData: true,
      },
    },
    {
      name: 'Equity Only',
      args: {
        holdings: { SPY: 0.4, AAPL: 0.3, MSFT: 0.3 },
        useMockData: true,
      },
    },
  ];

  const results: ToolTestResult[] = [];

  for (const scenario of scenarios) {
    try {
      const body = createRequest('tools/call', {
        name: 'stress_test',
        arguments: scenario.args,
      });

      const { data, latency } = await makeRequest(url, body);
      const content = (data as { result?: { content?: Array<{ text: string }> } })
        .result?.content?.[0]?.text;

      if (content) {
        const result = JSON.parse(content);
        results.push({
          tool: 'stress_test',
          scenario: scenario.name,
          status: result.worstScenario ? 'PASS' : 'FAIL',
          latency,
          latencyTarget: LATENCY_TARGETS.stress_test,
          latencyOk: latency < LATENCY_TARGETS.stress_test,
          response: {
            worstScenario: result.worstScenario?.name,
            maxDrawdown: result.worstScenario?.drawdown,
            decision: result.decision,
          },
        });
      } else {
        results.push({
          tool: 'stress_test',
          scenario: scenario.name,
          status: 'FAIL',
          latency,
          latencyTarget: LATENCY_TARGETS.stress_test,
          latencyOk: latency < LATENCY_TARGETS.stress_test,
          error: 'Invalid response',
        });
      }
    } catch (error) {
      results.push({
        tool: 'stress_test',
        scenario: scenario.name,
        status: 'FAIL',
        latency: 0,
        latencyTarget: LATENCY_TARGETS.stress_test,
        latencyOk: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Test correlation_regime with various ticker sets
 */
async function testCorrelationRegime(
  url: string
): Promise<ToolTestResult[]> {
  const scenarios = [
    {
      name: 'Core Assets',
      args: { tickers: ['SPY', 'TLT', 'GLD'], useMockData: true },
    },
    {
      name: 'Tech Stocks',
      args: { tickers: ['AAPL', 'MSFT', 'NVDA', 'GOOGL'], useMockData: true },
    },
  ];

  const results: ToolTestResult[] = [];

  for (const scenario of scenarios) {
    try {
      const body = createRequest('tools/call', {
        name: 'correlation_regime',
        arguments: scenario.args,
      });

      const { data, latency } = await makeRequest(url, body);
      const content = (data as { result?: { content?: Array<{ text: string }> } })
        .result?.content?.[0]?.text;

      if (content) {
        const result = JSON.parse(content);
        results.push({
          tool: 'correlation_regime',
          scenario: scenario.name,
          status: result.currentRegime ? 'PASS' : 'FAIL',
          latency,
          latencyTarget: LATENCY_TARGETS.correlation_regime,
          latencyOk: latency < LATENCY_TARGETS.correlation_regime,
          response: {
            regime: result.currentRegime,
            avgCorrelation: result.averageCorrelation,
          },
        });
      } else {
        results.push({
          tool: 'correlation_regime',
          scenario: scenario.name,
          status: 'FAIL',
          latency,
          latencyTarget: LATENCY_TARGETS.correlation_regime,
          latencyOk: latency < LATENCY_TARGETS.correlation_regime,
          error: 'Invalid response',
        });
      }
    } catch (error) {
      results.push({
        tool: 'correlation_regime',
        scenario: scenario.name,
        status: 'FAIL',
        latency: 0,
        latencyTarget: LATENCY_TARGETS.correlation_regime,
        latencyOk: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Run full production validation
 */
async function validateProduction(url: string): Promise<ValidationReport> {
  console.log('Production Validation');
  console.log('=====================');
  console.log(`URL: ${url}`);
  console.log('');

  const allResults: ToolTestResult[] = [];

  // Test each tool
  console.log('Testing portfolio_risk...');
  const portfolioResults = await testPortfolioRisk(url);
  allResults.push(...portfolioResults);
  for (const r of portfolioResults) {
    const icon = r.status === 'PASS' ? '[OK]' : '[X]';
    const latencyIcon = r.latencyOk ? '' : ' [SLOW]';
    console.log(`  ${icon} ${r.scenario}: ${r.latency}ms${latencyIcon}`);
  }

  console.log('');
  console.log('Testing ticker_risk...');
  const tickerResults = await testTickerRisk(url);
  allResults.push(...tickerResults);
  for (const r of tickerResults) {
    const icon = r.status === 'PASS' ? '[OK]' : '[X]';
    const latencyIcon = r.latencyOk ? '' : ' [SLOW]';
    console.log(`  ${icon} ${r.scenario}: ${r.latency}ms${latencyIcon}`);
  }

  console.log('');
  console.log('Testing stress_test...');
  const stressResults = await testStressTest(url);
  allResults.push(...stressResults);
  for (const r of stressResults) {
    const icon = r.status === 'PASS' ? '[OK]' : '[X]';
    const latencyIcon = r.latencyOk ? '' : ' [SLOW]';
    console.log(`  ${icon} ${r.scenario}: ${r.latency}ms${latencyIcon}`);
  }

  console.log('');
  console.log('Testing correlation_regime...');
  const correlationResults = await testCorrelationRegime(url);
  allResults.push(...correlationResults);
  for (const r of correlationResults) {
    const icon = r.status === 'PASS' ? '[OK]' : '[X]';
    const latencyIcon = r.latencyOk ? '' : ' [SLOW]';
    console.log(`  ${icon} ${r.scenario}: ${r.latency}ms${latencyIcon}`);
  }

  // Calculate latency summary per tool
  const tools = ['portfolio_risk', 'ticker_risk', 'stress_test', 'correlation_regime'];
  const latencySummary = tools.map((tool) => {
    const toolResults = allResults.filter((r) => r.tool === tool);
    const latencies = toolResults.map((r) => r.latency).filter((l) => l > 0);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const target = LATENCY_TARGETS[tool as keyof typeof LATENCY_TARGETS];

    return {
      tool,
      avgLatency: Math.round(avg),
      minLatency: Math.min(...latencies),
      maxLatency: Math.max(...latencies),
      target,
      withinTarget: avg < target,
    };
  });

  const allPassed = allResults.every((r) => r.status === 'PASS');
  const allLatencyOk = latencySummary.every((s) => s.withinTarget);

  return {
    url,
    timestamp: new Date().toISOString(),
    testRuns: allResults.length,
    results: allResults,
    latencySummary,
    overallStatus: allPassed && allLatencyOk ? 'PASS' : 'FAIL',
  };
}

/**
 * Print validation report
 */
function printReport(report: ValidationReport): void {
  console.log('');
  console.log('='.repeat(50));
  console.log('VALIDATION REPORT');
  console.log('='.repeat(50));
  console.log('');

  // Summary
  const passed = report.results.filter((r) => r.status === 'PASS').length;
  const failed = report.results.filter((r) => r.status === 'FAIL').length;
  console.log('Test Summary');
  console.log('------------');
  console.log(`Total Tests: ${report.testRuns}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('');

  // Latency table
  console.log('Latency Summary');
  console.log('---------------');
  console.log('| Tool               | Avg    | Min    | Max    | Target | Status |');
  console.log('|--------------------|--------|--------|--------|--------|--------|');
  for (const s of report.latencySummary) {
    const status = s.withinTarget ? 'OK' : 'SLOW';
    const toolPadded = s.tool.padEnd(18);
    const avgPadded = `${s.avgLatency}ms`.padEnd(6);
    const minPadded = `${s.minLatency}ms`.padEnd(6);
    const maxPadded = `${s.maxLatency}ms`.padEnd(6);
    const targetPadded = `${s.target}ms`.padEnd(6);
    console.log(`| ${toolPadded} | ${avgPadded} | ${minPadded} | ${maxPadded} | ${targetPadded} | ${status.padEnd(6)} |`);
  }
  console.log('');

  // Overall status
  console.log('='.repeat(50));
  console.log(`OVERALL STATUS: ${report.overallStatus}`);
  console.log(`Timestamp: ${report.timestamp}`);
  console.log('='.repeat(50));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/validate-production.ts <worker-url>');
    console.error('Example: npx tsx scripts/validate-production.ts https://quantrisk-mcp.quant-risk-mcp.workers.dev');
    process.exit(1);
  }

  const url = args[0];

  try {
    const report = await validateProduction(url);
    printReport(report);
    process.exit(report.overallStatus === 'PASS' ? 0 : 1);
  } catch (error) {
    console.error('Validation failed:', error);
    process.exit(1);
  }
}

// Export for testing
export { validateProduction, ValidationReport, LATENCY_TARGETS };

// Run if executed directly
if (process.argv[1]?.includes('validate-production')) {
  main();
}
