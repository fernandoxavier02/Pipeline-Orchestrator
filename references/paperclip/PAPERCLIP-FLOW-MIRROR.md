# Paperclip Flow-Mirror

**Versao:** 1.0 — 2026-06-01 (entregue em v7.9.0)
**Escopo:** como o pipeline-orchestrator e espelhado no Paperclip como uma arvore de issues que os robos da VPS executam.

O flow-mirror pega o pipeline standalone (que o Claude Code roda localmente, fase por fase) e o reescreve como uma **arvore de tarefas** no Paperclip. Em vez de o Claude executar o trabalho, ele monta a arvore e os agentes-cargos remotos executam cada no em cascata. O Claude so faz a montagem; toda a execucao acontece nos robos da empresa "Pipeline Orchestrator" na VPS.

Tudo descrito aqui e verificavel nos 5 modulos de `references/paperclip/spec/lib/` e nos 8 comandos `commands/paperclip-*.md`.

---

## 1. Os 14 fluxos espelhados

Cada fluxo e um molde declarativo de nos em `tree-template.cjs`. Os 6 tipos de tarefa tem duas variantes (`light`/`heavy`); `hotfix` e `review-only` sao modos de molde unico (sem variante). Total: **14 fluxos**.

| Fluxo (chave do molde) | Nos | O que faz |
|---|---|---|
| `bugfix.light` | 17 | Diagnostico → conserto com TDD → regressao → revisao adversarial (trio) → Pa de Cal → fechamento. Sem plan-architect. |
| `bugfix.heavy` | 23 | Como o light + interrogacao de design + analise de causa-raiz + revisao por lote em paralelo (checkpoint fan-in). |
| `feature.light` | 20 | Cenarios TDD → plano aprovado → implementacao → revisao orquestrada + fix-loop → sanity → trio adversarial → Pa de Cal → closeout. |
| `feature.heavy` | 24 | Como o light + interrogacao de design + planejamento de fatias verticais + revisao por lote paralela (arquitetura ‖ disciplina de diff) + validacao de integracao. |
| `user-story.light` | 22 | Subset de Feature partindo de narrativa; inclui planejador de fatias verticais e implementador. |
| `user-story.heavy` | 26 | Como o light + interrogacao de design + revisao por lote paralela + validacao de integracao end-to-end. |
| `audit.light` | 13 | Somente-leitura: intake → compliance → matriz de risco → Pa de Cal → 2 relatorios (tecnico + executivo). Sem TDD, sem trio adversarial. |
| `audit.heavy` | 16 | Como o light + interrogacao de design + analista de dominio dedicado. |
| `ux.light` | 11 | Somente-leitura: simulacao → validacao de QA → Pa de Cal → 2 relatorios. |
| `ux.heavy` | 12 | Como o light + interrogacao de design + auditoria de acessibilidade rodando em paralelo com a simulacao (juncao na validacao de QA). |
| `spec.light` | 11 | Brainstorm → validacao de formato → validacao pos-implementacao → fechamento da spec. |
| `spec.heavy` | 16 | Como o light + interrogacao de design + revisao de conteudo da spec + mais sentinels intermediarios. |
| `hotfix` | 12 (exatos) | Modo de emergencia: tipo/complexidade forcados, pula design e planejamento, mantem conserto + trio adversarial + Pa de Cal. |
| `review-only` | 4 (exatos) | Revisao adversarial standalone de codigo ja escrito: detecta o diff → 3 revisores em paralelo → consolida → relatorio. Nao corrige, nao comita. |

Os fluxos somente-leitura (`audit`, `ux`, `review-only`) suprimem TDD e o loop de conserto por design — isso baixa o teto de fidelidade dessas execucoes, o que e esperado e nao e falha. O `review-only` nem emite `ORCHESTRATOR_DECISION` (a fase de classificacao e pulada), entao a regua de fidelidade marca complexidade indeterminada para ele — tambem por design.

Aliases historicos (`SIMPLES` = 5 nos, `MEDIA` = 6, `COMPLEXA` = 7) sao os moldes originais de Feature preservados para compatibilidade com testes antigos; os 14 fluxos acima sao o modelo atual.

---

## 2. A arvore de issues e as travas `blockedByIssueIds`

Cada no do molde vira um cartao (issue) no Paperclip, atribuido a um cargo real do roster de 47. A ordem de execucao e garantida exclusivamente por **travas**: cada cartao declara em `blockedByIssueIds` quais cartoes precisam concluir antes dele desbloquear. E o efeito domino — assim que um robo conclui sua etapa, o cartao seguinte (que estava travado por ele) libera para o cargo seguinte.

Dois formatos de trava:

- **Tronco linear** — o caso comum. O cartao tem um unico bloqueador: o cartao anterior na cadeia. `nodeSpec(...)` resolve `blockedByIssueIds = [prevIssueId]` (ou `[]` na raiz).
- **Fan-in real (juncao)** — onde o pipeline roda em paralelo. O cartao de juncao e bloqueado por TODOS os irmaos paralelos ao mesmo tempo, e so desbloqueia quando todos concluem. No molde, esses nos tem `blockedBy` como ARRAY de steps. `nodeSpecFanIn(...)` resolve cada step do array para o ID do cartao correspondente via um mapa step→issueId; se faltar um irmao no mapa, ele lanca erro em vez de criar um fan-in parcial.

Os pontos de paralelismo espelham o pipeline standalone: o **trio adversarial** (seguranca ‖ arquitetura ‖ qualidade) converge numa juncao adversarial final; a **revisao por lote** das variantes heavy (arquitetura ‖ disciplina de diff) converge num checkpoint; e em `ux.heavy` a simulacao roda em paralelo com a auditoria de acessibilidade, convergindo no validador de QA.

Fatias dinamicas: quando o plano define N fatias de implementacao, `expandSlices(...)` gera N cartoes irmaos de implementacao (nenhum trava o outro, todos travados pelo mesmo cartao anterior) e os faz convergir corretamente — ou direto na juncao a jusante, ou, nas variantes heavy que exigem revisores intermediarios, passando primeiro pelos revisores de lote (que sao bloqueados por todas as N fatias). Modos especiais (`hotfix`, `review-only`) nao sao fatiaveis, e so o cargo `feature-implementer` e fatiavel (o `executor-fix` itera por dentro do proprio cartao, nao em cartoes paralelos).

---

## 3. Os 5 modulos

Todos puros (sem rede, exceto o transport injetado), em `references/paperclip/spec/lib/`. As dependencias formam uma cadeia sem ciclos: `tree-template` ← `tree-factory` ← `tree-factory-io` ← `grow-tree`; `classify-bridge` e independente.

| Modulo | Papel | Notas |
|---|---|---|
| `classify-bridge.cjs` | Heuristica de atalho que decide `{type, complexity}` por palavras-chave, aceitando override explicito do piloto. | Tipos validos: Bug Fix, Feature, User Story, Audit, UX Simulation, Spec. Complexidades: SIMPLES, MEDIA, COMPLEXA. Nao chama rede, nao le projeto, nao invoca o task-orchestrator — a fonte de verdade de classificacao continua sendo o agente `task-orchestrator`; este modulo so estima rapido para o despacho. |
| `tree-template.cjs` | Os moldes declarativos dos 14 fluxos (dados puros). | Indexado por `TEMPLATES[type][variant]`; `hotfix` e `review-only` sao arrays diretos. Cada no traz `{ step, role, blocks, blockedBy, next, [parallel] }`. `getTemplate(type, variant)` normaliza capitalizacao/espacos. |
| `tree-factory.cjs` | Logica pura que decide qual no criar a seguir e monta o payload do cartao. | `nextStep`, `allParallelSteps` (irmaos paralelos), `nodeSpec` (cartao linear), `nodeSpecFanIn` (cartao de juncao com fan-in real), `expandSlices` (fatias dinamicas). O corpo do cartao instrui o cargo a emitir o(s) bloco(s) de fidelidade e declara o `NEXT_STEP`. |
| `tree-factory-io.cjs` | Camada de I/O: resolve nome de cargo → UUID real, traduz o corpo para `description`, cria a issue via transport injetavel e percorre a espinha. | `assertSafeId` valida `/^[A-Za-z0-9_-]{1,64}$/` em companyId e agentId antes de qualquer chamada de rede (anti-injection). Nunca instancia transport direto — recebe por parametro (testes usam fake, producao usa HTTP). Confirma o `id` no corpo da resposta 201 antes de declarar sucesso (verification-before-claim). |
| `grow-tree.cjs` | Interface de linha de comando: junta classificacao de roster, montagem e criacao da proxima issue. | Aceita `companyId complexity[.variant] [currentStep] [prevIssueId] [stepMapJson]`. Sem `--confirm` faz dry-run (zero POST); com `--confirm` busca o roster (`GET /agents`) e cria o cartao (`POST /issues`). Saida em JSON com `{ step, issueId, title, nextStep }` (ou `steps[]`/`issueIds[]`/`stepMap` para grupos paralelos). |

---

## 4. Os 8 comandos slash

Um por familia de fluxo + o indice. Todos vivem em `commands/paperclip-*.md` e despacham para a empresa Pipeline Orchestrator na VPS.

| Comando | Fluxo |
|---|---|
| `/pipeline-orchestrator:paperclip-overview` | Indice dos 8 comandos (somente leitura) |
| `/pipeline-orchestrator:paperclip-bugfix` | `bugfix.light` / `bugfix.heavy` |
| `/pipeline-orchestrator:paperclip-feature` | `feature.light` / `feature.heavy` |
| `/pipeline-orchestrator:paperclip-user-story` | `user-story.light` / `user-story.heavy` |
| `/pipeline-orchestrator:paperclip-audit` | `audit.light` / `audit.heavy` |
| `/pipeline-orchestrator:paperclip-ux` | `ux.light` / `ux.heavy` |
| `/pipeline-orchestrator:paperclip-spec` | `spec.light` / `spec.heavy` |
| `/pipeline-orchestrator:paperclip-hotfix` | `hotfix` (modo, sem variante) |
| `/pipeline-orchestrator:paperclip-review` | `review-only` (modo, sem variante) |

Os seis comandos de tipo classificam a complexidade por heuristica local ou aceitam override `--simples` / `--media` / `--complexa`. SIMPLES e MEDIA caem em `light`; COMPLEXA cai em `heavy` (no Audit, SIMPLES nem usa o pipeline). `hotfix` e `review` nao classificam complexidade e ignoram flags de variante. Flags que nao se aplicam (`--grill`, `--plan`, `--no-plan`) sao ignoradas silenciosamente.

Alem dos comandos dedicados, o `/pipeline` principal aceita a flag `--on=paperclip`: o controlador classifica localmente via `classify-bridge`, monta o cartao-raiz via `tree-factory` e emite o bloco `PAPERCLIP_DISPATCH` — fazendo um early return ANTES de qualquer fase local (sem `sentinel-state.json`, sem `gate-decisions.jsonl`). O cargo do cartao-raiz e sempre `task-orchestrator` (o passo `classificar` em todos os moldes).

---

## 5. O guard dry-run → confirmacao explicita

**Regra inquebravel: nenhum cartao e criado na VPS sem confirmacao explicita do usuario.** Os 8 comandos seguem sempre o mesmo fluxo:

1. **Classificar / derivar a variante localmente** — heuristica de `classify-bridge` ou override `--simples/--media/--complexa`. Se a classificacao automatica parecer errada, o comando pergunta via `AskUserQuestion` antes de seguir.
2. **Dry-run** — roda `grow-tree` SEM `--confirm`. Isso nao faz nenhum POST na API; so retorna o JSON do que seria criado (primeiro cartao, titulo, proximo passo). O comando apresenta ao usuario em linguagem simples qual variante foi escolhida, o nome do primeiro cartao, quantos cartoes o fluxo tem no total e que a execucao acontecera nos robos.
3. **Confirmacao explicita** — `AskUserQuestion` com duas opcoes: "Criar no Paperclip" ou "Cancelar". Se o usuario cancelar, o comando encerra sem criar nada e nao tenta alternativas.
4. **Criar a raiz** — somente apos a confirmacao, roda `grow-tree ... --confirm`. Ai sim ele busca o roster (`GET /agents`) e cria o primeiro cartao (`POST /issues`). Devolve o ID do cartao e o cargo responsavel pelo primeiro passo.

A partir da raiz, os robos criam os cartoes seguintes em cascata — cada um trava o proximo via `blockedByIssueIds` — sem intervencao manual entre os passos. O usuario acompanha pelo painel web.

O guard tambem existe na camada do CLI: `grow-tree.cjs` so faz POST quando `--confirm` esta presente (invariante C1/C2). Sem a flag, e dry-run garantido.

**Pre-requisito operacional:** o tunel SSH para a VPS precisa estar ativo antes do passo 4. Se o `grow-tree` falhar com erro de conexao na hora de criar a raiz, o problema costuma ser o tunel caido.

---

## 6. Onde isso se encaixa

A integracao Paperclip foi entregue em camadas: a **camada de integracao** (v7.6.0) permitiu rodar os cargos via adapter; o **provisionador** (v7.8.0, `references/paperclip/scripts/provision-pipeline-company.cjs`) sobe a empresa inteira com os 47 cargos de uma vez; e o **flow-mirror** (v7.9.0, descrito aqui) espelha o pipeline inteiro como arvore de issues que os robos executam. Os tres sao aditivos — a Iron Law (zero mudancas em `agents/`, `skills/`, `references/` originais) e preservada.
