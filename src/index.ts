// src/index.ts
import { OAuthProvider } from "@cloudflare/mcp-server-auth";
import MyMCP from "./mcp";
import LimitlessAuthHandler from "./limitless-auth-handler";

export interface Env {
  LIMITLESS_API_KEY?: string;
  // OAuth settings (optional - for future OAuth implementation)
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

// For now, we'll use API key authentication
// You can later switch to OAuth by implementing a proper auth handler
export default new OAuthProvider({
  apiRoute: "/sse",
  apiHandler: MyMCP.Router,
  defaultHandler: LimitlessAuthHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

