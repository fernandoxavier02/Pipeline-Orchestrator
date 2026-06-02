# Paperclip+Codex Adaptation Spec
## Como traduzir o pipeline-orchestrator original para o modelo Paperclip+Codex

**Versao:** 0.1 — 2026-05-22 (status revisado em 2026-06-02)
**Status:** piloto ja rodou na VPS (empresa Pipeline Orchestrator, 47 cargos provisionados). O modelo de execucao evoluiu: a aposta inicial era espelhar o pipeline so via **comentarios estruturados** na issue; desde a v7.9.0 a execucao real e uma **arvore de tarefas** — cada passo do pipeline vira um cartao atribuido a um cargo, com travas `blockedByIssueIds` ditando a ordem (ver `PAPERCLIP-FLOW-MIRROR.md`). A tabela de traducao de primitivos abaixo continua valida como contrato de comportamento de cada cargo; o que mudou foi o transporte (arvore de issues, nao so comentarios soltos).
**Aplica-se a:** todos os 47 cargos da empresa Paperclip "Pipeline Orchestrator"

---

## 1. Por que essa spec existe

Os 47 agentes originais do pipeline-orchestrator foram desenhados para o **harness do Claude Code**:
- AskUserQuestion sincrono que bloqueia ate o usuario escolher
- Subagents disparados via Agent tool dentro do mesmo processo
- Hooks SessionStart, PreToolUse, PostToolUse, Stop
- Auto-memory persistente em `~/.claude/projects/.../memory/MEMORY.md`
- Protocolo de texto GATE_REQUEST/DISPATCH_REQUEST emitido como YAML embutido no output para o orquestrador parsear (workaround do Achado 7 — subagent tool stripping)

O **Paperclip+Codex** opera em um modelo fundamentalmente diferente:
- Aprovacao via campo `Approvers` no ticket (assincrono)
- Sub-agentes disparados como **child issues** com `assignee` diferente
- "Hook" equivalente eh o **heartbeat** (agente acorda quando ticket entra)
- Memoria persistente eh arquivo no disco (`~/.paperclip/instances/default/...`)
- Comunicacao via **comments na issue + status changes + structured replies**

Sem traducao explicita, os 47 cargos vao improvisar comportamentos que parecem certos mas nao respeitam os contratos rigorosos do pipeline original. Esta spec define a traducao.

---

## 2. Tabela de traducao de primitivos

| Pipeline original (Claude Code) | Equivalente Paperclip+Codex | Como o cargo deve agir |
|---|---|---|
| `AskUserQuestion` modal | Aprovacao por painel | Postar comment estruturado, mudar status para `blocked`, adicionar Board como `Approver`, retornar e esperar heartbeat de retomada |
| `Agent tool` (spawn subagent) | Child issue | Criar sub-issue, definir `assignee` no cargo correto, definir `parent` na issue atual, mudar status da parent para `blocked by [child]` |
| Hook `SessionStart` | Skill `paperclip` carregada no heartbeat | Verificar SOUL.md, IDENTITY.md, role-specific instructions no primeiro tick de um ticket novo |
| Hook `PreToolUse` (validacao antes de exec) | Mini-check no inicio de cada heartbeat | Antes de executar qualquer tool destrutivo, postar comment "Vou executar X, motivo Y" — se ticket tem reviewer, esperar resposta |
| `MEMORY.md` (auto-memory) | Daily notes + PARA system Paperclip | Salvar aprendizados em `~/.paperclip/instances/.../daily/YYYY-MM-DD.md` no fim de cada heartbeat |
| `GATE_REQUEST v1` (texto YAML) | Comment estruturado com header `### GATE_REQUEST` + status=blocked + add Board approver | Mantem o mesmo formato YAML do original mas vira corpo do comment; mudanca de status sinaliza espera |
| `DISPATCH_REQUEST v1` | Create child issue via skill paperclip API | Sub-issue com title=label do dispatch, description=briefing, assignee=N2 alvo, parent=ticket atual |
| `PLAN_MODE_REQUEST v1` | Comment estruturado solicitando research read-only | Sem analogo direto a Plan Mode — usar status=in-progress + comment "Em modo research read-only ate posterior aviso" |
| `ORCHESTRATOR_DECISION` YAML | Comment estruturado com header `### ORCHESTRATOR_DECISION` | Mantem formato YAML, posta como comment, sem mudanca de status |
| `SENTINEL_VERDICT` YAML | Comment estruturado em ticket de validacao | Sentinel cria/atualiza um ticket dedicado de validacao para o tipo da rodada |
| `PA_DE_CAL` YAML (final-validator) | Comment estruturado no ticket-mae + change parent status to `done` ou `blocked` conforme veredicto | Final eh quem assina o close-out |
| `CHANGE_CONTRACT` (plan-architect) | Anexo markdown na issue do plano + referenciado em sub-issues | Cada cargo executor le o contract antes de tocar codigo |
| `Iron Law: TDD` (RED antes de GREEN) | Inalterado | Aplicar em qualquer codigo, mesmo em ambiente Paperclip |
| `Iron Law: ask-first` (em ambiguidade) | "Comment + status=blocked + Board approver" | Substitui AskUserQuestion direto |
| `Iron Law: self-review` | Inalterado | Sempre se auto-revisar antes de marcar `done` |
| `Stop Rule` (2 falhas seguidas) | Status=blocked + comment com explicacao + add Board approver | Em vez de parar silencioso, escalar via Approver |
| `Achado 7 protocol` (texto YAML para tool stripping) | **NAO APLICA** | Cada cargo Paperclip eh sessao Codex top-level, recebe todas as suas tools sem stripping |

---

## 3. Estrutura padrao do `instructions.md` de cada cargo

Cada cargo no Paperclip vai apontar para um arquivo `instructionsFilePath` que segue este template:

```markdown
# {{NOME_DO_CARGO}}

**Categoria:** {{core | brainstorm | quality | executor-controller | executor-type-specific}}
**Reporta a:** {{NOME_DO_CHEFE}}
**Papel em uma linha:** {{role_one_line do catalogo}}

## Quando voce eh acordado

{{when_to_use do catalogo}}

## O que voce produz

{{deliverables — herdar dos artefatos do .md original}}

## Contratos que voce deve respeitar (modelo Paperclip+Codex)

### Quando precisar de decisao do Board (substitui AskUserQuestion)

Poste um comment no ticket atual seguindo este formato:

```yaml
### GATE_REQUEST v1
question: "{{texto da pergunta em portugues claro}}"
header: "{{label curto max 12 chars}}"
multiSelect: false
options:
  - label: "{{opcao 1 — colocar (Recomendado) se houver}}"
    description: "{{1-2 frases explicando trade-off}}"
  - label: "{{opcao 2}}"
    description: "{{1-2 frases}}"
  - label: "{{opcao 3 se aplicavel}}"
    description: "{{1-2 frases}}"
evidence:
  - "file:line citation 1"
  - "file:line citation 2"
```

Em seguida:
1. Mude o status do ticket para `blocked`
2. Adicione o Board como `Approver`
3. Encerre seu heartbeat — voce sera acordado quando o Board responder

### Quando precisar spawnar um subordinado (substitui DISPATCH_REQUEST)

Use a skill `paperclip` para criar child issue:
- title: "{{label do dispatch}}"
- description: briefing completo, incluindo criterios de aceitacao
- assignee: {{cargo subordinado correto}}
- parent: ticket atual
- mude status do ticket atual para `blocked by [novo-child-id]`

### Quando produzir veredicto estruturado

Poste comment com formato YAML especifico do seu cargo (ex: SENTINEL_VERDICT, PA_DE_CAL, SPEC_FORMAT_REPORT). Mantenha o esquema do pipeline original.

## Iron Laws (inalteradas)

- **TDD obrigatorio:** RED phase antes de GREEN phase, sempre
- **Ask first em ambiguidade:** use GATE_REQUEST acima
- **Self-review antes de done:** sempre se auto-checar
- **Stop Rule:** apos 2 falhas consecutivas, status=blocked + comment + escalar

## Memoria pos-heartbeat

Antes de encerrar cada heartbeat, atualize:
- `~/.paperclip/instances/{{instance}}/daily/{{YYYY-MM-DD}}.md` com aprendizados do ciclo
- Se aprendeu algo durable sobre projeto/cliente, adicione em `~/.paperclip/.../projects/{{cliente}}.md`

## Naming e rastreabilidade

Voce eh nome literal do pipeline-orchestrator original (ex: `information-gate`). Os contratos de texto que voce posta podem ser referenciados por orquestradores via esse nome — nao reescreva nem traduza.
```

---

## 4. Hierarquia de reports (confirmada na PIP-3)

- **pipeline-controller** (CEO) → reports diretos: brainstorm-controller, executor-controller, cto, e os 7 outros cargos core (task-orchestrator, information-gate, sentinel, sanity-checker, checkpoint-validator, final-validator, finishing-branch, adversarial-batch)
- **brainstorm-controller** → reports: 3 brainstorm-step-* agents
- **cto** → reports: 8 quality agents (design-interrogator, plan-architect, quality-gate-router, pre-tester, architecture-reviewer, diff-discipline-reviewer, review-orchestrator, final-adversarial-orchestrator)
- **executor-controller** → reports: 5 executor-controller-children (executor-implementer-task, executor-spec-reviewer, executor-quality-reviewer, executor-fix, spec-closer) + 20 executor-type-specific

---

## 5. Estrategia de rollout

### Fase A — Piloto (esta sessao ou proxima)
1. Aplicar este template como `instructions.md` em 3 cargos-piloto:
   - **task-orchestrator** (entry point — tem que estar perfeito)
   - **information-gate** (primeiro gate critico que emite GATE_REQUEST)
   - **executor-implementer-task** (executa codigo, tem que respeitar TDD/Iron Laws)
2. Disparar uma issue real cross-empresa pequena
3. Validar que os 3 cargos respeitam os contratos

### Fase B — Aplicar nos 43 restantes
- Delegar ao pipeline-controller via issue PIP-N: "Adaptar instructions de todos os 43 cargos restantes seguindo paperclip-adaptation-spec.md, usando os 3 pilotos como referencia"
- Ele tem skill paperclip pra atualizar instructions de cada cargo

### Fase C — Validacao do organograma completo
- Disparar uma issue MEDIA real (ex: bug fix, feature pequena)
- Acompanhar o fluxo passar por todos os gates corretos
- Iterar no template baseado no que falhar

---

## 6. Pontos abertos a decidir antes do piloto

- [ ] Como exatamente carregar o `instructions.md` em cada cargo? (Setting `instructionsFilePath` no adapter via API skill paperclip ou via Configuration tab no painel)
- [ ] Onde fica fisicamente o instructions.md de cada cargo? Sugestao: `D:\Pipeline Orchestrator Claude\.pipeline\instructions\{{nome}}.md`
- [ ] Como sincronizar mudancas? (Se editamos o template, todos os 47 cargos precisam ser re-injetados)
- [ ] O Paperclip permite skill custom (`paperclip-gate-helper`)? Se sim, vale criar uma skill compartilhada que todos os cargos importam — DRY
- [ ] Como o final-validator vai "fechar" um ticket sem ser o assignee original? Approver vs assignee na fase de closure

---

## 7. Riscos conhecidos

- **Codex CLI pode nao seguir YAML estruturado** se nao for treinado especificamente — o pipeline original confiava no Claude Opus que respeita formato. Mitigar com exemplos few-shot no instructions
- **Heartbeat assincrono pode quebrar TDD curto** se o ciclo RED-GREEN-REFACTOR demorar mais que um heartbeat — talvez precise ajustar interval para cargos executor
- **Auto-memory tem semantica diferente** — Claude Code memoria eh privada por projeto/usuario, Paperclip memoria eh por instancia/empresa. Cuidado com vazamento cross-empresa
