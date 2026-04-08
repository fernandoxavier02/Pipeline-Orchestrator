import sys
import os
import shutil
import json

# ── Plugin Manager for Gemini ─────────────────────────────────────────────

REPLICA_DIRS = [
    os.path.expanduser("~/Superpower-Gemini"),
    os.path.expanduser("~/Context-Engineering-Gemini"),
    os.path.expanduser("~/Pipeline-Orchestrator")
]
DEST_COMMANDS = os.path.expanduser("~/.gemini/commands")
DEST_SKILLS = os.path.expanduser("~/.agents/skills")

def list_plugins():
    print("📂 Plugins Disponíveis para Ativação:")
    for base_dir in REPLICA_DIRS:
        if os.path.exists(base_dir):
            name = os.path.basename(base_dir)
            print(f"  - {name} [Found]")

def install_plugin(name):
    print(f"🚀 Ativando plugin: {name}...")
    found = False
    for base_dir in REPLICA_DIRS:
        if name.lower() in base_dir.lower() or name.lower() in os.path.basename(base_dir).lower():
            # Copy commands
            src_commands = os.path.join(base_dir, "commands")
            if os.path.exists(src_commands):
                for f in os.listdir(src_commands):
                    shutil.copy(os.path.join(src_commands, f), DEST_COMMANDS)
            # Copy skills
            src_skills = os.path.join(base_dir, "skills")
            if os.path.exists(src_skills):
                for skill_folder in os.listdir(src_skills):
                    src_skill_path = os.path.join(src_skills, skill_folder)
                    if os.path.isdir(src_skill_path):
                        dest_skill_path = os.path.join(DEST_SKILLS, skill_folder)
                        os.makedirs(dest_skill_path, exist_ok=True)
                        for f in os.listdir(src_skill_path):
                            shutil.copy(os.path.join(src_skill_path, f), dest_skill_path)
            found = True
    
    if found:
        print(f"✅ Plugin {name} ativado com sucesso! Execute /commands reload para atualizar.")
    else:
        print(f"❌ Erro: Plugin {name} não encontrado nas réplicas locais.")

def main():
    if len(sys.argv) < 2:
        list_plugins()
        return
    
    action = sys.argv[1]
    if action == "list":
        list_plugins()
    elif action == "install" and len(sys.argv) > 2:
        install_plugin(sys.argv[2])

if __name__ == "__main__":
    main()
