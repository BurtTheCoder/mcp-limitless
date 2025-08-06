#!/bin/bash

echo "============================================"
echo "Limitless MCP Server Setup Script"
echo "============================================"
echo ""

# Check if wrangler.toml exists
if [ -f "wrangler.toml" ]; then
    echo "✓ wrangler.toml already exists"
else
    echo "Creating wrangler.toml from example..."
    cp wrangler.toml.example wrangler.toml
    echo "✓ Created wrangler.toml"
fi

# Create KV namespace
echo ""
echo "Creating KV namespace for OAuth storage..."
echo "Running: npx wrangler kv namespace create OAUTH_KV"
echo ""

KV_OUTPUT=$(npx wrangler kv namespace create OAUTH_KV 2>&1)
echo "$KV_OUTPUT"

# Extract the ID from the output
KV_ID=$(echo "$KV_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)

if [ -n "$KV_ID" ]; then
    echo ""
    echo "✓ KV namespace created with ID: $KV_ID"
    echo ""
    echo "Updating wrangler.toml with KV namespace ID..."
    
    # Update wrangler.toml with the actual ID
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/YOUR_KV_NAMESPACE_ID_HERE/$KV_ID/" wrangler.toml
    else
        # Linux
        sed -i "s/YOUR_KV_NAMESPACE_ID_HERE/$KV_ID/" wrangler.toml
    fi
    
    echo "✓ Updated wrangler.toml"
else
    echo ""
    echo "⚠ Could not extract KV namespace ID automatically."
    echo "Please manually update the 'id' field in wrangler.toml with the ID shown above."
fi

# Create preview KV namespace
echo ""
echo "Creating preview KV namespace..."
echo "Running: npx wrangler kv namespace create OAUTH_KV --preview"
echo ""

PREVIEW_OUTPUT=$(npx wrangler kv namespace create OAUTH_KV --preview 2>&1)
echo "$PREVIEW_OUTPUT"

# Extract the preview ID
PREVIEW_ID=$(echo "$PREVIEW_OUTPUT" | grep -o 'preview_id = "[^"]*"' | cut -d'"' -f2)

if [ -n "$PREVIEW_ID" ]; then
    echo ""
    echo "✓ Preview KV namespace created with ID: $PREVIEW_ID"
    echo ""
    echo "Updating wrangler.toml with preview KV namespace ID..."
    
    # Update wrangler.toml with the actual preview ID
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/YOUR_PREVIEW_KV_ID_HERE/$PREVIEW_ID/" wrangler.toml
    else
        # Linux
        sed -i "s/YOUR_PREVIEW_KV_ID_HERE/$PREVIEW_ID/" wrangler.toml
    fi
    
    echo "✓ Updated wrangler.toml"
else
    echo ""
    echo "⚠ Could not extract preview KV namespace ID automatically."
    echo "Please manually update the 'preview_id' field in wrangler.toml with the ID shown above."
fi

# Create .dev.vars file
echo ""
echo "Creating .dev.vars file for local development..."
if [ -f ".dev.vars" ]; then
    echo "✓ .dev.vars already exists"
else
    cat > .dev.vars << EOF
# Local development environment variables
# Get your Limitless API key from: https://app.limitless.ai
LIMITLESS_API_KEY="your-limitless-api-key-here"

# GitHub OAuth App credentials
# Create an OAuth App at: https://github.com/settings/developers
GITHUB_CLIENT_ID="your-github-client-id-here"
GITHUB_CLIENT_SECRET="your-github-client-secret-here"
EOF
    echo "✓ Created .dev.vars template"
    echo ""
    echo "⚠ Please edit .dev.vars and add your actual API keys"
fi

echo ""
echo "============================================"
echo "Setup Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Edit .dev.vars and add your API keys:"
echo "   - Limitless API key from https://app.limitless.ai"
echo "   - GitHub OAuth credentials from https://github.com/settings/developers"
echo ""
echo "2. Test locally with: npm run dev"
echo ""
echo "3. Deploy with: ./deploy.sh"
echo ""