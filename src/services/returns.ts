/**
 * Returns Service
 *
 * Provides historical return data for assets.
 * This implementation uses mock data for testing.
 * Milestone 3.2 will add live Yahoo Finance integration.
 */

import { Env } from '../types';

/**
 * Asset profile defining characteristics for mock data generation
 */
export interface AssetProfile {
  /** Expected annual return */
  annualReturn: number;
  /** Annual volatility (standard deviation) */
  annualVolatility: number;
  /** Asset class for correlation grouping */
  assetClass: 'equity' | 'bond' | 'commodity' | 'crypto';
  /** Sector within asset class */
  sector?: string;
}

/**
 * Predefined asset profiles for common tickers
 * Based on historical characteristics
 */
export const ASSET_PROFILES: Record<string, AssetProfile> = {
  // US Large Cap Tech
  AAPL: { annualReturn: 0.15, annualVolatility: 0.28, assetClass: 'equity', sector: 'tech' },
  MSFT: { annualReturn: 0.14, annualVolatility: 0.25, assetClass: 'equity', sector: 'tech' },
  GOOGL: { annualReturn: 0.12, annualVolatility: 0.27, assetClass: 'equity', sector: 'tech' },
  AMZN: { annualReturn: 0.13, annualVolatility: 0.32, assetClass: 'equity', sector: 'tech' },
  NVDA: { annualReturn: 0.25, annualVolatility: 0.45, assetClass: 'equity', sector: 'tech' },
  META: { annualReturn: 0.12, annualVolatility: 0.35, assetClass: 'equity', sector: 'tech' },
  TSLA: { annualReturn: 0.20, annualVolatility: 0.55, assetClass: 'equity', sector: 'tech' },

  // US Large Cap Financials
  JPM: { annualReturn: 0.10, annualVolatility: 0.25, assetClass: 'equity', sector: 'financial' },
  BAC: { annualReturn: 0.08, annualVolatility: 0.30, assetClass: 'equity', sector: 'financial' },
  GS: { annualReturn: 0.09, annualVolatility: 0.28, assetClass: 'equity', sector: 'financial' },

  // US Large Cap Healthcare
  JNJ: { annualReturn: 0.08, annualVolatility: 0.15, assetClass: 'equity', sector: 'healthcare' },
  UNH: { annualReturn: 0.12, annualVolatility: 0.22, assetClass: 'equity', sector: 'healthcare' },

  // US Large Cap Consumer
  WMT: { annualReturn: 0.07, annualVolatility: 0.18, assetClass: 'equity', sector: 'consumer' },
  KO: { annualReturn: 0.06, annualVolatility: 0.14, assetClass: 'equity', sector: 'consumer' },

  // ETFs - Broad Market
  SPY: { annualReturn: 0.10, annualVolatility: 0.18, assetClass: 'equity', sector: 'index' },
  QQQ: { annualReturn: 0.12, annualVolatility: 0.22, assetClass: 'equity', sector: 'index' },
  IWM: { annualReturn: 0.08, annualVolatility: 0.22, assetClass: 'equity', sector: 'index' },
  VTI: { annualReturn: 0.10, annualVolatility: 0.17, assetClass: 'equity', sector: 'index' },

  // Bonds
  TLT: { annualReturn: 0.03, annualVolatility: 0.15, assetClass: 'bond', sector: 'treasury' },
  IEF: { annualReturn: 0.02, annualVolatility: 0.08, assetClass: 'bond', sector: 'treasury' },
  BND: { annualReturn: 0.025, annualVolatility: 0.05, assetClass: 'bond', sector: 'aggregate' },
  LQD: { annualReturn: 0.04, annualVolatility: 0.08, assetClass: 'bond', sector: 'corporate' },
  HYG: { annualReturn: 0.05, annualVolatility: 0.12, assetClass: 'bond', sector: 'highyield' },

  // Commodities
  GLD: { annualReturn: 0.05, annualVolatility: 0.15, assetClass: 'commodity', sector: 'precious' },
  SLV: { annualReturn: 0.04, annualVolatility: 0.25, assetClass: 'commodity', sector: 'precious' },
  USO: { annualReturn: 0.02, annualVolatility: 0.35, assetClass: 'commodity', sector: 'energy' },

  // Crypto (high vol)
  BTC: { annualReturn: 0.30, annualVolatility: 0.70, assetClass: 'crypto' },
  ETH: { annualReturn: 0.25, annualVolatility: 0.80, assetClass: 'crypto' },
};

/**
 * Correlation matrix between asset classes
 * Used to generate realistic correlated returns
 */
const ASSET_CLASS_CORRELATIONS: Record<string, Record<string, number>> = {
  equity: { equity: 0.7, bond: -0.2, commodity: 0.3, crypto: 0.4 },
  bond: { equity: -0.2, bond: 0.6, commodity: 0.1, crypto: 0.0 },
  commodity: { equity: 0.3, bond: 0.1, commodity: 0.5, crypto: 0.2 },
  crypto: { equity: 0.4, bond: 0.0, commodity: 0.2, crypto: 0.8 },
};

/**
 * Sector correlations within equity asset class
 */
const SECTOR_CORRELATIONS: Record<string, Record<string, number>> = {
  tech: { tech: 0.85, financial: 0.6, healthcare: 0.5, consumer: 0.55, index: 0.8 },
  financial: { tech: 0.6, financial: 0.8, healthcare: 0.5, consumer: 0.6, index: 0.75 },
  healthcare: { tech: 0.5, financial: 0.5, healthcare: 0.75, consumer: 0.6, index: 0.7 },
  consumer: { tech: 0.55, financial: 0.6, healthcare: 0.6, consumer: 0.7, index: 0.7 },
  index: { tech: 0.8, financial: 0.75, healthcare: 0.7, consumer: 0.7, index: 0.95 },
};

/**
 * Returns Service for fetching historical return data
 */
export class ReturnsService {
  private env: Env;
  private useMockData: boolean;
  private rngState: number;

  constructor(env: Env, options?: { useMockData?: boolean; seed?: number }) {
    this.env = env;
    this.useMockData = options?.useMockData ?? true; // Default to mock for now
    this.rngState = options?.seed ?? 42; // Fixed seed for reproducibility
  }

  /**
   * Get historical daily returns for multiple tickers
   *
   * @param tickers - Array of ticker symbols
   * @param lookbackDays - Number of historical days
   * @returns Map of ticker to array of daily returns
   */
  async getReturns(
    tickers: string[],
    lookbackDays: number
  ): Promise<Record<string, number[]>> {
    if (this.useMockData) {
      return this.generateMockReturns(tickers, lookbackDays);
    }

    // Live data will be implemented in Milestone 3.2
    throw new Error('Live data not yet implemented. Use mock data.');
  }

  /**
   * Generate mock returns with realistic characteristics
   *
   * Uses asset profiles and correlation structure to create
   * synthetic but realistic return series.
   */
  private generateMockReturns(
    tickers: string[],
    days: number
  ): Record<string, number[]> {
    const results: Record<string, number[]> = {};

    // Get profiles for all tickers
    const profiles = tickers.map((t) => this.getAssetProfile(t));

    // Generate base random series for each ticker
    const baseReturns: number[][] = tickers.map(() => {
      const returns: number[] = [];
      for (let i = 0; i < days; i++) {
        returns.push(this.nextGaussian());
      }
      return returns;
    });

    // Apply correlations between assets
    const correlatedReturns = this.applyCorrelations(tickers, profiles, baseReturns);

    // Scale by volatility and add mean
    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      const profile = profiles[i];

      // Convert annual to daily
      const dailyMean = profile.annualReturn / 252;
      const dailyVol = profile.annualVolatility / Math.sqrt(252);

      // Scale returns
      results[ticker] = correlatedReturns[i].map((r) => dailyMean + dailyVol * r);
    }

    return results;
  }

  /**
   * Apply correlation structure to independent random returns
   */
  private applyCorrelations(
    tickers: string[],
    profiles: AssetProfile[],
    baseReturns: number[][]
  ): number[][] {
    const n = tickers.length;
    const days = baseReturns[0].length;

    // Build correlation matrix
    const corrMatrix: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          corrMatrix[i][j] = 1;
        } else {
          corrMatrix[i][j] = this.getCorrelation(profiles[i], profiles[j]);
        }
      }
    }

    // Cholesky decomposition
    const L = this.choleskyDecomposition(corrMatrix);

    // Apply correlation for each day
    const correlatedReturns: number[][] = Array(n)
      .fill(null)
      .map(() => Array(days).fill(0));

    for (let d = 0; d < days; d++) {
      // Get uncorrelated returns for this day
      const z = baseReturns.map((r) => r[d]);

      // Apply Cholesky factor
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j <= i; j++) {
          sum += L[i][j] * z[j];
        }
        correlatedReturns[i][d] = sum;
      }
    }

    return correlatedReturns;
  }

  /**
   * Get correlation between two assets based on their profiles
   */
  private getCorrelation(profile1: AssetProfile, profile2: AssetProfile): number {
    // Same asset class
    if (profile1.assetClass === profile2.assetClass) {
      // Check sector correlation for equities
      if (
        profile1.assetClass === 'equity' &&
        profile1.sector &&
        profile2.sector
      ) {
        return SECTOR_CORRELATIONS[profile1.sector]?.[profile2.sector] ?? 0.6;
      }
      // Same asset class, no sector info
      return ASSET_CLASS_CORRELATIONS[profile1.assetClass][profile1.assetClass];
    }

    // Different asset classes
    return ASSET_CLASS_CORRELATIONS[profile1.assetClass][profile2.assetClass];
  }

  /**
   * Get asset profile for a ticker, with fallback for unknown tickers
   */
  private getAssetProfile(ticker: string): AssetProfile {
    if (ASSET_PROFILES[ticker]) {
      return ASSET_PROFILES[ticker];
    }

    // Default profile for unknown tickers (assume equity-like)
    return {
      annualReturn: 0.08,
      annualVolatility: 0.25,
      assetClass: 'equity',
      sector: 'index',
    };
  }

  /**
   * Simple Cholesky decomposition for correlation matrix
   */
  private choleskyDecomposition(matrix: number[][]): number[][] {
    const n = matrix.length;
    const L: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;

        if (j === i) {
          for (let k = 0; k < j; k++) {
            sum += L[j][k] * L[j][k];
          }
          const diag = matrix[j][j] - sum;
          L[j][j] = diag > 0 ? Math.sqrt(diag) : 0;
        } else {
          for (let k = 0; k < j; k++) {
            sum += L[i][k] * L[j][k];
          }
          L[i][j] = L[j][j] !== 0 ? (matrix[i][j] - sum) / L[j][j] : 0;
        }
      }
    }

    return L;
  }

  /**
   * Generate a standard normal random variable using Box-Muller
   */
  private nextGaussian(): number {
    const u1 = Math.max(this.nextRandom(), 1e-10);
    const u2 = this.nextRandom();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Simple LCG random number generator
   */
  private nextRandom(): number {
    const a = 1103515245;
    const c = 12345;
    const m = 2 ** 31;
    this.rngState = (a * this.rngState + c) % m;
    return this.rngState / m;
  }

  /**
   * Set random seed for reproducibility
   */
  setSeed(seed: number): void {
    this.rngState = seed;
  }

  /**
   * Check if a ticker is known (has a profile)
   */
  isKnownTicker(ticker: string): boolean {
    return ticker in ASSET_PROFILES;
  }

  /**
   * Get list of all known tickers
   */
  getKnownTickers(): string[] {
    return Object.keys(ASSET_PROFILES);
  }

  /**
   * Get asset profile (public accessor)
   */
  getProfile(ticker: string): AssetProfile {
    return this.getAssetProfile(ticker);
  }
}

/**
 * Create a returns service with mock data
 */
export function createMockReturnsService(seed?: number): ReturnsService {
  return new ReturnsService({}, { useMockData: true, seed });
}
