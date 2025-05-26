import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Stock Price Lookup Agent",
		version: "1.0.0",
	});

	async init() {
		this.server.tool(
			"getStockPrice",
			{
				symbol: z.string().describe("The stock ticker symbol (like AAPL or TSLA). Only call this tool if the user explicitly asks for a stock price, such as 'What is AAPL trading at?' or 'Get price for Tesla.' Do not guess."),
			},
			async ({ symbol }) => {
				try {
					const res = await fetch(`https://api.stockchart.ai/quotes/${encodeURIComponent(symbol)}`);
					
					if (!res.ok) {
						throw new Error(`API error: ${res.status}`);
					}

					const data = await res.json();

					if (!data.price) {
						return {
							content: [{ type: "text", text: `No price data found for ${symbol.toUpperCase()}` }],
						};
					}

					const message = `${data.name || symbol} (${symbol.toUpperCase()}) is trading at $${data.price.toFixed(2)} ${data.currency || ""}`.trim();

					return {
						content: [{ type: "text", text: message }],
					};
				} catch (err) {
					console.error("Stock price fetch error:", err);
					return {
						content: [
							{
								type: "text",
								text: `Error fetching stock price: ${err instanceof Error ? err.message : String(err)}`,
							},
						],
					};
				}
			}
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			// @ts-ignore
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			// @ts-ignore
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
