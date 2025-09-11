#!/usr/bin/env bash
# deploy-model.sh
#
# Usage:
#   ./deploy-model.sh MODEL_NAME [--make-config]
#
# Options:
#   --make-config    Generate config/models.json from all deployed models
#
# Configuration comes from environment variables or a local .env file:
#   AICORE_CLIENT_ID, AICORE_CLIENT_SECRET, ACCESS_TOKEN_URL, AICORE_BASE_URL
#
# Requires: jq

###############################################################################
# Strict-mode & trace on failure
###############################################################################
set -Eeuo pipefail
trap 'fatal "Uncaught error on line $LINENO."' ERR

###############################################################################
# 0.  Load .env (if present)
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

###############################################################################
# Parse arguments
###############################################################################
MAKE_CONFIG=false
TARGET_MODEL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --help|-h)
      echo "Usage: $0 MODEL_NAME [OPTIONS]"
      echo ""
      echo "Deploy or check deployment status of a model in SAP AI Core"
      echo ""
      echo "Arguments:"
      echo "  MODEL_NAME       Name of the model to deploy (must have existing configuration)"
      echo ""
      echo "Options:"
      echo "  --make-config    Generate config/models.json from all deployed models"
      echo "  --help, -h       Show this help message"
      echo ""
      echo "Environment variables required:"
      echo "  AICORE_CLIENT_ID      SAP AI Core client ID"
      echo "  AICORE_CLIENT_SECRET  SAP AI Core client secret"
      echo "  AICORE_AUTH_URL       SAP AI Core authentication URL"
      echo "  AICORE_BASE_URL       SAP AI Core base API URL"
      echo ""
      echo "Examples:"
      echo "  $0 gpt-5-nano"
      echo "  $0 anthropic--claude-4-sonnet --make-config"
      exit 0
      ;;
    --make-config)
      MAKE_CONFIG=true
      shift
      ;;
    -*)
      fatal "Unknown option $1"
      ;;
    *)
      if [[ -z "$TARGET_MODEL" ]]; then
        TARGET_MODEL="$1"
      else
        fatal "Multiple model names provided"
      fi
      shift
      ;;
  esac
done

###############################################################################
# Required parameters & env-vars
###############################################################################
[[ -n "$TARGET_MODEL" ]] || fatal "Model name required."
readonly TARGET_MODEL
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
# 1. Authentication
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
# 2. REST helpers (thin wrappers)
###############################################################################
ai_get()         { bearer "$API_BASE${1#"${API_BASE%/}"}"; }
get_configs()    { ai_get "/v2/lm/configurations"                           | jq '.resources // []'; }
get_deployments(){ ai_get "/v2/lm/deployments?scenarioId=foundation-models" | jq '.resources // []'; }

deploy() {
  local cid="$1" model="$2" version="$3"
  local dname="${model}-${version}-deployment-$(date +%s)"
  jq -n --arg cid "$cid" --arg dn "$dname" '{configurationId:$cid,deploymentName:$dn,status:"RUNNING"}' | bearer -X POST -d@- "${API_BASE%/}/v2/lm/deployments"
}

###############################################################################
# Generate models.json from deployed models
###############################################################################
generate_models_config() {
  echo "🔧  Generating config/models.json from deployed models..."
  
  local deps configs
  deps=$(get_deployments)
  configs=$(get_configs)
  
  # Create config directory if it doesn't exist
  mkdir -p config
  
  # Start building the JSON structure
  {
    echo '{'
    echo '  "comment": "SAP AI Core model configurations - Generated by deploy-model.sh. For model-specific settings see: https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/consume-generative-ai-models-using-sap-ai-core",'
    echo '  "models": {'
    
    # Process each running deployment
    local first=true
    while IFS= read -r deployment; do
      [[ -z "$deployment" ]] && continue
      
      local config_id model_name deployment_id deployment_url
      config_id=$(echo "$deployment" | jq -r '.configurationId // empty')
      deployment_id=$(echo "$deployment" | jq -r '.id // empty')
      deployment_url=$(echo "$deployment" | jq -r '.deploymentUrl // empty')
      
      # Get model name from configuration
      model_name=$(echo "$configs" | jq -r --arg cid "$config_id" '
        .[] | select(.id == $cid) | .parameterBindings[]? | select(.key=="modelName") | .value
      ' | head -n1)
      
      [[ -z "$model_name" || -z "$deployment_id" ]] && continue
      
      # Add comma if not first entry
      [[ "$first" = true ]] || echo ','
      first=false
      
      # Generic configuration - update manually based on model requirements
      local provider="unknown"
      local api_type="provider"
      local supports_streaming="true"
      local description="Model via SAP AI Core"
      
      # Output model configuration
      cat <<EOF
    "$model_name": {
      "deploymentId": "$deployment_id",
      "provider": "$provider",
      "supportsStreaming": $supports_streaming,
      "apiType": "$api_type",
      "description": "$description",
      "endpoint": "PLACEHOLDER - check model documentation",
      "requestFormat": "PLACEHOLDER - check model documentation", 
      "max_tokens": 1000
    }EOF
    done < <(echo "$deps" | jq -c '.[] | select(.status == "RUNNING")')
    
    echo ''
    echo '  },'
    
    # Model categorization arrays - update manually based on your model requirements
    echo '  "providerSupportedModels": ['
    echo '    "PLACEHOLDER - add models that use SAP AI Core provider"'
    echo '  ],'
    
    echo '  "directApiModels": ['
    echo '    "PLACEHOLDER - add models that use direct API calls"'
    echo '  ]'
    
    echo '}'
  } > config/models.json
  
  echo "✅  Generated config/models.json with $(echo "$deps" | jq '[.[] | select(.status == "RUNNING")] | length') deployed models"
}



###############################################################################
# 3. Execution
###############################################################################
get_access_token

echo '🔎  Fetching configurations…'
configs=$(get_configs)

# pick the first configuration whose parameterBindings contain modelName == $TARGET_MODEL
config=$(jq -c --arg m "$TARGET_MODEL" 'first(.[] | select(.parameterBindings[]? | select(.key=="modelName" and .value==$m)))' <<<"$configs")
if [[ -z $config || $config == "null" ]]; then
  fatal "No configuration found for \"$TARGET_MODEL\". Please create a configuration first."
fi

cid=$(jq -r '.id' <<<"$config") || fatal "Cannot read configuration id."

echo '🔎  Checking deployments…'
deps=$(get_deployments)

if jq -e --arg m "$TARGET_MODEL" --arg cid "$cid" '
       .[] | select(.configurationId==$cid
            and ((.details.resources.backendDetails.model.name
                   // .details.resources.backend_details.model.name) == $m))
' <<<"$deps" >/dev/null; then
  # Find the deployment and print its deploymentUrl if available
  deployment_url=$(jq -r --arg m "$TARGET_MODEL" --arg cid "$cid" '
    .[] | select(.status=="RUNNING"
      and .configurationId==$cid
      and ((.details.resources.backendDetails.model.name
             // .details.resources.backend_details.model.name) == $m))
    | .deploymentUrl // empty
  ' <<<"$deps")
  echo "✅  \"$TARGET_MODEL\" already deployed."
  if [[ -n "$deployment_url" ]]; then
    echo "🌐  Deployment URL: $deployment_url"
  fi
  
  # Generate config if requested
  if [[ "$MAKE_CONFIG" = true ]]; then
    generate_models_config
  fi
  
  exit 0
fi

# echo "🚀  Deploying \"$TARGET_MODEL\"…"
# # ── extract model name & version from the chosen configuration ──────────────
# mname=$(jq -r '.parameterBindings[]? | select(.key=="modelName") | .value' <<<"$config" | head -n1 )
# mver=$(jq -r '.parameterBindings[]? | select(.key=="modelVersion")  | .value' <<<"$config" | head -n1)

# [[ -z $mname ]] && fatal "modelName not found in configuration."
# [[ -z $mver  ]] && fatal "modelVersion not found in configuration."

# deploy "$cid" "$mname" "$mver" | jq .
# echo '✅  Deployment request sent.'
