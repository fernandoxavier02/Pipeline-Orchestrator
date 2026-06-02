---
description: "Índice dos 8 comandos paperclip-* que despacham uma árvore de tarefas para os robôs do Paperclip na VPS. Cada comando classifica localmente, mostra a árvore em dry-run e só cria os cartões após confirmação explícita do usuário."
allowed-tools: Read
---

# Paperclip — Índice dos Comandos de Despacho

Os 8 comandos `paperclip-*` montam uma **árvore de tarefas** e despacham para os robôs do Paperclip rodando na VPS (empresa Pipeline Orchestrator, `019c6f31-41ed-497a-93ba-cb4eff651a7c`). O Claude só faz a montagem; toda a execução acontece nos agentes remotos. O acompanhamento é pelo painel web (`http://127.0.0.1:3100`, com túnel SSH ativo).

**Todos os 8 comandos despacham para o Paperclip e EXIGEM confirmação explícita antes de criar qualquer cartão.** O fluxo é sempre: classificar/derivar a variante localmente → rodar `grow-tree` em **dry-run** (sem `--confirm`, nenhum POST na API) → apresentar a árvore ao usuário → pedir confirmação via `AskUserQuestion` → só então rodar `grow-tree ... --confirm` para criar a raiz. Cancelar em qualquer ponto encerra sem criar nada.

---

## Índice

| Comando | Fluxo (chave do molde) | Quando usar | Resumo |
|---|---|---|---|
| `/pipeline-orchestrator:paperclip-bugfix` | `bugfix.light` / `bugfix.heavy` | Corrigir um defeito em código existente | Diagnóstico → conserto com TDD → regressão → adversarial → Pa de Cal. Heavy acrescenta interrogação de design e análise de causa-raiz. |
| `/pipeline-orchestrator:paperclip-feature` | `feature.light` / `feature.heavy` | Construir funcionalidade nova com critérios já estruturados | Cenários TDD → plano aprovado → implementação por fatias → adversarial → Pa de Cal. Heavy acrescenta interrogação de design, planejamento de fatias verticais e validação de integração. |
| `/pipeline-orchestrator:paperclip-user-story` | `user-story.light` / `user-story.heavy` | Funcionalidade descrita como narrativa ("Como usuário, quero…") | Igual à Feature, mas deriva os critérios de aceite a partir da narrativa antes de implementar. Heavy acrescenta design e validação de integração end-to-end. |
| `/pipeline-orchestrator:paperclip-audit` | `audit.light` / `audit.heavy` | Auditar um módulo sem mudar código (só relatórios) | Somente-leitura: intake → compliance → matriz de risco → relatório técnico + executivo. Heavy usa um analista de domínio dedicado. SIMPLES não usa pipeline. |
| `/pipeline-orchestrator:paperclip-ux` | `ux.light` / `ux.heavy` | Simular jornadas de usuário e produzir relatório de experiência | Somente-leitura: simulação → validação de QA → Pa de Cal. Heavy roda simulação e auditoria de acessibilidade em paralelo. |
| `/pipeline-orchestrator:paperclip-spec` | `spec.light` / `spec.heavy` | Gerar uma especificação completa (requisitos + design + tarefas) | Brainstorm → validação de formato → validação pós-implementação → fechamento. Heavy acrescenta interrogação de design e revisão de conteúdo (12 eixos). |
| `/pipeline-orchestrator:paperclip-hotfix` | `hotfix` (modo, sem light/heavy) | Emergência crítica em produção | Tipo, complexidade e severidade fixos (Bug Fix / COMPLEXA / Critical). Fluxo compactado de 12 nós: pula design e planejamento, mantém conserto + trio adversarial + Pa de Cal. |
| `/pipeline-orchestrator:paperclip-review` | `review-only` (modo, sem light/heavy) | Revisão adversarial de mudanças já escritas, sem correções | 4 nós: detecta o diff → 3 revisores em paralelo (segurança, arquitetura, qualidade) → consolida → relatório. Não corrige, não comita, não emite Pa de Cal formal. |

---

## Como escolher

Os seis primeiros comandos têm duas variantes (light/heavy) decididas pela complexidade — classificada por heurística local ou forçada com `--simples`, `--media` ou `--complexa`. SIMPLES e MEDIA caem em **light**; COMPLEXA cai em **heavy** (no Audit, SIMPLES nem usa pipeline).

Os dois últimos (`hotfix` e `review`) são **modos de molde único**: não classificam complexidade e não aceitam flags de variante. O hotfix é o caminho de emergência; o review é uma revisão adversarial standalone que devolve só um relatório de achados.

Os comandos somente-leitura (audit, ux, review) não escrevem código de produção, então os ciclos de TDD e o loop de conserto são suprimidos por design — isso baixa o teto de fidelidade dessas execuções, o que é esperado e não é falha.

---

## Pré-requisito comum

Antes de confirmar a criação, o túnel SSH para a VPS precisa estar ativo (`ssh hostinger-vps -L 3100:127.0.0.1:3100`). Se o `grow-tree` falhar com erro de conexão na hora de criar a raiz, o problema costuma ser o túnel caído.

Cada comando, ao criar a raiz, devolve o ID do cartão criado e o cargo responsável pelo primeiro passo. A partir daí os robôs criam os cartões seguintes em cascata (cada um trava o próximo via `blockedByIssueIds`) — sem intervenção manual entre os passos. O usuário acompanha pelo painel web.
