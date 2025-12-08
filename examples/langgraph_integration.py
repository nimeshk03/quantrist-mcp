"""
LangGraph Integration Example for QuantRisk MCP

This example demonstrates how to integrate the QuantRisk MCP server
with LangGraph for AI-powered portfolio risk analysis.

Requirements:
    pip install langgraph langchain-core langchain-openai httpx

Usage:
    export OPENAI_API_KEY="your-api-key"
    python langgraph_integration.py
"""

import json
import httpx
from typing import Any

# MCP Server URL
MCP_SERVER_URL = "https://quantrisk-mcp.quant-risk-mcp.workers.dev"


class QuantRiskMCPClient:
    """Simple MCP client for QuantRisk server."""

    def __init__(self, base_url: str = MCP_SERVER_URL):
        self.base_url = base_url
        self.client = httpx.Client(timeout=30.0)
        self._request_id = 0

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _call(self, method: str, params: dict | None = None) -> dict:
        """Make a JSON-RPC call to the MCP server."""
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": method,
        }
        if params:
            payload["params"] = params

        response = self.client.post(
            self.base_url,
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        response.raise_for_status()
        result = response.json()

        if "error" in result:
            raise Exception(f"MCP Error: {result['error']}")

        return result.get("result", {})

    def initialize(self) -> dict:
        """Initialize MCP session."""
        return self._call(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "langgraph-client", "version": "1.0.0"},
            },
        )

    def list_tools(self) -> list[dict]:
        """List available tools."""
        result = self._call("tools/list")
        return result.get("tools", [])

    def call_tool(self, name: str, arguments: dict) -> dict:
        """Call a specific tool."""
        result = self._call("tools/call", {"name": name, "arguments": arguments})
        content = result.get("content", [])
        if content and content[0].get("type") == "text":
            return json.loads(content[0]["text"])
        return result

    def health_check(self) -> dict:
        """Check server health."""
        response = self.client.get(f"{self.base_url}/health")
        response.raise_for_status()
        return response.json()


# =============================================================================
# Tool Functions for LangGraph
# =============================================================================


def portfolio_risk(
    holdings: dict[str, float],
    simulations: int = 10000,
    horizon: int = 21,
) -> dict[str, Any]:
    """
    Calculate portfolio risk metrics using Monte Carlo simulation.

    Args:
        holdings: Portfolio holdings as {ticker: weight}, weights should sum to 1.0
        simulations: Number of Monte Carlo simulations (default: 10000)
        horizon: Investment horizon in trading days (default: 21)

    Returns:
        Risk metrics including VaR, CVaR, volatility, and decision
    """
    client = QuantRiskMCPClient()
    return client.call_tool(
        "portfolio_risk",
        {
            "holdings": holdings,
            "simulations": simulations,
            "horizon": horizon,
            "useMockData": True,  # Use mock data for demo
        },
    )


def ticker_risk(
    ticker: str,
    proposed_allocation: float,
    existing_holdings: dict[str, float] | None = None,
) -> dict[str, Any]:
    """
    Analyze risk impact of adding a ticker to portfolio.

    Args:
        ticker: Stock ticker symbol (e.g., "AAPL")
        proposed_allocation: Proposed allocation weight (0.01-1.0)
        existing_holdings: Current portfolio holdings

    Returns:
        Risk analysis including marginal VaR, contribution, and decision
    """
    client = QuantRiskMCPClient()
    args = {
        "ticker": ticker,
        "proposedAllocation": proposed_allocation,
        "useMockData": True,
    }
    if existing_holdings:
        args["existingHoldings"] = existing_holdings
    return client.call_tool("ticker_risk", args)


def stress_test(holdings: dict[str, float]) -> dict[str, Any]:
    """
    Run stress test on portfolio against historical crisis scenarios.

    Args:
        holdings: Portfolio holdings as {ticker: weight}

    Returns:
        Stress test results for each scenario with drawdowns and recovery times
    """
    client = QuantRiskMCPClient()
    return client.call_tool(
        "stress_test",
        {"holdings": holdings, "useMockData": True},
    )


def correlation_regime(tickers: list[str]) -> dict[str, Any]:
    """
    Analyze correlation regime for a set of tickers.

    Args:
        tickers: List of ticker symbols (minimum 2)

    Returns:
        Correlation analysis including regime, matrices, and decision
    """
    client = QuantRiskMCPClient()
    return client.call_tool(
        "correlation_regime",
        {"tickers": tickers, "useMockData": True},
    )


# =============================================================================
# LangGraph Integration
# =============================================================================

try:
    from langchain_core.tools import tool
    from langchain_openai import ChatOpenAI
    from langgraph.prebuilt import create_react_agent

    # Create LangChain tools from our functions
    @tool
    def analyze_portfolio_risk(holdings: str) -> str:
        """
        Analyze portfolio risk using Monte Carlo simulation.
        Input should be a JSON string of holdings like: {"SPY": 0.6, "TLT": 0.4}
        """
        holdings_dict = json.loads(holdings)
        result = portfolio_risk(holdings_dict)
        return json.dumps(result, indent=2)

    @tool
    def analyze_ticker_risk(ticker: str, allocation: float) -> str:
        """
        Analyze risk of adding a specific ticker at given allocation.
        """
        result = ticker_risk(ticker, allocation)
        return json.dumps(result, indent=2)

    @tool
    def run_stress_test(holdings: str) -> str:
        """
        Run stress test on portfolio against historical crisis scenarios.
        Input should be a JSON string of holdings like: {"SPY": 0.6, "TLT": 0.4}
        """
        holdings_dict = json.loads(holdings)
        result = stress_test(holdings_dict)
        return json.dumps(result, indent=2)

    @tool
    def check_correlation_regime(tickers: str) -> str:
        """
        Check correlation regime for a list of tickers.
        Input should be a comma-separated list like: SPY,TLT,GLD
        """
        ticker_list = [t.strip() for t in tickers.split(",")]
        result = correlation_regime(ticker_list)
        return json.dumps(result, indent=2)

    def create_risk_agent():
        """Create a LangGraph agent with risk analysis tools."""
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        tools = [
            analyze_portfolio_risk,
            analyze_ticker_risk,
            run_stress_test,
            check_correlation_regime,
        ]
        return create_react_agent(llm, tools)

    LANGGRAPH_AVAILABLE = True

except ImportError:
    LANGGRAPH_AVAILABLE = False
    print("LangGraph not installed. Install with: pip install langgraph langchain-openai")


# =============================================================================
# Demo and Testing
# =============================================================================


def demo_direct_api():
    """Demonstrate direct API usage without LangGraph."""
    print("=" * 60)
    print("QuantRisk MCP - Direct API Demo")
    print("=" * 60)

    client = QuantRiskMCPClient()

    # Health check
    print("\n1. Health Check:")
    health = client.health_check()
    print(f"   Status: {health['status']}")
    print(f"   Version: {health['version']}")

    # List tools
    print("\n2. Available Tools:")
    tools = client.list_tools()
    for t in tools:
        print(f"   - {t['name']}: {t.get('description', '')[:50]}...")

    # Portfolio risk
    print("\n3. Portfolio Risk Analysis:")
    result = portfolio_risk({"SPY": 0.6, "TLT": 0.3, "GLD": 0.1})
    metrics = result.get("metrics", {})
    decision = result.get("decision", {})
    print(f"   VaR 95%: {metrics.get('var95', 0) * 100:.2f}%")
    print(f"   CVaR 95%: {metrics.get('cvar95', 0) * 100:.2f}%")
    if isinstance(decision, dict):
        print(f"   Decision: {decision.get('action', 'N/A')}")
    else:
        print(f"   Decision: {decision}")

    # Ticker risk
    print("\n4. Ticker Risk (Adding 15% NVDA):")
    result = ticker_risk("NVDA", 0.15, {"SPY": 0.6, "TLT": 0.4})
    print(f"   Marginal VaR: {result.get('marginalVar', 0) * 100:.2f}%")
    print(f"   VaR Contribution: {result.get('varContribution', 0) * 100:.1f}%")
    print(f"   Decision: {result.get('decision', 'N/A')}")

    # Stress test
    print("\n5. Stress Test:")
    result = stress_test({"SPY": 0.5, "TLT": 0.3, "GLD": 0.2})
    worst = result.get("worstScenario", {})
    print(f"   Worst Scenario: {worst.get('name', 'N/A')}")
    print(f"   Max Drawdown: {worst.get('drawdown', 0) * 100:.1f}%")
    print(f"   Decision: {result.get('decision', 'N/A')}")

    # Correlation regime
    print("\n6. Correlation Regime:")
    result = correlation_regime(["SPY", "TLT", "GLD", "QQQ"])
    print(f"   Current Regime: {result.get('currentRegime', 'N/A')}")
    print(f"   Avg Correlation: {result.get('averageCorrelation', 0) * 100:.1f}%")
    print(f"   Decision: {result.get('decision', 'N/A')}")

    print("\n" + "=" * 60)
    print("Demo complete!")
    print("=" * 60)


def demo_langgraph():
    """Demonstrate LangGraph agent usage."""
    if not LANGGRAPH_AVAILABLE:
        print("LangGraph not available. Skipping agent demo.")
        return

    import os

    if not os.getenv("OPENAI_API_KEY"):
        print("Set OPENAI_API_KEY to run LangGraph demo")
        return

    print("\n" + "=" * 60)
    print("QuantRisk MCP - LangGraph Agent Demo")
    print("=" * 60)

    agent = create_risk_agent()

    # Example queries
    queries = [
        "Analyze the risk of a portfolio with 60% SPY and 40% TLT",
        "Should I add 20% NVDA to my portfolio?",
    ]

    for query in queries:
        print(f"\nQuery: {query}")
        print("-" * 40)
        result = agent.invoke({"messages": [("user", query)]})
        # Print the last message (agent response)
        last_message = result["messages"][-1]
        print(f"Response: {last_message.content[:500]}...")


if __name__ == "__main__":
    # Run direct API demo (no dependencies required)
    demo_direct_api()

    # Run LangGraph demo if available
    demo_langgraph()
