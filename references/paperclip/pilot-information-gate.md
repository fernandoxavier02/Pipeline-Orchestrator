# Pilot Report — information-gate Parity Validation

**Issue:** PIP-11  
**Date:** 2026-05-22  
**Adapter:** claude_local  
**Model:** claude-sonnet-4-6 (fallback — claude-opus-4-7-1m unavailable)  
**Agent:** information-gate

---

## 1. Self-Identification

- **Nome do agente:** INFORMATION GATE (Macro-Gate)
- **Arquivo de instruções:** `agents/core/information-gate.md`
- **Versão do plugin:** 7.5.0 (lida de `.claude-plugin/plugin.json`)
- **Linhas relevantes do agent.md:**
  - Linha 1-6: frontmatter com `name: information-gate`, `model: sonnet`, `color: yellow`
  - Linha 10: "You are the **INFORMATION GATE** — a defense-in-depth agent that runs ONCE after task classification, BEFORE pipeline selection begins."
  - Linha 26-27: "ACHADO #7 RUNTIME PROTOCOL (MANDATORY — v5.3.0+)"

---

## 2. Protocolo de Gate

O information-gate emite `GATE_REQUEST v1` quando encontra ambiguidade e está rodando como subagente (onde `AskUserQuestion` não está disponível).

**Arquivo SSOT do protocolo:** `references/gate-request-protocol.md`

**Formato canônico (agent.md linhas 32-48):**

```
=== GATE_REQUEST v1 ===
gate_id: "info-gate-Q{N}"
agent: "information-gate"
phase: "0b"
question: "Looking at {file}:{line}, I see {observation}. {question}"
header: "{chip label max 12 chars}"
multi_select: false
options:
  - label: "{option label}"
    description: "{explanation + trade-offs}"
    recommended: true|false
=== END GATE_REQUEST ===
STATUS: AWAITING_GATE_RESPONSES
```

**Regras críticas de schema:**
- `multi_select` snake_case (NÃO `multiSelect`)
- `recommended: true|false` por opção (NÃO sufixo "(Recomendado)" no label)
- `gate_id` único por emissão
- `header` com label concreto (NUNCA placeholder literal)
- Aguardar `GATE_RESPONSES` antes de continuar

**Handshake timeout:** 30 min padrão (`PIPELINE_HANDSHAKE_TIMEOUT_MS` override). Se expirar → gate `PROTOCOL_HANDSHAKE_TIMEOUT` (hardness HARD) disparado pelo pai.

---

## 3. Tools Disponíveis (verificação atual)

| Tool | Disponível? | Observação |
|------|------------|------------|
| AskUserQuestion | ✅ SIM | Disponível neste contexto (não-subagente) |
| Agent | ✅ SIM | Disponível via tool nativa |
| EnterPlanMode | ✅ SIM (deferred) | Requer ToolSearch para carregar schema |
| Read / Write / Edit | ✅ SIM | Todos disponíveis |
| Bash / Glob / Grep | ✅ SIM | Todos disponíveis |
| WebFetch / WebSearch | ✅ SIM (deferred) | Requer ToolSearch para carregar schema |
| Hooks sentinel-hook.cjs | ✅ PRESENTE | `.claude/hooks/sentinel-hook.cjs` encontrado |
| Hooks dispatch-guard.cjs | ✅ PRESENTE | `.claude/hooks/dispatch-guard.cjs` encontrado |

**Hooks ativos detectados via Glob:**
- completion-checklist.cjs
- session-cleanup-hook.cjs
- skill-frontmatter-parser.cjs
- force-pipeline-agents.cjs
- edit-guard-hook.cjs
- session-lock-hook.cjs
- dispatch-guard.cjs ✅
- scope-lock-hook.cjs
- cleanup-orphan-sentinel-state-hook.cjs
- langfuse-hook.cjs
- sentinel-hook.cjs ✅
- stop-hook.cjs

---

## 4. References — Verificação de Leitura

| Arquivo | Lido? | Primeira linha |
|---------|-------|----------------|
| `references/gates.md` | ✅ SIM | "# Gate System Reference" |
| `references/complexity-matrix.md` | ✅ SIM | "# Complexity Matrix (SSOT)" |
| `references/audit-trail.md` | ✅ SIM | "# Audit Trail Reference" |
| `references/gate-request-protocol.md` | ✅ SIM | "# GATE_REQUEST and DISPATCH_REQUEST protocol" |

---

## 5. Skills Carregadas

22 skills encontradas via Glob em `skills/*/SKILL.md`:

- bugfix-light, bugfix-heavy, bugfix (entry-point)
- audit-heavy, audit-light, audit (entry-point)
- feature-light, feature-heavy, feature (entry-point)
- review
- spec-audit-only, spec-design, spec-heavy, spec-init, spec-light, spec-requirements, spec-tasks, spec (entry-point)
- validate-design, validate-gap, verify-completion
- pipeline (entry-point principal)

---

## 6. Sentinel State

**`PIPELINE_DOC_PATH`:** NÃO DEFINIDO (variável de ambiente ausente neste contexto)  
**Sentinel states históricos encontrados:** 22 arquivos em `.pipeline/docs/Pre-*/`  
**Diretório `Pre-Complexa-action`:** NÃO existia antes desta execução (criado agora para este relatório)  
**Sentinel state ativo:** NENHUM (sem pipeline ativo rodando)

---

## 7. PARITY_VERDICT v1

```yaml
PARITY_VERDICT: v1
agent: information-gate
pilot_date: "2026-05-22"
adapter: claude_local
model_requested: claude-opus-4-7-1m
model_actual: claude-sonnet-4-6
plugin_version: "7.5.0"

identity_check:
  status: PASS
  evidence: "agent.md lido em agents/core/information-gate.md linha 1-275; nome, fase, e protocolo confirmados"

protocol_check:
  status: PASS
  evidence: "GATE_REQUEST v1 schema confirmado em agent.md linhas 32-48 + references/gate-request-protocol.md; 5 regras de schema documentadas"

tools_check:
  status: PASS_WITH_NOTES
  evidence: "Read/Write/Edit/Bash/Glob/Grep/AskUserQuestion/Agent confirmados presentes; EnterPlanMode/WebFetch/WebSearch disponíveis via ToolSearch (deferred)"
  notes: "Contexto atual é sessão principal (não subagente) — AskUserQuestion disponível diretamente. Em subagente runtime seria necessário GATE_REQUEST conforme Achado #7"

references_check:
  status: PASS
  evidence: "gates.md, complexity-matrix.md, audit-trail.md, gate-request-protocol.md — todos lidos com sucesso"

skills_check:
  status: PASS
  evidence: "22 SKILL.md encontrados cobrindo todos os entry-points e variants do pipeline"

sentinel_check:
  status: PARTIAL
  evidence: "22 sentinel-state.json históricos encontrados em .pipeline/docs/; nenhum ativo (PIPELINE_DOC_PATH não definido = nenhum pipeline em execução)"
  notes: "Estado esperado para piloto de validação sem pipeline ativo"

overall: PASS_WITH_NOTES
notes:
  - "Modelo claude-opus-4-7-1m indisponível — execução com claude-sonnet-4-6 (frontmatter do agent.md especifica 'model: sonnet', então compatível)"
  - "Comportamento de gate seria idêntico ao Claude Code standalone — mesma lógica condicional, mesmo formato GATE_REQUEST, mesmos checks de referências"
  - "Diferença esperada de ambiente: PIPELINE_DOC_PATH não injetado pelo harness Paperclip neste contexto — seria injetado pelo pipeline-controller em execução real"
  - "Hooks presentes em .claude/hooks/ mas não executados em modo Paperclip claude_local sem harness Claude Code ativo"
```
