/**
 * Stress Test Tool Tests
 *
 * Tests the stress test simulation including:
 * - Input validation
 * - Scenario calculations
 * - Decision logic
 * - Edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  runStressTest,
  stressTestHandler,
  stressTestToolDefinition,
  getAvailableScenarios,
  StressTestInput,
} from '../src/tools/stress_test';
import { Env } from '../src/types';

describe('Stress Test Tool', () => {
  const mockEnv: Env = {};

  describe('input validation', () => {
    it('should reject empty holdings', async () => {
      const result = await runStressTest({ holdings: {} }, mockEnv);
      expect(result.error).toContain('empty');
    });

    it('should reject missing holdings', async () => {
      const result = await runStressTest({} as StressTestInput, mockEnv);
      expect(result.error).toContain('holdings');
    });

    it('should reject negative weights', async () => {
      const result = await runStressTest(
        { holdings: { AAPL: -0.5, MSFT: 1.5 } },
        mockEnv
      );
      expect(result.error).toContain('Invalid weight');
    });

    it('should reject zero total weight', async () => {
      const result = await runStressTest(
        { holdings: { AAPL: 0, MSFT: 0 } },
        mockEnv
      );
      expect(result.error).toContain('zero');
    });

    it('should reject invalid scenarios', async () => {
      const result = await runStressTest(
        { holdings: { AAPL: 1.0 }, scenarios: ['invalid_scenario'] },
        mockEnv
      );
      expect(result.error).toContain('No valid scenarios');
    });
  });

  describe('scenario calculations', () => {
    it('should run all scenarios by default', async () => {
      const result = await runStressTest(
        { holdings: { SPY: 1.0 } },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();

      const scenarios = Object.keys(result.result!.scenarios);
      expect(scenarios).toContain('gfc_2008');
      expect(scenarios).toContain('covid_2020');
      expect(scenarios).toContain('flash_crash_2010');
      expect(scenarios).toContain('rate_shock_2022');
    });

    it('should run specific scenarios when requested', async () => {
      const result = await runStressTest(
        { holdings: { SPY: 1.0 }, scenarios: ['gfc_2008', 'covid_2020'] },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      const scenarios = Object.keys(result.result!.scenarios);
      expect(scenarios).toHaveLength(2);
      expect(scenarios).toContain('gfc_2008');
      expect(scenarios).toContain('covid_2020');
    });

    it('should calculate negative drawdowns for equity in crises', async () => {
      const result = await runStressTest(
        { holdings: { SPY: 1.0 } },
        mockEnv
      );

      expect(result.result).toBeDefined();
      const gfc = result.result!.scenarios['gfc_2008'];
      expect(gfc.portfolioDrawdown).toBeLessThan(0);
    });

    it('should show GFC as worst scenario for bank-heavy portfolio', async () => {
      const result = await runStressTest(
        { holdings: { JPM: 0.5, BAC: 0.5 } },
        mockEnv
      );

      expect(result.result).toBeDefined();
      // GFC should be worst for financials
      expect(result.result!.worstScenario.id).toBe('gfc_2008');
    });

    it('should show bonds as resilient in equity crashes', async () => {
      const result = await runStressTest(
        { holdings: { TLT: 0.5, BND: 0.5 } },
        mockEnv
      );

      expect(result.result).toBeDefined();
      const gfc = result.result!.scenarios['gfc_2008'];
      // Bonds should have positive or minimal negative return in GFC
      expect(gfc.portfolioDrawdown).toBeGreaterThan(-0.10);
    });

    it('should show GLD as defensive in crises', async () => {
      const result = await runStressTest(
        { holdings: { GLD: 1.0 } },
        mockEnv
      );

      expect(result.result).toBeDefined();
      const gfc = result.result!.scenarios['gfc_2008'];
      // Gold should perform better than equities
      expect(gfc.portfolioDrawdown).toBeGreaterThan(-0.40);
    });

    it('should identify worst and best tickers per scenario', async () => {
      const result = await runStressTest(
        { holdings: { AAPL: 0.25, JPM: 0.25, GLD: 0.25, TLT: 0.25 } },
        mockEnv
      );

      expect(result.result).toBeDefined();
      const gfc = result.result!.scenarios['gfc_2008'];

      expect(gfc.worstTicker).toBeDefined();
      expect(gfc.bestTicker).toBeDefined();
      expect(gfc.worstTickerDrawdown).toBeLessThanOrEqual(gfc.bestTickerDrawdown);
    });

    it('should calculate recovery time', async () => {
      const result = await runStressTest(
        { holdings: { SPY: 1.0 } },
        mockEnv
      );

      expect(result.result).toBeDefined();
      const gfc = result.result!.scenarios['gfc_2008'];
      expect(gfc.estimatedRecoveryDays).toBeGreaterThan(0);
    });
  });

  describe('decision logic', () => {
    it('should return PROCEED for conservative portfolio', async () => {
      const result = await runStressTest(
        { holdings: { TLT: 0.5, BND: 0.3, GLD: 0.2 } },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.decision).toBe('PROCEED');
    });

    it('should return REDUCE or VETO for aggressive portfolio', async () => {
      const result = await runStressTest(
        { holdings: { NVDA: 0.5, TSLA: 0.5 } },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(['REDUCE', 'VETO']).toContain(result.result!.decision);
    });

    it('should include explanation in decision', async () => {
      const result = await runStressTest(
        { holdings: { SPY: 1.0 } },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.explanation).toBeTruthy();
      expect(result.result!.explanation.length).toBeGreaterThan(20);
    });

    it('should identify worst scenario', async () => {
      const result = await runStressTest(
        { holdings: { SPY: 1.0 } },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.worstScenario.id).toBeTruthy();
      expect(result.result!.worstScenario.drawdown).toBeLessThan(0);
    });
  });

  describe('summary statistics', () => {
    it('should calculate average drawdown', async () => {
      const result = await runStressTest(
        { holdings: { SPY: 1.0 } },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(typeof result.result!.summary.avgDrawdown).toBe('number');
      expect(result.result!.summary.avgDrawdown).toBeLessThan(0);
    });

    it('should calculate max drawdown', async () => {
      const result = await runStressTest(
        { holdings: { SPY: 1.0 } },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.summary.maxDrawdown).toBeLessThanOrEqual(
        result.result!.summary.avgDrawdown
      );
    });

    it('should calculate average recovery days', async () => {
      const result = await runStressTest(
        { holdings: { SPY: 1.0 } },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.summary.avgRecoveryDays).toBeGreaterThan(0);
    });
  });

  describe('handler', () => {
    it('should reject missing holdings', async () => {
      const result = await stressTestHandler({}, mockEnv);
      expect(result.error).toContain('holdings');
    });

    it('should process valid input', async () => {
      const result = await stressTestHandler(
        { holdings: { SPY: 1.0 } },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(stressTestToolDefinition.name).toBe('stress_test');
    });

    it('should have description', () => {
      expect(stressTestToolDefinition.description).toBeTruthy();
      expect(stressTestToolDefinition.description).toContain('crisis');
    });

    it('should have valid input schema', () => {
      expect(stressTestToolDefinition.inputSchema.type).toBe('object');
      expect(stressTestToolDefinition.inputSchema.required).toContain('holdings');
    });
  });

  describe('available scenarios', () => {
    it('should list available scenarios', () => {
      const scenarios = getAvailableScenarios();
      expect(scenarios).toContain('gfc_2008');
      expect(scenarios).toContain('covid_2020');
      expect(scenarios).toContain('flash_crash_2010');
      expect(scenarios).toContain('rate_shock_2022');
    });
  });

  describe('edge cases', () => {
    it('should handle unknown tickers', async () => {
      const result = await runStressTest(
        { holdings: { UNKNOWN: 1.0 } },
        mockEnv
      );

      // Should work with default equity profile
      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });

    it('should handle single ticker', async () => {
      const result = await runStressTest(
        { holdings: { AAPL: 1.0 } },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result!.portfolio.tickers).toEqual(['AAPL']);
    });

    it('should handle many tickers', async () => {
      const holdings: Record<string, number> = {
        AAPL: 0.1,
        MSFT: 0.1,
        GOOGL: 0.1,
        AMZN: 0.1,
        JPM: 0.1,
        TLT: 0.1,
        GLD: 0.1,
        SPY: 0.1,
        BND: 0.1,
        XOM: 0.1,
      };

      const result = await runStressTest({ holdings }, mockEnv);

      expect(result.error).toBeUndefined();
      expect(result.result!.portfolio.tickers).toHaveLength(10);
    });

    it('should normalize weights', async () => {
      const result = await runStressTest(
        { holdings: { AAPL: 2, MSFT: 2 } },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      const weights = result.result!.portfolio.weights;
      const total = weights.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 5);
    });
  });
});
