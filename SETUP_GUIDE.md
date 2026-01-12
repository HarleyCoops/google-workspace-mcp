# Google Workspace MCP Server - Complete Setup Guide

This guide provides step-by-step instructions for setting up a Google Workspace MCP server that provides read access to Google Sheets and Google Docs. This is written for another LLM or developer to replicate.

---

## Prerequisites

- Node.js 18+ installed
- npm or pnpm package manager
- A Google account
- Access to Google Cloud Console

---

## Part 1: Google Cloud Project Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top of the page
3. Click "New Project"
4. Enter a project name (e.g., `mcp-workspace-integration`)
5. Click "Create"
6. Wait for the project to be created, then select it

### Step 2: Enable Required APIs

You need to enable these APIs for your project:

1. **Google Sheets API:**
   - Go to: https://console.cloud.google.com/apis/library/sheets.googleapis.com
   - Select your project
   - Click "Enable"

2. **Google Docs API:**
   - Go to: https://console.cloud.google.com/apis/library/docs.googleapis.com
   - Select your project
   - Click "Enable"

3. **Google Drive API** (for activity tracking, optional):
   - Go to: https://console.cloud.google.com/apis/library/drive.googleapis.com
   - Select your project
   - Click "Enable"

### Step 3: Configure OAuth Consent Screen

1. Go to: https://console.cloud.google.com/apis/credentials/consent
2. Select "External" user type (unless you have Google Workspace)
3. Click "Create"
4. Fill in required fields:
   - **App name:** Your MCP Server Name
   - **User support email:** Your email
   - **Developer contact email:** Your email
5. Click "Save and Continue"
6. On the "Scopes" page, click "Add or Remove Scopes"
7. Add these scopes:
   - `https://www.googleapis.com/auth/spreadsheets.readonly`
   - `https://www.googleapis.com/auth/documents.readonly`
   - `https://www.googleapis.com/auth/drive.readonly` (optional)
8. Click "Save and Continue"
9. On "Test users" page, add your Google email as a test user
10. Click "Save and Continue"
11. Review and click "Back to Dashboard"

### Step 4: Create OAuth 2.0 Credentials

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Desktop app" as application type
4. Enter a name (e.g., `MCP Desktop Client`)
5. Click "Create"
6. Click "Download JSON" to download the credentials file
7. **Rename the downloaded file to `credentials.json`**
8. Place `credentials.json` in your working directory

---

## Part 2: Token Generation Script

Create a Python script to generate OAuth tokens. This handles the browser-based authentication flow.

### Step 1: Install Python Dependencies

```bash
pip install google-auth-oauthlib google-auth-httplib2 google-api-python-client python-dotenv
```

### Step 2: Create `regenerate_google_token.py`

```python
import os
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

# Scopes for Drive API, Drive Activity API, Docs API, and Sheets API
SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly', 
    'https://www.googleapis.com/auth/drive.activity.readonly',
    'https://www.googleapis.com/auth/documents.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.file'
]

def main():
    """Runs the authentication flow and saves token to token.json."""
    creds = None
    
    if not os.path.exists('credentials.json'):
        print("Error: credentials.json not found. Download it from Google Cloud Console.")
        return

    # Run the authorization flow
    flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
    creds = flow.run_local_server(port=0)

    # Save the credentials
    with open('token.json', 'w') as token_file:
        token_file.write(creds.to_json())

    print("\n" + "="*50)
    print("TOKEN REGENERATION SUCCESSFUL")
    print("="*50)
    print("\nCredentials saved to token.json")
    print("="*50)

if __name__ == '__main__':
    main()
```

### Step 3: Generate Token

```bash
python regenerate_google_token.py
```

This will:
1. Open a browser window
2. Ask you to sign in to Google
3. Request permission for the scopes
4. Create `token.json` with your OAuth credentials

---

## Part 3: MCP Server Implementation

### Step 1: Create Project Structure

```bash
mkdir google-workspace-mcp
cd google-workspace-mcp
```

### Step 2: Create `package.json`

```json
{
  "name": "google-workspace-mcp",
  "version": "1.0.0",
  "description": "MCP server for Google Sheets and Docs integration",
  "type": "module",
  "main": "build/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "googleapis": "^140.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0"
  }
}
```

### Step 3: Create `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build"]
}
```

### Step 4: Create `src/index.ts`

```typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

// Token file path - configurable via environment variable
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || path.join(process.cwd(), 'token.json');

interface TokenData {
  token: string;
  refresh_token: string;
  token_uri: string;
  client_id: string;
  client_secret: string;
  scopes: string[];
}

function getAuthClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(`Token file not found at ${TOKEN_PATH}. Run token generation script first.`);
  }

  const tokenData: TokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));

  const oauth2Client = new google.auth.OAuth2(
    tokenData.client_id,
    tokenData.client_secret,
    'http://localhost'
  );

  oauth2Client.setCredentials({
    access_token: tokenData.token,
    refresh_token: tokenData.refresh_token,
  });

  return oauth2Client;
}

const isValidSheetArgs = (args: unknown): args is { spreadsheetId: string; range?: string } =>
  typeof args === 'object' &&
  args !== null &&
  typeof (args as { spreadsheetId?: string }).spreadsheetId === 'string';

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
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

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
          description: 'Read data from a Google Sheets spreadsheet. Returns cell values as markdown table.',
          inputSchema: {
            type: 'object',
            properties: {
              spreadsheetId: {
                type: 'string',
                description: 'The ID of the spreadsheet (from URL: docs.google.com/spreadsheets/d/{spreadsheetId}/...)',
              },
              range: {
                type: 'string',
                description: 'A1 notation range (e.g., "Sheet1!A1:D10"). If omitted, reads first sheet.',
              },
            },
            required: ['spreadsheetId'],
          },
        },
        {
          name: 'read_doc',
          description: 'Read the text content of a Google Doc.',
          inputSchema: {
            type: 'object',
            properties: {
              documentId: {
                type: 'string',
                description: 'The ID of the document (from URL: docs.google.com/document/d/{documentId}/...)',
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
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
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
    if (rows.length > 0) {
      markdown += '| ' + rows[0].map((cell: string) => cell || '').join(' | ') + ' |\n';
      markdown += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
    }
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Google Workspace MCP server running on stdio');
  }
}

const server = new GoogleWorkspaceServer();
server.run().catch(console.error);
```

### Step 5: Install Dependencies and Build

```bash
npm install
npm run build
```

---

## Part 4: MCP Configuration

### For Cursor/Cline

Add to your MCP settings file (typically `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "google-workspace": {
      "autoApprove": [
        "read_sheet",
        "read_doc",
        "list_sheets"
      ],
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "node",
      "args": [
        "C:\\path\\to\\google-workspace-mcp\\build\\index.js"
      ],
      "env": {
        "GOOGLE_TOKEN_PATH": "C:\\path\\to\\token.json"
      }
    }
  }
}
```

### For Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["/path/to/google-workspace-mcp/build/index.js"],
      "env": {
        "GOOGLE_TOKEN_PATH": "/path/to/token.json"
      }
    }
  }
}
```

---

## Part 5: Usage

### Available Tools

1. **read_sheet** - Read spreadsheet data
   ```
   spreadsheetId: "1Zlxn88pgMi0WAKFo-pguxYOAWL4K6vA0TWXhgKgSGuI"
   range: "Sheet1!A1:D10" (optional)
   ```

2. **read_doc** - Read document content
   ```
   documentId: "17p5DfXbyEYhsMyZUSGgBoBMrakPf2XToGoaG8_5ThnI"
   ```

3. **list_sheets** - List all tabs in a spreadsheet
   ```
   spreadsheetId: "1Zlxn88pgMi0WAKFo-pguxYOAWL4K6vA0TWXhgKgSGuI"
   ```

### Extracting IDs from URLs

- **Spreadsheet ID:** `docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
- **Document ID:** `docs.google.com/document/d/{DOCUMENT_ID}/edit`

---

## Troubleshooting

### "Token file not found"
- Run `python regenerate_google_token.py` to generate `token.json`
- Verify `GOOGLE_TOKEN_PATH` environment variable points to correct location

### "Invalid credentials" or "Access denied"
- Ensure APIs are enabled in Google Cloud Console
- Check that OAuth consent screen has required scopes
- Regenerate token if scopes changed

### "Request had insufficient authentication scopes"
- Add missing scopes to `SCOPES` array in token script
- Delete `token.json` and regenerate

### MCP server not appearing
- Check MCP settings file path in args
- Verify `npm run build` completed successfully
- Restart your IDE/application

---

## Security Notes

1. **Never commit** `credentials.json` or `token.json` to version control
2. Add to `.gitignore`:
   ```
   credentials.json
   token.json
   ```
3. `token.json` contains refresh tokens that provide persistent access
4. Revoke access at: https://myaccount.google.com/permissions

---

## Extending the Server

To add write capabilities, add new tools with these scopes:
- `https://www.googleapis.com/auth/spreadsheets` (full sheets access)
- `https://www.googleapis.com/auth/documents` (full docs access)

Then implement tools like `update_sheet`, `append_to_doc`, etc.
