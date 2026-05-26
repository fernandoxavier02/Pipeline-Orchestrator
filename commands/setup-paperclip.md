---
description: "Configura Paperclip (open-source agent orchestration) com o plugin pipeline-orchestrator. Detecta install, cria empresas FX Studio AI + Pipeline Orchestrator, contrata 47 cargos via API, configura adapter claude_local + cwd canonical, instala junctions de skills. End-to-end."
allowed-tools: Bash, Read, Write, Glob, Grep, WebFetch
---

# Setup Paperclip Integration

<background_information>
Este comando configura o **Paperclip** (https://paperclip.ing — open-source agent orchestration platform) para rodar o plugin `pipeline-orchestrator` com paridade efetiva ao Claude Code standalone.

**O que sera configurado:**
- 2 empresas Paperclip: `FX Studio AI` (produto) + `Pipeline Orchestrator` (infra)
- 47 cargos contratados via API (46 do catalogo + pipeline-controller)
- Adapter `claude_local` + Claude Opus (fallback sonnet se 4.7-1m indisponivel)
- `cwd` = raiz canonical do plugin (paths relativos do plugin resolvem)
- `instructionsFilePath` = `agents/{categoria}/{slug}.md` ORIGINAL do plugin
- 11 skills custom em `~/.paperclip/instances/default/skills/` via junctions Windows
- Auth: subscription Claude (`claude login` local) — sem API key

**Pre-requisitos:**
- Node.js 20+, pnpm 9.15+ instalados
- Claude Code instalado (`claude` no PATH)
- Subscription Claude Pro/Max (logada via `claude login`)
- Windows com `mklink /J` (junctions, nao precisa admin) — Linux/Mac usa `ln -s`
</background_information>

<instructions>
## Passo 1 — Verificar pre-requisitos
```bash
node --version          # deve ser >=20
pnpm --version          # deve ser >=9.15
claude --version        # deve mostrar versao
git --version           # qualquer 2.x
```

## Passo 2 — Detectar/instalar Paperclip
```bash
curl -s http://127.0.0.1:3100/api/health
```

Se nao responder, instalar:
```bash
mkdir -p /d/paperclip && cd /d/paperclip
npx --yes paperclipai onboard --yes
```

Espera o servidor subir em http://127.0.0.1:3100 (modo loopback, sem expor pra rede).

## Passo 3 — Instalar 11 skills custom via junctions (Windows)

```bash
cmd //c "${CLAUDE_PLUGIN_ROOT}/references/paperclip/install-junctions.bat"
```

Verificar: `ls ~/.paperclip/instances/default/skills/` deve listar 11 entradas (engineering-principles + 10 pipeline-orchestrator-*).

Em Linux/Mac, substituir mklink por symlinks:
```bash
for d in "${CLAUDE_PLUGIN_ROOT}"/references/paperclip/skills/*/; do
  name=$(basename "$d")
  ln -sfn "$d" ~/.paperclip/instances/default/skills/"$name"
done
```

## Passo 4 — Criar empresas + cargos via API

A criacao pode ser:
- **Manual via painel:** navegar http://127.0.0.1:3100 → workspace switcher → Add company. Repetir pra cada empresa. Daí usar o CEO (Claude/Codex agent) pra contratar os 46 restantes via skill `paperclip-create-agent`.
- **Automatica via Playwright** (se disponivel no ambiente): este command pode automatizar.
- **Programatica (recomendada, sem UI):** rodar o provisionador onde a API Paperclip esta acessivel (ex: na propria VPS):
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/references/paperclip/scripts/provision-pipeline-company.cjs" "Pipeline Orchestrator"
  ```
  Cria a empresa (se nao existir), instala as 11 skills custom (a partir de `references/paperclip/skills/`), contrata os 47 cargos e anexa as skills por categoria. Batimento DESLIGADO (inerte ate atribuir uma issue ao cargo). ID-agnostic: resolve a empresa por nome e calcula todos os paths via `__dirname` (sem UUIDs fixos). Env overrides: `PAPERCLIP_API_URL`, `PAPERCLIP_COMPANY`, `PAPERCLIP_ADAPTER`, `PAPERCLIP_MODEL`, `PAPERCLIP_CWD`. Requer Node 18+ (global fetch).

**Briefing pro CEO criar 46 cargos:**

Caminho canonical do briefing: `${CLAUDE_PLUGIN_ROOT}/references/paperclip/PLAN-46-AGENTS-UPDATE.md`.

Ele especifica:
- Mapping `desiredSkills` por categoria
- `adapter.cwd = ${CLAUDE_PLUGIN_ROOT}` (caminho absoluto do plugin)
- `adapter.instructionsFilePath = agents/{categoria}/{slug}.md`
- `model = claude-opus-4-7-1m` (fallback automatico pra sonnet-4-6 se indisponivel)
- Loop adversarial por batch (7 batches: core 10, brainstorm+quality 11, executor-controller 6, feature 3, bugfix+ux 6, audit+spec 7, adversarial 4)

## Passo 5 — Validar paridade end-to-end (piloto)

Criar issue no painel Paperclip atribuida ao `information-gate`:
```
Title: [PILOT-PARIDADE] information-gate: identifique-se e descreva seu protocolo de gate
Body: ver template em references/paperclip/PLAN-46-AGENTS-UPDATE.md secao "Piloto"
```

O information-gate deve responder com `PARITY_VERDICT v1` listando:
- identity_check (leu agent.md original)
- protocol_check (GATE_REQUEST v1 schema)
- tools_check (AskUserQuestion, Agent, Read/Write/Edit/Bash/Glob/Grep)
- references_check (gates.md, complexity-matrix.md, audit-trail.md, gate-request-protocol.md)
- skills_check (22 SKILL.md detectadas)
- sentinel_check (estado do pipeline-state.json)
- overall: PASS | PASS_WITH_NOTES | FAIL

PASS ou PASS_WITH_NOTES = integracao funcionou.

## Passo 6 — Validar cross-empresa

Criar issue na FX Studio AI delegando trabalho ao Pipeline Orchestrator (por exemplo: produzir spec do conector MetaTrader 5 pra XAUUSD). Acompanhar o handoff entre empresas + execucao do workflow Spec.

## Erros conhecidos (gaps P1)

| Gap | Sintoma | Workaround |
|---|---|---|
| Opus 4.7 1M indisponivel | Adapter cai pra sonnet 4.6 | Aceitar — frontmatter dos agentes ja especifica sonnet |
| `SessionStart:resume` hook falha (8s) | Warning no log, nao bloqueia | Ignorar — hooks SessionStart prompt-type sao incompativeis com subprocess Claude sem context |
| Hooks `.claude/hooks/*.cjs` nao executam em modo Paperclip | Validacao de sequence nao roda | Paperclip orquestra heartbeat lifecycle por conta propria — overhead aceitavel pra maioria dos casos |

</instructions>

<documentation>
- Spec completa: `${CLAUDE_PLUGIN_ROOT}/references/paperclip/PAPERCLIP-AXIOMS.md`
- KB Paperclip: `${CLAUDE_PLUGIN_ROOT}/references/paperclip/paperclip-kb.md`
- Zoneamento D:/C:: `${CLAUDE_PLUGIN_ROOT}/references/paperclip/ZONING.md`
- Plano de migracao: `${CLAUDE_PLUGIN_ROOT}/references/paperclip/PLAN-46-AGENTS-UPDATE.md`
- Workflow specs por tipo: `PAPERCLIP-{BUGFIX,FEATURE,AUDIT,UX,SPEC,ADVERSARIAL}-WORKFLOW.md`
- Piloto bem-sucedido (referencia): `pilot-information-gate.md`
- Doc da integracao (visao geral): `docs/PAPERCLIP-INTEGRATION.md`
</documentation>
