#!/bin/bash

echo "Deploying Limitless MCP Server with GitHub OAuth..."

# Add secrets to Cloudflare
echo "Adding GitHub OAuth secrets to Cloudflare..."
echo "Enter your GitHub Client ID:"
npx wrangler secret put GITHUB_CLIENT_ID

echo "Enter your GitHub Client Secret:"
npx wrangler secret put GITHUB_CLIENT_SECRET

echo "Enter your Limitless API Key:"
npx wrangler secret put LIMITLESS_API_KEY

# Optional security features
echo ""
read -p "Enable IP allowlisting (only allow Anthropic IPs)? (y/N): " enable_ip
if [ "$enable_ip" = "y" ] || [ "$enable_ip" = "Y" ]; then
  echo "true" | npx wrangler secret put ENABLE_IP_ALLOWLIST
  echo "✅ IP allowlisting enabled - only Anthropic IPs can connect"
else
  echo "⚠️  IP allowlisting disabled - accepting connections from any IP"
fi

# Deploy to Cloudflare
echo "Deploying to Cloudflare Workers..."
npm run deploy

echo "Deployment complete!"
echo "Your MCP server should be available at your Cloudflare Worker URL"
echo "Remember to update your GitHub OAuth App callback URL to: https://your-worker.workers.dev/github/callback"