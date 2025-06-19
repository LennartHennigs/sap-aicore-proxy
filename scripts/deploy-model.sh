#!/usr/bin/env bash
# deploy-model.sh
#
# Usage:
#   ./deploy-model.sh MODEL_NAME
#
# Configuration comes from environment variables or a local .env file:
#   CLIENT_ID, CLIENT_SECRET, ACCESS_TOKEN_URL, AI_API_BASE_URL
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
# Required parameters & env-vars
###############################################################################
readonly TARGET_MODEL="${1:-}"             || fatal "Model name required."
readonly CLIENT_ID="${CLIENT_ID:-}"        || fatal "CLIENT_ID missing."
readonly CLIENT_SECRET="${CLIENT_SECRET:-}"|| fatal "CLIENT_SECRET missing."
readonly ACCESS_TOKEN_URL="${ACCESS_TOKEN_URL:-}" || fatal "ACCESS_TOKEN_URL missing."
readonly API_BASE="${AI_API_BASE_URL:-}"   || fatal "AI_API_BASE_URL missing."

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
    echo -n "$CLIENT_ID:$CLIENT_SECRET" | base64 | {
      read -r b64
      curl -fsS -H "Authorization: Basic $b64" \
        "${ACCESS_TOKEN_BASE_URL%/}/oauth/token?grant_type=client_credentials" \
      | jq -r '.access_token // empty'
    }
  )
  [[ -n $ACCESS_TOKEN_BASE_URL ]] || fatal "Unable to obtain access token."
  readonly ACCESS_TOKEN_BASE_URL
}

###############################################################################
# 2. REST helpers (thin wrappers)
###############################################################################
ai_get()         { bearer "$API_BASE${1#"${API_BASE%/}"}"; }
get_models()     { ai_get "/v2/lm/scenarios/foundation-models/models"       | jq '.resources // []'; }
get_configs()    { ai_get "/v2/lm/configurations"                           | jq '.resources // []'; }
get_deployments(){ ai_get "/v2/lm/deployments?scenarioId=foundation-models" | jq '.resources // []'; }

deploy() {
  local cid="$1" model="$2" version="$3"
  local dname="${model}-${version}-deployment-$(date +%s)"
  jq -n --arg cid "$cid" --arg dn "$dname" '{configurationId:$cid,deploymentName:$dn,status:"RUNNING"}' | bearer -X POST -d@- "${API_BASE%/}/v2/lm/deployments"
}

###############################################################################
# 2a.  Create configuration when none exists
###############################################################################
create_config() {
  local exec_id="$1" model="$2" model_ver="$3"
  local cfg_name="cfg-${model}-${model_ver}"
  local version_id="0.0.1"

  jq -n --arg name "$cfg_name"       \
        --arg exec "$exec_id"        \
        --arg scen "foundation-models" \
        --arg verid "$version_id"    \
        --arg mname "$model"         \
        --arg mver "$model_ver"      \
        '{
           name: $name,
           executableId: $exec,
           scenarioId: $scen,
           versionId: $verid,
           parameterBindings: [
             {key:"modelName",   value:$mname},
             {key:"modelVersion",value:$mver }
           ]
         }' \
  | bearer -X POST -d@- "${API_BASE%/}/v2/lm/configurations"
}


###############################################################################
# 3. Execution
###############################################################################
get_access_token

echo '🔎  Pulling model catalogue…'
models=$(get_models)
filtered=$(jq '[ .[] | select(.executableId|test("^(azure-openai|aws-bedrock|gcp-vertexai)$")) ]' <<<"$models")
names=$(jq -r '.[].model' <<<"$filtered")

#── check that the requested model exists ─────────────────────────────────────
if ! grep -qxF -- "$TARGET_MODEL" <<<"$names"; then
  # prefix every model with a bullet so the list is easier to scan
  available=$(sed 's/^/  • /' <<<"$names")

  fatal "Unsupported model \"$TARGET_MODEL\"! 
  Available models: 
$available"
fi

echo '🔎  Fetching configurations…'
configs=$(get_configs)

# pick the first configuration whose parameterBindings contain modelName == $TARGET_MODEL
config=$(jq -c --arg m "$TARGET_MODEL" 'first(.[] | select(.parameterBindings[]? | select(.key=="modelName" and .value==$m)))' <<<"$configs")
if [[ -z $config || $config == "null" ]]; then
  echo "ℹ️   No configuration found for \"$TARGET_MODEL\" - creating one…"

  # pull the model’s metadata from $filtered (we already have this list)
  model_meta=$(
    jq -c --arg m "$TARGET_MODEL" '
      first(.[] | select(.model == $m))
    ' <<<"$filtered"
  ) || fatal "Cannot locate metadata for '$TARGET_MODEL'."

  exec_id=$(jq -r '.executableId' <<<"$model_meta")
  model_ver=$(jq -r '.version // .modelVersion // "latest"' <<<"$model_meta")

  config=$(create_config "$exec_id" "$TARGET_MODEL" "$model_ver") \
    || fatal "Failed to create configuration."

  echo "✅  Configuration created."
  # updates config with the new configuration
  configs=$(get_configs)
  config=$(jq -c --arg m "$TARGET_MODEL" 'first(.[] | select(.parameterBindings[]? | select(.key=="modelName" and .value==$m)))' <<<"$configs")
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
