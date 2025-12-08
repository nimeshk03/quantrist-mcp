/**
 * Monte Carlo Engine Tests
 *
 * Tests the simulation engine including:
 * - Cholesky decomposition correctness
 * - Box-Muller normal generation
 * - Portfolio simulation accuracy
 * - Reproducibility with seeds
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MonteCarloEngine, SimulationParams } from '../src/simulation/monte_carlo';
import { Statistics } from '../src/utils/statistics';

describe('MonteCarloEngine', () => {
  let engine: MonteCarloEngine;
  let stats: Statistics;

  beforeEach(() => {
    engine = new MonteCarloEngine(12345); // Fixed seed for reproducibility
    stats = new Statistics();
  });

  describe('choleskyDecomposition', () => {
    it('should decompose a simple 2x2 matrix', () => {
      const matrix = [
        [4, 2],
        [2, 5],
      ];
      const L = engine.choleskyDecomposition(matrix);

      // L should be lower triangular
      expect(L[0][1]).toBe(0);

      // L * L^T should equal original matrix
      const reconstructed = multiplyLLT(L);
      expect(reconstructed[0][0]).toBeCloseTo(matrix[0][0]);
      expect(reconstructed[0][1]).toBeCloseTo(matrix[0][1]);
      expect(reconstructed[1][0]).toBeCloseTo(matrix[1][0]);
      expect(reconstructed[1][1]).toBeCloseTo(matrix[1][1]);
    });

    it('should decompose a 3x3 covariance matrix', () => {
      // Realistic covariance matrix (annualized, ~20% vol each, 0.5 correlation)
      const matrix = [
        [0.04, 0.02, 0.02],
        [0.02, 0.04, 0.02],
        [0.02, 0.02, 0.04],
      ];
      const L = engine.choleskyDecomposition(matrix);

      // Verify L * L^T = original
      const reconstructed = multiplyLLT(L);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(reconstructed[i][j]).toBeCloseTo(matrix[i][j], 6);
        }
      }
    });

    it('should handle identity matrix', () => {
      const identity = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      const L = engine.choleskyDecomposition(identity);

      // Cholesky of identity is identity
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(L[i][j]).toBeCloseTo(identity[i][j]);
        }
      }
    });

    it('should handle diagonal matrix', () => {
      const diagonal = [
        [4, 0, 0],
        [0, 9, 0],
        [0, 0, 16],
      ];
      const L = engine.choleskyDecomposition(diagonal);

      // Diagonal of L should be sqrt of original diagonal
      expect(L[0][0]).toBeCloseTo(2);
      expect(L[1][1]).toBeCloseTo(3);
      expect(L[2][2]).toBeCloseTo(4);
    });
  });

  describe('generateStandardNormals', () => {
    it('should generate the requested number of values', () => {
      const normals = engine.generateStandardNormals(10);
      expect(normals).toHaveLength(10);
    });

    it('should generate values with mean close to 0 (large sample)', () => {
      engine.setSeed(42);
      const normals: number[] = [];
      for (let i = 0; i < 100; i++) {
        normals.push(...engine.generateStandardNormals(100));
      }

      const mean = stats.mean(normals);
      expect(mean).toBeCloseTo(0, 1); // Within 0.1 of 0
    });

    it('should generate values with stddev close to 1 (large sample)', () => {
      engine.setSeed(42);
      const normals: number[] = [];
      for (let i = 0; i < 100; i++) {
        normals.push(...engine.generateStandardNormals(100));
      }

      const stdDev = stats.stdDev(normals);
      expect(stdDev).toBeCloseTo(1, 1); // Within 0.1 of 1
    });

    it('should handle odd number of requested values', () => {
      const normals = engine.generateStandardNormals(5);
      expect(normals).toHaveLength(5);
    });
  });

  describe('matrixVectorMultiply', () => {
    it('should multiply lower triangular matrix by vector', () => {
      const L = [
        [2, 0, 0],
        [1, 3, 0],
        [2, 1, 4],
      ];
      const z = [1, 2, 3];

      const result = engine.matrixVectorMultiply(L, z);

      // Manual calculation:
      // result[0] = 2*1 = 2
      // result[1] = 1*1 + 3*2 = 7
      // result[2] = 2*1 + 1*2 + 4*3 = 16
      expect(result[0]).toBeCloseTo(2);
      expect(result[1]).toBeCloseTo(7);
      expect(result[2]).toBeCloseTo(16);
    });
  });

  describe('simulatePortfolio', () => {
    const baseParams: SimulationParams = {
      weights: [0.6, 0.4],
      meanReturns: [0.0004, 0.0002], // ~10% and ~5% annual
      covMatrix: [
        [0.0004, 0.0001], // ~20% vol, some correlation
        [0.0001, 0.0001], // ~10% vol
      ],
      paths: 1000,
      horizon: 21,
      seed: 12345,
    };

    it('should generate the correct number of paths', () => {
      const result = engine.simulatePortfolio(baseParams);
      expect(result.paths).toHaveLength(1000);
      expect(result.terminalReturns).toHaveLength(1000);
    });

    it('should generate paths with correct horizon length', () => {
      const result = engine.simulatePortfolio(baseParams);
      // Each path has horizon + 1 points (starting at 0)
      expect(result.paths[0]).toHaveLength(22);
    });

    it('should start each path at 0', () => {
      const result = engine.simulatePortfolio(baseParams);
      for (const path of result.paths.slice(0, 10)) {
        expect(path[0]).toBe(0);
      }
    });

    it('should produce sorted terminal returns', () => {
      const result = engine.simulatePortfolio(baseParams);
      for (let i = 1; i < result.sortedTerminalReturns.length; i++) {
        expect(result.sortedTerminalReturns[i]).toBeGreaterThanOrEqual(
          result.sortedTerminalReturns[i - 1]
        );
      }
    });

    it('should produce reasonable terminal return statistics', () => {
      const result = engine.simulatePortfolio(baseParams);

      // Mean should be positive (we have positive expected returns)
      expect(result.stats.meanTerminalReturn).toBeGreaterThan(-0.1);
      expect(result.stats.meanTerminalReturn).toBeLessThan(0.2);

      // StdDev should be reasonable
      expect(result.stats.stdDevTerminalReturn).toBeGreaterThan(0);
      expect(result.stats.stdDevTerminalReturn).toBeLessThan(0.5);
    });

    it('should be reproducible with same seed', () => {
      const result1 = engine.simulatePortfolio({ ...baseParams, seed: 99999 });
      const result2 = engine.simulatePortfolio({ ...baseParams, seed: 99999 });

      expect(result1.terminalReturns[0]).toBeCloseTo(result2.terminalReturns[0]);
      expect(result1.terminalReturns[100]).toBeCloseTo(result2.terminalReturns[100]);
    });

    it('should produce different results with different seeds', () => {
      const result1 = engine.simulatePortfolio({ ...baseParams, seed: 11111 });
      const result2 = engine.simulatePortfolio({ ...baseParams, seed: 22222 });

      // Very unlikely to be equal with different seeds
      expect(result1.terminalReturns[0]).not.toBeCloseTo(result2.terminalReturns[0], 5);
    });
  });

  describe('simulateTerminalReturns', () => {
    it('should return only terminal returns (memory efficient)', () => {
      const params: SimulationParams = {
        weights: [0.5, 0.5],
        meanReturns: [0.0003, 0.0002],
        covMatrix: [
          [0.0003, 0.0001],
          [0.0001, 0.0002],
        ],
        paths: 500,
        horizon: 21,
        seed: 12345,
      };

      const terminalReturns = engine.simulateTerminalReturns(params);
      expect(terminalReturns).toHaveLength(500);
    });

    it('should match full simulation terminal returns', () => {
      const params: SimulationParams = {
        weights: [0.6, 0.4],
        meanReturns: [0.0004, 0.0002],
        covMatrix: [
          [0.0004, 0.0001],
          [0.0001, 0.0001],
        ],
        paths: 100,
        horizon: 21,
        seed: 54321,
      };

      const fullResult = engine.simulatePortfolio(params);
      engine.setSeed(54321); // Reset seed
      const terminalOnly = engine.simulateTerminalReturns({ ...params, seed: 54321 });

      // Should produce same terminal returns
      for (let i = 0; i < 10; i++) {
        expect(terminalOnly[i]).toBeCloseTo(fullResult.terminalReturns[i]);
      }
    });
  });

  describe('input validation', () => {
    it('should throw error for mismatched weights and returns', () => {
      expect(() =>
        engine.simulatePortfolio({
          weights: [0.5, 0.5],
          meanReturns: [0.001], // Wrong length
          covMatrix: [
            [0.01, 0],
            [0, 0.01],
          ],
          paths: 100,
          horizon: 21,
        })
      ).toThrow('same length');
    });

    it('should throw error for non-square covariance matrix', () => {
      expect(() =>
        engine.simulatePortfolio({
          weights: [0.5, 0.5],
          meanReturns: [0.001, 0.001],
          covMatrix: [
            [0.01, 0, 0],
            [0, 0.01, 0],
          ],
          paths: 100,
          horizon: 21,
        })
      ).toThrow('square');
    });

    it('should throw error for weights not summing to 1', () => {
      expect(() =>
        engine.simulatePortfolio({
          weights: [0.5, 0.3], // Sums to 0.8
          meanReturns: [0.001, 0.001],
          covMatrix: [
            [0.01, 0],
            [0, 0.01],
          ],
          paths: 100,
          horizon: 21,
        })
      ).toThrow('sum to 1');
    });
  });

  describe('VaR calculation integration', () => {
    it('should produce valid VaR estimates', () => {
      // Use higher volatility to ensure we get negative returns in the tail
      const params: SimulationParams = {
        weights: [0.6, 0.4],
        meanReturns: [0.0001, 0.0001], // Lower mean
        covMatrix: [
          [0.0016, 0.0004], // Higher vol (~40% annualized)
          [0.0004, 0.0009], // (~30% annualized)
        ],
        paths: 10000,
        horizon: 21,
        seed: 42,
      };

      const result = engine.simulatePortfolio(params);

      // Calculate VaR at 99% and 95%
      // The 1st percentile should be negative (a loss)
      const percentile1 = stats.percentile(result.sortedTerminalReturns, 1);
      const percentile5 = stats.percentile(result.sortedTerminalReturns, 5);

      // 1st percentile should be less than 5th percentile
      expect(percentile1).toBeLessThan(percentile5);

      // The distribution should have both positive and negative returns
      expect(result.stats.minTerminalReturn).toBeLessThan(0);
      expect(result.stats.maxTerminalReturn).toBeGreaterThan(0);

      // VaR (as positive loss) should be reasonable
      const var99 = -percentile1;
      expect(var99).toBeLessThan(1); // Less than 100% loss
    });

    it('should produce valid CVaR estimates', () => {
      const params: SimulationParams = {
        weights: [0.6, 0.4],
        meanReturns: [0.0004, 0.0002],
        covMatrix: [
          [0.0004, 0.0001],
          [0.0001, 0.0001],
        ],
        paths: 10000,
        horizon: 21,
        seed: 42,
      };

      const result = engine.simulatePortfolio(params);

      // CVaR = average of worst 1% of returns
      const worstN = Math.floor(10000 * 0.01);
      const worstReturns = result.sortedTerminalReturns.slice(0, worstN);
      const cvar99 = -stats.mean(worstReturns);

      const var99 = -stats.percentile(result.sortedTerminalReturns, 1);

      // CVaR should be larger than VaR (it's the average of tail, not the threshold)
      expect(cvar99).toBeGreaterThan(var99);
    });
  });

  describe('single asset edge case', () => {
    it('should handle single asset portfolio', () => {
      const params: SimulationParams = {
        weights: [1.0],
        meanReturns: [0.0004],
        covMatrix: [[0.0004]],
        paths: 1000,
        horizon: 21,
        seed: 12345,
      };

      const result = engine.simulatePortfolio(params);
      expect(result.paths).toHaveLength(1000);
      expect(result.stats.stdDevTerminalReturn).toBeGreaterThan(0);
    });
  });
});

/**
 * Helper: Multiply L * L^T to verify Cholesky decomposition
 */
function multiplyLLT(L: number[][]): number[][] {
  const n = L.length;
  const result: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        result[i][j] += L[i][k] * L[j][k]; // L * L^T
      }
    }
  }

  return result;
}
