/**
 * Ticker Risk Tool
 *
 * Analyzes the risk impact of adding a single ticker to a portfolio:
 * - Marginal VaR: How much adding this ticker increases portfolio VaR
 * - VaR Contribution: Percentage of total VaR from this ticker
 * - Beta: Sensitivity to market (SPY)
 * - Correlation Impact: How correlated with existing holdings
 *
 * Returns a decision with recommended allocation adjustment
 */

import { Env, MCPToolResult, RiskDecision, CorrelationImpact } from '../types';
import { Statistics } from '../utils/statistics';
import { MonteCarloEngine } from '../simulation/monte_carlo';
import { ReturnsService, createLiveReturnsService } from '../services/returns';

/**
 * Input parameters for ticker risk analysis
 */
export interface TickerRiskInput {
  /** Ticker symbol to analyze */
  ticker: string;
  /** Proposed allocation weight (0-1) */
  proposedAllocation: number;
  /** Existing portfolio holdings (optional, defaults to SPY benchmark) */
  existingHoldings?: Record<string, number>;
  /** Number of simulations (default: 5000) */
  simulations?: number;
  /** Historical lookback in days (default: 252) */
  lookback?: number;
  /** Use mock data for testing (default: false) */
  useMockData?: boolean;
}

/**
 * Ticker risk analysis result
 */
export interface TickerRiskResult {
  /** Analyzed ticker */
  ticker: string;
  /** Proposed allocation */
  proposedAllocation: number;
  /** Marginal VaR (change in portfolio VaR from adding this ticker) */
  marginalVar: number;
  /** VaR contribution percentage (0-1) */
  varContribution: number;
  /** Beta vs SPY (market sensitivity) */
  beta: number;
  /** Ticker volatility (annualized) */
  volatility: number;
  /** Average correlation with existing holdings */
  avgCorrelation: number;
  /** Correlation impact classification */
  correlationImpact: CorrelationImpact;
  /** Risk decision */
  decision: RiskDecision;
  /** Human-readable explanation */
  explanation: string;
  /** Recommended allocation (may differ from proposed) */
  recommendedAllocation: number;
  /** Ticker statistics */
  stats: {
    meanReturn: number;
    annualizedReturn: number;
    sharpeRatio: number;
  };
}

/**
 * Risk thresholds for ticker analysis
 */
const THRESHOLDS = {
  /** VaR contribution above this triggers VETO */
  varContribution_veto: 0.50, // 50% of portfolio VaR
  /** VaR contribution above this triggers REDUCE */
  varContribution_reduce: 0.30, // 30% of portfolio VaR
  /** Beta above this triggers REDUCE */
  beta_reduce: 2.0,
  /** Beta above this triggers VETO */
  beta_veto: 3.0,
  /** Correlation above this is "high" impact */
  correlation_high: 0.7,
  /** Correlation above this is "medium" impact */
  correlation_medium: 0.4,
  /** Maximum recommended allocation for high-beta stocks */
  maxAllocation_highBeta: 0.10,
  /** Maximum recommended allocation for high-correlation stocks */
  maxAllocation_highCorr: 0.15,
};

/**
 * Risk-free rate for Sharpe calculation
 */
const RISK_FREE_RATE = 0.05;

/**
 * Market benchmark ticker
 */
const MARKET_BENCHMARK = 'SPY';

/**
 * Calculate ticker risk metrics
 */
export async function calculateTickerRisk(
  input: TickerRiskInput,
  env: Env
): Promise<MCPToolResult<TickerRiskResult>> {
  const stats = new Statistics();

  // Validate input
  const validation = validateInput(input);
  if (validation.error) {
    return { error: validation.error };
  }

  const { ticker, proposedAllocation } = input;
  const simulations = input.simulations ?? 5000;
  const lookback = input.lookback ?? 252;

  // Default existing holdings to market benchmark if not provided
  const existingHoldings = input.existingHoldings ?? { [MARKET_BENCHMARK]: 1.0 };

  try {
    // Get returns service
    const returnsService = input.useMockData
      ? new ReturnsService(env, { useMockData: true, seed: Date.now() })
      : createLiveReturnsService(env);

    // Collect all tickers we need
    const existingTickers = Object.keys(existingHoldings);
    const allTickers = [...new Set([ticker, MARKET_BENCHMARK, ...existingTickers])];

    // Fetch returns for all tickers
    const returns = await returnsService.getReturns(allTickers, lookback);

    // Calculate ticker statistics
    const tickerReturns = returns[ticker];
    const marketReturns = returns[MARKET_BENCHMARK];

    const tickerMean = stats.mean(tickerReturns);
    const tickerStd = stats.stdDev(tickerReturns);
    const annualizedVol = tickerStd * Math.sqrt(252);
    const annualizedReturn = tickerMean * 252;
    const sharpeRatio = annualizedVol > 0 
      ? (annualizedReturn - RISK_FREE_RATE) / annualizedVol 
      : 0;

    // Calculate beta vs market
    const beta = calculateBeta(tickerReturns, marketReturns, stats);

    // Calculate correlation with existing holdings
    const avgCorrelation = calculateAvgCorrelation(
      tickerReturns,
      existingTickers,
      returns,
      stats
    );

    // Calculate marginal VaR and VaR contribution
    const { marginalVar, varContribution } = await calculateVarMetrics(
      ticker,
      proposedAllocation,
      existingHoldings,
      returns,
      simulations,
      stats
    );

    // Classify correlation impact
    const correlationImpact = classifyCorrelationImpact(avgCorrelation);

    // Determine decision and recommended allocation
    const { decision, explanation, recommendedAllocation } = determineDecision(
      ticker,
      proposedAllocation,
      varContribution,
      beta,
      correlationImpact,
      annualizedVol
    );

    return {
      result: {
        ticker,
        proposedAllocation,
        marginalVar,
        varContribution,
        beta,
        volatility: annualizedVol,
        avgCorrelation,
        correlationImpact,
        decision,
        explanation,
        recommendedAllocation,
        stats: {
          meanReturn: tickerMean,
          annualizedReturn,
          sharpeRatio,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { error: `Ticker risk analysis failed: ${message}` };
  }
}

/**
 * Validate input parameters
 */
function validateInput(
  input: TickerRiskInput
): { error?: string } {
  if (!input.ticker || typeof input.ticker !== 'string') {
    return { error: 'Missing required parameter: ticker' };
  }

  if (input.ticker.length === 0 || input.ticker.length > 10) {
    return { error: 'Invalid ticker symbol' };
  }

  if (typeof input.proposedAllocation !== 'number') {
    return { error: 'Missing required parameter: proposedAllocation' };
  }

  if (input.proposedAllocation <= 0 || input.proposedAllocation > 1) {
    return { error: 'proposedAllocation must be between 0 and 1' };
  }

  if (input.existingHoldings) {
    const totalWeight = Object.values(input.existingHoldings).reduce((a, b) => a + b, 0);
    if (Math.abs(totalWeight - 1) > 0.01) {
      return { error: 'existingHoldings weights must sum to 1' };
    }
  }

  return {};
}

/**
 * Calculate beta (sensitivity to market)
 */
function calculateBeta(
  tickerReturns: number[],
  marketReturns: number[],
  stats: Statistics
): number {
  const covariance = stats.covariance(tickerReturns, marketReturns);
  const marketVariance = stats.variance(marketReturns);

  if (marketVariance === 0) return 1;
  return covariance / marketVariance;
}

/**
 * Calculate average correlation with existing holdings
 */
function calculateAvgCorrelation(
  tickerReturns: number[],
  existingTickers: string[],
  returns: Record<string, number[]>,
  stats: Statistics
): number {
  if (existingTickers.length === 0) return 0;

  let totalCorr = 0;
  let count = 0;

  for (const existingTicker of existingTickers) {
    if (existingTicker === 'ticker') continue; // Skip self
    const existingReturns = returns[existingTicker];
    if (existingReturns) {
      totalCorr += stats.correlation(tickerReturns, existingReturns);
      count++;
    }
  }

  return count > 0 ? totalCorr / count : 0;
}

/**
 * Calculate marginal VaR and VaR contribution
 */
async function calculateVarMetrics(
  ticker: string,
  proposedAllocation: number,
  existingHoldings: Record<string, number>,
  returns: Record<string, number[]>,
  simulations: number,
  stats: Statistics
): Promise<{ marginalVar: number; varContribution: number }> {
  const mcEngine = new MonteCarloEngine();

  // Scale down existing holdings to make room for new ticker
  const scaleFactor = 1 - proposedAllocation;
  const newHoldings: Record<string, number> = {};
  
  for (const [t, w] of Object.entries(existingHoldings)) {
    newHoldings[t] = w * scaleFactor;
  }
  newHoldings[ticker] = proposedAllocation;

  // Get tickers and weights for both portfolios
  const existingTickers = Object.keys(existingHoldings);
  const existingWeights = Object.values(existingHoldings);
  
  const newTickers = Object.keys(newHoldings);
  const newWeights = Object.values(newHoldings);

  // Calculate returns arrays
  const existingReturnArrays = existingTickers.map((t) => returns[t]);
  const newReturnArrays = newTickers.map((t) => returns[t]);

  // Calculate mean returns and covariance matrices
  const existingMeans = existingReturnArrays.map((r) => stats.mean(r));
  const existingCov = stats.covarianceMatrix(existingReturnArrays);

  const newMeans = newReturnArrays.map((r) => stats.mean(r));
  const newCov = stats.covarianceMatrix(newReturnArrays);

  // Simulate both portfolios
  const existingResult = mcEngine.simulatePortfolio({
    weights: existingWeights,
    meanReturns: existingMeans,
    covMatrix: existingCov,
    paths: simulations,
    horizon: 21,
  });

  const newResult = mcEngine.simulatePortfolio({
    weights: newWeights,
    meanReturns: newMeans,
    covMatrix: newCov,
    paths: simulations,
    horizon: 21,
  });

  // Calculate VaR at 99% for both
  const existingVar99 = -stats.percentile(existingResult.sortedTerminalReturns, 1);
  const newVar99 = -stats.percentile(newResult.sortedTerminalReturns, 1);

  // Marginal VaR is the change in VaR
  const marginalVar = Math.max(0, newVar99 - existingVar99);

  // VaR contribution is approximate (using component VaR approach)
  // Simplified: proportion of marginal VaR to total new VaR
  const varContribution = newVar99 > 0 
    ? Math.min(1, (marginalVar + proposedAllocation * newVar99) / newVar99)
    : proposedAllocation;

  return { marginalVar, varContribution };
}

/**
 * Classify correlation impact
 */
function classifyCorrelationImpact(avgCorrelation: number): CorrelationImpact {
  const absCorr = Math.abs(avgCorrelation);
  if (absCorr >= THRESHOLDS.correlation_high) return 'high';
  if (absCorr >= THRESHOLDS.correlation_medium) return 'medium';
  return 'low';
}

/**
 * Determine risk decision and recommended allocation
 */
function determineDecision(
  ticker: string,
  proposedAllocation: number,
  varContribution: number,
  beta: number,
  correlationImpact: CorrelationImpact,
  volatility: number
): { decision: RiskDecision; explanation: string; recommendedAllocation: number } {
  const reasons: string[] = [];
  let recommendedAllocation = proposedAllocation;

  // Check VETO conditions
  if (varContribution > THRESHOLDS.varContribution_veto) {
    return {
      decision: 'VETO',
      explanation: `VETO: ${ticker} would contribute ${(varContribution * 100).toFixed(0)}% of portfolio VaR, exceeding ${(THRESHOLDS.varContribution_veto * 100).toFixed(0)}% threshold.`,
      recommendedAllocation: 0,
    };
  }

  if (beta > THRESHOLDS.beta_veto) {
    return {
      decision: 'VETO',
      explanation: `VETO: ${ticker} has beta of ${beta.toFixed(2)}, exceeding ${THRESHOLDS.beta_veto} threshold. Extreme market sensitivity.`,
      recommendedAllocation: 0,
    };
  }

  // Check REDUCE conditions
  if (varContribution > THRESHOLDS.varContribution_reduce) {
    reasons.push(
      `VaR contribution of ${(varContribution * 100).toFixed(0)}% exceeds ${(THRESHOLDS.varContribution_reduce * 100).toFixed(0)}% threshold`
    );
    recommendedAllocation = Math.min(
      recommendedAllocation,
      proposedAllocation * (THRESHOLDS.varContribution_reduce / varContribution)
    );
  }

  if (beta > THRESHOLDS.beta_reduce) {
    reasons.push(`Beta of ${beta.toFixed(2)} exceeds ${THRESHOLDS.beta_reduce} threshold`);
    recommendedAllocation = Math.min(
      recommendedAllocation,
      THRESHOLDS.maxAllocation_highBeta
    );
  }

  if (correlationImpact === 'high') {
    reasons.push(`High correlation (${(volatility * 100).toFixed(0)}% vol) reduces diversification benefit`);
    recommendedAllocation = Math.min(
      recommendedAllocation,
      THRESHOLDS.maxAllocation_highCorr
    );
  }

  if (reasons.length > 0) {
    return {
      decision: 'REDUCE',
      explanation: `REDUCE: ${reasons.join('; ')}. Recommended allocation: ${(recommendedAllocation * 100).toFixed(1)}%.`,
      recommendedAllocation: Math.round(recommendedAllocation * 100) / 100,
    };
  }

  // All clear
  return {
    decision: 'PROCEED',
    explanation: `PROCEED: ${ticker} passes all risk checks. Beta=${beta.toFixed(2)}, VaR contribution=${(varContribution * 100).toFixed(0)}%, correlation impact=${correlationImpact}.`,
    recommendedAllocation: proposedAllocation,
  };
}

/**
 * MCP Tool Definition for ticker_risk
 */
export const tickerRiskToolDefinition = {
  name: 'ticker_risk',
  description:
    'Analyze the risk impact of adding a single ticker to a portfolio. Calculates marginal VaR, VaR contribution, beta, and correlation impact. Returns a decision (PROCEED/REDUCE/VETO) with recommended allocation.',
  inputSchema: {
    type: 'object',
    properties: {
      ticker: {
        type: 'string',
        description: 'Ticker symbol to analyze (e.g., "NVDA", "AAPL")',
      },
      proposedAllocation: {
        type: 'number',
        description: 'Proposed allocation weight (0-1). Example: 0.20 for 20%',
      },
      existingHoldings: {
        type: 'object',
        description:
          'Current portfolio holdings as ticker:weight pairs. Defaults to 100% SPY if not provided.',
        additionalProperties: { type: 'number' },
      },
      simulations: {
        type: 'number',
        description: 'Number of Monte Carlo simulations (default: 5000)',
      },
      lookback: {
        type: 'number',
        description: 'Historical lookback period in days (default: 252)',
      },
    },
    required: ['ticker', 'proposedAllocation'],
  },
};

/**
 * MCP Tool Handler for ticker_risk
 */
export async function tickerRiskHandler(
  input: unknown,
  env: Env
): Promise<MCPToolResult<TickerRiskResult>> {
  const params = input as TickerRiskInput;

  if (!params.ticker) {
    return { error: 'Missing required parameter: ticker' };
  }

  if (typeof params.proposedAllocation !== 'number') {
    return { error: 'Missing required parameter: proposedAllocation' };
  }

  return calculateTickerRisk(params, env);
}
