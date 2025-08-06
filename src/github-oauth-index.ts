// src/github-oauth-index.ts
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { LimitlessMCPAgent } from './mcp-agent';
import { validateAnthropicOrigin, createSecurityHeaders, rateLimitCheck } from './security-middleware';

export interface Env {
  LIMITLESS_API_KEY: string;
  MCP_AGENT: DurableObjectNamespace<LimitlessMCPAgent>;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: any; // This will be set by the OAuthProvider
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  RATE_LIMIT_KV?: KVNamespace; // Optional rate limiting
  ENABLE_IP_ALLOWLIST?: string; // Optional flag to enable IP allowlisting
}

// Export the Durable Object
export { LimitlessMCPAgent } from './mcp-agent';

// GitHub OAuth URLs
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

// Authorization handler that integrates GitHub OAuth
const authorizationHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle the authorization page
    if (url.pathname === '/authorize') {
      try {
        console.log('Authorization request received');
        console.log('OAuth provider available:', !!env.OAUTH_PROVIDER);
        
        // Check if OAuth provider is available
        if (!env.OAUTH_PROVIDER || typeof env.OAUTH_PROVIDER.parseAuthRequest !== 'function') {
          console.error('OAuth provider not available');
          // Fallback: manually parse OAuth parameters
          const responseType = url.searchParams.get('response_type');
          const clientId = url.searchParams.get('client_id');
          const redirectUri = url.searchParams.get('redirect_uri');
          const codeChallenge = url.searchParams.get('code_challenge');
          const codeChallengeMethod = url.searchParams.get('code_challenge_method');
          const state = url.searchParams.get('state');
          const scope = url.searchParams.get('scope');
          
          if (!responseType || !clientId || !redirectUri) {
            return new Response('Missing required OAuth parameters', { status: 400 });
          }
          
          // Store OAuth params and redirect to GitHub
          const githubState = crypto.randomUUID();
          await env.OAUTH_KV.put(
            `github_state:${githubState}`,
            JSON.stringify({
              oauth_params: {
                response_type: responseType,
                client_id: clientId,
                redirect_uri: redirectUri,
                code_challenge: codeChallenge,
                code_challenge_method: codeChallengeMethod,
                state: state,
                scope: scope
              },
              created_at: Date.now()
            }),
            { expirationTtl: 3600 }
          );
          
          const githubAuthUrl = new URL(GITHUB_AUTH_URL);
          githubAuthUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
          githubAuthUrl.searchParams.set('redirect_uri', `${url.origin}/github/callback`);
          githubAuthUrl.searchParams.set('scope', 'user:email');
          githubAuthUrl.searchParams.set('state', githubState);
          
          return new Response(null, {
            status: 302,
            headers: {
              'Location': githubAuthUrl.toString()
            }
          });
        }
        
        // Parse the OAuth request using the provider's helper
        const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);
        
        // Validate environment variables
        if (!env.GITHUB_CLIENT_ID) {
          console.error('GITHUB_CLIENT_ID is not set');
          return new Response('GitHub OAuth not configured', { status: 500 });
        }
        
        // Store OAuth request info and redirect to GitHub
        const githubState = crypto.randomUUID();
        await env.OAUTH_KV.put(
          `github_state:${githubState}`,
          JSON.stringify({
            oauth_request: oauthReqInfo,
            created_at: Date.now()
          }),
          { expirationTtl: 3600 }
        );
        
        const githubAuthUrl = new URL(GITHUB_AUTH_URL);
        githubAuthUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
        githubAuthUrl.searchParams.set('redirect_uri', `${url.origin}/github/callback`);
        githubAuthUrl.searchParams.set('scope', 'user:email');
        githubAuthUrl.searchParams.set('state', githubState);
        
        console.log('Redirecting to GitHub for authentication');
        return new Response(null, {
          status: 302,
          headers: {
            'Location': githubAuthUrl.toString()
          }
        });
      } catch (error) {
        console.error('Error in authorization handler:', error);
        return new Response(`Error: ${error.message}`, { status: 500 });
      }
    }
    
    // Handle GitHub OAuth callback - complete OAuth flow
    if (url.pathname === '/github/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      
      if (!code || !state) {
        return new Response('Missing code or state', { status: 400 });
      }
      
      // Retrieve the stored OAuth request
      const sessionData = await env.OAUTH_KV.get(`github_state:${state}`);
      if (!sessionData) {
        return new Response('Invalid or expired session', { status: 400 });
      }
      
      const session = JSON.parse(sessionData);
      await env.OAUTH_KV.delete(`github_state:${state}`);
      
      // Check if we have OAuth request or params
      if (session.oauth_request && env.OAUTH_PROVIDER && typeof env.OAUTH_PROVIDER.completeAuthorization === 'function') {
        // Use OAuth provider to complete the flow
        try {
          const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
            request: session.oauth_request,
            userId: `github_user_${code.substring(0, 8)}`,
            metadata: { 
              label: 'GitHub Authenticated User',
              github_auth_time: Date.now()
            },
            scope: session.oauth_request.scope || [],
            props: {
              authenticated_via: 'github',
              github_code: code,
              timestamp: Date.now()
            }
          });
          
          return Response.redirect(redirectTo, 302);
        } catch (error) {
          console.error('Error completing OAuth authorization:', error);
          return new Response(`Error completing authorization: ${error.message}`, { status: 500 });
        }
      } else if (session.oauth_params) {
        // Manual OAuth completion - generate auth code and redirect
        const authCode = crypto.randomUUID();
        
        // Store the auth code with user info for token exchange
        await env.OAUTH_KV.put(
          `auth_code:${authCode}`,
          JSON.stringify({
            client_id: session.oauth_params.client_id,
            redirect_uri: session.oauth_params.redirect_uri,
            code_challenge: session.oauth_params.code_challenge,
            code_challenge_method: session.oauth_params.code_challenge_method,
            github_code: code,
            user_id: `github_user_${code.substring(0, 8)}`,
            created_at: Date.now()
          }),
          { expirationTtl: 600 } // 10 minutes
        );
        
        // Redirect back to Claude with the auth code
        const redirectUrl = new URL(session.oauth_params.redirect_uri);
        redirectUrl.searchParams.set('code', authCode);
        if (session.oauth_params.state) {
          redirectUrl.searchParams.set('state', session.oauth_params.state);
        }
        
        return Response.redirect(redirectUrl.toString(), 302);
      } else {
        return new Response('Invalid session data', { status: 500 });
      }
    }
    
    // Handle token exchange
    if (url.pathname === '/token' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const grantType = formData.get('grant_type');
        const code = formData.get('code');
        const codeVerifier = formData.get('code_verifier');
        const clientId = formData.get('client_id');
        
        if (grantType !== 'authorization_code') {
          return new Response(JSON.stringify({
            error: 'unsupported_grant_type'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        if (!code || !codeVerifier) {
          return new Response(JSON.stringify({
            error: 'invalid_request',
            error_description: 'Missing code or code_verifier'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Retrieve the auth code data
        const authData = await env.OAUTH_KV.get(`auth_code:${code}`);
        if (!authData) {
          return new Response(JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Invalid or expired authorization code'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        const authInfo = JSON.parse(authData);
        await env.OAUTH_KV.delete(`auth_code:${code}`);
        
        // Verify PKCE if provided
        if (authInfo.code_challenge) {
          const encoder = new TextEncoder();
          const data = encoder.encode(codeVerifier);
          const hash = await crypto.subtle.digest('SHA-256', data);
          const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
          
          if (base64 !== authInfo.code_challenge) {
            return new Response(JSON.stringify({
              error: 'invalid_grant',
              error_description: 'Invalid code verifier'
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }
        
        // Generate access token
        const accessToken = crypto.randomUUID();
        const refreshToken = crypto.randomUUID();
        
        // Store token info
        await env.OAUTH_KV.put(
          `access_token:${accessToken}`,
          JSON.stringify({
            user_id: authInfo.user_id,
            client_id: authInfo.client_id,
            github_code: authInfo.github_code,
            created_at: Date.now()
          }),
          { expirationTtl: 3600 } // 1 hour
        );
        
        return new Response(JSON.stringify({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: refreshToken
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error in token exchange:', error);
        return new Response(JSON.stringify({
          error: 'server_error'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Default home page
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    
    // Mount MCP handlers with proper authentication
    const mcpHandlers = LimitlessMCPAgent.mount('/sse', {
      binding: 'MCP_AGENT',
      corsOptions: {
        origin: env.ENABLE_IP_ALLOWLIST === 'true' ? 'https://claude.ai' : '*',
        methods: 'GET, POST, OPTIONS',
        headers: 'Content-Type, Accept, MCP-Protocol-Version, Authorization'
      }
    });
    
    // Handle SSE endpoints
    if (url.pathname === '/sse' || url.pathname.startsWith('/sse/')) {
      // Apply security checks if enabled
      if (env.ENABLE_IP_ALLOWLIST === 'true' && !validateAnthropicOrigin(request)) {
        console.warn('Rejected MCP request from unauthorized IP');
        return new Response('Forbidden', { 
          status: 403,
          headers: createSecurityHeaders()
        });
      }
      
      // Apply rate limiting if available
      if (env.RATE_LIMIT_KV && !(await rateLimitCheck(request, env))) {
        return new Response('Too Many Requests', { 
          status: 429,
          headers: createSecurityHeaders()
        });
      }
      
      const authHeader = request.headers.get('Authorization');
      console.log(`MCP endpoint ${url.pathname} accessed, auth present: ${!!authHeader}`);
      
      // Validate OAuth token if present
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const tokenData = await env.OAUTH_KV.get(`access_token:${token}`);
        
        if (tokenData) {
          // Valid token - pass user props to the MCP handler
          const tokenInfo = JSON.parse(tokenData);
          // @ts-ignore - ctx.props is an extended property for MCP
          ctx.props = {
            authenticated: true,
            user_id: tokenInfo.user_id,
            client_id: tokenInfo.client_id
          };
          console.log('Token validated, calling MCP handler with props:', ctx.props);
          return mcpHandlers.fetch(request, env, ctx);
        }
      }
      
      // No valid token for MCP endpoints
      console.log(`No valid token for ${url.pathname}, returning 401`);
      return new Response('Unauthorized', { 
        status: 401,
        headers: {
          'WWW-Authenticate': 'Bearer'
        }
      });
    }
    
    // Handle OAuth discovery endpoint
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return new Response(JSON.stringify({
        issuer: url.origin,
        authorization_endpoint: `${url.origin}/authorize`,
        token_endpoint: `${url.origin}/token`,
        registration_endpoint: `${url.origin}/register`,
        scopes_supported: ['mcp'],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none']
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Handle client registration
    if (url.pathname === '/register' && request.method === 'POST') {
      const body = await request.json() as any;
      const clientId = crypto.randomUUID();
      
      // Store client info
      await env.OAUTH_KV.put(
        `client:${clientId}`,
        JSON.stringify({
          ...body,
          client_id: clientId,
          created_at: Date.now()
        }),
        { expirationTtl: 86400 * 30 } // 30 days
      );
      
      return new Response(JSON.stringify({
        client_id: clientId,
        ...body
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Handle OAuth and other endpoints
    return authorizationHandler.fetch(request, env);
  }
};