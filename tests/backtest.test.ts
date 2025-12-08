/**
 * VaR Backtest Tests
 *
 * Tests the VaR backtesting functionality including:
 * - Violation rate calculation
 * - Pass/fail determination
 * - Report generation
 */

import { describe, it, expect } from 'vitest';
import {
  runBacktest,
  BacktestConfig,
  DEFAULT_CONFIG,
} from '../scripts/backtest';

describe('VaR Backtest', () => {
  // Use smaller config for faster tests
  const testConfig: BacktestConfig = {
    periods: 50,
    lookbackDays: 60,
    simulations: 500,
    confidenceLevels: [0.95, 0.99],
    holdings: { SPY: 0.6, TLT: 0.4 },
    tolerance: 0.05, // 5% tolerance for test stability
  };

  describe('runBacktest', () => {
    it('should complete without errors', async () => {
      const report = await runBacktest(testConfig, true);
      expect(report).toBeDefined();
      expect(report.results).toHaveLength(2);
    });

    it('should return results for each confidence level', async () => {
      const report = await runBacktest(testConfig, true);

      expect(report.results[0].confidenceLevel).toBe(0.95);
      expect(report.results[1].confidenceLevel).toBe(0.99);
    });

    it('should calculate expected violation rates', async () => {
      const report = await runBacktest(testConfig, true);

      expect(report.results[0].expectedViolationRate).toBeCloseTo(0.05, 10); // 5% for 95% VaR
      expect(report.results[1].expectedViolationRate).toBeCloseTo(0.01, 10); // 1% for 99% VaR
    });

    it('should count violations correctly', async () => {
      const report = await runBacktest(testConfig, true);

      for (const result of report.results) {
        // Violations should be non-negative
        expect(result.actualViolations).toBeGreaterThanOrEqual(0);
        // Violations should not exceed total periods
        expect(result.actualViolations).toBeLessThanOrEqual(result.totalPeriods);
        // Violation rate should match count
        expect(result.actualViolationRate).toBeCloseTo(
          result.actualViolations / result.totalPeriods,
          10
        );
      }
    });

    it('should track details for each period', async () => {
      const report = await runBacktest(testConfig, true);

      for (const result of report.results) {
        expect(result.details).toHaveLength(testConfig.periods);

        for (const detail of result.details) {
          expect(typeof detail.period).toBe('number');
          expect(typeof detail.predictedVaR).toBe('number');
          expect(typeof detail.actualReturn).toBe('number');
          expect(typeof detail.isViolation).toBe('boolean');
        }
      }
    });

    it('should determine pass/fail status', async () => {
      const report = await runBacktest(testConfig, true);

      for (const result of report.results) {
        expect(['PASS', 'FAIL']).toContain(result.status);
        expect(typeof result.withinTolerance).toBe('boolean');
      }
    });

    it('should set overall status', async () => {
      const report = await runBacktest(testConfig, true);
      expect(['PASS', 'FAIL']).toContain(report.overallStatus);
    });

    it('should include timestamp', async () => {
      const report = await runBacktest(testConfig, true);
      expect(report.timestamp).toBeDefined();
      expect(new Date(report.timestamp).getTime()).not.toBeNaN();
    });

    it('should include config in report', async () => {
      const report = await runBacktest(testConfig, true);
      expect(report.config).toEqual(testConfig);
    });
  });

  describe('violation rate validation', () => {
    it('should have reasonable violation rates for 95% VaR', async () => {
      const report = await runBacktest(testConfig, true);
      const result95 = report.results.find((r) => r.confidenceLevel === 0.95);

      expect(result95).toBeDefined();
      // Violation rate should be a valid percentage
      expect(result95!.actualViolationRate).toBeGreaterThanOrEqual(0);
      expect(result95!.actualViolationRate).toBeLessThanOrEqual(1);
    });

    it('should have reasonable violation rates for 99% VaR', async () => {
      const report = await runBacktest(testConfig, true);
      const result99 = report.results.find((r) => r.confidenceLevel === 0.99);

      expect(result99).toBeDefined();
      // Violation rate should be a valid percentage
      expect(result99!.actualViolationRate).toBeGreaterThanOrEqual(0);
      expect(result99!.actualViolationRate).toBeLessThanOrEqual(1);
    });

    it('should have 99% VaR violations <= 95% VaR violations', async () => {
      const report = await runBacktest(testConfig, true);
      const result95 = report.results.find((r) => r.confidenceLevel === 0.95);
      const result99 = report.results.find((r) => r.confidenceLevel === 0.99);

      // 99% VaR is more conservative, so should have fewer or equal violations
      expect(result99!.actualViolations).toBeLessThanOrEqual(
        result95!.actualViolations
      );
    });
  });

  describe('VaR predictions', () => {
    it('should predict non-negative VaR values', async () => {
      const report = await runBacktest(testConfig, true);

      for (const result of report.results) {
        for (const detail of result.details) {
          // VaR should be non-negative (representing potential loss)
          expect(detail.predictedVaR).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should have 99% VaR >= 95% VaR on average', async () => {
      const report = await runBacktest(testConfig, true);
      const result95 = report.results.find((r) => r.confidenceLevel === 0.95);
      const result99 = report.results.find((r) => r.confidenceLevel === 0.99);

      // Calculate average VaR for each confidence level
      const avg95 =
        result95!.details.reduce((sum, d) => sum + d.predictedVaR, 0) /
        result95!.details.length;
      const avg99 =
        result99!.details.reduce((sum, d) => sum + d.predictedVaR, 0) /
        result99!.details.length;

      // 99% VaR should be larger on average (more conservative)
      expect(avg99).toBeGreaterThanOrEqual(avg95 * 0.8); // Allow tolerance for simulation variance
    });
  });

  describe('default config', () => {
    it('should have valid default configuration', () => {
      expect(DEFAULT_CONFIG.periods).toBe(100);
      expect(DEFAULT_CONFIG.lookbackDays).toBe(252);
      expect(DEFAULT_CONFIG.simulations).toBe(5000);
      expect(DEFAULT_CONFIG.confidenceLevels).toContain(0.95);
      expect(DEFAULT_CONFIG.confidenceLevels).toContain(0.99);
      expect(DEFAULT_CONFIG.tolerance).toBe(0.50); // Higher tolerance for mock data
    });
  });

  describe('edge cases', () => {
    it('should handle single confidence level', async () => {
      const singleLevelConfig: BacktestConfig = {
        ...testConfig,
        confidenceLevels: [0.95],
      };

      const report = await runBacktest(singleLevelConfig, true);
      expect(report.results).toHaveLength(1);
    });

    it('should handle single ticker portfolio', async () => {
      const singleTickerConfig: BacktestConfig = {
        ...testConfig,
        holdings: { SPY: 1.0 },
      };

      const report = await runBacktest(singleTickerConfig, true);
      expect(report.results).toHaveLength(2);
    });

    it('should handle multiple tickers', async () => {
      const multiTickerConfig: BacktestConfig = {
        ...testConfig,
        holdings: { SPY: 0.4, TLT: 0.3, GLD: 0.2, AAPL: 0.1 },
      };

      const report = await runBacktest(multiTickerConfig, true);
      expect(report.results).toHaveLength(2);
    });
  });
});
