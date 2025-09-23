#!/bin/bash

# Script to generate .env file from ai-core-key.json
# Usage: ./scripts/generate-env.sh [path-to-ai-core-key.json]

set -e

# Default path to the JSON file
JSON_FILE="${1:-ai-core-key.json}"
ENV_FILE=".env"

# Check if JSON file exists
if [ ! -f "$JSON_FILE" ]; then
    echo "❌ Error: $JSON_FILE not found!"
    echo "Usage: $0 [path-to-ai-core-key.json]"
    echo "Example: $0 ai-core-key.json"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is required but not installed."
    echo "Install with: brew install jq"
    exit 1
fi

echo "🔧 Generating .env file from $JSON_FILE..."

# Extract values from JSON using jq
CLIENT_ID=$(jq -r '.clientid' "$JSON_FILE")
CLIENT_SECRET=$(jq -r '.clientsecret' "$JSON_FILE")
AUTH_URL=$(jq -r '.url' "$JSON_FILE")
BASE_URL=$(jq -r '.serviceurls.AI_API_URL' "$JSON_FILE")

# Validate extracted values
if [ "$CLIENT_ID" = "null" ] || [ "$CLIENT_SECRET" = "null" ] || [ "$AUTH_URL" = "null" ] || [ "$BASE_URL" = "null" ]; then
    echo "❌ Error: Failed to extract required values from $JSON_FILE"
    echo "Please check the JSON file format."
    exit 1
fi

# Create .env file
cat > "$ENV_FILE" << EOF
# SAP AI Core Authentication Configuration
# Generated from $JSON_FILE on $(date)
AICORE_AUTH_URL=$AUTH_URL
AICORE_CLIENT_ID="$CLIENT_ID"
AICORE_CLIENT_SECRET="$CLIENT_SECRET"
AICORE_BASE_URL=$BASE_URL
EOF

echo "✅ Successfully generated $ENV_FILE"
echo ""
echo "📋 Generated configuration:"
echo "  AICORE_AUTH_URL=$AUTH_URL"
echo "  AICORE_CLIENT_ID=\"$CLIENT_ID\""
echo "  AICORE_CLIENT_SECRET=\"[HIDDEN]\""
echo "  AICORE_BASE_URL=$BASE_URL"
echo ""
echo "🚀 You can now start the proxy with: npm start"
echo ""
echo "⚠️  Note: The $JSON_FILE file contains sensitive credentials."
echo "   Make sure it's added to .gitignore to avoid committing it."
