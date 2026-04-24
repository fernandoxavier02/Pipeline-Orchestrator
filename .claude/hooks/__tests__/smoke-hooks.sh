#!/usr/bin/env bash
# .claude/hooks/__tests__/smoke-hooks.sh
#
# Smoke test for session-lock-hook + edit-guard-hook via stdin.
# Portable across Linux/macOS and Windows Git Bash: when `cygpath` is
# available, paths are converted to Windows form before being handed to
# node (which is a Windows-native binary under Git Bash), while the bash
# assertions continue to use the POSIX path returned by mktemp.
set -euo pipefail

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Path handed to node in JSON payloads. On Git Bash, node.exe is
# Windows-native and does not understand /tmp/... — convert to C:\... so
# both node and bash's `test -f` see the same directory.
if command -v cygpath >/dev/null 2>&1; then
  NODE_CWD=$(cygpath -w "$TMPDIR")
  # JSON requires backslashes to be escaped.
  NODE_CWD_JSON=${NODE_CWD//\\/\\\\}
else
  NODE_CWD_JSON="$TMPDIR"
fi

# Test 1: session-lock-hook cria lock
echo '{"prompt":"/pipeline-orchestrator:pipeline foo","session_id":"smoke-1","cwd":"'"$NODE_CWD_JSON"'"}' | \
  node .claude/hooks/session-lock-hook.cjs
test -f "$TMPDIR/.pipeline/sessions/smoke-1.lock" || { echo "FAIL: lock not created"; exit 1; }
echo "PASS: session-lock-hook creates lock"

# Test 2: edit-guard-hook bloqueia Edit fora de .pipeline/
RESULT=$(echo '{"tool_name":"Edit","tool_input":{"file_path":"'"$NODE_CWD_JSON"'/src/foo.py"},"cwd":"'"$NODE_CWD_JSON"'"}' | \
  node .claude/hooks/edit-guard-hook.cjs)
echo "$RESULT" | grep -q "permissionDecision.*deny" || { echo "FAIL: expected deny, got: $RESULT"; exit 1; }
echo "PASS: edit-guard-hook blocks Edit outside .pipeline/"

# Test 3: edit-guard-hook permite Edit em .pipeline/
RESULT=$(echo '{"tool_name":"Edit","tool_input":{"file_path":"'"$NODE_CWD_JSON"'/.pipeline/docs/r.md"},"cwd":"'"$NODE_CWD_JSON"'"}' | \
  node .claude/hooks/edit-guard-hook.cjs)
test -z "$RESULT" || { echo "FAIL: expected allow (empty), got: $RESULT"; exit 1; }
echo "PASS: edit-guard-hook allows Edit inside .pipeline/"

echo "ALL SMOKE TESTS PASSED"
