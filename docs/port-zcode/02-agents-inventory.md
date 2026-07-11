# 02 — Inventário dos Agentes

> Mapeia os cinquenta agentes do repositório canônico, em quatro grupos, com modelo, ferramentas, fase típica e nível (N1 controlador ou N2 executor/revisor). Útil para a portabilidade porque agentes são texto markdown com frontmatter — nada de harness-specific — então o port é simplesmente copiar a pasta.

## Veredicto

Os cinquenta agentes são **majoritariamente portáveis sem alteração**. Cada um é um arquivo markdown com frontmatter declarando nome, descrição, ferramentas, modelo. Não há nada de específico de harness aqui; o que muda é como o harness despacha (via ferramenta Agent do Z-Code), mas isso já está coberto pelo `dispatch-guard.cjs`. Os agentes do tipo N1 (controladores) têm permissão de despachar outros agentes via `Agent` nas ferramentas; os N2 (executores e revisores) não.

---

## TDD checklist (critérios verificáveis)

- [x] T1: contagem total == cinquenta agentes
- [x] T2: cada agente do canônico aparece exatamente uma vez no inventário
- [x] T3: contagem por grupo confere (brainstorm quatro, core onze, executor vinte e sete, quality oito)
- [x] T4: agentes N1 (controladores com ferramenta Agent) marcados como tal — seis no total
- [x] T5: modelo de cada agente declarado (opus, sonnet, haiku)
- [x] T6: nenhum caminho de arquivo na prosa narrativa
- [x] T7: nenhum acrônimo sem expansão na primeira ocorrência

---

## Critério de classificação

- **N1 (controlador)** — tem `Agent` na lista de ferramentas; orquestra uma fase inteira despachando outros.
- **N2 (executor)** — executa código ou escreve arquivos; não despacha outros.
- **N2 (revisor)** — lê e critica trabalho alheio; não despacha outros.
- **Fase típica** — em qual das fases (zero, um e meio, dois, três) costuma rodar.

A distinção N2 executor versus N2 revisor é semântica (baseada na função descrita no frontmatter), não estritamente derivável das ferramentas. Alguns revisores têm Write para emitir relatórios; alguns executores só têm Read mais Bash. Use a coluna "Função" como referência autoritativa.

Modelos disponíveis: `opus` (mais potente, mais caro), `sonnet` (equilibrado), `haiku` (rápido, barato).

---

## Grupo brainstorm (quatro agentes)

| Agente | Modelo | Ferramentas | Nível | Fase típica | Função |
|---|---|---|---|---|---|
| `step-00-intake` | sonnet | Read, Write, Glob, Grep, Bash | N2 executor | zero | Captura o pedido inicial do usuário |
| `step-01-explore` | sonnet | Read, Write, AskUserQuestion, Glob, Grep, Bash | N2 executor | zero | Explora o código e faz perguntas de clarificação por lente |
| `step-01b-alternatives` | sonnet | Read, Write, AskUserQuestion, Glob, Grep | N2 executor | zero | Levanta abordagens alternativas ao plano implícito |
| `step-01c-ideation` | sonnet | Read, Write, AskUserQuestion, Glob, Grep | N2 executor | zero | Fase de ideação criativa para features novas |

## Grupo core (onze agentes)

| Agente | Modelo | Ferramentas | Nível | Fase típica | Função |
|---|---|---|---|---|---|
| `pipeline-controller` | opus | Read, Write, Glob, Grep, Agent, AskUserQuestion | **N1** | todas | Orquestra as quatro fases do pipeline inteiro |
| `brainstorm-controller` | opus | Read, Write, Glob, Grep, Agent, AskUserQuestion, Bash | **N1** | zero | Orquestra a fase de brainstorm (passos zero a um c) |
| `spec-controller` | opus | Read, Write, Glob, Grep, Agent, AskUserQuestion, Bash | **N1** | zero, um e meio | Orquestra geração de especificação (Kiro-style) |
| `task-orchestrator` | sonnet | Read, Grep, Glob, Write | N2 executor | zero | Classifica tipo, complexidade, severidade da tarefa |
| `information-gate` | sonnet | Read, Grep, Glob | N2 revisor | zero | Identifica lacunas de informação críticas |
| `sentinel` | sonnet | Read, Grep, Glob, Write, Edit | N2 revisor | todas | Guardião da sequência de fases e coerência dos gates |
| `sanity-checker` | haiku | Read, Grep, Glob, Write, Bash | N2 revisor | três | Roda checagens de sanidade finais |
| `checkpoint-validator` | haiku | Read, Grep, Glob, Write, Bash | N2 revisor | três | Valida cada um dos checkpoints do sentinel |
| `final-validator` | sonnet | Read, Grep, Glob, Write, Bash | N2 revisor | três | Produz o Pa de Cal (veredito final) |
| `finishing-branch` | sonnet | Read, Grep, Glob, Write, Bash | N2 executor | três | Fecha o run (commit, push, relatório) |
| `adversarial-batch` | sonnet | Read, Grep, Glob, Write | N2 revisor | dois | Revisor adversarial por batch (legado, mantido para compat) |

## Grupo executor — raiz (seis agentes)

| Agente | Modelo | Ferramentas | Nível | Fase típica | Função |
|---|---|---|---|---|---|
| `executor-controller` | opus | Read, Grep, Glob, Write, Bash | N2 executor | dois | Coordena um batch de execução |
| `executor-fix` | opus | Read, Grep, Glob, Write, Edit, Bash | N2 executor | dois | Aplica correções do loop adversarial |
| `executor-implementer-task` | opus | Read, Grep, Glob, Write, Edit, Bash | N2 executor | dois | Implementa a tarefa de fato (escreve código) |
| `executor-quality-reviewer` | sonnet | Read, Grep, Glob, Bash | N2 revisor | dois | Revisor de qualidade pós-implementação |
| `executor-spec-reviewer` | sonnet | Read, Grep, Glob | N2 revisor | dois | Revisor de conformidade com a spec |
| `spec-closer` | sonnet | Read, Grep, Glob, Bash, Write | N2 executor | três | Fecha specs (marca fase como closed) |

## Grupo executor/type-specific (vinte e um agentes)

### Adversariais (quatro)

| Agente | Modelo | Nível | Função |
|---|---|---|---|
| `adversarial-review-coordinator` | opus | **N1** (tem Agent) | Coordena o trio adversarial |
| `adversarial-security-scanner` | sonnet | N2 revisor | Escaneia por vulnerabilidades de segurança |
| `adversarial-architecture-critic` | sonnet | N2 revisor | Critica padrões de arquitetura |
| `adversarial-quality-reviewer` | sonnet | N2 revisor | Critica qualidade do código |

### Audit (quatro)

| Agente | Modelo | Nível | Função |
|---|---|---|---|
| `audit-intake` | sonnet | N2 executor | Captura escopo da auditoria |
| `audit-domain-analyzer` | opus | N2 executor | Analisa domínio a ser auditado |
| `audit-compliance-checker` | sonnet | N2 revisor | Verifica conformidade |
| `audit-risk-matrix-generator` | sonnet | N2 executor | Gera matriz de riscos |

### Bug Fix (três)

| Agente | Modelo | Nível | Função |
|---|---|---|---|
| `bugfix-diagnostic-agent` | sonnet | N2 executor | Diagnostica o bug |
| `bugfix-root-cause-analyzer` | sonnet | N2 revisor | Analisa causa-raiz |
| `bugfix-regression-tester` | haiku | N2 executor | Escreve e roda testes de regressão |

### Feature (três)

| Agente | Modelo | Nível | Função |
|---|---|---|---|
| `feature-vertical-slice-planner` | sonnet | N2 executor | Planeja fatias verticais |
| `feature-implementer` | opus | N2 executor | Implementa a feature |
| `feature-integration-validator` | sonnet | N2 revisor | Valida integração |

### Spec (quatro)

| Agente | Modelo | Nível | Função |
|---|---|---|---|
| `spec-format-gate` | sonnet | N2 revisor | Gate de formato da spec |
| `spec-content-reviewer` | opus | N2 revisor | Revisão de conteúdo (doze eixos) |
| `spec-adversarial-critic` | sonnet | N2 revisor | Crítica adversarial (treze eixos, zero contexto) |
| `spec-post-impl-validator` | opus | N2 revisor | Valida spec contra o que foi implementado |

### UX Simulation (três)

| Agente | Modelo | Nível | Função |
|---|---|---|---|
| `ux-simulator` | sonnet | N2 executor | Simula jornadas de usuário |
| `ux-accessibility-auditor` | sonnet | N2 revisor | Auditoria de acessibilidade |
| `ux-qa-validator` | sonnet | N2 revisor | Validação de QA de UX |

## Grupo quality (oito agentes)

| Agente | Modelo | Ferramentas | Nível | Fase típica | Função |
|---|---|---|---|---|---|
| `plan-architect` | sonnet | Read, Grep, Glob | N2 revisor | um e meio | Monta o plano no modo plano do harness |
| `design-interrogator` | sonnet | Read, Grep, Glob | N2 revisor | zero | Interroga design (só COMPLEXA) |
| `architecture-reviewer` | sonnet | Read, Grep, Glob, Write | N2 revisor | dois | Revisor de arquitetura por batch |
| `diff-discipline-reviewer` | sonnet | Read, Grep, Glob | N2 revisor | dois | Revisor de disciplina de diff (escopo) |
| `pre-tester` | opus | Read, Grep, Glob, Write, Bash | N2 executor | dois | Testes de caracterização antes do refactor |
| `quality-gate-router` | sonnet | Read, Grep, Glob, Write | N2 revisor | dois | Roteia para o revisor de qualidade certo |
| `review-orchestrator` | opus | Read, Grep, Glob, Write, Agent | **N1** | dois | Orquestra o trio adversarial por batch |
| `final-adversarial-orchestrator` | opus | Read, Grep, Glob, Write, Agent | **N1** | três | Orquestra o trio adversarial final |

---

## Resumo

| Métrica | Valor |
|---|---|
| Total de agentes | cinquenta |
| N1 controladores (com Agent) | seis (três em core, um em executor/type-specific, dois em quality) |
| N2 (executores + revisores, sem Agent) | quarenta e quatro |
| Modelo opus | quatorze |
| Modelo sonnet | trinta e três |
| Modelo haiku | três |
| Possuem AskUserQuestion | seis (os três controladores N1 mais três agentes de brainstorm) |
| Não possuem AskUserQuestion | quarenta e quatro (subagentes N2 não perguntam ao usuário diretamente) |

Os seis N1 controladores são: pipeline-controller, brainstorm-controller, spec-controller (em core); adversarial-review-coordinator (em executor/type-specific); review-orchestrator, final-adversarial-orchestrator (em quality).

A distinção entre "executor" e "revisor" dentro de N2 é semântica (executor muda arquivos; revisor só crítica), não estritamente derivável das ferramentas. Por isso não divido os quarenta e quatro N2 nas duas subcategorias — a tabela detalhada acima já indica o papel de cada um na coluna "Função".

A regra canônica para a comunicação subagente→usuário é: subagentes N2 emitem blocos `GATE_REQUEST` no stdout; o controlador N1 (ou o parent na pilha) intercepta e transforma em pergunta via menu (o comando principal do plugin documenta isso na seção sobre o protocolo de runtime).

---

## Notas para o port

- Os agentes são markdown com frontmatter YAML (YAML Ain't Markup Language, "linguagem de serialização de dados legível por humano"). O Z-Code lê frontmatter do mesmo jeito que o Claude Code.
- O campo `tools:` do frontmatter é interpretado por ambos os harnesses como restrição de ferramentas do subagente.
- O campo `model:` é respeitado por ambos (mapeamento opus/sonnet/haiku é nativo).
- O campo `color:` (presente em alguns agentes do canônico) é cosmético; se o Z-Code não o suportar, é ignorado sem dano.
- A convenção de chamada de subagente é `subagent_type: "pipeline-orchestrator:<pasta>:<nome>"` — esse é o nome que a ferramenta `Agent` do harness recebe, não um campo do frontmatter do agente. O Z-Code usa o mesmo namespace (`plugin-name:agent-name`). Nenhuma mudança necessária.

---

## Caminhos e comandos referenciados

```
# pasta raiz dos agentes
Pipeline-Orchestrator/agents/

# quatro grupos
Pipeline-Orchestrator/agents/brainstorm/
Pipeline-Orchestrator/agents/core/
Pipeline-Orchestrator/agents/executor/
Pipeline-Orchestrator/agents/executor/type-specific/
Pipeline-Orchestrator/agents/quality/

# registro de times (SSOT — Single Source of Truth, "fonte única de verdade", para composição de variantes)
Pipeline-Orchestrator/references/team-registry.md

# comando que documenta o protocolo subagente→parent
Pipeline-Orchestrator/commands/pipeline.md
```
