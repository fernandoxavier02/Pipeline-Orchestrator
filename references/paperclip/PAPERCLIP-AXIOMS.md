# PAPERCLIP-AXIOMS
## Contratos universais inquebraveis para execucao no Paperclip+Codex

**Versao:** 1.1 — 2026-06-15 (v8.0.0: Secao 11 Handoff Discipline / Montagem Progressiva; roster 47 → 50)
**Status:** vigente
**Escopo:** TODOS os 50 cargos da empresa Paperclip "Pipeline Orchestrator", em TODOS os workflows.
**Prioridade:** este documento eh **autoritativo**. Em qualquer conflito entre uma spec de workflow especifica e os axiomas aqui, **os axiomas vencem**.

---

## 1. O Contrato Inquebravel (PRINCIPIO MESTRE)

> **O agente eh PROIBIDO de realizar qualquer acao que NAO esteja:**
> 1. **Na spec do workflow ativo** (`PAPERCLIP-{tipo}-WORKFLOW.md`), OU
> 2. **Em arquivos canonicos do projeto** (CLAUDE.md do projeto cliente, README, instructions globais), OU
> 3. **Na skill `engineering-principles`** (fallback de regras gerais)
>
> **Se a acao desejada nao esta em NENHUMA das 3 fontes, o agente NAO age. Cria approval issue, marca a tarefa atual como `paused`, e pega proxima task da fila.**

Esta eh a regra mais importante de todas. **Improvisar = falha grave.**

---

## 2. Hierarquia de Fontes de Decisao (ordem de consulta)

Toda vez que o cargo precisa decidir o que fazer, consulta nesta ordem:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Spec do workflow ativo                                       │
│     Ex: PAPERCLIP-BUGFIX-WORKFLOW.md para Bug Fix                │
│     Contem: ordem de fases, gates, decisoes pre-aprovadas        │
└─────────────────────────────────────────────────────────────────┘
                          │ (se nao cobre)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Arquivos canonicos do PROJETO CLIENTE                        │
│     Ex: CLAUDE.md, README.md, ARCHITECTURE.md do projeto que     │
│     voce esta atendendo (FX Studio AI, outro cliente, etc.)      │
│     Contem: convencoes especificas daquele cliente               │
└─────────────────────────────────────────────────────────────────┘
                          │ (se nao cobre)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Skill engineering-principles                                  │
│     SOLID, KISS, DRY, YAGNI, SSOT, Clean Architecture, fail-fast │
│     Contem: regras universais cross-projeto                      │
└─────────────────────────────────────────────────────────────────┘
                          │ (se nem aqui cobre)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. ESCALATION (criar approval issue + pegar outra task)         │
│     NAO improvisar.                                              │
└─────────────────────────────────────────────────────────────────┘
```

**Anti-padrao critico:** pular pra "ESCALATION" sem consultar 1-2-3. Tambem pular pra "improviso baseado em senso comum" sem consultar 1-2-3.

---

## 3. Os 4 Axiomas Universais (validos para TODOS workflows)

### Axioma 1 — Ambiguidade recorre a canonicos, nunca a Board (salvo ultimo recurso)

**Quando** cargo encontra ambiguidade tecnica (decisao com 2+ caminhos validos):
- **Faz:** consulta arquivos canonicos do projeto, depois `engineering-principles`
- **Postar comment `### CANONICAL_FALLBACK_APPLIED v1`** com a regra aplicada (ver skill engineering-principles secao 11)
- **NAO faz:** parar pra criar approval issue (so se canonicos nao cobrem)

### Axioma 2 — Adversarial review SEMPRE roda

**Em todo batch implementado**, o trio adversarial (security-scanner + architecture-critic + quality-reviewer) roda automaticamente. Sem excecao. Sem opt-out por Board. Custo de tokens nao eh fator de decisao.

**Implicacao:** `final-adversarial-orchestrator` eh **mandatorio**, nao opt-in (diferente do pipeline original Claude Code).

### Axioma 3 — TDD/ATDD/BDD/DDD sao mandatorios e inegociaveis

Antes de qualquer codigo de producao:
- **TDD** (Test-Driven Development): teste unitario falha primeiro (RED), depois implementacao (GREEN)
- **ATDD** (Acceptance Test-Driven Development): criterios de aceitacao da issue viram testes de aceitacao automatizados
- **BDD** (Behavior-Driven Development): cenarios em Gherkin (Given/When/Then) precedem implementacao
- **DDD** (Domain-Driven Design): linguagem ubiqua do dominio guia naming + estrutura

**Ao final**, **alguns testes viram testes de regressao permanentes** (especialmente os que reproduzem bugs corrigidos — ver `pipeline-orchestrator-bugfix-method` skill).

**Sem excecao:** mesmo hotfix tem 1 teste de regressao minima.

### Axioma 4 — Closeout eh automatico quando todos os checks tecnicos passam

Quando final-validator emite `PA_DE_CAL = GO`:
- Status muda automaticamente para `done`
- Board recebe notificacao na inbox mas **NAO precisa aprovar**
- Auditoria post-hoc eh permitida (Board pode revisar e abrir issue de correcao depois)
- Para mudancas que afetam producao (deploy, migration, prod config), o workflow especifico pode override esse axioma e exigir Board approval — declarar isso na spec do workflow.

---

## 4. Canal de Comunicacao (substitui AskUserQuestion)

**Iron Law:** **NUNCA usar `AskUserQuestion`** durante execucao. O Codex CLI no Paperclip nao tem essa tool e nem o agente deve buscar paradas sincronas.

### 4.1 Quatro modos de comunicacao validos

| Modo | Quando | Como |
|---|---|---|
| **Comment estruturado** | Decisao tomada, log auditavel | POST `/api/issues/{id}/comments` com header `### TIPO v1` + body YAML |
| **Status change** | Indicador de progresso ou bloqueio | PATCH `/api/issues/{id}` com `status: todo | in_progress | blocked | paused | done` |
| **Approval issue (nova issue)** | Decisao real que precisa do Board | POST `/api/companies/{id}/issues` atribuida ao Board com `### ESCALATION_REQUEST v1` |
| **DM via @-mention** | Coordenar com outro cargo em tempo real | Comment com `@cargo-slug` — acorda o outro cargo no proximo heartbeat |

### 4.2 NUNCA fazer:

- Parar a sessao Codex esperando input do Board
- Postar comment "aguardando confirmacao" em status=in_progress
- Marcar issue como blocked sem evidence concreta de bloqueio
- Tentar invocar AskUserQuestion como tool

---

## 5. Escalation Policy (Assincrona, Nao-Bloqueante)

Quando voce **realmente** precisa escalar (caso nao coberto por nenhuma das 3 fontes da hierarquia):

### 5.1 Passo a passo

1. **Crie approval issue** atribuida ao Board, na mesma company:
   ```json
   POST /api/companies/{PIP_COMPANY_ID}/issues
   {
     "title": "[ESCALATION] {{caso especifico}}",
     "description": "...",
     "assignee": "board",
     "parent": "{{issue_atual_em_andamento}}",
     "priority": "high"
   }
   ```

2. **Comment estruturado** na nova issue:
   ```markdown
   ### ESCALATION_REQUEST v1

   ```yaml
   originating_issue: {{id_da_issue_em_andamento}}
   originating_workflow: {{bugfix | feature | audit | ux | spec | adversarial-review}}
   originating_cargo: {{seu_slug}}
   gap_description: "Decisao especifica que nao esta na spec nem nos canonicos"
   options_considered:
     - id: A
       description: "..."
       implications: "..."
     - id: B
       description: "..."
       implications: "..."
   recommendation: "Opcao X porque {{razao}}"
   blocks_other_work: false  # quase sempre false; raro ser true
   ```
   ```

3. **Volta na issue original**, posta um comment de cross-reference:
   ```markdown
   ### ESCALATED v1
   Decisao escalada para Board via issue {{nova_issue_id}}.
   Status: pausado (pegando proxima task disponivel).
   ```

4. **Mude status da issue original para `paused`** (NAO `blocked`).
   - `blocked` = literalmente nao posso fazer nada
   - `paused` = posso fazer outras coisas enquanto espero

5. **Pegue proxima task** da sua inbox (continue Step 4 do heartbeat).

### 5.2 Quando voce vai ser acordado de volta

Quando Board responder na issue de escalation:
- Heartbeat com `PAPERCLIP_APPROVAL_ID` setado
- Read decisao do Board no comment de resposta
- Retoma issue original (status=in_progress)
- Aplica decisao
- Continua

### 5.3 Anti-padrao: escalacao exagerada

Se voce escala **a cada decisao tecnica**, voce esta improvisando o filtro 1-2-3 da hierarquia. Sinal de que voce nao consultou direito a spec ou os canonicos. Auditoria post-hoc do Board pode reverter escolha sua, mas escalacao excessiva eh sinalizado como **falha de competencia do cargo**.

---

## 6. Iron Laws (inalteraveis, herdadas do pipeline original)

As 7 Iron Laws da skill `pipeline-orchestrator-iron-laws` continuam valendo, com **adaptacao do canal** conforme axiomas acima:

| # | Iron Law | Adaptacao no Paperclip |
|---|---|---|
| IL1 | TDD obrigatorio (RED antes de GREEN) | Inalterada. Axioma 3 reforca |
| IL2 | Ask-first em ambiguidade | **MODIFICADA:** ambiguidade vai pra hierarquia (canonicos primeiro, escalation por ultimo). NUNCA AskUserQuestion |
| IL3 | Self-review antes de done | Inalterada |
| IL4 | Stop Rule (2 falhas seguidas) | Modificada: cria approval issue + status=paused + pega proxima task |
| IL5 | Evidence-based decisions (file:line) | Inalterada |
| IL6 | Diff minimo | Inalterada |
| IL7 | Comments sao auditaveis, memoria nao | Inalterada |

---

## 7. Mapping skill obrigatoria → cargo

Pra garantir que toda decisao tenha hierarquia 1-2-3 disponivel, cada cargo **DEVE** carregar:

**SEMPRE (skills universais):**
- `pipeline-orchestrator-contracts` — formato dos comments estruturados
- `pipeline-orchestrator-iron-laws` — disciplinas inalteraveis
- `engineering-principles` — fallback canonico (nivel 3 da hierarquia)
- A **spec do workflow ativo** (carregada via apontamento no `instructionsFilePath` do agent config, conforme escolha do workflow no ato da issue)

**CONFORME CATEGORIA (skills especificas):**
- core/orchestrator → `pipeline-orchestrator-classification`
- executor-* → `pipeline-orchestrator-tdd`
- spec-* → `pipeline-orchestrator-spec-protocol`
- adversarial-* → `pipeline-orchestrator-adversarial`
- bugfix-* → `pipeline-orchestrator-bugfix-method`
- feature-* → `pipeline-orchestrator-vsa`
- ux-* → `pipeline-orchestrator-ux-method`
- audit-* → `pipeline-orchestrator-audit-method`

---

## 8. Sinais de violacao do Contrato Inquebravel (rejeitar)

Se voce, ao executar, encontrar-se fazendo qualquer um destes, **PARE**:

- "Eu acho que..." (sem citar regra)
- "Geralmente se faz assim..." (sem citar fonte)
- "Vou seguir bom senso..." (sem regra explicita)
- "Vou improvisar porque o caso eh raro..." (regra exige consulta hierarquia primeiro)
- "Nao vou consultar a spec porque ja sei..." (sempre consulte)
- "Vou pular o adversarial review porque eh pequeno..." (Axioma 2 — sempre roda)
- "Vou marcar como done sem teste porque eh trivial..." (Axioma 3 — TDD inegociavel)

Cada um destes eh sinal claro de violacao. Reportar imediatamente como ESCALATION_REQUEST.

---

## 9. Estrutura das specs de workflow (referencia)

Toda spec de workflow `PAPERCLIP-{tipo}-WORKFLOW.md` segue esta estrutura:

```
1. Identidade do workflow (quando aplicar)
2. Cargos envolvidos (ordem + responsabilidades)
3. Fluxo passo-a-passo (cada cargo, com input/output esperados)
4. Decisoes pre-aprovadas por gate (tabela "se X entao Y")
5. Definicao de Done (criterios binarios)
6. Anti-padroes proibidos especificos do workflow
7. Anexos/templates (Gherkin scenarios, YAML schemas, etc.)
```

Workflows ativos:
- `PAPERCLIP-BUGFIX-WORKFLOW.md`
- `PAPERCLIP-FEATURE-WORKFLOW.md`
- `PAPERCLIP-AUDIT-WORKFLOW.md`
- `PAPERCLIP-UX-WORKFLOW.md`
- `PAPERCLIP-SPEC-WORKFLOW.md`
- `PAPERCLIP-ADVERSARIAL-WORKFLOW.md`

Workflows futuros: nunca cria-los inline numa sessao Codex. Caso surja necessidade, escalation_request pro Board produzir nova spec.

---

## 10. Princípio mestre operacional

> **A spec eh a unica fonte de verdade do workflow. O canonical eh a unica fonte de verdade de engenharia. O Board eh a unica fonte de verdade do negocio. Voce, cargo, eh apenas o executor disciplinado dessas tres fontes — nunca um decisor autonomo.**

Tudo o que voce produzir (comment, decisao, codigo) deve poder ser trazado de volta a uma destas tres fontes. Auditoria post-hoc passa por isso.

---

## 11. Handoff Discipline / Montagem Progressiva (AXIOMA UNIVERSAL)

**Aplica-se a TODOS os 50 cargos, em TODOS os workflows.** Este axioma fecha a falha estrutural numero 1 observada em producao: *uma issue termina e nunca passa o bastao para o proximo cargo — a cadeia morre em silencio.* A auditoria de calibracao de 54 runs reais (secao 7, "handoff fragil") listou 5 issues paradas exatamente por isso. A causa raiz eh que o "proximo passo" ficava **implicito**: o cargo nao criava a sub-issue seguinte na mesma rodada, e nada estruturalmente obrigava ele a fazer isso.

### 11.1 O Contrato de Handoff (os 4 atos do MESMO heartbeat)

Ao concluir o seu trabalho numa issue, voce **DEVE** executar os quatro atos abaixo **na mesma rodada (heartbeat)**, nesta ordem. Pular ou adiar qualquer um eh violacao grave do Contrato Inquebravel.

1. **Emitir os blocos de fidelidade com o cabecalho EXATO.** Todo bloco usa o formato literal `### BLOCK_NAME v1` — `BLOCK_NAME` em CAIXA_ALTA_COM_UNDERSCORE, sufixo ` v1` obrigatorio, exatamente tres `#`. Exemplos validos: `### CLARIFICATION_DONE v1`, `### SPEC_SEALED v1`. O parser de fidelidade procura esse cabecalho literal; `### block_name v1`, `### BLOCK_NAME` (sem `v1`) ou `#### BLOCK_NAME v1` fazem o parser **perder o bloco** → veredicto MISSING_BLOCK → o Pa de Cal trava o fechamento. Nao traduza, nao minusculize, nao invente variantes.

2. **Declarar um bloco `### NEXT_STEP v1` explicito** nomeando o proximo passo, o cargo que vai assumir, e os bloqueadores que a proxima issue tera:

   ```markdown
   ### NEXT_STEP v1

   next_step: {{nome-do-proximo-passo}}
   assignee: {{slug-do-proximo-cargo}}
   blockedByIssueIds: [{{ids das issues que precisam fechar antes — para no linear, eh a issue ATUAL}}]
   expected_outcome: {{1 linha do que se espera de volta}}
   ```

   Se o proximo passo eh um fan-in (varios irmaos paralelos convergindo num no de juncao), nomeie **TODOS** os irmaos e o no de juncao, com os bloqueadores de cada um.

3. **CRIAR a proxima sub-issue de verdade**, no MESMO heartbeat, via a API (ver `pipeline-orchestrator-contracts` §2 DISPATCH_REQUEST), com `blockedByIssueIds` = a lista exata declarada no NEXT_STEP. **Nunca deixe o proximo passo apenas implicito** confiando que o agendador de heartbeat vai "inferir" — ele nao infere. Em fan-in, crie **todos** os irmaos E o no de juncao na mesma rodada (atomicidade — ver 11.3).

4. **So entao** PATCH do seu proprio status para `done`. A ordem importa: o status vira `done` **depois** que a proxima issue foi criada e o `issueId` dela foi confirmado e logado. `done` antes da criacao = cadeia orfa.

### 11.2 Quando o proximo passo nao pode ser criado

Se a criacao da proxima issue falhar (erro de validacao, falha de API, role que nao resolve), voce **NAO** marca `done` e **NAO** deixa implicito. Em vez disso:

- PATCH do seu status para `paused` (nao `blocked` — ver Axioma §5),
- comente o motivo concreto da falha (`### HANDOFF_BLOCKED v1` com o erro),
- e escale conforme §5 se o motivo nao estiver coberto pela hierarquia 1-2-3.

A regra de ouro: **a cadeia so avanca por criacao explicita, nunca por inferencia; e se nao da pra avancar, isso fica registrado, nunca silencioso.**

### 11.3 Atomicidade em fan-in (criacao paralela)

Quando o proximo passo eh um grupo paralelo que converge num no de juncao, a criacao busca ser **tudo-ou-nada**, mas e importante ser preciso sobre ate onde a garantia vai. Nao existe transacao server-side: a API cria issue por issue. A protecao tem duas camadas e cobre coisas diferentes.

**Camada 1 — pre-voo (elimina os parciais da classe de validacao).** ANTES de criar qualquer issue: resolva TODOS os roles dos irmaos, valide TODOS os bloqueadores, e confirme que o no de juncao lista no `blockedByIssueIds` **todos** os irmaos. So depois que tudo valida, comece a criar. Se a validacao falha, **nenhuma** issue eh criada — um role ausente, um bloqueador invalido ou um stepmap incompleto NUNCA deixa parcial.

**Camada 2 — compensacao best-effort (cobre a falha de transporte no meio).** Mesmo com o pre-voo verde, uma falha de **transporte/rede** entre o POST do irmao#1 e o do irmao#2 ainda pode criar parte do grupo. Nesse caso o `tree-factory` faz compensacao best-effort: tenta apagar os irmaos ja criados para reverter o grupo ao estado vazio. Se algum DELETE tambem falha, esses IDs ficam **registrados no erro** (`partialGroupCompensation.undeletable`) e **exigem limpeza/escalacao manual** — nunca sao silenciados. Ou seja: o pre-voo garante "nada parcial por validacao"; a compensacao reverte a maioria das falhas de transporte; o residuo que nem a compensacao reverte vira escalacao explicita, jamais uma juncao orfa silenciosa.

> A motivacao de design ("Montagem Progressiva"): cada no, ao concluir, deterministicamente monta o proximo no na mesma rodada. A spec `.kiro/specs/paperclip-task-tree-factory/design.md` ("Montagem Progressiva (NEXT_STEP)") eh a mitigacao estrutural correspondente — o tree-factory cria o proximo no no mesmo ciclo, e este axioma eh o contrato de comportamento que os cargos seguem para que a trava estrutural e a disciplina manual se reforcem mutuamente. Nenhuma das duas camadas sozinha basta.

### 11.4 Definition of Done do handoff (afirme os 4 antes de declarar `done`)

- [ ] Blocos de fidelidade emitidos com cabecalho EXATO `### BLOCK_NAME v1`?
- [ ] Bloco `### NEXT_STEP v1` emitido com assignee + blockedByIssueIds + expected_outcome?
- [ ] Proxima sub-issue (ou todos os irmaos + juncao, em fan-in) criada NESTE heartbeat, com `issueId` confirmado?
- [ ] Status PATCH para `done` SO depois da criacao confirmada (ou `paused` + motivo se falhou)?

Os quatro precisam estar verdadeiros. Tres de quatro = cadeia fragil = a issue para e nao passa o bastao.
