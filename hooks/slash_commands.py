import sys
import os
import json
import subprocess

# ── Gemini Slash Commands Bridge ──────────────────────────────────────────────

def run_pipeline(feature_name):
    print(f"🚀 Iniciando Pipeline Orchestrator para: {feature_name}")
    os.makedirs(f".kiro/specs/{feature_name}", exist_ok=True)
    # Define a spec ativa para o Gatekeeper
    os.makedirs(".gemini/session", exist_ok=True)
    with open(".gemini/session/active_spec.txt", "w") as f:
        f.write(feature_name)
    print(f"✅ Spec '{feature_name}' inicializada e ativa.")
    print(f"👉 Próximo passo: Crie o arquivo .kiro/specs/{feature_name}/spec.json")

def run_status(feature_name=None):
    # Chama o dashboard global
    dashboard_path = "/Users/fernandocostaxavier/.gemini/hooks/dashboard.py"
    subprocess.run(["python3", dashboard_path])

def main():
    if len(sys.argv) < 2:
        return

    command = sys.argv[1]
    args = sys.argv[2:]

    if command == "/pipeline":
        if not args:
            print("❌ Erro: Forneça o nome da feature. Ex: /pipeline nova-rota")
            return
        run_pipeline(args[0])
    
    elif command == "/status":
        run_status(args[0] if args else None)
    
    elif command == "/audit":
        print("🔍 Chamando AUDITOR_SENIOR para análise profunda...")
        # No Gemini CLI, o agente entenderá o contexto da persona pelo injector hook
        print(f"Analisando: {args[0] if args else 'todo o projeto'}")

if __name__ == "__main__":
    main()
