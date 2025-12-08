/**
 * Statistics Utilities Tests
 *
 * Tests all statistical functions used in risk calculations.
 * Uses known values to verify correctness.
 */

import { describe, it, expect } from 'vitest';
import { Statistics, stats } from '../src/utils/statistics';

describe('Statistics', () => {
  const statistics = new Statistics();

  describe('mean', () => {
    it('should calculate mean of simple array', () => {
      expect(statistics.mean([1, 2, 3, 4, 5])).toBe(3);
    });

    it('should calculate mean of single element', () => {
      expect(statistics.mean([42])).toBe(42);
    });

    it('should calculate mean with negative numbers', () => {
      expect(statistics.mean([-2, -1, 0, 1, 2])).toBe(0);
    });

    it('should calculate mean with decimals', () => {
      expect(statistics.mean([0.1, 0.2, 0.3])).toBeCloseTo(0.2);
    });

    it('should throw error for empty array', () => {
      expect(() => statistics.mean([])).toThrow('empty array');
    });
  });

  describe('variance', () => {
    it('should calculate sample variance', () => {
      // Sample variance of [1,2,3,4,5] = 2.5
      expect(statistics.variance([1, 2, 3, 4, 5])).toBeCloseTo(2.5);
    });

    it('should calculate variance of identical values as 0', () => {
      expect(statistics.variance([5, 5, 5, 5])).toBe(0);
    });

    it('should throw error for single element', () => {
      expect(() => statistics.variance([1])).toThrow('fewer than 2');
    });

    it('should throw error for empty array', () => {
      expect(() => statistics.variance([])).toThrow('fewer than 2');
    });
  });

  describe('stdDev', () => {
    it('should calculate standard deviation', () => {
      // stdDev of [1,2,3,4,5] = sqrt(2.5) ≈ 1.5811
      expect(statistics.stdDev([1, 2, 3, 4, 5])).toBeCloseTo(1.5811, 3);
    });

    it('should return 0 for identical values', () => {
      expect(statistics.stdDev([3, 3, 3, 3])).toBe(0);
    });
  });

  describe('covariance', () => {
    it('should calculate positive covariance for positively related data', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      expect(statistics.covariance(x, y)).toBeCloseTo(5);
    });

    it('should calculate negative covariance for negatively related data', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 8, 6, 4, 2];
      expect(statistics.covariance(x, y)).toBeCloseTo(-5);
    });

    it('should equal variance when comparing array with itself', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(statistics.covariance(arr, arr)).toBeCloseTo(statistics.variance(arr));
    });

    it('should throw error for different length arrays', () => {
      expect(() => statistics.covariance([1, 2, 3], [1, 2])).toThrow('same length');
    });

    it('should throw error for arrays with fewer than 2 elements', () => {
      expect(() => statistics.covariance([1], [1])).toThrow('fewer than 2');
    });
  });

  describe('correlation', () => {
    it('should return 1 for perfectly correlated data', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      expect(statistics.correlation(x, y)).toBeCloseTo(1);
    });

    it('should return -1 for perfectly negatively correlated data', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 8, 6, 4, 2];
      expect(statistics.correlation(x, y)).toBeCloseTo(-1);
    });

    it('should return 1 when comparing array with itself', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(statistics.correlation(arr, arr)).toBeCloseTo(1);
    });

    it('should return 0 for uncorrelated data', () => {
      // Orthogonal vectors have 0 correlation
      const x = [1, 0, -1, 0];
      const y = [0, 1, 0, -1];
      expect(statistics.correlation(x, y)).toBeCloseTo(0);
    });

    it('should return 0 when one array has zero variance', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [5, 5, 5, 5, 5];
      expect(statistics.correlation(x, y)).toBe(0);
    });
  });

  describe('covarianceMatrix', () => {
    it('should create symmetric matrix', () => {
      const arrays = [
        [1, 2, 3, 4, 5],
        [2, 4, 6, 8, 10],
        [5, 4, 3, 2, 1],
      ];
      const matrix = statistics.covarianceMatrix(arrays);

      // Check symmetry
      expect(matrix[0][1]).toBeCloseTo(matrix[1][0]);
      expect(matrix[0][2]).toBeCloseTo(matrix[2][0]);
      expect(matrix[1][2]).toBeCloseTo(matrix[2][1]);
    });

    it('should have variances on diagonal', () => {
      const arrays = [
        [1, 2, 3, 4, 5],
        [2, 4, 6, 8, 10],
      ];
      const matrix = statistics.covarianceMatrix(arrays);

      expect(matrix[0][0]).toBeCloseTo(statistics.variance(arrays[0]));
      expect(matrix[1][1]).toBeCloseTo(statistics.variance(arrays[1]));
    });

    it('should have covariances on off-diagonal', () => {
      const arrays = [
        [1, 2, 3, 4, 5],
        [2, 4, 6, 8, 10],
      ];
      const matrix = statistics.covarianceMatrix(arrays);

      expect(matrix[0][1]).toBeCloseTo(statistics.covariance(arrays[0], arrays[1]));
    });
  });

  describe('correlationMatrix', () => {
    it('should have 1s on diagonal', () => {
      const arrays = [
        [1, 2, 3, 4, 5],
        [2, 4, 6, 8, 10],
        [5, 4, 3, 2, 1],
      ];
      const matrix = statistics.correlationMatrix(arrays);

      expect(matrix[0][0]).toBe(1);
      expect(matrix[1][1]).toBe(1);
      expect(matrix[2][2]).toBe(1);
    });

    it('should be symmetric', () => {
      const arrays = [
        [1, 2, 3, 4, 5],
        [2, 4, 6, 8, 10],
        [5, 4, 3, 2, 1],
      ];
      const matrix = statistics.correlationMatrix(arrays);

      expect(matrix[0][1]).toBeCloseTo(matrix[1][0]);
      expect(matrix[0][2]).toBeCloseTo(matrix[2][0]);
      expect(matrix[1][2]).toBeCloseTo(matrix[2][1]);
    });

    it('should have correlations on off-diagonal', () => {
      const arrays = [
        [1, 2, 3, 4, 5],
        [2, 4, 6, 8, 10],
      ];
      const matrix = statistics.correlationMatrix(arrays);

      expect(matrix[0][1]).toBeCloseTo(1); // Perfectly correlated
    });
  });

  describe('percentile', () => {
    it('should calculate median (50th percentile)', () => {
      const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(statistics.percentile(sorted, 50)).toBeCloseTo(5.5);
    });

    it('should return first element for 0th percentile', () => {
      const sorted = [1, 2, 3, 4, 5];
      expect(statistics.percentile(sorted, 0)).toBe(1);
    });

    it('should return last element for 100th percentile', () => {
      const sorted = [1, 2, 3, 4, 5];
      expect(statistics.percentile(sorted, 100)).toBe(5);
    });

    it('should calculate 1st percentile (for 99% VaR)', () => {
      // Array of 100 elements from 1 to 100
      const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
      expect(statistics.percentile(sorted, 1)).toBeCloseTo(1.99);
    });

    it('should calculate 5th percentile (for 95% VaR)', () => {
      const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
      expect(statistics.percentile(sorted, 5)).toBeCloseTo(5.95);
    });

    it('should handle single element array', () => {
      expect(statistics.percentile([42], 50)).toBe(42);
    });

    it('should throw error for empty array', () => {
      expect(() => statistics.percentile([], 50)).toThrow('empty array');
    });

    it('should throw error for percentile < 0', () => {
      expect(() => statistics.percentile([1, 2, 3], -1)).toThrow('between 0 and 100');
    });

    it('should throw error for percentile > 100', () => {
      expect(() => statistics.percentile([1, 2, 3], 101)).toThrow('between 0 and 100');
    });
  });

  describe('dotProduct', () => {
    it('should calculate dot product', () => {
      expect(statistics.dotProduct([1, 2, 3], [4, 5, 6])).toBe(32); // 1*4 + 2*5 + 3*6
    });

    it('should return 0 for orthogonal vectors', () => {
      expect(statistics.dotProduct([1, 0], [0, 1])).toBe(0);
    });

    it('should work with portfolio weights and returns', () => {
      const weights = [0.6, 0.4];
      const returns = [0.10, 0.05];
      expect(statistics.dotProduct(weights, returns)).toBeCloseTo(0.08); // 60% * 10% + 40% * 5%
    });

    it('should throw error for different length vectors', () => {
      expect(() => statistics.dotProduct([1, 2], [1, 2, 3])).toThrow('same length');
    });
  });

  describe('quadraticForm', () => {
    it('should calculate portfolio variance', () => {
      // Simple 2-asset portfolio
      const weights = [0.6, 0.4];
      const covMatrix = [
        [0.04, 0.01], // Asset 1: 20% vol, covariance 0.01
        [0.01, 0.01], // Asset 2: 10% vol
      ];

      // Expected: w1^2*var1 + w2^2*var2 + 2*w1*w2*cov12
      // = 0.36*0.04 + 0.16*0.01 + 2*0.6*0.4*0.01
      // = 0.0144 + 0.0016 + 0.0048 = 0.0208
      expect(statistics.quadraticForm(weights, covMatrix)).toBeCloseTo(0.0208);
    });

    it('should return variance for single asset', () => {
      const weights = [1];
      const covMatrix = [[0.04]];
      expect(statistics.quadraticForm(weights, covMatrix)).toBeCloseTo(0.04);
    });

    it('should throw error for mismatched dimensions', () => {
      expect(() => statistics.quadraticForm([1, 2], [[1]])).toThrow('dimensions must match');
    });
  });

  describe('averageCorrelation', () => {
    it('should calculate average correlation with other assets', () => {
      const target = [1, 2, 3, 4, 5];
      const others = [
        [2, 4, 6, 8, 10], // Correlation = 1
        [5, 4, 3, 2, 1], // Correlation = -1
      ];

      expect(statistics.averageCorrelation(target, others)).toBeCloseTo(0);
    });

    it('should return 0 for empty others array', () => {
      expect(statistics.averageCorrelation([1, 2, 3], [])).toBe(0);
    });
  });

  describe('utility functions', () => {
    it('sum should add all elements', () => {
      expect(statistics.sum([1, 2, 3, 4, 5])).toBe(15);
    });

    it('sum of empty array should be 0', () => {
      expect(statistics.sum([])).toBe(0);
    });

    it('min should find minimum value', () => {
      expect(statistics.min([3, 1, 4, 1, 5])).toBe(1);
    });

    it('min should throw for empty array', () => {
      expect(() => statistics.min([])).toThrow('empty array');
    });

    it('max should find maximum value', () => {
      expect(statistics.max([3, 1, 4, 1, 5])).toBe(5);
    });

    it('max should throw for empty array', () => {
      expect(() => statistics.max([])).toThrow('empty array');
    });

    it('sort should return new sorted array', () => {
      const original = [3, 1, 4, 1, 5];
      const sorted = statistics.sort(original);

      expect(sorted).toEqual([1, 1, 3, 4, 5]);
      expect(original).toEqual([3, 1, 4, 1, 5]); // Original unchanged
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton stats instance', () => {
      expect(stats).toBeInstanceOf(Statistics);
      expect(stats.mean([1, 2, 3])).toBe(2);
    });
  });

  describe('real-world scenarios', () => {
    it('should calculate VaR from return distribution', () => {
      // Simulate 1000 returns, normally distributed around 0
      const returns = Array.from({ length: 1000 }, (_, i) => {
        // Simple deterministic "pseudo-random" for testing
        return Math.sin(i) * 0.02; // Returns between -2% and +2%
      });

      const sorted = statistics.sort(returns);
      const var99 = -statistics.percentile(sorted, 1);
      const var95 = -statistics.percentile(sorted, 5);

      // VaR should be positive (representing potential loss)
      expect(var99).toBeGreaterThan(0);
      expect(var95).toBeGreaterThan(0);
      // 99% VaR should be larger than 95% VaR
      expect(var99).toBeGreaterThan(var95);
    });

    it('should calculate portfolio statistics', () => {
      // Two assets with known characteristics
      const asset1Returns = [0.01, -0.02, 0.03, -0.01, 0.02];
      const asset2Returns = [0.005, -0.01, 0.015, -0.005, 0.01];

      const weights = [0.6, 0.4];
      const covMatrix = statistics.covarianceMatrix([asset1Returns, asset2Returns]);

      // Portfolio variance
      const portfolioVariance = statistics.quadraticForm(weights, covMatrix);
      expect(portfolioVariance).toBeGreaterThan(0);

      // Portfolio expected return
      const meanReturns = [statistics.mean(asset1Returns), statistics.mean(asset2Returns)];
      const expectedReturn = statistics.dotProduct(weights, meanReturns);
      expect(expectedReturn).toBeCloseTo(0.6 * 0.006 + 0.4 * 0.003);
    });
  });
});
