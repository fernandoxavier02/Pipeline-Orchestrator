# Test Strategy — cenários executáveis por modo

## Contratos

Cada schema de `contracts.md` deve ter teste com exemplo válido e inválido. Falha esperada: registro sem schemaVersion, campo obrigatório ausente ou enum inválida deve bloquear.

## Hooks cedo

Cenário: entrada prompt simples. Ação: SessionStart e UserPromptSubmit. Saída esperada: run e evento. Falha esperada: sem runId bloqueia.

Cenário: tentativa de escrita fora do escopo. Ação: PreToolUse Edit/Write. Saída esperada: bloqueio. Evidência: protocol event de severidade high.

Cenário: agente não autorizado. Ação: PreToolUse Agent. Saída esperada: bloqueio. Evidência: dispatch guard event.

Cenário: stop inseguro. Ação: Stop antes do final-validator. Saída esperada: bloqueio. Evidência: STOP_RULE.

## UI questions

Cenário: confirmação de classificação. Entrada: ORCHESTRATOR_DECISION. Ação: emitir question UI. Saída: UI_QUESTION_RECORD + GATE_DECISION_RECORD. Falha esperada: pergunta em texto livre bloqueia.

## Bugfix light

Entrada: erro reproduzível simples. Ação: criar RED, aplicar fix mínimo, rodar regressão. Saída: GREEN. Falha esperada: executor sem RED bloqueia. Evidência: RED, GREEN, regression, closeout.

## Bugfix heavy

Entrada: bug crítico com risco alto. Ação: raiz, plano aprovado, batches. Saída: verify-completion e Pa de Cal. Falha esperada: achado HIGH aberto bloqueia. Evidência: root cause, plan gate, batch reviews.

## Feature light

Entrada: capacidade pequena. Ação: aprovar cenário e entregar slice vertical. Saída: integração mínima funcionando. Falha esperada: mudança sem ponta a ponta bloqueia. Evidência: ATDD, RED/GREEN, integration.

## Feature heavy

Entrada: feature complexa. Ação: plano com múltiplos slices e batches. Saída: integração entre slices. Falha esperada: batch sem checkpoint bloqueia. Evidência: plan, batch, checkpoint, review.

## Audit light

Entrada: pedido de auditoria simples. Ação: rodar read-only. Saída: achados com evidência. Falha esperada: qualquer escrita funcional bloqueia. Evidência: read-only proof, findings.

## Audit heavy

Entrada: escopo amplo aprovado. Ação: matriz de risco. Saída: achados priorizados. Falha esperada: CRITICAL sem STOP_RULE bloqueia. Evidência: risk matrix, sources, adversarial report.

## UX light

Entrada: fluxo principal. Ação: validar persona, acessibilidade básica e fluxo. Saída: relatório priorizado. Falha esperada: ausência de persona bloqueia. Evidência: persona, flow, accessibility.

## UX heavy

Entrada: jornadas múltiplas. Ação: aprovar personas, rodar cenários BDD, validar visual/fluxo. Saída: relatório amplo. Falha esperada: WCAG crítico bloqueia. Evidência: journeys, visual evidence, accessibility.

## SPEC light

Entrada: ideia simples. Ação: gerar requirements, design e tasks mínimos. Saída: AC rastreável. Falha esperada: task sem AC bloqueia. Evidência: spec format/content gates.

## SPEC heavy

Entrada: trabalho complexo. Ação: requirements, DDD design, tasks, tests, risks. Saída: spec revisada. Falha esperada: contrato pendente bloqueia. Evidência: traceability matrix, adversarial review.

## Pipeline full

Entrada: pedido livre. Ação: Mode Routing propõe família e light/heavy. Saída: confirmação via UI. Falha esperada: rota sem confirmação bloqueia. Evidência: route decision, UI question, gate decision.

## Mini-provas de paridade

Ao fim de cada grupo, rodar comparação de eventos esperados contra eventos produzidos. Falta de gate obrigatório é HIGH. Falta de hook smoke é CRITICAL. Falta de evidência de modo é HIGH.


## Testes canônicos obrigatórios adicionados

- Validar que cada linha de gate-decisions.jsonl contém gate, hardness, phase, decision, decided_by, timestamp, detail e confidence_impact.
- Rejeitar hardness fora da taxonomia canônica: MANDATORY, HARD, CIRCUIT_BREAKER, SOFT, AUDIT.
- Rejeitar decision fora de APPROVED, REJECTED, BLOCKED, BYPASSED, REWORK ou STOPPED.
- Validar sentinel-state parcial por fase e sentinel-state final com todos os checkpoints aplicáveis.
- Para cada gate canônico em parity-matrix.md, executar teste de presença do evento esperado e falha quando o gate obrigatório estiver ausente.

- Comparar a hardness de cada gate em parity-matrix.md contra a tabela canônica permitida e contra a referência de gates da spec.
- Caso negativo obrigatório: um gate canônico válido com hardness errada deve falhar, por exemplo STOP_RULE com HARD em vez de CIRCUIT_BREAKER, ou FINAL_ADVERSARIAL_GATE com CONDITIONAL em vez de SOFT.
