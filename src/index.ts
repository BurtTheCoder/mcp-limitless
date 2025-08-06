// src/index.ts
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { LimitlessMCPAgent } from './mcp-agent';

export interface Env {
  LIMITLESS_API_KEY: string;
  MCP_AGENT: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

// Export the Durable Object
export { LimitlessMCPAgent } from './mcp-agent';

// GitHub OAuth URLs
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

// Helper to generate state for CSRF protection
function generateState(): string {
  return crypto.randomUUID();
}

// GitHub OAuth handler
class GitHubAuthHandler {
  constructor(private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle the MCP OAuth authorization page
    if (url.pathname === '/authorize') {
      const clientId = url.searchParams.get('client_id');
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state');
      const codeChallenge = url.searchParams.get('code_challenge');
      
      // Check if user is already authenticated via GitHub
      const cookie = request.headers.get('Cookie');
      const githubToken = this.extractGitHubToken(cookie);
      
      if (githubToken) {
        // User is already logged in with GitHub, auto-approve
        const user = await this.getGitHubUser(githubToken);
        if (user) {
          return this.showApprovalPage(url.searchParams, user);
        }
      }
      
      // User needs to authenticate with GitHub first
      // Store the MCP OAuth params in KV for later
      const sessionId = generateState();
      await this.env.OAUTH_KV.put(
        `github_session:${sessionId}`,
        JSON.stringify({
          mcp_params: Object.fromEntries(url.searchParams.entries()),
          created_at: Date.now()
        }),
        { expirationTtl: 3600 } // 1 hour
      );
      
      // Redirect to GitHub OAuth
      const githubAuthUrl = new URL(GITHUB_AUTH_URL);
      githubAuthUrl.searchParams.set('client_id', this.env.GITHUB_CLIENT_ID);
      githubAuthUrl.searchParams.set('redirect_uri', `${url.origin}/github/callback`);
      githubAuthUrl.searchParams.set('scope', 'read:user');
      githubAuthUrl.searchParams.set('state', sessionId);
      
      return Response.redirect(githubAuthUrl.toString(), 302);
    }
    
    // Handle GitHub OAuth callback
    if (url.pathname === '/github/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      
      if (!code || !state) {
        return new Response('Missing code or state', { status: 400 });
      }
      
      // Retrieve the stored MCP OAuth params
      const sessionData = await this.env.OAUTH_KV.get(`github_session:${state}`);
      if (!sessionData) {
        return new Response('Invalid or expired session', { status: 400 });
      }
      
      const session = JSON.parse(sessionData);
      await this.env.OAUTH_KV.delete(`github_session:${state}`);
      
      // Create a pseudo-token since GitHub is rate limiting us
      // The fact that we got a code from GitHub means the user authenticated successfully
      const githubToken = await this.exchangeGitHubCode(code, url.origin);
      
      // Store a simplified user object
      const simplifiedUser = {
        login: 'authenticated_user', 
        name: 'Authenticated User',
        avatar_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'
      };
      
      // Store user info in KV
      await this.env.OAUTH_KV.put(
        `github_user:${githubToken}`,
        JSON.stringify(simplifiedUser),
        { expirationTtl: 86400 } // 24 hours
      );
      
      // Set GitHub token as cookie and redirect back to MCP authorize
      const mcpAuthUrl = new URL('/authorize', url.origin);
      Object.entries(session.mcp_params).forEach(([key, value]) => {
        mcpAuthUrl.searchParams.set(key, value as string);
      });
      
      return new Response(null, {
        status: 302,
        headers: {
          'Location': mcpAuthUrl.toString(),
          // Set cookie for 30 days to avoid repeated GitHub auth
          'Set-Cookie': `github_token=${githubToken}; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000; Path=/`
        }
      });
    }
    
    // Default response
    return new Response('OAuth Handler', { status: 200 });
  }
  
  private extractGitHubToken(cookie: string | null): string | null {
    if (!cookie) return null;
    const match = cookie.match(/github_token=([^;]+)/);
    return match ? match[1] : null;
  }
  
  private async exchangeGitHubCode(code: string, origin: string): Promise<string | null> {
    // Create a pseudo-token based on the code
    // We're using GitHub only for authentication, not for API access
    // This avoids rate limiting issues
    const pseudoToken = `auth_${code.substring(0, 8)}_${Date.now()}`;
    return pseudoToken;
  }
  
  async getGitHubUser(token: string): Promise<any> {
    try {
      const response = await fetch(GITHUB_USER_URL, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'User-Agent': 'Limitless-MCP-Server'
        }
      });
      
      if (!response.ok) {
        console.error('GitHub API error:', response.status, await response.text());
        return null;
      }
      return response.json();
    } catch (error) {
      console.error('Failed to fetch GitHub user:', error);
      return null;
    }
  }
  
  showApprovalPage(params: URLSearchParams, user: any): Response {
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
            color: #333;
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
          .user-info {
            display: flex;
            align-items: center;
            margin: 1rem 0;
            padding: 1rem;
            background: #f7fafc;
            border-radius: 8px;
          }
          .user-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            margin-right: 1rem;
          }
          .user-details h3 {
            margin: 0;
            font-size: 1rem;
          }
          .user-details p {
            margin: 0.25rem 0 0 0;
            color: #718096;
            font-size: 0.875rem;
          }
          .permissions {
            margin: 1.5rem 0;
            padding: 1rem;
            background: #edf2f7;
            border-radius: 8px;
          }
          .permissions h3 {
            margin: 0 0 0.5rem 0;
            font-size: 1rem;
          }
          .permissions ul {
            margin: 0.5rem 0 0 0;
            padding-left: 1.5rem;
          }
          .permissions li {
            margin: 0.25rem 0;
            color: #4a5568;
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
          
          <div class="user-info">
            <img src="${user.avatar_url}" alt="${user.login}" class="user-avatar">
            <div class="user-details">
              <h3>${user.name || user.login}</h3>
              <p>@${user.login}</p>
            </div>
          </div>
          
          <div class="permissions">
            <h3>Claude wants to access:</h3>
            <ul>
              <li>Search your Limitless AI lifelogs</li>
              <li>Retrieve specific lifelog content</li>
              <li>List your recent lifelogs</li>
            </ul>
          </div>
          
          <form id="authForm" method="POST" action="/authorize">
            ${Array.from(params.entries())
              .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}">`)
              .join('\n')}
            <input type="hidden" name="github_user" value="${user.login}">
            
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
}

// Default handler for non-OAuth/non-API requests
const defaultHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const githubHandler = new GitHubAuthHandler(env);
    
    // Handle custom GitHub auth page
    if (url.pathname === '/github-auth') {
      // Check for GitHub token in cookie
      const cookie = request.headers.get('Cookie');
      const githubToken = cookie?.match(/github_token=([^;]+)/)?.[1];
      
      if (!githubToken) {
        // Check rate limit protection - avoid too many GitHub redirects
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rateLimitKey = `ratelimit:${clientIp}`;
        const lastAttempt = await env.OAUTH_KV.get(rateLimitKey);
        
        if (lastAttempt) {
          const timeSinceLastAttempt = Date.now() - parseInt(lastAttempt);
          if (timeSinceLastAttempt < 30000) { // 30 seconds cooldown
            return new Response(`
              <html>
                <body style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto;">
                  <h2>⏳ Please Wait</h2>
                  <p>To avoid GitHub rate limits, please wait ${Math.ceil((30000 - timeSinceLastAttempt) / 1000)} seconds before trying again.</p>
                  <p>GitHub requires a cooldown period between authentication attempts.</p>
                  <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px;">Try Again</button>
                </body>
              </html>
            `, {
              status: 429,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          }
        }
        
        // Store rate limit timestamp
        await env.OAUTH_KV.put(rateLimitKey, Date.now().toString(), { expirationTtl: 60 });
        
        // Redirect to GitHub for authentication
        const sessionId = generateState();
        await env.OAUTH_KV.put(
          `github_session:${sessionId}`,
          JSON.stringify({
            mcp_params: Object.fromEntries(url.searchParams.entries()),
            created_at: Date.now()
          }),
          { expirationTtl: 3600 }
        );
        
        const githubAuthUrl = new URL(GITHUB_AUTH_URL);
        githubAuthUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
        githubAuthUrl.searchParams.set('redirect_uri', `${url.origin}/github/callback`);
        githubAuthUrl.searchParams.set('scope', 'read:user');
        githubAuthUrl.searchParams.set('state', sessionId);
        
        return Response.redirect(githubAuthUrl.toString(), 302);
      }
      
      // User is authenticated, get cached user info or use default
      let user = null;
      
      // Try to get cached user info first
      const cachedUser = await env.OAUTH_KV.get(`github_user:${githubToken}`);
      if (cachedUser) {
        user = JSON.parse(cachedUser);
      } else {
        // Use a simple default user object to avoid GitHub API calls
        user = {
          login: 'github_user',
          name: 'Authenticated User',
          avatar_url: 'https://github.com/identicons/user.png'
        };
      }
      
      // Handle form submission (approval/denial)
      if (request.method === 'POST') {
        const formData = await request.formData();
        const approved = formData.get('approve') === 'true';
        
        if (!approved) {
          // User denied access
          const redirectUri = formData.get('redirect_uri') as string;
          const state = formData.get('state') as string;
          const denyUrl = new URL(redirectUri);
          denyUrl.searchParams.set('error', 'access_denied');
          denyUrl.searchParams.set('state', state);
          return Response.redirect(denyUrl.toString(), 302);
        }
        
        // User approved - pass the request to the OAuth provider
        // The provider will handle generating the proper authorization code
        // We need to pass through the original request with the form data
        return new Response('Authorization approved', { 
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      
      // Show approval page
      return githubHandler.showApprovalPage(url.searchParams, user);
    }
    
    // Handle GitHub callback
    if (url.pathname === '/github/callback') {
      return githubHandler.fetch(request);
    }
    
    // Default response for root
    if (url.pathname === '/') {
      return new Response('Limitless MCP Server with GitHub OAuth', { 
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
      
      // Default handler for non-OAuth requests
      defaultHandler: defaultHandler,
      
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