---
step_number: 05
step_name: "closure"
description: "Spec Audit-Only: Formal spec closure — 2 reports + spec.json update (only if fixes applied) + archive (only if fixes applied)"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:spec-closer"
production_writes_allowed: false
expected_inputs:
  - confidence_score: from_step_04
  - spec_grade: from_step_04
  - format_gate_report: from_step_01
  - content_review_report: from_step_02
  - audit_findings: from_step_03
  - loop_result: from_step_03
  - spec_context: from_spec_context_yaml
expected_outputs:
  - closure_report: object
  - pipeline_report_technical: object
  - pipeline_report_executive: object
  - spec_json_updated: boolean
  - commit_created: boolean
expected_next: null
gate_required: false
allowed_tools: [Read, Grep, Glob, Bash, Edit, Write]
---

# Spec Lifecycle (Audit-Only) — Step 05: Closure

> **Position in pipeline:** Step 5 — passo final. Nada executa apos o closure.
> **Goal:** Marcar a spec como auditada: gerar dois relatorios (tecnico cobrindo as 5 fases audit-only + executivo em linguagem leiga). Se houve fixes aplicados durante o audit-loop, atualizar `spec.json`, marcar items de `tasks.md`, mover a pasta da spec para arquivo "Specs finalizadas". Se NAO houve fixes, gerar reports apenas (read-only).

---

## Quando usar

Use apos o Confidence Dashboard (step 04) ter sido emitido. Este passo nao tem gate AskUserQuestion proprio — confia nas aprovacoes anteriores. Mas valida 5 pre-requisitos antes de gravar qualquer arquivo; se algum falhar, aborta sem alterar o disco.

## Regras audit-only

- **Commit-only-if-fixes:** verificar `loop_result.fixes_applied.length`. Se zero -> SOMENTE gerar reports (Etapa 2 + 3); pular Etapas 4, 5, 6 (mv, spec.json update, marcar tasks). Spec permanece intocada na fase atual. Se > 0 -> proceder com fluxo completo.
- Verificar 5 pre-requisitos (incluindo sanitizacao do feature name) antes de fechar (ver Etapa 1).
- SEMPRE gerar `closure-report.md`, `pipeline-report-technical.md` e `pipeline-report-executive.md` — independente do commit-policy.
- Se houver fixes: o movimento de pasta (Etapa 4) deve rodar ANTES de qualquer mutacao em `spec.json` (Etapa 5) — se mv falhar, spec.json nao e tocado e a spec permanece na fase atual.
- Mensagens dos relatorios usam linguagem leiga (nao-tecnica) no executivo, e tecnica no technical.
- O technical report cobre TODAS as 5 fases do Audit-Only.
- Reports e spec.json carregam metadata `audit_mode: true` e `fixes_applied: N` para distinguir de Light/Heavy.

---

## Inputs

- `confidence_score` (do step 04) — numero 0-100.
- `spec_grade` (do step 04) — `PRODUCTION READY | DEPLOY WITH MONITORING | REMEDIATION NEEDED | NOT READY`.
- `loop_result` (do step 03) — inclui `fixes_applied: list of file paths`. **Critical para commit policy.**
- Reports de cada fase (steps 01, 02, 03) para alimentar o relatorio tecnico.
- `spec_context` — feature name, scope, paths.
- Acesso a `.kiro/specs/<feature>/spec.json`, `tasks.md`.

---

## Etapa 1 — Pre-requisitos (5 checks, inclui sanitizacao)

| # | Check | Esperado |
|---|---|---|
| 0 | `<feature>` valida o allowlist `^[a-zA-Z0-9_-]+$` (sem espacos, sem `..`, sem `/`, sem `;`, sem `$`, sem aspas) | match |
| 1 | `spec.json` existe e e parseavel | true |
| 2 | `loop_result.gate_decision` ∈ {`approved`, `checkpoint`} (nao `abort`) | true |
| 3 | Build do projeto passa (re-run defensivo) — **CONDICIONAL: pular se `loop_result.fixes_applied.length == 0`** | exit code 0 (ou skipped se zero fixes) |
| 4 | 0 findings BLOCKER outstanding (escalated counta como nao-bloqueante para audit-only) | true |

**Check 0 (sanitizacao) e MANDATORIO antes de qualquer comando shell desta step.** Se `<feature>` nao matchar o allowlist `^[a-zA-Z0-9_-]+$`, FAIL imediato com mensagem de erro `INVALID_FEATURE_NAME: <feature>` e NAO prosseguir para Etapa 4 (mv) nem qualquer outra etapa que invoque shell. Razao: previne shell injection no `mv`.

**Check 3 (build pass) e CONDICIONAL ao audit-only ter aplicado fixes.** Se `loop_result.fixes_applied.length == 0`, o audit foi puramente read-only — nenhum codigo (e nenhum arquivo de spec/docs) foi alterado, entao re-rodar o build e desnecessario e arrisca um falso negativo se o working tree estava com problema pre-existente nao relacionado ao audit. Skip do check 3 nesse caso e registrar `build_check: skipped (zero fixes — audit was read-only)` no closure-report. Se `fixes_applied.length > 0`, executar o check 3 normalmente.

Se qualquer pre-requisito (excluindo check 3 quando skipped) falhar, ABORTAR sem tocar arquivos. Reportar ao usuario qual pre-req falhou.

---

## Etapa 2 — Gerar `closure-report.md`

Localizacao: `.kiro/specs/<feature>/closure-report.md` (se houve fixes — local original; sera movido para `Specs finalizadas/` em Etapa 4).
Se zero fixes: gerar em `.kiro/specs/<feature>/closure-report.md` mesmo (local original — sem mv).

Conteudo: resumo de uma pagina com:
- Feature name, datas (audit start / audit end), ISO-8601.
- Confidence score + grade.
- Tasks total / completas (do estado atual de tasks.md).
- Findings: counts por severidade (consolidado dos 3 sources do audit loop).
- Lista das tasks nao-fechadas (se houver).
- Adversarial loops totais (do step 03).
- Fixes applied: N (paths listados).
- Findings escalated: N (com referencia a "ciclo separado necessario").
- Decisao final (production ready / monitor / remediate / not ready).
- **Metadata audit-only:** `audit_mode: true`, `fixes_applied: N`, `commit_created: true|false`.

---

## Etapa 3 — Gerar 2 relatorios em `.kiro/specs/<feature>/`

### a) `pipeline-report-technical.md` (tecnico detalhado, 5 fases audit-only)

- Resultado de cada uma das 5 fases (1 Format Gate, 2 Content Review, 3 Audit Loop com 3 sub-sources lado-a-lado, 4 Confidence Dashboard, 5 Closure) com tabela de scores.
- Findings com `arquivo:linha`, causa, solucao proposta — separados por audit source (post-impl, architecture, security).
- Threat model do security-scanner do step 03 incluido como secao dedicada.
- Matriz de rastreabilidade completa (AC → arquivo → teste, do post-impl-validator).
- Plano de remediacao priorizado para findings escalados (necessitam ciclo separado).
- Adversarial loop summary (rodadas, findings resolvidos vs escalados vs aceitos como warnings).
- Lista de invencoes detectadas (eixo 5 do post-impl source).
- **Header explicito:** "AUDIT-ONLY VARIANT — no implementation phase was executed; this report covers congruence audit only."

### b) `pipeline-report-executive.md` (executivo, linguagem leiga)

- Linguagem leiga, sem jargao tecnico (sem `EARS`, `TRACED`, `INVENTION:BLOCKER`, `IDOR`, `TOCTOU` etc).
- Narrativa: o que foi auditado (3 angulos: spec, arquitetura, seguranca), o que esta congruente, o que precisa de atencao.
- Decisao final em linguagem direta: "Pronto para producao", "Pronto com observacao", "Precisa de revisao", "Nao recomendado".
- Recomendacao de publicacao (deploy now / deploy with monitor / hold / discard).
- Riscos remanescentes traduzidos: ao inves de "JWT sem exp claim", escrever "tokens de acesso ficam validos para sempre — risco de uso indevido se vazarem".
- **Header explicito:** "Variante: AUDIT-ONLY — auditoria de congruencia, sem implementacao nova."

---

## Etapa 4 — Mover spec para arquivo (CONDICIONAL: somente se houve fixes)

**Skip esta etapa se `loop_result.fixes_applied.length == 0`.** Spec permanece em `.kiro/specs/<feature>/` e nao ha mv.

Se houve fixes: mover a pasta `.kiro/specs/<feature>/` para `.kiro/specs/Specs finalizadas/<feature>/`. Esta etapa e PRE-REQUISITO para Etapa 5 (spec.json status flip): se o mv falhar, spec.json NAO deve ser atualizado e a spec permanece na fase atual.

Comando obrigatorio (sempre quotar AMBOS os caminhos por causa do espaco em "Specs finalizadas"):

```bash
mv ".kiro/specs/<feature>" ".kiro/specs/Specs finalizadas/<feature>"
```

`<feature>` ja foi sanitizado contra o allowlist em Etapa 1 check 0.

**Error handling:** se exit code do `mv` != 0, ABORTAR step inteiro: nao atualizar spec.json (Etapa 5), nao marcar tasks (Etapa 6), nao emitir confirmacao (Etapa 7). Reportar ao usuario o exit code e a mensagem de erro do mv. A spec permanece em sua fase atual sem mutacao.

---

## Etapa 5 — Atualizar `spec.json` (CONDICIONAL: somente se houve fixes E mv bem-sucedido)

**Skip esta etapa se `loop_result.fixes_applied.length == 0`.** spec.json permanece intocado.

Caminho (apos mv): `.kiro/specs/Specs finalizadas/<feature>/spec.json`.

Mutacoes:
- `status: "closed"`
- `closedAt`: current UTC datetime in ISO-8601 format (`YYYY-MM-DDTHH:MM:SSZ`). Implementer MAY use any of: (a) Node.js `new Date().toISOString().replace(/\.\d{3}/, '')`; (b) Bash tool with `date -u +"%Y-%m-%dT%H:%M:%SZ"`; (c) PowerShell `(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')`. Escolha conforme plataforma do runner.
- `confidence: <N>%` (numero do step 04).
- `mode: "Audit-Only"` (registro explicito de qual variante do pipeline foi executada).
- `audit_mode: true` (flag dedicada audit-only).
- `fixes_applied: N` (count de arquivos editados durante o audit loop).

Manter todos os outros campos intocados. Status so flipa para "closed" apos mv ter sucedido (Etapa 4).

---

## Etapa 6 — Marcar tasks `[x]` em `tasks.md` (CONDICIONAL)

**Skip esta etapa se `loop_result.fixes_applied.length == 0`.** tasks.md permanece intocado (apenas leitura para reports).

Caminho (apos mv): `.kiro/specs/Specs finalizadas/<feature>/tasks.md`.

Para cada task em `tasks.md` que tenha evidencia (commit, arquivo, teste) registrada no audit loop step 03 post-impl source eixo 4 (Task Completeness — TRACED), confirmar que ja esta marcada `[x]`. Se alguma task TRACED ainda estiver `[ ]`, marcar `[x]` agora.

Tasks com status `GAP` ou `DRIFT` no eixo 4 NAO devem ser marcadas — elas ficam como dividas tecnicas listadas no closure-report.

---

## Etapa 7 — Emitir confirmacao (com variante de variante audit-only)

### Variante A — fixes aplicados (fluxo completo)

```
+==================================================================+
|  SPEC AUDIT-ONLY CLOSURE — COMPLETO (com fixes)                   |
+==================================================================+
|  Spec: [feature-name]                                             |
|  Status: CLOSED                                                   |
|  Mode: Audit-Only (5 phases)                                      |
|  Confidence: [N]%                                                 |
|  Grade: [PRODUCTION READY | ...]                                  |
|  Audit-mode baseline: 75% [ACIMA | ABAIXO]                        |
|  Fixes applied: [N] arquivos                                      |
|  Findings escalated: [N] (necessitam ciclo separado)              |
|  Archived to: .kiro/specs/Specs finalizadas/[feature-name]/       |
|  Reports: closure-report.md + pipeline-report-{technical,exec}.md |
|  Commit: criado (chore(audit): congruence corrections)            |
+==================================================================+
```

### Variante B — zero fixes (read-only)

```
+==================================================================+
|  SPEC AUDIT-ONLY CLOSURE — COMPLETO (read-only, zero fixes)       |
+==================================================================+
|  Spec: [feature-name]                                             |
|  Status: UNCHANGED (no fixes were needed or applied)              |
|  Mode: Audit-Only (5 phases)                                      |
|  Confidence: [N]%                                                 |
|  Grade: [PRODUCTION READY | ...]                                  |
|  Audit-mode baseline: 75% [ACIMA | ABAIXO]                        |
|  Findings escalated: [N] (necessitam ciclo separado)              |
|  Spec location: .kiro/specs/[feature-name]/ (UNMOVED)             |
|  Reports: closure-report.md + pipeline-report-{technical,exec}.md |
|  Commit: NAO criado (audit foi read-only)                         |
+==================================================================+
```

---

**Proximo step:** null (fim do pipeline)
