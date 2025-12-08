/**
 * Correlation Regime Tool Tests
 *
 * Tests the correlation regime analysis including:
 * - Input validation
 * - Regime detection
 * - Correlation pair identification
 * - Decision logic
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeCorrelationRegime,
  correlationRegimeHandler,
  correlationRegimeToolDefinition,
  CorrelationRegimeInput,
} from '../src/tools/correlation';
import { Env } from '../src/types';

describe('Correlation Regime Tool', () => {
  const mockEnv: Env = {};

  describe('input validation', () => {
    it('should reject less than 2 tickers', async () => {
      const result = await analyzeCorrelationRegime(
        { tickers: ['SPY'], useMockData: true },
        mockEnv
      );
      expect(result.error).toContain('2 tickers');
    });

    it('should reject more than 20 tickers', async () => {
      const tickers = Array.from({ length: 21 }, (_, i) => `TICK${i}`);
      const result = await analyzeCorrelationRegime(
        { tickers, useMockData: true },
        mockEnv
      );
      expect(result.error).toContain('20 tickers');
    });

    it('should reject invalid recent lookback', async () => {
      const result = await analyzeCorrelationRegime(
        { tickers: ['SPY', 'TLT'], recentLookback: 10, useMockData: true },
        mockEnv
      );
      expect(result.error).toContain('Recent lookback');
    });

    it('should reject historical lookback less than recent', async () => {
      const result = await analyzeCorrelationRegime(
        {
          tickers: ['SPY', 'TLT'],
          recentLookback: 100,
          historicalLookback: 50,
          useMockData: true,
        },
        mockEnv
      );
      expect(result.error).toContain('Historical lookback');
    });
  });

  describe('regime detection', () => {
    it('should detect a correlation regime', async () => {
      const result = await analyzeCorrelationRegime(
        { useMockData: true },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
      expect(['normal', 'elevated', 'crisis']).toContain(
        result.result!.currentRegime
      );
    });

    it('should calculate average correlation', async () => {
      const result = await analyzeCorrelationRegime(
        { useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.averageCorrelation).toBeGreaterThanOrEqual(-1);
      expect(result.result!.averageCorrelation).toBeLessThanOrEqual(1);
    });

    it('should calculate historical average', async () => {
      const result = await analyzeCorrelationRegime(
        { useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.historicalAverage).toBeGreaterThanOrEqual(-1);
      expect(result.result!.historicalAverage).toBeLessThanOrEqual(1);
    });

    it('should calculate correlation change', async () => {
      const result = await analyzeCorrelationRegime(
        { useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      const expectedChange =
        result.result!.averageCorrelation - result.result!.historicalAverage;
      expect(result.result!.correlationChange).toBeCloseTo(expectedChange, 5);
    });
  });

  describe('correlation pairs', () => {
    it('should identify high correlation pairs', async () => {
      const result = await analyzeCorrelationRegime(
        { tickers: ['AAPL', 'MSFT', 'GOOGL', 'TLT'], useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      // High correlation pairs should have correlation >= 0.75
      for (const pair of result.result!.highCorrelationPairs) {
        expect(pair.correlation).toBeGreaterThanOrEqual(0.75);
      }
    });

    it('should identify low correlation pairs', async () => {
      const result = await analyzeCorrelationRegime(
        { tickers: ['SPY', 'TLT', 'GLD'], useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      // Low correlation pairs should have correlation <= 0.30
      for (const pair of result.result!.lowCorrelationPairs) {
        expect(pair.correlation).toBeLessThanOrEqual(0.30);
      }
    });

    it('should identify rising correlation pairs', async () => {
      const result = await analyzeCorrelationRegime(
        { useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      // Rising pairs should have positive change
      for (const pair of result.result!.risingCorrelationPairs) {
        expect(pair.change).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include pair details', async () => {
      const result = await analyzeCorrelationRegime(
        { tickers: ['AAPL', 'MSFT'], useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      // Should have at least one pair
      const allPairs = [
        ...result.result!.highCorrelationPairs,
        ...result.result!.lowCorrelationPairs,
      ];

      if (allPairs.length > 0) {
        const pair = allPairs[0];
        expect(pair.pair).toHaveLength(2);
        expect(typeof pair.correlation).toBe('number');
        expect(typeof pair.change).toBe('number');
      }
    });
  });

  describe('regime change probability', () => {
    it('should estimate regime change probability', async () => {
      const result = await analyzeCorrelationRegime(
        { useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.regimeChangeProbability).toBeGreaterThanOrEqual(0);
      expect(result.result!.regimeChangeProbability).toBeLessThanOrEqual(1);
    });

    it('should have reasonable probability range', async () => {
      const result = await analyzeCorrelationRegime(
        { useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      // Probability should be between 5% and 90%
      expect(result.result!.regimeChangeProbability).toBeGreaterThanOrEqual(0.05);
      expect(result.result!.regimeChangeProbability).toBeLessThanOrEqual(0.90);
    });
  });

  describe('decision logic', () => {
    it('should return a valid decision', async () => {
      const result = await analyzeCorrelationRegime(
        { useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(['PROCEED', 'REDUCE', 'VETO']).toContain(result.result!.decision);
    });

    it('should include explanation', async () => {
      const result = await analyzeCorrelationRegime(
        { useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.explanation).toBeTruthy();
      expect(result.result!.explanation.length).toBeGreaterThan(20);
    });

    it('should return PROCEED for diversified assets', async () => {
      // Mix of uncorrelated assets
      const result = await analyzeCorrelationRegime(
        { tickers: ['SPY', 'TLT', 'GLD'], useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      // Should likely be PROCEED for diversified mix
      expect(['PROCEED', 'REDUCE']).toContain(result.result!.decision);
    });
  });

  describe('correlation matrices', () => {
    it('should return correlation matrices', async () => {
      const result = await analyzeCorrelationRegime(
        { tickers: ['SPY', 'TLT', 'GLD'], useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.matrices.recent).toBeDefined();
      expect(result.result!.matrices.historical).toBeDefined();
      expect(result.result!.matrices.tickers).toEqual(['SPY', 'TLT', 'GLD']);
    });

    it('should have square matrices', async () => {
      const tickers = ['SPY', 'TLT', 'GLD'];
      const result = await analyzeCorrelationRegime(
        { tickers, useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      const n = tickers.length;
      expect(result.result!.matrices.recent).toHaveLength(n);
      expect(result.result!.matrices.recent[0]).toHaveLength(n);
    });

    it('should have diagonal of 1s', async () => {
      const result = await analyzeCorrelationRegime(
        { tickers: ['SPY', 'TLT'], useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      const matrix = result.result!.matrices.recent;
      for (let i = 0; i < matrix.length; i++) {
        expect(matrix[i][i]).toBeCloseTo(1, 5);
      }
    });

    it('should be symmetric', async () => {
      const result = await analyzeCorrelationRegime(
        { tickers: ['SPY', 'TLT', 'GLD'], useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      const matrix = result.result!.matrices.recent;
      for (let i = 0; i < matrix.length; i++) {
        for (let j = 0; j < matrix.length; j++) {
          expect(matrix[i][j]).toBeCloseTo(matrix[j][i], 5);
        }
      }
    });
  });

  describe('handler', () => {
    it('should handle empty input', async () => {
      const result = await correlationRegimeHandler({}, mockEnv);

      // Should use defaults
      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });

    it('should handle null input', async () => {
      const result = await correlationRegimeHandler(null, mockEnv);

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });

    it('should process valid input', async () => {
      const result = await correlationRegimeHandler(
        { tickers: ['SPY', 'TLT'], useMockData: true },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(correlationRegimeToolDefinition.name).toBe('correlation_regime');
    });

    it('should have description', () => {
      expect(correlationRegimeToolDefinition.description).toBeTruthy();
      expect(correlationRegimeToolDefinition.description).toContain('correlation');
    });

    it('should have valid input schema', () => {
      expect(correlationRegimeToolDefinition.inputSchema.type).toBe('object');
      expect(correlationRegimeToolDefinition.inputSchema.properties).toBeDefined();
    });

    it('should not require any parameters', () => {
      expect(correlationRegimeToolDefinition.inputSchema.required).toEqual([]);
    });
  });

  describe('default tickers', () => {
    it('should use default tickers when none provided', async () => {
      const result = await analyzeCorrelationRegime(
        { useMockData: true },
        mockEnv
      );

      expect(result.result).toBeDefined();
      expect(result.result!.matrices.tickers).toContain('SPY');
      expect(result.result!.matrices.tickers).toContain('TLT');
      expect(result.result!.matrices.tickers).toContain('GLD');
    });
  });

  describe('edge cases', () => {
    it('should handle exactly 2 tickers', async () => {
      const result = await analyzeCorrelationRegime(
        { tickers: ['SPY', 'TLT'], useMockData: true },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });

    it('should handle unknown tickers', async () => {
      const result = await analyzeCorrelationRegime(
        { tickers: ['UNKNOWN1', 'UNKNOWN2'], useMockData: true },
        mockEnv
      );

      // Should work with default profiles
      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });

    it('should handle custom lookback periods', async () => {
      const result = await analyzeCorrelationRegime(
        {
          tickers: ['SPY', 'TLT'],
          recentLookback: 30,
          historicalLookback: 126,
          useMockData: true,
        },
        mockEnv
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });
  });
});
