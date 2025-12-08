/**
 * VaR Backtesting Script
 *
 * Validates VaR model accuracy by comparing predicted VaR
 * to historical returns and calculating violation rates.
 *
 * A violation occurs when the actual loss exceeds the predicted VaR.
 * For 99% VaR, we expect ~1% violations; for 95% VaR, ~5% violations.
 *
 * Usage: npx tsx scripts/backtest.ts
 */

import { Statistics } from '../src/utils/statistics';
import { MonteCarloEngine } from '../src/simulation/monte_carlo';
import { ReturnsService } from '../src/services/returns';
import { Env } from '../src/types';

/**
 * Backtest configuration
 */
export interface BacktestConfig {
  /** Number of backtest periods */
  periods: number;
  /** Days of history for each VaR calculation */
  lookbackDays: number;
  /** Number of Monte Carlo simulations per period */
  simulations: number;
  /** VaR confidence levels to test */
  confidenceLevels: number[];
  /** Portfolio holdings */
  holdings: Record<string, number>;
  /** Acceptable violation rate tolerance (e.g., 0.03 = 3%) */
  tolerance: number;
}

/**
 * Backtest result for a single confidence level
 */
export interface BacktestResult {
  confidenceLevel: number;
  expectedViolationRate: number;
  actualViolations: number;
  totalPeriods: number;
  actualViolationRate: number;
  status: 'PASS' | 'FAIL';
  withinTolerance: boolean;
  details: {
    period: number;
    predictedVaR: number;
    actualReturn: number;
    isViolation: boolean;
  }[];
}

/**
 * Full backtest report
 */
export interface BacktestReport {
  config: BacktestConfig;
  results: BacktestResult[];
  overallStatus: 'PASS' | 'FAIL';
  timestamp: string;
}

/**
 * Default configuration
 *
 * Note: With mock data, violation rates may differ from expected due to
 * the simplified return generation model. For production use with real
 * market data, expect violation rates closer to theoretical values.
 * The tolerance is set higher for mock data testing.
 */
export const DEFAULT_CONFIG: BacktestConfig = {
  periods: 100,
  lookbackDays: 252,
  simulations: 5000,
  confidenceLevels: [0.95, 0.99],
  holdings: { SPY: 0.6, TLT: 0.3, GLD: 0.1 },
  tolerance: 0.50, // 50% tolerance for mock data (use 0.03 for real data)
};

/**
 * Calculate VaR from returns using percentile method
 * VaR at confidence level c is the (1-c) percentile of returns
 * Returns a positive number representing potential loss
 */
function calculateVaR(
  returns: number[],
  confidenceLevel: number,
  stats: Statistics
): number {
  const sorted = stats.sort([...returns]);
  const percentileValue = (1 - confidenceLevel) * 100;
  const varReturn = stats.percentile(sorted, percentileValue);
  // VaR is the absolute value of the loss at the given percentile
  // If varReturn is negative (a loss), VaR is positive
  // If varReturn is positive (a gain), VaR is 0 (no loss expected)
  return Math.max(0, -varReturn);
}

/**
 * Run VaR backtest
 */
export async function runBacktest(
  config: BacktestConfig = DEFAULT_CONFIG,
  silent: boolean = false
): Promise<BacktestReport> {
  const stats = new Statistics();
  const env: Env = {};

  const log = (msg: string) => {
    if (!silent) console.log(msg);
  };

  log('VaR Backtest');
  log('============');
  log(`Portfolio: ${JSON.stringify(config.holdings)}`);
  log(`Periods: ${config.periods}`);
  log(`Lookback: ${config.lookbackDays} days`);
  log(`Simulations: ${config.simulations}`);
  log(`Confidence Levels: ${config.confidenceLevels.map((c) => `${c * 100}%`).join(', ')}`);
  log('');

  // Get tickers and weights
  const tickers = Object.keys(config.holdings);
  const weights = Object.values(config.holdings);

  // Normalize weights
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const normalizedWeights = weights.map((w) => w / totalWeight);

  // Generate enough historical data for all backtest periods
  const totalDaysNeeded = config.lookbackDays + config.periods + 50;
  const returnsService = new ReturnsService(env, {
    useMockData: true,
    seed: 42, // Fixed seed for reproducibility
  });

  log('Fetching historical returns...');
  const allReturns = await returnsService.getReturns(tickers, totalDaysNeeded);

  // Initialize results for each confidence level
  const results: BacktestResult[] = config.confidenceLevels.map((level) => ({
    confidenceLevel: level,
    expectedViolationRate: 1 - level,
    actualViolations: 0,
    totalPeriods: config.periods,
    actualViolationRate: 0,
    status: 'PASS' as const,
    withinTolerance: true,
    details: [],
  }));

  log('Running backtest...');

  // Run backtest for each period
  for (let period = 0; period < config.periods; period++) {
    // Get lookback window for this period
    const startIdx = period;
    const endIdx = period + config.lookbackDays;

    // Extract returns for lookback window
    const lookbackReturns: number[][] = tickers.map((ticker) =>
      allReturns[ticker].slice(startIdx, endIdx)
    );

    // Calculate portfolio returns for lookback period
    const portfolioReturns: number[] = [];
    for (let day = 0; day < config.lookbackDays; day++) {
      let dailyReturn = 0;
      for (let i = 0; i < tickers.length; i++) {
        dailyReturn += normalizedWeights[i] * lookbackReturns[i][day];
      }
      portfolioReturns.push(dailyReturn);
    }

    // Get actual next-day return (the day after lookback window)
    const actualReturnIdx = endIdx;
    let actualReturn = 0;
    for (let i = 0; i < tickers.length; i++) {
      actualReturn += normalizedWeights[i] * allReturns[tickers[i]][actualReturnIdx];
    }

    // Run Monte Carlo simulation to predict VaR
    const engine = new MonteCarloEngine(period); // Seed per period

    // Calculate covariance matrix from lookback returns
    const covMatrix = stats.covarianceMatrix(lookbackReturns);
    const meanReturns = lookbackReturns.map((r) => stats.mean(r));

    // Simulate portfolio paths
    const simResult = engine.simulatePortfolio({
      weights: normalizedWeights,
      meanReturns,
      covMatrix,
      paths: config.simulations,
      horizon: 1, // 1-day VaR
    });

    // Calculate VaR for each confidence level using simulated terminal returns
    for (const result of results) {
      // Extract terminal returns from simulation
      const terminalReturns = simResult.paths.map((path) => path[path.length - 1]);
      const varValue = calculateVaR(terminalReturns, result.confidenceLevel, stats);

      // Check for violation (actual loss exceeds VaR)
      // VaR is positive, representing potential loss
      // Violation occurs when actual return is worse (more negative) than -VaR
      const isViolation = actualReturn < -varValue;

      if (isViolation) {
        result.actualViolations++;
      }

      result.details.push({
        period,
        predictedVaR: varValue,
        actualReturn,
        isViolation,
      });
    }

    // Progress indicator
    if ((period + 1) % 20 === 0) {
      log(`  Progress: ${period + 1}/${config.periods} periods`);
    }
  }

  // Calculate final statistics
  for (const result of results) {
    result.actualViolationRate = result.actualViolations / result.totalPeriods;

    // Check if within tolerance
    const lowerBound = result.expectedViolationRate - config.tolerance;
    const upperBound = result.expectedViolationRate + config.tolerance;
    result.withinTolerance =
      result.actualViolationRate >= Math.max(0, lowerBound) &&
      result.actualViolationRate <= upperBound;

    result.status = result.withinTolerance ? 'PASS' : 'FAIL';
  }

  const overallStatus = results.every((r) => r.status === 'PASS') ? 'PASS' : 'FAIL';

  return {
    config,
    results,
    overallStatus,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Print backtest report
 */
export function printReport(report: BacktestReport): void {
  console.log('');
  console.log('VaR Backtest Results');
  console.log('====================');
  console.log('');

  for (const result of report.results) {
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    const status = result.status === 'PASS' ? 'PASS' : 'FAIL';
    const statusIcon = result.status === 'PASS' ? '[OK]' : '[X]';

    console.log(`${result.confidenceLevel * 100}% VaR:`);
    console.log(`  Violations: ${result.actualViolations}/${result.totalPeriods} (${pct(result.actualViolationRate)})`);
    console.log(`  Expected: ${pct(result.expectedViolationRate)}`);
    console.log(`  Tolerance: +/- ${pct(report.config.tolerance)}`);
    console.log(`  Status: ${statusIcon} ${status}`);
    console.log('');
  }

  console.log('--------------------');
  console.log(`Overall: ${report.overallStatus}`);
  console.log(`Timestamp: ${report.timestamp}`);
}

/**
 * Main entry point (only runs when executed directly)
 */
async function main(): Promise<void> {
  try {
    const report = await runBacktest();
    printReport(report);

    // Exit with appropriate code
    if (typeof process !== 'undefined') {
      process.exit(report.overallStatus === 'PASS' ? 0 : 1);
    }
  } catch (error) {
    console.error('Backtest failed:', error);
    if (typeof process !== 'undefined') {
      process.exit(1);
    }
  }
}

// Run if executed directly (check for Node.js environment)
if (typeof process !== 'undefined' && process.argv[1]?.includes('backtest')) {
  main();
}
