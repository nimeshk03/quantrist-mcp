/**
 * Stress Test Tool
 *
 * Simulates portfolio performance under historical crisis scenarios:
 * - GFC 2008: Global Financial Crisis
 * - COVID 2020: Pandemic market crash
 * - Flash Crash 2010: May 6th flash crash
 * - Rate Shock 2022: Fed rate hike cycle
 *
 * Returns drawdowns, worst performers, and risk decision
 */

import { Env, MCPToolResult, RiskDecision } from '../types';
import { Statistics } from '../utils/statistics';
import { ASSET_PROFILES } from '../services/returns';

/**
 * Historical stress scenario definition
 */
interface StressScenario {
  /** Scenario identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the event */
  description: string;
  /** Duration in trading days */
  durationDays: number;
  /** Typical recovery time in days */
  recoveryDays: number;
  /** Asset class drawdowns (as negative percentages) */
  assetClassDrawdowns: Record<string, number>;
  /** Sector-specific adjustments */
  sectorAdjustments: Record<string, number>;
}

/**
 * Historical stress scenarios
 */
const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: 'gfc_2008',
    name: 'Global Financial Crisis (2008)',
    description: 'Lehman collapse, credit freeze, bank failures',
    durationDays: 250,
    recoveryDays: 900,
    assetClassDrawdowns: {
      equity: -0.55,
      bond: 0.05,
      commodity: -0.35,
      crypto: -0.80, // Bitcoin didn't exist, but crypto would crash
      reit: -0.65,
      cash: 0.0,
    },
    sectorAdjustments: {
      technology: 0.05, // Slightly better than market
      financial: -0.25, // Much worse
      healthcare: 0.10, // Defensive
      consumer: -0.05,
      energy: -0.15,
      industrial: -0.10,
      utilities: 0.15, // Defensive
      materials: -0.10,
      communication: 0.0,
      realestate: -0.20,
    },
  },
  {
    id: 'covid_2020',
    name: 'COVID-19 Crash (2020)',
    description: 'Pandemic lockdowns, fastest bear market in history',
    durationDays: 23,
    recoveryDays: 150,
    assetClassDrawdowns: {
      equity: -0.34,
      bond: 0.03,
      commodity: -0.25,
      crypto: -0.50,
      reit: -0.40,
      cash: 0.0,
    },
    sectorAdjustments: {
      technology: 0.15, // Work from home beneficiary
      financial: -0.10,
      healthcare: 0.10,
      consumer: -0.15, // Retail hit hard
      energy: -0.30, // Oil crash
      industrial: -0.10,
      utilities: 0.05,
      materials: -0.05,
      communication: 0.10,
      realestate: -0.15,
    },
  },
  {
    id: 'flash_crash_2010',
    name: 'Flash Crash (May 2010)',
    description: 'Algorithmic trading cascade, intraday crash',
    durationDays: 1,
    recoveryDays: 5,
    assetClassDrawdowns: {
      equity: -0.09,
      bond: 0.01,
      commodity: -0.03,
      crypto: -0.15,
      reit: -0.08,
      cash: 0.0,
    },
    sectorAdjustments: {
      technology: -0.02,
      financial: -0.03,
      healthcare: 0.01,
      consumer: -0.02,
      energy: -0.01,
      industrial: -0.02,
      utilities: 0.02,
      materials: -0.01,
      communication: -0.01,
      realestate: -0.02,
    },
  },
  {
    id: 'rate_shock_2022',
    name: 'Rate Shock (2022)',
    description: 'Aggressive Fed rate hikes, growth stock selloff',
    durationDays: 280,
    recoveryDays: 400,
    assetClassDrawdowns: {
      equity: -0.25,
      bond: -0.15, // Bonds also fell
      commodity: 0.10, // Inflation hedge
      crypto: -0.75,
      reit: -0.30,
      cash: 0.02,
    },
    sectorAdjustments: {
      technology: -0.15, // Growth hit hardest
      financial: 0.05, // Banks benefit from rates
      healthcare: 0.05,
      consumer: -0.05,
      energy: 0.20, // Energy boom
      industrial: 0.0,
      utilities: 0.05,
      materials: 0.05,
      communication: -0.10,
      realestate: -0.10,
    },
  },
];

/**
 * Input parameters for stress test
 */
export interface StressTestInput {
  /** Portfolio holdings: ticker -> weight */
  holdings: Record<string, number>;
  /** Specific scenarios to run (default: all) */
  scenarios?: string[];
  /** Use mock data for testing */
  useMockData?: boolean;
}

/**
 * Result for a single scenario
 */
export interface ScenarioResult {
  /** Scenario identifier */
  id: string;
  /** Scenario name */
  name: string;
  /** Portfolio drawdown (negative percentage) */
  portfolioDrawdown: number;
  /** Worst performing ticker */
  worstTicker: string;
  /** Worst ticker drawdown */
  worstTickerDrawdown: number;
  /** Best performing ticker */
  bestTicker: string;
  /** Best ticker drawdown (or gain) */
  bestTickerDrawdown: number;
  /** Estimated recovery time in days */
  estimatedRecoveryDays: number;
  /** Per-ticker drawdowns */
  tickerDrawdowns: Record<string, number>;
}

/**
 * Complete stress test result
 */
export interface StressTestResult {
  /** Results for each scenario */
  scenarios: Record<string, ScenarioResult>;
  /** Worst case scenario */
  worstScenario: {
    id: string;
    name: string;
    drawdown: number;
  };
  /** Risk decision */
  decision: RiskDecision;
  /** Human-readable explanation */
  explanation: string;
  /** Portfolio summary */
  portfolio: {
    tickers: string[];
    weights: number[];
  };
  /** Summary statistics */
  summary: {
    avgDrawdown: number;
    maxDrawdown: number;
    avgRecoveryDays: number;
  };
}

/**
 * Risk thresholds for stress test
 */
const THRESHOLDS = {
  /** Drawdown above this triggers VETO */
  drawdown_veto: 0.40, // 40% loss
  /** Drawdown above this triggers REDUCE */
  drawdown_reduce: 0.30, // 30% loss
  /** Recovery time above this triggers REDUCE */
  recovery_reduce: 500, // 500 days
};

/**
 * Run stress test on portfolio
 */
export async function runStressTest(
  input: StressTestInput,
  _env: Env
): Promise<MCPToolResult<StressTestResult>> {
  const stats = new Statistics();

  // Validate input
  const validation = validateInput(input);
  if (validation.error) {
    return { error: validation.error };
  }

  const { holdings } = input;
  const tickers = Object.keys(holdings);
  const weights = Object.values(holdings);

  // Normalize weights
  const totalWeight = stats.sum(weights);
  const normalizedWeights = weights.map((w) => w / totalWeight);

  // Select scenarios to run
  const scenariosToRun = input.scenarios
    ? STRESS_SCENARIOS.filter((s) => input.scenarios!.includes(s.id))
    : STRESS_SCENARIOS;

  if (scenariosToRun.length === 0) {
    return { error: 'No valid scenarios specified' };
  }

  try {
    // Run each scenario
    const scenarioResults: Record<string, ScenarioResult> = {};

    for (const scenario of scenariosToRun) {
      const result = runScenario(scenario, tickers, normalizedWeights);
      scenarioResults[scenario.id] = result;
    }

    // Find worst scenario
    let worstScenario = { id: '', name: '', drawdown: 0 };
    for (const [id, result] of Object.entries(scenarioResults)) {
      if (result.portfolioDrawdown < worstScenario.drawdown) {
        worstScenario = {
          id,
          name: result.name,
          drawdown: result.portfolioDrawdown,
        };
      }
    }

    // Calculate summary statistics
    const drawdowns = Object.values(scenarioResults).map(
      (r) => r.portfolioDrawdown
    );
    const recoveryTimes = Object.values(scenarioResults).map(
      (r) => r.estimatedRecoveryDays
    );

    const summary = {
      avgDrawdown: stats.mean(drawdowns),
      maxDrawdown: stats.min(drawdowns), // Most negative
      avgRecoveryDays: stats.mean(recoveryTimes),
    };

    // Determine decision
    const { decision, explanation } = determineDecision(
      worstScenario,
      summary,
      scenarioResults
    );

    return {
      result: {
        scenarios: scenarioResults,
        worstScenario,
        decision,
        explanation,
        portfolio: {
          tickers,
          weights: normalizedWeights,
        },
        summary,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { error: `Stress test failed: ${message}` };
  }
}

/**
 * Validate input parameters
 */
function validateInput(input: StressTestInput): { error?: string } {
  if (!input.holdings || typeof input.holdings !== 'object') {
    return { error: 'Missing required parameter: holdings' };
  }

  const tickers = Object.keys(input.holdings);
  const weights = Object.values(input.holdings);

  if (tickers.length === 0) {
    return { error: 'Holdings cannot be empty' };
  }

  if (tickers.length > 50) {
    return { error: 'Maximum 50 holdings supported' };
  }

  for (let i = 0; i < weights.length; i++) {
    if (typeof weights[i] !== 'number' || weights[i] < 0) {
      return { error: `Invalid weight for ${tickers[i]}` };
    }
  }

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) {
    return { error: 'Total weight cannot be zero' };
  }

  return {};
}

/**
 * Run a single stress scenario
 */
function runScenario(
  scenario: StressScenario,
  tickers: string[],
  weights: number[]
): ScenarioResult {
  const tickerDrawdowns: Record<string, number> = {};

  // Calculate drawdown for each ticker
  for (const ticker of tickers) {
    const drawdown = calculateTickerDrawdown(ticker, scenario);
    tickerDrawdowns[ticker] = drawdown;
  }

  // Calculate portfolio drawdown (weighted average)
  let portfolioDrawdown = 0;
  for (let i = 0; i < tickers.length; i++) {
    portfolioDrawdown += weights[i] * tickerDrawdowns[tickers[i]];
  }

  // Find worst and best tickers
  let worstTicker = tickers[0];
  let worstDrawdown = tickerDrawdowns[tickers[0]];
  let bestTicker = tickers[0];
  let bestDrawdown = tickerDrawdowns[tickers[0]];

  for (const ticker of tickers) {
    if (tickerDrawdowns[ticker] < worstDrawdown) {
      worstTicker = ticker;
      worstDrawdown = tickerDrawdowns[ticker];
    }
    if (tickerDrawdowns[ticker] > bestDrawdown) {
      bestTicker = ticker;
      bestDrawdown = tickerDrawdowns[ticker];
    }
  }

  // Estimate recovery time based on drawdown severity
  const drawdownSeverity = Math.abs(portfolioDrawdown) / 0.50; // Normalized to 50% max
  const estimatedRecoveryDays = Math.round(
    scenario.recoveryDays * Math.min(1, drawdownSeverity)
  );

  return {
    id: scenario.id,
    name: scenario.name,
    portfolioDrawdown,
    worstTicker,
    worstTickerDrawdown: worstDrawdown,
    bestTicker,
    bestTickerDrawdown: bestDrawdown,
    estimatedRecoveryDays,
    tickerDrawdowns,
  };
}

/**
 * Calculate expected drawdown for a ticker in a scenario
 */
function calculateTickerDrawdown(
  ticker: string,
  scenario: StressScenario
): number {
  // Get asset profile
  const profile = ASSET_PROFILES[ticker];

  // Default to equity if unknown
  const assetClass = profile?.assetClass ?? 'equity';
  const rawSector = profile?.sector ?? 'technology';
  
  // Map short sector names to full names used in scenarios
  const sectorMap: Record<string, string> = {
    tech: 'technology',
    financial: 'financial',
    healthcare: 'healthcare',
    consumer: 'consumer',
    energy: 'energy',
    industrial: 'industrial',
    utilities: 'utilities',
    materials: 'materials',
    communication: 'communication',
    realestate: 'realestate',
  };
  const sector = sectorMap[rawSector] ?? rawSector;

  // Base drawdown from asset class
  let drawdown = scenario.assetClassDrawdowns[assetClass] ?? -0.30;

  // Apply sector adjustment for equities
  if (assetClass === 'equity' && scenario.sectorAdjustments[sector]) {
    drawdown += scenario.sectorAdjustments[sector];
  }

  // Apply volatility scaling (higher vol = more extreme moves)
  const volatility = profile?.annualVolatility ?? 0.25;
  const volMultiplier = volatility / 0.20; // Normalized to 20% vol
  
  // Scale drawdown by volatility (but cap the effect)
  if (drawdown < 0) {
    drawdown *= Math.min(1.5, Math.max(0.5, volMultiplier));
  }

  // Apply implied beta effect based on volatility (higher vol = higher beta typically)
  // Approximate beta from volatility ratio to market (SPY ~20% vol)
  const impliedBeta = volatility / 0.18;
  if (drawdown < 0 && assetClass === 'equity') {
    drawdown *= Math.min(1.5, Math.max(0.5, impliedBeta));
  }

  return drawdown;
}

/**
 * Determine risk decision based on stress test results
 */
function determineDecision(
  worstScenario: { id: string; name: string; drawdown: number },
  summary: { avgDrawdown: number; maxDrawdown: number; avgRecoveryDays: number },
  _scenarioResults: Record<string, ScenarioResult>
): { decision: RiskDecision; explanation: string } {
  const worstDrawdown = Math.abs(worstScenario.drawdown);

  // Check VETO condition
  if (worstDrawdown > THRESHOLDS.drawdown_veto) {
    return {
      decision: 'VETO',
      explanation: `VETO: Portfolio would lose ${(worstDrawdown * 100).toFixed(0)}% in ${worstScenario.name}, exceeding ${(THRESHOLDS.drawdown_veto * 100).toFixed(0)}% threshold. Unacceptable tail risk.`,
    };
  }

  // Check REDUCE conditions
  const reasons: string[] = [];

  if (worstDrawdown > THRESHOLDS.drawdown_reduce) {
    reasons.push(
      `Worst-case drawdown of ${(worstDrawdown * 100).toFixed(0)}% exceeds ${(THRESHOLDS.drawdown_reduce * 100).toFixed(0)}% threshold`
    );
  }

  if (summary.avgRecoveryDays > THRESHOLDS.recovery_reduce) {
    reasons.push(
      `Average recovery time of ${Math.round(summary.avgRecoveryDays)} days exceeds ${THRESHOLDS.recovery_reduce} day threshold`
    );
  }

  if (reasons.length > 0) {
    return {
      decision: 'REDUCE',
      explanation: `REDUCE: ${reasons.join('; ')}. Consider adding defensive assets or reducing concentration.`,
    };
  }

  // All clear
  return {
    decision: 'PROCEED',
    explanation: `PROCEED: Portfolio shows resilience across stress scenarios. Worst case: ${(worstDrawdown * 100).toFixed(0)}% drawdown in ${worstScenario.name}. Average recovery: ${Math.round(summary.avgRecoveryDays)} days.`,
  };
}

/**
 * MCP Tool Definition for stress_test
 */
export const stressTestToolDefinition = {
  name: 'stress_test',
  description:
    'Simulate portfolio performance under historical crisis scenarios (GFC 2008, COVID 2020, Flash Crash, Rate Shock 2022). Returns drawdowns, worst performers, and risk decision.',
  inputSchema: {
    type: 'object',
    properties: {
      holdings: {
        type: 'object',
        description:
          'Portfolio holdings as ticker:weight pairs. Example: {"AAPL": 0.25, "JPM": 0.25, "GLD": 0.25, "TLT": 0.25}',
        additionalProperties: { type: 'number' },
      },
      scenarios: {
        type: 'array',
        description:
          'Specific scenarios to run. Options: gfc_2008, covid_2020, flash_crash_2010, rate_shock_2022. Defaults to all.',
        items: { type: 'string' },
      },
    },
    required: ['holdings'],
  },
};

/**
 * MCP Tool Handler for stress_test
 */
export async function stressTestHandler(
  input: unknown,
  env: Env
): Promise<MCPToolResult<StressTestResult>> {
  const params = input as StressTestInput;

  if (!params.holdings || typeof params.holdings !== 'object') {
    return { error: 'Missing required parameter: holdings' };
  }

  return runStressTest(params, env);
}

/**
 * Get available scenario IDs
 */
export function getAvailableScenarios(): string[] {
  return STRESS_SCENARIOS.map((s) => s.id);
}
