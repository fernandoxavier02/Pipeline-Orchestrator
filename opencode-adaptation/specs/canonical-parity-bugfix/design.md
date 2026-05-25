# Design — DDD do Pipeline completo no OpenCode

## Bounded contexts obrigatórios

### Run Lifecycle

Dono de run, lock, retomada e fechamento. Usa SENTINEL_STATE, CONFIDENCE_SCORE e PROTOCOL_EVENT_RECORD. Retomada de contexto velho exige pergunta da UI.

### Hook Smoke Harness

Dono da prova inicial de hooks reais no OpenCode. Deve testar SessionStart, UserPromptSubmit, PreToolUse Edit/Write, PreToolUse Agent e Stop inseguro antes dos modos. O grupo só passa se produzir mini-fluxo real: iniciar run, registrar prompt, bloquear escrita fora do escopo, bloquear agente não autorizado e impedir stop inseguro.

### Mode Routing

Dono da classificação geral para bugfix, feature/implement, audit, UX, SPEC e pipeline full. Produz rota light/heavy e exige confirmação pela UI.

### UI Gate Interaction

Dono de UI_QUESTION_RECORD e GATE_DECISION_RECORD. As perguntas executáveis estão em `ui-question-matrix.md`. Invariante: pergunta técnica precisa opção recomendada; resposta que muda fluxo precisa gate decision.

### Gate Protocol

Dono de GATE_REQUEST, DISPATCH_REQUEST, PLAN_MODE_REQUEST, gate-decisions.jsonl e protocol-events.jsonl. Usa schemas de `contracts.md`. Invariante: contrato inválido bloqueia.

### Sentinel Enforcement

Dono dos checkpoints post_orchestrator, phase_0_to_1, phase_1_to_2, phase_2_to_3 e post_final_validator. Checkpoint ausente tem severidade HIGH; checkpoint BLOCK tem severidade CRITICAL.

### Naming Policy

Dono da política de nomes. Comandos globais usam prefixo `pipeline-` por padrão. Comandos curtos são locais ou exigem decisão futura explícita.

### Mode-Specific Quality

Dono das regras por modo: bugfix reproduz erro; feature entrega slice vertical; audit é read-only; UX valida persona/acessibilidade/fluxo; SPEC entrega requisitos/design/tasks rastreáveis.

### Review Loop

Dono da revisão adversarial com contexto zero, severidade e re-review. Terceira tentativa exige pergunta UI. Quarta tentativa aciona STOP_RULE.

### Closure/Validation

Dono de sanity-checker, verify-completion, final-validator Pa de Cal e closeout. Confidence score abaixo de 70 impede closeout como pronto.

## Fluxo mínimo antes dos modos

1. SessionStart cria run e sentinel-state.
2. UserPromptSubmit registra prompt.
3. UI question confirma classificação dummy.
4. PreToolUse Edit/Write bloqueia escrita fora do escopo.
5. PreToolUse Agent bloqueia agente não autorizado.
6. Stop inseguro bloqueia fechamento sem final-validator.
7. Mini-prova de paridade compara eventos esperados.

## Contratos físicos

Todos os campos sugeridos viraram schemas obrigatórios em `contracts.md`, com versão, exemplos e testes. Nenhum contexto pode aceitar registro sem schemaVersion.

## Severidade se faltar

- Contrato físico faltando: CRITICAL.
- Hook smoke ausente: CRITICAL.
- Pergunta UI trocada por texto livre: HIGH.
- Mini-prova de paridade ausente: HIGH.
- Comando global curto sem decisão explícita: HIGH.
