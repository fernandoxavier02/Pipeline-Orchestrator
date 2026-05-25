# Contracts — schemas físicos obrigatórios

Todos os contratos abaixo são versionados. Campos marcados como obrigatórios não podem faltar. Falta, tipo errado, valor fora da enumeração ou referência inexistente bloqueia a fase seguinte.

## UI_QUESTION_RECORD v1

Uso: registrar pergunta apresentada pela UI/tool de question do OpenCode.

Campos obrigatórios: schemaVersion, runId, questionId, phase, flowPoint, questionText, options, recommendedOptionId, reason, emittedAt, emittedBy, writesProtocolEvent, linkedGateId.

Exemplo válido:

```json
{"schemaVersion":"UI_QUESTION_RECORD/v1","runId":"run-001","questionId":"q-classify-001","phase":"phase-0","flowPoint":"classification_confirmation","questionText":"Confirmar rota proposta?","options":[{"id":"approve","label":"Aprovar rota proposta (Recomendado)","effect":"continue"},{"id":"adjust","label":"Ajustar rota","effect":"reclassify"},{"id":"block","label":"Bloquear","effect":"stop"}],"recommendedOptionId":"approve","reason":"classificação consistente com o pedido","emittedAt":"2026-05-24T00:00:00Z","emittedBy":"pipeline-run-orchestrator","writesProtocolEvent":true,"linkedGateId":"gate-classification"}
```

Exemplo inválido:

```json
{"runId":"run-001","questionText":"Pode seguir?"}
```

Regra de bloqueio: se a pergunta exigida não gerar UI_QUESTION_RECORD válido, bloquear avanço com STOP_RULE.

Teste obrigatório: validar schema, opções não vazias, recomendação existente nas opções e vínculo com gate quando houver decisão.

## GATE_DECISION_RECORD v1

Uso: registrar uma linha de decisão compatível com o gate-decisions.jsonl canônico. Campos extras do OpenCode podem existir, mas os campos canônicos abaixo são obrigatórios e são a fonte de verdade para o final-validator.

Campos canônicos obrigatórios: gate, hardness, phase, decision, decided_by, timestamp, detail, confidence_impact.

Valores válidos:

- hardness: MANDATORY, HARD, CIRCUIT_BREAKER, SOFT, AUDIT.
- decision: APPROVED, REJECTED, BLOCKED, BYPASSED, REWORK, STOPPED.
- timestamp: data/hora em formato ISO 8601.
- confidence_impact: número entre -100 e 100.

Extensões OpenCode permitidas: schemaVersion, runId, questionId, protocolEventId, selectedOptionId, selectedLabel, riskAccepted, attemptNumber, mode, sprint, slice. Essas extensões não substituem os campos canônicos.

Exemplo válido:

```json
{"schemaVersion":"GATE_DECISION_RECORD/v1","runId":"run-001","gate":"PLAN_REJECTED","hardness":"HARD","phase":"phase-1.5","decision":"REWORK","decided_by":"user","timestamp":"2026-05-24T00:01:00Z","detail":"Usuário pediu ajuste no plano antes de liberar cenários.","confidence_impact":-10,"questionId":"q-plan-001","protocolEventId":"evt-010","selectedOptionId":"adjust"}
```

Exemplo inválido:

```json
{"gate":"PLAN_REJECTED","decision":"maybe","phase":"phase-1.5"}
```

Regra de bloqueio: o final-validator falha se faltar qualquer campo canônico obrigatório, se hardness não for exatamente um dos níveis canônicos MANDATORY/HARD/CIRCUIT_BREAKER/SOFT/AUDIT, se decision não for APPROVED/REJECTED/BLOCKED/BYPASSED/REWORK/STOPPED, se timestamp não for ISO 8601, ou se confidence_impact não for número entre -100 e 100. CONDITIONAL pode existir como veredito ou resultado em outro contrato, mas nunca como hardness.

Teste de contrato obrigatório: validar uma linha JSONL válida com campos canônicos; rejeitar linha sem detail; rejeitar hardness inválido, incluindo CONDITIONAL; rejeitar decision inválido; rejeitar confidence_impact fora do intervalo; confirmar que campos extras OpenCode não tornam válido um registro sem campos canônicos.
## PROTOCOL_EVENT_RECORD v1

Uso: registrar evento auditável da run.

Campos obrigatórios: schemaVersion, runId, eventId, eventType, phase, timestamp, actor, payloadRef, parentEventId, severity.

Exemplo válido:

```json
{"schemaVersion":"PROTOCOL_EVENT_RECORD/v1","runId":"run-001","eventId":"evt-001","eventType":"run_started","phase":"session_start","timestamp":"2026-05-24T00:00:00Z","actor":"SessionStart","payloadRef":"run-log","parentEventId":null,"severity":"info"}
```

Exemplo inválido:

```json
{"eventType":"run_started"}
```

Regra de bloqueio: evento fora de ordem, sem runId ou sem eventId bloqueia validação final.

Teste obrigatório: validar ordem causal e unicidade de eventId por run.

## SENTINEL_STATE v1

Uso: estado fiscal da sequência do pipeline. Estado parcial é válido durante a execução, porque nem todos os checkpoints existem no começo. Estado final só é válido quando contém todos os checkpoints obrigatórios aplicáveis à rota executada.

Campos obrigatórios: schemaVersion, runId, currentPhase, checkpoints, blocked, stopRuleTriggered, lastValidEventId, updatedAt.

Checkpoints globais obrigatórios quando aplicáveis: post_orchestrator, phase_0_to_1, phase_1_to_2, phase_2_to_3, post_final_validator.

Regras por fase:

- Durante session_start: checkpoints pode estar vazio, mas runId, currentPhase e blocked precisam existir.
- Após task-orchestrator: post_orchestrator precisa existir.
- Antes de execução: phase_0_to_1 e phase_1_to_2 precisam existir quando houve planejamento/gates.
- Antes de fechamento: phase_2_to_3 precisa existir quando houve execução, auditoria, UX ou SPEC com validação.
- Estado final: todos os checkpoints aplicáveis à rota precisam existir com status PASS ou CORRECTED; qualquer BLOCK mantém blocked=true.

Exemplo válido parcial por fase:

```json
{"schemaVersion":"SENTINEL_STATE/v1","runId":"run-001","currentPhase":"phase-1","checkpoints":{"post_orchestrator":{"status":"PASS","eventId":"evt-005","checkedAt":"2026-05-24T00:02:00Z"}},"blocked":false,"stopRuleTriggered":false,"lastValidEventId":"evt-005","updatedAt":"2026-05-24T00:02:00Z"}
```

Exemplo válido final:

```json
{"schemaVersion":"SENTINEL_STATE/v1","runId":"run-001","currentPhase":"closed","checkpoints":{"post_orchestrator":{"status":"PASS","eventId":"evt-005","checkedAt":"2026-05-24T00:02:00Z"},"phase_0_to_1":{"status":"PASS","eventId":"evt-020","checkedAt":"2026-05-24T00:05:00Z"},"phase_1_to_2":{"status":"PASS","eventId":"evt-040","checkedAt":"2026-05-24T00:10:00Z"},"phase_2_to_3":{"status":"PASS","eventId":"evt-080","checkedAt":"2026-05-24T00:20:00Z"},"post_final_validator":{"status":"PASS","eventId":"evt-100","checkedAt":"2026-05-24T00:25:00Z"}},"blocked":false,"stopRuleTriggered":false,"lastValidEventId":"evt-100","updatedAt":"2026-05-24T00:25:00Z"}
```

Exemplo inválido:

```json
{"schemaVersion":"SENTINEL_STATE/v1","runId":"run-001","currentPhase":"closed","checkpoints":{"post_orchestrator":{"status":"PASS"}},"blocked":false,"stopRuleTriggered":false,"lastValidEventId":"evt-005","updatedAt":"2026-05-24T00:25:00Z"}
```

Regra de bloqueio: checkpoint aplicável ausente, checkpoint com status inválido, estado final sem post_final_validator, ou checkpoint BLOCK com blocked=false bloqueia a fase seguinte e faz o final-validator falhar.

Testes obrigatórios por fase e final: validar parcial em session_start; validar parcial após post_orchestrator; rejeitar avanço para execução sem phase_1_to_2 quando aplicável; rejeitar fechamento sem phase_2_to_3 quando aplicável; rejeitar estado final sem post_final_validator; rejeitar BLOCK com blocked=false; aceitar estado final com todos os checkpoints aplicáveis.
## CONFIDENCE_SCORE v1

Uso: pontuação de confiança da run.

Campos obrigatórios: schemaVersion, runId, score, scale, factors, updatedAt, updatedBy, floorApplied.

Regras: score entre 0 e 100. Gate ausente aplica teto máximo 60. RED ausente em implementação aplica teto 50. Achado HIGH aberto aplica teto 40. CRITICAL aberto aplica teto 20.

Exemplo válido:

```json
{"schemaVersion":"CONFIDENCE_SCORE/v1","runId":"run-001","score":82,"scale":"0-100","factors":[{"name":"all_required_gates_present","delta":20}],"updatedAt":"2026-05-24T00:03:00Z","updatedBy":"final-validator","floorApplied":false}
```

Exemplo inválido:

```json
{"runId":"run-001","score":150}
```

Regra de bloqueio: score inválido bloqueia final-validator; score abaixo de 70 exige closeout como bloqueado ou revisão manual.

Teste obrigatório: validar tetos por falta de evidência e limites numéricos.

## EVIDENCE_RECORD v1

Uso: registrar evidência de aceite, RED, GREEN, prompt/debug, review e veredito.

Campos obrigatórios: schemaVersion, runId, evidenceId, evidenceType, mode, sprint, slice, commandOrPromptRef, resultSummary, artifactRef, verdict, createdAt.

Exemplo válido:

```json
{"schemaVersion":"EVIDENCE_RECORD/v1","runId":"run-001","evidenceId":"ev-red-001","evidenceType":"RED","mode":"bugfix-light","sprint":"5","slice":"5.1","commandOrPromptRef":"test-command","resultSummary":"falhou pelo erro esperado","artifactRef":"red-log","verdict":"PASS","createdAt":"2026-05-24T00:04:00Z"}
```

Exemplo inválido:

```json
{"evidenceType":"RED","verdict":"PASS"}
```

Regra de bloqueio: implementação sem RED antes do GREEN bloqueia executor; sprint sem review evidence bloqueia fechamento.

Teste obrigatório: validar sequência acceptance -> RED -> GREEN -> review -> verdict quando aplicável.

## PROTOCOL_HANDSHAKE_TIMEOUT v1

Uso: definir prazo para agente, skill ou hook responder com evento esperado.

Campos obrigatórios: schemaVersion, runId, handshakeId, actorType, actorName, expectedEventType, startedAt, timeoutMs, onTimeout, recoveryOptions.

Padrão seguro: 30000 ms para hook, 120000 ms para subagente simples, 300000 ms para revisão ou plano heavy.

Exemplo válido:

```json
{"schemaVersion":"PROTOCOL_HANDSHAKE_TIMEOUT/v1","runId":"run-001","handshakeId":"hs-agent-001","actorType":"agent","actorName":"reviewer-security","expectedEventType":"agent_completed","startedAt":"2026-05-24T00:05:00Z","timeoutMs":120000,"onTimeout":"BLOCK","recoveryOptions":["retry_once","stop"]}
```

Exemplo inválido:

```json
{"actorName":"reviewer-security","timeoutMs":0}
```

Regra de bloqueio: timeout vencido sem evento esperado bloqueia a fase e registra ProtocolEvent de severidade high.

Teste obrigatório: simular agente sem resposta e confirmar bloqueio, evento de timeout e ausência de avanço.

## Política segura de nomes globais v1

Comandos globais devem ser prefixados quando houver risco de colisão. Comandos curtos só podem ser locais ao projeto ou exigir decisão futura explícita antes de instalação global.

Regra padrão: usar prefixo pipeline- para comandos globais. Exemplo: pipeline-bugfix, pipeline-feature, pipeline-audit, pipeline-ux, pipeline-spec, pipeline-full.

Bloqueio: tentativa de registrar comando global curto sem decisão explícita bloqueia instalação.

Teste obrigatório: simular colisão de nome e confirmar escolha de comando prefixado.
