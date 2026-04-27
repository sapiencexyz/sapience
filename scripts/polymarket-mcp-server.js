#!/usr/bin/env node

/**
 * Polymarket MCP Server
 *
 * Exposes Polymarket Gamma & CLOB API endpoints as MCP tools
 * so Claude Code uses the correct parameter names and shapes.
 *
 * Transport: stdio (launched by Claude Code as a subprocess)
 * Protocol: JSON-RPC over MCP (Model Context Protocol)
 */

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob-v2.polymarket.com";

// --- Tool definitions --------------------------------------------------------

const TOOLS = [
  {
    name: "get_markets_by_condition_ids",
    description:
      "Fetch Polymarket markets by condition IDs. IMPORTANT: use `condition_ids` (plural) as repeated query params. Returns market metadata including prices, outcomes, and event info.",
    inputSchema: {
      type: "object",
      properties: {
        condition_ids: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of condition ID hex strings. Sent as repeated `condition_ids` query params.",
        },
        limit: {
          type: "number",
          description: "Max results per request (default 50, max 500)",
          default: 50,
        },
      },
      required: ["condition_ids"],
    },
  },
  {
    name: "get_market_by_slug",
    description:
      "Fetch a single Polymarket market by its slug. Returns full market object including outcomePrices.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Market slug (URL-encoded if needed)",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "get_market_by_condition_id_clob",
    description:
      "Fetch a single market from the CLOB API by condition ID. Useful as fallback when Gamma API lacks data. Fields use snake_case (e.g. condition_id, market_slug, event_slug).",
    inputSchema: {
      type: "object",
      properties: {
        condition_id: {
          type: "string",
          description: "Condition ID hex string",
        },
      },
      required: ["condition_id"],
    },
  },
  {
    name: "get_events",
    description:
      "Fetch Polymarket events with date filtering and pagination. EndDates come from the `end_date_iso` field on events. Use `end_date_min` / `end_date_max` as ISO datetime query params.",
    inputSchema: {
      type: "object",
      properties: {
        end_date_min: {
          type: "string",
          description: "ISO datetime string, e.g. 2025-01-01T00:00:00Z",
        },
        end_date_max: {
          type: "string",
          description: "ISO datetime string",
        },
        limit: {
          type: "number",
          description: "Page size (default 500)",
          default: 500,
        },
        offset: {
          type: "number",
          description: "Pagination offset (default 0)",
          default: 0,
        },
      },
    },
  },
  {
    name: "search_markets",
    description:
      "Search active Polymarket markets with filtering and sorting. Useful for discovering markets by date range, status, or ordering.",
    inputSchema: {
      type: "object",
      properties: {
        active: { type: "boolean", description: "Filter by active status" },
        closed: { type: "boolean", description: "Filter by closed status" },
        archived: { type: "boolean", description: "Filter by archived status" },
        order: {
          type: "string",
          enum: ["endDate", "volume"],
          description: "Sort field",
        },
        ascending: { type: "boolean", description: "Sort direction" },
        end_date_min: { type: "string", description: "ISO datetime string" },
        end_date_max: { type: "string", description: "ISO datetime string" },
        limit: { type: "number", description: "Page size (default 500)", default: 500 },
        offset: { type: "number", description: "Pagination offset", default: 0 },
      },
    },
  },
];

// --- HTTP helpers ------------------------------------------------------------

async function gammaFetch(path, params = {}) {
  const url = new URL(path, GAMMA_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, v);
    } else if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gamma API ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function clobFetch(path) {
  const url = new URL(path, CLOB_BASE);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CLOB API ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

// --- Tool handlers -----------------------------------------------------------

async function handleToolCall(name, args) {
  switch (name) {
    case "get_markets_by_condition_ids": {
      const { condition_ids, limit = 50 } = args;
      // Gamma API expects repeated condition_ids params
      const data = await gammaFetch("/markets", {
        condition_ids,
        limit,
      });
      return JSON.stringify(data, null, 2);
    }

    case "get_market_by_slug": {
      const { slug } = args;
      const data = await gammaFetch(`/markets/slug/${encodeURIComponent(slug)}`);
      return JSON.stringify(data, null, 2);
    }

    case "get_market_by_condition_id_clob": {
      const { condition_id } = args;
      const data = await clobFetch(`/markets/${condition_id}`);
      return JSON.stringify(data, null, 2);
    }

    case "get_events": {
      const { end_date_min, end_date_max, limit = 500, offset = 0 } = args;
      const data = await gammaFetch("/events", {
        end_date_min,
        end_date_max,
        limit,
        offset,
      });
      return JSON.stringify(data, null, 2);
    }

    case "search_markets": {
      const {
        active,
        closed,
        archived,
        order,
        ascending,
        end_date_min,
        end_date_max,
        limit = 500,
        offset = 0,
      } = args;
      const data = await gammaFetch("/markets", {
        active,
        closed,
        archived,
        order,
        ascending,
        end_date_min,
        end_date_max,
        limit,
        offset,
      });
      return JSON.stringify(data, null, 2);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- MCP stdio transport -----------------------------------------------------

let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newlineIdx;
  while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);
    if (line) handleMessage(line);
  }
});

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handleMessage(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // ignore malformed lines
  }

  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "polymarket",
            version: "1.0.0",
          },
        },
      });
      break;

    case "notifications/initialized":
      // no response needed
      break;

    case "tools/list":
      send({
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      });
      break;

    case "tools/call": {
      const { name, arguments: args } = params;
      try {
        const text = await handleToolCall(name, args || {});
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text }],
          },
        });
      } catch (err) {
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          },
        });
      }
      break;
    }

    case "ping":
      send({ jsonrpc: "2.0", id, result: {} });
      break;

    default:
      // Unknown method — return error for requests (with id), ignore notifications
      if (id !== undefined) {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
      }
      break;
  }
}

process.stdin.on("end", () => process.exit(0));
