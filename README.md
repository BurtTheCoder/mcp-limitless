# Limitless MCP Server for Cloudflare Workers

A Model Context Protocol (MCP) server that provides Claude with access to your [Limitless AI](https://limitless.ai) lifelogs. Deploy to Cloudflare Workers with GitHub OAuth authentication for secure access.

> **Note**: This project requires manual setup rather than one-click deployment because it needs secure API keys (Limitless AI, GitHub OAuth) and creates KV namespaces for OAuth token storage. The setup process ensures your credentials remain private and secure.

## Features

- 🔍 **Search Lifelogs** - Hybrid semantic and keyword search across all your recordings
- 📝 **Retrieve Full Content** - Get complete lifelog content including transcripts and summaries  
- 📅 **List Recent Recordings** - Browse your latest lifelogs with date filtering
- 🔐 **Secure Authentication** - GitHub OAuth integration for secure access
- ⚡ **Edge Deployment** - Runs on Cloudflare Workers for low latency
- 🎯 **Claude Integration** - Seamlessly works with Claude.ai as a custom connector

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Limitless AI](https://app.limitless.ai) account and API key
- [GitHub account](https://github.com) for OAuth
- [Node.js](https://nodejs.org/) 18+ installed locally
- Claude Pro/Max/Team/Enterprise subscription

### Cloudflare Workers Free Tier

This project runs perfectly on Cloudflare's free tier, which includes:
- **100,000 requests per day** (more than enough for personal use)
- **10ms CPU time per invocation** (sufficient for API calls)
- **Up to 1MB KV storage** (plenty for OAuth tokens)
- **Unlimited Durable Objects** (for MCP agent state)
- **No credit card required**

For typical usage with Claude, you'll likely use less than 1% of these limits.

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/BurtTheCoder/mcp-limitless.git
cd mcp-limitless
npm install
```

### 2. Initial Setup

Run the automated setup script:

```bash
./setup.sh
```

This will:
- Create your `wrangler.toml` configuration
- Set up KV namespaces for OAuth storage
- Create a `.dev.vars` template for local development

### 3. Configure API Keys

#### Get your Limitless API Key
1. Go to [app.limitless.ai](https://app.limitless.ai)
2. Navigate to Settings → API
3. Generate or copy your API key

#### Create GitHub OAuth App
1. Go to [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: `Limitless MCP Server`
   - **Homepage URL**: `https://your-worker.workers.dev` (you'll get this after deploy)
   - **Authorization callback URL**: `https://your-worker.workers.dev/github/callback`
4. Save your Client ID and Client Secret

#### Update Local Configuration

Edit `.dev.vars`:
```env
LIMITLESS_API_KEY="your-limitless-api-key-here"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
```

### 4. Test Locally

```bash
npm run dev
```

Your server will be available at `http://localhost:8787`

Test the OAuth flow by visiting: `http://localhost:8787/authorize`

### 5. Deploy to Cloudflare

Run the deployment script:

```bash
./deploy.sh
```

This will prompt you to enter your secrets securely and deploy to Cloudflare Workers.

You'll get a URL like: `https://limitless-mcp-server.your-account.workers.dev`

### 6. Update GitHub OAuth App

After deployment, update your GitHub OAuth App's callback URL to:
```
https://limitless-mcp-server.your-account.workers.dev/github/callback
```

### 7. Connect to Claude

1. Go to [Claude.ai](https://claude.ai)
2. Navigate to Settings → Connectors
3. Click "Add custom connector"
4. Enter your Workers URL with `/sse` endpoint:
   ```
   https://limitless-mcp-server.your-account.workers.dev/sse
   ```
5. Click "Add" and authorize with GitHub when prompted
6. Enable the connector in your chat

## Available Tools in Claude

Once connected, Claude will have access to these tools:

- **`Limitless Ai:search_lifelogs`** - Search using natural language or boolean operators
  - Example: "meetings about the new project"
  - Example: "dinner OR lunch with Bob"

- **`Limitless Ai:get_lifelog`** - Retrieve a specific lifelog by ID
  - Returns full content including transcript and summaries

- **`Limitless Ai:list_recent_lifelogs`** - List your recent recordings
  - Supports date filtering and pagination
  - Can filter by starred status

## Project Structure

```
mcp-limitless/
├── src/
│   ├── github-oauth-index.ts  # Main entry point with OAuth
│   ├── mcp-agent.ts           # MCP server implementation
│   ├── simple-index.ts        # Alternative without GitHub OAuth
│   └── index.ts               # Alternative implementation
├── wrangler.toml.example      # Cloudflare config template
├── setup.sh                   # Automated setup script
├── deploy.sh                  # Deployment script
├── package.json               # Dependencies
└── README.md                  # This file
```

## Configuration Options

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LIMITLESS_API_KEY` | Yes | Your Limitless AI API key |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth App Client Secret |
| `ENABLE_IP_ALLOWLIST` | No | Set to `"true"` to only allow Anthropic IPs |
| `RATE_LIMIT_KV` | No | KV namespace binding for rate limiting |

### Customization

To use without GitHub OAuth, change the main entry in `wrangler.toml`:
```toml
main = "src/simple-index.ts"  # Simple approval page instead of GitHub
```

## Troubleshooting

### Connection Issues

1. **"MCP error -32000: Connection closed"**
   - Ensure you're using the `/sse` endpoint
   - Check that OAuth authentication completed successfully

2. **"Tool not found" errors in Claude**
   - Tools are namespaced as `Limitless Ai:tool_name`
   - Claude should automatically detect this

3. **404 errors from Limitless API**
   - Verify your API key is correct
   - Check that your Limitless account has API access enabled

### Viewing Logs

```bash
# Stream live logs from your worker
npx wrangler tail

# Or view in Cloudflare Dashboard
# Go to Workers & Pages → your-worker → Logs
```

### Rate Limits

- Limitless API: 180 requests per minute
- Cloudflare Workers Free: 100,000 requests per day

## Security Features

### Built-in Security
- OAuth 2.0 with PKCE for secure authorization
- API keys stored as encrypted Cloudflare secrets
- OAuth tokens expire after 1 hour
- GitHub OAuth provides identity verification
- HTTPS enforced by Cloudflare Workers

### Optional Enhanced Security
- **IP Allowlisting**: Restrict access to Anthropic's official IPs only
- **Rate Limiting**: Prevent abuse with configurable request limits
- **Security Headers**: HSTS, CSP, X-Frame-Options automatically applied

To enable enhanced security features, see [SECURITY.md](SECURITY.md) for detailed configuration.

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally and with deployment
5. Submit a pull request

## License

MIT License - See [LICENSE](LICENSE) file for details

## Support

- **Limitless Support**: [help.limitless.ai](https://help.limitless.ai)
- **Issues**: [GitHub Issues](https://github.com/BurtTheCoder/mcp-limitless/issues)
- **MCP Documentation**: [modelcontextprotocol.io](https://modelcontextprotocol.io)

## Acknowledgments

- Built with [Model Context Protocol](https://modelcontextprotocol.io) by Anthropic
- Powered by [Cloudflare Workers](https://workers.cloudflare.com)
- Integrates with [Limitless AI](https://limitless.ai)