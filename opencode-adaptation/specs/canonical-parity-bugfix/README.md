# SPEC — Pipeline Orchestrator completo no OpenCode

## Objetivo

Esta spec corrige a adaptação OpenCode para cobrir o pipeline completo com paridade operacional ao plugin canônico do Claude Code. Ela cobre bugfix, feature/implement, audit, UX, SPEC e pipeline full, cada um em light e heavy quando aplicável.

## Fora de escopo deste passo

Planejamento apenas. Não implementar código funcional, não fazer commit, não alterar o plugin original Claude Code e não alterar configuração local ou global do OpenCode.

## Correções após revisão adversarial

A spec agora fecha contratos físicos em `contracts.md`, define perguntas executáveis em `ui-question-matrix.md`, antecipa smoke test real de hooks, expande paridade gate por gate e fecha política segura de nomes globais com prefixo obrigatório quando houver risco de colisão.

## Ordem segura obrigatória

Antes de implementar modos como bugfix, feature, audit, UX ou SPEC, a adaptação deve provar uma base mínima real:

1. Run canônica inicializa estado, logs, sentinel e confidence score.
2. Smoke test de hooks reais no OpenCode: SessionStart, UserPromptSubmit, PreToolUse Edit/Write, PreToolUse Agent e Stop inseguro.
3. UI question funciona e registra pergunta/resposta.
4. Gate Protocol valida gate-decisions e protocol-events.
5. Mini-prova de paridade confirma que o fluxo mínimo cria eventos e bloqueia escrita fora do escopo.

## UI de perguntas do OpenCode

Toda decisão humana discreta deve usar a UI/tool de question do OpenCode. A matriz completa de perguntas fica em `ui-question-matrix.md`. Toda pergunta gera UI_QUESTION_RECORD e ProtocolEvent. Toda resposta que muda fluxo gera GateDecision.

## Contratos físicos obrigatórios

Os contratos fechados ficam em `contracts.md`: UI question record, gate decision record, protocol event record, sentinel-state, confidence score, evidence record e protocol handshake timeout. Cada contrato tem campos obrigatórios, exemplo válido, exemplo inválido, regra de bloqueio e teste obrigatório.

## Política de nomes globais

Política padrão fechada: comandos globais usam prefixo `pipeline-` quando houver risco de colisão. Comandos curtos só podem ser locais ou exigir decisão futura explícita antes de instalação global.

## Critérios gerais de pronto

- Base real de run + hooks + UI + gates aprovada antes dos modos.
- Todos os contratos físicos passam testes de contrato.
- Cada grupo termina com mini-prova de paridade.
- Nenhuma fase avança sem evidência obrigatória.
- Nenhuma decisão humana discreta usa texto livre.
- O plugin original Claude Code fica intacto.
- Os testes rodam em Windows PowerShell.


## Contratos canônicos reforçados

O gate-decisions.jsonl deve seguir o formato canônico obrigatório definido em contracts.md, especialmente os campos gate, hardness, phase, decision, decided_by, timestamp, detail e confidence_impact. O sentinel-state aceita estado parcial durante a execução, mas o estado final precisa conter todos os checkpoints obrigatórios aplicáveis. A matriz gate por gate em parity-matrix.md usa os nomes canônicos dos gates e é fonte de validação para o final-validator.


## Status de implementacao - Sprints 1 a 3

Esta spec registra que as Sprints 1, 2 e 3 tem base inicial implementada e verificada. Isso nao significa paridade completa pronta: ainda faltam UI questions, Gate Protocol/Sentinel completo, roteamento de modos, modos light/heavy e validacao final.

- Sprint 1: implementada e verificada; base minima de run canonica, protocolo, estado, arquivos novos por run e tetos de confianca quando falta evidencia.
- Sprint 2: implementada e verificada; politica segura local para nomes de comandos, sem alterar configuracoes reais.
- Sprint 3: implementada e verificada; smoke test local de hooks OpenCode, sem instalar hooks reais.
- Proximo passo: Sprint 4, UI Gate Interaction executavel, com UI_QUESTION_RECORD, GATE_DECISION_RECORD e fallback seguro quando a pergunta falhar.

Evidencias relativas principais: `tests/contract/canonical-run-sprint1.test.cjs`, `tests/contract/command-policy-sprint2.test.cjs`, `tests/contract/hook-smoke-sprint3.test.cjs`, `tmp/sprint-1-canonical-run-evidence.md`, `tmp/sprint-2-command-policy-evidence.md`, `tmp/sprint3-hook-smoke-evidence.md`.

Suite completa apos Sprint 3: `npm test` com `Summary: 39 passed / 0 failed / 39 total`.
