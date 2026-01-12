# Google Workspace MCP Server

An MCP (Model Context Protocol) server that provides read/write access to Google Sheets and Google Docs.

## Available Tools

| Tool | Description |
|------|-------------|
| `read_sheet` | Read data from a Google Sheets spreadsheet |
| `read_doc` | Read text content from a Google Doc |
| `list_sheets` | List all sheets/tabs in a spreadsheet |
| `append_to_doc` | Prepend content to a Google Doc |
| `append_to_sheet` | Append rows to a spreadsheet |
| `update_sheet` | Update a specific range in a spreadsheet |

## Quick Start

### 1. Install from GitHub

```bash
npm install -g github:HarleyCoops/google-workspace-mcp
```

Or clone and build locally:

```bash
git clone https://github.com/HarleyCoops/google-workspace-mcp.git
cd google-workspace-mcp
npm install
npm run build
```

### 2. Set Up Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable these APIs:
   - Google Sheets API
   - Google Docs API
   - Google Drive API
4. Create OAuth 2.0 credentials (Desktop app type)
5. Download as `credentials.json`

### 3. Generate OAuth Token

```bash
pip install google-auth-oauthlib google-api-python-client
python regenerate_google_token.py
```

This creates `token.json` with your OAuth credentials.

### 4. Configure Your MCP Client

Set the `GOOGLE_TOKEN_PATH` environment variable to point to your `token.json` file.

---

## MCP Configuration

### Standard JSON Config (Claude Desktop, Cursor, VS Code, etc.)

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["github:HarleyCoops/google-workspace-mcp"],
      "env": {
        "GOOGLE_TOKEN_PATH": "/path/to/your/token.json"
      }
    }
  }
}
```

### If installed globally

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "google-workspace-mcp",
      "env": {
        "GOOGLE_TOKEN_PATH": "/path/to/your/token.json"
      }
    }
  }
}
```

### If cloned locally

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["/path/to/google-workspace-mcp/build/index.js"],
      "env": {
        "GOOGLE_TOKEN_PATH": "/path/to/your/token.json"
      }
    }
  }
}
```

---

## Emergent.sh Setup

For [Emergent.sh](https://emergent.sh), you have two options:

### Option A: Use as stdio MCP (if supported)

In Emergent's MCP configuration:

```json
{
  "command": "npx",
  "args": ["github:HarleyCoops/google-workspace-mcp"],
  "env": {
    "GOOGLE_TOKEN_PATH": "/path/to/token.json"
  }
}
```

### Option B: Self-host as HTTP endpoint

If Emergent requires an HTTP/SSE endpoint, you'll need to wrap this server. See the [MCP HTTP Transport docs](https://modelcontextprotocol.io/docs/concepts/transports#http-with-sse) for details.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_TOKEN_PATH` | Path to OAuth token.json | `./token.json` |
| `DAILY_REPO_PATH` | Base path for .env loading | `C:\Users\chris\Daily` |

---

## Token Generation Script

Save this as `regenerate_google_token.py`:

```python
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/documents.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.file'
]

def main():
    flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
    creds = flow.run_local_server(port=0)
    with open('token.json', 'w') as f:
        f.write(creds.to_json())
    print("Token saved to token.json")

if __name__ == '__main__':
    main()
```

---

## Usage Examples

### Reading a Sheet

Extract the spreadsheet ID from the URL:
```
https://docs.google.com/spreadsheets/d/1Zlxn88pgMi0WAKFo.../edit
                                        ^^^^^^^^^^^^^^^^
                                        This is the ID
```

### Reading a Doc

Extract the document ID from the URL:
```
https://docs.google.com/document/d/17p5DfXbyEYhsMy.../edit
                                   ^^^^^^^^^^^^^^^
                                   This is the ID
```

---

## Security Notes

- Never commit `credentials.json` or `token.json` to version control
- `token.json` contains refresh tokens that provide persistent access
- Revoke access anytime at: https://myaccount.google.com/permissions

---

## License

MIT
