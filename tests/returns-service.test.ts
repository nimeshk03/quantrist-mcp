/**
 * Returns Service Tests
 *
 * Tests the mock data generation including:
 * - Return series generation
 * - Asset profile characteristics
 * - Correlation structure
 * - Reproducibility
 * - Live data integration (with mocked fetch)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ReturnsService,
  ASSET_PROFILES,
  createMockReturnsService,
  createLiveReturnsService,
} from '../src/services/returns';
import { Statistics } from '../src/utils/statistics';
import { Env } from '../src/types';

describe('ReturnsService', () => {
  let service: ReturnsService;
  let stats: Statistics;

  beforeEach(() => {
    service = createMockReturnsService(12345);
    stats = new Statistics();
  });

  describe('getReturns', () => {
    it('should return correct number of days', async () => {
      const returns = await service.getReturns(['SPY'], 252);
      expect(returns['SPY']).toHaveLength(252);
    });

    it('should return data for all requested tickers', async () => {
      const tickers = ['AAPL', 'MSFT', 'GOOGL'];
      const returns = await service.getReturns(tickers, 100);

      for (const ticker of tickers) {
        expect(returns[ticker]).toBeDefined();
        expect(returns[ticker]).toHaveLength(100);
      }
    });

    it('should handle unknown tickers with default profile', async () => {
      const returns = await service.getReturns(['UNKNOWN_TICKER'], 50);
      expect(returns['UNKNOWN_TICKER']).toHaveLength(50);
    });

    it('should be reproducible with same seed', async () => {
      const service1 = createMockReturnsService(99999);
      const service2 = createMockReturnsService(99999);

      const returns1 = await service1.getReturns(['SPY'], 100);
      const returns2 = await service2.getReturns(['SPY'], 100);

      expect(returns1['SPY'][0]).toBeCloseTo(returns2['SPY'][0]);
      expect(returns1['SPY'][50]).toBeCloseTo(returns2['SPY'][50]);
    });

    it('should produce different results with different seeds', async () => {
      const service1 = createMockReturnsService(11111);
      const service2 = createMockReturnsService(22222);

      const returns1 = await service1.getReturns(['SPY'], 100);
      const returns2 = await service2.getReturns(['SPY'], 100);

      expect(returns1['SPY'][0]).not.toBeCloseTo(returns2['SPY'][0], 5);
    });
  });

  describe('return characteristics', () => {
    it('should produce returns with mean close to expected daily return', async () => {
      const returns = await service.getReturns(['SPY'], 1000);
      const meanReturn = stats.mean(returns['SPY']);

      // SPY expected annual return is 10%, daily is ~0.0004
      const expectedDailyReturn = ASSET_PROFILES['SPY'].annualReturn / 252;

      // Allow for sampling variance (within 2 standard errors)
      const dailyVol = ASSET_PROFILES['SPY'].annualVolatility / Math.sqrt(252);
      const standardError = dailyVol / Math.sqrt(1000);

      expect(meanReturn).toBeCloseTo(expectedDailyReturn, 1);
    });

    it('should produce returns with volatility close to expected', async () => {
      const returns = await service.getReturns(['SPY'], 1000);
      const stdDev = stats.stdDev(returns['SPY']);

      // SPY expected annual vol is 18%, daily is ~1.13%
      const expectedDailyVol = ASSET_PROFILES['SPY'].annualVolatility / Math.sqrt(252);

      // Allow 20% tolerance
      expect(stdDev).toBeGreaterThan(expectedDailyVol * 0.8);
      expect(stdDev).toBeLessThan(expectedDailyVol * 1.2);
    });

    it('should produce higher volatility for high-vol assets', async () => {
      const returns = await service.getReturns(['SPY', 'NVDA', 'TSLA'], 500);

      const spyVol = stats.stdDev(returns['SPY']);
      const nvdaVol = stats.stdDev(returns['NVDA']);
      const tslaVol = stats.stdDev(returns['TSLA']);

      // NVDA and TSLA should have higher vol than SPY
      expect(nvdaVol).toBeGreaterThan(spyVol);
      expect(tslaVol).toBeGreaterThan(spyVol);
    });
  });

  describe('correlation structure', () => {
    it('should produce positive correlation between tech stocks', async () => {
      const returns = await service.getReturns(['AAPL', 'MSFT', 'GOOGL'], 500);

      const corrAaplMsft = stats.correlation(returns['AAPL'], returns['MSFT']);
      const corrAaplGoogl = stats.correlation(returns['AAPL'], returns['GOOGL']);

      // Tech stocks should be positively correlated
      expect(corrAaplMsft).toBeGreaterThan(0.3);
      expect(corrAaplGoogl).toBeGreaterThan(0.3);
    });

    it('should produce negative correlation between stocks and bonds', async () => {
      const returns = await service.getReturns(['SPY', 'TLT'], 500);

      const corr = stats.correlation(returns['SPY'], returns['TLT']);

      // Stocks and long-term treasuries should be negatively correlated
      expect(corr).toBeLessThan(0);
    });

    it('should produce low correlation between stocks and gold', async () => {
      const returns = await service.getReturns(['SPY', 'GLD'], 500);

      const corr = stats.correlation(returns['SPY'], returns['GLD']);

      // Gold should have low correlation with stocks
      expect(Math.abs(corr)).toBeLessThan(0.5);
    });

    it('should produce high correlation between index ETFs', async () => {
      const returns = await service.getReturns(['SPY', 'VTI', 'QQQ'], 500);

      const corrSpyVti = stats.correlation(returns['SPY'], returns['VTI']);

      // SPY and VTI should be highly correlated (both broad market)
      expect(corrSpyVti).toBeGreaterThan(0.7);
    });
  });

  describe('asset profiles', () => {
    it('should have profiles for common tickers', () => {
      const commonTickers = ['AAPL', 'MSFT', 'SPY', 'TLT', 'GLD'];

      for (const ticker of commonTickers) {
        expect(ASSET_PROFILES[ticker]).toBeDefined();
        expect(service.isKnownTicker(ticker)).toBe(true);
      }
    });

    it('should return false for unknown tickers', () => {
      expect(service.isKnownTicker('UNKNOWN')).toBe(false);
    });

    it('should list all known tickers', () => {
      const tickers = service.getKnownTickers();

      expect(tickers).toContain('AAPL');
      expect(tickers).toContain('SPY');
      expect(tickers).toContain('TLT');
      expect(tickers.length).toBeGreaterThan(20);
    });

    it('should return profile for known ticker', () => {
      const profile = service.getProfile('AAPL');

      expect(profile.annualReturn).toBe(0.15);
      expect(profile.annualVolatility).toBe(0.28);
      expect(profile.assetClass).toBe('equity');
      expect(profile.sector).toBe('tech');
    });

    it('should return default profile for unknown ticker', () => {
      const profile = service.getProfile('UNKNOWN');

      expect(profile.annualReturn).toBe(0.08);
      expect(profile.annualVolatility).toBe(0.25);
      expect(profile.assetClass).toBe('equity');
    });
  });

  describe('asset class coverage', () => {
    it('should have equity assets', () => {
      const equities = Object.entries(ASSET_PROFILES)
        .filter(([_, p]) => p.assetClass === 'equity')
        .map(([t]) => t);

      expect(equities.length).toBeGreaterThan(10);
      expect(equities).toContain('AAPL');
      expect(equities).toContain('SPY');
    });

    it('should have bond assets', () => {
      const bonds = Object.entries(ASSET_PROFILES)
        .filter(([_, p]) => p.assetClass === 'bond')
        .map(([t]) => t);

      expect(bonds.length).toBeGreaterThan(3);
      expect(bonds).toContain('TLT');
      expect(bonds).toContain('BND');
    });

    it('should have commodity assets', () => {
      const commodities = Object.entries(ASSET_PROFILES)
        .filter(([_, p]) => p.assetClass === 'commodity')
        .map(([t]) => t);

      expect(commodities.length).toBeGreaterThan(1);
      expect(commodities).toContain('GLD');
    });

    it('should have crypto assets', () => {
      const crypto = Object.entries(ASSET_PROFILES)
        .filter(([_, p]) => p.assetClass === 'crypto')
        .map(([t]) => t);

      expect(crypto.length).toBeGreaterThan(0);
      expect(crypto).toContain('BTC');
    });
  });

  describe('integration with Monte Carlo', () => {
    it('should produce returns suitable for covariance matrix calculation', async () => {
      const tickers = ['SPY', 'TLT', 'GLD'];
      const returns = await service.getReturns(tickers, 252);

      // Build covariance matrix
      const arrays = tickers.map((t) => returns[t]);
      const covMatrix = stats.covarianceMatrix(arrays);

      // Covariance matrix should be valid
      expect(covMatrix.length).toBe(3);
      expect(covMatrix[0].length).toBe(3);

      // Diagonal should be positive (variances)
      expect(covMatrix[0][0]).toBeGreaterThan(0);
      expect(covMatrix[1][1]).toBeGreaterThan(0);
      expect(covMatrix[2][2]).toBeGreaterThan(0);

      // Should be symmetric
      expect(covMatrix[0][1]).toBeCloseTo(covMatrix[1][0]);
      expect(covMatrix[0][2]).toBeCloseTo(covMatrix[2][0]);
    });

    it('should produce returns with realistic daily magnitudes', async () => {
      const returns = await service.getReturns(['SPY'], 252);

      // Most daily returns should be between -5% and +5%
      const extremeReturns = returns['SPY'].filter(
        (r) => Math.abs(r) > 0.05
      );

      // Less than 5% should be extreme
      expect(extremeReturns.length / 252).toBeLessThan(0.05);
    });
  });

  describe('edge cases', () => {
    it('should handle single day request', async () => {
      const returns = await service.getReturns(['SPY'], 1);
      expect(returns['SPY']).toHaveLength(1);
    });

    it('should handle single ticker request', async () => {
      const returns = await service.getReturns(['AAPL'], 100);
      expect(Object.keys(returns)).toHaveLength(1);
      expect(returns['AAPL']).toHaveLength(100);
    });

    it('should handle many tickers request', async () => {
      const tickers = service.getKnownTickers().slice(0, 10);
      const returns = await service.getReturns(tickers, 50);

      expect(Object.keys(returns)).toHaveLength(10);
      for (const ticker of tickers) {
        expect(returns[ticker]).toHaveLength(50);
      }
    });
  });

  describe('live data service', () => {
    it('should create live service with factory function', () => {
      const liveService = createLiveReturnsService({});
      expect(liveService.hasLiveDataSupport()).toBe(true);
      expect(liveService.hasCacheSupport()).toBe(false);
    });

    it('should report cache support when KV is available', () => {
      const mockKV = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      };

      const env = { RETURNS_CACHE: mockKV } as unknown as Env;
      const liveService = createLiveReturnsService(env);

      expect(liveService.hasCacheSupport()).toBe(true);
    });

    it('should fall back to mock data when fetch fails', async () => {
      // Mock fetch to fail
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      try {
        const liveService = createLiveReturnsService({}, true);
        const returns = await liveService.getReturns(['SPY'], 100);

        // Should have fallen back to mock data
        expect(returns['SPY']).toHaveLength(100);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should throw error when fallback is disabled and fetch fails', async () => {
      // Mock fetch to fail
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      try {
        const liveService = createLiveReturnsService({}, false);

        await expect(liveService.getReturns(['SPY'], 100)).rejects.toThrow(
          'Network error'
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should parse Yahoo Finance response correctly', async () => {
      // Mock successful Yahoo Finance response
      const mockResponse = {
        chart: {
          result: [
            {
              meta: { symbol: 'SPY', regularMarketPrice: 450 },
              timestamp: [1, 2, 3, 4, 5],
              indicators: {
                adjclose: [
                  {
                    adjclose: [100, 101, 102, 101.5, 103],
                  },
                ],
              },
            },
          ],
          error: null,
        },
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      try {
        const liveService = createLiveReturnsService({}, false);
        const returns = await liveService.getReturns(['SPY'], 4);

        // Should have 4 returns (5 prices = 4 returns)
        expect(returns['SPY']).toHaveLength(4);

        // Verify return calculations
        // Return 1: (101 - 100) / 100 = 0.01
        expect(returns['SPY'][0]).toBeCloseTo(0.01);
        // Return 2: (102 - 101) / 101 ≈ 0.0099
        expect(returns['SPY'][1]).toBeCloseTo(0.0099, 3);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should handle Yahoo Finance API errors', async () => {
      const mockResponse = {
        chart: {
          result: null,
          error: {
            code: 'Not Found',
            description: 'No data found for ticker INVALID',
          },
        },
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      try {
        const liveService = createLiveReturnsService({}, false);

        await expect(liveService.getReturns(['INVALID'], 100)).rejects.toThrow(
          'No data found'
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should use cached data when available', async () => {
      const cachedReturns = [0.01, 0.02, -0.01, 0.015, 0.005];

      const mockKV = {
        get: vi.fn().mockResolvedValue(JSON.stringify(cachedReturns)),
        put: vi.fn(),
        delete: vi.fn(),
      };

      const env = { RETURNS_CACHE: mockKV } as unknown as Env;
      const liveService = createLiveReturnsService(env);

      // Should not call fetch since data is cached
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn();

      try {
        const returns = await liveService.getReturns(['SPY'], 5);

        expect(returns['SPY']).toEqual(cachedReturns);
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(mockKV.get).toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should cache fetched data', async () => {
      const mockResponse = {
        chart: {
          result: [
            {
              meta: { symbol: 'SPY', regularMarketPrice: 450 },
              timestamp: [1, 2, 3],
              indicators: {
                adjclose: [{ adjclose: [100, 101, 102] }],
              },
            },
          ],
          error: null,
        },
      };

      const mockKV = {
        get: vi.fn().mockResolvedValue(null), // Cache miss
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
      };

      const env = { RETURNS_CACHE: mockKV } as unknown as Env;

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      try {
        const liveService = createLiveReturnsService(env);
        await liveService.getReturns(['SPY'], 2);

        // Should have called put to cache the result
        expect(mockKV.put).toHaveBeenCalled();
        const putCall = mockKV.put.mock.calls[0];
        expect(putCall[0]).toContain('returns:SPY:2:');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
