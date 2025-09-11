#!/usr/bin/env bash
# list-deployed-models.sh
#
# Lists deployed models from SAP AI Core with their deployment IDs
#
# Usage:
#   ./scripts/list-deployed-models.sh                    # List ALL deployed models
#   ./scripts/list-deployed-models.sh /all               # List only configured/supported models
#   ./scripts/list-deployed-models.sh gpt-5-nano         # Check if specific model exists
#
# Configuration comes from environment variables or a local .env file:
#   AICORE_CLIENT_ID, AICORE_CLIENT_SECRET, AICORE_AUTH_URL, AICORE_BASE_URL
#
# Requires: jq

###############################################################################
# Strict-mode & trace on failure
###############################################################################
set -Eeuo pipefail
trap 'fatal "Uncaught error on line $LINENO."' ERR

###############################################################################
# Load .env (if present)
###############################################################################
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . .env
  set +a
fi

###############################################################################
# Helpers
###############################################################################
fatal() { echo "❌  $*" >&2; exit 1; }
need()  { command -v "$1" >/dev/null 2>&1 || fatal "'$1' required but not installed."; }
need jq

# Load supported models from config/models.json
if [[ ! -f "config/models.json" ]]; then
  fatal "config/models.json not found. Please ensure you're running from the project root."
fi

# Extract supported model names from JSON config
SUPPORTED_MODELS=$(jq -r '.models | keys[]' config/models.json)

###############################################################################
# Parse arguments
###############################################################################
SEARCH_MODEL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --help|-h)
      echo "Usage: $0 [MODEL_NAME|/all] [OPTIONS]"
      echo ""
      echo "Lists deployed models from SAP AI Core with their deployment IDs"
      echo ""
      echo "Arguments:"
      echo "  MODEL_NAME       Search for a specific model by name"
      echo "  /all            Show only configured/supported models"
      echo "  (no args)       List all deployed models with support indicators"
      echo ""
      echo "Options:"
      echo "  --help, -h       Show this help message"
      echo ""
      echo "Environment variables required:"
      echo "  AICORE_CLIENT_ID      SAP AI Core client ID"
      echo "  AICORE_CLIENT_SECRET  SAP AI Core client secret"
      echo "  AICORE_AUTH_URL       SAP AI Core authentication URL"
      echo "  AICORE_BASE_URL       SAP AI Core base API URL"
      echo ""
      echo "Examples:"
      echo "  $0                    # List all deployed models"
      echo "  $0 /all              # Show only configured models"
      echo "  $0 gpt-5-nano        # Search for specific model"
      exit 0
      ;;
    -*)
      fatal "Unknown option $1"
      ;;
    *)
      if [[ -z "$SEARCH_MODEL" ]]; then
        SEARCH_MODEL="$1"
      else
        fatal "Multiple arguments provided"
      fi
      shift
      ;;
  esac
done

###############################################################################
# Required env vars
###############################################################################
readonly SEARCH_MODEL
readonly AICORE_CLIENT_ID="${AICORE_CLIENT_ID:-}"        || fatal "AICORE_CLIENT_ID missing."
readonly AICORE_CLIENT_SECRET="${AICORE_CLIENT_SECRET:-}"|| fatal "AICORE_CLIENT_SECRET missing."
readonly AICORE_AUTH_URL="${AICORE_AUTH_URL:-}" || fatal "AICORE_AUTH_URL missing."
readonly API_BASE="${AICORE_BASE_URL:-}"   || fatal "AICORE_BASE_URL missing."

###############################################################################
# Curl plumbing
###############################################################################
declare -a CURL_COMMON_HEADERS=(
  -H "AI-Resource-Group: default"
  -H "Content-Type: application/json"
)
bearer() { curl -fsS "${CURL_COMMON_HEADERS[@]}" -H "Authorization: Bearer $ACCESS_TOKEN" "$@"; }

###############################################################################
# Authentication
###############################################################################
get_access_token() {
  ACCESS_TOKEN=$(
    echo -n "$AICORE_CLIENT_ID:$AICORE_CLIENT_SECRET" | base64 | {
      read -r b64
      curl -fsS -H "Authorization: Basic $b64" \
        "${AICORE_AUTH_URL%/}/oauth/token?grant_type=client_credentials" \
      | jq -r '.access_token // empty'
    }
  )
  [[ -n $ACCESS_TOKEN ]] || fatal "Unable to obtain access token."
  readonly ACCESS_TOKEN
}

###############################################################################
# API calls
###############################################################################
get_deployments() { bearer "$API_BASE/v2/lm/deployments?scenarioId=foundation-models" | jq '.resources // []'; }

###############################################################################
# Main execution
###############################################################################
get_access_token

echo '🔎  Fetching deployed models from SAP AI Core...'
deployments=$(get_deployments)

if [[ -z "$deployments" || "$deployments" == "[]" ]]; then
  echo "ℹ️   No deployed models found."
  exit 0
fi

# Handle different modes
if [[ "$SEARCH_MODEL" == "/all" ]]; then
  # Show only configured/supported models
  echo "📋  Configured Deployed Models:"
  echo
  
  # Create a jq filter for supported models
  supported_filter=$(printf '"%s",' $(echo "$SUPPORTED_MODELS") | sed 's/,$//')
  
  # Filter deployments to only show supported models
  supported_deployments=$(echo "$deployments" | jq --argjson supported "[$supported_filter]" '
    [.[] | select(
      (.details.resources.backendDetails.model.name // .details.resources.backend_details.model.name) as $model |
      $supported | index($model)
    )]
  ')
  
  if [[ "$supported_deployments" == "[]" ]]; then
    echo "ℹ️   No configured models found in deployed models."
    echo "🔧  Configured models: $(echo "$SUPPORTED_MODELS" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')"
    exit 0
  fi
  
  # Display supported models with highlighting
  echo "$supported_deployments" | jq -r '
    .[] | 
    "✅ " + (.details.resources.backendDetails.model.name // .details.resources.backend_details.model.name // "Unknown Model") +
    " (ID: " + .id + ") [SUPPORTED]" +
    "\n   Status: " + .status +
    "\n   Deployment URL: " + (.deploymentUrl // "Not available") +
    "\n   Configuration: " + (.configurationName // "Unknown") +
    "\n"
  '
  
  # Summary for supported models only
  supported_total=$(echo "$supported_deployments" | jq 'length')
  supported_running=$(echo "$supported_deployments" | jq '[.[] | select(.status == "RUNNING")] | length')
  total_deployments=$(echo "$deployments" | jq 'length')
  
  echo "📊  Summary:"
  echo "   • Configured/Supported Models: $supported_total (out of $total_deployments total deployments)"
  echo "   • Running: $supported_running"
  echo "   • Other Status: $((supported_total - supported_running))"
  echo
  echo "🔧  Configured models: $(echo "$SUPPORTED_MODELS" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')"
  
elif [[ -n "$SEARCH_MODEL" ]]; then
  # Search for specific model
  echo "🔍  Searching for model: $SEARCH_MODEL"
  
  # Check if model exists in deployments
  found=$(echo "$deployments" | jq -r --arg model "$SEARCH_MODEL" '
    .[] | select(
      (.details.resources.backendDetails.model.name // .details.resources.backend_details.model.name) == $model
      or (.configurationName // "" | contains($model))
      or (.deploymentName // "" | contains($model))
    )
  ')
  
  if [[ -n "$found" && "$found" != "null" ]]; then
    # Check if the found model is supported
    model_name=$(echo "$found" | jq -r '.details.resources.backendDetails.model.name // .details.resources.backend_details.model.name // "Unknown"')
    is_supported=false
    while IFS= read -r supported_model; do
      if [[ "$model_name" == "$supported_model" ]]; then
        is_supported=true
        break
      fi
    done <<< "$SUPPORTED_MODELS"
    
    if [[ "$is_supported" == "true" ]]; then
      echo "✅  Model '$SEARCH_MODEL' found! [SUPPORTED]"
    else
      echo "⚠️   Model '$SEARCH_MODEL' found but NOT SUPPORTED by proxy"
    fi
    
    echo "$found" | jq -r '
      "📋 Deployment Details:",
      "   • Deployment ID: " + .id,
      "   • Status: " + .status,
      "   • Model: " + (.details.resources.backendDetails.model.name // .details.resources.backend_details.model.name // "Unknown"),
      "   • Version: " + (.details.resources.backendDetails.model.version // .details.resources.backend_details.model.version // "Unknown"),
      "   • Deployment URL: " + (.deploymentUrl // "Not available"),
      "   • Configuration: " + (.configurationName // "Unknown")
    '
    
    if [[ "$is_supported" == "false" ]]; then
      echo
      echo "🔧  Supported models: $(echo "$SUPPORTED_MODELS" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')"
    fi
  else
    echo "❌  Model '$SEARCH_MODEL' not found in deployed models."
    exit 1
  fi
else
  # Default: List ALL deployed models with support status indicators
  echo "📋  All Deployed Models:"
  echo
  
  # Create a jq filter for supported models for highlighting
  supported_filter=$(printf '"%s",' $(echo "$SUPPORTED_MODELS") | sed 's/,$//')
  
  # Display all models with support status indicators
  echo "$deployments" | jq -r --argjson supported "[$supported_filter]" '
    .[] | 
    (.details.resources.backendDetails.model.name // .details.resources.backend_details.model.name // "Unknown Model") as $model |
    if ($supported | index($model)) then
      "✅ " + $model + " (ID: " + .id + ") [SUPPORTED]"
    else
      "🔶 " + $model + " (ID: " + .id + ") [AVAILABLE]"
    end +
    "\n   Status: " + .status +
    "\n   Deployment URL: " + (.deploymentUrl // "Not available") +
    "\n   Configuration: " + (.configurationName // "Unknown") +
    "\n"
  '
  
  # Summary for all models
  total=$(echo "$deployments" | jq 'length')
  running=$(echo "$deployments" | jq '[.[] | select(.status == "RUNNING")] | length')
  supported_count=$(echo "$deployments" | jq --argjson supported "[$supported_filter]" '
    [.[] | select(
      (.details.resources.backendDetails.model.name // .details.resources.backend_details.model.name) as $model |
      $supported | index($model)
    )] | length
  ')
  
  echo "📊  Summary:"
  echo "   • Total Deployments: $total"
  echo "   • Running: $running"
  echo "   • Other Status: $((total - running))"
  echo "   • Supported by Proxy: $supported_count"
  echo
  echo "💡  Use '/all' to show only supported models"
  echo "🔧  Configured models: $(echo "$SUPPORTED_MODELS" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')"
fi