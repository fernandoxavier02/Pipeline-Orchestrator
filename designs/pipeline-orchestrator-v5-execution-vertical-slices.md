# Pipeline-Orchestrator v5.0 — Plano de Execução em Slices Verticais

**Sub-documento de:** `pipeline-orchestrator-v5-pipeline-as-code.md`
**Substitui:** Seção "Componentes do v5.0" (C-1 a C-6) e "Next Steps" do design original
**Mantém:** Problem Statement, What Makes This Cool, Constraints, Premises, Approaches Considered, Recommended Approach (alto nível), Open Questions, Success Criteria, Distribution Plan, Security Model
**Revisão:** 2026-04-26 (segunda iteração — incorpora síntese de 4 reviews independentes: coherence, plan-checker, design-lens, product-lens)
**Metodologias aplicadas:** BDD (cenários Given-When-Then), TDD (testes primeiro, RED-GREEN-REFACTOR), AIDD (specs executáveis por agente Claude com handoff explícito)

---

## Definition of v5.0 Done (critérios binários verificáveis)

Adicionado pós-iter 2 para evitar "v5.0 falsa". v5.0 só pode ser tagueada quando TODOS os critérios abaixo estiverem PASS, verificáveis por terceiro:

1. **5 commands em `/help`** — `/pipeline-orchestrator:{pipeline,bugfix,feature,audit,ux}` listados, cada um com descrição de uma linha distinta. Verificação: `claude /help | grep pipeline-orchestrator` retorna 5 linhas.
2. **Toda execução produz TRACE.md no repo do usuário por default** — sem opt-in. Aparece em `git status` após qualquer pipeline completar. Verificação: rodar `/pipeline-orchestrator:bugfix [task-fixture]` em repo limpo deixa `.pipeline-orchestrator/runs/*/TRACE.md` em `git status`.
3. **TRACE.md anexável a PR sem edição manual** — schema_version=1 presente, todos os campos populados, classification + execution_log + final_verdict completos. Verificação: rodar validador standalone contra TRACE gerado em fixture.
4. **Comando legacy `/pipeline-orchestrator:pipeline` produz mesmo verdict para 5 cenários canônicos do v4.1.0** — compat suite verde em CI. Verificação: GitHub Actions step `npm run test:compat` passa.
5. **Compromisso firmado para v5.1 com YAML interpreter** — issue tracker tem milestone "v5.1 — Pipeline Declarativo (Slice 5)" com data alvo ≤ Q+2 (i.e., release ≤ 2 quarters após v5.0). Verificação: link da milestone no CHANGELOG do v5.0.

Sem todos os 5, v5.0 é "v4.5 com TRACE.md", não a versão sensacional. Marketing e release notes refletem isso ou cancelam o release.

---

## Cherry of the Cake — o que aparece em execução, não no marketing

A versão sensacional do v5 não vende — ela **acontece** quando o usuário roda. Duas mecânicas combinadas produzem o efeito:

1. **Composição emergente entre agentes especializados.** Cada pipeline tem agentes domain-native que falam só o vocabulário do seu bounded context. Eles podem invocar uns aos outros (mesmo pipeline) ou agentes de infra cross-cutting quando a evidência justifica — sem o usuário pedir. Cap: máximo 2 níveis de aninhamento, máximo 5 invocações emergentes por execução. Toda invocação é registrada no TRACE.md como "composição emergente" com a evidência que motivou.

2. **Evidência cirúrgica obrigatória.** Toda asserção de qualquer agente vem com evidência mínima e localizada — `file:line:column`, trecho exato de log (até 200 chars), parágrafo de spec citado. Sem evidência = não conta como output. Gate automático em todos os modos.

**Exemplo concreto que ilustra a cereja:** usuário roda `/pipeline-orchestrator:bugfix --investigate login broken`. Um agente domain-native enumera 3 hipóteses; outro valida cada uma com `file:line`; quando a hipótese vencedora aponta `auth/session.js:42`, um terceiro invoca emergentemente um agente de infra cross-cutting (security scanner) — sem o usuário pedir. Tudo registrado com evidência cirúrgica no TRACE.md. **Quem roda diz "não pedi pra ele chamar segurança, mas faz total sentido que tenha chamado".** Os agentes específicos e a arquitetura em camadas que torna isso possível são detalhados nos batches seguintes.

---

## Metodologias aplicadas — TDD + BDD + DDD + AIDD

Quatro metodologias se reforçam:

- **DDD (Domain-Driven Design clássico, Eric Evans):** cada um dos 4 pipelines é um **bounded context** com linguagem ubíqua própria, entidades de domínio próprias, e agentes que só falam essa linguagem. Cross-talk entre pipelines acontece via tradução explícita, não reuso de vocabulário.
- **BDD (Behavior-Driven Development):** cenários Gherkin (Given-When-Then) descrevem cada pipeline em linguagem do domínio. Aprovação humana sobre cenários antes de gerar tests.
- **TDD (Test-Driven Development):** RED-GREEN-REFACTOR aplicado em pipelines que tocam código (bugfix, feature). Audit e ux pulam TDD (read-only/exploratório).
- **AIDD (AI-Driven Development):** specs são executáveis por agente Claude. Humano aprova gates, não digita código. Plugin se constrói consumindo a si mesmo (dogfooding).

---

## Invariantes compartilhados (5 — valem para os 4 pipelines)

Apesar de cada pipeline ter shape próprio (esse é a cereja), 5 coisas valem cross-pipeline:

**1. Linguagem ubíqua por bounded context.** Cada pipeline tem glossário curto de 10-15 termos. Bugfix nunca diz "user story"; feature nunca diz "root cause hypothesis". Documentado em `references/glossary/{pipeline}.md` — um arquivo por bounded context (`bugfix.md`, `feature.md`, `audit.md`, `ux.md`). Criação faz parte do Definition of Done dos slices que introduzem cada pipeline (Slice 1 cria `bugfix.md`; Slice 3 cria os outros 3).

**2. Evidência cirúrgica obrigatória.** Conforme descrito acima — gate automático de qualidade.

**3. Composição emergente permitida e logada.** Conforme descrito acima — caps explícitos.

**4. Outputs são artefatos versionáveis, não prosa.** Cada pipeline produz arquivos estruturados (Markdown com seções fixas + YAML frontmatter). Usuário commita, abre PR, compara entre execuções.

**5. AIDD em todos os 4.** Cada agente domain-native tem spec executável (prompt + inputs + outputs + critérios PASS/FAIL) consumível por outro Claude. Humano aprova gates.

---

## Layer 1 — Agents Domain-Native (absorvidos do Pulsar com bounded context)

Os 10 agentes do Pulsar (`D:\Projeto Pulsar\.claude\commands\Prompts\agents\`) cobrem as lentes principais mas são genéricos. Estratégia: usar como **arquétipos**, instanciar versões mínimas com bounded context por domínio. **Pós adversarial review do Batch 2:** trimado de 19 agentes para **9 no v5.0** + 10 diferidos pra v5.1, ancorando inventário nos cenários BDD dos Slices 1-4.

### Inventário v5.0 — apenas o que os Slices 1-4 exigem (9 agentes)

| Pipeline | Agente | Arquétipo Pulsar | Justificativa BDD |
|---|---|---|---|
| bugfix | `bugfix-diagnostician` | `diagnostic.md` (1:1, sem split) | Slice 1 BDD: "controller pula classificação e executa diagnostic→root-cause→implementation→verification" |
| bugfix | `bugfix-fix-proposer` | `executor.md` | Slice 1 BDD: fase de implementation precisa de agente que propõe diff mínimo |
| feature | `feature-slice-architect` | `plan.md` | Slice 3 BDD: feature pipeline precisa modelar slice antes de implementar |
| feature | `feature-slice-implementer` | `executor.md` | Slice 3 BDD: implementação do slice |
| audit | `audit-intake-mapper` | (novo) | Slice 3 BDD: audit pipeline precisa fase de intake |
| audit | `audit-finding-classifier` | `plan.md` + `adversarial.md` | Slice 3 BDD: audit produz findings classificados |
| ux | `ux-journey-walker` | `ux-qa.md` (1:1, sem split) | Slice 3 BDD: ux pipeline precisa simular jornada |
| ux | `ux-improvement-proposer` | (novo) | Slice 3 BDD: ux produz sugestões priorizadas |
| cross | `adversarial-reviewer` | `adversarial.md` | Cross-pipeline com checklist dinâmico por domínio |

**Total v5.0: 9 agentes.** Estimativa: 0.5 dia/agent = 4-5 dias somando, cabe dentro do range 4-7 semanas total.

### Inventário v5.1 — diferidos com Slice 5 (10 agentes)

Cada um destes só ganha spec quando emergir cenário BDD concreto que justifique:

- bugfix: `bugfix-domain-guardian`, `bugfix-evidence-collector` (split do diagnostician se evidência ficar pesada), `bugfix-rootcause-confirmer`
- feature: `feature-domain-modeler`, `feature-userstory-decomposer`, `feature-acceptance-criteria-author`
- audit: `audit-domain-mapper`, `audit-severity-rater`, `audit-mitigation-proposer`
- ux: `ux-persona-synthesizer`, `ux-domain-persona-keeper`, `ux-friction-cataloger`
- cross (v5.1): `reliability-reviewer` (só faz sentido com domain-guardian existindo)

### Princípio de bounded context — translation-explicit, não hard boundary

Agente domain-native de um pipeline pode invocar agente cross-pipeline (`adversarial-reviewer`) ou agente de outro pipeline **se a tradução de vocabulário for explícita e logada no TRACE.md**. Não é hard boundary purista; é DDD pragmático para projeto solo. Exemplo: bugfix precisa entender feature recém-modelada → chama `feature-slice-architect` registrando "tradução: 'área afetada' (bugfix) ↔ 'slice escopo' (feature)" no TRACE.

### Spec template (Apêndice A — necessário para Slice 0)

Toda spec de agente domain-native segue template em `references/agent-spec-template.md` (criado como parte do Slice 0, não em batch separado). Template mínimo: frontmatter (name, model, tools, memory) + Papel + Inputs + Outputs + Critérios PASS/FAIL + Composição emergente permitida (lista de agentes que pode invocar).

---

## Layer 2 — Pipeline Shapes (absorvidos dos Heavy do Pulsar, adaptados ao Claude Code 2.x)

Os shapes Heavy do Pulsar (`D:\Projeto Pulsar\.claude\commands\Prompts\`) são pontos de partida testados em uso real. Estratégia: **adotar como esqueleto, adaptar para harness Claude Code 2.x** (Agent dispatch via subagent_type, AskUserQuestion para gates, hooks PreToolUse para interceptação).

Shapes nunca são uniformes entre pipelines — esse é o ponto da cereja "shape nativo ao domínio" da Seção Cherry. Cada pipeline tem fases que refletem a natureza do trabalho:

### bugfix — shape investigativo (11 passos Heavy / 8 passos Light)

**Heavy** (absorve `PIPELINE_BUGFIX_HEAVY.md` do Pulsar): 1) Terrain Recon Diagnostic → 2) Root Cause Consolidation → 3) Domain Truth Model → 4) **Controlled Change Proposal** (gate APROVAÇÃO) → 5) TDD Pre-Impl (RED) → 6) Execute Minimal Diff (GREEN) → 7) Post-Change Sanity + Regression → 8) Adversarial UX/Tech Review → 9) UX User Journey Simulation → 10) Pa de Cal (Go/No-Go) → 11) Final Validation Post-After-All.

**Light** (absorve `PIPELINE_BUGFIX_LIGHT.md`): shape próprio, não diluição do Heavy. 8 passos com cap "max 2 arquivos / 50 linhas / 1 hipótese". Auto-escalation gate no passo 7 (COMPLEXITY_GATE) propõe migração pra Heavy se cap estourado.

Agentes envolvidos (Layer 1 v5.0): `bugfix-diagnostician` (passos 1-2), `bugfix-fix-proposer` (passos 5-6), `adversarial-reviewer` (passo 8).

### audit — shape forense, read-only (9 passos Heavy / 9 Light)

Absorve `PIPELINE_AUDITORIA_HEAVY.md`: 1) Intake Completo + Inventário → 2) Arquitetura/Limites/Módulos → 3) Domínio/Regras de Negócio/SSOT → 4) Contratos/APIs/Endpoints → 5) Dados/Migrações/Integridade → 6) Frontend (estado/acessibilidade) → 7) Backend (auth/observabilidade) → 8) Governança/Testes/CI-CD → 9) Pa de Cal + Matriz de Risco.

**Light:** mesmo 9 passos, profundidade reduzida por passo + cap "1 área (ex: só auth, ou só data layer)". Único pipeline onde Light = Heavy em estrutura (correto para domínio forense — pular fases compromete cobertura).

**TDD não se aplica** (read-only). Outputs sempre incluem matriz de risco.

Agentes envolvidos: `audit-intake-mapper` (passo 1), `audit-finding-classifier` (passos 2-8), `adversarial-reviewer` (passo 9).

### feature — shape construtivo via Vertical Slice (13 passos Heavy / shape próprio Light)

Absorve `PIPELINE_IMPLEMENT_HEAVY.md`: 1) Intent Scope → 2) Terrain Recon → 3) User Flow UX → 4) Domain Rules → 5) Source of Truth → 6) Data Model → 7) Architecture Design Options → 8) Risk Controls → 9) Implementation Plan → 9b) TDD Pre-Impl (RED) → 10) Execution Minimal Diff (GREEN) → 11) Testing Validation → 12) Release Observability → 13) Done.

**Light (redesenhar do zero, não diluir Heavy):** 6 passos com cap "1 user story de no máx 5 acceptance criteria, 1 vertical slice": 1) Intent → 2) Domain rules mínimo → 3) TDD pre-impl → 4) Execução minimal diff → 5) Validation → 6) Done.

Agentes envolvidos (v5.0): `feature-slice-architect` (passos 7-9), `feature-slice-implementer` (passos 10-11).

### ux — shape simulado-exploratório, sem precedente Pulsar (desenhar do zero)

O Pulsar tem `HEAVY_08_UX_USER_JOURNEY_SIMULATION` mas não pipeline UX standalone. Desenho original v5: 1) Persona Intake (qual persona vamos simular) → 2) Journey Walk (passo a passo do fluxo na pele da persona) → 3) Friction Catalog (cada ponto de fricção com evidência cirúrgica) → 4) Severity & Impact → 5) Improvement Proposals (priorizadas por effort/impact) → 6) Pa de Cal.

**Light:** 4 passos com cap "1 persona, 1 jornada": 1) Persona → 2) Walk → 3) Friction Top-3 → 4) Proposals.

**TDD não se aplica** (exploratório). Output: catálogo de fricção + sugestões priorizadas, anexáveis a issue/PR.

Agentes envolvidos: `ux-journey-walker` (passos 2-3), `ux-improvement-proposer` (passo 5).

### Ownership por passo — quem faz o quê (resolve gaps do adversarial Batch 3)

Layer 1 v5.0 tem 9 agentes. Os shapes têm 8-13 passos cada. A diferença é coberta pelo `pipeline-controller` rodando passos procedimentais (gates, sanity, Pa de Cal) com checklist herdado do `.md` do Pulsar. Tabela de ownership completa:

**bugfix-heavy (11 passos):**
| Passo | Owner | Tipo |
|---|---|---|
| 1 Terrain Recon Diagnostic | `bugfix-diagnostician` | agente especializado |
| 2 Root Cause Consolidation | `bugfix-diagnostician` | agente especializado |
| 3 Domain Truth Model | `pipeline-controller` (checklist herdado) | procedimental |
| 4 Controlled Change Proposal | `bugfix-fix-proposer` (modo dry-run gera proposta) → `pipeline-controller` (gate via AskUserQuestion) | agente + gate |
| 5 TDD Pre-Impl (RED) | `pipeline-controller` (orquestra TDD) | procedimental |
| 6 Execute Minimal Diff (GREEN) | `bugfix-fix-proposer` | agente especializado |
| 7 Post-Change Sanity + Regression | `pipeline-controller` (roda build/test) | procedimental |
| 8 Adversarial UX/Tech Review | `adversarial-reviewer` | agente cross-pipeline |
| 9 UX User Journey Simulation | `ux-journey-walker` (cross-pipeline reuse com tradução explícita logada) | agente especializado |
| 10 Pa de Cal | `pipeline-controller` (Go/No-Go) | gate |
| 11 Final Validation Post-After-All | `pipeline-controller` (sanity final) | procedimental |

**audit-heavy (9 passos):** passos 1 = `audit-intake-mapper`, passos 2-8 = `audit-finding-classifier` (cobre arquitetura/domínio/contratos/dados/frontend/backend/governança via prompt parametrizado por área), passo 9 = `pipeline-controller` (Pa de Cal + Matriz de Risco) com `adversarial-reviewer` invocado emergentemente se findings críticos detectados em 2-8.

**feature-heavy (13 passos):** passos 1-5 = `pipeline-controller` (intake/recon/UX/domain/SSOT — procedimental); passos 6-9 = `feature-slice-architect`; passo 9b = `pipeline-controller` (TDD); passos 10-11 = `feature-slice-implementer`; passos 12-13 = `pipeline-controller`.

**ux (6 passos):** passo 1 = `pipeline-controller` (intake de persona via AskUserQuestion); passos 2-3 = `ux-journey-walker`; passo 4 = `pipeline-controller` (severity matrix); passo 5 = `ux-improvement-proposer`; passo 6 = `pipeline-controller` (Pa de Cal).

### Mecânica de orquestração v5.0

`pipeline-controller` lê o shape `.md` correspondente, identifica agente owner por passo via tabela embutida no shape, e faz **dispatch sequencial** — agente recebe APENAS seu passo + outputs dos passos prévios, NÃO o shape inteiro. Isso preserva contexto enxuto, evita prompt size explosion, e mantém AIDD legível.

Composição emergente da Cherry acontece quando agente (durante seu passo) decide invocar outro — cap 2 níveis, 5 invocações totais por execução, conforme Invariante #3.

### Enforcement de caps (Light)

Caps de Light são enforced em 3 camadas:

1. **Hard-stop por hook PreToolUse** quando aplicável: bugfix-light "max 2 arquivos" enforced contando tool_calls de Edit/Write durante passo 4 (Point Fix). Soft-warn em 1 arquivo, hard-stop em 2.
2. **Pós-step audit por `pipeline-controller`**: linhas via `git diff --stat`, hipóteses via output do agente. Trigger de auto-escalation se cap estourado.
3. **Auto-escalation gate** (nova categoria — ver abaixo): COMPLEXITY_GATE oferece migração pra Heavy via AskUserQuestion.

### COMPLEXITY_GATE — nova categoria de gate (v5.0)

Adicionar ao Gate Registry do v4 (entre `STOP_RULE` e `STALE_CONTEXT`):
- **Nome:** COMPLEXITY_GATE
- **Hardness:** SOFT (usuário pode optar por continuar em Light com warning)
- **Trigger:** cap do Light estourado durante execução
- **Recovery:** AskUserQuestion oferece (a) migrar pra Heavy, (b) continuar Light registrando exceção, (c) abortar
- **Schema sentinel-state.json:** `complexity_cap_status: { exceeded: bool, dimension: "files|lines|hypotheses", value: int, cap: int }`

### Shape como código declarativo (delta v5.0 → v5.1)

Em v5.0, shapes são `.md` herdados do Pulsar com tabela de ownership embutida (formato acima). **Em v5.1 (Slice 5)**, o YAML não é só conversão sintática — adiciona: allow-list de tools por passo (segurança), schema validável de inputs/outputs por agente, dispatch declarado (sem inferência LLM do owner), versionamento por schema_version. Sem v5.1, o shape `.md` é interpretado por LLM no prompt do controller — funcional mas não auditável programaticamente.

Antes de v5.1, shapes vivem em `references/pipelines/{tipo}-{light|heavy}.md` (estrutura herdada do Pulsar + tabela de ownership v5).

---

## Layer 3 — `ai-dev-team` como infra cross-cutting (3 absorvidos v5.0 + 1 v5.1)

O plugin `ai-driven-dev-plugin` tem 7 agentes horizontais. **Pós adversarial review do Batch 4:** redução de 4 absorvidos para 3 em v5.0, com clarificação de role pra cada um:

| Agente ai-dev-team | Status | Role exata |
|---|---|---|
| `ai-dev-security-scanner` | **v5.0 — absorvido** | Opus. Invocado por agentes Layer 1 quando evidência aponta arquivo sensível (auth/crypto/data). Único agente Opus na composição emergente. |
| `ai-dev-quality-gate` | **v5.0 — absorvido como executor de checks, não como orchestrator** | Sonnet. `pipeline-controller` (orquestrador) faz dispatch deste agente quando passo de sanity/quality precisa rodar (bugfix passo 7, feature passo 11). Quality-gate executa lint/typecheck/coverage e retorna estruturado. Sem sobreposição — controller orquestra, quality-gate executa. |
| `ai-dev-context-injector` | **v5.0 — absorvido** (corrigido pós-review) | Sonnet. Reavaliado: o `pipeline-controller` v4 atual NÃO faz injeção estruturada de contexto (só checa CLAUDE.md existe). O context-injector traz capacidade nova: detecção de stack, commits recentes, padrões. Invocado pelo controller no início de cada execução. |
| `ai-dev-test-generator` | **v5.0 — opcional, invocado pelo controller em TDD** | Sonnet. Clarificado: NÃO é orchestrator concorrente. `pipeline-controller` em fase TDD (bugfix passo 5, feature passo 9b) PODE invocar este agente para gerar testes a partir do BDD scenarios aprovados. Alternativa: agente Layer 1 (`bugfix-fix-proposer`) escreve testes diretamente. Decisão por execução, não global. |
| `ai-dev-docs-writer` | **v5.1 — diferido** | Geração automática de docs não cobre nenhum dos 5 critérios de Definition of v5.0 Done. Vai pra Slice 5 (v5.1) onde ganhar BDD scenario que justifique. |
| `ai-dev-code-reviewer` | **NÃO absorvido** | Sobreposição com `adversarial-reviewer` (Layer 1). |
| `ai-dev-team-coordinator` | **NÃO absorvido** | Sobreposição direta com `pipeline-controller`. |

### Composição emergente Layer 1 → Layer 3 — mapeada a slices específicos

Pós review: cada exemplo canônico tem slice owner explícito. Sem owner = não é v5.0.

**Exemplo 1 — bugfix → security-scanner (v5.0, Slice 1)**: `bugfix-fix-proposer` termina patch tocando `auth/session.js:42` → invoca `ai-dev-security-scanner` com evidência cirúrgica. Acceptance criteria do Slice 1 inclui: "TRACE.md registra invocação emergente de security-scanner quando patch toca path em auth/|crypto/|payment/".

**Exemplo 2 — audit → security-scanner (v5.0, Slice 3)**: `audit-finding-classifier` detecta padrão suspeito → invoca `ai-dev-security-scanner`. Acceptance criteria do Slice 3 inclui: "audit pipeline produz findings com tag `security-validated` quando security-scanner foi invocado emergentemente".

**Exemplo 3 — feature → docs-writer (v5.1, Slice 5+)**: diferido junto com docs-writer.

### Princípio de invocação cross-cutting

Layer 3 é invocada por agentes Layer 1 ou pelo `pipeline-controller`, NUNCA por outro agente Layer 3 (evita cascata). Composição cross-cutting respeita os caps da Invariante #3: máx 2 níveis de aninhamento, máx 5 invocações totais por execução. Sem peso por modelo (cap flat — corrigido pós-review).

### Modelos

`ai-dev-security-scanner` é Opus. Os outros 2 absorvidos são Sonnet. Custo Opus controlado pela própria escassez de gatilhos (só dispara em paths sensíveis), não por peso artificial.

---

## Estratégia Light/Heavy — caps por pipeline + auto-escalation

Pós análise dos Light do Pulsar (descrita em iter 2): só `bugfix-light` foi genuinamente redesenhado; os outros 3 Lights são "Heavy com prompts mais curtos", o que dilui o valor do modo. Estratégia v5: **cada Light tem shape próprio com cap objetivo, auto-escalation gate (COMPLEXITY_GATE) se cap estourar**.

### Caps por pipeline (Light)

| Pipeline | Cap Light | Verificação | Quando estoura → COMPLEXITY_GATE oferece |
|---|---|---|---|
| **bugfix-light** | Max 2 arquivos modificados, 50 linhas total, 1 hipótese ranqueada | Hook PreToolUse conta tool_calls Edit/Write; passo 7 audita `git diff --stat` | Migrar pra `bugfix-heavy`. Workflow de migração: (1) diff atual descartado via `git checkout -- .`; (2) RED tests JÁ escritos em bugfix-light passo 3b são preservados (mesmo formato em ambos shapes); (3) execução restarta de bugfix-heavy passo 1 (Terrain Recon) carregando hipótese ranqueada do Light como contexto; (4) ao chegar em heavy passo 5 (TDD Pre-Impl), tests RED pré-existentes são reusados — não regenerados. |
| **feature-light** | 1 user story, max 5 acceptance criteria, 1 vertical slice | `pipeline-controller` (checklist procedimental) conta criteria derivadas do Intent (passo 1) e valida no passo 6. Agente `feature-acceptance-criteria-author` é v5.1 — em v5.0, validação é checklist do controller. | Migrar pra `feature-heavy` (slice plan completo) |
| **audit-light** | 1 área (ex: só `auth`, só `data layer`, só `frontend`), 1 nível de profundidade | Slice scope declarado no intake (passo 1); audit-intake-mapper valida | Migrar pra `audit-heavy` (cobertura completa 9 áreas) |
| **ux-light** | 1 persona, 1 jornada, top-3 frictions | Definição no intake (passo 1) | Migrar pra `ux-heavy` (multi-persona, multi-jornada) |

### Heavy = sem caps, com gates de aprovação

Heavy é o shape completo descrito na Layer 2 (11/9/13/6 passos). Sem caps de tamanho, mas com gates de aprovação humana em pontos críticos (ex: bugfix-heavy passo 4 "Controlled Change Proposal").

### Auto-escalation gate (COMPLEXITY_GATE) — workflow

Quando cap estoura durante Light:

1. Hook PreToolUse ou pós-step audit detecta
2. `pipeline-controller` registra `COMPLEXITY_GATE` no sentinel-state.json com dimensão estourada
3. Pipeline pausa, invoca `AskUserQuestion`:
   - "Migrar pra `{pipeline}-heavy` (Recomendado)" — descarta diff atual, reentra com shape Heavy
   - "Continuar Light registrando exceção" — segue com warning no TRACE.md (`complexity_exception: true`)
   - "Abortar" — reverte tudo
4. Decisão logada em `gate-decisions.jsonl`

Gate é SOFT (usuário pode override Light com warning), conforme Hardness Taxonomy.

### Escolha de modo no entry point

`/pipeline-orchestrator:bugfix [task]` — controller infere modo (Light vs Heavy) via task-orchestrator (heurísticas de complexidade) + apresenta proposta pro usuário no Phase 1. Override manual via flags:
- `/pipeline-orchestrator:bugfix --light [task]` — força Light (com risco de COMPLEXITY_GATE)
- `/pipeline-orchestrator:bugfix --heavy [task]` — força Heavy (custo full mesmo se simples)

Sem flag = inferência + confirmação. Modos `--simples`, `--media`, `--complexa` do v4 **permanecem suportados em `/pipeline` legacy por compat** (DoD #4); `--light` / `--heavy` são recomendados pra novos commands. Sem prazo de remoção definido (revisitar em v6.0).

### Não-aplicabilidade de Light em alguns casos

- **bugfix em domínio sensível** (auth/crypto/data-model/payment): Light é BLOQUEADO. Heavy obrigatório. Mesma lógica do v4 que torna adversarial mandatório nesses domínios.
- **audit de compliance**: Light é BLOQUEADO. Auditoria de compliance (GDPR/HIPAA/SOC2) exige cobertura completa.
- **HOTFIX**: usa Light por default (escopo cirúrgico) com checklist mínimo. Se cap estourar em HOTFIX, COMPLEXITY_GATE oferece SOMENTE 2 opções (não 3): (b) continuar com warning elevado registrando `hotfix_complexity_exception=true` no TRACE, ou (c) abortar. A opção (a) "migrar pra Heavy" é suprimida — HOTFIX por definição não pode rodar workflow completo. Decisão de override fica com o usuário, não com o pipeline.

---

## Por que slices verticais (e não C-1..C-6 horizontal)

O design original organiza trabalho por **camada técnica** (commands, skills, interpreter, hooks, traces, suite). Isso é horizontal: nenhuma camada sozinha entrega valor ao usuário, e a integração só acontece no fim. Risco: 11-16 semanas sem release intermediário, com C-2 (interpreter, 4-6 semanas) como ponto único de falha.

Slices verticais invertem: cada slice atravessa todas as camadas necessárias para entregar **uma capacidade observável pelo usuário**, end-to-end, e é liberável (`v5.0.0-rc.1`, `rc.2`, ...) independentemente. Assim:

- v5.0 entrega a **fundação observável da "caixa de vidro"**: 4 commands explícitos, TRACE.md versionado-por-default anexável a PR, compat suite. O **pilar declarativo** (YAML interpreter) é compromisso firmado para v5.1 (≤ Q+2), não condicional. Decisão pós-iter 2 do review: a tese só fecha com Slice 5; adiá-lo indefinidamente seria diluir o positioning.
- Cada slice tem cenário Gherkin (BDD), testes que falham primeiro (TDD), e spec consumível por agente Claude (AIDD).
- Falha em qualquer slice **não bloqueia** os anteriores já released.

**Range honesto pós-auditoria:** v5.0 (Slices 0-4) = **4-7 semanas solo**. v5.1 (Slice 5) = **+6-8 semanas adicionais**, comprometido com janela ≤ Q+2 após v5.0.

---

## Slice 0 — Reality Check (Spike, não-shippeável)

**Por que existe:** A auditoria identificou bloqueador CRITICAL — o design assumia 1100 linhas em `commands/pipeline.md` (real: 38), 7 hooks (real: 3), 12 .md a fundir (já existem). Antes de qualquer slice de produção, precisamos verificar premissas sobre o harness do Claude Code que, se falsas, refazem o plano todo.

**Duração:** 2-3 dias. Output é decisional, não código de produção.

### BDD — Cenários de validação

```gherkin
Feature: Reality check do baseline e do harness Claude Code

Scenario: Inventário verificado do baseline atual
  Given o repositório canonical em `~/.tmp/pipeline-orchestrator-canonical`
  When eu executo `find references/pipelines -name "*.md" | xargs wc -l`
       e `find hooks -name "*.cjs"`
       e `wc -l commands/pipeline.md agents/**/*.md`
  Then um documento `INVENTORY.md` lista a contagem real de:
       - linhas em commands/pipeline.md (esperado: ~38, validado em audit)
       - hooks .cjs existentes (esperado: 3)
       - .md em references/pipelines/ (esperado: 12)
       - onde a lógica de fase/gate efetivamente reside (provavelmente em prompts)
  And o esforço estimado de cada slice é recalculado contra o baseline real

Scenario: Subagent_type dinâmico funciona via Agent tool
  Given um agent `slice0-probe-controller` em .claude/agents/
  When o controller faz Agent(subagent_type=$dynamicName) onde $dynamicName vem de um YAML lido em runtime
  Then o spawn deve completar com sucesso para nomes válidos
   And falhar previsivelmente para nomes não registrados
   And o resultado escrito em `SPIKE-DYNAMIC-DISPATCH.md`

Scenario: Latência aceitável de hook lendo YAML
  Given um hook PreToolUse:Agent que lê e parseia `references/pipelines/bugfix.yaml`
  When invocado 50 vezes consecutivas via Agent calls reais
  Then a latência mediana deve ser < 200ms por call
   And p99 < 1000ms
   And o relatório `SPIKE-HOOK-LATENCY.md` documenta cache strategy escolhida

Scenario: Claude Code roda headless em CI
  Given uma GitHub Action que invoca `claude --headless` (ou equivalente)
  When o pipeline tenta rodar `/pipeline-orchestrator:pipeline test-task` sem TTY
  Then ou completa e retorna output capturável (PASS — define snapshot strategy)
   Or falha com erro previsível (FAIL — design alternativo via mocks documentado em SPIKE-CI-HARNESS.md)
```

### TDD — Não se aplica diretamente

Spike é exploratório. RED-GREEN-REFACTOR só faz sentido para código de produção. O artefato deste slice são **decisões documentadas**, não código testável. Substituto: cada cenário acima tem critério binário PASS/FAIL e produz um arquivo de evidência.

### AIDD — Spec executável por agente

Este slice é o único que **eu, autor humano**, devo executar pessoalmente — não delegar a agente. Razão: as decisões deste slice **definem** as specs que serão consumidas por agentes nos slices seguintes. Delegar a um agente o trabalho de descobrir o que delegar é circular.

### Definition of Done

- `INVENTORY.md` com contagem real de linhas/hooks/pipelines
- `SPIKE-DYNAMIC-DISPATCH.md` com PASS/FAIL e evidência reproduzível
- `SPIKE-HOOK-LATENCY.md` com benchmark e cache strategy decidida
- `SPIKE-CI-HARNESS.md` com decisão sobre como testar plugin em CI
- Estimativas de Slices 1-5 recalculadas contra realidade
- **`references/agent-spec-template.md`** criado (template canônico para Layer 1) — frontmatter (name, model, tools, memory) + Papel + Inputs + Outputs + Critérios PASS/FAIL + Composição emergente permitida (lista de agentes invocáveis)

### Refinamentos pendentes da iter 2 (5 issues LOW residuais a resolver no Slice 0)

Resolver dentro da janela do Spike (não bloqueiam Spike, mas são pré-requisito do Slice 1):

**R-1. Consolidar duplicação de Metodologias** (Coherence Batch 1 #3) — header do doc menciona TDD/BDD/AIDD; seção dedicada adiciona DDD. Decidir: (a) atualizar header para incluir DDD, ou (b) remover lista do header e deixar seção como SSOT. Verificação: `grep -c "TDD" doc.md` retorna 1 ocorrência inicial autoritativa.

**R-2. Reduzir repetição de "dogfooding"** (Coherence Batch 1 #6) — termo aparece 3x progressivamente. Manter ocorrência expandida em "Como AIDD funciona na prática"; remover ou condensar as 2 menções curtas em "Metodologias" e "Próximos passos". Verificação: `grep -c "dogfooding" doc.md` ≤ 2.

**R-3. Definir "1 nível de profundidade" do audit-light** (Coherence Batch 5 #4) — atualmente vago. Adicionar exemplo concreto: "audit-light com `domain=auth` roda checklist nível-1 (cobertura básica: presença de auth, tipo, surface area); audit-heavy com mesmo `domain` roda nível-1+2+3 (configuração detalhada, edge cases, threat model)". Documentar nos níveis em `references/audit-depth-levels.md`.

**R-4. Especificar contrato `task-orchestrator` v4 → modos Light/Heavy v5** (Coherence Batch 5 #6) — task-orchestrator atual classifica SIMPLES/MEDIA/COMPLEXA. Decidir: (a) adapter heurístico (SIMPLES→Light, COMPLEXA→Heavy, MEDIA→inferência via análise de affected_files) ou (b) reescrever task-orchestrator para emitir Light/Heavy nativamente. Documentar decisão em `INVENTORY.md` do Spike, junto com o mapeamento.

**R-5. Documentar ownership de validação de acceptance criteria em feature-light v5.0** (Coherence Batch 5 #7) — `feature-acceptance-criteria-author` é v5.1. Em v5.0, `pipeline-controller` faz validação procedimental (já documentado na tabela de caps), mas falta o checklist concreto. Adicionar `references/feature-light-criteria-checklist.md` com regras: derivação a partir do Intent (passo 1), enumeração ≤ 5, formato Given-When-Then.

### Decision Gate

Se Slice 0 revelar que subagent_type dinâmico **não** é suportado, **Slice 5 (YAML interpreter) muda fundamentalmente** — passa a "cada type tem seu controller agent estático" (mais simples, menos sexy, mas viável). Isso precisa ser decidido aqui antes de escrever specs do Slice 5.

---

## Slice 1 — Primeiro comando explícito: `/pipeline-orchestrator:bugfix` end-to-end

**Valor entregue:** O usuário pode digitar `/pipeline-orchestrator:bugfix [task]` e o pipeline correto roda diretamente, sem passar pelo classificador automático. Trace básico é gerado. Comando legacy `/pipeline` continua funcionando idêntico.

**Duração:** ~1 semana solo. Cobre Problemas #1 (mono-skill) e #4 (slash commands específicos) parcialmente.

### BDD — Cenários

```gherkin
Feature: Comando explícito /pipeline-orchestrator:bugfix

Scenario: Usuário invoca bugfix command e pipeline correto roda
  Given o plugin pipeline-orchestrator v5.0-rc.1 instalado
   And um repositório com bug conhecido em src/auth.js
  When o usuário digita "/pipeline-orchestrator:bugfix login está quebrado"
  Then o controller pula a fase de classificação
   And carrega o pipeline `references/pipelines/bugfix-light.md` (ou heavy, conforme complexidade)
   And executa as fases nessa ordem: diagnostic → root-cause → implementation → verification
   And ao final emite o bloco PIPELINE COMPLETE com type="bugfix" e type_source="manual"

Scenario: Compat — comando legado continua idêntico
  Given o mesmo repositório
  When o usuário digita "/pipeline-orchestrator:pipeline login está quebrado"
  Then o classificador automático roda (task-orchestrator)
   And classifica como type=bugfix
   And o restante da execução é idêntica ao v4.1.0 (validado por golden snapshot do Slice 4)

Scenario: Modos ortogonais funcionam no command novo
  Given o plugin v5.0-rc.1
  When o usuário digita "/pipeline-orchestrator:bugfix --hotfix [task]"
  Then o pipeline roda em modo HOTFIX
   And HOTFIX é registrado no TRACE.md como mode="hotfix"
   And type permanece "bugfix" (não é sobrescrito)

Scenario: Discovery — /help mostra os 5 commands
  Given o plugin instalado
  When o usuário digita /help
  Then a lista inclui: pipeline, bugfix (slice 1), e os outros aparecem nos slices 3
   And cada entry tem descrição de uma linha clara sobre quando usar
```

### TDD — Testes primeiro (devem FALHAR antes de implementar)

```
tests/slice1/
├── unit/
│   ├── command-bugfix.test.js
│   │   - "carrega pipeline bugfix-light.md quando complexity=SIMPLES" → FAIL inicialmente
│   │   - "carrega bugfix-heavy.md quando complexity=COMPLEXA" → FAIL
│   │   - "skipa task-orchestrator (classification)" → FAIL
│   │   - "respeita modo --hotfix sem alterar type" → FAIL
│   └── controller-type-injection.test.js
│       - "passa type='bugfix' como parâmetro fixo ao pipeline-controller" → FAIL
└── integration/
    └── e2e-bugfix-command.test.js
        - "command rodado em fixture-repo gera artefatos esperados" → FAIL
        - "command legado /pipeline em mesmo input gera mesmo verdict (CONFIRMED)"  → FAIL
```

Implementação só começa depois que **todos esses testes existem e falham**. RED phase.

### AIDD — Spec executável por agente Claude

```yaml
# slice-1-spec.yaml — consumível por executor-implementer-task agent

slice_id: 1
title: "Command /pipeline-orchestrator:bugfix end-to-end"
prerequisite_slices: [0, 2]  # iter 2: Slice 2 vem antes — TRACE.md já existe quando Slice 1 emite type_source
prerequisite_decisions:
  - "Slice 0 confirmou: hooks PreToolUse podem inspecionar argumentos do Agent call"
  - "Slice 0 inventário confirmou onde lógica de classificação reside"
  - "Slice 2 estabeleceu schema do TRACE.md e quem escreve o quê (pipeline-controller escreve gate-decisions.jsonl; trace-generator só lê)"

files_to_create:
  - path: "commands/bugfix.md"
    purpose: "Slash command entry point. Frontmatter define description; body é prompt curto que invoca pipeline-controller agent passando pipeline_type='bugfix'."
    template_reference: "commands/pipeline.md (estrutura de 38 linhas)"
    constraints:
      - "Não duplica lógica do controller — só passa o tipo fixo"
      - "Aceita mesmos modos do /pipeline (--hotfix, --plan, --grill, --simples, --media, --complexa)"
      - "type_source emitido no PIPELINE COMPLETE block segue enum fixo: 'manual via /pipeline-orchestrator:bugfix' | 'manual via /pipeline-orchestrator:feature' | 'manual via /pipeline-orchestrator:audit' | 'manual via /pipeline-orchestrator:ux' | 'auto via /pipeline'. Valor é setado AQUI no Slice 1 e NUNCA mutado por slices posteriores (Slice 2 só lê para escrever no TRACE)."
      - "pipeline-controller é o ÚNICO escritor de gate-decisions.jsonl. Slice 2 (trace-generator) lê este arquivo, não escreve. Boundary documentado em references/trace-schema/v1.md (Slice 2)."

  - path: "skills/bugfix/SKILL.md"
    purpose: "Skill auxiliar para auto-discovery quando usuário descreve tarefa que claramente é bugfix mas não invoca o command. Thin — delega ao controller."
    constraints:
      - "Description começa com 'Use this skill when the user describes a bug, defect, regression, or unexpected behavior...'"
      - "Não precisa repetir conteúdo do command — invoca o mesmo path interno"

files_to_modify:
  - path: "agents/core/pipeline-controller.md" (ou equivalente conforme inventário do Slice 0)
    change: "Aceitar parâmetro pipeline_type opcional. Se presente, skipa task-orchestrator e vai direto para information-gate com type pré-classificado."
    backwards_compat: "Quando pipeline_type ausente, comportamento idêntico ao v4.1.0"

  - path: ".claude/hooks/sentinel-hook.cjs"
    change: "Reconhecer expected_next='information-gate' (não 'task-orchestrator') quando pipeline_type pré-definido"
    test: "tests/slice1/unit/sentinel-hook-explicit-type.test.js"

agent_dispatch_for_implementation:
  agent: "pipeline-orchestrator:executor:executor-controller"
  context_to_pass:
    - this slice spec (full)
    - INVENTORY.md from Slice 0
    - SPIKE-* files from Slice 0
    - tests/slice1/ (RED tests)
  context_NOT_to_pass:
    - "design original v5 (já foi auditado, só causa ruído)"
    - "specs de slices 2-5 (foco)"

verification:
  red_phase: "todos os tests/slice1/ falham (executar antes de implementar)"
  green_phase: "todos os tests/slice1/ passam após implementação"
  refactor_phase: "code-simplifier agent passa sem CRITICAL findings"
  golden_snapshot: "Slice 4 capturará o output deste slice como baseline"
```

### Definition of Done

- `commands/bugfix.md` existe e é descoberto via `/help`
- `skills/bugfix/SKILL.md` existe e auto-trigga em descrições de bug
- `pipeline-controller` aceita `pipeline_type` parameter sem quebrar caminho legado
- Todos os testes do Slice 1 GREEN
- 1 PR atomico, mergeável independente
- Tag `v5.0.0-rc.1` (ou continua em rc se outros slices ainda em flight)

---

## Slice 2 — TRACE.md universal (Run Record)

**Valor entregue:** Toda execução do plugin (legacy `/pipeline` ou novo `/bugfix`) gera um Run Record consultável. **Default = versionado no repo do usuário** (`.pipeline-orchestrator/runs/`), opt-out para privado em `~/.claude/data/` via setting. Decisão pós-iter 2 do review: para honrar tese "trilha auditável anexável a PR", o default precisa entregar isso sem opt-in. Mitigação para devs que não querem commitar: prompt na 1ª execução + template de `.gitignore` documentado.

**Duração:** ~1 semana solo. Cobre Problema #3 (observabilidade post-hoc) e parte de #2 (trilha do classificador via campos type_source/complexity_source).

### BDD — Cenários

```gherkin
Feature: Run Record persistido por execução

Scenario: Run Record versionado no repo por default
  Given o plugin v5.0-rc.2 com defaults sem customização
  When qualquer pipeline (pipeline ou bugfix) completa
  Then um arquivo `.pipeline-orchestrator/runs/{timestamp}-{6char}-{slug}/TRACE.md` é criado no repo do usuário
   And contém todos os campos do schema_version=1
   And aparece em `git status` para commit consciente
   And, se for a 1ª execução no repo, um prompt one-time explica o default + sugere `.gitignore` template

Scenario: Opt-out para path privado
  Given o usuário adicionou `pipeline-orchestrator.persist_runs: private` em .claude/settings.json
  When uma execução completa
  Then o TRACE.md é escrito em `~/.claude/data/pipeline-orchestrator/runs/{timestamp}-{6char}-{slug}/TRACE.md`
   And NÃO aparece em `git status`

Scenario: TRACE.md captura trilha do classificador
  Given o classificador automático rodou em /pipeline (não em bugfix explícito)
  When o TRACE.md é gerado
  Then o campo type_source é "auto via /pipeline"
   And o campo justification tem 2-3 frases explicando POR QUE foi classificado como bugfix
   And o campo complexity_source explica os domains_touched que escalaram a complexidade

Scenario: TRACE.md sobrevive update de plugin
  Given um TRACE.md em ~/.claude/data/
  When o plugin é atualizado de v5.0 para v5.1
  Then o TRACE.md continua acessível
   And o leitor de v5.1 (Slice 5+ futuro) reconhece schema_version=1 como compatível
```

### TDD — Testes primeiro

```
tests/slice2/
├── unit/
│   ├── trace-generator.test.js
│   │   - "gera path em .pipeline-orchestrator/runs/ por default (repo)" → FAIL
│   │   - "gera path em ~/.claude/data/ quando persist_runs=private" → FAIL
│   │   - "quando setting ausente, fallback é 'repo' (não 'private')" → FAIL
│   │   - "schema_version=1 sempre presente" → FAIL
│   │   - "duration_seconds calculado corretamente" → FAIL
│   │   - "user_identity fallback quando não em git repo" → FAIL
│   └── trace-schema-validator.test.js
│       - "rejeita TRACE com campo desconhecido" → FAIL
│       - "rejeita TRACE com schema_version inválido" → FAIL
└── integration/
    └── trace-end-to-end.test.js
        - "rodar pipeline real gera TRACE válido conforme schema" → FAIL
        - "TRACE inclui Pipeline Definition snapshot do .md carregado" → FAIL
```

### AIDD — Spec executável

```yaml
slice_id: 2
title: "Run Record (TRACE.md) universal"
prerequisite_slices: [0]  # iter 2: Slice 2 agora vem ANTES de Slice 1 (TRACE materializa a tese desde rc.1)

decisions_locked:
  - "Default = repo (.pipeline-orchestrator/runs/) — iter 2 do review reverteu o default privado da iter 1 para honrar a tese 'anexável a PR'"
  - "Setting é pipeline-orchestrator.persist_runs: 'repo' (default) | 'private' (opt-out)"
  - "Prompt one-time na 1ª execução por repo explicando o default e oferecendo .gitignore template"
  - "Schema versionado (schema_version: 1) desde dia 1"
  - "trace_schema_version separado de plugin_version (evolução independente)"

files_to_create:
  - path: "agents/core/trace-generator.md"
    purpose: "Sub-agent invocado no final de toda execução para escrever TRACE.md"
    inputs:
      - all phase outputs from PIPELINE_DOC_PATH
      - sentinel-state.json (final)
      - gate-decisions.jsonl (full)
      - PROJECT_CONFIG (PROJECT_CONFIG.persist_runs setting)
    output: "TRACE.md no path determinado pela config"

  - path: "references/trace-schema/v1.md"
    purpose: "Documenta o schema canônico do TRACE.md v1. Future-self lê isso, não código."

files_to_modify:
  - path: "commands/pipeline.md" e "commands/bugfix.md"
    change: "Adicionar etapa final que invoca trace-generator antes de emitir PIPELINE COMPLETE block"

  - path: "settings.json schema (documentação)"
    change: "Documentar nova chave: pipeline-orchestrator.persist_runs: 'repo' (default) | 'private' (opt-out)"

agent_dispatch_for_implementation:
  agent: "pipeline-orchestrator:executor:executor-controller"
  # iter 2: paralelismo removido. Slice 2 → Slice 1 sequencial.

verification:
  red_phase: "tests/slice2/ todos falham"
  green_phase: "tests/slice2/ passam + manual smoke (rodar /pipeline-orchestrator:bugfix em fixture e abrir TRACE.md gerado)"
  user_validation_required: "PERGUNTAR ao primeiro adopter beta se TRACE.md em PR é útil ou ruído (decisão Open Question #4)"
```

### Definition of Done

- TRACE.md gerado em toda execução
- Default repo (versionado), opt-out privado documentado (revertido na iter 2)
- Schema validável por script standalone
- 2 entradas reais geradas em fixture-repo (uma /pipeline, uma /bugfix)
- Tag `v5.0.0-rc.2` ou continua acumulando

---

## Slice 3 — Comandos restantes: `/feature`, `/audit`, `/ux`

**Valor entregue:** Os 4 tipos de pipeline têm comando explícito. Documentação `commands × modes` matrix publicada.

**Duração:** ~0.5-1 semana. É repetição do padrão do Slice 1, multiplicada por 3.

### BDD — Cenário paramétrico

```gherkin
Feature: Comandos explícitos para feature, audit, ux

Scenario Outline: Cada command força seu tipo
  Given o plugin v5.0-rc.3
  When o usuário digita "/pipeline-orchestrator:<command> <task>"
  Then o pipeline correto carrega sem passar pelo classificador
   And o TRACE.md registra type=<type> e type_source="manual via /pipeline-orchestrator:<command>"

  Examples:
    | command  | type    |
    | feature  | feature |
    | audit    | audit   |
    | ux       | ux      |

Scenario: Matrix commands × modes documentada
  Given o release v5.0
  When o usuário consulta `docs/commands-modes-matrix.md`
  Then encontra tabela 5×8 (5 commands × 8 modes) marcando válidos/inválidos/sem-efeito
   And exemplos para cada combinação não-trivial
```

### TDD — Pattern reuse

Mesmo template de testes do Slice 1, parametrizado por command name. `tests/slice3/unit/command-{feature,audit,ux}.test.js` — gerados a partir de fixture, não escritos à mão.

### AIDD — Spec compacta

```yaml
slice_id: 3
title: "Commands restantes (feature, audit, ux)"
prerequisite_slices: [0, 2, 1]  # iter 2: ordem sequencial 0→2→1→3

pattern: "Idêntico ao Slice 1, repetido 3x"
files_to_create:
  - "commands/feature.md, commands/audit.md, commands/ux.md (3 thin wrappers)"
  - "skills/feature/SKILL.md, skills/audit/SKILL.md, skills/ux/SKILL.md (3 thin)"
  - "docs/commands-modes-matrix.md (manual, decisão de produto)"

agent_dispatch_for_implementation:
  agent: "pipeline-orchestrator:executor:executor-controller"
  hint: "Invocar com batch_size=3 para gerar os 3 commands em uma rodada (são quase idênticos)"

verification:
  - "/help mostra os 5 commands"
  - "Cada um carrega seu pipeline correto"
  - "Matrix doc cobre os 40 cells"
```

### Definition of Done

- 5 commands em `/help`
- Matriz documentada
- Tests Slice 3 GREEN
- Tag `v5.0.0-rc.3`

---

## Slice 4 — Compat regression suite com escopo honesto

**Valor entregue:** CI valida que `/pipeline-orchestrator:pipeline` continua produzindo o mesmo **contrato observável** (não texto literal) em N cenários canônicos. Quebra de compat trava merge.

**Duração:** ~1.5-2 semanas. Cobre Problema #5 parcialmente (auditoria do auditor base).

### BDD — Cenários

```gherkin
Feature: Compat regression suite

Scenario: Snapshot de contrato observável (não prosa)
  Given um cenário canônico "fix-login-bug" em tests/compat/v4-baseline/scenarios/
   And um expected.yaml gerado a partir de execução em v4.1.0 contendo:
       - classification: { type, complexity }
       - gates_triggered: [lista ordenada com hardness]
       - agents_invoked: [lista ordenada]
       - artifacts_produced: [filenames apenas, não conteúdo]
       - verdict: GO | CONDITIONAL | NO-GO
  When o cenário é executado em v5.0
  Then todos os campos do expected.yaml batem
   And texto literal de prompts/outputs intermediários é IGNORADO (estocástico)

Scenario: Quebra de compat trava merge
  Given um PR que muda comportamento de classificação
  When CI roda compat-suite e detecta divergência em algum cenário
  Then o merge é bloqueado
   And o PR template pede justificativa explícita ou correção

Scenario: Suite executável localmente em < 5 minutos
  Given um dev solo trabalhando no plugin
  When ele roda `npm run test:compat`
  Then todos os N cenários canônicos completam em < 5 min
   And output mostra clearly quais passaram e quais divergiram
```

### TDD — Suite É o teste

Slice 4 não tem RED-GREEN tradicional (a "implementação" é o test runner). Mas TEM:
- Tests para o test runner: `tests/slice4/runner.test.js` valida que o snapshot comparator ignora prosa e compara apenas contrato.
- Fixture repository com bug conhecido + spec esperada.

### AIDD — Spec

```yaml
slice_id: 4
title: "Compat regression suite (escopo honesto)"
prerequisite_slices: [0]  # spike CI harness
critical_dependency: "SPIKE-CI-HARNESS.md PASS — sem isso, slice é redesenhado"

decisions_locked:
  - "Granularidade de assertion: contrato observável (4 campos), não prosa"
  - "Cenários canônicos: 5 inicialmente (1 por type + 1 hotfix), expansível"
  - "CI runtime budget: < 5 min total"

files_to_create:
  - "tests/compat/v4-baseline/scenarios/{name}/input.md"
  - "tests/compat/v4-baseline/scenarios/{name}/expected.yaml"
  - "tests/compat/runner.cjs (executa cenário via Claude Code CLI ou mock conforme Slice 0 decision)"
  - ".github/workflows/compat-regression.yml"

agent_dispatch_for_implementation:
  agent: "pipeline-orchestrator:executor:executor-controller"
  hint: "Implementador deve consultar SPIKE-CI-HARNESS.md do Slice 0 para escolher abordagem (CLI headless real vs mock harness)"

risks_documented:
  - "Se runtime real do Claude Code em CI for inviável, fallback é mock harness — perde fidelidade mas mantém regression detection em camada de controller"

branch_on_spike_result:
  PASS:
    description: "SPIKE-CI-HARNESS=PASS (claude headless funciona em GitHub Actions)"
    implementation: "runner.cjs invoca claude --headless e captura output real"
    fidelity: "alta (testa o produto real)"
  FAIL:
    description: "SPIKE-CI-HARNESS=FAIL (CLI não roda headless ou é instável em CI)"
    implementation: "runner.cjs usa mock harness — interceptador de Agent calls que retorna respostas fixture; valida apenas a camada controller (ordem de fases, gates disparados, agents invocados)"
    fidelity: "média (testa controller, não LLM behavior)"
    not_blocking: "Slice 4 prossegue com mock; documentar limitação em tests/compat/README.md"
```

### Definition of Done

- 5 cenários canônicos rodando em CI
- Quebra de compat trava merge
- Suite roda em < 5 min
- Documento `tests/compat/README.md` explica como adicionar cenários
- Tag `v5.0.0` (release final)

---

## Slice 5 — YAML interpreter (COMMITTED v5.1, prazo ≤ Q+2)

**Status pós-iter 2:** **Compromisso firmado**, não condicional. Decisão estratégica: o pilar (a) da tese ("pipeline declarativo") só fecha com este slice. Adiar indefinidamente diluiria o positioning "caixa de vidro" para sempre.

**Janela de release:** ≤ 2 quarters após v5.0 (se v5.0 sai em Q2-2026, v5.1 deve sair até Q4-2026). Milestone correspondente criada no issue tracker antes de tag v5.0 (ver Definition of v5.0 Done #5).

**Sinais de re-priorização (não cancelamento):** se durante v5.0 emergir evidência forte de que o YAML interpreter é desnecessário (ex: 0 issues pedindo customização em 12 semanas + autor não sentiu dor com markdown), reabrir decisão com novo design doc — não silenciosamente abandonar.

### Bifurcação obrigatória se construído

A auditoria identificou risco HIGH em "agent interpretando YAML LLM-style". Se Slice 5 acontecer, deve ser bifurcado:

- **Camada determinística (hook JS + parser):** lê YAML, valida contra schema + allow-list, produz JSON estruturado. Agent **nunca** vê YAML cru.
- **Camada LLM (agent):** recebe JSON pré-validado. Raciocina apenas dentro de constraints declaradas.

Esquema completo do Slice 5 fica fora deste documento (não é v5.0 scope).

---

## Sequência recomendada (sequencial — sem paralelismo solo)

Pós-iter 2: ordem reorganizada goal-backward (TRACE.md primeiro porque é o que materializa "caixa de vidro" e baseline para Slice 4) e paralelismo removido (para dev solo, branches paralelas viram context-switching, não throughput).

```
Slice 0 (spike, 2-3 dias) ─── BLOQUEANTE
   │
   v
Slice 2 (TRACE.md universal, ~1 sem) ─── materializa a tese desde rc.1
   │
   v
Slice 1 (/bugfix command, ~1 sem) ─── primeiro command explícito
   │
   v
Slice 3 (/feature, /audit, /ux, ~0.5-1 sem) ─── completa surface area
   │
   v
Slice 4 (compat suite, ~1.5-2 sem) ─── trava regressões
   │
   v
v5.0.0 (release)
   │
   v
Slice 5 (YAML interpreter, ~6-8 sem) ─── COMMITTED v5.1 (≤ Q+2)
   │
   v
v5.1.0 (tese completa)
```

**Total v5.0 (Slices 0-4):** **4-7 semanas solo, sequencial.** Range largo porque Slice 0 pode revelar surpresas que reformam o resto. Comparado a 11-16 do plano original (que tinha baseline errado), é redução de ~50% para v5.0 + entrega adicional comprometida em v5.1.

**Nota sobre prereqs:** Slice 1 ainda lista Slice 0 como prereq (correto). Slice 1 lista Slice 2 como prereq agora — porque Slice 2 emite o TRACE.md que Slice 1 BDD valida ("type_source registrado no TRACE"). Specs AIDD dos slices ajustadas para refletir nova ordem.

---

## Como AIDD funciona na prática neste projeto

Cada slice deste documento é projetado para ser **executável por agente Claude com mínima intervenção humana**. O ciclo concreto:

1. **Humano (autor)** escreve a spec do slice (este doc) e os testes RED (tests/sliceN/).
2. **Humano** invoca `/pipeline-orchestrator:feature implementar Slice N do plano vertical` (usando o próprio plugin que está sendo construído — dogfooding).
3. **Pipeline-controller** carrega Slice 1 spec como contexto, dispara `executor-implementer-task` agent.
4. **Executor agent** lê os testes RED, implementa código mínimo para passar, marca tests GREEN.
5. **Spec-reviewer + quality-reviewer** validam que implementação cumpre acceptance criteria do Gherkin.
6. **Adversarial gate** (já existente no v4) valida segurança/arquitetura.
7. **Humano** aprova fechamento e merge.

Isso significa: o plugin **se constrói consumindo a si mesmo**. Esse é o significado prático de AIDD aqui — specs estruturadas para que o agente possa executar autonomamente, com humano como aprovador de gates, não como digitador de código.

**Pré-requisito honesto:** Slice 0 precisa confirmar que o plugin v4.1.0 atual é capaz de fazer isso minimamente bem. Se o plugin atual for instável demais para se auto-construir, AIDD vira AI-Assisted (humano digita mais). Decisão fica para Slice 0.

---

## Open Questions endereçadas (vs. design original)

| Open Question original | Status pós este redesign |
|---|---|
| Q1: `/pipeline` entry point principal ou fallback? | **Decidido (status quo, com risco aceito conscientemente)**: ambos válidos como peers. O product-reviewer apontou risco de paradox of choice e crise de identidade ("auto-classificador inteligente" vs "5 pipelines explícitos" têm DNA incompatível). Risco aceito pelo autor para v5.0. Mitigação: README precisa ter seção explícita "Quando usar `/pipeline` vs commands específicos" com decision tree de 1 parágrafo. Re-avaliar decisão pós-release com base em feedback real. |
| Q2: Modos preservados em todos os 5 commands? | **Decidido**: sim, todos preservados; matriz Slice 3 marca os sem-efeito. |
| Q3: YAML loader estrito ou permissivo? | **Adiada**: relevante apenas se Slice 5 acontecer. |
| Q4: TRACE.md no repo do usuário (versionado) ou privado? | **Decidido na iter 2**: REPO por default (`.pipeline-orchestrator/runs/`), opt-out para privado em `~/.claude/data/` via setting. Inversão da decisão da iter 1 — honra tese "anexável a PR" sem opt-in. |
| Q5: Comportamento em downgrade v5→v4? | **Decidido**: TRACE.md é só markdown em diretório que v4 ignora. Documentar em migration guide (Slice 4 ou release notes). |

---

## O que fica fora deste plano (e por quê)

- **Detalhamento de Slice 5** — depende do gatilho pós-release.
- **Distribution plan** — saiu do design técnico, vira `docs/release-plan-v5.md` separado (recomendação da auditoria scope).
- **Threat model formal** — para plugin solo OSS pré-1.0, mitigações inline (allow-list, schema validation) bastam. Documento formal só se usuário corporativo aparecer.
- **Inspector pré-execução** (`/inspect`, ASCII diagram) — fica em v5.2 conforme design original.
- **Golden runs (auditoria do auditor com fixture-vs-actual)** — Slice 4 é a versão minimal disso. Versão completa em v5.1.

---

## Próximos passos imediatos

1. **Hoje**: aprovar este plano (segunda iteração — substitui Componentes do design v5).
2. **Próximos 2-3 dias**: executar Slice 0 (você mesmo, não delegue). Output: INVENTORY + 3 SPIKE-*.md.
3. **Após Slice 0**: revisar este documento à luz dos achados; recalcular estimativas Slices 1-5.
4. **Criar milestone "v5.1 — Pipeline Declarativo (Slice 5)"** no issue tracker com data alvo ≤ Q+2 (DoD #5).
5. **Slice 2** (TRACE.md, ~1 sem) — primeiro slice produtivo, materializa tese desde rc.1.
6. **Slice 1** (/bugfix, ~1 sem) — primeiro command explícito, primeiro teste real de AIDD com plugin se construindo.
7. **Slice 3** (/feature, /audit, /ux, ~0.5-1 sem).
8. **Slice 4** (compat suite, ~1.5-2 sem).
9. **Tag v5.0.0** — verificar todos os 5 critérios da Definition of v5.0 Done antes.
10. **Slice 5** (YAML interpreter) — começar IMEDIATAMENTE após v5.0; janela ≤ Q+2.
11. **Tag v5.1.0** — pilar declarativo da tese fechado.
