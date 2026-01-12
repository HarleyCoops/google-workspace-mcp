#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { google, Auth } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

// Default Daily repo path
const DAILY_REPO_PATH = process.env.DAILY_REPO_PATH || 'C:\\Users\\chris\\Daily';

// Load .env file if present (from Daily repo root)
const envPath = process.env.DOTENV_PATH || path.join(DAILY_REPO_PATH, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// Token file path - uses the token from Daily repo
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || path.join(DAILY_REPO_PATH, 'token.json');

interface TokenData {
  token: string;
  refresh_token: string;
  token_uri: string;
  client_id: string;
  client_secret: string;
  scopes: string[];
  expiry?: string;
}

// Singleton auth client to handle auto-refresh
let authClient: Auth.OAuth2Client | null = null;

function getAuthClient(): Auth.OAuth2Client {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(`Token file not found at ${TOKEN_PATH}. Please run: python scripts/regenerate_google_token.py`);
  }

  // Return cached client if available
  if (authClient) {
    return authClient;
  }

  const tokenData: TokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));

  const oauth2Client = new google.auth.OAuth2(
    tokenData.client_id,
    tokenData.client_secret,
    'http://localhost'
  );

  // Set credentials with both access and refresh token
  oauth2Client.setCredentials({
    access_token: tokenData.token,
    refresh_token: tokenData.refresh_token,
    expiry_date: tokenData.expiry ? new Date(tokenData.expiry).getTime() : undefined,
  });

  // Set up automatic token refresh and save new tokens to file
  oauth2Client.on('tokens', (tokens) => {
    console.error('[Google Auth] Token refreshed automatically');
    
    // Read current token data and update it
    try {
      const currentData: TokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      
      if (tokens.access_token) {
        currentData.token = tokens.access_token;
      }
      if (tokens.refresh_token) {
        currentData.refresh_token = tokens.refresh_token;
      }
      if (tokens.expiry_date) {
        currentData.expiry = new Date(tokens.expiry_date).toISOString();
      }
      
      // Save updated token
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(currentData, null, 2));
      console.error('[Google Auth] New token saved to file');
    } catch (err) {
      console.error('[Google Auth] Failed to save refreshed token:', err);
    }
  });

  // Cache the client
  authClient = oauth2Client;
  
  return oauth2Client;
}

// Validate arguments for sheet reading
const isValidSheetArgs = (args: unknown): args is { spreadsheetId: string; range?: string } =>
  typeof args === 'object' &&
  args !== null &&
  typeof (args as { spreadsheetId?: string }).spreadsheetId === 'string';

// Validate arguments for doc reading
const isValidDocArgs = (args: unknown): args is { documentId: string } =>
  typeof args === 'object' &&
  args !== null &&
  typeof (args as { documentId?: string }).documentId === 'string';

class GoogleWorkspaceServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'google-workspace-mcp',
        version: '1.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'read_sheet',
          description: 'Read data from a Google Sheets spreadsheet. Returns the cell values as a formatted table.',
          inputSchema: {
            type: 'object',
            properties: {
              spreadsheetId: {
                type: 'string',
                description: 'The ID of the spreadsheet (from the URL: docs.google.com/spreadsheets/d/{spreadsheetId}/...)',
              },
              range: {
                type: 'string',
                description: 'The A1 notation range to read (e.g., "Sheet1!A1:D10"). If not provided, reads the first sheet.',
              },
            },
            required: ['spreadsheetId'],
          },
        },
        {
          name: 'read_doc',
          description: 'Read the text content of a Google Doc. Returns the document text.',
          inputSchema: {
            type: 'object',
            properties: {
              documentId: {
                type: 'string',
                description: 'The ID of the document (from the URL: docs.google.com/document/d/{documentId}/...)',
              },
            },
            required: ['documentId'],
          },
        },
        {
          name: 'list_sheets',
          description: 'List all sheets/tabs in a Google Sheets spreadsheet.',
          inputSchema: {
            type: 'object',
            properties: {
              spreadsheetId: {
                type: 'string',
                description: 'The ID of the spreadsheet',
              },
            },
            required: ['spreadsheetId'],
          },
        },
        {
          name: 'append_to_doc',
          description: 'Append text content to the beginning of a Google Doc (prepends new content).',
          inputSchema: {
            type: 'object',
            properties: {
              documentId: {
                type: 'string',
                description: 'The ID of the document (from URL: docs.google.com/document/d/{documentId}/...)',
              },
              content: {
                type: 'string',
                description: 'The text content to prepend to the document',
              },
            },
            required: ['documentId', 'content'],
          },
        },
        {
          name: 'append_to_sheet',
          description: 'Append rows of data to a Google Sheets spreadsheet.',
          inputSchema: {
            type: 'object',
            properties: {
              spreadsheetId: {
                type: 'string',
                description: 'The ID of the spreadsheet',
              },
              range: {
                type: 'string',
                description: 'The A1 notation range to search for a table (e.g., "Sheet1!A1"). Data will be appended after the last row of this table.',
              },
              values: {
                type: 'array',
                items: {
                  type: 'array',
                  items: { type: 'string' },
                },
                description: 'A 2D array of values to append (e.g., [["row1-col1", "row1-col2"], ["row2-col1", "row2-col2"]])',
              },
            },
            required: ['spreadsheetId', 'range', 'values'],
          },
        },
        {
          name: 'update_sheet',
          description: 'Update a specific range in a Google Sheets spreadsheet.',
          inputSchema: {
            type: 'object',
            properties: {
              spreadsheetId: {
                type: 'string',
                description: 'The ID of the spreadsheet',
              },
              range: {
                type: 'string',
                description: 'The A1 notation range to update (e.g., "Sheet1!A1:B2").',
              },
              values: {
                type: 'array',
                items: {
                  type: 'array',
                  items: { type: 'string' },
                },
                description: 'A 2D array of values to update.',
              },
            },
            required: ['spreadsheetId', 'range', 'values'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'read_sheet':
            return await this.readSheet(args);
          case 'read_doc':
            return await this.readDoc(args);
          case 'list_sheets':
            return await this.listSheets(args);
          case 'append_to_doc':
            return await this.appendToDoc(args);
          case 'append_to_sheet':
            return await this.appendToSheet(args);
          case 'update_sheet':
            return await this.updateSheet(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check if it's a token/auth error
        if (errorMessage.includes('invalid_grant') || errorMessage.includes('Token has been expired')) {
          return {
            content: [{ 
              type: 'text', 
              text: `Authentication Error: ${errorMessage}\n\nPlease run: python scripts/regenerate_google_token.py\nThen restart the MCP servers.` 
            }],
            isError: true,
          };
        }
        
        return {
          content: [{ type: 'text', text: `Error: ${errorMessage}` }],
          isError: true,
        };
      }
    });
  }

  private async readSheet(args: unknown) {
    if (!isValidSheetArgs(args)) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for read_sheet');
    }

    const auth = getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // If no range specified, get the first sheet name first
    let range = args.range;
    if (!range) {
      const metadata = await sheets.spreadsheets.get({
        spreadsheetId: args.spreadsheetId,
      });
      const firstSheet = metadata.data.sheets?.[0]?.properties?.title || 'Sheet1';
      range = firstSheet;
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: args.spreadsheetId,
      range: range,
    });

    const rows = response.data.values || [];
    
    if (rows.length === 0) {
      return {
        content: [{ type: 'text', text: 'No data found in the specified range.' }],
      };
    }

    // Format as markdown table
    let markdown = '';
    
    // Header row
    if (rows.length > 0) {
      markdown += '| ' + rows[0].map((cell: string) => cell || '').join(' | ') + ' |\n';
      markdown += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
    }
    
    // Data rows
    for (let i = 1; i < rows.length; i++) {
      markdown += '| ' + rows[i].map((cell: string) => cell || '').join(' | ') + ' |\n';
    }

    return {
      content: [{ type: 'text', text: markdown }],
    };
  }

  private async readDoc(args: unknown) {
    if (!isValidDocArgs(args)) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for read_doc');
    }

    const auth = getAuthClient();
    const docs = google.docs({ version: 'v1', auth });

    const response = await docs.documents.get({
      documentId: args.documentId,
    });

    const doc = response.data;
    let text = '';

    // Extract text from the document
    if (doc.body?.content) {
      for (const element of doc.body.content) {
        if (element.paragraph?.elements) {
          for (const e of element.paragraph.elements) {
            if (e.textRun?.content) {
              text += e.textRun.content;
            }
          }
        }
      }
    }

    return {
      content: [
        { 
          type: 'text', 
          text: `# ${doc.title || 'Untitled Document'}\n\n${text}` 
        }
      ],
    };
  }

  private async listSheets(args: unknown) {
    if (!isValidSheetArgs(args)) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for list_sheets');
    }

    const auth = getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.get({
      spreadsheetId: args.spreadsheetId,
    });

    const sheetList = response.data.sheets?.map(sheet => ({
      title: sheet.properties?.title,
      sheetId: sheet.properties?.sheetId,
      rowCount: sheet.properties?.gridProperties?.rowCount,
      columnCount: sheet.properties?.gridProperties?.columnCount,
    })) || [];

    let text = `# Sheets in Spreadsheet: ${response.data.properties?.title}\n\n`;
    for (const sheet of sheetList) {
      text += `- **${sheet.title}** (${sheet.rowCount} rows x ${sheet.columnCount} columns)\n`;
    }

    return {
      content: [{ type: 'text', text }],
    };
  }

  private async appendToDoc(args: unknown) {
    const appendArgs = args as { documentId?: string; content?: string };
    if (!appendArgs.documentId || !appendArgs.content) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for append_to_doc: requires documentId and content');
    }

    const auth = getAuthClient();
    const docs = google.docs({ version: 'v1', auth });

    // Insert at the beginning of the document (after the title)
    // Index 1 is right after the document's initial empty paragraph
    const requests = [
      {
        insertText: {
          location: {
            index: 1,
          },
          text: appendArgs.content + '\n\n',
        },
      },
    ];

    await docs.documents.batchUpdate({
      documentId: appendArgs.documentId,
      requestBody: {
        requests: requests,
      },
    });

    return {
      content: [
        {
          type: 'text',
          text: `Successfully prepended ${appendArgs.content.length} characters to document ${appendArgs.documentId}`,
        },
      ],
    };
  }

  private async appendToSheet(args: unknown) {
    const appendArgs = args as { spreadsheetId?: string; range?: string; values?: string[][] };
    if (!appendArgs.spreadsheetId || !appendArgs.range || !appendArgs.values) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for append_to_sheet: requires spreadsheetId, range, and values');
    }

    const auth = getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: appendArgs.spreadsheetId,
      range: appendArgs.range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: appendArgs.values,
      },
    });

    return {
      content: [
        {
          type: 'text',
          text: `Successfully appended ${appendArgs.values.length} rows to spreadsheet ${appendArgs.spreadsheetId}`,
        },
      ],
    };
  }

  private async updateSheet(args: unknown) {
    const updateArgs = args as { spreadsheetId?: string; range?: string; values?: string[][] };
    if (!updateArgs.spreadsheetId || !updateArgs.range || !updateArgs.values) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for update_sheet: requires spreadsheetId, range, and values');
    }

    const auth = getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.update({
      spreadsheetId: updateArgs.spreadsheetId,
      range: updateArgs.range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: updateArgs.values,
      },
    });

    return {
      content: [
        {
          type: 'text',
          text: `Successfully updated range ${updateArgs.range} in spreadsheet ${updateArgs.spreadsheetId}`,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Google Workspace MCP server v1.1.0 running on stdio (with auto-refresh)');
  }
}

const server = new GoogleWorkspaceServer();
server.run().catch(console.error);
