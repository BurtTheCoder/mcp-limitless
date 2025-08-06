// src/mcp-agent.ts
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface Env {
  LIMITLESS_API_KEY: string;
  MCP_AGENT: DurableObjectNamespace;
}

const MAX_RESULTS_LIMIT = 100; // Updated based on API spec
const API_BASE_URL = "https://api.limitless.ai";

// Helper functions
function getIanaTimeZoneIdentifier(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

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
    console.error(`Limitless API error (${response.status}): ${errorText}`);
    throw new Error(`API request failed (${response.status})`);
  }
  
  return response.json();
}

function formatLifelogContent(lifelog: any): string {
  let content = "";
  
  // Handle markdown content
  if (lifelog.markdown) {
    content += `## Content\n${lifelog.markdown}\n\n`;
  }
  
  // Handle structured contents
  if (lifelog.contents && lifelog.contents.length > 0) {
    content += `## Structured Content\n`;
    lifelog.contents.forEach((node: any) => {
      content += formatContentNode(node, 0);
    });
    content += "\n";
  }
  
  // Handle old format if still present
  if (lifelog.agentSummary?.response) {
    content += `## Agent Summary\n${lifelog.agentSummary.response}\n\n`;
  }
  
  if (lifelog.transcriptSummary?.response) {
    content += `## Transcript Summary\n${lifelog.transcriptSummary.response}\n\n`;
  }
  
  if (lifelog.structuredSummary?.response) {
    const structured = lifelog.structuredSummary.response;
    if (structured.title) {
      content += `## ${structured.title}\n\n`;
    }
    if (structured.overview) {
      content += `### Overview\n${structured.overview}\n\n`;
    }
    if (structured.chapters?.length > 0) {
      content += `### Chapters\n`;
      structured.chapters.forEach((chapter: any) => {
        content += `- ${chapter.title}: ${chapter.summary}\n`;
      });
      content += "\n";
    }
    if (structured.actionItems?.length > 0) {
      content += `### Action Items\n`;
      structured.actionItems.forEach((item: string) => {
        content += `- ${item}\n`;
      });
      content += "\n";
    }
  }
  
  return content || "No content available for this lifelog.";
}

function formatContentNode(node: any, depth: number): string {
  let output = "";
  const indent = "  ".repeat(depth);
  
  if (node.type === "heading1") {
    output += `\n# ${node.content}\n`;
  } else if (node.type === "heading2") {
    output += `\n## ${node.content}\n`;
  } else if (node.type === "heading3") {
    output += `\n### ${node.content}\n`;
  } else if (node.type === "blockquote") {
    const speaker = node.speakerName || node.speakerIdentifier || "Speaker";
    output += `${indent}> **${speaker}**: ${node.content}\n`;
  } else if (node.content) {
    output += `${indent}${node.content}\n`;
  }
  
  if (node.children && node.children.length > 0) {
    node.children.forEach((child: any) => {
      output += formatContentNode(child, depth + 1);
    });
  }
  
  return output;
}

function formatSearchResults(response: any, timezone: string): string {
  // Handle the nested data structure from the API
  const lifelogs = response.data?.lifelogs || response.lifelogs || [];
  
  if (!lifelogs || lifelogs.length === 0) {
    return "No lifelogs found matching your search query.";
  }
  
  let output = `Found ${lifelogs.length} lifelog(s):\n\n`;
  
  lifelogs.forEach((lifelog: any, index: number) => {
    output += `### ${index + 1}. `;
    
    if (lifelog.title) {
      output += lifelog.title + "\n";
    } else {
      output += "Untitled\n";
    }
    
    if (lifelog.startTime) {
      output += `**Start:** ${new Date(lifelog.startTime).toLocaleString("en-US", { timeZone: timezone })}\n`;
    }
    if (lifelog.endTime) {
      output += `**End:** ${new Date(lifelog.endTime).toLocaleString("en-US", { timeZone: timezone })}\n`;
    }
    if (lifelog.updatedAt) {
      output += `**Last Updated:** ${new Date(lifelog.updatedAt).toLocaleString("en-US", { timeZone: timezone })}\n`;
    }
    if (lifelog.isStarred) {
      output += `**⭐ Starred**\n`;
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

function formatSingleLifelog(response: any, timezone: string): string {
  // Handle the nested data structure from the API
  const lifelog = response.data?.lifelog || response.lifelog || response;
  
  if (!lifelog) {
    return "Lifelog not found.";
  }
  
  let output = "## Lifelog Details\n\n";
  
  if (lifelog.title) {
    output += `### ${lifelog.title}\n\n`;
  }
  
  if (lifelog.startTime) {
    output += `**Start:** ${new Date(lifelog.startTime).toLocaleString("en-US", { timeZone: timezone })}\n`;
  }
  if (lifelog.endTime) {
    output += `**End:** ${new Date(lifelog.endTime).toLocaleString("en-US", { timeZone: timezone })}\n`;
  }
  if (lifelog.updatedAt) {
    output += `**Last Updated:** ${new Date(lifelog.updatedAt).toLocaleString("en-US", { timeZone: timezone })}\n`;
  }
  if (lifelog.isStarred) {
    output += `**⭐ Starred**\n`;
  }
  output += `**ID:** ${lifelog.id}\n\n`;
  
  output += formatLifelogContent(lifelog);
  
  return output;
}

export class LimitlessMCPAgent extends McpAgent<Env> {
  server = new McpServer({
    name: "limitless-mcp-cloudflare",
    version: "0.4.0",
    description: "Remote MCP server for Limitless AI lifelogs"
  });

  async init() {
    const apiKey = this.env.LIMITLESS_API_KEY;
    
    if (!apiKey) {
      console.error("LIMITLESS_API_KEY is not configured");
      throw new Error("Server configuration error");
    }

    // Register tools
    this.server.tool(
      "search_lifelogs",
      "Search through your lifelogs using hybrid search (semantic + keyword). Supports natural language queries like \"place bob recommended\" or boolean operators like \"meeting OR dinner\". Limited to 100 results per search. Note: When using this tool in Claude, invoke it as 'Limitless Ai:search_lifelogs'.",
      {
        query: z.string().describe("Search query (natural language or boolean operators)"),
        limit: z.number().optional().describe("Number of results to return (max 100, default 10)"),
        timezone: z.string().optional().describe("Timezone identifier (e.g. 'America/New_York')")
      },
      async ({ query, limit = 10, timezone }) => {
        try {
          const actualLimit = Math.min(limit, MAX_RESULTS_LIMIT);
          const tz = timezone || getIanaTimeZoneIdentifier();
          
          // Use the correct endpoint and parameter name
          const result = await makeApiRequest("/v1/lifelogs", {
            search: query, // Changed from 'query' to 'search'
            limit: actualLimit,
            timezone: tz,
            includeContents: true,
            includeMarkdown: true
          }, apiKey);
          
          const formattedResults = formatSearchResults(result, tz);
          
          return {
            content: [{
              type: "text",
              text: formattedResults
            }]
          };
        } catch (error: any) {
          return {
            content: [{
              type: "text",
              text: error.message.includes('API request failed') ? error.message : 'Failed to search lifelogs'
            }]
          };
        }
      }
    );

    this.server.tool(
      "get_lifelog",
      "Retrieve the complete content of a specific lifelog by ID. Note: When using this tool in Claude, invoke it as 'Limitless Ai:get_lifelog'.",
      {
        id: z.string().describe("The ID of the lifelog to retrieve"),
        timezone: z.string().optional().describe("Timezone identifier (e.g. 'America/New_York')")
      },
      async ({ id, timezone }) => {
        try {
          const tz = timezone || getIanaTimeZoneIdentifier();
          
          // Use the correct endpoint
          const result = await makeApiRequest(`/v1/lifelogs/${id}`, {
            timezone: tz,
            includeContents: true,
            includeMarkdown: true,
            includeHeadings: true
          }, apiKey);
          
          const formattedResult = formatSingleLifelog(result, tz);
          
          return {
            content: [{
              type: "text",
              text: formattedResult
            }]
          };
        } catch (error: any) {
          return {
            content: [{
              type: "text",
              text: error.message.includes('API request failed') ? error.message : 'Failed to retrieve lifelog'
            }]
          };
        }
      }
    );

    this.server.tool(
      "list_recent_lifelogs",
      "List recent lifelogs in chronological order (newest first). Note: When using this tool in Claude, invoke it as 'Limitless Ai:list_recent_lifelogs'.",
      {
        limit: z.number().optional().describe("Number of results to return (max 100, default 10)"),
        date: z.string().optional().describe("Date in YYYY-MM-DD format to filter lifelogs"),
        timezone: z.string().optional().describe("Timezone identifier (e.g. 'America/New_York')"),
        isStarred: z.boolean().optional().describe("Filter by starred status")
      },
      async ({ limit = 10, date, timezone, isStarred }) => {
        try {
          const actualLimit = Math.min(limit, MAX_RESULTS_LIMIT);
          const tz = timezone || getIanaTimeZoneIdentifier();
          
          const params: Record<string, any> = {
            limit: actualLimit,
            timezone: tz,
            direction: "desc",
            includeContents: true,
            includeMarkdown: true
          };
          
          if (date) {
            params.date = date;
          }
          
          if (isStarred !== undefined) {
            params.isStarred = isStarred;
          }
          
          // Use the correct endpoint
          const result = await makeApiRequest("/v1/lifelogs", params, apiKey);
          
          const formattedResults = formatSearchResults(result, tz);
          
          return {
            content: [{
              type: "text",
              text: formattedResults
            }]
          };
        } catch (error: any) {
          return {
            content: [{
              type: "text",
              text: error.message.includes('API request failed') ? error.message : 'Failed to list lifelogs'
            }]
          };
        }
      }
    );

    // Register prompts
    this.server.prompt(
      "search_recent_memories",
      "Searches for recent memories or conversations",
      {
        topic: z.string().describe("The topic to search for in recent memories")
      },
      async ({ topic }) => {
        return {
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `Search my recent memories for information about: ${topic}. Please look through my lifelogs to find relevant conversations, meetings, or discussions about this topic.`
            }
          }]
        };
      }
    );

    this.server.prompt(
      "daily_summary",
      "Provides a summary of a specific day's activities",
      {
        date: z.string().optional().describe("Date in YYYY-MM-DD format (defaults to today)")
      },
      async ({ date }) => {
        const dateStr = date || new Date().toISOString().split('T')[0];
        return {
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `Please provide a summary of my activities and conversations from ${dateStr}. Look through my lifelogs from that day and highlight the key events, meetings, and important discussions.`
            }
          }]
        };
      }
    );
  }
}

// Export the Durable Object class
export { LimitlessMCPAgent as DurableObject };