// src/mcp.ts
import { z } from "zod";
import MCP from "@cloudflare/mcp-server-router";

interface Env {
  LIMITLESS_API_KEY?: string;
}

const MAX_RESULTS_LIMIT = 10;
const API_BASE_URL = "https://api.limitless.ai";

// Helper function to get timezone
function getIanaTimeZoneIdentifier(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

// Helper function to make API requests
async function makeApiRequest(
  endpoint: string,
  params: Record<string, any> = {},
  apiKey: string
): Promise<any> {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value.toString());
    }
  });
  
  const response = await fetch(url.toString(), {
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    
    if (response.status === 429) {
      let retryAfter = "60";
      try {
        const errorJson = JSON.parse(errorText);
        retryAfter = errorJson.retryAfter || "60";
      } catch {}
      
      throw new Error(
        `Rate limit exceeded (180 requests/minute). Please wait ${retryAfter} seconds before retrying.`
      );
    }
    
    switch (response.status) {
      case 400:
        throw new Error(`Bad request: ${errorText}`);
      case 401:
        throw new Error("Invalid API key. Please check your Limitless API key at app.limitless.ai");
      case 404:
        throw new Error("Resource not found. The lifelog may have been deleted.");
      default:
        throw new Error(`API error (${response.status}): ${errorText}`);
    }
  }
  
  return response.json();
}

// Helper function to format content nodes
function formatContentNodes(nodes: any[], depth = 0): string {
  let output = "";
  
  for (const node of nodes) {
    switch (node.type) {
      case "heading1":
        output += `# ${node.content}\n\n`;
        break;
      case "heading2":
        output += `## ${node.content}\n\n`;
        break;
      case "heading3":
        output += `### ${node.content}\n\n`;
        break;
      case "blockquote":
        const speaker = node.speakerName || node.speakerIdentifier || "Unknown";
        output += `> **${speaker}:** ${node.content}\n`;
        if (node.startTime && node.endTime) {
          output += `> *[${new Date(node.startTime).toLocaleTimeString()} - ${new Date(node.endTime).toLocaleTimeString()}]*\n`;
        }
        output += "\n";
        break;
      case "paragraph":
        output += `${node.content}\n\n`;
        break;
      default:
        output += `${node.content}\n\n`;
    }
    
    if (node.children && node.children.length > 0) {
      output += formatContentNodes(node.children, depth + 1);
    }
  }
  
  return output;
}

// Helper function to format lifelog content
function formatLifelogContent(lifelog: any): string {
  if (lifelog.contents && Array.isArray(lifelog.contents)) {
    return formatContentNodes(lifelog.contents);
  }
  
  if (lifelog.markdown) {
    return lifelog.markdown;
  }
  
  return `# ${lifelog.title}\n\nNo content available.`;
}

// Helper function to format search results
function formatSearchResults(response: any, query: string, timezone: string): string {
  const { lifelogs } = response.data;
  const { nextCursor, count } = response.meta?.lifelogs || {};
  
  if (!lifelogs || lifelogs.length === 0) {
    return `No lifelogs found matching "${query}".`;
  }
  
  let output = `# Search Results for "${query}"\n\n`;
  output += `📊 **Found:** ${count || lifelogs.length} lifelog(s)\n`;
  
  const starredCount = lifelogs.filter((l: any) => l.isStarred).length;
  if (starredCount > 0) {
    output += `🌟 **Starred:** ${starredCount}\n`;
  }
  
  if (lifelogs.length === MAX_RESULTS_LIMIT) {
    output += `\n⚠️ **Note:** Search results are limited to ${MAX_RESULTS_LIMIT} entries. Refine your search for more specific results.\n`;
  }
  
  output += "\n---\n\n";
  
  lifelogs.forEach((lifelog: any, index: number) => {
    output += `## ${index + 1}. ${lifelog.title}\n`;
    output += `**Time:** ${new Date(lifelog.startTime).toLocaleString("en-US", { timeZone: timezone })} - ${new Date(lifelog.endTime).toLocaleString("en-US", { timeZone: timezone })}\n`;
    if (lifelog.isStarred) {
      output += `**Starred:** ⭐\n`;
    }
    if (lifelog.updatedAt) {
      output += `**Last Updated:** ${new Date(lifelog.updatedAt).toLocaleString("en-US", { timeZone: timezone })}\n`;
    }
    output += `**ID:** ${lifelog.id}\n\n`;
    
    const content = formatLifelogContent(lifelog);
    const previewLimit = 1000;
    const preview = content.length > previewLimit
      ? content.substring(0, previewLimit) + "...\n*(truncated - use get_lifelog to view full content)*"
      : content;
    output += preview + "\n\n---\n\n";
  });
  
  return output;
}

// Define the MCP server
const MyMCP = new MCP<Env>("Limitless MCP Server");

MyMCP.tool({
  name: "search_lifelogs",
  description: "Search through your Pendant lifelogs using hybrid search (semantic + keyword). Supports natural language queries like 'place bob recommended' or boolean operators like 'meeting OR dinner'. Limited to 10 results per search.",
  schema: z.object({
    query: z.string().describe("The search query using natural language or boolean operators (OR)"),
    timezone: z.string().optional().describe("IANA timezone specifier (e.g., 'America/Los_Angeles', 'UTC')"),
    start: z.string().optional().describe("Start datetime in ISO-8601 format (YYYY-MM-DD or YYYY-MM-DD HH:mm:SS)"),
    end: z.string().optional().describe("End datetime in ISO-8601 format (YYYY-MM-DD or YYYY-MM-DD HH:mm:SS)"),
    isStarred: z.boolean().optional().describe("Filter to only show starred lifelogs"),
    limit: z.number().optional().describe("Maximum number of results to return (default: 5, max: 10)"),
  }),
  handler: async ({ query, timezone, start, end, isStarred, limit }, { env }) => {
    const apiKey = env.LIMITLESS_API_KEY;
    if (!apiKey) {
      throw new Error("LIMITLESS_API_KEY is not configured");
    }
    
    const tz = timezone || getIanaTimeZoneIdentifier();
    
    const params: Record<string, any> = {
      search: query,
      ...(timezone && { timezone: tz }),
      ...(start && { start }),
      ...(end && { end }),
      ...(isStarred !== undefined && { isStarred }),
      ...(limit && { limit: Math.min(limit || 5, MAX_RESULTS_LIMIT) }),
    };
    
    const response = await makeApiRequest("/v1/lifelogs", params, apiKey);
    return formatSearchResults(response, query, tz);
  },
});

MyMCP.tool({
  name: "get_lifelogs",
  description: "Get recent lifelogs from your Pendant for a specific date or time range. Supports pagination with cursor for browsing large datasets. Max 10 entries per request.",
  schema: z.object({
    date: z.string().optional().describe("Get all entries for a specific date in YYYY-MM-DD format"),
    timezone: z.string().optional().describe("IANA timezone specifier"),
    start: z.string().optional().describe("Start datetime in ISO-8601 format"),
    end: z.string().optional().describe("End datetime in ISO-8601 format"),
    isStarred: z.boolean().optional().describe("Filter to only show starred lifelogs"),
    limit: z.number().optional().describe("Maximum number of results (default: 3, max: 10)"),
    direction: z.enum(["asc", "desc"]).optional().describe("Sort direction (default: desc)"),
    cursor: z.string().optional().describe("Pagination cursor from previous response"),
    includeNextCursor: z.boolean().optional().describe("Include pagination cursor in response"),
  }),
  handler: async ({ date, timezone, start, end, isStarred, limit, direction, cursor, includeNextCursor }, { env }) => {
    const apiKey = env.LIMITLESS_API_KEY;
    if (!apiKey) {
      throw new Error("LIMITLESS_API_KEY is not configured");
    }
    
    const tz = timezone || getIanaTimeZoneIdentifier();
    
    const params: Record<string, any> = {
      ...(date && { date }),
      ...(timezone && { timezone: tz }),
      ...(start && { start }),
      ...(end && { end }),
      ...(isStarred !== undefined && { isStarred }),
      ...(limit && { limit: Math.min(limit || 3, MAX_RESULTS_LIMIT) }),
      ...(direction && { direction }),
      ...(cursor && { cursor }),
    };
    
    const response = await makeApiRequest("/v1/lifelogs", params, apiKey);
    
    let output = `Found ${response.data.lifelogs.length} lifelog(s)`;
    if (response.meta?.lifelogs?.count) {
      output += ` (Total in query: ${response.meta.lifelogs.count})`;
    }
    output += ":\n\n";
    
    if (response.data.lifelogs.length === 0) {
      output += "No lifelogs found for the specified criteria.";
    } else {
      response.data.lifelogs.forEach((lifelog: any, index: number) => {
        output += `## ${index + 1}. ${lifelog.title}\n`;
        output += `**Time:** ${new Date(lifelog.startTime).toLocaleString("en-US", { timeZone: tz })} - ${new Date(lifelog.endTime).toLocaleString("en-US", { timeZone: tz })}\n`;
        if (lifelog.isStarred) {
          output += `**Starred:** ⭐\n`;
        }
        output += `**ID:** ${lifelog.id}\n\n`;
        
        const content = formatLifelogContent(lifelog);
        const previewLimit = 1000;
        const preview = content.length > previewLimit
          ? content.substring(0, previewLimit) + "...\n*(truncated - use get_lifelog to view full content)*"
          : content;
        output += preview + "\n\n---\n\n";
      });
    }
    
    if (includeNextCursor && response.meta?.lifelogs?.nextCursor) {
      output += `\n📄 **Next Page Cursor:** \`${response.meta.lifelogs.nextCursor}\`\n`;
      output += `Use this cursor to get the next page of results.\n`;
    } else if (response.meta?.lifelogs?.nextCursor) {
      output += `\n📄 **More results available.** Set includeNextCursor: true to get pagination cursor.\n`;
    }
    
    return output;
  },
});

MyMCP.tool({
  name: "get_lifelog",
  description: "Get a specific lifelog entry by its ID. Use this to get detailed information about a particular lifelog entry.",
  schema: z.object({
    id: z.string().describe("The unique identifier of the lifelog entry"),
    timezone: z.string().optional().describe("IANA timezone specifier"),
    includeMarkdown: z.boolean().optional().describe("Include markdown content (default: true)"),
    includeHeadings: z.boolean().optional().describe("Include headings (default: true)"),
  }),
  handler: async ({ id, timezone, includeMarkdown, includeHeadings }, { env }) => {
    const apiKey = env.LIMITLESS_API_KEY;
    if (!apiKey) {
      throw new Error("LIMITLESS_API_KEY is not configured");
    }
    
    const tz = timezone || getIanaTimeZoneIdentifier();
    
    const params: Record<string, any> = {
      ...(timezone && { timezone: tz }),
      ...(includeMarkdown !== undefined && { includeMarkdown }),
      ...(includeHeadings !== undefined && { includeHeadings }),
    };
    
    const response = await makeApiRequest(`/v1/lifelogs/${id}`, params, apiKey);
    
    if (!response.data.lifelog) {
      return "Lifelog not found.";
    }
    
    const lifelog = response.data.lifelog;
    const content = formatLifelogContent(lifelog);
    
    let output = `# ${lifelog.title}\n\n`;
    output += `**Time:** ${new Date(lifelog.startTime).toLocaleString("en-US", { timeZone: tz })} - ${new Date(lifelog.endTime).toLocaleString("en-US", { timeZone: tz })}\n`;
    if (lifelog.isStarred) {
      output += `**Starred:** ⭐\n`;
    }
    if (lifelog.updatedAt) {
      output += `**Last Updated:** ${new Date(lifelog.updatedAt).toLocaleString("en-US", { timeZone: tz })}\n`;
    }
    output += `**ID:** ${lifelog.id}\n\n`;
    output += content;
    
    return output;
  },
});

MyMCP.tool({
  name: "delete_lifelog",
  description: "Permanently delete a specific lifelog entry by ID. WARNING: This action cannot be undone.",
  schema: z.object({
    id: z.string().describe("The unique identifier of the lifelog entry to delete"),
    confirm: z.boolean().describe("Confirmation flag to prevent accidental deletion (must be true)"),
  }),
  handler: async ({ id, confirm }, { env }) => {
    const apiKey = env.LIMITLESS_API_KEY;
    if (!apiKey) {
      throw new Error("LIMITLESS_API_KEY is not configured");
    }
    
    if (!confirm) {
      throw new Error("Deletion requires explicit confirmation. Set confirm: true to proceed.");
    }
    
    const response = await fetch(`${API_BASE_URL}/v1/lifelogs/${id}`, {
      method: "DELETE",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Lifelog not found or already deleted.");
      }
      const errorText = await response.text();
      throw new Error(`Failed to delete lifelog: ${errorText}`);
    }
    
    return `✅ Successfully deleted lifelog with ID: ${id}\n\n⚠️ This action cannot be undone.`;
  },
});

// Add prompts
MyMCP.prompt({
  name: "summarize_day",
  description: "Summarize today using Limitless lifelogs",
  handler: async () => {
    return "Please summarize my day today using my Limitless lifelogs. Include key conversations, decisions, and action items.";
  },
});

MyMCP.prompt({
  name: "find_conversations",
  description: "Find conversations mentioning a specific topic",
  handler: async (args: { topic?: string }) => {
    const topic = args?.topic || "[topic]";
    return `Find conversations where I discussed ${topic} using my Limitless lifelogs.`;
  },
});

MyMCP.prompt({
  name: "generate_tasks",
  description: "Generate tasks from recent conversations",
  handler: async () => {
    return "Analyze my recent conversations and generate a list of actionable tasks and follow-ups that I should complete.";
  },
});

export default MyMCP;
