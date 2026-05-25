# Tasks — ordem corrigida por bloqueadores

Cada grupo termina com mini-prova de paridade. Infraestrutura não pode ser só camada técnica: precisa demonstrar fluxo real mínimo.

## Grupo 1 — Contratos físicos e política de nomes

### Sprint 1 - Schemas bloqueantes - IMPLEMENTADA/VERIFICADA

Status real S1: implementada como base minima de run canonica/protocolo/estado, com teste de contrato e evidencia persistida. Evidencias relativas: `tests/contract/canonical-run-sprint1.test.cjs`, `tmp/sprint-1-canonical-run-evidence.md`.

Slices: UI_QUESTION_RECORD; GATE_DECISION_RECORD; PROTOCOL_EVENT_RECORD; SENTINEL_STATE; CONFIDENCE_SCORE; EVIDENCE_RECORD; PROTOCOL_HANDSHAKE_TIMEOUT.

Saída real mínima: validador de contrato planejado com fixtures válidas/inválidas para todos os schemas. Mini-prova: contrato inválido bloqueia fase simulada.

### Sprint 2 - Politica segura de comandos - IMPLEMENTADA/VERIFICADA

Status real S2: implementada como politica local pura, sem instalacao nem alteracao de configuracao real. Evidencias relativas: `tests/contract/command-policy-sprint2.test.cjs`, `tmp/sprint-2-command-policy-evidence.md`.

Slices: comandos globais prefixados; comandos curtos locais; bloqueio de colisão; registro de decisão futura explícita se quiser comando curto global.

Mini-prova: colisão simulada escolhe comando prefixado e bloqueia comando curto global sem decisão.

## Grupo 2 — Hooks reais antes dos modos

### Sprint 3 - Smoke test de hooks OpenCode - IMPLEMENTADA/VERIFICADA

Status real S3: implementada como harness local de smoke test, sem instalar hooks reais. Evidencias relativas: `tests/contract/hook-smoke-sprint3.test.cjs`, `tmp/sprint3-hook-smoke-evidence.md`.

Slices: SessionStart cria run; UserPromptSubmit registra prompt; PreToolUse Edit/Write bloqueia fora do escopo; PreToolUse Agent bloqueia agente não autorizado; Stop inseguro bloqueia sem final-validator.

Saída real mínima: fluxo inicia, registra evento, bloqueia escrita, bloqueia agente e bloqueia stop inseguro. Mini-prova: protocol-events contém eventos esperados.

## Grupo 3 — UI questions e gates

### Sprint 4 - UI Gate Interaction executavel - IMPLEMENTADA/VERIFICADA

Status real S4: implementada com matriz executavel, persistencia de perguntas, decisoes de gate, eventos de protocolo e fallback seguro. Evidencias relativas: `tests/contract/ui-gate-sprint4.test.cjs`, `tmp/sprint-4-ui-gate-evidence.md`, `tmp/sprint-4-evidence-records.jsonl`.

Slices: matriz de perguntas; emissão de UI_QUESTION_RECORD; gravação de GATE_DECISION_RECORD; fallback quando question UI falha; perguntas para bypass, tracing, terceira tentativa e closeout.

Mini-prova: confirmação de classificação pela UI grava pergunta, evento e decisão.

### Sprint 5 — Gate Protocol e Sentinel - IMPLEMENTADA/VERIFICADA

Slices: GATE_REQUEST; DISPATCH_REQUEST; PLAN_MODE_REQUEST; gate-decisions.jsonl; protocol-events.jsonl; sentinel checkpoints; timeout de handshake.

Mini-prova: gate ausente bloqueia phase_0_to_1 e timeout bloqueia dispatch.

## Grupo 4 — Mode Routing full

### Sprint 6 — Classificador geral - IMPLEMENTADA/VERIFICADA

Status real S6: implementada como roteamento local/testavel, confirmacao via UI, ajuste seguro e registros canonicos, sem executar fluxos de modo. Evidencias relativas: 	ests/contract/mode-routing-sprint6.test.cjs, 	mp/sprint-6-mode-routing-evidence.md.


Slices: bugfix, feature/implement, audit, UX, SPEC, pipeline full; light/heavy; confirmação via UI; ajuste de rota; severidade se faltar.

Mini-prova: um pedido por família gera rota e confirmação.

## Grupo 5 — Bugfix

### Sprint 7 — Bugfix light

Slices: reprodução, RED, fix mínimo, GREEN, regressão, closeout.

### Sprint 8 — Bugfix heavy

Slices: raiz, plano aprovado, batches, checkpoints, adversarial por batch, verify-completion.

Mini-prova do grupo: comparar gate log bugfix light/heavy com matriz canônica.

## Grupo 6 — Feature/implement

### Sprint 9 — Feature light

Slices: cenário aprovado, slice vertical, integração, não regressão.

### Sprint 10 — Feature heavy - IMPLEMENTADA/VERIFICADA

Status real S10: implementada/verificada; feature heavy bloqueia batch sem checkpoint e passa com multiplos slices integrados. Evidencias relativas: `tests/contract/feature-heavy-sprint10.test.cjs`, `tmp/sprint-10-mode-quality-evidence.md`.

Slices: plano, múltiplos slices, batches, integração, review final.

Mini-prova do grupo: feature sem integração bloqueia; feature com integração passa.

## Grupo 7 — Audit

### Sprint 11 — Audit light - IMPLEMENTADA/VERIFICADA

Status real S11: implementada/verificada; audit light exige prova read-only e achados com evidencia. Evidencias relativas: `tests/contract/audit-light-sprint11.test.cjs`, `tmp/sprint-11-mode-quality-evidence.md`.

Slices: read-only, achados, evidência, severidade, closeout.

### Sprint 12 — Audit heavy - IMPLEMENTADA/VERIFICADA

Status real S12: implementada/verificada; audit heavy exige escopo, read-only, matriz de risco, fontes e revisao. Evidencias relativas: `tests/contract/audit-heavy-sprint12.test.cjs`, `tmp/sprint-12-mode-quality-evidence.md`.

Slices: escopo via UI, matriz de risco, evidência ampla, revisão adversarial do relatório.

Mini-prova do grupo: tentativa de escrita em audit bloqueia.

## Grupo 8 — UX

### Sprint 13 — UX light - IMPLEMENTADA/VERIFICADA

Status real S13: implementada/verificada; UX light bloqueia sem persona e exige fluxo/acessibilidade. Evidencias relativas: `tests/contract/ux-light-sprint13.test.cjs`, `tmp/sprint-13-mode-quality-evidence.md`.

Slices: persona, fluxo principal, acessibilidade básica, evidência visual/fluxo.

### Sprint 14 — UX heavy - IMPLEMENTADA/VERIFICADA

Status real S14: implementada/verificada; UX heavy exige personas, jornadas, cenarios, visual e acessibilidade sem critico. Evidencias relativas: `tests/contract/ux-heavy-sprint14.test.cjs`, `tmp/sprint-14-mode-quality-evidence.md`.

Slices: personas aprovadas, jornadas, cenários BDD, validação visual, acessibilidade ampliada.

Mini-prova do grupo: UX sem persona bloqueia.

## Grupo 9 — SPEC

### Sprint 15 — SPEC light - IMPLEMENTADA/VERIFICADA

Status real S15: implementada/verificada; SPEC light bloqueia sem rastreabilidade de aceite. Evidencias relativas: `tests/contract/spec-light-sprint15.test.cjs`, `tmp/sprint-15-mode-quality-evidence.md`.

Slices: requirements, design, tasks, AC rastreável, gates de formato.

### Sprint 16 — SPEC heavy - IMPLEMENTADA/VERIFICADA

Status real S16: implementada/verificada; SPEC heavy exige DDD, contratos, estrategia de teste, riscos, gates e revisao adversarial. Evidencias relativas: `tests/contract/spec-heavy-sprint16.test.cjs`, `tmp/sprint-16-mode-quality-evidence.md`.

Slices: DDD, contratos, test strategy, riscos, gates pós-implementação, revisão adversarial da spec.

Mini-prova do grupo: SPEC sem rastreabilidade AC bloqueia.

## Grupo 10 — Validação final e paridade end-to-end

### Sprint 17 — Sanity, verify-completion e final-validator - IMPLEMENTADA/VERIFICADA

Status real S17: implementada/verificada; sanity/verify por modo, teto de confianca e Pa de Cal estrito. Evidencias relativas: `tests/contract/final-validation-sprint17.test.cjs`, `tmp/sprint-17-mode-quality-evidence.md`.

Slices: sanity por modo; verify-completion por modo; confidence score; Pa de Cal estrito.

### Sprint 18 — Closeout e prova de paridade end-to-end - IMPLEMENTADA/VERIFICADA

Status real S18: implementada/verificada; closeout via UI, adversarial final e relatorio completo por dimensao. Evidencias relativas: `tests/contract/closeout-parity-sprint18.test.cjs`, `tmp/sprint-18-mode-quality-evidence.md`, `tmp/sprints-7-18-closeout-evidence.md`.

Slices: closeout via UI; final adversarial obrigatório/opcional; relatório por fase, hook, gate, arquivo, agente, skill, modo e evidência.

Mini-prova final: run simulada completa passa todos os gates obrigatórios; run com gate ausente falha.

## Status resumido por sprint

- Sprint 1: implementada/verificada; base inicial, nao paridade completa.
- Sprint 2: implementada/verificada; politica local, sem mutacao de configs reais.
- Sprint 3: implementada/verificada; smoke local de hooks, sem hooks reais instalados.
- Sprint 4: implementada/verificada; UI questions e gate decisions executaveis.
- Sprint 5: implementada/verificada; Gate Protocol e Sentinel local sem hooks reais.
- Sprint 6: implementada/verificada; Classificador geral / Mode Routing full local, sem executar fluxos dos modos.
- Sprints 7 a 18: implementadas/verificadas nesta execução; evidência agregada em `tmp/sprints-7-18-closeout-evidence.md`.





## Atualização de execução — Sprints 7 a 18

- Sprint 7: implementada/verificada; bugfix light bloqueia sem RED/reprodução e passa com GREEN/regressão/closeout.
- Sprint 8: implementada/verificada; bugfix heavy exige raiz, plano, batches, adversarial por batch e verify-completion.
- Sprint 9: implementada/verificada; feature light bloqueia sem integração e passa com slice vertical.
- Sprint 10: implementada/verificada; feature heavy bloqueia batch sem checkpoint e passa com múltiplos slices integrados.
- Sprint 11: implementada/verificada; audit light exige prova read-only e achados com evidência.
- Sprint 12: implementada/verificada; audit heavy exige escopo, read-only, matriz de risco com três frentes, fontes e revisão.
- Sprint 13: implementada/verificada; UX light bloqueia sem persona e exige fluxo/acessibilidade.
- Sprint 14: implementada/verificada; UX heavy exige personas, jornadas, cenários, visual e acessibilidade sem crítico.
- Sprint 15: implementada/verificada; SPEC light bloqueia sem rastreabilidade de aceite.
- Sprint 16: implementada/verificada; SPEC heavy exige DDD, contratos, estratégia de teste, riscos, gates e revisão adversarial.
- Sprint 17: implementada/verificada; sanity/verify por modo, teto de confiança e Pa de Cal estrito.
- Sprint 18: implementada/verificada; closeout via UI, adversarial final e relatório completo por dimensão.

## Atualização de hardening — Sprints 9 a 18

- H9 a H18: harness forte implementado e verificado. Evidência agregada: `tmp/sprints-9-18-harness-hardening-evidence.md`.
- Resultado final: `npm test` -> `Summary: 54 passed / 0 failed / 54 total`.
- Revisão adversarial: segurança PASS, arquitetura PASS, qualidade PASS após correção dos bloqueios de qualidade.
- Limites: sem commit; plugin canônico, configs e hooks reais intocados.
