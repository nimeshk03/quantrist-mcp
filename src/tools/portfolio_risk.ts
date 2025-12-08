/**
 * Portfolio Risk Tool
 *
 * Calculates comprehensive risk metrics for a portfolio including:
 * - VaR (Value at Risk) at 95% and 99% confidence
 * - CVaR (Conditional VaR / Expected Shortfall)
 * - Volatility (annualized)
 * - Sharpe Ratio
 * - Maximum Drawdown estimate
 *
 * Returns a risk decision: PROCEED, REDUCE, or VETO
 */

import { Env, MCPToolResult, RiskDecision } from '../types';
import { Statistics } from '../utils/statistics';
import { MonteCarloEngine } from '../simulation/monte_carlo';
import { ReturnsService, createLiveReturnsService } from '../services/returns';

/**
 * Input parameters for portfolio risk calculation
 */
export interface PortfolioRiskInput {
  /** Portfolio holdings: ticker -> weight (must sum to 1) */
  holdings: Record<string, number>;
  /** Number of simulation paths (default: 10000) */
  simulations?: number;
  /** Simulation horizon in days (default: 21 = 1 month) */
  horizon?: number;
  /** Historical lookback period in days (default: 252 = 1 year) */
  lookback?: number;
  /** Use mock data for testing (default: false) */
  useMockData?: boolean;
}

/**
 * Risk metrics output
 */
export interface PortfolioRiskMetrics {
  /** Value at Risk at 95% confidence (as positive percentage) */
  var95: number;
  /** Value at Risk at 99% confidence (as positive percentage) */
  var99: number;
  /** Conditional VaR at 95% (Expected Shortfall) */
  cvar95: number;
  /** Conditional VaR at 99% */
  cvar99: number;
  /** Annualized volatility */
  volatility: number;
  /** Expected return over horizon */
  expectedReturn: number;
  /** Annualized expected return */
  annualizedReturn: number;
  /** Sharpe ratio (annualized, assuming 5% risk-free rate) */
  sharpeRatio: number;
  /** Maximum simulated drawdown */
  maxDrawdown: number;
  /** Minimum simulated return */
  worstCase: number;
  /** Maximum simulated return */
  bestCase: number;
}

/**
 * Complete portfolio risk result
 */
export interface PortfolioRiskResult {
  /** Risk metrics */
  metrics: PortfolioRiskMetrics;
  /** Risk decision based on thresholds */
  decision: RiskDecision;
  /** Human-readable explanation */
  explanation: string;
  /** Portfolio summary */
  portfolio: {
    tickers: string[];
    weights: number[];
    totalWeight: number;
  };
  /** Simulation parameters used */
  parameters: {
    simulations: number;
    horizon: number;
    lookback: number;
  };
}

/**
 * Risk thresholds for decision making
 */
const RISK_THRESHOLDS = {
  /** VaR99 above this triggers VETO */
  var99_veto: 0.25, // 25% potential loss
  /** VaR99 above this triggers REDUCE */
  var99_reduce: 0.15, // 15% potential loss
  /** Volatility above this triggers REDUCE */
  volatility_reduce: 0.40, // 40% annualized vol
  /** Sharpe below this triggers REDUCE */
  sharpe_reduce: 0.3,
};

/**
 * Risk-free rate assumption (annualized)
 */
const RISK_FREE_RATE = 0.05; // 5%

/**
 * Calculate portfolio risk metrics
 */
export async function calculatePortfolioRisk(
  input: PortfolioRiskInput,
  env: Env
): Promise<MCPToolResult<PortfolioRiskResult>> {
  const stats = new Statistics();

  // Validate and extract holdings
  const validation = validateHoldings(input.holdings);
  if ('error' in validation) {
    return { error: validation.error };
  }

  const { tickers, weights } = validation;

  // Set defaults
  const simulations = input.simulations ?? 10000;
  const horizon = input.horizon ?? 21;
  const lookback = input.lookback ?? 252;

  // Validate parameters
  if (simulations < 100 || simulations > 100000) {
    return { error: 'Simulations must be between 100 and 100,000' };
  }
  if (horizon < 1 || horizon > 252) {
    return { error: 'Horizon must be between 1 and 252 days' };
  }
  if (lookback < 21 || lookback > 1260) {
    return { error: 'Lookback must be between 21 and 1260 days' };
  }

  try {
    // Fetch historical returns
    const returnsService = input.useMockData
      ? new ReturnsService(env, { useMockData: true, seed: Date.now() })
      : createLiveReturnsService(env);

    const returns = await returnsService.getReturns(tickers, lookback);

    // Calculate mean returns and covariance matrix
    const returnArrays = tickers.map((t) => returns[t]);
    const meanReturns = returnArrays.map((r) => stats.mean(r));
    const covMatrix = stats.covarianceMatrix(returnArrays);

    // Run Monte Carlo simulation
    const mcEngine = new MonteCarloEngine();
    const simResult = mcEngine.simulatePortfolio({
      weights,
      meanReturns,
      covMatrix,
      paths: simulations,
      horizon,
    });

    // Calculate risk metrics
    const metrics = calculateMetrics(
      simResult.sortedTerminalReturns,
      simResult.stats,
      horizon,
      stats
    );

    // Determine risk decision
    const { decision, explanation } = determineRiskDecision(metrics);

    return {
      result: {
        metrics,
        decision,
        explanation,
        portfolio: {
          tickers,
          weights,
          totalWeight: stats.sum(weights),
        },
        parameters: {
          simulations,
          horizon,
          lookback,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { error: `Risk calculation failed: ${message}` };
  }
}

/**
 * Validate holdings input
 */
function validateHoldings(
  holdings: Record<string, number>
): { tickers: string[]; weights: number[]; error?: never } | { error: string; tickers?: never; weights?: never } {
  const tickers = Object.keys(holdings);
  const weights = Object.values(holdings);

  if (tickers.length === 0) {
    return { error: 'Holdings cannot be empty' };
  }

  if (tickers.length > 50) {
    return { error: 'Maximum 50 holdings supported' };
  }

  // Check for invalid weights
  for (let i = 0; i < weights.length; i++) {
    if (typeof weights[i] !== 'number' || isNaN(weights[i])) {
      return { error: `Invalid weight for ${tickers[i]}` };
    }
    if (weights[i] < 0) {
      return { error: `Negative weight not allowed for ${tickers[i]}` };
    }
    if (weights[i] > 1) {
      return { error: `Weight for ${tickers[i]} exceeds 100%` };
    }
  }

  // Check weights sum
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (Math.abs(totalWeight - 1) > 0.01) {
    return { error: `Weights must sum to 1, got ${totalWeight.toFixed(4)}` };
  }

  // Normalize weights to exactly 1
  const normalizedWeights = weights.map((w) => w / totalWeight);

  return { tickers, weights: normalizedWeights };
}

/**
 * Calculate all risk metrics from simulation results
 */
function calculateMetrics(
  sortedReturns: number[],
  simStats: {
    meanTerminalReturn: number;
    stdDevTerminalReturn: number;
    minTerminalReturn: number;
    maxTerminalReturn: number;
  },
  horizon: number,
  stats: Statistics
): PortfolioRiskMetrics {
  const n = sortedReturns.length;

  // VaR calculations (as positive loss values)
  const var95 = -stats.percentile(sortedReturns, 5);
  const var99 = -stats.percentile(sortedReturns, 1);

  // CVaR calculations (average of tail losses)
  const tail5Idx = Math.floor(n * 0.05);
  const tail1Idx = Math.floor(n * 0.01);

  const tail5 = sortedReturns.slice(0, Math.max(tail5Idx, 1));
  const tail1 = sortedReturns.slice(0, Math.max(tail1Idx, 1));

  const cvar95 = -stats.mean(tail5);
  const cvar99 = -stats.mean(tail1);

  // Annualize volatility
  const dailyVol = simStats.stdDevTerminalReturn / Math.sqrt(horizon);
  const annualizedVol = dailyVol * Math.sqrt(252);

  // Expected returns
  const expectedReturn = simStats.meanTerminalReturn;
  const dailyReturn = expectedReturn / horizon;
  const annualizedReturn = dailyReturn * 252;

  // Sharpe ratio (annualized)
  const excessReturn = annualizedReturn - RISK_FREE_RATE;
  const sharpeRatio = annualizedVol > 0 ? excessReturn / annualizedVol : 0;

  // Max drawdown (worst case from simulation)
  const maxDrawdown = -simStats.minTerminalReturn;

  return {
    var95: Math.max(0, var95),
    var99: Math.max(0, var99),
    cvar95: Math.max(0, cvar95),
    cvar99: Math.max(0, cvar99),
    volatility: annualizedVol,
    expectedReturn,
    annualizedReturn,
    sharpeRatio,
    maxDrawdown: Math.max(0, maxDrawdown),
    worstCase: simStats.minTerminalReturn,
    bestCase: simStats.maxTerminalReturn,
  };
}

/**
 * Determine risk decision based on metrics
 */
function determineRiskDecision(metrics: PortfolioRiskMetrics): {
  decision: RiskDecision;
  explanation: string;
} {
  const reasons: string[] = [];

  // Check VETO conditions
  if (metrics.var99 > RISK_THRESHOLDS.var99_veto) {
    return {
      decision: 'VETO',
      explanation: `VETO: 99% VaR of ${(metrics.var99 * 100).toFixed(1)}% exceeds ${(RISK_THRESHOLDS.var99_veto * 100).toFixed(0)}% threshold. Unacceptable tail risk.`,
    };
  }

  // Check REDUCE conditions
  if (metrics.var99 > RISK_THRESHOLDS.var99_reduce) {
    reasons.push(
      `99% VaR of ${(metrics.var99 * 100).toFixed(1)}% exceeds ${(RISK_THRESHOLDS.var99_reduce * 100).toFixed(0)}% threshold`
    );
  }

  if (metrics.volatility > RISK_THRESHOLDS.volatility_reduce) {
    reasons.push(
      `Volatility of ${(metrics.volatility * 100).toFixed(1)}% exceeds ${(RISK_THRESHOLDS.volatility_reduce * 100).toFixed(0)}% threshold`
    );
  }

  if (metrics.sharpeRatio < RISK_THRESHOLDS.sharpe_reduce && metrics.annualizedReturn > 0) {
    reasons.push(
      `Sharpe ratio of ${metrics.sharpeRatio.toFixed(2)} below ${RISK_THRESHOLDS.sharpe_reduce} threshold`
    );
  }

  if (reasons.length > 0) {
    return {
      decision: 'REDUCE',
      explanation: `REDUCE: ${reasons.join('; ')}. Consider reducing position size or adding diversification.`,
    };
  }

  // All clear
  return {
    decision: 'PROCEED',
    explanation: `PROCEED: Risk metrics within acceptable bounds. VaR99=${(metrics.var99 * 100).toFixed(1)}%, Vol=${(metrics.volatility * 100).toFixed(1)}%, Sharpe=${metrics.sharpeRatio.toFixed(2)}.`,
  };
}

/**
 * MCP Tool Definition for portfolio_risk
 */
export const portfolioRiskToolDefinition = {
  name: 'portfolio_risk',
  description:
    'Calculate comprehensive risk metrics for a portfolio including VaR, CVaR, volatility, and Sharpe ratio. Returns a risk decision (PROCEED/REDUCE/VETO) based on configurable thresholds.',
  inputSchema: {
    type: 'object',
    properties: {
      holdings: {
        type: 'object',
        description:
          'Portfolio holdings as ticker:weight pairs. Weights must sum to 1. Example: {"AAPL": 0.4, "MSFT": 0.3, "TLT": 0.3}',
        additionalProperties: { type: 'number' },
      },
      simulations: {
        type: 'number',
        description: 'Number of Monte Carlo simulations (default: 10000, range: 100-100000)',
      },
      horizon: {
        type: 'number',
        description: 'Simulation horizon in trading days (default: 21 = ~1 month)',
      },
      lookback: {
        type: 'number',
        description: 'Historical lookback period in days (default: 252 = 1 year)',
      },
    },
    required: ['holdings'],
  },
};

/**
 * MCP Tool Handler for portfolio_risk
 */
export async function portfolioRiskHandler(
  input: unknown,
  env: Env
): Promise<MCPToolResult<PortfolioRiskResult>> {
  const params = input as PortfolioRiskInput;

  if (!params.holdings || typeof params.holdings !== 'object') {
    return { error: 'Missing required parameter: holdings' };
  }

  return calculatePortfolioRisk(params, env);
}
