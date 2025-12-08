/**
 * Monte Carlo Simulation Engine
 *
 * Generates simulated portfolio return paths using:
 * - Cholesky decomposition for correlated random variables
 * - Box-Muller transform for normal distribution generation
 * - Geometric Brownian Motion for return compounding
 *
 * Used for VaR/CVaR calculation via historical simulation.
 */

import { Statistics } from '../utils/statistics';

/**
 * Parameters for portfolio simulation
 */
export interface SimulationParams {
  /** Portfolio weights for each asset (must sum to 1) */
  weights: number[];
  /** Expected daily returns for each asset */
  meanReturns: number[];
  /** Covariance matrix of asset returns */
  covMatrix: number[][];
  /** Number of simulation paths to generate */
  paths: number;
  /** Number of days to simulate forward */
  horizon: number;
  /** Optional: random seed for reproducibility (not cryptographically secure) */
  seed?: number;
}

/**
 * Result of a Monte Carlo simulation
 */
export interface SimulationResult {
  /** All simulated paths: paths[i] = array of cumulative returns for path i */
  paths: number[][];
  /** Terminal returns (final value of each path) */
  terminalReturns: number[];
  /** Sorted terminal returns for percentile calculations */
  sortedTerminalReturns: number[];
  /** Statistics about the simulation */
  stats: {
    meanTerminalReturn: number;
    stdDevTerminalReturn: number;
    minTerminalReturn: number;
    maxTerminalReturn: number;
  };
}

/**
 * Monte Carlo Engine for portfolio simulation
 *
 * Uses Cholesky decomposition to generate correlated asset returns,
 * then simulates portfolio paths over a specified horizon.
 */
export class MonteCarloEngine {
  private stats: Statistics;
  private rngState: number;

  constructor(seed?: number) {
    this.stats = new Statistics();
    // Initialize RNG state (simple LCG for reproducibility)
    this.rngState = seed ?? Date.now();
  }

  /**
   * Simulate portfolio return paths
   *
   * @param params - Simulation parameters
   * @returns Simulation result with paths and statistics
   */
  simulatePortfolio(params: SimulationParams): SimulationResult {
    const { weights, meanReturns, covMatrix, paths, horizon, seed } = params;

    // Reset RNG if seed provided
    if (seed !== undefined) {
      this.rngState = seed;
    }

    const n = weights.length;

    // Validate inputs
    this.validateInputs(weights, meanReturns, covMatrix);

    // Cholesky decomposition of covariance matrix
    const L = this.choleskyDecomposition(covMatrix);

    // Extract standard deviations from covariance matrix diagonal
    const stdDevs = covMatrix.map((row, i) => Math.sqrt(row[i]));

    const allPaths: number[][] = [];
    const terminalReturns: number[] = [];

    // Generate simulation paths
    for (let p = 0; p < paths; p++) {
      const pathReturns: number[] = [0]; // Start at 0 cumulative return

      for (let t = 0; t < horizon; t++) {
        // Generate uncorrelated standard normals
        const z = this.generateStandardNormals(n);

        // Transform to correlated normals using Cholesky factor
        const correlatedZ = this.matrixVectorMultiply(L, z);

        // Calculate asset returns for this timestep
        // r_i = mu_i + sigma_i * z_i (where z_i is correlated)
        const assetReturns = meanReturns.map((mu, i) => {
          return mu + stdDevs[i] * correlatedZ[i];
        });

        // Calculate portfolio return (weighted sum)
        const portfolioReturn = this.stats.dotProduct(weights, assetReturns);

        // Compound cumulative return: (1 + R_cum) * (1 + r_t) - 1
        const prevCumReturn = pathReturns[pathReturns.length - 1];
        const newCumReturn = (1 + prevCumReturn) * (1 + portfolioReturn) - 1;
        pathReturns.push(newCumReturn);
      }

      allPaths.push(pathReturns);
      terminalReturns.push(pathReturns[pathReturns.length - 1]);
    }

    // Sort terminal returns for VaR calculation
    const sortedTerminalReturns = this.stats.sort(terminalReturns);

    // Calculate statistics
    const statsResult = {
      meanTerminalReturn: this.stats.mean(terminalReturns),
      stdDevTerminalReturn: this.stats.stdDev(terminalReturns),
      minTerminalReturn: this.stats.min(terminalReturns),
      maxTerminalReturn: this.stats.max(terminalReturns),
    };

    return {
      paths: allPaths,
      terminalReturns,
      sortedTerminalReturns,
      stats: statsResult,
    };
  }

  /**
   * Quick simulation returning only terminal returns (more memory efficient)
   *
   * @param params - Simulation parameters
   * @returns Array of terminal returns only
   */
  simulateTerminalReturns(params: SimulationParams): number[] {
    const { weights, meanReturns, covMatrix, paths, horizon, seed } = params;

    if (seed !== undefined) {
      this.rngState = seed;
    }

    const n = weights.length;
    this.validateInputs(weights, meanReturns, covMatrix);

    const L = this.choleskyDecomposition(covMatrix);
    const stdDevs = covMatrix.map((row, i) => Math.sqrt(row[i]));

    const terminalReturns: number[] = [];

    for (let p = 0; p < paths; p++) {
      let cumReturn = 0;

      for (let t = 0; t < horizon; t++) {
        const z = this.generateStandardNormals(n);
        const correlatedZ = this.matrixVectorMultiply(L, z);

        const assetReturns = meanReturns.map((mu, i) => mu + stdDevs[i] * correlatedZ[i]);
        const portfolioReturn = this.stats.dotProduct(weights, assetReturns);

        cumReturn = (1 + cumReturn) * (1 + portfolioReturn) - 1;
      }

      terminalReturns.push(cumReturn);
    }

    return terminalReturns;
  }

  /**
   * Cholesky decomposition: A = L * L^T
   *
   * Decomposes a positive semi-definite matrix into a lower triangular matrix.
   * Used for generating correlated random variables.
   *
   * @param matrix - Symmetric positive semi-definite matrix
   * @returns Lower triangular matrix L
   */
  choleskyDecomposition(matrix: number[][]): number[][] {
    const n = matrix.length;
    const L: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;

        if (j === i) {
          // Diagonal elements
          for (let k = 0; k < j; k++) {
            sum += L[j][k] * L[j][k];
          }
          const diag = matrix[j][j] - sum;
          // Handle numerical issues (slightly negative due to floating point)
          L[j][j] = diag > 0 ? Math.sqrt(diag) : 0;
        } else {
          // Off-diagonal elements
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
   * Generate n standard normal random variables using Box-Muller transform
   *
   * The Box-Muller transform converts pairs of uniform random variables
   * to pairs of independent standard normal random variables.
   *
   * @param n - Number of standard normals to generate
   * @returns Array of n standard normal random values
   */
  generateStandardNormals(n: number): number[] {
    const result: number[] = [];

    for (let i = 0; i < n; i += 2) {
      // Generate two uniform random numbers in (0, 1)
      const u1 = this.nextRandom();
      const u2 = this.nextRandom();

      // Avoid log(0)
      const safeU1 = Math.max(u1, 1e-10);

      // Box-Muller transform
      const z1 = Math.sqrt(-2 * Math.log(safeU1)) * Math.cos(2 * Math.PI * u2);
      const z2 = Math.sqrt(-2 * Math.log(safeU1)) * Math.sin(2 * Math.PI * u2);

      result.push(z1);
      if (i + 1 < n) {
        result.push(z2);
      }
    }

    return result;
  }

  /**
   * Matrix-vector multiplication: L * z
   *
   * For lower triangular matrix L, this is efficient as we only
   * need to consider elements where j <= i.
   *
   * @param L - Lower triangular matrix
   * @param z - Vector
   * @returns Result vector
   */
  matrixVectorMultiply(L: number[][], z: number[]): number[] {
    const n = L.length;
    const result: number[] = Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        result[i] += L[i][j] * z[j];
      }
    }

    return result;
  }

  /**
   * Simple Linear Congruential Generator for reproducible random numbers
   *
   * Not cryptographically secure, but sufficient for Monte Carlo simulation.
   * Uses the same parameters as glibc.
   *
   * @returns Random number in [0, 1)
   */
  private nextRandom(): number {
    // LCG parameters (glibc)
    const a = 1103515245;
    const c = 12345;
    const m = 2 ** 31;

    this.rngState = (a * this.rngState + c) % m;
    return this.rngState / m;
  }

  /**
   * Validate simulation inputs
   */
  private validateInputs(
    weights: number[],
    meanReturns: number[],
    covMatrix: number[][]
  ): void {
    const n = weights.length;

    if (meanReturns.length !== n) {
      throw new Error('Weights and mean returns must have the same length');
    }

    if (covMatrix.length !== n) {
      throw new Error('Covariance matrix dimensions must match number of assets');
    }

    for (const row of covMatrix) {
      if (row.length !== n) {
        throw new Error('Covariance matrix must be square');
      }
    }

    // Check weights sum to approximately 1
    const weightSum = this.stats.sum(weights);
    if (Math.abs(weightSum - 1) > 0.01) {
      throw new Error(`Weights must sum to 1, got ${weightSum.toFixed(4)}`);
    }
  }

  /**
   * Set the random seed for reproducibility
   */
  setSeed(seed: number): void {
    this.rngState = seed;
  }
}

/**
 * Singleton instance for convenience
 */
export const mcEngine = new MonteCarloEngine();
