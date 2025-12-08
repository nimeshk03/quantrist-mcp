# QuantRisk MCP

Quantitative Risk Analysis via Model Context Protocol (MCP).

A serverless MCP server deployed on Cloudflare Workers providing portfolio risk analysis tools including VaR, CVaR, stress testing, and correlation regime detection.

## Features

- **Portfolio Risk**: Monte Carlo VaR/CVaR calculation
- **Ticker Risk**: Per-ticker risk contribution analysis
- **Stress Testing**: Historical scenario analysis (GFC 2008, COVID 2020, etc.)
- **Correlation Regime**: Detect normal/elevated/crisis correlation states

## Quick Start

```bash
# Install dependencies
npm install

# Run local development server
npm run dev

# Run tests
npm test

# Deploy to Cloudflare Workers
npm run deploy
```

## API Endpoints

### Health Check
```bash
curl http://localhost:8787/health
```

### MCP Protocol
```bash
# List available tools
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Available Tools

### 1. portfolio_risk

Calculate comprehensive risk metrics for a portfolio.

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/call",
    "params":{
      "name":"portfolio_risk",
      "arguments":{
        "holdings":{"SPY":0.6,"TLT":0.3,"GLD":0.1},
        "simulations":10000,
        "horizon":21
      }
    }
  }'
```

**Returns**: VaR (95%, 99%), CVaR, volatility, Sharpe ratio, and risk decision (PROCEED/REDUCE/VETO).

### 2. ticker_risk

Analyze the risk impact of adding a single ticker to a portfolio.

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/call",
    "params":{
      "name":"ticker_risk",
      "arguments":{
        "ticker":"NVDA",
        "proposedAllocation":0.20,
        "existingHoldings":{"SPY":0.6,"TLT":0.4}
      }
    }
  }'
```

**Returns**: Marginal VaR, VaR contribution, beta, correlation impact, and recommended allocation.

### 3. stress_test

Simulate portfolio performance under historical crisis scenarios.

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/call",
    "params":{
      "name":"stress_test",
      "arguments":{
        "holdings":{"AAPL":0.25,"JPM":0.25,"GLD":0.25,"TLT":0.25}
      }
    }
  }'
```

**Scenarios**: GFC 2008, COVID 2020, Flash Crash 2010, Rate Shock 2022.

**Returns**: Drawdown per scenario, worst/best performers, recovery time estimates.

### 4. correlation_regime

Analyze correlation dynamics to detect regime changes.

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/call",
    "params":{
      "name":"correlation_regime",
      "arguments":{
        "tickers":["SPY","TLT","GLD","QQQ"]
      }
    }
  }'
```

**Returns**: Current regime (normal/elevated/crisis), correlation matrices, high/low correlation pairs, regime change probability.

## Project Structure

```
quantrisk-mcp/
├── src/
│   ├── index.ts           # Worker entry point
│   ├── types.ts           # TypeScript types
│   ├── mcp/               # MCP protocol handler
│   ├── tools/             # Risk analysis tools
│   ├── simulation/        # Monte Carlo engine
│   ├── services/          # Data fetching services
│   └── utils/             # Statistics utilities
├── tests/                 # Test files
├── wrangler.toml          # Cloudflare Workers config
├── package.json
└── tsconfig.json
```

## Development

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Build
npm run build
```

## Testing

The project includes a comprehensive test suite with 289 tests covering all components.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run integration tests only
npm run test:integration
```

### Test Coverage

| Component | Coverage |
|-----------|----------|
| Statistics | 100% |
| Monte Carlo Engine | 99% |
| MCP Server | 94% |
| Returns Service | 93% |
| Portfolio Risk Tool | 92% |
| Ticker Risk Tool | 92% |
| Stress Test Tool | 94% |
| Correlation Tool | 87% |
| **Overall** | **94%** |

### Test Files

| File | Tests | Description |
|------|-------|-------------|
| `statistics.test.ts` | 55 | Statistical utilities |
| `monte-carlo.test.ts` | 24 | Simulation engine |
| `mcp-server.test.ts` | 17 | MCP protocol handling |
| `returns-service.test.ts` | 34 | Data fetching and caching |
| `portfolio-risk.test.ts` | 26 | Portfolio risk tool |
| `ticker-risk.test.ts` | 27 | Ticker risk tool |
| `stress-test.test.ts` | 30 | Stress test tool |
| `correlation.test.ts` | 32 | Correlation regime tool |
| `integration.test.ts` | 26 | End-to-end MCP protocol tests |
| `backtest.test.ts` | 18 | VaR backtesting validation |

### Local Development Verification

Verify the local dev server is working correctly:

```bash
# Start the dev server
npm run dev

# In another terminal, run verification
npm run verify
```

Output example:
```
Local Development Verification
==============================
Server URL: http://localhost:8787

Testing Health... [OK] Server is healthy
Testing Initialize... [OK] Protocol version: 2024-11-05
Testing Tools List... [OK] Found 5 tools
Testing Portfolio Risk... [OK] VaR95: 0.67%, Latency: 11ms
Testing Ticker Risk... [OK] Analyzed NVDA, Decision: REDUCE
Testing Stress Test... [OK] Tested 4 scenario(s)
Testing Correlation Regime... [OK] Regime: normal
Testing CORS... [OK] CORS headers present
Testing Error Handling... [OK] Correctly returns error

Overall: PASS
```

### VaR Backtesting

Run the VaR backtest to validate model accuracy:

```bash
npm run backtest
```

The backtest compares predicted VaR to actual returns over 100 periods:
- **95% VaR**: Expected ~5% violations
- **99% VaR**: Expected ~1% violations

Output example:
```
VaR Backtest Results
====================

95% VaR:
  Violations: 5/100 (5.0%)
  Expected: 5.0%
  Status: [OK] PASS

99% VaR:
  Violations: 1/100 (1.0%)
  Expected: 1.0%
  Status: [OK] PASS
```

## License

MIT
