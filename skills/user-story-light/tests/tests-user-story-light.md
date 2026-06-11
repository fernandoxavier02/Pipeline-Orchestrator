# Test Strategy — User Story Light (10 prescriptive steps)

> **Note:** User Story pipelines are **code-changing**. The "tests" below combine golden-run / contract tests that validate the *workflow* with the original Pulsar translation guidelines (preserved verbatim) that govern how a lay narrative becomes verifiable acceptance criteria.

## Source ancestry

Ported 1:1 from `D:\Projeto Pulsar\.claude\commands\Prompts\User_story_translated\Light\TESTS_USER_STORY_LIGHT.md`. The translation guidelines below are preserved verbatim; the contract-layer assertions are added for the imported skill.

## Contract layer — what gets tested

| Layer | What we test | How |
|-------|--------------|-----|
| Frontmatter contract | Each `steps/0X-*.md` declares all required fields incl. `execution_mode`, `agent_type`, `expected_inputs/outputs`, `expected_next`, `gate_required`. | Static parser walks all 10 step files. |
| Sequence lock | Steps execute strictly 1→2→3→4→5→6→7→8→9→10. | Golden run; audit log shows linear transitions. |
| TDD gate (step 6) | Acceptance-criteria tests are created and FAIL (RED) before step 7. Step 7's GATE refuses to run without a step-6 artifact whose AC tests are RED. | Golden run; step-7 hard gate. |
| Adversarial gate (step 8) | AskUserQuestion invoked to approve the review; fix loop max 3. | Hook event capture. |
| Pa de Cal gate (step 10) | AskUserQuestion `GO/NO-GO` invoked. | Golden runs across fixture types. |
| AskUserQuestion gates | Steps 6, 8, 10 invoke AskUserQuestion (no prose substitute). | Hook event capture. |
| Sentinel checkpoints | Sentinel state validates before steps 6, 8, 10 (`pre_6`, `pre_8`, `pre_10`). | `sentinel-hook` events. |
| STOP RULE | 2 consecutive failures halt the pipeline. | Inject failure; expect halt. |
| Output schema | Each step's `expected_outputs` is well-typed and chains to the next step's `expected_inputs`. | Schema check on JSON deliverables. |
| 1:1 fidelity | Each step body preserves the Pulsar LIGHT_0N prompt text verbatim. | Diff against ancestor. |

## Per-step contract assertions (Light)

- **Step 1 — IntakeNLP** JSON present with `user_story`, `expected`, `observed`, `unknowns`; 3 testable hypotheses proposed.
- **Step 2 — ReproPlan** JSON present with `repro_steps`, `variations`, `expected_signals`, `failure_signals`, `fast_checks`; symptom-vs-cause guidance included.
- **Step 3 — RootCauseMatrix** JSON present with per-hypothesis layer + confirm/refute evidence; cascade-effect concept addressed.
- **Step 4 — DomainSSOT** JSON present with `domain_entities`, `business_rules_suspected`, `ssot_candidates`, `what_must_not_change`.
- **Step 5 — ActionPlan** JSON present with `minimal_change_strategy`, `regression_risks`, `guardrails`, `rollback_plan`.
- **Step 6 — Tests** each AC has a test; AC tests FAIL now; regression passes now; TDD AskUserQuestion invoked.
- **Step 7 — ImplementationReport** JSON present with `files_changed`, `rationale`, `tests_run`, `risk_notes`; minimal-diff + non-invention respected.
- **Step 8 — AdversarialReview** JSON present with `attack_scenarios`, `likely_regressions`, `must_fix_before_merge`; adversarial AskUserQuestion invoked.
- **Step 9 — SanityCheck** JSON present with `smoke_test_user`, `smoke_test_tech`, `pass_fail_signals`, `monitoring_notes`.
- **Step 10 — FinalSeal** JSON present with `acceptance_criteria_status`, `regression_status`, `contract_status`, `rollback_ready`, `release_notes`; `go_no_go` ∈ `{GO, CONDITIONAL, NO-GO}`; Pa de Cal AskUserQuestion invoked.

## Anti-tests

- No implementation before step-6 RED tests (TDD gate).
- No skip / reorder (sequence_lock).
- No prose substitute for AskUserQuestion at steps 6, 8, 10.
- No assumed values (non-invention rule in step 7).
- No GO at step 10 when an acceptance criterion cannot be proven (must declare explicitly).

---

## Pulsar translation guidelines — Nível Light (preserved verbatim)

Esta diretriz orienta como transformar uma narrativa em linguagem natural, fornecida por um usuário final (não técnico), em critérios técnicos claros e verificáveis. O objetivo é garantir que a interpretação da história de usuário para requisitos de software esteja correta e completa, utilizando testes como mecanismo de validação.

### 1. Entendimento inicial e validação

1. **Ler e resumir a história**: leia a user story original e escreva um resumo em linguagem técnica simples. Identifique atores, intenções e restrições implícitas.
2. **Identificar lacunas**: anote quaisquer ambiguidades ou detalhes ausentes (ex.: formatos de dados, limites, mensagens de erro). Faça perguntas objetivas ao solicitante ou use a pipeline de *diagnóstico* para obter clareza.
3. **Confirmar entendimento**: apresente o resumo ao solicitante (ou represente o usuário) e valide que a interpretação corresponde à intenção original.

### 2. Definir critérios de aceitação em linguagem de negócio

1. **Escrever cenários de aceitação**: utilize o formato *Dado/Quando/Então* para cada comportamento esperado. Por exemplo:
   - *Dado* que o usuário não fez check‑in hoje,
   - *Quando* ele fizer check‑in informando emoção “triste”,
   - *Então* o sistema deve registrar o evento e aumentar o contador de check‑ins do dia.
2. **Cobrir casos alternativos**: inclua cenários para entradas inválidas, permissões insuficientes ou dependências indisponíveis. Cada cenário deve ter resultado previsível.
3. **Priorizar critérios**: marque os critérios essenciais (que precisam ser implementados primeiro) e os desejáveis (que podem ser incrementais).

### 3. Traduzir critérios em testes automatizados

1. **Escolher o nível adequado**: para user stories simples, testes de aceitação podem ser implementados como testes de API ou de camada de aplicação; para fluxos que incluem UI, planeje testes de interface.
2. **Criar esboço de teste**: para cada critério de aceitação, descreva em pseudo‑código ou em notação Gherkin o passo a passo do teste. Use nomes autoexplicativos (ex.: `Cenario: registrar check-in com sucesso`).
3. **Reutilizar componentes**: identifique funções, páginas ou endpoints existentes que podem ser usados para implementar o critério. Se nenhum componente existir, registre a necessidade de criação no backlog.

### 4. Validar abrangência da tradução

1. **Cobertura funcional**: verifique se todos os requisitos explícitos e implícitos da história estão representados nos critérios de aceitação. Use checklists ou diagramas para garantir que nenhuma parte foi esquecida.
2. **Garantir não adição de escopo**: assegure que os critérios não extrapolem o pedido original. Se um critério introduzir funcionalidade não solicitada, questione sua relevância ou remova‑o.
3. **Revisão cruzada**: peça para outro membro da equipe revisar a tradução e os critérios, validando clareza e completude.

### 5. Registrar artefatos e planejar implementação

1. **Documentar critérios**: armazene os cenários em arquivos de especificação (`*.feature` para Gherkin ou Markdown) no repositório. Isso servirá de contrato entre time de produto e desenvolvimento.
2. **Criar tarefas técnicas**: para cada critério, abra histórias técnicas ou *tickets* no sistema de gerenciamento, detalhando implementação, testes automatizados necessários e dependências.
3. **Planejar testes antes da codificação**: antes de iniciar a implementação, prepare os testes automatizados correspondentes (mesmo que falhem inicialmente). Isso garante que a tradução esteja alinhada à prática de TDD.

### 6. Saída esperada

- Um conjunto claro de critérios de aceitação derivados da user story.
- Perguntas de esclarecimento respondidas ou documentadas para consultas futuras.
- Testes de aceitação em pseudo‑código ou Gherkin prontos para serem automatizados.
- Tarefas técnicas criadas para cada critério, alinhadas ao backlog do projeto.

Seguindo estas diretrizes, a equipe assegura que a linguagem do usuário final é corretamente interpretada em termos técnicos e que a implementação posterior atenderá exatamente às expectativas do usuário.
