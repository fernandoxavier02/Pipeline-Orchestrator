# Parity Matrix — completa por dimensão e gate

## Status de paridade inicial

As dimensoes abaixo tem implementacao inicial verificada: contratos fisicos/base de run da Sprint 1, politica segura de comandos da Sprint 2 e smoke local de hooks da Sprint 3. Gate logs, eventos e sentinel tem base inicial por run, mas o Gate Protocol completo continua planejado para a Sprint 5. UI questions continuam planejadas para a Sprint 4. Nenhuma linha desta matriz deve ser lida como paridade completa pronta.

## Matriz geral

| Dimensão | Canônico Claude Code | OpenCode alvo | Dono | Sprint | Teste obrigatório | Severidade se faltar |
|---|---|---|---|---|---|---|
| Contratos fisicos | Registros parseaveis | Schemas v1 em contracts.md + implementacao inicial de validacao/run | Gate Protocol | 1 | `tests/contract/canonical-run-sprint1.test.cjs` | CRITICAL |
| Hooks iniciais | Hooks protegem execucao | Smoke local inicial sem instalar hook real | Hook Smoke Harness | 3 | `tests/contract/hook-smoke-sprint3.test.cjs` | CRITICAL |
| UI questions | AskUserQuestion | question tool OpenCode | UI Gate Interaction | 4 | question record | HIGH |
| Gate logs | gate-decisions | base inicial: gate-decisions.jsonl novo por run; protocolo completo na Sprint 5 | Gate Protocol | 5 | decisao obrigatoria | HIGH |
| Eventos | protocolo auditavel | base inicial: protocol-events.jsonl novo por run e ordem causal no smoke; protocolo completo na Sprint 5 | Gate Protocol | 5 | ordem causal | HIGH |
| Sentinel | checkpoints | base inicial parcial valida; checkpoints completos na Sprint 5 | Sentinel | 5 | ausencia bloqueia | CRITICAL |
| Bugfix light/heavy | rotas canônicas | reproduz/fixa ou raiz/batches | Mode Quality | 7-8 | modo E2E | HIGH |
| Feature light/heavy | slice/plan | slice vertical e batches | Mode Quality | 9-10 | integração | HIGH |
| Audit light/heavy | read-only | read-only + achados | Mode Quality | 11-12 | escrita bloqueada | CRITICAL |
| UX light/heavy | valida fluxo | persona/acessibilidade/visual | Mode Quality | 13-14 | UX gate | HIGH |
| SPEC light/heavy | spec rastreável | req/design/tasks/testes | Mode Quality | 15-16 | spec gates | HIGH |
| Final-validator | Pa de Cal | parse estrito | Closure | 17 | gate ausente falha | CRITICAL |
| Closeout | finishing branch | UI closeout sem commit | Closure | 18 | closeout decision | HIGH |

## Matriz gate por gate — nomes canônicos obrigatórios

| Gate canônico | Hardness | Gatilho | Equivalente OpenCode | Evento esperado | Teste obrigatório | Sprint dona | Severidade se faltar |
|---|---|---|---|---|---|---|---|
| SSOT_CONFLICT | MANDATORY | duas fontes de verdade discordam | Gate Protocol bloqueia e pede resolução via UI | ssot_conflict_detected | fixture com decisão e sentinel divergentes deve falhar | 5 | CRITICAL |
| ADVERSARIAL_GATE_MANDATORY | MANDATORY | sprint/batch exige revisão adversarial | Review Loop exige security/architecture/quality | adversarial_gate_required | sprint sem revisão adversarial bloqueia | 8-18 | HIGH |
| INFO_GATE_BLOCKED | HARD | informação crítica ausente | information-gate bloqueia avanço | info_gate_blocked | GATE_REQUEST sem resposta válida bloqueia | 5 | HIGH |
| TDD_APPROVAL | HARD | cenários/RED prontos para execução | Quality gate + pre-tester approval | tdd_approval_requested | executor sem aprovação TDD falha | 7-10 | CRITICAL |
| PLAN_REJECTED | HARD | usuário rejeita plano | gate-plan marca REWORK/BLOCKED | plan_rejected | plano rejeitado não permite execução | 4-6 | HIGH |
| COMPLEXITY_GATE | SOFT | rota light/heavy definida | Mode Routing confirma complexidade via UI | complexity_gate_decided | heavy sem plano ou light excessivo falha | 6 | HIGH |
| STOP_RULE | CIRCUIT_BREAKER | condição de parada atingida | STOP_RULE bloqueia fase | stop_rule_triggered | quarta tentativa ou gate crítico ausente para | 5-18 | CRITICAL |
| FIX_LOOP_EXHAUSTED | CIRCUIT_BREAKER | três tentativas falharam | Review Loop para | fix_loop_exhausted | quarta tentativa deve falhar | 8-18 | HIGH |
| STALE_CONTEXT | SOFT | contexto antigo detectado | gate-resume-context pergunta UI | stale_context_detected | run antiga exige decisão | 3-4 | HIGH |
| MICRO_GATE_GAP | HARD | micro-gate esperado ausente | checkpoint-validator bloqueia | micro_gate_gap_detected | batch sem micro-gate falha | 8-10 | HIGH |
| CHECKPOINT_FAIL | HARD | checkpoint retorna BLOCK | Sentinel bloqueia fase | checkpoint_failed | checkpoint BLOCK impede próximo passo | 5-18 | CRITICAL |
| ADVERSARIAL_BLOCK | HARD | revisão adversarial acha HIGH/CRITICAL | gate-blocking-finding pergunta correção/parada | adversarial_block_detected | HIGH aberto bloqueia | 8-18 | HIGH |
| ADVERSARIAL_GATE | SOFT | revisão adversarial concluída | gate-adversarial-batch decide avanço | adversarial_gate_decided | revisão sem decisão falha | 8-18 | HIGH |
| FINAL_ADVERSARIAL_GATE | SOFT | antes do closeout, conforme risco | gate-final-adversarial pergunta rodar/dispensar | final_adversarial_gate_requested | risco alto exige revisão final | 18 | HIGH |
| FINAL_ADVERSARIAL_REWORK | HARD | revisão final pede retrabalho | closeout bloqueia pronto | final_adversarial_rework | rework final impede pronto | 18 | HIGH |
| CLOSEOUT_CONFIRM | SOFT | final-validator concluiu | gate-closeout pergunta status final | closeout_confirm_requested | sem decisão de closeout falha | 18 | HIGH |
| STATE_FILE_INIT_FAIL | CIRCUIT_BREAKER | estado nao inicializa | Implementado: Run Lifecycle fail-closed | state_init_failed | `tests/contract/canonical-run-sprint1.test.cjs` | 1 | CRITICAL |
| PROTOCOL_HANDSHAKE_TIMEOUT | HARD | ator não emite evento esperado no prazo | timeout contract bloqueia | handshake_timeout | agente sem resposta gera bloqueio | 5 | HIGH |
| SPEC_ARTIFACT_MISSING | MANDATORY | SPEC sem requirements/design/tasks aplicáveis | SPEC gate bloqueia | spec_artifact_missing | spec sem artefato obrigatório falha | 15-16 | HIGH |
| SPEC_FORMAT_GATE_FAIL | HARD | formato da SPEC inválido | SPEC format gate bloqueia | spec_format_gate_failed | schema/estrutura inválida falha | 15-16 | HIGH |
| SPEC_CONTENT_REVIEW_NOGO | HARD | revisão de conteúdo reprova SPEC | adversarial spec review bloqueia | spec_content_review_nogo | achado HIGH na spec impede execução | 16 | HIGH |
| SPEC_AC_TRACEABILITY_GAP | HARD | critério de aceite sem rastreio | traceability gate bloqueia | spec_ac_traceability_gap | AC sem história/task falha | 15-16 | HIGH |
| SPEC_POST_IMPL_FAIL | HARD | pós-implementação não cumpre spec | verify-completion bloqueia | spec_post_impl_failed | requisito não entregue falha | 17 | HIGH |
| ADVERSARIAL_LOOP_CHECKPOINT | SOFT | loop adversarial entre tentativas | Sentinel registra tentativa e status | adversarial_loop_checkpoint | tentativa sem checkpoint falha | 8-18 | HIGH |
| STEP_1_7_ROUTING | HARD | etapa 1.7 decide rota | Mode Routing registra rota canônica | step_1_7_routing_decided | rota sem evento falha | 6 | HIGH |
| STEP_1_7_RECURSION_GUARD | CIRCUIT_BREAKER | reclassificação poderia entrar em ciclo | recursion guard bloqueia loop | step_1_7_recursion_guard | reclassificação infinita falha | 6 | HIGH |
| STOP_BEFORE_PA_DE_CAL | HARD | stop antes do Pa de Cal | Stop hook bloqueia fechamento | stop_before_pa_de_cal_blocked | stop antes do final-validator falha | 3,18 | CRITICAL |
| STRICT_SPEC_REJECTION | AUDIT | pedido Spec rejeitado por regra strict | Mode Routing registra rejeição e fallback/bloqueio | strict_spec_rejected | spec strict inválida não segue como spec | 6,15 | HIGH |

## Regra final

Paridade operacional é obrigatória. Divergência interna é aceita só se não reduzir dureza de gate, hook, evidência, sentinel, escopo ou revisão.
