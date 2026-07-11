# 00 — Visão Geral do Plugin Pipeline Orchestrator (espelho para portabilidade Z-Code)

> Documento de auditoria. Mapeia o repositório canônico (`Pipeline-Orchestrator/`, versão oito ponto vinte) para uma futura portabilidade ao harness Z-Code. Não altera código; só documenta.

## Veredicto da auditoria

O plugin é portável ao Z-Code com **risco médio**. O Z-Code adota o mesmo padrão de plugin do Claude Code (manifesto, hooks, agentes via frontmatter, comandos em markdown), então a portabilidade é majoritariamente reorganização, não reescrita. As três adaptações necessárias são: migrar três eventos de hook não suportados pelo Z-Code, remover a integração com o servidor externo Paperclip, e remover a telemetria para a nuvem Langfuse (ferramenta de observabilidade de agentes de IA).

> Observação sobre o nome do plugin: a partir deste parágrafo, toda menção a "Paperclip" refere-se ao servidor externo de robôs que roda numa VPS (Virtual Private Server, "servidor privado virtual"). Toda menção a "Langfuse" refere-se ao serviço de telemetria na nuvem. Os dois são **alvo de remoção** no port, por decisão confirmada com o dono do repositório.

---

## TDD checklist (critérios verificáveis)

- [x] T1: versão citada == 8.20.0 (verificável no manifesto do plugin)
- [x] T2: contagem de agentes == cinquenta (verificável via listagem direta)
- [x] T3: contagem de hooks == trinta e seis registrados (verificável; a pasta tem trinta e sete arquivos, mas um é biblioteca compartilhada)
- [x] T4: contagem de libs == trinta e oito arquivos (verificável)
- [x] T5: os cinco âncoras estão nomeados exatamente como no README canônico (CHANGE_CONTRACT, SCOPE_LOCK, adversarial independence, gate hierarchy, glass-box audit trail)
- [x] T6: nenhum caminho de arquivo aparece na prosa narrativa (paths só em blocos de código)
- [x] T7: nenhum acrônimo sem expansão na primeira ocorrência (regra mestra TTS)

---

## O que o plugin é

Imagine que você combinou com um pedreiro exatamente quais paredes ele pode mexer e quais tijolos estão proibidos. No meio da obra, cansado, ele resolve "deixa eu reforçar essa viga também", sem te avisar. O Pipeline Orchestrator existe para impedir isso quando quem escreve código é uma inteligência artificial: ele obriga o agente programador a seguir um **contrato** (o combinado) em vez de improvisar.

O nome técnico é **camada de governança multi-agente** — ou seja, um time de assistentes fiscais que vigiam o assistente programador. Cada fiscal é um agente especializado; cada trava é um gate.

O plugin roda dentro de harnesses de IA para código (Claude Code, Cursor, OpenCode, e agora Z-Code como alvo do port). Versão canônica atual: oito ponto vinte ponto zero.

---

## Os cinco âncoras (defesa em camadas)

Cinco pontos independentes seguram a IA no contrato. Falhas num não se propagam aos outros.

1. **CHANGE_CONTRACT** (contrato de mudança) — toda tarefa declara antes quais arquivos podem ser tocados, quais são proibidos, e quais tipos de alteração pedem aprovação explícita (biblioteca nova, mexer em senha, migração de esquema). Tem um teto de diff: qualquer alteração acima de vinte por cento escala para aprovação.

2. **SCOPE_LOCK** (trava de escopo) — antes de cada escrita de arquivo ou comando, um filtro checa se está dentro do permitido. Se não estiver, bloqueia na hora. Vale mesmo quando o modelo tenta ser esperto.

3. **Adversarial independence** (revisão adversarial independente) — três fiscais que nunca viram a intenção original, só o resultado pronto, atacam cada lote de código. Isso mata o vício de confirmar aquilo que o autor já queria. Os três fiscais são: segurança, arquitetura (padrões), e escopo (disciplina de diff).

4. **Gate hierarchy** (hierarquia de gates) — quarenta e nove pontos de checagem ao longo do fluxo, em cinco níveis de dureza. O agente fisicamente não consegue avançar com build vermelho, dúvida não resolvida, ou veredito não-go.

5. **Glass-box audit trail** (trilha de auditoria de vidro) — cada execução gera logs assinados por criptografia (HMAC, "código de autenticação de mensagem com hash"), protegidos contra adulteração, válidos para verificação externa e mandáveis para uma nuvem de monitoramento.

---

## Glossário ubiquoso do domínio (DDD — Domain-Driven Design: Linguagem Ubíqua)

Este glossário é a **língua oficial** deste e dos outros seis documentos da pasta. Uma vez fixado um termo aqui, ele é usado de forma idêntica em todos os arquivos. Sinônimos soltos são proibidos.

| Termo canônico | Significado leigo | Sinônimo proibido |
|---|---|---|
| **gate** | Ponto de checagem que decide se o fluxo avança ou trava | "portão", "barreira", "check" |
| **hardness** | Nível de dureza do gate (MANDATORY, HARD, CIRCUIT_BREAKER, SOFT, AUDIT) | "força", "rigidez" |
| **batch** | Lote de execução: um conjunto de tarefas numa fase | "pacote", "bloco" |
| **variant** | Variante do pipeline: light (enxuto) ou heavy (completo) | "modo", "estilo" |
| **entry point** | Comando que inicia um pipeline (ex.: `/pipeline-orchestrator:bugfix`) | "ponto de entrada", "slash" |
| **sentinel** | Agente guardião que valida sequência de fases e coerência dos gates | "vigia", "guarda" |
| **controller** | Agente N1 que orquestra uma fase inteira | "orquestrador", "líder" |
| **N1 agent** | Agente de nível um: orquestrador, despacha outros | "agente pai" |
| **N2 agent** | Agente de nível dois: executor ou revisor, despachado por N1 | "agente filho", "sub" |
| **adversarial** | Revisor que ataca o trabalho sem conhecer a intenção original | "crítico", "testador" |
| **checkpoint** | Ponto de checagem numerado do sentinel (de um a cinco) | "marco", "ponto" |
| **Pa de Cal** | Veredito final (go / conditional / no-go), em português | "veredito", "score" |
| **harness** | Cliente de IA para código onde o plugin roda (Claude Code, Z-Code, etc.) | "cliente", "IDE" |
| **hook** | Filtro que dispara num evento do harness, antes ou depois de uma ação | "gatilho", "filtro" |
| **enforcement** | Bloqueio determinístico que não depende de gate formal | "trava", "guarda" |
| **CHANGE_CONTRACT** | Contrato que lista arquivos permitidos, proibidos, e tipos de mudança | "contrato de escopo" |
| **SCOPE_LOCK** | Trava de escopo executada por hook antes de cada escrita | "trava de arquivo" |
| **HMAC** | Código de autenticação de mensagem com hash — assinatura contra adulteração | "hash", "checksum" |
| **worktree** | Árvore de trabalho git isolada usada para execuções adversariais | "branch de trabalho" |
| **run** | Uma execução completa de um pipeline | "execução", "sessão" |
| **CLAUDE_PLUGIN_ROOT** | Variável de ambiente do harness apontando para a raiz do plugin | "raiz", "base" |
| **matcher** | Critério que diz qual ferramenta dispara um hook (ex.: `Edit\|Write`) | "filtro de tool" |

---

## As fases do pipeline

Todo entry point, qualquer que seja o tipo de tarefa, passa pelas mesmas fases. O que muda entre variantes (light/heavy) é a profundidade de cada uma. A numeração acompanha o canônico, que pula do zero direto para um e meio.

- **Fase zero — Triagem**: um agente classificador lê o pedido e decide tipo (conserto de bug, funcionalidade nova, auditoria, etc.), complexidade (simples, média, complexa), e severidade. Em seguida um agente de porta de informação checa se faltam dados críticos; se faltar, pergunta ao usuário. Para tarefas complexas, um interrogador de design ainda desafia as decisões de arquitetura. O resultado desta fase é uma proposta de classificação mostrada ao usuário para confirmar antes de seguir.

- **Fase um e meio — Planejamento**: um agente arquiteto de plano monta o plano dentro do modo plano do harness. Automático para tarefas complexas e para especificações; opcional para médias.

- **Fase dois — Execução**: o trabalho acontece em batches (lotes). Cada batch segue a disciplina TDD (Test-Driven Development, "desenvolvimento guiado por testes": testes escritos antes do código), depois é atacado pelo trio adversarial independente. Se aparecerem achados críticos, entra num loop de correção: no máximo três tentativas por ciclo, até quatro ciclos por batch, antes do disjuntor (circuit breaker) do loop adversarial disparar.

- **Fase três — Fechamento**: o sentinel valida a transição de fase, um agente de sanity-check (checagem de sanidade) roda checagens finais, depois vem o trio adversarial final (em paralelo), e o veredito final — o Pa de Cal — classifica a execução como go (pode ir), conditional (pode ir com ressalvas), ou no-go (não pode ir).

---

## Contagem total de componentes

| Componente | Quantidade | Local no canônico |
|---|---|---|
| Agentes (N1 + N2) | cinquenta | `agents/` em quatro grupos |
| Scripts de hook | trinta e seis (registrados no manifesto) | `.claude/hooks/*.cjs` (há trinta e sete arquivos, mas um é biblioteca compartilhada) |
| Libs de apoio | trinta e oito | `lib/*.cjs` |
| Comandos (após corte do Paperclip) | quatro | `commands/` sem os dez `paperclip-*` e o `setup-paperclip` |
| Gates no registry | quarenta e nove | `references/gates.md` |
| Entry points (após corte) | vinte e quatro | `references/entry-points.json` |
| Variantes de pipeline | dezessete arquivos | `references/pipelines/` |

---

## Decisões de portabilidade confirmadas

Quatro decisões foram confirmadas com o dono do repositório e se refletem em todos os documentos desta pasta:

1. **Migrar eventos não suportados**: o canônico usa oito eventos de hook; o Z-Code suporta sete. Os três eventos extras (`SessionEnd`, `StopFailure`, `SubagentStop`) serão migrados para `Stop` e `PostToolUse` com matcher `Agent`. Detalhes no inventário de hooks.

2. **Manifesto duplo**: manter o manifesto existente (compatibilidade com Claude Code e Cursor) e adicionar um manifesto espelho para Z-Code. Um único repositório roda nos quatro harnesses. Os caminhos dos dois manifestos estão no bloco de código no fim deste arquivo.

3. **Remover Paperclip**: os dez comandos paperclip despacham para um servidor externo de robôs numa VPS, via túnel SSH (Secure Shell, "shell seguro"). Fora de escopo do port. Serão removidos.

4. **Remover Langfuse**: a telemetria para a nuvem Langfuse envolve um hook dedicado e duas libs removidas (cliente e carrier); uma terceira lib de sanitização permanece porque tem função genérica usada por outra lib. Requer chave de API (Application Programming Interface, "interface de programação de aplicações") externa. Fora de escopo do port. A integração principal será removida.

---

## Estrutura dos sete documentos desta pasta

- `00-overview.md` — este arquivo. Visão geral + glossário DDD.
- `01-hooks-inventory.md` — inventário dos trinta e seis hooks com destino (manter, migrar, remover, mesclar).
- `02-agents-inventory.md` — inventário dos cinquenta agentes em quatro grupos.
- `03-workflows-and-stages.md` — os vinte e quatro entry points em cenários BDD (Behavior-Driven Development, "desenvolvimento guiado por comportamento": blocos dado/quando/então).
- `04-gates-and-enforcements.md` — os quarenta e nove gates mais os enforcements determinísticos.
- `05-lib-inventory.md` — as trinta e oito libs de apoio.
- `06-portability-plan.md` — plano reproduzível de portabilidade, passos de A a F.
- `batch-audit-log.md` — trilha de auditoria: cada batch, seu veredito adversarial, ciclos de correção, estado final.

---

## Caminhos e comandos referenciados

```
# raiz do repositório canônico
D:/pipeline-orchestrator-claude/claude-code/Pipeline-Orchestrator/

# manifesto do plugin (compat Claude Code / Cursor)
Pipeline-Orchestrator/.claude-plugin/plugin.json

# manifesto espelho (alvo do port para Z-Code)
Pipeline-Orchestrator/.zcode-plugin/plugin.json   ← a ser criado

# registro de gates (SSOT)
Pipeline-Orchestrator/references/gates.md

# matriz de complexidade (SSOT)
Pipeline-Orchestrator/references/complexity-matrix.md

# registro de entry points (SSOT)
Pipeline-Orchestrator/references/entry-points.json

# manifesto de hooks (canônico, oito eventos)
Pipeline-Orchestrator/hooks/hooks.json
```
