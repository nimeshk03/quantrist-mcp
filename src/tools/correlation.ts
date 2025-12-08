/**
 * Correlation Regime Tool
 *
 * Analyzes correlation dynamics in a portfolio:
 * - Recent vs historical correlation comparison
 * - Regime detection (normal/elevated/crisis)
 * - High and low correlation pair identification
 * - Regime change probability estimation
 *
 * Helps identify when diversification benefits may break down
 */

import { Env, MCPToolResult, CorrelationRegime, RiskDecision } from '../types';
import { Statistics } from '../utils/statistics';
import { ReturnsService, createLiveReturnsService } from '../services/returns';

/**
 * Input parameters for correlation regime analysis
 */
export interface CorrelationRegimeInput {
  /** Tickers to analyze (default: major asset classes) */
  tickers?: string[];
  /** Recent lookback period in days (default: 60) */
  recentLookback?: number;
  /** Historical lookback period in days (default: 252) */
  historicalLookback?: number;
  /** Use mock data for testing */
  useMockData?: boolean;
}

/**
 * Correlation pair information
 */
export interface CorrelationPair {
  /** Ticker pair */
  pair: [string, string];
  /** Correlation coefficient */
  correlation: number;
  /** Change from historical */
  change: number;
}

/**
 * Correlation regime analysis result
 */
export interface CorrelationRegimeResult {
  /** Current correlation regime */
  currentRegime: CorrelationRegime;
  /** Average pairwise correlation (recent) */
  averageCorrelation: number;
  /** Historical average correlation */
  historicalAverage: number;
  /** Change in average correlation */
  correlationChange: number;
  /** Highest correlation pairs */
  highCorrelationPairs: CorrelationPair[];
  /** Lowest correlation pairs (diversification opportunities) */
  lowCorrelationPairs: CorrelationPair[];
  /** Pairs with largest correlation increase */
  risingCorrelationPairs: CorrelationPair[];
  /** Estimated probability of regime change */
  regimeChangeProbability: number;
  /** Risk decision */
  decision: RiskDecision;
  /** Human-readable explanation */
  explanation: string;
  /** Full correlation matrices */
  matrices: {
    recent: number[][];
    historical: number[][];
    tickers: string[];
  };
}

/**
 * Default tickers for correlation analysis
 */
const DEFAULT_TICKERS = [
  'SPY',  // US Large Cap
  'QQQ',  // Tech
  'TLT',  // Long-term Treasuries
  'GLD',  // Gold
  'EFA',  // International Developed
  'VNQ',  // REITs
];

/**
 * Regime thresholds
 */
const THRESHOLDS = {
  /** Average correlation above this = crisis */
  crisis: 0.70,
  /** Average correlation above this = elevated */
  elevated: 0.50,
  /** Correlation change above this = concerning */
  changeWarning: 0.15,
  /** High correlation threshold */
  highCorrelation: 0.75,
  /** Low correlation threshold */
  lowCorrelation: 0.30,
  /** Number of pairs to return */
  pairsToReturn: 5,
};

/**
 * Analyze correlation regime
 */
export async function analyzeCorrelationRegime(
  input: CorrelationRegimeInput,
  env: Env
): Promise<MCPToolResult<CorrelationRegimeResult>> {
  const stats = new Statistics();

  // Set defaults
  const tickers = input.tickers ?? DEFAULT_TICKERS;
  const recentLookback = input.recentLookback ?? 60;
  const historicalLookback = input.historicalLookback ?? 252;

  // Validate input
  if (tickers.length < 2) {
    return { error: 'At least 2 tickers required for correlation analysis' };
  }

  if (tickers.length > 20) {
    return { error: 'Maximum 20 tickers supported' };
  }

  if (recentLookback < 20 || recentLookback > 252) {
    return { error: 'Recent lookback must be between 20 and 252 days' };
  }

  if (historicalLookback < recentLookback || historicalLookback > 1260) {
    return { error: 'Historical lookback must be >= recent lookback and <= 1260 days' };
  }

  try {
    // Fetch returns
    const returnsService = input.useMockData
      ? new ReturnsService(env, { useMockData: true, seed: Date.now() })
      : createLiveReturnsService(env);

    const allReturns = await returnsService.getReturns(tickers, historicalLookback);

    // Split into recent and historical periods
    const recentReturns: number[][] = [];
    const historicalReturns: number[][] = [];

    for (const ticker of tickers) {
      const returns = allReturns[ticker];
      // Recent = last N days
      recentReturns.push(returns.slice(-recentLookback));
      // Historical = full period
      historicalReturns.push(returns);
    }

    // Calculate correlation matrices
    const recentMatrix = stats.correlationMatrix(recentReturns);
    const historicalMatrix = stats.correlationMatrix(historicalReturns);

    // Calculate average correlations (excluding diagonal)
    const recentAvg = calculateAverageCorrelation(recentMatrix);
    const historicalAvg = calculateAverageCorrelation(historicalMatrix);
    const correlationChange = recentAvg - historicalAvg;

    // Determine regime
    const currentRegime = determineRegime(recentAvg);

    // Find high and low correlation pairs
    const allPairs = extractCorrelationPairs(
      tickers,
      recentMatrix,
      historicalMatrix
    );

    // Sort and filter pairs
    const highCorrelationPairs = allPairs
      .filter((p) => p.correlation >= THRESHOLDS.highCorrelation)
      .sort((a, b) => b.correlation - a.correlation)
      .slice(0, THRESHOLDS.pairsToReturn);

    const lowCorrelationPairs = allPairs
      .filter((p) => p.correlation <= THRESHOLDS.lowCorrelation)
      .sort((a, b) => a.correlation - b.correlation)
      .slice(0, THRESHOLDS.pairsToReturn);

    const risingCorrelationPairs = allPairs
      .filter((p) => p.change > 0)
      .sort((a, b) => b.change - a.change)
      .slice(0, THRESHOLDS.pairsToReturn);

    // Estimate regime change probability
    const regimeChangeProbability = estimateRegimeChangeProbability(
      currentRegime,
      correlationChange,
      recentAvg
    );

    // Determine decision
    const { decision, explanation } = determineDecision(
      currentRegime,
      correlationChange,
      regimeChangeProbability,
      highCorrelationPairs.length
    );

    return {
      result: {
        currentRegime,
        averageCorrelation: recentAvg,
        historicalAverage: historicalAvg,
        correlationChange,
        highCorrelationPairs,
        lowCorrelationPairs,
        risingCorrelationPairs,
        regimeChangeProbability,
        decision,
        explanation,
        matrices: {
          recent: recentMatrix,
          historical: historicalMatrix,
          tickers,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { error: `Correlation analysis failed: ${message}` };
  }
}

/**
 * Calculate average pairwise correlation (excluding diagonal)
 */
function calculateAverageCorrelation(matrix: number[][]): number {
  const n = matrix.length;
  if (n < 2) return 0;

  let sum = 0;
  let count = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sum += matrix[i][j];
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Determine correlation regime
 */
function determineRegime(avgCorrelation: number): CorrelationRegime {
  if (avgCorrelation >= THRESHOLDS.crisis) return 'crisis';
  if (avgCorrelation >= THRESHOLDS.elevated) return 'elevated';
  return 'normal';
}

/**
 * Extract all correlation pairs with changes
 */
function extractCorrelationPairs(
  tickers: string[],
  recentMatrix: number[][],
  historicalMatrix: number[][]
): CorrelationPair[] {
  const pairs: CorrelationPair[] = [];
  const n = tickers.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push({
        pair: [tickers[i], tickers[j]],
        correlation: recentMatrix[i][j],
        change: recentMatrix[i][j] - historicalMatrix[i][j],
      });
    }
  }

  return pairs;
}

/**
 * Estimate probability of regime change
 */
function estimateRegimeChangeProbability(
  currentRegime: CorrelationRegime,
  correlationChange: number,
  recentAvg: number
): number {
  // Base probability depends on current regime
  let baseProbability: number;
  switch (currentRegime) {
    case 'crisis':
      // Crisis regimes tend to revert
      baseProbability = 0.30;
      break;
    case 'elevated':
      // Elevated can go either way
      baseProbability = 0.25;
      break;
    default:
      // Normal regime is stable
      baseProbability = 0.15;
  }

  // Adjust for correlation change momentum
  if (correlationChange > THRESHOLDS.changeWarning) {
    // Rising correlations increase probability
    baseProbability += 0.20;
  } else if (correlationChange < -THRESHOLDS.changeWarning) {
    // Falling correlations also indicate change
    baseProbability += 0.10;
  }

  // Adjust for proximity to regime boundaries
  if (currentRegime === 'normal' && recentAvg > THRESHOLDS.elevated - 0.10) {
    baseProbability += 0.15;
  }
  if (currentRegime === 'elevated' && recentAvg > THRESHOLDS.crisis - 0.10) {
    baseProbability += 0.15;
  }

  return Math.min(0.90, Math.max(0.05, baseProbability));
}

/**
 * Determine risk decision
 */
function determineDecision(
  regime: CorrelationRegime,
  correlationChange: number,
  regimeChangeProbability: number,
  highCorrPairCount: number
): { decision: RiskDecision; explanation: string } {
  // Crisis regime always triggers REDUCE
  if (regime === 'crisis') {
    return {
      decision: 'REDUCE',
      explanation: `REDUCE: Crisis correlation regime detected. Average correlation is extremely high, indicating diversification breakdown. Consider reducing position sizes or adding uncorrelated assets.`,
    };
  }

  // Check for warning signs
  const warnings: string[] = [];

  if (regime === 'elevated') {
    warnings.push('Elevated correlation regime');
  }

  if (correlationChange > THRESHOLDS.changeWarning) {
    warnings.push(`Correlations rising (+${(correlationChange * 100).toFixed(0)}%)`);
  }

  if (regimeChangeProbability > 0.40) {
    warnings.push(`High regime change probability (${(regimeChangeProbability * 100).toFixed(0)}%)`);
  }

  if (highCorrPairCount >= 3) {
    warnings.push(`${highCorrPairCount} highly correlated pairs`);
  }

  if (warnings.length >= 2) {
    return {
      decision: 'REDUCE',
      explanation: `REDUCE: ${warnings.join('; ')}. Diversification benefits may be weakening.`,
    };
  }

  // All clear
  return {
    decision: 'PROCEED',
    explanation: `PROCEED: ${regime.charAt(0).toUpperCase() + regime.slice(1)} correlation regime. Diversification benefits intact. Regime change probability: ${(regimeChangeProbability * 100).toFixed(0)}%.`,
  };
}

/**
 * MCP Tool Definition for correlation_regime
 */
export const correlationRegimeToolDefinition = {
  name: 'correlation_regime',
  description:
    'Analyze correlation dynamics to detect regime changes (normal/elevated/crisis). Identifies high and low correlation pairs and estimates regime change probability. Helps assess when diversification benefits may break down.',
  inputSchema: {
    type: 'object',
    properties: {
      tickers: {
        type: 'array',
        description:
          'Tickers to analyze. Defaults to major asset classes: SPY, QQQ, TLT, GLD, EFA, VNQ',
        items: { type: 'string' },
      },
      recentLookback: {
        type: 'number',
        description: 'Recent lookback period in days (default: 60)',
      },
      historicalLookback: {
        type: 'number',
        description: 'Historical lookback period in days (default: 252)',
      },
    },
    required: [],
  },
};

/**
 * MCP Tool Handler for correlation_regime
 */
export async function correlationRegimeHandler(
  input: unknown,
  env: Env
): Promise<MCPToolResult<CorrelationRegimeResult>> {
  const params = (input ?? {}) as CorrelationRegimeInput;
  return analyzeCorrelationRegime(params, env);
}
