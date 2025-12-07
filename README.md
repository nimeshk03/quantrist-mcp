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

# Call a tool
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/call",
    "params":{
      "name":"portfolio_risk",
      "arguments":{"allocations":{"SPY":0.6,"TLT":0.4}}
    }
  }'
```

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

## License

MIT
