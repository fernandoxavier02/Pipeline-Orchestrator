import sys
import json
import os
import re

# ── TDD Validator: The "RED before GREEN" Law ──────────────────────────────────

# This hook enforces the TDD rule.
# It ensures that a test has been executed and failed (RED) before allowing file edits.

# Configuration
SESSION_DIR = ".gemini/session"
TDD_STATE_FILE = os.path.join(SESSION_DIR, "tdd_state.json")

def load_tdd_state():
    if os.path.exists(TDD_STATE_FILE):
        try:
            with open(TDD_STATE_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {"last_test": "unknown", "failed": False, "passed": False}

def save_tdd_state(state):
    os.makedirs(SESSION_DIR, exist_ok=True)
    try:
        with open(TDD_STATE_FILE, 'w') as f:
            json.dump(state, f)
    except Exception:
        pass

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data:
            return

        data = json.loads(input_data)
        
        # Gemini CLI context: check for tool execution results or intent
        tool_name = data.get("tool") or data.get("tool_name") or ""
        output_data = data.get("output", {})
        
        state = load_tdd_state()

        # 1. Capture Test Results (AfterTool simulation)
        # If output exists, we are in an AfterTool context
        if output_data and tool_name == "run_shell_command":
            stdout = str(output_data.get("stdout", ""))
            stderr = str(output_data.get("stderr", ""))
            exit_code = output_data.get("exit_code", 0)
            
            args = data.get("arguments") or data.get("args") or {}
            command = args.get("command", "").lower()

            # Detect test runner execution (pytest, unittest, etc.)
            if "test" in command or "pytest" in command:
                if exit_code != 0:
                    state["last_test"] = "red"
                    state["failed"] = True
                    state["passed"] = False
                else:
                    state["last_test"] = "green"
                    state["failed"] = False
                    state["passed"] = True
                save_tdd_state(state)

        # 2. Enforce RED before GREEN (BeforeTool context)
        # If tool is one that modifies code, check TDD state
        elif tool_name in ["replace", "write_file"]:
            args = data.get("arguments") or data.get("args") or {}
            file_path = args.get("file_path", "")
            
            # Exempt documentation and specs from TDD requirement
            if ".kiro/specs" in file_path or ".gemini/plans" in file_path or file_path.endswith(".md"):
                sys.stdout.write(json.dumps({"decision": "allow"}))
                return

            # EXEMPTION: Auditoria do próprio plugin não deve ser bloqueada se estivermos em 'auditoria-plugin-orchestrator'
            active_spec_path = os.path.join(SESSION_DIR, "active_spec.txt")
            if os.path.exists(active_spec_path):
                with open(active_spec_path, 'r') as f:
                    if f.read().strip() == "auditoria-plugin-orchestrator":
                         sys.stdout.write(json.dumps({"decision": "allow"}))
                         return

            if state["last_test"] != "red":
                sys.stdout.write(json.dumps({
                    "decision": "deny",
                    "reason": "⚠️ LEI DE FERRO: RED before GREEN. O orquestrador detectou que você está tentando implementar sem evidência de um teste falhando (RED). Execute o teste primeiro."
                }))
                return

        # Default allowed for non-code tools
        sys.stdout.write(json.dumps({"decision": "allow"}))

    except Exception as e:
        # FAIL-SAFE: Deny if hook fails during code modification tools
        if tool_name in ["replace", "write_file"]:
            sys.stdout.write(json.dumps({
                "decision": "deny",
                "reason": f"❌ ERRO CRÍTICO NO TDD VALIDATOR: {str(e)}"
            }))
        else:
            sys.stdout.write(json.dumps({"decision": "allow"}))

if __name__ == "__main__":
    main()
