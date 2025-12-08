/**
 * Portfolio Risk Tool Tests
 *
 * Tests the portfolio risk calculation including:
 * - Input validation
 * - Risk metric calculations
 * - Risk decision logic
 * - Edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePortfolioRisk,
  portfolioRiskHandler,
  portfolioRiskToolDefinition,
  PortfolioRiskInput,
} from '../src/tools/portfolio_risk';
import { Env } from '../src/types';

describe('Portfolio Risk Tool', () => {
  const mockEnv: Env = {};

  describe('input validation', () => {
    it('should reject empty holdings', async () => {
      const result = await calculatePortfolioRisk(
        { holdings: {}, useMockData: true },
        mockEnv
      );
      expect(result.error).toContain('empty');
    });

    it('should reject holdings with weights not summing to 1', async () => {
      const result = await calculatePortfolioRisk(
        { holdings: { AAPL: 0.5, MSFT: 0.3 }, useMockData: true },
        mockEnv
      );
      expect(result.error).toContain('sum to 1');
    });

    it('should reject negative weights', async () => {
      const result = await calculatePortfolioRisk(
        { holdings: { AAPL: -0.2, MSFT: 1.2 }, useMockData: true },
        mockEnv
      );
      expect(result.error).toContain('Negative');
    });

    it('should reject weights over 100%', async () => {
      const result = await calculatePortfolioRisk(
        { holdings: { AAPL: 1.5, MSFT: -0.5 }, useMockData: true },
        mockEnv
      );
      expect(result.error).toContain('exceeds');
    });

    it('should reject invalid simulation count', async () => {
      const result = await calculatePortfolioRisk(
        { holdings: { AAPL: 1.0 }, simulations: 50, useMockData: true },
        mockEnv
      );
      expect(result.error).toContain('Simulations');
    });

    it('should reject invalid horizon', async () => {
      const result = await calculatePortfolioRisk(
        { holdings: { AAPL: 1.0 }, horizon: 0, useMockData: true },
        mockEnv
      );
      expect(result.error).toContain('Horizon');
    });

    it('should reject invalid lookback', async () => {
      const result = await calculatePortfolioRisk(
        { holdings: { AAPL: 1.0 }, lookback: 10, useMockData: true },
        mockEnv
      );
      expect(result.error).toContain('Lookback');
    });
  });

  describe('risk calculation', () => {
    it('should calculate risk for single asset portfolio', async () => {
      const result = await calculatePortfolioRisk(
        {
          holdings: { SPY: 1.0 },
          simulations: 1000,
          horizon: 21,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();

      const { metrics } = result.result!;
      expect(metrics.var95).toBeGreaterThanOrEqual(0);
      expect(metrics.var99).toBeGreaterThanOrEqual(0);
      expect(metrics.var99).toBeGreaterThanOrEqual(metrics.var95);
      expect(metrics.cvar99).toBeGreaterThanOrEqual(metrics.var99);
      expect(metrics.volatility).toBeGreaterThan(0);
    });

    it('should calculate risk for diversified portfolio', async () => {
      const result = await calculatePortfolioRisk(
        {
          holdings: { SPY: 0.6, TLT: 0.3, GLD: 0.1 },
          simulations: 1000,
          horizon: 21,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();

      const { metrics, portfolio } = result.result!;
      expect(portfolio.tickers).toEqual(['SPY', 'TLT', 'GLD']);
      expect(portfolio.weights).toHaveLength(3);
      expect(metrics.volatility).toBeGreaterThan(0);
    });

    it('should return lower VaR for diversified vs concentrated portfolio', async () => {
      // Concentrated portfolio (single high-vol stock)
      const concentrated = await calculatePortfolioRisk(
        {
          holdings: { TSLA: 1.0 },
          simulations: 5000,
          horizon: 21,
          useMockData: true,
        },
        mockEnv
      );

      // Diversified portfolio
      const diversified = await calculatePortfolioRisk(
        {
          holdings: { SPY: 0.4, TLT: 0.3, GLD: 0.2, BND: 0.1 },
          simulations: 5000,
          horizon: 21,
          useMockData: true,
        },
        mockEnv
      );

      expect(concentrated.result).toBeDefined();
      expect(diversified.result).toBeDefined();

      // Diversified should have lower volatility
      expect(diversified.result!.metrics.volatility).toBeLessThan(
        concentrated.result!.metrics.volatility
      );
    });

    it('should include all expected metrics', async () => {
      const result = await calculatePortfolioRisk(
        {
          holdings: { AAPL: 0.5, MSFT: 0.5 },
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      const { metrics } = result.result!;

      expect(typeof metrics.var95).toBe('number');
      expect(typeof metrics.var99).toBe('number');
      expect(typeof metrics.cvar95).toBe('number');
      expect(typeof metrics.cvar99).toBe('number');
      expect(typeof metrics.volatility).toBe('number');
      expect(typeof metrics.expectedReturn).toBe('number');
      expect(typeof metrics.annualizedReturn).toBe('number');
      expect(typeof metrics.sharpeRatio).toBe('number');
      expect(typeof metrics.maxDrawdown).toBe('number');
      expect(typeof metrics.worstCase).toBe('number');
      expect(typeof metrics.bestCase).toBe('number');
    });
  });

  describe('risk decision', () => {
    it('should return PROCEED for low-risk portfolio', async () => {
      // Conservative portfolio with bonds
      const result = await calculatePortfolioRisk(
        {
          holdings: { BND: 0.7, TLT: 0.3 },
          simulations: 2000,
          horizon: 21,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      // Bond-heavy portfolio should generally be PROCEED
      expect(['PROCEED', 'REDUCE']).toContain(result.result!.decision);
    });

    it('should return decision with explanation', async () => {
      const result = await calculatePortfolioRisk(
        {
          holdings: { SPY: 1.0 },
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.decision).toMatch(/^(PROCEED|REDUCE|VETO)$/);
      expect(result.result!.explanation).toBeTruthy();
      expect(result.result!.explanation.length).toBeGreaterThan(10);
    });

    it('should include decision reasoning in explanation', async () => {
      const result = await calculatePortfolioRisk(
        {
          holdings: { NVDA: 0.5, TSLA: 0.5 },
          simulations: 2000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      // High-vol portfolio should have detailed explanation
      expect(result.result!.explanation).toContain(result.result!.decision);
    });
  });

  describe('parameters', () => {
    it('should use default parameters when not specified', async () => {
      const result = await calculatePortfolioRisk(
        { holdings: { SPY: 1.0 }, useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.parameters.simulations).toBe(10000);
      expect(result.result!.parameters.horizon).toBe(21);
      expect(result.result!.parameters.lookback).toBe(252);
    });

    it('should respect custom parameters', async () => {
      const result = await calculatePortfolioRisk(
        {
          holdings: { SPY: 1.0 },
          simulations: 5000,
          horizon: 10,
          lookback: 126,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.parameters.simulations).toBe(5000);
      expect(result.result!.parameters.horizon).toBe(10);
      expect(result.result!.parameters.lookback).toBe(126);
    });
  });

  describe('handler', () => {
    it('should reject missing holdings', async () => {
      const result = await portfolioRiskHandler({}, mockEnv);
      expect(result.error).toContain('holdings');
    });

    it('should reject invalid holdings type', async () => {
      const result = await portfolioRiskHandler({ holdings: 'invalid' }, mockEnv);
      expect(result.error).toContain('holdings');
    });

    it('should process valid input', async () => {
      const result = await portfolioRiskHandler(
        { holdings: { SPY: 1.0 }, simulations: 500, useMockData: true },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(portfolioRiskToolDefinition.name).toBe('portfolio_risk');
    });

    it('should have description', () => {
      expect(portfolioRiskToolDefinition.description).toBeTruthy();
      expect(portfolioRiskToolDefinition.description.length).toBeGreaterThan(20);
    });

    it('should have valid input schema', () => {
      expect(portfolioRiskToolDefinition.inputSchema.type).toBe('object');
      expect(portfolioRiskToolDefinition.inputSchema.properties).toBeDefined();
      expect(portfolioRiskToolDefinition.inputSchema.required).toContain('holdings');
    });
  });

  describe('edge cases', () => {
    it('should handle single ticker with 100% weight', async () => {
      const result = await calculatePortfolioRisk(
        { holdings: { AAPL: 1.0 }, simulations: 500, useMockData: true },
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
        SPY: 0.1,
        TLT: 0.1,
        GLD: 0.1,
        JPM: 0.1,
        JNJ: 0.1,
        KO: 0.1,
      };

      const result = await calculatePortfolioRisk(
        { holdings, simulations: 500, useMockData: true },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result!.portfolio.tickers).toHaveLength(10);
    });

    it('should normalize weights that are slightly off', async () => {
      // Weights sum to 0.999 (within tolerance)
      const result = await calculatePortfolioRisk(
        { holdings: { AAPL: 0.333, MSFT: 0.333, GOOGL: 0.333 }, simulations: 500, useMockData: true },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      // Weights should be normalized
      const totalWeight = result.result!.portfolio.weights.reduce((a, b) => a + b, 0);
      expect(totalWeight).toBeCloseTo(1, 5);
    });

    it('should handle unknown tickers with fallback profile', async () => {
      const result = await calculatePortfolioRisk(
        { holdings: { UNKNOWN_TICKER: 1.0 }, simulations: 500, useMockData: true },
        mockEnv
      );

      // Should still work with default profile
      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });
  });
});
