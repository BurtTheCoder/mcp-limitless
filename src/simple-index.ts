// src/simple-index.ts
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { LimitlessMCPAgent } from './mcp-agent';

export interface Env {
  LIMITLESS_API_KEY: string;
  MCP_AGENT: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;
}

// Export the Durable Object
export { LimitlessMCPAgent } from './mcp-agent';

// Simple authorization UI - no GitHub OAuth, just a simple approval page
const authorizationUI = {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/authorize' && request.method === 'GET') {
      // Show simple approval page
      const clientId = url.searchParams.get('client_id');
      const redirectUri = url.searchParams.get('redirect_uri');
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authorize Limitless MCP</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 2rem;
              border-radius: 10px;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
              max-width: 400px;
              width: 100%;
            }
            h1 {
              margin: 0 0 1rem 0;
              font-size: 1.5rem;
            }
            .info {
              margin: 1.5rem 0;
              padding: 1rem;
              background: #edf2f7;
              border-radius: 8px;
            }
            .actions {
              display: flex;
              gap: 1rem;
              margin-top: 1.5rem;
            }
            button {
              flex: 1;
              padding: 0.75rem;
              border: none;
              border-radius: 6px;
              font-size: 1rem;
              cursor: pointer;
              transition: all 0.2s;
            }
            .approve {
              background: #667eea;
              color: white;
            }
            .approve:hover {
              background: #5a67d8;
            }
            .deny {
              background: #e2e8f0;
              color: #4a5568;
            }
            .deny:hover {
              background: #cbd5e0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authorize Limitless MCP</h1>
            
            <div class="info">
              <h3>Claude wants to access:</h3>
              <ul>
                <li>Search your Limitless AI lifelogs</li>
                <li>Retrieve specific lifelog content</li>
                <li>List your recent lifelogs</li>
              </ul>
            </div>
            
            <form method="POST" action="/authorize">
              ${Array.from(url.searchParams.entries())
                .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}">`)
                .join('\\n')}
              
              <div class="actions">
                <button type="submit" name="approve" value="true" class="approve">
                  Authorize
                </button>
                <button type="submit" name="approve" value="false" class="deny">
                  Deny
                </button>
              </div>
            </form>
          </div>
        </body>
        </html>
      `;
      
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    
    if (url.pathname === '/authorize' && request.method === 'POST') {
      // Handle approval/denial
      const formData = await request.formData();
      const approved = formData.get('approve') === 'true';
      
      if (!approved) {
        // User denied access
        const redirectUri = formData.get('redirect_uri') as string;
        const state = formData.get('state') as string;
        const denyUrl = new URL(redirectUri);
        denyUrl.searchParams.set('error', 'access_denied');
        if (state) denyUrl.searchParams.set('state', state);
        return Response.redirect(denyUrl.toString(), 302);
      }
      
      // User approved - return success to let OAuth provider handle the rest
      // The OAuth provider will see this as successful authorization
      return new Response('Authorized', { status: 200 });
    }
    
    // Default home page
    if (url.pathname === '/') {
      return new Response('Limitless MCP Server', { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

// Export the fetch handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Create OAuth provider 
    const provider = new OAuthProvider({
      // MCP endpoints
      apiHandlers: {
        '/sse': LimitlessMCPAgent.serveSSE('/sse'),
        '/mcp': LimitlessMCPAgent.serve('/mcp'),
      },
      
      // OAuth endpoints
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/token',
      clientRegistrationEndpoint: '/register',
      
      // Authorization UI handler
      defaultHandler: authorizationUI,
      
      // KV store for OAuth data
      kvStore: () => env.OAUTH_KV,
      
      // Additional configuration
      cors: {
        origin: ['https://claude.ai', 'https://claude.com', 'http://localhost:*'],
        credentials: true,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Accept', 'MCP-Protocol-Version', 'Authorization']
      }
    });

    return provider.fetch(request, env, ctx);
  }
};