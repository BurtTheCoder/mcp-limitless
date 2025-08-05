// src/limitless-auth-handler.ts
import { Context } from "hono";

interface Env {
  LIMITLESS_API_KEY?: string;
}

/**
 * Simple auth handler that uses API key authentication
 * For production, you might want to implement OAuth with Limitless
 */
const LimitlessAuthHandler = {
  async authorize(c: Context<{ Bindings: Env }>) {
    // For now, we're using a shared API key from environment
    // In production, you might want to implement per-user OAuth
    const apiKey = c.env.LIMITLESS_API_KEY;
    
    if (!apiKey) {
      return c.json(
        { error: "Server not configured. Please set LIMITLESS_API_KEY." },
        401
      );
    }
    
    // Since we're using a shared API key, we'll auto-approve
    // In a real implementation, you'd redirect to Limitless OAuth
    return c.redirect("/callback?approved=true");
  },
  
  async callback(c: Context<{ Bindings: Env }>) {
    // Handle the callback after authorization
    const approved = c.req.query("approved");
    
    if (approved === "true") {
      // Generate a simple token (in production, use proper JWT)
      const token = btoa(JSON.stringify({
        authorized: true,
        timestamp: Date.now(),
      }));
      
      return c.json({
        access_token: token,
        token_type: "Bearer",
        expires_in: 3600,
      });
    }
    
    return c.json({ error: "Authorization denied" }, 403);
  },
  
  async token(c: Context<{ Bindings: Env }>) {
    // Token refresh endpoint
    // For now, just return a new token
    const token = btoa(JSON.stringify({
      authorized: true,
      timestamp: Date.now(),
    }));
    
    return c.json({
      access_token: token,
      token_type: "Bearer",
      expires_in: 3600,
    });
  },
};

export default LimitlessAuthHandler;
