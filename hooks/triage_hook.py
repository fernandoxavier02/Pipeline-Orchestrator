import sys
import json
import re
import os

# ── Gemini Pipeline Orchestrator: SSOT Implementation (GitHub-based) ──────────

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data: return
        data = json.loads(input_data)
        prompt = data.get("prompt", "").strip()
        
        # 1. Detect Slash Commands and Flags
        is_pipeline = prompt.startswith("/pipeline")
        is_fix = prompt.startswith("/fix")
        
        if not (is_pipeline or is_fix):
            sys.stdout.write(json.dumps({"decision": "allow"}))
            return

        # Parsing Flags
        flags = {
            "plan": "--plan" in prompt,
            "complexa": "--complexa" in prompt,
            "grill": "--grill" in prompt,
            "hotfix": "--hotfix" in prompt,
            "diagnostic": "diagnostic" in prompt,
            "continue": "continue" in prompt,
            "review": "review-only" in prompt
        }

        # 2. SSOT Mapping: Flags -> Persona & Constraints
        instruction = ""
        
        if flags["review"]:
            instruction = "## MODE: REVIEW-ONLY\n- Persona: ADVERSARIAL_REVIEWER\n- Constraints: ZERO implementation context. Analyze diff vs Spec only."
        elif flags["hotfix"]:
            instruction = "## MODE: EMERGENCY (HOTFIX)\n- Persona: BUGFIX_HEAVY\n- Complexity: COMPLEXA (by default due to risk)\n- Gates: Format (SOFT), TDD (HARD), Build (HARD)."
        elif flags["grill"]:
            instruction = "## MODE: DESIGN INTERROGATION (GRILL)\n- Persona: AUDITOR_SENIOR\n- Constraint: YOU ARE PROHIBITED from writing code. You must 'grill' the user's design until all edge cases are covered."
        elif flags["plan"]:
            instruction = "## MODE: PLANNING ONLY\n- Action: enter_plan_mode immediately. Stop after design.md is approved."
        elif flags["diagnostic"]:
            instruction = "## MODE: DIAGNOSTIC\n- Action: Map context and issue. Do not create spec. Do not write code."
        elif flags["complexa"]:
            instruction = "## MODE: FORCED COMPLEXA\n- All gates: MANDATORY/CIRCUIT_BREAKER. 1 task per batch."
        
        # 3. Sentinel Mandate Injection
        response = {
            "decision": "allow",
            "systemMessage": f"""
# ⚠️ SENTINEL VERDICT REQUIRED (SSOT REPO LAWS) ⚠️

{instruction}

**Antes de qualquer ação, você DEVE emitir o bloco ORCHESTRATOR_DECISION em YAML:**
```yaml
ORCHESTRATOR_DECISION:
  solicitacao: "resumo do pedido"
  tipo: "[Bug Fix | Feature | Hotfix | Auditoria | Security]"
  severidade: "[Crítica | Alta | Média | Baixa]"
  persona: "[IMPLEMENTER | BUGFIX_HEAVY | AUDITOR_SENIOR | REDTEAM]"
  arquivos_provaveis: ["..."]
  tem_spec: "Sim: .kiro/specs/X | Não"
  fluxo: ["Triagem automática", "Proposta + confirmação", "Execução em batches", "Closure + validation"]
  riscos: "..."
  complexity: "[SIMPLES | MEDIA | COMPLEXA]"
  mode: "{'full' if not any(flags.values()) else [k for k,v in flags.items() if v][0]}"
```
**LEI DE FERRO:** Siga as fases do pipeline rigorosamente. Não pule etapas.
""".strip()
        }
        
        sys.stdout.write(json.dumps(response))
        sys.stdout.flush()
        
    except Exception:
        sys.stdout.write(json.dumps({"decision": "allow"}))

if __name__ == "__main__":
    main()
