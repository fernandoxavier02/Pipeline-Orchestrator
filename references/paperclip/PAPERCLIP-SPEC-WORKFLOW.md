# PAPERCLIP-SPEC-WORKFLOWS (AUTHORING + PROCESSING)
## Dois workflows inquebraveis que compartilham o nome "Spec"

**Versao:** 2.0 — 2026-06-15 (v8.0.0: spec-authoring introduzido; o pipeline de PROCESSING anterior vive em §PROCESSING-LEGACY; o novo pipeline de AUTHORING vive em §AUTHORING)
**Espelha:** dois pipelines distintos do pipeline-orchestrator — AUTHORING (criar uma spec do zero, v8.0.0) e PROCESSING (validar/revisar uma spec existente; variants spec-light, spec-heavy, spec-audit-only).
**Aplicar quando:** ver §0 — a decisao depende do que o Board pediu E do comando de entrada.
**Precedencia:** PAPERCLIP-AXIOMS.md vence em conflito. A disciplina de handoff da Secao 11 dos AXIOMS se aplica a cada transicao dos dois fluxos.

> **Este documento cobre AGORA DOIS workflows que dividem o nome "Spec".** Eles tem formas incompativeis e cargos diferentes. **Distinga sempre pelo comando de entrada.** Nunca os conflacione: AUTHORING cria e SELA; PROCESSING valida trabalho ja feito.

---

## 0. QUAL WORKFLOW? (decisao no topo — leia primeiro)

| Sinal | Use AUTHORING | Use PROCESSING |
|---|---|---|
| Board pede "criar uma spec a partir de requisitos", "RFC pra aprovar antes de codar", "documentar a arquitetura antes de implementar" | SIM | — |
| Board pede "validar a spec existente contra o codigo", "auditar a fidelidade da spec", "fechar trabalho ja concluido" | — | SIM (light/heavy/audit) |
| Comando de entrada eh `/pipeline-orchestrator:spec` | SIM | — |
| Comando eh `/spec-light`, `/spec-heavy`, `/spec-audit-only`, ou `/pipeline --type=Spec` | — | SIM |
| Comando eh `/spec-review` (critico standalone sobre uma pasta de spec) | SIM (so a critica, read-only) | — |

> **Regra-chave:** AUTHORING **cria e sela**. PROCESSING **valida** trabalho concluido. Nunca use authoring para processar uma spec que ja existe; nunca use processing para criar uma spec do zero. Os dois sao mutuamente exclusivos por desenho.

**Cargos por workflow (nao misture):**

| Workflow | Cargo orquestrador | Cargos especificos |
|---|---|---|
| AUTHORING | `spec-controller` (core) | `brainstorm-step-01c-ideation`, `design-interrogator`, `spec-adversarial-critic` |
| PROCESSING | `brainstorm-controller` + `task-orchestrator` | `spec-format-gate`, `spec-content-reviewer`, `spec-post-impl-validator`, `spec-closer` |

---

# §AUTHORING — SPEC-AUTHORING-WORKFLOW (v8.0.0, NOVO)

## A1. Quando este workflow se aplica

| Sinal | Peso |
|---|---|
| Comando de entrada eh `/pipeline-orchestrator:spec` | decisivo |
| Issue pede CRIAR uma spec do zero, RFC para aprovacao, design antes de implementar | forte |
| Nao existe ainda requirements.md/design.md/tasks.md — eles serao PRODUZIDOS | confirma |

**O fluxo PARA no selo.** Authoring nao implementa: ele entrega `requirements.md` + `design.md` + `tasks.md` selados (`spec.json` phase=sealed) e encerra. A implementacao acontece depois, em outra issue, por outro workflow (Feature/Bug Fix) — ou reabre-se a spec via `--amend`.

## A2. Cargos envolvidos (authoring)

```
1. spec-controller            (N1 — orquestra o authoring inteiro, para no selo)
   ├── brainstorm clarification   (step-00-intake → step-01-explore → step-01b-alternatives)
   ├── brainstorm-step-01c-ideation   (NOVO — propoe 2-3 conceitos de design)
   ├── design-interrogator        (FORCADO — stress-test de cada trade-off)
   ├── Kiro lifecycle: spec-init → spec-requirements → validate-gap → spec-design → validate-design → spec-tasks
   ├── spec-adversarial-critic    (NOVO — read-only, 13 eixos sobre os DOCUMENTOS)
   ├── loop de revisao limitado   (aplica criticas ate convergir, com bound)
   └── SELO de contrato           (spec.json phase=sealed + ready_for_implementation + spec_version + sealed_at + sealed_spec)
```

**Adversarial:** aqui o adversario revisa os **documentos** da spec (requirements/design/tasks), nao codigo — porque ainda nao ha codigo. Schema proprio de 13 eixos: coverage, testability, ambiguity, risks, contracts, data-models, vertical-slices, dependencies, DI/CI, operational, failure-modes, security, coherence.

**TDD:** nao se aplica na producao da spec (nao ha codigo); ele entra na implementacao posterior, fora deste workflow.

## A3. Fluxo passo-a-passo (authoring)

| Step | Cargo | Saida | Gate |
|---|---|---|---|
| Clarificacao | spec-controller → brainstorm steps | clarificacao exaustiva (11-lens), alternativas | — |
| Ideacao | brainstorm-step-01c-ideation | 2-3 conceitos (minimal/aggressive/innovative) com trade-offs; usuario escolhe | IDEATION_PROPOSED (AUDIT) ao propor; IDEATION_ACCEPTED / IDEATION_REJECTED (SOFT) na escolha |
| Interrogacao | design-interrogator (FORCADO) | Q&A arquitetural registrado, cada trade-off resolvido | DESIGN_INTERROGATOR_FORCED (AUDIT) |
| spec-init | spec-controller (Kiro) | `spec.json` phase=autho-draft + metadata | — |
| spec-requirements | spec-controller (Kiro) | `requirements.md` em EARS | — |
| validate-gap | spec-controller (Kiro) | gap entre requirements e codebase existente | — |
| spec-design | spec-controller (Kiro) | `design.md` com arquitetura + ADRs + contracts | — |
| validate-design | spec-controller (Kiro) | review interno do design | — |
| spec-tasks | spec-controller (Kiro) | `tasks.md` decompondo design em tasks | — |
| Critica adversarial | spec-adversarial-critic | criticas em 13 eixos sobre os documentos | SPEC_REVIEW_FINDINGS (AUDIT) |
| Loop de revisao | spec-controller | aplica criticas ate convergir (bounded) | — |
| SELO | spec-controller | `spec.json` phase=sealed + ready_for_implementation + spec_version + sealed_at + sealed_spec | SPEC_SEALED (AUDIT) |

**Selo (SPEC_SEALED, AUDIT/informacional):** o spec-controller grava `phase=sealed` no `spec.json` — `phase=sealed` eh a SSOT do estado selado; `ready_for_implementation` eh DERIVADO de `phase`. O selo tambem incrementa `spec_version`, carimba `sealed_at`, e guarda um ponteiro `sealed_spec` {`run_dir`, `artifacts[5]`} (os 5 nomes de arquivo do bundle). **Nao ha hashing em 8.0.0** — content-hashing foi explicitamente diferido (follow-up R8); o evento SPEC_SEALED so confirma (decision CONFIRMED) que o `phase=sealed` foi gravado. Apos selado, a spec so muda via `--amend`.

**Fluxo `--amend`:** reabre uma spec selada — `spec.json` volta para `phase=autho-draft`, passa de novo pela interrogacao, e re-sela com `spec_version` incrementado (evento SPEC_AMENDED, AUDIT, decision CONFIRMED).

### A3.1 Handoff entre os steps do authoring (disciplina obrigatoria)

Cada transicao acima segue o **Contrato de Handoff** da Secao 11 dos AXIOMS. Concretamente, ao concluir um step:

1. Emita os blocos de fidelidade com o cabecalho EXATO `### BLOCK_NAME v1` (ex.: `### IDEATION_PROPOSED v1`, e no selo `### SPEC_SEALED v1`).
2. Emita o bloco `### NEXT_STEP v1` nomeando o proximo step, o cargo que assume e os `blockedByIssueIds`.
3. CRIE a proxima sub-issue **neste mesmo heartbeat**, com `blockedByIssueIds` = a issue atual (ou, em fan-in, todos os irmaos + a juncao).
4. So entao PATCH do seu status para `done`. Se a criacao falhar, PATCH para `paused` + motivo — nunca deixe o proximo passo implicito.

## A4. Decisoes pre-aprovadas — authoring

| Cenario | Decisao automatica |
|---|---|
| Ideacao com um unico conceito obviamente melhor por best-practice | IDEATION_SKIPPED (SOFT, decision SKIPPED — registra e segue, sem bloquear) |
| Interrogacao detecta trade-off que so o Board decide | ESCALATION_REQUEST com opcoes pre-formuladas, status=paused |
| Critico aponta finding critical num dos 13 eixos | volta ao step correspondente do Kiro; loop de revisao (bounded) |
| Loop de revisao nao converge no bound | ESCALATION_REQUEST — Board decide selar com ressalvas ou reescopar |
| Falha ao gravar `phase=sealed` no `spec.json` (escrita/verificacao) | SPEC_SEALED NAO emite; status=paused com motivo (sem confirmacao = sem selo) |
| `--amend` sem selo previo | erro (evento SPEC_AMEND_WITHOUT_PRIOR_SEAL); nada a reabrir |

## A5. Definicao de Done — authoring (para no selo)

- [ ] requirements.md em EARS, design.md com ADRs + contracts, tasks.md com traceabilidade?
- [ ] Ideacao registrada (conceito escolhido ou skip justificado)?
- [ ] Interrogacao de design registrada (Q&A arquitetural)?
- [ ] Critica adversarial dos 13 eixos rodada e criticas criticas resolvidas?
- [ ] `spec.json` phase=sealed gravado, com ready_for_implementation derivado + spec_version + sealed_at + ponteiro sealed_spec (SPEC_SEALED CONFIRMED)?
- [ ] Handoff de cada step seguiu os 4 atos (Secao 11 AXIOMS)?
- [ ] NENHUMA implementacao foi feita (authoring para no selo)?

## A6. Anti-padroes proibidos — authoring

❌ Implementar codigo dentro do authoring — ele PARA no selo.
❌ Selar sem rodar o spec-adversarial-critic sobre os documentos.
❌ Pular a interrogacao forcada de design "porque o conceito parece obvio".
❌ Declarar SPEC_SEALED sem ter gravado e verificado `phase=sealed` no `spec.json` (selo falso quebra a confianca do contrato).
❌ Usar `spec-format-gate`/`spec-content-reviewer` (cargos de PROCESSING) dentro do authoring — sao fluxos distintos.
❌ Deixar o proximo step implicito entre as fases do Kiro (viola Secao 11 dos AXIOMS — cadeia morre).

---

# §PROCESSING-LEGACY — SPEC-PROCESSING-WORKFLOW (inalterado)

> **Este fluxo eh o pipeline de spec que existia antes da v8.0.0 e continua INALTERADO.** Ele valida/revisa uma spec que JA existe (e, ao final, o codigo implementado). Entra por `/spec-light`, `/spec-heavy`, `/spec-audit-only` ou `/pipeline --type=Spec`. NAO confunda com o authoring acima.

## P1. Quando este workflow se aplica

| Sinal | Peso |
|---|---|
| Comando eh `/spec-light`, `/spec-heavy`, `/spec-audit-only` ou `/pipeline --type=Spec` | decisivo |
| Issue pede validar/auditar uma spec existente, ou fechar trabalho concluido | forte |
| Os documentos requirements.md/design.md/tasks.md JA EXISTEM e serao avaliados | confirma |

## P2. Cargos envolvidos (processing)

```
1. task-orchestrator
2. information-gate
3. brainstorm-controller          (orquestra 10 steps de brainstorm)
   ├── brainstorm-step-00-intake
   ├── brainstorm-step-01-explore
   ├── brainstorm-step-01b-alternatives
   ├── (step 02-07: spec lifecycle handled by spec-* agents below)
   └── brainstorm-step-08-handoff
4. spec-format-gate               (25 deterministic checks)
5. spec-content-reviewer          (slim 6 axes OR full 12 axes)
6. (executor-* implementam quando spec aprovada — outro workflow)
7. spec-post-impl-validator       (apos implementacao, valida fidelidade)
8. spec-closer                    (PA_DE_CAL + 2 reports + spec.json closed)
```

**Adversarial trio:** roda sobre o codigo implementado, nao sobre a spec em si (fase 2 da implementacao, fora deste workflow).

**TDD:** se aplica na implementacao (outro workflow), nao na producao da spec.

## P3. Fluxo passo-a-passo (processing)

### P3.1 task-orchestrator
Classifica tipo=Spec. Complexity baseada em escopo da spec.

### P3.2 information-gate
BLOCKERS:
- [ ] Objetivo da spec declarado (o que deve cobrir)?
- [ ] Personas/atores identificados?
- [ ] Constraints conhecidos (stack, integracoes, deadline)?

### P3.3 brainstorm-controller (10 steps)

Sequencia rigida (skill `pipeline-orchestrator-spec-protocol` + brainstorm steps):

| Step | Cargo | Saida |
|---|---|---|
| 00-intake | brainstorm-step-00-intake | `00-intake.md` — captura prompt + contexto + arquivos candidatos |
| 01-explore | brainstorm-step-01-explore | `01-explore.md` — 11-lens dynamic exhaustive clarification (NO Paperclip: ESCALATION_REQUEST pra cada gap real) |
| 01b-alternatives | brainstorm-step-01b-alternatives | `01b-alternatives.md` — 2-4 abordagens alternativas |
| 02-spec-init | brainstorm-controller | inicializar `spec.json` com metadata |
| 03-requirements | brainstorm-controller | produzir `requirements.md` em EARS |
| 04-validate-gap | brainstorm-controller | checar gap entre requirements e codebase existente |
| 05-design | brainstorm-controller | produzir `design.md` com arquitetura + ADRs |
| 06-validate-design | brainstorm-controller | review interno do design |
| 07-tasks | brainstorm-controller | produzir `tasks.md` decompondo design em tasks executaveis |
| 08-handoff | brainstorm-controller | finalizar bundle (requirements + design + tasks + spec.json) |

**Step 08-handoff — contrato de handoff explicito (obrigatorio):**

Ao fechar o bundle, o brainstorm-controller executa os 3 atos do MESMO heartbeat (Secao 11 dos AXIOMS):

1. Emite o bloco `### NEXT_STEP v1` nomeando o proximo step (spec-format-gate), o assignee e os `blockedByIssueIds`.
2. Cria a proxima sub-issue (spec-format-gate) via API NESTE heartbeat, com `blockedByIssueIds = [issue atual]`.
3. PATCH do proprio status para `done` SOMENTE depois que o `issueId` da child foi confirmado.

Se qualquer ato falhar (validacao, API), PATCH para `paused` com comment explicando o bloqueio — **NAO** marque `done` e **NAO** deixe o proximo passo implicito.

**Decisao pre-aprovada — gap em step 01-explore:**
Tradicionalmente cada gap viraria GATE_REQUEST sincrono. **No Paperclip:**
- Gap recuperavel via codigo/contexto → cargo resolve sozinho
- Gap real (so Board sabe) → ESCALATION_REQUEST com opcoes pre-formuladas, status=paused, pega proxima task
- Em massa (>3 gaps numa rodada): agrupar em UM ESCALATION_REQUEST com tabela de opcoes

### P3.4 spec-format-gate
Skill obrigatoria: `pipeline-orchestrator-spec-protocol` secao 2.

25 checks deterministicos. Veredicto:
- GO (25/25): segue
- GO_WITH_WARN (23-24/25, no critico): segue com warning
- NO_GO (<23/25 ou critico falhando): status=paused + ESCALATION_REQUEST com lista de checks falhados

**Decisao pre-aprovada:** checks 1, 6, 12, 18, 23 sao criticos. Falha em qualquer um → NO_GO automatico.

### P3.5 spec-content-reviewer
Skill obrigatoria: secao 3.

Modo (slim/full) baseado em variant:
- spec-light → slim (6 axes)
- spec-heavy → full (12 axes)

Veredicto:
- GO: overall_score ≥ 0.8 e nenhum axis critical
- WARN: score 0.6-0.8 ou axis warn
- NO_GO: score <0.6 ou axis critical

NO_GO → status=paused + ESCALATION_REQUEST com lista de recommendations.

### P3.6 (intervalo) — Implementacao acontece em outro workflow (Feature/Bug Fix)

Spec eh aprovada e fica em status=approved no spec.json. Implementacao real acontece em outra issue (com workflow correspondente).

### P3.7 spec-post-impl-validator (apos implementacao terminar)

Skill obrigatoria: secao 5.

6 axes weighted (Requirement Coverage 25%, Test Coverage 20%, ...):
- PASS: weighted_score ≥ 0.85
- PASS_WITH_WARNINGS: 0.7-0.85
- FAIL: <0.7 — HARD GATE, status=paused + ESCALATION_REQUEST

### P3.8 spec-closer
Apos PASS:
- `spec.json` → status=closed
- Calcular spec_grade final (A/B/C/D/F)
- Produzir `technical-report.md` + `executive-report.md`
- Postar `### PA_DE_CAL v1` no ticket-mae

## P4. Decisoes Pre-Aprovadas — Tabela Mestre (processing)

| Cenario | Decisao automatica |
|---|---|
| Step 01-explore detecta gap recuperavel | resolver com Glob/Grep/Read; nao escalar |
| Step 01-explore detecta gap real | ESCALATION_REQUEST com opcoes pre-formuladas |
| Multiplos gaps numa rodada | agrupar em 1 ESCALATION_REQUEST tabular |
| Format gate falha check critico (1,6,12,18,23) | NO_GO + paused |
| Content reviewer score 0.7-0.8 | WARN — segue mas com recomendacoes |
| Conflito entre requirements e codebase ja existente | step 04-validate-gap reporta; brainstorm-controller adapta requirements OU escala |
| Spec exige criar nova interface publica de API | step 05-design ADR explicito; auto-aprovado se segue convencoes do projeto |
| Spec contradiz CLAUDE.md do projeto cliente | ESCALATION_REQUEST |
| Implementacao terminou mas spec-post-impl-validator FAIL | NO_GO hard, criar issue corretiva |

## P5. Definicao de Done (processing)

- [ ] requirements.md em formato EARS, sem TODOs/FIXMEs?
- [ ] design.md com Architecture + Decisions (ADRs) + Contracts?
- [ ] tasks.md com cada task referenciando >= 1 requirement?
- [ ] spec.json em status=closed?
- [ ] Format gate GO (25/25 ou GO_WITH_WARN)?
- [ ] Content reviewer GO ou WARN?
- [ ] Post-impl validator PASS ou PASS_WITH_WARNINGS?
- [ ] spec_grade ≥ C (idealmente A ou B)?
- [ ] 2 reports produzidos?
- [ ] Cada handoff entre fases seguiu os 4 atos da Secao 11 dos AXIOMS?

## P6. Anti-padroes proibidos especificos de Spec (processing)

❌ Pular format gate "porque eh urgente" — sem 25/25 a base estrutural quebra todo o resto.
❌ Aprovar content review com warnings sem comment justificando.
❌ Marcar spec como closed antes de post-impl validator passar.
❌ Editar requirements.md DURANTE implementacao (se mudou, eh nova versao + re-analise — nao retroativo).
❌ EARS pattern mal-aplicado (ex: requisito que nao se encaixa em When/While/If/Where/Ubiquitous).
❌ ADR sem alternative considered (decisao sem trade-off documentado).
❌ Spec sem traceabilidade entre REQ → design → task → test.
❌ Inventar requirement por inferencia sem citar fonte (Iron Law: evidence-based).
❌ Deixar o proximo passo implicito entre fases (viola Secao 11 dos AXIOMS — a cadeia para e nao passa o bastao).

---

## §FINAL — Os dois workflows coexistem

AUTHORING (v8.0.0) e PROCESSING (legado) **coexistem** sob o mesmo nome "Spec" e sao mutuamente exclusivos por comando de entrada. AUTHORING cria e sela uma spec do zero (`spec-controller`, para no selo); PROCESSING valida uma spec existente e fecha o trabalho implementado (`spec-format-gate` / `spec-content-reviewer` / `spec-post-impl-validator` / `spec-closer`). Em duvida, volte ao §0 e roteie pelo comando.
