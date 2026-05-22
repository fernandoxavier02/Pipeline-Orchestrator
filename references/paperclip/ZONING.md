# Zoning — Regra de Separacao Entre Repo e Workspace

**Versao:** 1.0 — 2026-05-22
**Status:** vigente
**Aplica-se a:** trabalho de integracao pipeline-orchestrator + Paperclip

---

## Quatro pastas, quatro proposito distintos

```
D:\Pipeline Orchestrator Claude\          ← workspace raiz (NAO eh git repo)
├── Pipeline-Orchestrator\                ← REPO GIT (origin: github.com/fernandoxavier02/Pipeline-Orchestrator)
│   ├── agents\                           ← 46 agentes Markdown do plugin (oficiais)
│   ├── references\
│   │   └── paperclip\                    ← **CANONICAL** das specs Paperclip (versionado)
│   │       ├── PAPERCLIP-AXIOMS.md
│   │       ├── PAPERCLIP-*-WORKFLOW.md (6 workflows)
│   │       ├── paperclip-{kb,catalog,adaptation-spec}.md
│   │       └── skills\ (11 skills custom)
│   └── ...
├── .pipeline\                            ← WORKSPACE local (NAO versionado, copia operacional)
│   ├── PAPERCLIP-*.md                    ← copia do repo (operacional)
│   ├── paperclip-*.md                    ← copia do repo (operacional)
│   ├── skills\                           ← copia do repo (operacional)
│   ├── docs\                             ← outputs de pipeline runs (logs, etc)
│   ├── sessions\                         ← session checkpoints
│   ├── run-log.jsonl                     ← log de runs
│   └── ZONING.md                         ← este arquivo
└── ~/.paperclip\                         ← INSTALACAO Paperclip (em C:\Users\win\.paperclip\)
    └── instances\default\
        ├── skills\                       ← skills carregaveis pelos cargos Codex (instalacao)
        └── agents\                       ← state files dos 46 cargos
```

## Source-of-truth (regra mestra de edicao)

| Arquivo/pasta | Onde EDITAR primeiro | Daquele lugar, sincronizar para |
|---|---|---|
| Specs Paperclip (PAPERCLIP-*.md) | `Pipeline-Orchestrator/references/paperclip/` (no repo) | `.pipeline/` (workspace) + `~/.paperclip/instances/default/skills/` (instalacao) |
| Skills custom (SKILL.md) | `Pipeline-Orchestrator/references/paperclip/skills/{slug}/` | `.pipeline/skills/{slug}/` + `~/.paperclip/instances/default/skills/{slug}/` |
| 46 agentes oficiais (Markdown) | `Pipeline-Orchestrator/agents/` | nao replicar fora do repo |
| Logs de pipeline run | `.pipeline/docs/Pre-*-action/` | nao versionar |
| Catalogo / KB / Adaptation Spec | `Pipeline-Orchestrator/references/paperclip/` | `.pipeline/` (copia operacional) |

**Iron Rule:** o **REPO eh fonte de verdade**. Workspace local (`.pipeline/`) eh copia operacional descartavel. Paperclip install (`~/.paperclip/`) eh deploy. Se houver conflito de versao, **o repo vence**.

## Sync commands (rodar quando o repo muda)

```bash
# A) Repo -> Workspace local (.pipeline/)
cp Pipeline-Orchestrator/references/paperclip/*.md .pipeline/
cp -r Pipeline-Orchestrator/references/paperclip/skills/* .pipeline/skills/

# B) Repo -> Paperclip install (~/.paperclip/instances/default/skills/)
cp -r Pipeline-Orchestrator/references/paperclip/skills/* "$HOME/.paperclip/instances/default/skills/"

# Bash do Windows expande $HOME para /c/Users/win
```

## Anti-padroes (PROIBIDO)

- ❌ Editar arquivo em `.pipeline/` sem refletir no repo (drift)
- ❌ Editar arquivo em `~/.paperclip/instances/.../skills/` direto (drift e perde no proximo onboard)
- ❌ Commitar `.pipeline/` no git (`.pipeline/` deve estar no `.gitignore` do repo, se nao estiver)
- ❌ Confundir `.pipeline/docs/` (logs locais, descartaveis) com `.pipeline/PAPERCLIP-*.md` (copia do repo)
- ❌ Adicionar arquivo NOVO so em `.pipeline/` sem criar no repo (nasceu fora do canonical)

## Como auditar drift

```bash
# Conferir se workspace = repo
diff -r Pipeline-Orchestrator/references/paperclip/ .pipeline/ --brief 2>&1 \
  | grep -v "docs\|sessions\|run-log\|ZONING\|instructions"

# Conferir se Paperclip install = repo
diff -r Pipeline-Orchestrator/references/paperclip/skills/ \
  "$HOME/.paperclip/instances/default/skills/" --brief 2>&1
```

Saida vazia = OK. Saida com diferencas = sync precisa.

## Quando o repo eh atualizado de fora (git pull)

1. `git pull origin main` no `Pipeline-Orchestrator/`
2. Re-sync sync A (repo → workspace)
3. Re-sync sync B (repo → Paperclip install)
4. Reiniciar Paperclip server (`pnpm paperclipai run`) — pra carregar skills atualizadas

Em ambiente local-only (sem multiplos colaboradores), passos 1 e 4 sao opcionais.
