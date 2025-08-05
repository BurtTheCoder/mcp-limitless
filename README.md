# Limitless MCP Server - Cloudflare Workers Deployment Guide

## Quick Deploy with Button

The easiest way to deploy is using Cloudflare's "Deploy to Workers" button:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/your-username/limitless-mcp-cloudflare)

## Manual Deployment Steps

### Prerequisites
- Cloudflare account (free tier works)
- Node.js 18+ installed
- Limitless API key from [app.limitless.ai](https://app.limitless.ai)
- Claude Pro/Max/Team/Enterprise subscription

### Step 1: Create the Project

```bash
# Create a new directory
mkdir limitless-mcp-cloudflare
cd limitless-mcp-cloudflare

# Initialize the project
npm init -y

# Create the file structure
mkdir src
touch src/index.ts src/mcp.ts src/limitless-auth-handler.ts
touch wrangler.toml tsconfig.json .gitignore
```

### Step 2: Copy the Files

Copy the provided code files:
- `src/index.ts` - Main entry point
- `src/mcp.ts` - MCP server implementation
- `src/limitless-auth-handler.ts` - Auth handler
- `package.json` - Dependencies
- `wrangler.toml` - Cloudflare configuration
- `tsconfig.json` - TypeScript configuration

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Set Up Wrangler CLI

```bash
# Install Wrangler globally (if not already installed)
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### Step 5: Configure Secrets

```bash
# Add your Limitless API key as a secret
wrangler secret put LIMITLESS_API_KEY
# Enter your API key when prompted
```

### Step 6: Local Development

```bash
# Create a .dev.vars file for local development
echo 'LIMITLESS_API_KEY="your-api-key-here"' > .dev.vars

# Start the development server
npm run dev
```

Your server will be available at `http://localhost:8787/sse`

### Step 7: Test with MCP Inspector

```bash
# In a new terminal, run the MCP inspector
npx @modelcontextprotocol/inspector@latest

# Open browser
open http://localhost:5173
```

Enter `http://localhost:8787/sse` in the inspector and click Connect.

### Step 8: Deploy to Production

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

You'll get a URL like: `https://limitless-mcp-server.your-account.workers.dev`

## Connecting to Claude

### Option 1: Direct Connection (Claude Web)

1. Go to [Claude.ai](https://claude.ai)
2. Navigate to Settings → Connectors
3. Click "Add custom connector"
4. Enter your Workers URL: `https://limitless-mcp-server.your-account.workers.dev/sse`
5. Click "Add"
6. Enable the connector in your chat

### Option 2: Local Proxy (Claude Desktop)

For Claude Desktop, use the `mcp-remote` proxy:

Update your Claude Desktop config:

```json
{
  "mcpServers": {
    "limitless": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://limitless-mcp-server.your-account.workers.dev/sse"
      ]
    }
  }
}
```

## Environment Variables

| Variable | Required | Description | How to Set |
|----------|----------|-------------|------------|
| `LIMITLESS_API_KEY` | Yes | Your Limitless API key | `wrangler secret put LIMITLESS_API_KEY` |

## Adding OAuth Authentication (Optional)

To add proper OAuth authentication instead of using a shared API key:

### Step 1: Create OAuth App

If Limitless supports OAuth, create an OAuth app with:
- Callback URL: `https://your-worker.workers.dev/callback`

### Step 2: Update Secrets

```bash
wrangler secret put OAUTH_CLIENT_ID
wrangler secret put OAUTH_CLIENT_SECRET
```

### Step 3: Update Auth Handler

Modify `src/limitless-auth-handler.ts` to implement proper OAuth flow.

## Features

### Available Tools

1. **search_lifelogs** - Hybrid search across your lifelogs
2. **get_lifelogs** - Get lifelogs by date/time range
3. **get_lifelog** - Get specific lifelog by ID
4. **delete_lifelog** - Delete a lifelog (requires confirmation)

### Available Prompts

- **summarize_day** - Summarize today's activities
- **find_conversations** - Find conversations about topics
- **generate_tasks** - Extract action items

## Testing Your Deployment

### Test the SSE Endpoint

```bash
curl https://your-worker.workers.dev/sse \
  -H "Accept: text/event-stream"
```

### Test with AI Playground

1. Go to [Cloudflare AI Playground](https://playground.ai.cloudflare.com)
2. Enter your Workers URL
3. Test the tools

### Test with Claude

Ask Claude:
- "Search my lifelogs for meetings about the new project"
- "What did I discuss yesterday?"
- "Generate tasks from my recent conversations"

## Monitoring & Logs

### View Logs

```bash
# Stream logs from your Worker
wrangler tail

# Or view in Cloudflare Dashboard
# Go to Workers & Pages → your-worker → Logs
```

### Analytics

View metrics in the Cloudflare Dashboard:
- Request count
- Error rate
- Response times
- CPU time usage

## Troubleshooting

### Connection Issues

1. **CORS Errors**: Check that your Worker URL is correct
2. **Authentication Failed**: Verify LIMITLESS_API_KEY is set correctly
3. **Rate Limits**: The Limitless API allows 180 requests/minute

### Common Errors

| Error | Solution |
|-------|----------|
| "LIMITLESS_API_KEY is not configured" | Run `wrangler secret put LIMITLESS_API_KEY` |
| "Invalid API key" | Check your API key at app.limitless.ai |
| "Rate limit exceeded" | Wait 60 seconds or reduce request frequency |
| "Lifelog not found" | Verify the lifelog ID exists |

### Debug Mode

For detailed debugging:

```bash
# Run with debug logging
wrangler dev --log-level debug
```

## Cost & Limits

### Cloudflare Workers Free Tier
- 100,000 requests/day
- 10ms CPU time per request
- Unlimited duration

### Limitless API Limits
- 180 requests per minute
- 10 results max per search

## Security Best Practices

1. **Never commit secrets**: Use `wrangler secret` for API keys
2. **Use wrangler.toml for non-sensitive config only**
3. **Enable Cloudflare Access** for additional security (optional)
4. **Monitor usage** through Cloudflare Analytics

## Next Steps

1. **Customize Tools**: Add more specific tools for your use case
2. **Add Caching**: Implement KV storage for frequently accessed lifelogs
3. **Enhanced Auth**: Implement per-user OAuth if available
4. **Rate Limiting**: Add Cloudflare Rate Limiting rules
5. **Custom Domain**: Set up a custom domain for your Worker

## Support

- **Limitless Support**: [help.limitless.ai](https://help.limitless.ai)
- **Cloudflare Docs**: [developers.cloudflare.com](https://developers.cloudflare.com)
- **MCP Docs**: [modelcontextprotocol.io](https://modelcontextprotocol.io)

## License

MIT License - Feel free to modify and deploy your own version!
