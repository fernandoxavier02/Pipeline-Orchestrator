---
step_number: 09
step_name: "closure"
description: "Spec Heavy: Formal spec closure — 2 reports + spec.json update + archive"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:spec-closer"
expected_inputs:
  - confidence_score: from_step_08
  - spec_grade: from_step_08
  - format_gate_report: from_step_01
  - content_review_report: from_step_02
  - tasks_completed: from_step_04
  - post_impl_report: from_step_05
  - arch_audit_report: from_step_06
  - security_report: from_step_07
  - spec_context: from_spec_context_yaml
expected_outputs:
  - closure_report: object
  - pipeline_report_technical: object
  - pipeline_report_executive: object
  - spec_json_updated: boolean
expected_next: null
gate_required: false
allowed_tools: [Read, Grep, Glob, Bash, Edit, Write]
---

# Spec Lifecycle (Heavy) — Step 09: Closure

> **Position in pipeline:** Step 9 — passo final. Nada executa apos o closure.
> **Goal:** Marcar a spec como formalmente fechada: atualizar `spec.json`, marcar items de `tasks.md`, gerar dois relatorios (tecnico cobrindo todas as 9 fases + executivo em linguagem leiga), e mover a pasta da spec para o arquivo "Specs finalizadas".

---

## Quando usar

Use apos o Confidence Dashboard (step 08) ter sido emitido. Este passo nao tem gate AskUserQuestion proprio — confia nas aprovacoes anteriores. Mas valida 5 pre-requisitos antes de gravar qualquer arquivo; se algum falhar, aborta sem alterar o disco.

## Regras

- Verificar 5 pre-requisitos (incluindo sanitizacao do feature name) antes de fechar (ver Etapa 1).
- SEMPRE gerar `closure-report.md`, `pipeline-report-technical.md` e `pipeline-report-executive.md` ANTES do mv.
- O movimento de pasta (Etapa 4) deve rodar ANTES de qualquer mutacao em `spec.json` (Etapa 5) — se mv falhar, spec.json nao e tocado e a spec permanece na fase atual.
- Mensagens dos relatorios usam linguagem leiga (nao-tecnica) no executivo, e tecnica no technical.
- O technical report cobre TODAS as 9 fases do Heavy (vs 3 do Light).

---

## Inputs

- `confidence_score` (do step 08) — numero 0-100.
- `spec_grade` (do step 08) — `PRODUCTION READY | DEPLOY WITH MONITORING | REMEDIATION NEEDED | NOT READY`.
- Reports de cada fase (steps 01, 02, 04, 05, 06, 07) para alimentar o relatorio tecnico.
- `spec_context` — feature name, scope, paths.
- Acesso a `.kiro/specs/<feature>/spec.json`, `tasks.md`.

---

## Etapa 1 — Pre-requisitos (5 checks, inclui sanitizacao)

| # | Check | Esperado |
|---|---|---|
| 0 | `<feature>` valida o allowlist `^[a-zA-Z0-9_-]+$` (sem espacos, sem `..`, sem `/`, sem `;`, sem `$`, sem aspas) | match |
| 1 | `spec.json` existe e `status != "closed"` | true |
| 2 | Post-impl decision = `PASS` ou `PASS_WITH_WARNINGS` | true |
| 3 | Build do projeto passa (re-run defensivo) | exit code 0 |
| 4 | 0 findings BLOCKER nao-resolvidos (consolidados de steps 02, 05, 06, 07) | true |

**Check 0 (sanitizacao) e MANDATORIO antes de qualquer comando shell desta step.** Se `<feature>` nao matchar o allowlist `^[a-zA-Z0-9_-]+$`, FAIL imediato com mensagem de erro `INVALID_FEATURE_NAME: <feature>` e NAO prosseguir para Etapa 4 (mv) nem qualquer outra etapa que invoque shell. Razao: previne shell injection no `mv`.

Se qualquer pre-requisito falhar, ABORTAR sem tocar arquivos. Reportar ao usuario qual pre-req falhou.

---

## Etapa 2 — Gerar `closure-report.md`

Localizacao: `.kiro/specs/<feature>/closure-report.md`.

Conteudo: resumo de uma pagina com:
- Feature name, datas (open/close), ISO-8601.
- Confidence score + grade.
- Tasks total / completas.
- Findings: counts por severidade (consolidado dos 4 audits: 02, 05, 06, 07).
- Lista das tasks nao-fechadas (se houver — caso PASS_WITH_WARNINGS permita).
- Adversarial loops totais (do step 04).
- Decisao final (production ready / monitor / remediate / not ready).

---

## Etapa 3 — Gerar 2 relatorios em `.kiro/specs/<feature>/`

### a) `pipeline-report-technical.md` (tecnico detalhado, 9 fases)

- Resultado de cada uma das 9 fases (1, 2, 3, 4 com 5+6+7 lado-a-lado, 8, 9) com tabela de scores.
- Findings com `arquivo:linha`, causa, solucao proposta — separados por audit (post-impl, architecture, security).
- Threat model do step 07 incluido como secao dedicada.
- Matriz de rastreabilidade completa (AC → arquivo → teste → cenario ATDD do step 03).
- Plano de remediacao priorizado (se houver dividas).
- Adversarial loop summary (rodadas, findings resolvidos vs aceitos como warnings).
- Lista de invencoes detectadas (eixo 5 do step 05).

### b) `pipeline-report-executive.md` (executivo, linguagem leiga)

- Linguagem leiga, sem jargao tecnico (sem `EARS`, `TRACED`, `INVENTION:BLOCKER`, `IDOR`, `TOCTOU` etc).
- Narrativa: o que foi feito, o que foi verificado (4 angulos: spec, codigo, arquitetura, seguranca), o que precisa de atencao depois do deploy.
- Decisao final em linguagem direta: "Pronto para producao", "Pronto com observacao", "Precisa de revisao", "Nao recomendado".
- Recomendacao de publicacao (deploy now / deploy with monitor / hold / discard).
- Riscos remanescentes traduzidos: ao inves de "JWT sem exp claim", escrever "tokens de acesso ficam validos para sempre — risco de uso indevido se vazarem".

---

## Etapa 4 — Mover spec para arquivo (DEVE rodar ANTES da atualizacao de spec.json)

Mover a pasta `.kiro/specs/<feature>/` para `.kiro/specs/Specs finalizadas/<feature>/`. Esta etapa e PRE-REQUISITO para Etapa 5 (spec.json status flip): se o mv falhar, spec.json NAO deve ser atualizado e a spec permanece na fase atual.

Comando obrigatorio (sempre quotar AMBOS os caminhos por causa do espaco em "Specs finalizadas"):

```bash
mv ".kiro/specs/<feature>" ".kiro/specs/Specs finalizadas/<feature>"
```

`<feature>` ja foi sanitizado contra o allowlist em Etapa 1 check 0.

**Error handling:** se exit code do `mv` != 0, ABORTAR step inteiro: nao atualizar spec.json (Etapa 5), nao marcar tasks (Etapa 6), nao emitir confirmacao (Etapa 7). Reportar ao usuario o exit code e a mensagem de erro do mv. A spec permanece em sua fase atual sem mutacao.

---

## Etapa 5 — Atualizar `spec.json` (apos mv bem-sucedido)

Caminho: `.kiro/specs/Specs finalizadas/<feature>/spec.json` (novo path apos Etapa 4).

Mutacoes:
- `status: "closed"`
- `closedAt`: current UTC datetime in ISO-8601 format (`YYYY-MM-DDTHH:MM:SSZ`). Implementer MAY use any of: (a) Node.js `new Date().toISOString().replace(/\.\d{3}/, '')`; (b) Bash tool with `date -u +"%Y-%m-%dT%H:%M:%SZ"`; (c) PowerShell `(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')`. Escolha conforme plataforma do runner.
- `confidence: <N>%` (numero do step 08).
- `mode: "Heavy"` (registro explicito de qual variante do pipeline foi executada).

Manter todos os outros campos intocados. Status so flipa para "closed" apos mv ter sucedido (Etapa 4).

---

## Etapa 6 — Marcar tasks `[x]` em `tasks.md`

Caminho: `.kiro/specs/Specs finalizadas/<feature>/tasks.md`.

Para cada task em `tasks.md` que tenha evidencia (commit, arquivo, teste) registrada no step 05 eixo 4 (Task Completeness — TRACED), confirmar que ja esta marcada `[x]`. Se alguma task TRACED ainda estiver `[ ]`, marcar `[x]` agora.

Tasks com status `GAP` ou `DRIFT` no eixo 4 NAO devem ser marcadas — elas ficam como dividas tecnicas listadas no closure-report.

---

## Etapa 7 — Emitir confirmacao

```
+==================================================================+
|  SPEC CLOSURE (HEAVY) — COMPLETO                                  |
+==================================================================+
|  Spec: [feature-name]                                             |
|  Status: CLOSED                                                   |
|  Mode: Heavy (9 phases)                                           |
|  Confidence: [N]%                                                 |
|  Grade: [PRODUCTION READY | ...]                                  |
|  Archived to: .kiro/specs/Specs finalizadas/[feature-name]/       |
|  Reports: closure-report.md + pipeline-report-{technical,exec}.md |
+==================================================================+
```

---

**Proximo step:** null (fim do pipeline)
