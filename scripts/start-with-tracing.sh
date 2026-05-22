#!/usr/bin/env bash
# Pipeline-Orchestrator — Claude Code launcher with Langfuse tracing (Bash/Git Bash variant).
#
# Loads .env from the project root, then starts the `claude` CLI from inside
# the project directory (required for sentinel-hook auto-discovery).
#
# Usage (from any directory):
#   bash "/d/Pipeline Orchestrator Claude/Pipeline-Orchestrator/scripts/start-with-tracing.sh"

set -e

PROJECT_ROOT="/d/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
cd "$PROJECT_ROOT"

if [[ ! -f .env ]]; then
    echo "ERRO: .env nao encontrado em $PROJECT_ROOT" >&2
    echo "Copie .env.example para .env e preencha LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY." >&2
    exit 1
fi

echo "[load] Carregando .env..."

# Read .env line by line, handling quoted values
loaded=0
while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip comments and empty lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$line" ]] && continue
    # Match KEY=value pattern
    if [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
        name="${BASH_REMATCH[1]}"
        value="${BASH_REMATCH[2]}"
        # Strip surrounding quotes
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        export "$name=$value"
        loaded=$((loaded + 1))
    fi
done < .env

echo "[load] $loaded variaveis carregadas."
echo ""
echo "Langfuse tracing config:"
echo "  LANGFUSE_ENABLED    = ${LANGFUSE_ENABLED:-(unset)}"
echo "  LANGFUSE_HOST       = ${LANGFUSE_HOST:-(unset)}"
echo "  PUBLIC_KEY presente = $([[ -n "${LANGFUSE_PUBLIC_KEY:-}" ]] && echo "true" || echo "false")"
echo "  SECRET_KEY presente = $([[ -n "${LANGFUSE_SECRET_KEY:-}" ]] && echo "true" || echo "false")"
echo ""

if [[ "${LANGFUSE_ENABLED:-}" != "true" ]]; then
    echo "AVISO: LANGFUSE_ENABLED nao esta como 'true'. Tracing ficara desativado nesta sessao."
fi

echo "[launch] Iniciando claude em $PROJECT_ROOT..."
echo ""

exec claude
