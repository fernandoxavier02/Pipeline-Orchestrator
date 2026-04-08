import sys
import json
import os
import re

# ── Gatekeeper: The Sentinel (Gemini Edition) ──────────────────────────────────

# This hook enforces the "No Spec = No Code" rule.
# It checks if the current task has an approved spec before allowing file edits.

# Configuration
SPECS_DIR = ".kiro/specs"
SESSION_DIR = os.path.expanduser("~/.gemini/session")

def get_active_spec():
    # Use current working directory as a unique key for the session
    cwd_hash = str(abs(hash(os.getcwd())))
    active_spec_file = os.path.join(SESSION_DIR, f"active_spec_{cwd_hash}.txt")
    
    # Fallback to global active_spec.txt if project-specific one doesn't exist
    if not os.path.exists(active_spec_file):
        active_spec_file = os.path.join(SESSION_DIR, "active_spec.txt")

    if os.path.exists(active_spec_file):
        try:
            with open(active_spec_file, 'r') as f:
                return f.read().strip()
        except Exception:
            pass
    return None

def is_spec_approved(spec_name):
    if not spec_name:
        return False
    
    spec_path = os.path.join(SPECS_DIR, spec_name, "spec.json")
    if not os.path.exists(spec_path):
        return False
        
    try:
        with open(spec_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Gate Rule: Must be in 'tasks' or 'implementation' phase and approved
            approvals = data.get("approvals", {})
            return approvals.get("requirements") and approvals.get("design") and data.get("phase") in ["tasks", "implementation", "completed"]
    except Exception:
        return False

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data:
            return
            
        data = json.loads(input_data)
        tool_name = data.get("tool") or data.get("tool_name") or ""
        args = data.get("arguments") or data.get("args") or {}

        # 1. Block bypasses via run_shell_command (sed -i, echo >, printf >)
        if tool_name == "run_shell_command":
            command = args.get("command", "")
            # Pattern matching for destructive shell commands
            if re.search(r"\b(sed\s+-i|echo\s+.*>|printf\s+.*>|cat\s+.*>|truncate\b)", command):
                # Deny shell-based file modifications if they bypass the sentinel
                # Unless they are in the specs directory (which is handled below)
                if SPECS_DIR not in command:
                     sys.stdout.write(json.dumps({
                        "decision": "deny",
                        "reason": "⚠️ BLOQUEIO SENTINELA: Tentativa de modificação de arquivo via shell detectada. Use as ferramentas 'replace' ou 'write_file' sob uma spec aprovada."
                    }))
                     return

        # Only gate tools that modify the source code or critical shell actions
        if tool_name not in ["replace", "write_file", "run_shell_command"]:
            sys.stdout.write(json.dumps({"decision": "allow"}))
            return

        # Check for active spec
        active_spec = get_active_spec()

        # If no active spec, check if the agent is currently creating one (exempt)
        file_path = args.get("file_path", "")
        if SPECS_DIR in file_path or (tool_name == "run_shell_command" and SPECS_DIR in args.get("command", "")):
            sys.stdout.write(json.dumps({"decision": "allow"}))
            return

        if not active_spec:
            sys.stdout.write(json.dumps({
                "decision": "deny",
                "reason": "⚠️ BLOQUEIO SENTINELA: Nenhuma spec ativa encontrada. Use '/pipeline <feature>' ou inicie uma spec em .kiro/specs/ antes de editar o código."
            }))
            return

        # REMOVED: auditoria-plugin-orchestrator hardcoded exception for security

        if not is_spec_approved(active_spec):
            sys.stdout.write(json.dumps({
                "decision": "deny",
                "reason": f"⚠️ BLOQUEIO SENTINELA: A spec '{active_spec}' não está aprovada para implementação. Complete as fases de Requirements e Design primeiro."
            }))
            return

        # Allowed to proceed
        sys.stdout.write(json.dumps({"decision": "allow"}))

    except Exception as e:
        # FAIL-SAFE: Deny if hook fails
        sys.stdout.write(json.dumps({
            "decision": "deny",
            "reason": f"❌ ERRO CRÍTICO NO SENTINELA: {str(e)}. Ação bloqueada por segurança."
        }))

if __name__ == "__main__":
    main()
