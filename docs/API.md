# QuantRisk MCP API Documentation

Complete API reference for the QuantRisk MCP Server.

## Table of Contents

- [Overview](#overview)
- [Integration with AI Tools](#integration-with-ai-tools)
  - [Claude Desktop](#claude-desktop)
  - [Cursor](#cursor)
  - [Other MCP Clients](#other-mcp-clients)
- [Python / LangGraph Integration](#python--langgraph-integration)
- [Authentication](#authentication)
- [Endpoints](#endpoints)
- [Tools](#tools)
  - [portfolio_risk](#portfolio_risk)
  - [ticker_risk](#ticker_risk)
  - [stress_test](#stress_test)
  - [correlation_regime](#correlation_regime)
- [Error Codes](#error-codes)
- [Rate Limits](#rate-limits)

---

## Overview

QuantRisk MCP is a Model Context Protocol (MCP) server providing quantitative risk analysis tools. It follows the [MCP specification](https://modelcontextprotocol.io/) using JSON-RPC 2.0.

### Base URLs

| Environment | URL |
|-------------|-----|
| Production | `https://quantrisk-mcp.quant-risk-mcp.workers.dev` |
| Local Development | `http://localhost:8787` |

### Protocol Version

```
MCP Protocol Version: 2024-11-05
```

---

## Integration with AI Tools

### Claude Desktop

Add the QuantRisk MCP server to Claude Desktop by editing your configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "quantrisk": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://quantrisk-mcp.quant-risk-mcp.workers.dev"]
    }
  }
}
```

After saving, restart Claude Desktop. You can then ask Claude questions like:
- "Analyze the risk of a portfolio with 60% SPY and 40% TLT"
- "What's the risk impact of adding 15% NVDA to my portfolio?"
- "Run a stress test on my holdings: 50% SPY, 30% bonds, 20% gold"
- "Check the correlation regime for SPY, TLT, GLD, and QQQ"

### Cursor

Add to your Cursor MCP settings (`.cursor/mcp.json` in your project or global config):

```json
{
  "mcpServers": {
    "quantrisk": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://quantrisk-mcp.quant-risk-mcp.workers.dev"]
    }
  }
}
```

### Windsurf

Add to your Windsurf MCP configuration (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "quantrisk": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://quantrisk-mcp.quant-risk-mcp.workers.dev"]
    }
  }
}
```

### Other MCP Clients

For any MCP-compatible client, use:

| Setting | Value |
|---------|-------|
| **Server URL** | `https://quantrisk-mcp.quant-risk-mcp.workers.dev` |
| **Protocol** | MCP over HTTP (JSON-RPC 2.0) |
| **Transport** | HTTP POST with `Content-Type: application/json` |

#### Using mcp-remote (Recommended)

The `mcp-remote` package bridges HTTP MCP servers to stdio-based clients:

```bash
npx -y mcp-remote https://quantrisk-mcp.quant-risk-mcp.workers.dev
```

#### Direct HTTP Integration

For clients that support HTTP MCP servers directly:

```javascript
// Example: Initialize and list tools
const response = await fetch('https://quantrisk-mcp.quant-risk-mcp.workers.dev', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'my-client', version: '1.0.0' }
    }
  })
});
```

### Self-Hosting

To run your own instance:

```bash
# Clone the repository
git clone https://github.com/nimeshk03/quantrist-mcp.git
cd quantrist-mcp

# Install dependencies
npm install

# Run locally
npm run dev

# Or deploy to your own Cloudflare account
npx wrangler login
npm run deploy
```

Then update your MCP configuration to point to your instance.

---

## Python / LangGraph Integration

For Python applications and LangGraph agents, use the provided integration module.

### Installation

```bash
cd examples
pip install -r requirements.txt
```

### Quick Start

```python
from langgraph_integration import (
    portfolio_risk,
    ticker_risk,
    stress_test,
    correlation_regime,
)

# Analyze portfolio risk
result = portfolio_risk({"SPY": 0.6, "TLT": 0.3, "GLD": 0.1})
print(f"VaR 95%: {result['metrics']['var95'] * 100:.2f}%")
print(f"Decision: {result['decision']}")

# Check ticker risk
result = ticker_risk("NVDA", 0.15, {"SPY": 0.6, "TLT": 0.4})
print(f"VaR Contribution: {result['varContribution'] * 100:.1f}%")

# Run stress test
result = stress_test({"SPY": 0.5, "TLT": 0.3, "GLD": 0.2})
print(f"Worst Scenario: {result['worstScenario']['name']}")

# Check correlation regime
result = correlation_regime(["SPY", "TLT", "GLD", "QQQ"])
print(f"Regime: {result['currentRegime']}")
```

### LangGraph Agent

Create an AI agent with risk analysis capabilities:

```python
import os
from langgraph_integration import create_risk_agent

# Set your OpenAI API key
os.environ["OPENAI_API_KEY"] = "your-api-key"

# Create the agent
agent = create_risk_agent()

# Query the agent
result = agent.invoke({
    "messages": [("user", "Analyze the risk of a portfolio with 60% SPY and 40% TLT")]
})

print(result["messages"][-1].content)
```

### Direct MCP Client

Use the MCP client directly for full control:

```python
from langgraph_integration import QuantRiskMCPClient

client = QuantRiskMCPClient()

# Initialize session
client.initialize()

# List available tools
tools = client.list_tools()
for tool in tools:
    print(f"- {tool['name']}")

# Call a tool
result = client.call_tool("portfolio_risk", {
    "holdings": {"SPY": 0.6, "TLT": 0.4},
    "simulations": 10000,
    "useMockData": True,
})
```

### Run the Demo

```bash
python examples/langgraph_integration.py
```

Output:
```
============================================================
QuantRisk MCP - Direct API Demo
============================================================

1. Health Check:
   Status: healthy
   Version: 1.0.0

2. Available Tools:
   - portfolio_risk
   - ticker_risk
   - stress_test
   - correlation_regime

3. Portfolio Risk Analysis:
   VaR 95%: 0.30%
   CVaR 95%: 0.32%
   Decision: PROCEED

4. Ticker Risk (Adding 15% NVDA):
   Marginal VaR: 0.45%
   VaR Contribution: 15.0%
   Decision: REDUCE

5. Stress Test:
   Worst Scenario: Global Financial Crisis (2008)
   Max Drawdown: -28.5%
   Decision: PROCEED

6. Correlation Regime:
   Current Regime: normal
   Avg Correlation: 32.1%
   Decision: PROCEED
```

---

## Authentication

Currently, the API is open and does not require authentication. For production deployments, consider adding authentication via Cloudflare Access or API tokens.

---

## Endpoints

### Health Check

Check if the server is running.

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "server": "quantrisk-mcp",
  "version": "1.0.0",
  "tools": ["portfolio_risk", "ticker_risk", "stress_test", "correlation_regime", "echo"]
}
```

### MCP Initialize

Initialize an MCP session.

```http
POST /
Content-Type: application/json
```

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "your-client",
      "version": "1.0.0"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "quantrisk-mcp",
      "version": "1.0.0"
    }
  }
}
```

### List Tools

Get all available tools and their schemas.

```http
POST /
Content-Type: application/json
```

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "portfolio_risk",
        "description": "Calculate portfolio risk metrics...",
        "inputSchema": { ... }
      },
      ...
    ]
  }
}
```

### Call Tool

Execute a specific tool.

```http
POST /
Content-Type: application/json
```

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "<tool_name>",
    "arguments": { ... }
  }
}
```

---

## Tools

### portfolio_risk

Calculate comprehensive risk metrics for a portfolio using Monte Carlo simulation.

#### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `holdings` | object | Yes | - | Portfolio holdings as `{ticker: weight}`. Weights should sum to 1.0 |
| `simulations` | integer | No | 10000 | Number of Monte Carlo simulations (100-100000) |
| `horizon` | integer | No | 21 | Investment horizon in trading days (1-252) |
| `confidenceLevels` | array | No | [0.95, 0.99] | VaR confidence levels |
| `useMockData` | boolean | No | false | Use mock data instead of live market data |

#### Example Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "portfolio_risk",
    "arguments": {
      "holdings": {
        "SPY": 0.6,
        "TLT": 0.3,
        "GLD": 0.1
      },
      "simulations": 10000,
      "horizon": 21
    }
  }
}
```

#### Example Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"metrics\":{\"var95\":0.0523,\"var99\":0.0741,\"cvar95\":0.0612,\"cvar99\":0.0823,\"volatility\":0.0089,\"expectedReturn\":0.0004,\"annualizedReturn\":0.1008,\"sharpeRatio\":1.42,\"maxDrawdown\":0.0891,\"worstCase\":-0.0891,\"bestCase\":0.0756},\"decision\":{\"action\":\"PROCEED\",\"explanation\":\"Portfolio risk is within acceptable limits. VaR95 of 5.23% is below the 10% threshold.\"},\"holdings\":{\"SPY\":0.6,\"TLT\":0.3,\"GLD\":0.1},\"simulationParams\":{\"simulations\":10000,\"horizon\":21}}"
    }]
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `metrics.var95` | number | Value at Risk at 95% confidence (as decimal) |
| `metrics.var99` | number | Value at Risk at 99% confidence |
| `metrics.cvar95` | number | Conditional VaR (Expected Shortfall) at 95% |
| `metrics.cvar99` | number | Conditional VaR at 99% |
| `metrics.volatility` | number | Portfolio volatility (daily) |
| `metrics.expectedReturn` | number | Expected daily return |
| `metrics.annualizedReturn` | number | Annualized expected return |
| `metrics.sharpeRatio` | number | Risk-adjusted return metric |
| `metrics.maxDrawdown` | number | Maximum simulated drawdown |
| `decision.action` | string | `PROCEED`, `REDUCE`, or `VETO` |
| `decision.explanation` | string | Human-readable explanation |

#### Decision Logic

| Action | Condition |
|--------|-----------|
| `PROCEED` | VaR95 < 10% and CVaR95 < 15% |
| `REDUCE` | VaR95 >= 10% or CVaR95 >= 15% |
| `VETO` | VaR95 >= 20% or CVaR95 >= 25% |

---

### ticker_risk

Analyze the risk impact of adding a single ticker to a portfolio.

#### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `ticker` | string | Yes | - | Stock ticker symbol (e.g., "AAPL") |
| `proposedAllocation` | number | Yes | - | Proposed allocation weight (0.01-1.0) |
| `existingHoldings` | object | No | {} | Current portfolio holdings |
| `simulations` | integer | No | 5000 | Number of simulations |
| `useMockData` | boolean | No | false | Use mock data |

#### Example Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "ticker_risk",
    "arguments": {
      "ticker": "NVDA",
      "proposedAllocation": 0.15,
      "existingHoldings": {
        "SPY": 0.6,
        "TLT": 0.25
      }
    }
  }
}
```

#### Example Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"ticker\":\"NVDA\",\"proposedAllocation\":0.15,\"marginalVar\":0.0234,\"varContribution\":0.42,\"beta\":1.85,\"volatility\":0.45,\"avgCorrelation\":0.68,\"correlationImpact\":\"high\",\"decision\":\"REDUCE\",\"explanation\":\"REDUCE: NVDA would contribute 42% of portfolio VaR, approaching the 50% concentration limit.\",\"recommendedAllocation\":0.08,\"stats\":{\"mean\":0.0012,\"stdDev\":0.028}}"
    }]
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `ticker` | string | The analyzed ticker |
| `proposedAllocation` | number | Requested allocation |
| `marginalVar` | number | Additional VaR from this position |
| `varContribution` | number | Percentage of total portfolio VaR |
| `beta` | number | Beta relative to portfolio |
| `volatility` | number | Annualized volatility |
| `avgCorrelation` | number | Average correlation with portfolio |
| `correlationImpact` | string | `low`, `medium`, or `high` |
| `decision` | string | `PROCEED`, `REDUCE`, or `VETO` |
| `recommendedAllocation` | number | Suggested allocation if reduced |

#### Decision Logic

| Action | Condition |
|--------|-----------|
| `PROCEED` | VaR contribution < 30% |
| `REDUCE` | VaR contribution 30-50% |
| `VETO` | VaR contribution > 50% |

---

### stress_test

Simulate portfolio performance under historical crisis scenarios.

#### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `holdings` | object | Yes | - | Portfolio holdings as `{ticker: weight}` |
| `scenarios` | array | No | all | Specific scenarios to test |
| `useMockData` | boolean | No | false | Use mock data |

#### Available Scenarios

| ID | Name | Description |
|----|------|-------------|
| `gfc_2008` | Global Financial Crisis (2008) | Lehman collapse, credit freeze |
| `covid_2020` | COVID-19 Crash (2020) | Pandemic market crash |
| `flash_crash_2010` | Flash Crash (May 2010) | Algorithmic trading crash |
| `rate_shock_2022` | Rate Shock (2022) | Fed rate hike cycle |

#### Example Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "stress_test",
    "arguments": {
      "holdings": {
        "SPY": 0.5,
        "TLT": 0.3,
        "GLD": 0.2
      }
    }
  }
}
```

#### Example Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"scenarios\":{\"gfc_2008\":{\"id\":\"gfc_2008\",\"name\":\"Global Financial Crisis (2008)\",\"portfolioDrawdown\":-0.285,\"worstTicker\":\"SPY\",\"worstTickerDrawdown\":-0.495,\"bestTicker\":\"TLT\",\"bestTickerDrawdown\":0.05,\"estimatedRecoveryDays\":513,\"tickerDrawdowns\":{\"SPY\":-0.495,\"TLT\":0.05,\"GLD\":-0.26}},\"covid_2020\":{...},\"flash_crash_2010\":{...},\"rate_shock_2022\":{...}},\"worstScenario\":{\"id\":\"gfc_2008\",\"name\":\"Global Financial Crisis (2008)\",\"drawdown\":-0.285},\"decision\":\"PROCEED\",\"explanation\":\"PROCEED: Portfolio shows resilience across stress scenarios. Worst case: 28.5% drawdown in Global Financial Crisis (2008). Average recovery: 167 days.\",\"summary\":{\"avgDrawdown\":-0.159,\"maxDrawdown\":-0.285,\"avgRecoveryDays\":167}}"
    }]
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `scenarios` | object | Results for each scenario |
| `scenarios[id].portfolioDrawdown` | number | Total portfolio drawdown |
| `scenarios[id].worstTicker` | string | Worst performing ticker |
| `scenarios[id].bestTicker` | string | Best performing ticker |
| `scenarios[id].estimatedRecoveryDays` | number | Days to recover |
| `worstScenario` | object | The scenario with largest drawdown |
| `decision` | string | `PROCEED`, `REDUCE`, or `VETO` |
| `summary.avgDrawdown` | number | Average drawdown across scenarios |
| `summary.maxDrawdown` | number | Maximum drawdown |

#### Decision Logic

| Action | Condition |
|--------|-----------|
| `PROCEED` | Max drawdown < 30% |
| `REDUCE` | Max drawdown 30-50% |
| `VETO` | Max drawdown > 50% |

---

### correlation_regime

Analyze correlation dynamics to detect market regime changes.

#### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tickers` | array | Yes | - | Array of ticker symbols (min 2) |
| `lookbackDays` | integer | No | 60 | Days for recent correlation |
| `historicalDays` | integer | No | 252 | Days for historical baseline |
| `useMockData` | boolean | No | false | Use mock data |

#### Example Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "correlation_regime",
    "arguments": {
      "tickers": ["SPY", "TLT", "GLD", "QQQ"],
      "lookbackDays": 60,
      "historicalDays": 252
    }
  }
}
```

#### Example Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"currentRegime\":\"normal\",\"averageCorrelation\":0.15,\"historicalAverage\":0.12,\"correlationChange\":0.03,\"highCorrelationPairs\":[{\"pair\":[\"SPY\",\"QQQ\"],\"correlation\":0.92,\"change\":0.02}],\"lowCorrelationPairs\":[{\"pair\":[\"SPY\",\"TLT\"],\"correlation\":-0.25,\"change\":-0.05}],\"risingCorrelationPairs\":[],\"decision\":\"PROCEED\",\"explanation\":\"PROCEED: Correlation regime is normal. Average correlation (0.15) is near historical levels (0.12). Diversification benefits are intact.\"}"
    }]
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `currentRegime` | string | `normal`, `elevated`, or `crisis` |
| `averageCorrelation` | number | Current average pairwise correlation |
| `historicalAverage` | number | Historical average correlation |
| `correlationChange` | number | Change from historical |
| `highCorrelationPairs` | array | Pairs with correlation > 0.7 |
| `lowCorrelationPairs` | array | Pairs with correlation < -0.1 |
| `risingCorrelationPairs` | array | Pairs with significant increases |
| `decision` | string | `PROCEED`, `REDUCE`, or `VETO` |

#### Regime Classification

| Regime | Condition |
|--------|-----------|
| `normal` | Avg correlation < 0.4 |
| `elevated` | Avg correlation 0.4-0.7 |
| `crisis` | Avg correlation > 0.7 |

---

## Error Codes

### JSON-RPC Error Codes

| Code | Name | Description |
|------|------|-------------|
| `-32700` | Parse Error | Invalid JSON |
| `-32600` | Invalid Request | Missing required fields |
| `-32601` | Method Not Found | Unknown method |
| `-32602` | Invalid Params | Invalid method parameters |
| `-32603` | Internal Error | Server error |
| `-32000` | Tool Error | Tool execution failed |

### Example Error Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid params: holdings must be a non-empty object"
  }
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `holdings must be a non-empty object` | Empty or missing holdings | Provide at least one holding |
| `Holdings weights must sum to approximately 1.0` | Weights don't sum to 1 | Ensure weights sum to 1.0 |
| `proposedAllocation must be between 0.01 and 1.0` | Invalid allocation | Use value between 0.01-1.0 |
| `At least 2 tickers required` | Too few tickers | Provide 2+ tickers |
| `Unknown ticker` | Invalid ticker symbol | Use valid ticker symbols |

---

## Rate Limits

### Cloudflare Workers Free Tier

| Metric | Limit |
|--------|-------|
| Requests/day | 100,000 |
| CPU time/request | 10ms |
| Memory | 128MB |

### Recommended Usage

- Use `useMockData: true` for testing
- Limit `simulations` to 10,000 for production
- Cache results when possible
- Batch multiple tickers in single requests

---

## Supported Tickers

The following tickers have predefined profiles for accurate risk modeling:

### Equities
`SPY`, `QQQ`, `IWM`, `AAPL`, `MSFT`, `GOOGL`, `AMZN`, `NVDA`, `META`, `TSLA`, `JPM`, `BAC`, `XOM`, `CVX`

### Fixed Income
`TLT`, `IEF`, `SHY`, `LQD`, `HYG`, `BND`, `AGG`

### Commodities
`GLD`, `SLV`, `USO`, `UNG`

### International
`EFA`, `EEM`, `VEU`, `IEMG`

### Real Estate
`VNQ`, `IYR`, `XLRE`

### Crypto
`BTC`, `ETH`

Other tickers will use default equity profiles.

---

## Examples

### Complete Workflow Example

```bash
# 1. Check health
curl https://quantrisk-mcp.quant-risk-mcp.workers.dev/health

# 2. Analyze portfolio risk
curl -X POST https://quantrisk-mcp.quant-risk-mcp.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/call",
    "params":{
      "name":"portfolio_risk",
      "arguments":{
        "holdings":{"SPY":0.6,"TLT":0.3,"GLD":0.1},
        "simulations":10000
      }
    }
  }'

# 3. Check if adding NVDA is safe
curl -X POST https://quantrisk-mcp.quant-risk-mcp.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"ticker_risk",
      "arguments":{
        "ticker":"NVDA",
        "proposedAllocation":0.1,
        "existingHoldings":{"SPY":0.5,"TLT":0.3,"GLD":0.1}
      }
    }
  }'

# 4. Run stress test
curl -X POST https://quantrisk-mcp.quant-risk-mcp.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"stress_test",
      "arguments":{
        "holdings":{"SPY":0.5,"TLT":0.3,"GLD":0.1,"NVDA":0.1}
      }
    }
  }'

# 5. Check correlation regime
curl -X POST https://quantrisk-mcp.quant-risk-mcp.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":4,
    "method":"tools/call",
    "params":{
      "name":"correlation_regime",
      "arguments":{
        "tickers":["SPY","TLT","GLD","NVDA"]
      }
    }
  }'
```
