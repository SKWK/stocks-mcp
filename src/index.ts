import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Stock Price Lookup Agent",
		version: "1.1.0",
		description: "Use tools only when the user asks for stock information. If the user says something casual like 'Hello' or 'Tell me a joke', respond naturally and do NOT call any tools."
	});

	async init() {
		this.server.tool(
			"getStockPrice",
			{
				symbol: z.string().describe("The stock ticker symbol like AAPL, TSLA, or MSFT. Only use this tool if the user clearly asks for a stock price, stock quote, or market value of a company or symbol. Do NOT call this tool if the user is just saying hello, making small talk, or asking a general question. In those cases, simply respond conversationally and do NOT call any tool."),
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

function withCORS(response: Response): Response {
	const newHeaders = new Headers(response.headers);
	newHeaders.set("Access-Control-Allow-Origin", "*");
	newHeaders.set("Access-Control-Allow-Headers", "*");
	newHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders,
	});
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
					"Access-Control-Allow-Headers": "*",
				},
			});
		}

		// Patch Accept header if missing
		const patchedRequest = new Request(request, {
			headers: new Headers({
				...Object.fromEntries(request.headers),
				Accept: request.headers.get("Accept")?.includes("application/json")
					? request.headers.get("Accept")!
					: "application/json, text/event-stream",
			}),
		});

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			// @ts-ignore
			const res = await MyMCP.serveSSE("/sse").fetch(patchedRequest, env, ctx);
			return withCORS(res);
		}

		if (url.pathname === "/mcp") {
			// @ts-ignore
			const res = await MyMCP.serve("/mcp").fetch(patchedRequest, env, ctx);
			return withCORS(res);
		}

		return new Response("Not found", { status: 404 });
	},
};
