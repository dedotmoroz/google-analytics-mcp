import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { z } from 'zod';

const token = process.env.ANALYTICS_MCP_TOKEN;
const propertyId = process.env.GA4_PROPERTY_ID;
const port = Number(process.env.PORT || 3002);
const endpoint = process.env.MCP_PATH || '/analytics';

if (!token) throw new Error('ANALYTICS_MCP_TOKEN is required');

const client = new BetaAnalyticsDataClient();

function createServer() {
  const server = new McpServer({ name: 'ga4-analytics', version: '1.0.0' });
  const period = {
    startDate: z.string().default('7daysAgo'),
    endDate: z.string().default('today'),
  };
  const limit = z.number().int().min(1).max(100).default(30);

  const register = (name, description, schema, handler) =>
    server.tool(name, description, schema, async (args) => {
      try {
        if (!propertyId) throw new Error('GA4_PROPERTY_ID is not configured');
        const result = await handler(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: String(error.message) }] };
      }
    });

  const report = async (dimensions, metrics, startDate, endDate, rowLimit = 100) => {
    const [result] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
      limit: rowLimit,
    });
    return result;
  };

  register('get_traffic', 'GA4 active users, sessions and page views', period,
    ({ startDate, endDate }) => report([], ['activeUsers', 'sessions', 'screenPageViews'], startDate, endDate));
  register('get_sources', 'GA4 acquisition channels', { ...period, limit },
    ({ startDate, endDate, limit }) => report(['sessionDefaultChannelGroup'], ['sessions', 'activeUsers'], startDate, endDate, limit));
  register('get_countries', 'GA4 visitors by country', { ...period, limit },
    ({ startDate, endDate, limit }) => report(['country'], ['activeUsers', 'sessions'], startDate, endDate, limit));
  register('get_pages', 'GA4 most viewed page paths', { ...period, limit },
    ({ startDate, endDate, limit }) => report(['pagePath'], ['screenPageViews', 'activeUsers'], startDate, endDate, limit));
  register('get_events', 'GA4 events', { ...period, limit },
    ({ startDate, endDate, limit }) => report(['eventName'], ['eventCount'], startDate, endDate, limit));
  register('get_realtime', 'GA4 active users right now', {}, async () => {
    const [result] = await client.runRealtimeReport({
      property: 'properties/' + propertyId,
      metrics: [{ name: 'activeUsers' }],
    });
    return result;
  });
  return server;
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.post(endpoint, async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request failed:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});
app.get(endpoint, (_req, res) => res.status(405).end());
app.delete(endpoint, (_req, res) => res.status(405).end());
app.listen(port, '127.0.0.1', () => console.log('Analytics MCP listening on port ' + port));
