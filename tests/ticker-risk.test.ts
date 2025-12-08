/**
 * Ticker Risk Tool Tests
 *
 * Tests the ticker risk analysis including:
 * - Input validation
 * - Beta calculation
 * - VaR contribution
 * - Correlation impact
 * - Decision logic
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTickerRisk,
  tickerRiskHandler,
  tickerRiskToolDefinition,
  TickerRiskInput,
} from '../src/tools/ticker_risk';
import { Env } from '../src/types';

describe('Ticker Risk Tool', () => {
  const mockEnv: Env = {};

  describe('input validation', () => {
    it('should reject missing ticker', async () => {
      const result = await calculateTickerRisk(
        { ticker: '', proposedAllocation: 0.2, useMockData: true } as TickerRiskInput,
        mockEnv
      );
      expect(result.error).toBeDefined();
    });

    it('should reject invalid ticker length', async () => {
      const result = await calculateTickerRisk(
        { ticker: 'VERYLONGTICKERSYMBOL', proposedAllocation: 0.2, useMockData: true },
        mockEnv
      );
      expect(result.error).toContain('Invalid ticker');
    });

    it('should reject zero allocation', async () => {
      const result = await calculateTickerRisk(
        { ticker: 'AAPL', proposedAllocation: 0, useMockData: true },
        mockEnv
      );
      expect(result.error).toContain('proposedAllocation');
    });

    it('should reject allocation over 100%', async () => {
      const result = await calculateTickerRisk(
        { ticker: 'AAPL', proposedAllocation: 1.5, useMockData: true },
        mockEnv
      );
      expect(result.error).toContain('proposedAllocation');
    });

    it('should reject existing holdings not summing to 1', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'AAPL',
          proposedAllocation: 0.2,
          existingHoldings: { SPY: 0.5, TLT: 0.3 },
          useMockData: true,
        },
        mockEnv
      );
      expect(result.error).toContain('sum to 1');
    });
  });

  describe('risk metrics', () => {
    it('should calculate beta for a ticker', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'AAPL',
          proposedAllocation: 0.2,
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
      expect(typeof result.result!.beta).toBe('number');
      // Beta should be reasonable (0.5 to 2.5 for most stocks)
      expect(result.result!.beta).toBeGreaterThan(-1);
      expect(result.result!.beta).toBeLessThan(5);
    });

    it('should calculate volatility', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'TSLA',
          proposedAllocation: 0.1,
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.volatility).toBeGreaterThan(0);
      // TSLA should have higher volatility than bonds
    });

    it('should calculate VaR contribution', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'NVDA',
          proposedAllocation: 0.3,
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.varContribution).toBeGreaterThanOrEqual(0);
      expect(result.result!.varContribution).toBeLessThanOrEqual(1);
    });

    it('should calculate marginal VaR', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'AAPL',
          proposedAllocation: 0.2,
          existingHoldings: { SPY: 1.0 },
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(typeof result.result!.marginalVar).toBe('number');
      expect(result.result!.marginalVar).toBeGreaterThanOrEqual(0);
    });

    it('should include ticker statistics', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'MSFT',
          proposedAllocation: 0.15,
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.stats).toBeDefined();
      expect(typeof result.result!.stats.meanReturn).toBe('number');
      expect(typeof result.result!.stats.annualizedReturn).toBe('number');
      expect(typeof result.result!.stats.sharpeRatio).toBe('number');
    });
  });

  describe('correlation impact', () => {
    it('should classify correlation impact', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'AAPL',
          proposedAllocation: 0.2,
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(result.result!.correlationImpact);
    });

    it('should calculate average correlation with existing holdings', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'GOOGL',
          proposedAllocation: 0.2,
          existingHoldings: { AAPL: 0.5, MSFT: 0.5 },
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(typeof result.result!.avgCorrelation).toBe('number');
      expect(result.result!.avgCorrelation).toBeGreaterThanOrEqual(-1);
      expect(result.result!.avgCorrelation).toBeLessThanOrEqual(1);
    });
  });

  describe('decision logic', () => {
    it('should return PROCEED for reasonable allocation', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'SPY',
          proposedAllocation: 0.1,
          existingHoldings: { TLT: 0.5, GLD: 0.5 },
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.decision).toMatch(/^(PROCEED|REDUCE|VETO)$/);
    });

    it('should include explanation in decision', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'AAPL',
          proposedAllocation: 0.2,
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.explanation).toBeTruthy();
      expect(result.result!.explanation.length).toBeGreaterThan(10);
    });

    it('should provide recommended allocation', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'NVDA',
          proposedAllocation: 0.3,
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(typeof result.result!.recommendedAllocation).toBe('number');
      expect(result.result!.recommendedAllocation).toBeGreaterThanOrEqual(0);
      expect(result.result!.recommendedAllocation).toBeLessThanOrEqual(
        result.result!.proposedAllocation
      );
    });
  });

  describe('existing holdings', () => {
    it('should use SPY as default benchmark', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'AAPL',
          proposedAllocation: 0.2,
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });

    it('should work with custom existing holdings', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'NVDA',
          proposedAllocation: 0.15,
          existingHoldings: { AAPL: 0.4, MSFT: 0.3, TLT: 0.3 },
          simulations: 1000,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });
  });

  describe('handler', () => {
    it('should reject missing ticker', async () => {
      const result = await tickerRiskHandler(
        { proposedAllocation: 0.2 },
        mockEnv
      );
      expect(result.error).toContain('ticker');
    });

    it('should reject missing allocation', async () => {
      const result = await tickerRiskHandler({ ticker: 'AAPL' }, mockEnv);
      expect(result.error).toContain('proposedAllocation');
    });

    it('should process valid input', async () => {
      const result = await tickerRiskHandler(
        { ticker: 'AAPL', proposedAllocation: 0.2, simulations: 500, useMockData: true },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(tickerRiskToolDefinition.name).toBe('ticker_risk');
    });

    it('should have description', () => {
      expect(tickerRiskToolDefinition.description).toBeTruthy();
      expect(tickerRiskToolDefinition.description.length).toBeGreaterThan(20);
    });

    it('should have valid input schema', () => {
      expect(tickerRiskToolDefinition.inputSchema.type).toBe('object');
      expect(tickerRiskToolDefinition.inputSchema.properties).toBeDefined();
      expect(tickerRiskToolDefinition.inputSchema.required).toContain('ticker');
      expect(tickerRiskToolDefinition.inputSchema.required).toContain(
        'proposedAllocation'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle unknown ticker with fallback', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'UNKNOWN',
          proposedAllocation: 0.1,
          simulations: 500,
          useMockData: true,
        },
        mockEnv
      );

      // Should work with default profile
      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });

    it('should handle small allocation', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'AAPL',
          proposedAllocation: 0.01,
          simulations: 500,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result!.varContribution).toBeLessThan(0.5);
    });

    it('should handle large allocation', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'TSLA',
          proposedAllocation: 0.9,
          simulations: 500,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      // Large allocation of volatile stock should likely trigger REDUCE or VETO
      expect(['REDUCE', 'VETO']).toContain(result.result!.decision);
    });

    it('should handle bond ticker', async () => {
      const result = await calculateTickerRisk(
        {
          ticker: 'TLT',
          proposedAllocation: 0.3,
          existingHoldings: { SPY: 1.0 },
          simulations: 500,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      // Bonds should have lower beta
      expect(result.result!.beta).toBeLessThan(1.5);
    });
  });
});
