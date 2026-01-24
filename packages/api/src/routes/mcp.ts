import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import { registerAllMcpTools } from '../mcp/index.js'; // Import the new aggregator function
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import express from 'express';
import { config } from '../config';

// Create the McpServer instance
// Note: Type assertion needed due to MCP SDK types incompatibility with zod 3.25.76
const server = new McpServer(
  {
    name: 'sapience-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      logging: {},
      tools: {
        list: true,
        listChanged: true,
      },
      resources: {
        list: false,
      },
      prompts: {
        list: false,
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
);

// Register all tools using the aggregator function
registerAllMcpTools(server);

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Logging controls
const DEBUG_MCP_LOGS = process.env.DEBUG_MCP_LOGS === '1' && !config.isProd;

export const handleMcpAppRequests = (app: express.Application, url: string) => {
  // Handle POST requests for client-to-server communication
  app.post(url, async (req, res) => {
    const sessionIdHeader = (req.headers['mcp-session-id'] as string) || 'n/a';
    if (DEBUG_MCP_LOGS) {
      console.log(`Request received: ${req.method} ${req.url}`, {
        sessionId: sessionIdHeader,
        body: req.body,
      });
    } else {
      console.log(
        `[MCP] ${req.method} ${req.url} sessionId=${sessionIdHeader}`
      );
    }

    // Debug: log headers relevant to MCP negotiation
    const acceptHeader = req.headers['accept'];
    const contentTypeHeader = req.headers['content-type'];
    console.log('[MCP] Headers', {
      accept: acceptHeader,
      contentType: contentTypeHeader,
      hasSessionId: !!req.headers['mcp-session-id'],
    });

    // Ensure request body is an object for initialization detection
    let body: unknown = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        /* ignore parse error; leave body as-is */
      }
    }

    const isObject = (value: unknown): value is Record<string, unknown> =>
      value !== null && typeof value === 'object';

    const isJsonRpcInitialize = (
      value: unknown
    ): value is {
      jsonrpc: '2.0';
      method: 'server/initialize';
    } => {
      if (!isObject(value)) return false;
      const jsonrpc = value['jsonrpc'];
      const method = value['method'];
      return jsonrpc === '2.0' && method === 'server/initialize';
    };

    // Capture response data for logging
    const originalJson = res.json;
    res.json = function (body) {
      if (DEBUG_MCP_LOGS) {
        console.log(`Response being sent:`, JSON.stringify(body, null, 2));
      }
      return originalJson.call(this, body);
    };

    try {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        console.log(`Reusing session: ${sessionId}`);
        transport = transports[sessionId];
      } else if (
        !sessionId &&
        (isInitializeRequest(body as unknown as object) ||
          isJsonRpcInitialize(body))
      ) {
        console.log('[MCP] Initialize detection flags', {
          isInitializeRequest: isInitializeRequest(body as unknown as object),
          isJsonRpcInitialize: isJsonRpcInitialize(body),
        });
        if (DEBUG_MCP_LOGS) {
          console.log(
            `New session request: ${
              isObject(body) && typeof body['method'] === 'string'
                ? (body['method'] as string)
                : 'unknown'
            }`
          );
        } else {
          console.log(`New session request`);
        }
        // New initialization request
        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          eventStore, // Enable resumability
          onsessioninitialized: (sessionId) => {
            // Store the transport by session ID
            console.log(`Session initialized: ${sessionId}`);
            transports[sessionId] = transport;
          },
        });

        // Clean up transport when closed
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(
              `Transport closed for session ${sid}, removing from transports map`
            );
            delete transports[sid];
          }
        };

        // Connect to the MCP server BEFORE handling the request
        if (DEBUG_MCP_LOGS) {
          console.log(`Connecting transport to MCP server...`);
        }
        await server.connect(transport);
        if (DEBUG_MCP_LOGS) {
          console.log(`Transport connected to MCP server successfully`);
        }

        if (DEBUG_MCP_LOGS) {
          console.log(`Handling initialization request...`);
        }
        await transport.handleRequest(req, res, body as object | undefined);
        if (DEBUG_MCP_LOGS) {
          console.log(`Initialization request handled, response sent`);
        }
        return; // Already handled
      } else {
        console.error(
          'Invalid request: No valid session ID or initialization request'
        );
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      if (DEBUG_MCP_LOGS) {
        console.log(`Handling request for session: ${transport.sessionId}`);
        console.log(`Request body:`, JSON.stringify(req.body, null, 2));
      } else {
        console.log(
          `[MCP] Handling request for session: ${transport.sessionId}`
        );
      }

      // Handle the request with existing transport
      console.log(`Calling transport.handleRequest...`);
      const startTime = Date.now();
      await transport.handleRequest(req, res, req.body);
      const duration = Date.now() - startTime;
      console.log(
        `[MCP] ${req.method} ${req.url} sessionId=${transport.sessionId} duration=${duration}ms`
      );
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // Handle GET requests for server-to-client notifications via SSE on the same path
  app.get(url, async (req: express.Request, res: express.Response) => {
    const sessionIdHeader = (req.headers['mcp-session-id'] as string) || 'n/a';
    console.log(`[MCP] ${req.method} ${req.url} sessionId=${sessionIdHeader}`);

    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        console.log(`Invalid session ID in GET request: ${sessionId}`);
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      // Check for Last-Event-ID header for resumability
      const lastEventId = req.headers['last-event-id'] as string | undefined;
      if (DEBUG_MCP_LOGS) {
        if (lastEventId) {
          console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
        } else {
          console.log(`Establishing new SSE stream for session ${sessionId}`);
        }
      }

      const transport = transports[sessionId];

      // Set up connection close monitoring
      res.on('close', () => {
        console.log(`SSE connection closed for session ${sessionId}`);
      });

      if (DEBUG_MCP_LOGS) {
        console.log(
          `Starting SSE transport.handleRequest for session ${sessionId}...`
        );
      }
      const startTime = Date.now();
      await transport.handleRequest(req, res);
      const duration = Date.now() - startTime;
      console.log(
        `[MCP] ${req.method} ${req.url} sessionId=${sessionId} duration=${duration}ms`
      );
    } catch (error) {
      console.error('Error handling GET request:', error);
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  });

  // Handle DELETE requests for session termination on the same path
  app.delete(url, async (req: express.Request, res: express.Response) => {
    const sessionIdHeader = (req.headers['mcp-session-id'] as string) || 'n/a';
    console.log(`[MCP] ${req.method} ${req.url} sessionId=${sessionIdHeader}`);
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        console.log(`Invalid session ID in DELETE request: ${sessionId}`);
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      console.log(
        `Received session termination request for session ${sessionId}`
      );
      const transport = transports[sessionId];

      // Capture response for logging (debug only)
      const originalSend = res.send;
      res.send = function (body) {
        if (DEBUG_MCP_LOGS) {
          console.log(`DELETE response being sent:`, body);
        }
        return originalSend.call(this, body);
      };

      console.log(`Processing session termination...`);
      const startTime = Date.now();
      await transport.handleRequest(req, res);
      const duration = Date.now() - startTime;
      console.log(
        `[MCP] ${req.method} ${req.url} sessionId=${sessionId} duration=${duration}ms`
      );

      // Check if transport was actually closed
      setTimeout(() => {
        if (transports[sessionId]) {
          console.log(
            `Note: Transport for session ${sessionId} still exists after DELETE request`
          );
        } else {
          console.log(
            `Transport for session ${sessionId} successfully removed after DELETE request`
          );
        }
      }, 100);
    } catch (error) {
      console.error('Error handling DELETE request:', error);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  });
};
