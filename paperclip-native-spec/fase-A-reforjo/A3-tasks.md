# A3 — Tasks da Fase A (Reforjo)

**Status:** Draft v1.1 — adversarial review concluído (2026-05-24) + CALIBRADO pós-execuções (2026-06-01, ver A0-CALIBRACAO-pos-execucoes-2026-06-01.md)
**Data:** 2026-05-24
**Depende de:** A1-requirements.md, A2-design.md v1.0
**Metodologia:** TDD-first por onda, ATDD com critérios rastreados ao design, adversarial review por bloco crítico, regressão promovida ao fechamento de cada onda

> ⚠️ **CALIBRADO PÓS-EXECUÇÕES — ver `A0-CALIBRACAO-pos-execucoes-2026-06-01.md`.** O spike T-A2-01 (abaixo) provou que o campo `executionState` está morto; onde tarefas o citam como substrato de estado, leia comentários `PIPELINE_STATE` (A0 §3). T-A2-02 passa a criar a lib de **comentários** estruturados, não de `executionState`. As menções no T-A2-01 e na tabela de risco são históricas e permanecem.

---

## Critérios de aceitação deste documento (ATDD — antes da escrita)

```gherkin
Feature: A3-tasks define a sequência de trabalho verificável para a Fase A

  Scenario: Três ondas bem definidas
    Given a Fase A tem escopo de 3 ondas
    When eu leio A3-tasks.md
    Then encontro Onda A1 (doc), Onda A2 (PoC) e Onda A3 (rollout) com objetivos distintos
    And cada onda tem Definition of Done com critérios binários

  Scenario: Zero código na Onda A1
    Given a HC3-A proíbe código JS em Onda A1
    When eu leio as tasks da Onda A1
    Then não encontro nenhuma task que crie arquivo .js, .cjs, .ts ou .mjs

  Scenario: Adversarial loop documentado por onda
    Given o Princípio 2 exige adversarial review antes de commitar
    When eu leio A3-tasks.md
    Then cada onda crítica tem etapa explícita de adversarial review com max 3 tentativas/finding
```

---

## Estrutura de Ondas

A Fase A é dividida em 3 ondas sequenciais. Cada onda só começa após DoD da onda anterior estar 100% verde.

---

## ONDA A1 — Spec Documental

**Objetivo:** Documentar o programa completo antes de qualquer mudança em código ou configuração.
**Duração:** 1 semana (esta onda — em execução agora)
**Iron Law:** Zero código JS, zero mudança em `~/.paperclip/instances/`, zero mudança no plugin canônico.

### Tasks da Onda A1

**T-A1-01: Criar estrutura de pastas**
- Criar `fase-A-reforjo/`, `fase-A-reforjo/tables/`, `fase-B-nativo/`, `decisions/`
- Critério: `ls paperclip-native-spec/` mostra as 4 pastas
- Status: DONE (executado em BATCH 1)

**T-A1-02: Criar docs umbrella (4 documentos)**
- 00-VISION.md (600-800 palavras)
- 00-GLOSSARIO.md (termos compartilhados Fase A/B)
- 00-PRINCIPIOS-COMUNS.md (9 princípios inquebrável)
- 00-ROADMAP.md (sequência A → B com gate de decisão)
- Critério: cada doc tem seção de histórico com v1.0 datado e conteúdo conforme spec
- Status: DONE (executado em BATCH 1)

**T-A1-03: Mover docs da Fase B e criar B0**
- Mover 01-requirements.md → fase-B-nativo/B1-requirements.md
- Mover 02-design.md → fase-B-nativo/B2-design.md
- Mover 03-tasks.md → fase-B-nativo/B3-tasks.md
- Criar fase-B-nativo/B0-relationship-with-fase-A.md
- Critério: `wc -l fase-B-nativo/B1-requirements.md` mostra conteúdo idêntico ao original
- Status: DONE (executado em BATCH 2)

**T-A1-04: Criar A1-requirements.md**
- 8 capacidades (C1-A a C8-A) com critérios ATDD
- 6 restrições duras (HC1-A a HC6-A)
- Referências canônicas listadas
- Critério: todas as 8 capacidades têm critério Given/When/Then; todas as 6 HCs são verificáveis binariamente
- Status: DONE (executado em BATCH 3)

**T-A1-05: Criar A2-design.md (bloco crítico)**
- Arquitetura de Gate Enforcement (3 bounded contexts)
- 62 decision points catalogados
- Gap inventory (14 lentes)
- Decision log (≥6 entries)
- Adversarial review loop 1
- Critério: adversarial review com veredicto APPROVED ou CONDITIONAL APPROVED documentado
- Status: DONE (executado em BATCH 4 + ADVERSARIAL LOOP 1)

**T-A1-06: Criar A3-tasks.md (este documento) — bloco crítico**
- 3 ondas com tasks, critérios de aceitação e DoD
- Adversarial review loop 2
- Critério: adversarial review com veredicto APPROVED ou CONDITIONAL APPROVED documentado
- Status: EM EXECUÇÃO (BATCH 5)

**T-A1-07: Criar A4-validation.md**
- Cenários de teste E2E por variant (6 × 2-3 cenários)
- Thresholds de parity_score
- Procedimento de medição
- Critério: 6 variants cobertos com ≥2 cenários each
- Status: PENDING (BATCH 6)

**T-A1-08: Criar 4 tabelas de mapping**
- gates-mapping.md (35 gates CC ↔ approval types PC)
- hooks-mapping.md (12 hooks CC ↔ enforcement PC)
- agents-mapping.md (47 agentes CC ↔ 48 cargos PC)
- variant-catalog.md (6 variants × fases × gates)
- Critério: tabelas preenchidas com dados reais das fontes canônicas (não estimativas)
- Status: PENDING (BATCH 7)

**T-A1-09: Criar 3 ADRs**
- ADR-001-merge-strategy.md
- ADR-002-codex-as-primary-llm.md
- ADR-003-reforjar-antes-de-nativo.md
- Critério: cada ADR tem contexto, alternativas, escolha, justificativa, consequências
- Status: PENDING (BATCH 8)

**T-A1-10: Verificação final da Onda A1**
- `git status D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/` → zero modificações
- `ls paperclip-native-spec/**` → estrutura completa conforme layout do plano
- Conteúdo de cada doc verificado contra critérios de aceitação
- Status: PENDING (CLOSEOUT)

### Definition of Done — Onda A1

- [ ] T-A1-01 a T-A1-10 com status DONE
- [ ] Adversarial review em A2 com veredicto registrado
- [ ] Adversarial review em A3 com veredicto registrado
- [ ] Iron Law verificada: `git status Pipeline-Orchestrator/` limpo
- [ ] Nenhum arquivo `.js`, `.cjs`, `.ts`, `.mjs` criado em paperclip-native-spec/
- [ ] Todos os docs têm seção de histórico com v1.0 e data

---

## ONDA A2 — Proof of Concept

**Objetivo:** Validar a arquitetura do A2-design.md em um cargo real antes do rollout completo.
**Duração:** 1-2 semanas
**Cargo piloto:** information-gate (Business Analyst / Requirements Clarifier)
**Gate de entrada:** Onda A1 com DoD 100% verde + Board approval

### Pré-condições para início

```gherkin
Given a Onda A1 está completa
When o Board aprova início da Onda A2
Then a primeira task pode começar
And a seguinte versão do executionState schema deve estar documentada: fase-a-v1.0
```

### Tasks da Onda A2

**T-A2-01: Spike de validação do executionState** (enriquecido v1.1 com sub-steps por auditoria KB)

Sub-steps obrigatórios:

- **T-A2-01-a:** Criar issue teste com executionState vazio `{}`. Validar que `POST /api/issues` aceita o field sem erro. Esperado: HTTP 200 + issue criada com executionState=`{}`. Se falhar: o Paperclip não aceita o campo extensível conforme assumido — abrir GATE_REQUEST pro Board e considerar fallback (sub-issue dedicada).

- **T-A2-01-b:** Fazer PATCH no executionState contendo 1 gate_decision entry conforme schema da Fase A (A2-design.md §2.4). Validar que o JSON parse retorna a estrutura completa em GET subsequente. Esperado: round-trip íntegro, todos os campos preservados, sem truncamento.

- **T-A2-01-c:** Fazer 2+ PATCHes consecutivos adicionando gate_decisions. Validar que `hash_chain_head.value` é atualizado a cada PATCH, que `previous_hash` aponta corretamente pra entry anterior, e que `crc32_verification` não tem gaps. Calcular hash de fora (Node `crypto`) e comparar com servidor — devem bater. Se divergirem: bug no algoritmo da hash chain ou serialização não-determinística — escalation HIGH.

- **T-A2-01-d:** Simular clock-skew enviando entry com `timestamp` = `now + 90s` (90 segundos no futuro). Validar que a tolerância `clock_skew_tolerance_seconds=60` REJEITA o entry com warning. Esperado: warning visível no comment + entry NÃO incluída na hash chain. Se aceitar silenciosamente: vulnerabilidade — defense-against-tampering quebrada.

- **T-A2-01-e:** Testar scoped wake (A2-design.md §2.3.1). Criar approval issue de INFO_GATE_BLOCKED, resolver pelo Board, e verificar que `PAPERCLIP_WAKE_PAYLOAD` chega ao cargo com `trigger_kind="approval_resolved"`. Medir tempo de wake vs full heartbeat. Esperado: scoped wake ≥40% mais rápido.

Critério geral: TODOS os 5 sub-steps PASS sem API errors ou comportamento inesperado. Se qualquer fail: escalation pro Board + spike estendido (T-A2-01-x novo) ou re-design parcial do A2-design.md.

DoD: relatório de spike escrito em `paperclip-native-spec/.pipeline/docs/spikes/T-A2-01-report.md` com (a) resultado de cada sub-step a-e, (b) métricas medidas (tamanho max executionState, atomicidade, tempo wake), (c) findings a aplicar em A2-design.md antes de T-A2-02 começar. Board aprova relatório antes de prosseguir.

Fonte dos sub-steps: auditoria KB+skills 2026-05-24 (enriquecimento C7 priorizado P1).

**T-A2-02: Criar lib/paperclip-execution-state.cjs (primeiro JS da Fase A)**
- Funções: `readState(issueId)`, `writeGateDecision(issueId, gateDecision)`, `verifyHashChain(issueId)`, `initState(issueId, variant)`
- Hash chain SHA-256 conforme spec em A2-design.md §DL-006
- TDD obrigatório: testes unitários ANTES do código de produção (RED primeiro)
- Critério: 100% dos testes passando; hash chain verificada em round-trip read/write
- DoD: testes verdes + adversarial review por diff desta lib

**T-A2-03: Criar 10 approval types para portões do information-gate**
- Portões relevantes: INFO_GATE_BLOCKED, MICRO_GATE_GAP, COMPLEXITY_GATE, SSOT_CONFLICT, STATE_FILE_INIT_FAIL
- + portões brainstorm: CLARIFICATION_GAPS_DETECTED, CLARIFICATION_RESOLVED, CLARIFICATION_SKIPPED, ALTERNATIVES_PROPOSED, ALTERNATIVE_CHOSEN
- Criar template de payload para cada approval type
- Critério: 10 approval types documentados com schema completo; nomes seguem convenção pip:*
- DoD: Board aprova a lista de approval types antes do rollout no cargo piloto

**T-A2-04: Atualizar AGENTS.md do information-gate**
- Adicionar INVARIANTS block conforme template em A2-design.md §3.1
- Mapear DPs relevantes (DP-01 a DP-09 de Triagem + DP-06 específico)
- Adicionar referência aos 10 approval types do T-A2-03
- Critério: AGENTS.md começa com INVARIANTS v1 block antes de qualquer instrução; block é < 50 linhas
- DoD: adversarial review do AGENTS.md modificado (verificar que não quebra o workflow existente)

**T-A2-05: Smoke test end-to-end bugfix-light com information-gate reforçado**
- Criar issue de bugfix-light real (não simulado)
- Executar com information-gate reforçado ativo
- Verificar que os 6 portões esperados são disparados e registrados no executionState
- Calcular parity_score para este cenário
- Critério: parity_score ≥ 0.90 para o cenário bugfix-light com information-gate
- DoD: Board aprova resultado do smoke test

**T-A2-06: Verificação de regressão**
- Rodar smoke test de bugfix-light SEM o reforço (usando cargo information-gate original em outra issue)
- Verificar que o comportamento original não foi alterado
- Critério: resultados idênticos entre cargo reforçado e original para as partes que não envolvem os novos portões
- DoD: relatório de comparação aprovado pelo Board

**T-A2-07: Adversarial review da Onda A2**
- Trio adversarial (segurança, arquitetura, qualidade) revisa:
  - lib/paperclip-execution-state.cjs (código)
  - AGENTS.md do information-gate (arquivo modificado)
  - Resultado do smoke test
- Critério: todos os findings CRITICAL e HIGH resolvidos antes do DoD
- DoD: veredicto APPROVED ou CONDITIONAL APPROVED do trio adversarial

### Definition of Done — Onda A2

- [ ] T-A2-01 a T-A2-07 com status DONE
- [ ] parity_score ≥ 0.90 para information-gate no cenário bugfix-light
- [ ] Adversarial review com veredicto documentado
- [ ] Regressão verificada: behavior do information-gate original inalterado
- [ ] Iron Law verificada: subdir aditivo apenas em `references/paperclip/spec/`
- [ ] Board aprovou resultado do smoke test (T-A2-05 DoD)

---

## ONDA A3 — Rollout Completo

**Objetivo:** Aplicar o padrão validado na Onda A2 para todos os 48 cargos e adicionar drift detection.
**Duração:** 3-4 semanas
**Gate de entrada:** Onda A2 com parity_score ≥ 0.90 + Board approval

### Estratégia de Rollout

**Ordem de rollout por categoria (do menos para o mais crítico em produção):**

1. Cargos de auditoria e revisão (read-only por Iron Law — menor risco):
   - audit-intake, audit-domain-analyzer, audit-compliance-checker, audit-risk-matrix-generator
   - adversarial-security-scanner, adversarial-architecture-critic, adversarial-quality-reviewer

2. Cargos de brainstorm e exploração:
   - brainstorm-step-00-intake, brainstorm-step-01-explore, brainstorm-step-01b-alternatives

3. Cargos de planejamento e qualidade:
   - plan-architect, design-interrogator, quality-gate-router, pre-tester
   - architecture-reviewer, diff-discipline-reviewer, review-orchestrator, final-adversarial-orchestrator

4. Cargos de execução (maior impacto operacional):
   - executor-implementer-task, executor-spec-reviewer, executor-quality-reviewer, executor-fix
   - feature-implementer, feature-vertical-slice-planner, feature-integration-validator
   - bugfix-diagnostic-agent, bugfix-root-cause-analyzer, bugfix-regression-tester

5. Cargos de controle (mais críticos — últimos):
   - executor-controller, pipeline-controller, brainstorm-controller
   - task-orchestrator, information-gate (já reforçado em A2 — validar regressão)
   - sentinel, checkpoint-validator, sanity-checker, final-validator, finishing-branch, spec-closer

6. Cargos UX:
   - ux-simulator, ux-accessibility-auditor, ux-qa-validator

7. Cargos de tipo específico:
   - adversarial-review-coordinator
   - spec-format-gate, spec-content-reviewer, spec-post-impl-validator

**Regra de rollout:** cargos com tasks em status `in_progress` ou `blocked` NÃO são atualizados até ficarem em `todo` ou `done`.

### Tasks da Onda A3

**T-A3-00: Configurar adapterConfig de todos os cargos com timeout explícito (resolve I2)**

Antes do rollout dos AGENTS.md modificados, garantir que TODOS os 48 cargos tem `adapterConfig.timeoutSec` e `adapterConfig.graceSec` explicitamente configurados conforme KB §3.1:

- `adapterConfig.timeoutSec = 900` (15 minutos por heartbeat — default da KB)
- `adapterConfig.graceSec = 20` (grace period para passo 9 de saída garantida)
- Validar via `npx paperclipai agent list -C <COMPANY_ID> --json | jq '.[] | select(.adapterConfig.timeoutSec == null)'` — esperado: array vazio
- Para cargos sem config: PATCH /api/agents/{id} com adapterConfig merge preservando outros campos (cwd, model, command, instructionsFilePath)

Critério: 48/48 cargos com timeoutSec e graceSec explícitos.
DoD: query JSON retorna 48 cargos com config explícita; smoke test em 1 cargo confirma que timeout é respeitado.

Também criar `~/.paperclip/instances/default/board/AGENTS.md` conforme template em A2-design.md §2.7 DL-010a — Board persona explícita.

**T-A3-01: Backup dos 48 AGENTS.md originais**
- Criar `references/paperclip/spec/backup-agents-md/` com cópia de cada AGENTS.md antes de modificar
- Critério: todos os 48 arquivos copiados; hash SHA-256 de cada original registrada em `backup-manifest.json`
- **Falha do backup (Finding S1):** Se o backup falhar ou a verificação de hash falhar → STOP CONDITION. Não prosseguir com nenhuma task de rollout. Criar approval issue para o Board decidir: (a) investigar e resolver, (b) executar backup manualmente, (c) abortar a Onda A3.
- DoD: backup verificado (hash conferida) antes de qualquer modificação

**T-A3-02: Criar libs JavaScript adicionais (3 libs)**
- `lib/paperclip-gate-registry.cjs` — lookup de portões e validação de decision vs allowed_decisions
- `lib/paperclip-sentinel.cjs` — detecção de drift via activity log diff (depende de `paperclip-execution-state.cjs` da Onda A2)
- `lib/paperclip-audit-trail.cjs` — gravação de trilha de auditoria + verificação de hash chain (depende de `paperclip-execution-state.cjs` e `paperclip-gate-registry.cjs`)
- **Ordem de desenvolvimento (Finding A2):** (1) `paperclip-gate-registry.cjs` primeiro (sem dependências), (2) `paperclip-audit-trail.cjs` segundo (depende de 1 + A2), (3) `paperclip-sentinel.cjs` terceiro (depende de 1 + 2)
- **Contrato TDD por lib (Finding Q1):** Para cada lib: (a) escrever todos os testes unitários (RED phase — devem falhar), (b) implementar a lib até testes passarem (GREEN phase), (c) refatorar sem quebrar testes (REFACTOR phase). Edge cases mínimos obrigatórios por lib: decisão inválida para MANDATORY, tampering detection (hash chain quebrada), drift detectado, drift não detectado (verdadeiro negativo)
- Critério: 100% dos testes unitários passando; cada lib tem ≥4 edge cases cobertos
- DoD: adversarial review das 3 libs antes de usar em rollout

**T-A3-03 a T-A3-09: Rollout por categoria (7 batches)**
- Cada batch cobre uma categoria da estratégia de rollout acima
- Cada batch: atualizar AGENTS.md dos cargos da categoria → smoke test dos workflows afetados → adversarial review do batch → Board approval antes do próximo batch
- Critério por batch: parity_score ≥ 0.90 para os cargos do batch; regressão confirmada
- DoD por batch: Board aprova antes do próximo batch começar
- **Política de reversão (Finding A1):** Se um batch falhar (parity_score < 0.90 ou adversarial review emite NO-GO):
  - Reverter os AGENTS.md do batch usando as hashes do `backup-manifest.json` (T-A3-01)
  - Batches anteriores (já aprovados pelo Board) NÃO são revertidos automaticamente — a reversão é cirúrgica para o batch com falha
  - Criar approval issue para o Board decidir: (a) investigar causa raiz e re-tentar, (b) pular cargo problemático e continuar rollout, (c) reverter todos os batches e reprojetar

**T-A3-10: Configurar sentinel-agent como cron**
- Cargo designado (`sentinel` / Compliance Officer) configurado para rodar a cada N horas
- Lê activity log de todas as issues ativas e compara com executionState esperado
- Gera alerta quando detecta drift
- Critério: drift simulado (cargo executa ação sem approval) → sentinel detecta em ≤1 ciclo
- DoD: Board aprova configuração do cron e resultado do teste de drift

**T-A3-11: Cenários de teste E2E para 6 variants × 2-3 cenários**
- Executar cada cenário definido em A4-validation.md
- Registrar parity_score por cenário
- Critério: parity_score ≥ 0.95 em todos os cenários
- DoD: Board aprova relatório de paridade final

**T-A3-12: Adversarial review final da Onda A3**
- Trio adversarial revisa: todas as libs criadas, amostra de 10 AGENTS.md modificados, configuração do sentinel, resultado dos testes E2E
- Critério: todos os findings CRITICAL e HIGH resolvidos
- DoD: veredicto APPROVED ou CONDITIONAL APPROVED do trio adversarial

**T-A3-13: Gate de Decisão A → B**
- Calcular os 5 critérios do gate (ver 00-ROADMAP.md §Gate de Decisão A → B)
- Apresentar ao Board
- Board decide: GO (inicia Fase B) / NO-GO (Fase A como solução definitiva) / CONDICIONAL
- Critério: decisão documentada em ADR com justificativa
- DoD: decisão do Board registrada

### Definition of Done — Onda A3

- [ ] T-A3-01 a T-A3-13 com status DONE
- [ ] parity_score ≥ 0.95 em todos os 6 variants × todos os cenários de A4-validation.md
- [ ] Drift detection ativa e testada
- [ ] Adversarial review final com veredicto documentado
- [ ] Iron Law verificada: apenas `references/paperclip/spec/` modificado no subdir canônico
- [ ] Gate de Decisão A → B documentado com decisão do Board
- [ ] Backup dos 48 AGENTS.md originais preservado e verificável

---

## Stop Conditions

Em cada onda, se o DoD não for atingível pelos seguintes motivos, parar e escalar para o Board:

| Condição | Ação |
|---|---|
| Primitive do Paperclip (executionState, approval) não funciona como documentado | Parar Onda A2. Board decide: adaptar design ou pivotar para Fase B diretamente |
| 3+ batches de uma categoria falham em parity_score ≥ 0.90 | Parar Onda A3. Board decide: investigar causa raiz ou reduzir threshold |
| Adversarial review encontra finding CRITICAL não resolvível em 3 tentativas | Parar a onda. Board decide: aceitar risco documentado ou reprojetar |
| Iron Law violation detectada | Parar imediatamente. Rollback. Board decide: continuar ou abortar |

---

## Resultado do Adversarial Review (a preencher após review)

**Data:** 2026-05-24
**Reviewers:** adversarial-security-scanner, adversarial-architecture-critic, adversarial-quality-reviewer
**Resultado:** APPROVED WITH FINDINGS — todos os findings HIGH resolvidos inline

| Finding | Severity | Resolver | Status |
|---|---|---|---|
| S1: Falha de backup sem stop condition | HIGH | Critério de falha + STOP CONDITION adicionados ao T-A3-01 | RESOLVED |
| A1: Sem política de reversão por batch | HIGH | Política de reversão cirúrgica adicionada ao T-A3-03→09 | RESOLVED |
| Q1: Contrato TDD genérico demais | HIGH | Contrato TDD detalhado (RED/GREEN/REFACTOR + 4 edge cases mínimos) adicionado ao T-A3-02 | RESOLVED |
| S2: Identidade do sentinel-agent não especificada | MEDIUM | Cargo: `sentinel` (Compliance Officer) — adicionado como nota em T-A3-10 | ACCEPTED WITH NOTE |
| A2: Dependências entre libs não declaradas | MEDIUM | Ordem de desenvolvimento e dependências declaradas em T-A3-02 | RESOLVED |
| Q2: A4-validation.md referenciada antes de existir | MEDIUM | A4 é escrita em BATCH 6 (antes da Onda A3 ser executada) — dependência temporal aceitável em planning doc | ACCEPTED WITH NOTE |

**Veredicto:** CONDITIONAL APPROVED — os 3 findings HIGH foram resolvidos. 1 MEDIUM resolvido, 2 MEDIUM aceitos com nota documentada.

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-05-24 | Criado em Onda A1 — plan completo das 3 ondas da Fase A |
