#!/usr/bin/env python3
"""
Generate OAuth token for Google Workspace MCP Server.

Prerequisites:
    pip install google-auth-oauthlib google-api-python-client

Usage:
    1. Download credentials.json from Google Cloud Console
    2. Run: python regenerate_google_token.py
    3. Authorize in browser
    4. token.json will be created
"""

from google_auth_oauthlib.flow import InstalledAppFlow
import os

SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.activity.readonly',
    'https://www.googleapis.com/auth/documents.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.file'
]

def main():
    """Runs the authentication flow and saves token to token.json."""

    if not os.path.exists('credentials.json'):
        print("Error: credentials.json not found.")
        print("\nTo get credentials.json:")
        print("1. Go to https://console.cloud.google.com/")
        print("2. Create/select a project")
        print("3. Enable Google Sheets, Docs, and Drive APIs")
        print("4. Go to Credentials > Create Credentials > OAuth client ID")
        print("5. Select 'Desktop app' and download the JSON")
        print("6. Rename to credentials.json and place in this directory")
        return

    flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
    creds = flow.run_local_server(port=0)

    with open('token.json', 'w') as token_file:
        token_file.write(creds.to_json())

    print("\n" + "="*50)
    print("TOKEN GENERATED SUCCESSFULLY")
    print("="*50)
    print("\nCredentials saved to token.json")
    print("\nSet GOOGLE_TOKEN_PATH environment variable to use this token:")
    print(f"  export GOOGLE_TOKEN_PATH={os.path.abspath('token.json')}")
    print("="*50)

if __name__ == '__main__':
    main()
