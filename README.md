# Google Analytics 4 MCP Server

Self-hosted Node.js MCP server for Google Analytics 4 (GA4) via the official Google Analytics Data API. Uses MCP Streamable HTTP, Express, and Bearer token authentication. No Python required.

## Tools

| Tool | Purpose |
| --- | --- |
| `get_realtime` | Active users right now |
| `get_traffic` | Active users, sessions, page views |
| `get_sources` | Traffic acquisition channels |
| `get_countries` | Users by country |
| `get_pages` | Popular pages |
| `get_events` | Event counts |

Historical tools accept `startDate` and `endDate` (default: `7daysAgo` and `today`); breakdown tools also accept `limit`.

## Setup

1. Install Node.js 20+ and run `npm install`.
2. In Google Cloud, enable **Google Analytics Data API**, create a service account, and download its JSON key to a protected path outside this repository.
3. In Google Analytics 4, open **Admin → Property access management** and grant the service account email **Viewer** access.
4. Copy `.env.example` to `.env` and fill in the GA4 numeric property ID, secret token, and service account JSON path.
5. Start with `node --env-file=.env index.mjs` (or export variables and run `npm start`).

Generate a secret using `openssl rand -hex 32`. Do not commit secrets.

## Nginx reverse proxy

```nginx
location = /analytics {
    proxy_pass http://127.0.0.1:3002/analytics;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Authorization $http_authorization;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

Use HTTPS and keep port 3002 accessible only on loopback.

## Authentication and compatibility

Requests require `Authorization: Bearer <ANALYTICS_MCP_TOKEN>`. This implementation **does not implement OAuth**. Some ChatGPT remote MCP connection flows require OAuth; in those cases an OAuth-capable gateway or an OAuth implementation is needed.

## Production considerations

Keep credentials outside the repository, restrict file permissions, grant read-only GA4 access, and rotate leaked tokens. The HTTP endpoint has been deployed on a VPS, but GA4 credentials and live report access still need to be configured and tested.
