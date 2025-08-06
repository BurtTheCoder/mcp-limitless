# Security Configuration Guide

## IP Allowlisting for Anthropic Claude

This MCP server can be configured to only accept connections from Anthropic's official IP addresses, providing an additional layer of security.

### Anthropic's Stable Outbound IPs

According to [Anthropic's documentation](https://docs.anthropic.com/en/docs/claude-code), Claude uses these stable IP addresses for outbound MCP requests:

**IPv4 Addresses:**
- 34.162.46.92
- 34.162.102.82
- 34.162.136.91
- 34.162.142.92
- 34.162.183.95

### Enabling IP Allowlisting

To enable IP allowlisting in your deployment:

1. **Import the security middleware** in `src/github-oauth-index.ts`:
```typescript
import { validateAnthropicOrigin, createSecurityHeaders } from './security-middleware';
```

2. **Add validation to the SSE endpoint**:
```typescript
// In the SSE handler
if (url.pathname === '/sse') {
  // Validate request is from Anthropic
  if (!validateAnthropicOrigin(request)) {
    return new Response('Forbidden', { 
      status: 403,
      headers: createSecurityHeaders()
    });
  }
  // Continue with normal SSE handling...
}
```

3. **Configure Cloudflare Firewall Rules** (Optional but recommended):
   - Go to your Cloudflare dashboard
   - Navigate to Security > WAF > Custom rules
   - Create a new rule:
     - Field: `IP Source Address`
     - Operator: `is not in`
     - Value: `34.162.46.92, 34.162.102.82, 34.162.136.91, 34.162.142.92, 34.162.183.95`
     - Path: `equals /sse`
     - Action: `Block`

## Additional Security Best Practices

### 1. Environment Variable Validation

Always validate that required secrets are present:
```typescript
if (!env.LIMITLESS_API_KEY || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
  throw new Error('Missing required environment variables');
}
```

### 2. Rate Limiting

The security middleware includes rate limiting functionality. To enable it:

1. Create a KV namespace for rate limiting:
```bash
npx wrangler kv:namespace create "RATE_LIMIT_KV"
```

2. Add to your `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-rate-limit-kv-id"
```

### 3. Request Signing (Future Enhancement)

Consider implementing HMAC signing for MCP protocol messages:
```typescript
function verifySignature(request: Request, secret: string): boolean {
  const signature = request.headers.get('X-MCP-Signature');
  const body = await request.text();
  const expectedSignature = await createHmacSignature(body, secret);
  return signature === expectedSignature;
}
```

### 4. Audit Logging

Log security-relevant events:
```typescript
interface SecurityEvent {
  timestamp: number;
  event: string;
  ip: string;
  userId?: string;
  details?: any;
}

async function logSecurityEvent(event: SecurityEvent, env: Env) {
  await env.AUDIT_KV.put(
    `audit:${Date.now()}:${crypto.randomUUID()}`,
    JSON.stringify(event),
    { expirationTtl: 2592000 } // 30 days
  );
}
```

## Security Checklist

- [ ] **API Keys**: Stored as encrypted Cloudflare secrets ✅
- [ ] **OAuth Flow**: Implements PKCE for authorization code flow ✅
- [ ] **HTTPS Only**: Enforced by Cloudflare Workers ✅
- [ ] **Token Expiration**: Short-lived tokens (1 hour) ✅
- [ ] **State Validation**: CSRF protection via state parameter ✅
- [ ] **IP Allowlisting**: Restrict to Anthropic IPs (optional)
- [ ] **Rate Limiting**: Configurable per-IP limits (optional)
- [ ] **Security Headers**: HSTS, CSP, X-Frame-Options (optional)
- [ ] **Error Handling**: Sanitized error messages
- [ ] **Audit Logging**: Track security events (optional)

## Monitoring

1. **Cloudflare Analytics**: Monitor request patterns and anomalies
2. **Workers Logs**: Use `wrangler tail` to monitor live logs
3. **KV Metrics**: Track OAuth token usage and rate limit hits

## Incident Response

If you suspect a security incident:

1. **Immediately revoke** the Limitless API key
2. **Rotate** GitHub OAuth credentials
3. **Clear** all KV namespaces:
   ```bash
   npx wrangler kv:key list --namespace-id=YOUR_OAUTH_KV_ID | \
   xargs -I {} npx wrangler kv:key delete {} --namespace-id=YOUR_OAUTH_KV_ID
   ```
4. **Review** Cloudflare logs for suspicious activity
5. **Update** IP allowlists if needed

## Responsible Disclosure

Found a security vulnerability? Please report it by:
- Creating a private security advisory on [GitHub](https://github.com/BurtTheCoder/mcp-limitless/security/advisories/new)
- Opening an issue at [GitHub Issues](https://github.com/BurtTheCoder/mcp-limitless/issues)

## Updates

This security configuration is based on:
- Anthropic MCP documentation (January 2025)
- Cloudflare Workers best practices
- OAuth 2.0 Security Best Current Practice (RFC 8252)

Last updated: January 2025