// Security middleware for validating Anthropic IP addresses
export const ANTHROPIC_IPS = [
  '34.162.46.92',
  '34.162.102.82',
  '34.162.136.91',
  '34.162.142.92',
  '34.162.183.95'
];

export function validateAnthropicOrigin(request: Request): boolean {
  // Get the real client IP from Cloudflare headers
  const clientIp = request.headers.get('CF-Connecting-IP') || 
                   request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
                   request.headers.get('X-Real-IP');
  
  if (!clientIp) {
    console.warn('No client IP found in request headers');
    return false;
  }
  
  const isValidIp = ANTHROPIC_IPS.includes(clientIp);
  if (!isValidIp) {
    console.warn(`Rejected request from unauthorized IP: ${clientIp}`);
  }
  
  return isValidIp;
}

export function createSecurityHeaders(): Headers {
  const headers = new Headers();
  
  // Security headers
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'");
  
  return headers;
}

export async function rateLimitCheck(
  request: Request, 
  env: { RATE_LIMIT_KV?: KVNamespace }
): Promise<boolean> {
  if (!env.RATE_LIMIT_KV) return true;
  
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `rate_limit:${clientIp}`;
  const now = Date.now();
  const window = 60000; // 1 minute window
  const limit = 100; // 100 requests per minute
  
  const data = await env.RATE_LIMIT_KV.get(key);
  let count = 0;
  let windowStart = now;
  
  if (data) {
    const parsed = JSON.parse(data);
    if (now - parsed.windowStart < window) {
      count = parsed.count;
      windowStart = parsed.windowStart;
    }
  }
  
  count++;
  
  if (count > limit) {
    return false;
  }
  
  await env.RATE_LIMIT_KV.put(
    key,
    JSON.stringify({ count, windowStart }),
    { expirationTtl: 60 }
  );
  
  return true;
}