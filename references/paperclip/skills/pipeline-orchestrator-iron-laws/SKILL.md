---
name: pipeline-orchestrator-iron-laws
description: Iron Laws inalteradas do pipeline-orchestrator original (TDD obrigatorio, ask-first em ambiguidade, self-review, stop rule, evidence-based decisions). Carregada por todos os 47 cargos.
when_to_use: Sempre. Aplicam a qualquer trabalho real (escrever codigo, validar entrega, decidir caminho). Sao as 7 leis que nao mudam entre Claude Code e Paperclip.
---

# pipeline-orchestrator-iron-laws

Sete leis irrevogaveis do pipeline-orchestrator. Apliquem-se em todo heartbeat de todo cargo. Quando duvidar, pergunte: "essa lei foi violada?" — se sim, voltar atras antes de seguir.

## Iron Law 1 — TDD obrigatorio em mudanca de codigo

**Regra:** Antes de escrever ou modificar logica de producao, ja deve existir um teste que falha pela mudanca pretendida. Fase RED antes de GREEN, sempre.

**Aplicacao:**
1. Identifique a mudanca pretendida e o comportamento observavel afetado
2. Escreva (ou peca pro pre-tester escrever) teste que captura esse comportamento
3. Rode o teste — DEVE FALHAR pela razao certa (assertion mismatch, nao import error)
4. So entao implemente o codigo de producao
5. Rode o teste — DEVE PASSAR
6. Refatore se necessario, mantendo teste verde

**Excecoes (raras):**
- Spike/exploracao puramente read-only sem commit
- Hotfix critico em producao com aprovacao explicita do Board

**Como auditar:**
Voce mesmo: antes de POST do commit, busque por "test_X" novo ou modificado no diff. Se nao houver, voce violou IL1.

## Iron Law 2 — Ask-first em ambiguidade

**Regra:** Quando a especificacao tem ambiguidade que muda o comportamento entregue, voce DEVE postar `GATE_REQUEST` e parar. NAO invente decisao.

**Sinal de ambiguidade:**
- "Eu poderia fazer X ou Y, e o briefing nao diz qual"
- "O criterio de aceitacao usa termo X mas X tem 2+ interpretacoes"
- "Um caso de borda nao esta coberto"

**O que NAO eh ambiguidade:**
- Decisao puramente tecnica sem efeito observavel (ex: escolher entre dict vs list internamente). Use bom senso.

**Acao:** Carregar skill `pipeline-orchestrator-contracts`, usar `### GATE_REQUEST v1` no comment, abrir approval request (`request_board_approval`) + status=blocked, exit.

## Iron Law 3 — Self-review antes de marcar done

**Regra:** Antes de mudar status para `done`, voce DEVE re-revisar seu proprio trabalho como se fosse outra pessoa avaliando.

**Checklist self-review (5 perguntas):**
1. Os criterios de aceitacao da issue estao **todos** cumpridos?
2. Os contratos (IL1 TDD, IL5 evidence, etc.) foram respeitados?
3. O diff esta minimo? Algo a remover/simplificar?
4. Os comments postados estao acuracos (sem promessas que nao cumpri)?
5. Memoria do heartbeat foi atualizada (passo 9 do HEARTBEAT)?

Se alguma resposta for "nao", voltar e corrigir antes de done.

## Iron Law 4 — Stop Rule (2 falhas consecutivas)

**Regra:** Ao tentar resolver um problema e falhar **duas vezes seguidas** no mesmo trecho/teste/build, PARE. NAO tente uma terceira vez.

**Acao em vez de tentar de novo:**
1. POST comment com:
   - O que tentei (tentativa 1 e tentativa 2)
   - O que falhou em cada uma
   - Hipotese atual do porque
   - Sugestao de proximo caminho (mudar abordagem, escalar, pedir Board)
2. Status=blocked
3. Abrir approval request (`request_board_approval`) linkando esta issue
4. Exit heartbeat

**Por que:** loops infinitos consomem orcamento e degradam qualidade. Stop Rule eh circuit breaker.

## Iron Law 5 — Evidence-based decisions

**Regra:** Toda afirmacao factual sobre o codebase ou comportamento deve vir acompanhada de evidencia citavel:
- Para codigo: `path/to/file.py:42`
- Para resultado de build/teste: comando + output literal (nao "passou", e sim o output)
- Para decisao de design: pointer pra spec ou comment anterior

**Anti-padrao:** "O conector deve ser async" — sem citar onde isso esta declarado.

**Padrao OK:** "O conector deve ser async (`design.md:18 — 'use asyncio.run para non-blocking'`)"

## Iron Law 6 — Diff minimo

**Regra:** Mude **apenas** o que a issue/contract exige. NAO refatore trechos adjacentes "ja que estou aqui".

**Aplicacao:**
- Tocou em uma funcao? OK mudar so essa funcao. Nao renomear outras 5 do mesmo arquivo.
- Adicionou um teste? OK adicionar teste. Nao reformatar testes existentes.
- Encontrou bug paralelo? Postar comment + criar nova issue. Nao corrigir no mesmo PR.

**Excecoes:** quando o `CHANGE_CONTRACT` explicitamente autoriza refactor escopado.

## Iron Law 7 — Auditoria via comments

**Regra:** Decisoes importantes ficam em comments na issue, NAO em mensagens de chat interno do agente, NAO em memoria privada.

**Por que:** comments sao auditaveis pelo Board e por outros agentes. Memoria privada some no proximo heartbeat se voce nao salvar.

**O que registrar em comment:**
- Hipoteses testadas e descartadas
- Decisoes de design tomadas (mesmo "auto-decididas" que sao bom-senso)
- Trade-offs avaliados
- Razao para mudancas de status

**O que NAO precisa em comment:**
- Pensamentos transitos de raciocinio (ficam no scratch da sessao)
- Comandos de exploracao read-only sem achados

## Resumo (cheat-sheet)

| Lei | Em 5 palavras | Quando lembrar |
|---|---|---|
| IL1 | TDD: RED antes de GREEN | Antes de Write/Edit em codigo |
| IL2 | Ambiguidade vira GATE_REQUEST | Quando "poderia ser X ou Y" |
| IL3 | Self-review antes de done | Antes de PATCH status=done |
| IL4 | Duas falhas, pare | Ao tentar mesmo fix |
| IL5 | Evidencia file:line obrigatoria | Em toda afirmacao factual |
| IL6 | Diff minimo, escopo fixo | Tentado a refatorar adjacente |
| IL7 | Comments sao auditavel, memoria nao | Decisao importante a registrar |
