# Gates Mapping — Claude Code ↔ Paperclip Fase A

**Status:** Draft v1.0 (Onda A1)
**Data:** 2026-05-24
**Fonte canônica:** `references/gates.md` (v7.2.0, 35 portões em 5 seções)
**Destino:** approval types `pip:*` e `pip-spec:*` no Paperclip

> Esta tabela é SSOT para o mapeamento gate → approval type da Fase A.
> Toda implementação nas Ondas A2/A3 deve referenciar este arquivo.

---

## Seção 1 — Portões Principais (18 portões)

| Gate (canonical) | Hardness | Approval Type (Paperclip) | Allowed Decisions | Issue Priority | Status da issue pai |
|---|---|---|---|---|---|
| SSOT_CONFLICT | MANDATORY | pip:ssot-conflict | BLOCKED | critical | blocked |
| ADVERSARIAL_GATE_MANDATORY | MANDATORY | pip:adversarial-gate-mandatory | BLOCKED, APPROVED | critical | blocked até APPROVED |
| INFO_GATE_BLOCKED | HARD | pip:info-gate-blocked | APPROVED, BLOCKED | high | paused até APPROVED |
| TDD_APPROVAL | HARD | pip:tdd-approval | APPROVED, BLOCKED | high | paused até APPROVED |
| PLAN_REJECTED | HARD | pip:plan-rejected | BLOCKED (retorno à Fase 1) | high | blocked |
| COMPLEXITY_GATE | SOFT | pip:complexity-gate | APPROVED, CONFIRMED, SKIPPED | normal | não bloqueia |
| STOP_RULE | CIRCUIT_BREAKER | pip:stop-rule | RESET_A, RESET_B, RESET_C | critical | blocked até escolha |
| FIX_LOOP_EXHAUSTED | CIRCUIT_BREAKER | pip:fix-loop-exhausted | RESET_A, RESET_B, RESET_C | critical | blocked até escolha |
| STALE_CONTEXT | SOFT (HARD se COMPLEXA+sensitive) | pip:stale-context | APPROVED, SKIPPED, REVALIDATE | normal | paused se HARD |
| MICRO_GATE_GAP | HARD | pip:micro-gate-gap | APPROVED, BLOCKED | high | paused até APPROVED |
| CHECKPOINT_FAIL | HARD | pip:checkpoint-fail | APPROVED, BLOCKED | high | blocked até fix |
| ADVERSARIAL_BLOCK | HARD | pip:adversarial-block | APPROVED, FIX_REQUESTED | high | blocked até fix |
| ADVERSARIAL_GATE | SOFT | pip:adversarial-gate | APPROVED, SKIPPED | normal | não bloqueia |
| FINAL_ADVERSARIAL_GATE | SOFT | pip:final-adversarial-gate | APPROVED, SKIPPED | normal | não bloqueia |
| FINAL_ADVERSARIAL_REWORK | HARD | pip:final-adversarial-rework | FIX_BATCH, PROCEED, DISCARD | high | blocked até escolha |
| CLOSEOUT_CONFIRM | SOFT | pip:closeout-confirm | CONFIRMED, DISCARDED | normal | não bloqueia |
| STATE_FILE_INIT_FAIL | CIRCUIT_BREAKER | pip:state-file-init-fail | RESET (re-invocar) | critical | blocked |
| PROTOCOL_HANDSHAKE_TIMEOUT | HARD | pip:protocol-handshake-timeout | RESET (re-invocar), CLEARED | high | blocked até resolução |

---

## Seção 2 — Portões do Ciclo Spec (6 portões)

| Gate (canonical) | Hardness | Approval Type (Paperclip) | Allowed Decisions | Trigger |
|---|---|---|---|---|
| SPEC_ARTIFACT_MISSING | MANDATORY | pip-spec:artifact-missing | BLOCKED | artefato ausente em spec detectada |
| SPEC_FORMAT_GATE_FAIL | HARD | pip-spec:format-gate-fail | EDIT, BYPASS_JUSTIFIED, ABORT | < 22/25 checks de formato |
| SPEC_CONTENT_REVIEW_NOGO | HARD | pip-spec:content-review-nogo | EDIT, BYPASS_JUSTIFIED, ABORT | ≥1 finding crítico no conteúdo |
| SPEC_AC_TRACEABILITY_GAP | HARD | pip-spec:ac-traceability-gap | ADD_MANUALLY, RE_EXTRACT, MARK_NON_TESTABLE | < 100% ACs cobertos |
| SPEC_POST_IMPL_FAIL | HARD | pip-spec:post-impl-fail | NEW_FIX_BATCH, ACCEPT_WARNINGS, ABORT | score < 75% pós-impl |
| ADVERSARIAL_LOOP_CHECKPOINT | SOFT (com escalação) | pip-spec:adversarial-loop-checkpoint | CONTINUE, ESCALATE_HEAVY, ACCEPT_WARNINGS, ABORT | 3 loops sem CLEAN |

---

## Seção 3 — Portões de Routing (4 portões)

| Gate (canonical) | Hardness | Approval Type (Paperclip) | Nota |
|---|---|---|---|
| STEP_1_7_ROUTING | HARD | pip:step-1-7-routing | Informacional — log da decisão de routing |
| STEP_1_7_RECURSION_GUARD | CIRCUIT_BREAKER | pip:step-1-7-recursion-guard | STEP 1.7 entrou ≥3 vezes |
| STOP_BEFORE_PA_DE_CAL | HARD | pip:stop-before-pa-de-cal | verify-completion retornou FAIL |
| STRICT_SPEC_REJECTION | AUDIT | (apenas comment `### AUDIT_EVENT v1`) | Informacional — sem approval issue |

---

## Seção 4 — Portões de Clarificação do Brainstorm (7 portões)

| Gate (canonical) | Hardness | Approval Type (Paperclip) | Nota |
|---|---|---|---|
| CLARIFICATION_GAPS_DETECTED | AUDIT | (apenas comment `### AUDIT_EVENT v1`) | Informacional |
| CLARIFICATION_RESOLVED | HARD | pip:clarification-resolved | Resposta do Board a gap de clarificação |
| CLARIFICATION_SKIPPED | SOFT | pip:clarification-skipped | Lens já coberta no intake |
| ALTERNATIVES_PROPOSED | AUDIT | (apenas comment `### AUDIT_EVENT v1`) | Informacional |
| ALTERNATIVE_CHOSEN | SOFT | pip:alternative-chosen | Board escolheu abordagem |
| ALTERNATIVES_SKIPPED | SOFT | pip:alternatives-skipped | Auto-skip em tarefa mecânica SIMPLES |
| STEP_01_GAP_LEAKED | SOFT | pip:step-01-gap-leaked | Gap detectado tardiamente no step-01b |

---

## Resumo

| Seção | Portões | MANDATORY | HARD | CIRCUIT_BREAKER | SOFT | AUDIT |
|---|---|---|---|---|---|---|
| Principais | 18 | 2 | 8 | 3 | 4 | 1 |
| Spec | 6 | 1 | 4 | 0 | 1 | 0 |
| Routing | 4 | 0 | 2 | 1 | 0 | 1 |
| Brainstorm | 7 | 0 | 1 | 0 | 3 | 3 |
| **TOTAL** | **35** | **3** | **15** | **4** | **8** | **5** |

> **Nota:** Os portões AUDIT (5 no total) não geram approval issue — apenas um comment estruturado `### AUDIT_EVENT v1` na issue pai. O `STRICT_SPEC_REJECTION` da seção routing também é AUDIT.

---

## Regras de implementação

1. Todo approval type `pip:*` ou `pip-spec:*` deve ter payload JSON com pelo menos: `{gate_name, hardness, decision, evidence, timestamp, decided_by, gate_registry_version}`
2. Portões MANDATORY nunca têm `decision: "SKIPPED"` — validação obrigatória na `lib/paperclip-gate-registry.cjs`
3. Portões CIRCUIT_BREAKER sempre apresentam 3 opções de reset ao Board
4. Portões AUDIT nunca criam approval issue — apenas comment estruturado
5. `gate_registry_version: "canonical-v7.2.0"` em todas as entries desta onda

---

## Scoped Wake Applicability (auditoria KB+skills v1.1)

Quando approval issue de um portão é resolvida pelo Board, o cargo correspondente pode pular passos 1-4 do heartbeat padrão e ir direto pra execução (scoped wake — ver A2-design.md §2.3.1). Portões que requerem re-classificação de contexto NÃO permitem scoped wake.

| Gate | Scoped Wake Applicable? | Rationale |
|---|---|---|
| INFO_GATE_BLOCKED | Sim | Board responde gap; cargo continua com info nova |
| TDD_APPROVAL | Sim | Cenários aprovados; pre-tester continua direto |
| PLAN_REJECTED | Não | Volta pra Phase 1 — requer re-classificação |
| ADVERSARIAL_GATE | Sim | Decisão yes/skip aplicada direto |
| ADVERSARIAL_BLOCK | Não | Findings exigem novo batch — fix loop muda contexto |
| FIX_LOOP_EXHAUSTED | Não | Reset escolhido muda fase — full heartbeat |
| FINAL_ADVERSARIAL_GATE | Sim | yes/skip aplicado direto |
| FINAL_ADVERSARIAL_REWORK | Não | Opção A/B/C muda fase ativa |
| CLOSEOUT_CONFIRM | Sim | Confirmação binária aplicada direto |
| COMPLEXITY_GATE | Não | Override muda classificação inteira |
| STALE_CONTEXT | Não | Por definição: contexto stale → revalidar Phase 0 |
| SSOT_CONFLICT | Não | Resolução pode mudar todo o escopo |
| STOP_RULE | Não | Reset escolhido muda fase |
| MICRO_GATE_GAP | Sim | Gap respondido; cargo continua |
| CHECKPOINT_FAIL | Sim | Auto-retorno ao executor, sem decisão humana |
| STATE_FILE_INIT_FAIL | Não | Falha de IO — full restart |
| PROTOCOL_HANDSHAKE_TIMEOUT | Não | Stale — requer revalidação |
| (Spec gates SPEC_*) | Sim/Não conforme natureza | Ver tabela §3 ou inferir do hardness |

**Regra de inferência rápida:** se hardness é CIRCUIT_BREAKER OR a recovery action requer voltar fase, NÃO é scoped. Se hardness é HARD/SOFT com resolução binária ou única-opção, É scoped.

Fonte: paperclip-kb.md §11 (Scoped Wake spec).

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-05-24 | Criado em Onda A1 — mapeamento completo 35 gates canonical → approval types Paperclip |
| v1.1 | 2026-05-24 | Auditoria KB+skills adicionou seção "Scoped Wake Applicability" mapeando quais portões permitem otimização de heartbeat (KB §11). |
