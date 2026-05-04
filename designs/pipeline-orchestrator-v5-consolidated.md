# Pipeline-Orchestrator v5.0 — Design Consolidado (SSOT)

## 0. Metadados

- **Data inicial:** 2026-04-29
- **Última revisão:** 2026-05-02 (Slice 3a design adicionado §22 — Pulsar audit workflow import)
- **Status:** DRAFT consolidado — Slices 0+0.5+1+1.5+3a ENTREGUES (v4.5.0); Slices 2 + 3 (resto) + 4 PENDENTES
- **Supersedes:** D1 (`pipeline-orchestrator-v5-pipeline-as-code.md`), D2 (`pipeline-orchestrator-v5-execution-vertical-slices.md`), D3 (`pipeline-orchestrator-v5-addendum-context-and-policies.md`) — todos arquivados em `designs/legacy/`.
- **SSOT:** este documento. Em caso de divergência com D1/D2/D3, ESTE prevalece.
- **Reality-check baseline:** verificado em 2026-04-29 contra repositório canonical. Em 2026-04-30, canonical foi sincronizado de v3.0.2 para v4.1.3 e em seguida bumpado para v4.2.0 (Slice 1) + v4.2.1 (SEC patch) + v4.3.0 (skill migration) + v4.3.1 (review polish). Em 2026-05-01, design Slice 1.5 fechado em §21 (Pulsar bugfix workflow import) e v4.4.0/v4.4.1 entregues. Em 2026-05-02, design Slice 3a fechado em §22 (Pulsar audit workflow import) e v4.5.0 entregue. Ver `designs/slice-0/INVENTORY.md` para baseline pós-execução.
- **Versão atual no marketplace:** **v4.5.0** (Slice 3a entregue 2026-05-02 — Pulsar audit workflow import; ver §22).
- **Repositório:** github.com/fernandoxavier02/Pipeline-Orchestrator
- **Modo de redação:** Builder + consolidação adversarial.
- **Esforço já consumido:** ~1 dia solo (2026-04-30) — sync 4.1.3 + Slice 0.5 + Slice 1 + patch SEC.
- **Esforço restante v5.0 (Slices 2+3+4):** 1.5–2 semanas solo.
- **Esforço v5.1 (Slice 5):** +3–5 semanas adicionais; janela ≤ Q+2 após v5.0.

### Convenções deste documento

- `[VERIFICADO]` — afirmação validada contra repo real em 2026-04-29.
- `[HIPOTESE]` — afirmação plausível, não confirmada empiricamente.
- `[DESIGN]` — decisão de design, não fato observável ainda.
- `[A SER DEFINIDO]` — gap conhecido, não inventar.
- Citações de origem usam `D1:linha`, `D2:linha`, `D3:linha`.

---

## 1. Problem Statement

Origem: D1:10–20.

O plugin `pipeline-orchestrator` é tecnicamente sólido — vários agentes em camadas, hooks de guard, Sentinel, classificação automática, gates de qualidade. Mas é caixa-preta opaca pra quem usa. Cinco sintomas catalogados:

1. **Mono-skill condensada** — único entry point (`/pipeline-orchestrator:pipeline`) esconde diversidade de comportamentos atrás de classificação implícita.
2. **Classificador opaco** — `task-orchestrator` decide tipo+complexidade sem trilha de raciocínio visível.
3. **Falta de observabilidade live** — durante execução não há visualização de fase em curso, gates passados/falhados.
4. **Ausência de slash commands específicos** — não é possível forçar `bugfix`, `feature`, `audit`, `ux` diretamente.
5. **Auditoria do auditor inexistente** — nenhum mecanismo confirma que cada pipeline interno ainda segue as boas práticas que promete.

Raiz comum: **opacidade arquitetural**.

### 1.1 Reality-check de baseline (corrigido inline)

D1 declarava (D1:12 e D1:262) números que estão errados contra o repo real. Correções:

| Afirmação D1 | Realidade 2026-04-29 | Fonte |
|---|---|---|
| 38 agentes | **19 agentes** [VERIFICADO] | `agents/**/*.md` |
| `commands/pipeline.md` ~1100 linhas | **957 linhas** [VERIFICADO] | `wc -l commands/pipeline.md` |
| 7 hooks | **2 hooks reais** (`completion-checklist.cjs`, `force-pipeline-agents.cjs`) [VERIFICADO]; 5 referenciados são teóricos | `.claude/hooks/` |
| 12 pipelines `.md` | **10 pipelines `.md`** [VERIFICADO] | `references/pipelines/*.md` |
| Plugin v4.1.0 / v4.1.x | **plugin.json declara 3.0.2; README badge 3.1.0** [VERIFICADO] | `.claude-plugin/plugin.json`, `README.md` |
| `pipeline-controller` agent existe | **NÃO existe** em `agents/core/` [VERIFICADO] | gap CRITICAL — ver §15 e §16 |

Implicação: design docs foram empilhados em cima de baseline assumido, não verificado. Slice 0 deve auditar e atualizar todos os números antes de qualquer execução.

---

## 2. What Makes This Cool

Origem: D1:22–32.

A versão sensacional do plugin não é "mais agentes". É a inversão filosófica: pipeline-orchestrator vira o primeiro plugin Claude Code construído como **caixa de vidro por design**.

Três propriedades que nenhum plugin Claude Code entrega bem hoje:

- **Pipeline declarativo, versionado, lido pelo usuário antes de rodar.** (Plenamente em v5.1; em v5.0 shapes são markdown — ver §7.2 e §11.)
- **Trilha de auditoria persistida em git, anexável a PR.**
- **Auditoria do auditor via golden runs** — testes que validam que cada pipeline ainda faz o que promete.

Posicionamento defensável porque é estrutural, não cosmético. Tipo de coisa que vira referência arquitetural na comunidade.

---

## 3. Constraints

Origem: D1:34–41.

- Plugin pessoal, OSS, MIT, FX Studio AI; sem time grande.
- Pré-1.0 mainstream — janela de breaking changes ainda gerenciável.
- Stack: Markdown com YAML frontmatter pra agentes/skills, JS CommonJS pra hooks, Claude Code 2.x.
- Compatibilidade obrigatória: `/pipeline-orchestrator:pipeline` precisa continuar funcionando idêntico em v5.
- Persona alvo: arquiteto B2B senior. Previsibilidade > magia, trilha persistida > visualização animada, conformidade > experiência ágil, controle explícito > defaults inteligentes.
- Janela realista: dono solo, sprints curtos. Boil the lake é viável; boil the ocean não é.

---

## 4. Premises

Origem: D1:43–51 (validadas em office-hours 2026-04-26).

1. Persona alvo é arquiteto B2B senior; previsibilidade, auditoria persistida, conformidade e controle explícito ranqueiam acima de magia, animação, agilidade e defaults.
2. Tema unificador é caixa de vidro: explicável, navegável, auditável por design.
3. Arquitetura consolida no nível plugin (um plugin cobre audit, feature, bugfix, UX) e modulariza no nível skill+slash command.
4. "Aprendizado das execuções passadas" é documentação acumulada e consultável (artefato somente-leitura), não aprendizado adaptativo do classificador. Determinismo preservado.
5. Os cinco problemas têm raiz comum (opacidade) e devem ser resolvidos por redesign coerente, não cinco fixes desconectados.

---

## 5. Glossário & Linguagem Ubíqua

### 5.1 Termos cunhados na consolidação

D1 e D2 usam "slice" ambiguamente. Resolução:

- **Release Slice** — unidade de entrega vertical do plano de execução. Cada Release Slice atravessa todas as camadas necessárias, é shippeável (`v5.0.0-rc.N`) e independente das anteriores. Slices 0, 0.5, 1, 2, 3, 4, 5 deste documento são todos Release Slices.
- **Vertical Feature Slice** — conceito DDD interno do pipeline `feature`: um corte vertical da feature (UI + domain + persistence + tests) entregando 1 user story end-to-end. Aparece dentro do shape do pipeline `feature`, não do plano de execução do plugin.

Sempre que aparecer "slice" sem qualificação neste doc, ler como **Release Slice** salvo se contexto for o pipeline `feature`.

### 5.2 Bounded contexts

Cada um dos 4 pipelines é um bounded context com glossário próprio (10–15 termos cada), localizado em `references/glossary/{pipeline}.md`:

- `bugfix.md` — vocabulário: hipótese ranqueada, root cause, terrain recon, regression, sanity, pa de cal.
- `feature.md` — vocabulário: user story, acceptance criteria, vertical slice, intent, slice plan.
- `audit.md` — vocabulário: finding, severity, surface area, threat model, matriz de risco, intake.
- `ux.md` — vocabulário: persona, journey walk, friction point, severity, improvement proposal.

Bugfix nunca diz "user story"; feature nunca diz "root cause hypothesis". Cross-talk entre pipelines acontece via tradução explícita, registrada no TRACE.md (ver §13).

### 5.3 Termos compartilhados

- **Evidência cirúrgica** — asserção com `file:line:column` ou trecho exato de log (≤200 chars) ou parágrafo de spec citado.
- **Composição emergente** — invocação de agente B por agente A sem o usuário pedir; cap 2 níveis de aninhamento, 5 invocações por execução.
- **TRACE.md / Run Record** — artefato versionável escrito ao final de toda execução; schema_version=1.
- **Domain-native agent** — agente Layer 1 que só fala vocabulário de um bounded context.
- **Cross-cutting agent** — agente Layer 3 invocável de qualquer pipeline (adversarial-reviewer, security-scanner, quality-gate, context-injector).

---

## 6. Approaches Considered & Recommended

### 6.1 Approaches considerados

Origem: D1:54–66.

- **Approach A — Pipeline Trace (mínimo viável):** slash commands explícitos por tipo + TRACE.md por execução, mantendo arquitetura interna como está. Esforço S–M, risco baixo, cobre 3 dos 5 problemas. Não resolve mono-skill nem opacidade durante execução.
- **Approach B — Pipeline as Code (recomendada):** refatoração estrutural; cada tipo vira sua própria skill+command, definição declarativa em YAML (em v5.1), golden runs como auditoria do auditor, TRACE.md persistido. Esforço L, risco M, cobre os 5 problemas com escopo honesto.
- **Approach C — Pipeline Inspector (lateral):** `/inspect` e `/explain` em cima da arquitetura atual. Esforço M, risco baixo–médio. Solução parcial.

### 6.2 Recommended

**B — Pipeline as Code, fasada em três marcos (v5.0, v5.1, v5.2), com C absorvido em v5.1.**

- **v5.0:** multi-skill + multi-command + TRACE.md + compat regression suite + 9 agentes domain-native + caps Light/Heavy + COMPLEXITY_GATE + context & policies (Slice 0.5). Núcleo do redesign.
- **v5.1:** golden runs (auditoria do auditor) + parte do Inspector (`/explain` sobre TRACE passado) + **YAML interpreter (Slice 5, COMMITTED ≤ Q+2)**.
- **v5.2:** Inspector completo (`/inspect` pré-execução com diagrama ASCII).

### 6.3 Componentes C-1..C-6 originais (D1:96–266) — OBSOLETOS

D1 propunha decomposição horizontal (C-1 multi-command, C-2 YAML interpreter, C-3 hooks, C-4 TRACE.md, C-5 compat suite, C-6 histórico) com total 11–16 semanas. **Substituído por Slices 0–5** (D2:285–293) com total 4–7 semanas para v5.0 + 6–8 para v5.1.

C-1..C-6 ficam preservados em §19 (Apêndice A) como histórico de iterações; **não são executáveis**.

---

## 7. Arquitetura V5

Origem: D2:64–233.

### 7.1 Layer 1 — Agentes domain-native

**Escopo v5.0: 9 agentes** (D2:68–82). Diferidos pra v5.1: 10 (D2:84–92).

#### 7.1.1 Inventário v5.0 (9 agentes)

| Pipeline | Agente | Arquétipo Pulsar | Justificativa BDD |
|---|---|---|---|
| bugfix | `bugfix-diagnostician` | `diagnostic.md` (1:1) | Slice 1 BDD: controller pula classificação e executa diagnostic→root-cause→implementation→verification |
| bugfix | `bugfix-fix-proposer` | `executor.md` | Slice 1 BDD: fase de implementation precisa de agente que propõe diff mínimo |
| feature | `feature-vertical-slice-planner` | `plan.md` | Slice 3 BDD: feature pipeline precisa modelar slice antes de implementar (renomeado de `feature-slice-architect` em 2026-05-03 para alinhar com nome real do agent — ver §17.3 #12) |
| feature | `feature-implementer` | `executor.md` | Slice 3 BDD: implementação do slice (renomeado de `feature-slice-implementer` em 2026-05-03 — ver §17.3 #12) |
| feature | `feature-integration-validator` | (novo) | Slice 3 BDD: validation de integração pós-implementation (passo 11/12 do shape; agente real existente, faltava no inventário original) |
| audit | `audit-intake-mapper` | (novo) | Slice 3 BDD: audit pipeline precisa fase de intake |
| audit | `audit-finding-classifier` | `plan.md` + `adversarial.md` | Slice 3 BDD: audit produz findings classificados |
| ux | `ux-journey-walker` | `ux-qa.md` (1:1) | Slice 3 BDD: ux pipeline precisa simular jornada |
| ux | `ux-improvement-proposer` | (novo) | Slice 3 BDD: ux produz sugestões priorizadas |
| cross | `adversarial-reviewer` | `adversarial.md` | Cross-pipeline com checklist dinâmico por domínio |

**Estimativa:** 0.5 dia/agent = 4–5 dias somando.

**Resolução de naming (D1 vs D2):** D1:146 dizia `bugfix-diagnostic-agent`. D2:73 diz `bugfix-diagnostician`. Consolidado adota **`bugfix-diagnostician`** porque D2 é a espinha dorsal e o nome é mais conciso.

#### 7.1.2 Inventário v5.1 (10 agentes diferidos)

- bugfix: `bugfix-domain-guardian`, `bugfix-evidence-collector` (split do diagnostician se evidência ficar pesada), `bugfix-rootcause-confirmer`
- feature: `feature-domain-modeler`, `feature-userstory-decomposer`, `feature-acceptance-criteria-author`
- audit: `audit-domain-mapper`, `audit-severity-rater`, `audit-mitigation-proposer`
- ux: `ux-persona-synthesizer`, `ux-domain-persona-keeper`, `ux-friction-cataloger`
- cross (v5.1): `reliability-reviewer`

Cada um só ganha spec quando emergir cenário BDD concreto.

#### 7.1.3 Bounded context — translation-explicit, não hard boundary

Agente domain-native pode invocar agente cross-pipeline ou de outro pipeline **se a tradução de vocabulário for explícita e logada no TRACE.md**. Não é hard boundary purista; é DDD pragmático para projeto solo. Exemplo (D2:96): bugfix precisa entender feature recém-modelada → chama `feature-slice-architect` registrando `tradução: "área afetada" (bugfix) ↔ "slice escopo" (feature)` no TRACE.

#### 7.1.4 Spec template

Toda spec de agente domain-native segue template em `references/agent-spec-template.md`. Criado como parte do **Slice 0** (D2:99). Mínimo: frontmatter (`name, model, tools, memory`) + Papel + Inputs + Outputs + Critérios PASS/FAIL + Composição emergente permitida.

### 7.2 Layer 2 — Pipeline shapes

Origem: D2:104–198.

Em v5.0, shapes são `.md` herdados do Pulsar com tabela de ownership embutida. Em v5.1 (Slice 5), viram YAML declarativo com schema validável (D2:194).

Localização: `references/pipelines/{tipo}-{light|heavy}.md`.

#### 7.2.1 bugfix — shape investigativo

**Heavy (11 passos):** absorve `PIPELINE_BUGFIX_HEAVY.md` do Pulsar.

1. Terrain Recon Diagnostic
2. Root Cause Consolidation
3. Domain Truth Model
4. Controlled Change Proposal (gate APROVAÇÃO)
5. TDD Pre-Impl (RED)
6. Execute Minimal Diff (GREEN)
7. Post-Change Sanity + Regression
8. Adversarial UX/Tech Review
9. UX User Journey Simulation
10. Pa de Cal (Go/No-Go)
11. Final Validation Post-After-All

**Light (8 passos):** shape próprio, não diluição. Cap "max 2 arquivos / 50 linhas / 1 hipótese". Auto-escalation no passo 7 (COMPLEXITY_GATE).

**Tabela de ownership Heavy:**

| Passo | Owner | Tipo |
|---|---|---|
| 1 Terrain Recon Diagnostic | `bugfix-diagnostician` | agente |
| 2 Root Cause Consolidation | `bugfix-diagnostician` | agente |
| 3 Domain Truth Model | `pipeline-controller` | procedimental |
| 4 Controlled Change Proposal | `bugfix-fix-proposer` (dry-run) → `pipeline-controller` (gate) | agente + gate |
| 5 TDD Pre-Impl (RED) | `pipeline-controller` | procedimental |
| 6 Execute Minimal Diff (GREEN) | `bugfix-fix-proposer` | agente |
| 7 Post-Change Sanity + Regression | `pipeline-controller` | procedimental |
| 8 Adversarial UX/Tech Review | `adversarial-reviewer` | agente cross |
| 9 UX User Journey Simulation | `ux-journey-walker` (cross-pipeline com tradução) | agente |
| 10 Pa de Cal | `pipeline-controller` | gate |
| 11 Final Validation Post-After-All | `pipeline-controller` | procedimental |

#### 7.2.2 audit — shape forense, read-only

**Heavy/Light: 9 passos cada** (D2:120). Único pipeline onde Light = Heavy em estrutura — pular fases compromete cobertura.

1. Intake Completo + Inventário
2. Arquitetura/Limites/Módulos
3. Domínio/Regras de Negócio/SSOT
4. Contratos/APIs/Endpoints
5. Dados/Migrações/Integridade
6. Frontend (estado/acessibilidade)
7. Backend (auth/observabilidade)
8. Governança/Testes/CI-CD
9. Pa de Cal + Matriz de Risco

TDD não se aplica (read-only). Outputs incluem matriz de risco.

**Ownership:** passo 1 = `audit-intake-mapper`; passos 2–8 = `audit-finding-classifier` (parametrizado por área); passo 9 = `pipeline-controller` com `adversarial-reviewer` invocado emergentemente se findings críticos detectados.

#### 7.2.3 feature — shape construtivo via Vertical Feature Slice

**Heavy (13 passos):** absorve `PIPELINE_IMPLEMENT_HEAVY.md`.

1. Intent Scope
2. Terrain Recon
3. User Flow UX
4. Domain Rules
5. Source of Truth
6. Data Model
7. Architecture Design Options
8. Risk Controls
9. Implementation Plan
9b. TDD Pre-Impl (RED)
10. Execution Minimal Diff (GREEN)
11. Testing Validation
12. Release Observability
13. Done

**Light (13 passos compartilhados com Heavy — atualizado 2026-05-03 governance audit):** mesma estrutura semântica de 13 passos do Heavy, com cap "1 user story de no máx 5 acceptance criteria, 1 vertical slice" enforced por verbosidade reduzida do prompt em cada step (mode flag). Decisão tomada após import do Pulsar `Implement_new_feature` (Slice 3b, ver §17.3 #12) que mostrou que Pulsar Light tem mesmos 13 passos que Heavy — só difere em prompt depth. Reverte design original que prescrevia 6 passos "redesenhar do zero" (D2:281).

1. Intent + Value + Scope
2. Terrain Recon
3. User Flow + UX (acceptance matriz + gate)
4. Domain Rules
5. Source of Truth
6. Data Model + Persistence
7. Architecture Design Options (gate: escolher abordagem)
8. Risk Controls
9. Implementation Plan (gate; SKIP se Phase 1.5 plan-architect rodou)
10. TDD Pre-Impl (RED) (gate; via `pre-tester` agent + parametrizado via `expected_inputs`)
11. Execution Minimal Diff (GREEN)
12. Testing Validation
13. Release + Observability

**Ownership (atualizado 2026-05-03):** passos 1, 2, 4, 5, 6, 8, 13 = `pipeline-controller` inline; passo 3 = `feature-vertical-slice-planner` + acceptance gate; passos 7, 9 = `feature-vertical-slice-planner`; passo 10 = `pre-tester` (com TDD scenarios pré-aprovados via `quality-gate-router` da Phase 2); passo 11 = `feature-implementer`; passo 12 = `feature-integration-validator`. Para Light: mesmos owners, mas mode flag controla verbosidade.

#### 7.2.4 ux — shape simulado-exploratório

Sem precedente Pulsar — desenho original v5.

**Heavy (6 passos):**

1. Persona Intake
2. Journey Walk
3. Friction Catalog
4. Severity & Impact
5. Improvement Proposals
6. Pa de Cal

**Light (4 passos):** cap "1 persona, 1 jornada, top-3 frictions".

1. Persona
2. Walk
3. Friction Top-3
4. Proposals

TDD não se aplica (exploratório). Output: catálogo de fricção + sugestões priorizadas, anexáveis a issue/PR.

**Ownership:** passo 1 = `pipeline-controller` (intake via AskUserQuestion); passos 2–3 = `ux-journey-walker`; passo 4 = `pipeline-controller`; passo 5 = `ux-improvement-proposer`; passo 6 = `pipeline-controller`.

#### 7.2.5 Mecânica de orquestração

`pipeline-controller` lê o shape `.md`, identifica owner por passo via tabela embutida, e faz **dispatch sequencial** — agente recebe APENAS seu passo + outputs dos passos prévios, NÃO o shape inteiro. Preserva contexto enxuto.

Composição emergente acontece quando agente decide invocar outro durante seu passo — cap 2 níveis, 5 invocações totais (Invariante #3).

### 7.3 Layer 3 — Cross-cutting infra (ai-dev-team absorvido)

Origem: D2:202–232. Pós-review: 3 absorvidos em v5.0 + 1 v5.1.

| Agente ai-dev-team | Status | Role |
|---|---|---|
| `ai-dev-security-scanner` | **v5.0 — absorvido** | Opus. Invocado por agentes Layer 1 quando evidência aponta arquivo sensível (auth/crypto/data). Único Opus na composição. |
| `ai-dev-quality-gate` | **v5.0 — executor de checks** | Sonnet. `pipeline-controller` faz dispatch quando passo de sanity/quality precisa rodar (bugfix passo 7, feature passo 11). Sem sobreposição — controller orquestra, quality-gate executa. |
| `ai-dev-context-injector` | **v5.0 — absorvido** | Sonnet. Detecção de stack, commits recentes, padrões. Invocado pelo controller no início de cada execução. |
| `ai-dev-test-generator` | **v5.0 — opcional** | Sonnet. Controller PODE invocar em fase TDD (bugfix passo 5, feature passo 9b) para gerar testes a partir de BDD scenarios aprovados. Decisão por execução. |
| `ai-dev-docs-writer` | **v5.1 — diferido** | Não cobre nenhum dos 5 critérios de DoD. |
| `ai-dev-code-reviewer` | **NÃO absorvido** | Sobreposição com `adversarial-reviewer`. |
| `ai-dev-team-coordinator` | **NÃO absorvido** | Sobreposição direta com `pipeline-controller`. |

#### 7.3.1 Composição Layer 1 → Layer 3 (mapeada a slices)

- **Exemplo 1 — bugfix → security-scanner (Slice 1):** `bugfix-fix-proposer` termina patch tocando `auth/session.js:42` → invoca `ai-dev-security-scanner`. Acceptance criteria do Slice 1: TRACE.md registra invocação emergente de security-scanner quando patch toca path em `auth/|crypto/|payment/`.
- **Exemplo 2 — audit → security-scanner (Slice 3):** `audit-finding-classifier` detecta padrão suspeito → invoca security-scanner. Acceptance criteria: findings com tag `security-validated`.
- **Exemplo 3 — feature → docs-writer (v5.1, Slice 5+):** diferido.

#### 7.3.2 Princípio de invocação cross-cutting

Layer 3 é invocada por agentes Layer 1 ou pelo `pipeline-controller`, NUNCA por outro agente Layer 3 (evita cascata). Respeita caps da Invariante #3.

### 7.4 Cherry of the Cake — composição emergente

Origem: D2:25–34.

A versão sensacional do v5 não vende — ela **acontece** quando o usuário roda. Duas mecânicas combinadas:

1. **Composição emergente entre agentes especializados.** Cap 2 níveis, 5 invocações por execução. Toda invocação registrada no TRACE.md como "composição emergente" com a evidência que motivou.
2. **Evidência cirúrgica obrigatória.** `file:line:column`, trecho de log até 200 chars, parágrafo de spec citado. Sem evidência = não conta como output. Gate automático em todos os modos.

**Exemplo concreto:** usuário roda `/pipeline-orchestrator:bugfix --investigate login broken`. Um agente domain-native enumera 3 hipóteses; outro valida cada uma com `file:line`; quando a hipótese vencedora aponta `auth/session.js:42`, um terceiro invoca emergentemente o `ai-dev-security-scanner` — sem o usuário pedir. Tudo registrado com evidência cirúrgica no TRACE.md. **Quem roda diz "não pedi pra ele chamar segurança, mas faz total sentido que tenha chamado".**

### 7.5 pipeline-controller (agente central — EXISTE)

**Status:** `agents/core/pipeline-controller.md` **EXISTE** [VERIFICADO 2026-04-30 via sync 4.1.3]. Origem do erro de baseline em D1/D2/D3: os docs originais não tinham visibilidade do conteúdo da cache 4.1.3 — quando o canonical foi sincronizado em 2026-04-30 (commits `59e0984..c5c9477`), o arquivo já estava lá. Cross-ref: §16 erro #1 (RESOLVIDO) e §17.3 #5 (resolução documentada).

**Role:** orquestrador central. Lê shape do pipeline, faz dispatch sequencial, aplica gates, escreve `gate-decisions.jsonl`, invoca `trace-generator` ao final.

**Tools declaradas no frontmatter atual** [VERIFICADO 2026-05-03 pós-instalação]: `Read, Write, Glob, Grep, Agent, AskUserQuestion, Task, Bash` (8 tools). **Modelo:** opus (não Sonnet como D1/D2 prescreviam — atualizado pós-baseline).

**DoD #7 satisfeita:** §8 Critério #7 prescreve `tools: [Agent, Task, Read, Write, Bash, Glob, Grep, AskUserQuestion]` (8 tools). Frontmatter real agora declara as 8. Gap fechado em 2026-05-03 (ver §17.3 #9 RESOLVIDO).

---

## 8. Definition of v5.0 Done

Origem: D2:11–22 (5 critérios) + D3:88–94 (Critério #6) + §15 deste doc (Critério #7 novo).

v5.0 só pode ser tagueada quando TODOS os 7 critérios estiverem PASS, verificáveis por terceiro:

1. **5 commands em `/help`** — `/pipeline-orchestrator:{pipeline,bugfix,feature,audit,ux}` listados, cada um com descrição de uma linha distinta. Verificação: `claude /help | grep pipeline-orchestrator` retorna 5 linhas.
2. **TRACE.md no repo do usuário por default** — sem opt-in. Aparece em `git status` após qualquer pipeline completar. Verificação: rodar `/pipeline-orchestrator:bugfix [task-fixture]` em repo limpo deixa `.pipeline-orchestrator/runs/*/TRACE.md` em `git status`.
3. **TRACE.md anexável a PR sem edição manual** — `schema_version=1` presente, todos os campos populados. Verificação: validador standalone contra TRACE gerado em fixture.
4. **Comando legacy `/pipeline-orchestrator:pipeline` produz mesmo verdict para 5 cenários canônicos do v4.1.0** — compat suite verde em CI. Verificação: `npm run test:compat`.
5. **Compromisso firmado para v5.1 com YAML interpreter** — issue tracker tem milestone "v5.1 — Pipeline Declarativo (Slice 5)" com data alvo ≤ Q+2. Verificação: link da milestone no CHANGELOG do v5.0.
6. **Plan-mode-enforcer (NOVO, de D3:90–94):** Tasks classificadas como MEDIA ou COMPLEXA acionam EnterPlanMode automaticamente antes de qualquer Edit/Write. Bypass exige flag `--no-plan` explícita + entrada no TRACE.md justificando. Trigger: classe ∈ {MEDIA, COMPLEXA}. Reusa `references/complexity-matrix.md` como SSOT. Verificação: rodar `/pipeline-orchestrator:bugfix [task com domains_touched=2]` em fixture; log mostra `EnterPlanMode` invocado antes da fase de implementation.
7. **pipeline-controller declara tools de spawn explicitamente (NOVO, ver §15):** frontmatter de `agents/core/pipeline-controller.md` declara `tools: [Agent, Task, Read, Write, Bash, Glob, Grep, AskUserQuestion]`. Slice 0 valida com smoke test que spawn aninhado funciona end-to-end (controller spawna `task-orchestrator` que spawna `information-gate`).

Sem todos os 7, v5.0 é "v4.5 com TRACE.md", não a versão sensacional. Marketing e release notes refletem isso ou cancelam o release.

### 8.1 Resolução de contradição — Critério #2 (TRACE.md default)

D1:282 declarava "repo do usuário por default, com config permitindo override pra `~/.claude/data/`" mas D1 também flertava com privado por default. **D2:508 fechou: REPO por default, opt-out para privado** com `pipeline-orchestrator.persist_runs: 'private'` em settings. Iter 2 do review reverteu o default privado da iter 1 para honrar a tese "anexável a PR" sem opt-in.

Consolidado adota **REPO por default**.

---

## 9. Invariantes Compartilhados

Origem: D2:48–60 (5) + D3:98–102 (#6) + §15 deste doc (atualização do #6).

Apesar de cada pipeline ter shape próprio (esse é o valor), 6 coisas valem cross-pipeline:

1. **Linguagem ubíqua por bounded context.** Cada pipeline tem glossário curto de 10–15 termos. Documentado em `references/glossary/{pipeline}.md`. Criação faz parte do DoD dos slices que introduzem cada pipeline (Slice 1 cria `bugfix.md`; Slice 3 cria os outros 3).
2. **Evidência cirúrgica obrigatória.** Toda asserção vem com `file:line:column`, trecho de log ≤200 chars, ou parágrafo de spec citado. Sem evidência = não conta como output. Gate automático.
3. **Composição emergente permitida e logada.** Cap máx 2 níveis de aninhamento, máx 5 invocações emergentes por execução. Cada invocação registrada no TRACE.md com motivo.
4. **Outputs são artefatos versionáveis, não prosa.** Cada pipeline produz arquivos estruturados (Markdown com seções fixas + YAML frontmatter). Usuário commita, abre PR, compara entre execuções.
5. **AIDD em todos os 4 pipelines.** Cada agente domain-native tem spec executável (prompt + inputs + outputs + critérios PASS/FAIL) consumível por outro Claude. Humano aprova gates.
6. **Dispatch paralelo quando independente, serial quando dependente (NOVO, de D3:100–102, atualizado por §15).** Agentes cujos inputs não dependem de outputs entre si DEVEM ser dispatchados via 1 chamada `Agent` múltipla (paralelo). Agentes com dependência ficam seriais. Decisão registrada no TRACE.md como `dispatch_mode: parallel|serial` por fase. Cap 5 dispatches paralelos simultâneos para evitar context explosion no main LLM. **ATUALIZAÇÃO §15:** validar antes de cada execução que o controller herda Agent/Task tools — sem isso, dispatch falha silenciosamente.

---

## 10. Light/Heavy & COMPLEXITY_GATE

Origem: D2:236–280.

### 10.1 Caps por pipeline (Light)

| Pipeline | Cap Light | Verificação | Quando estoura → COMPLEXITY_GATE oferece |
|---|---|---|---|
| **bugfix-light** | Max 2 arquivos modificados, 50 linhas total, 1 hipótese ranqueada | Hook PreToolUse conta tool_calls Edit/Write; passo 7 audita `git diff --stat` | Migrar pra `bugfix-heavy`. Workflow: (1) diff atual descartado via `git checkout -- .`; (2) RED tests do passo 3b preservados (mesmo formato); (3) restart de bugfix-heavy passo 1 carregando hipótese ranqueada como contexto; (4) heavy passo 5 reusa tests RED. |
| **feature-light** | 1 user story, max 5 acceptance criteria, 1 vertical slice | `pipeline-controller` (checklist procedimental) conta criteria derivadas do Intent (passo 1) e valida no passo 6. Em v5.0, validação é checklist do controller (`feature-acceptance-criteria-author` é v5.1). | Migrar pra `feature-heavy` (slice plan completo) |
| **audit-light** | 1 área (ex: só `auth`, só `data layer`), 1 nível de profundidade | Slice scope declarado no intake; `audit-intake-mapper` valida | Migrar pra `audit-heavy` (cobertura completa 9 áreas) |
| **ux-light** | 1 persona, 1 jornada, top-3 frictions | Definição no intake | Migrar pra `ux-heavy` (multi-persona, multi-jornada) |

### 10.2 Heavy = sem caps, com gates de aprovação

Heavy é o shape completo descrito na Layer 2 (11/9/13/6 passos). Sem caps de tamanho, mas com gates de aprovação humana em pontos críticos (ex: bugfix-heavy passo 4 "Controlled Change Proposal").

### 10.3 COMPLEXITY_GATE — workflow

1. Hook PreToolUse ou pós-step audit detecta cap estourado.
2. `pipeline-controller` registra `COMPLEXITY_GATE` no `sentinel-state.json` com dimensão estourada.
3. Pipeline pausa, invoca `AskUserQuestion`:
   - "Migrar pra `{pipeline}-heavy` (Recomendado)" — descarta diff atual, reentra com Heavy.
   - "Continuar Light registrando exceção" — segue com warning no TRACE.md (`complexity_exception: true`).
   - "Abortar" — reverte tudo.
4. Decisão logada em `gate-decisions.jsonl`.

Hardness: **SOFT** (usuário pode override Light com warning).

`sentinel-state.json` schema: `complexity_cap_status: { exceeded: bool, dimension: "files|lines|hypotheses", value: int, cap: int }`.

### 10.4 Escolha de modo no entry point

- `/pipeline-orchestrator:bugfix [task]` — controller infere modo via task-orchestrator + apresenta proposta no Phase 1.
- `/pipeline-orchestrator:bugfix --light [task]` — força Light (com risco de COMPLEXITY_GATE).
- `/pipeline-orchestrator:bugfix --heavy [task]` — força Heavy.

Modos `--simples`, `--media`, `--complexa` do v4 permanecem suportados em `/pipeline` legacy por compat (DoD #4); `--light` / `--heavy` recomendados pra novos commands.

### 10.5 Não-aplicabilidade de Light

- **bugfix em domínio sensível** (auth/crypto/data-model/payment): Light é BLOQUEADO. Heavy obrigatório.
- **audit de compliance** (GDPR/HIPAA/SOC2): Light BLOQUEADO. Cobertura completa exigida.
- **HOTFIX**: usa Light por default (escopo cirúrgico). Se cap estourar, COMPLEXITY_GATE oferece SOMENTE 2 opções: (b) continuar com warning elevado registrando `hotfix_complexity_exception=true`, ou (c) abortar. Opção (a) "migrar pra Heavy" é suprimida — HOTFIX por definição não pode rodar workflow completo.

---

## 11. Gates Registry

### 11.1 15 gates herdados do v4 (de D1:86)

`SSOT_CONFLICT`, `ADVERSARIAL_GATE_MANDATORY`, `INFO_GATE_BLOCKED`, `TDD_APPROVAL`, `PLAN_REJECTED`, `MICRO_GATE_GAP`, `CHECKPOINT_FAIL`, `ADVERSARIAL_BLOCK`, `FINAL_ADVERSARIAL_REWORK`, `STOP_RULE`, `FIX_LOOP_EXHAUSTED`, `STALE_CONTEXT`, `ADVERSARIAL_GATE`, `FINAL_ADVERSARIAL_GATE`, `CLOSEOUT_CONFIRM`.

### 11.2 Novo: COMPLEXITY_GATE (v5.0)

Adicionado entre `STOP_RULE` e `STALE_CONTEXT`. Spec em §10.3.

### 11.3 SSOT formal — `references/gates/registry.md`

**Status:** [A SER DEFINIDO] no Slice 0.5. Arquivo não existe atualmente [VERIFICADO]. Slice 0.5 cria com:

- Lista canônica dos 16 gates (15 herdados + COMPLEXITY_GATE).
- Hardness Taxonomy: cada gate marcado como `MANDATORY | HARD | CIRCUIT_BREAKER | SOFT`.
- Trigger, recovery, sentinel-state schema por gate.
- Allow-list de gate names (security model — ver §14).

### 11.4 Hardness Taxonomy (formalizar no Slice 0.5)

| Hardness | Significado | Override possível |
|---|---|---|
| MANDATORY | Bloqueia execução se falha; sem override | NÃO |
| HARD | Bloqueia, mas usuário com flag explícita pode override | Flag específica |
| CIRCUIT_BREAKER | Para tudo, exige diagnóstico humano antes de retomar | Manual após análise |
| SOFT | Warning + AskUserQuestion oferece continuar/abortar | AskUserQuestion |

COMPLEXITY_GATE = SOFT. Adversarial gates = MANDATORY ou HARD conforme contexto.

---

## 12. Plano de Execução em Release Slices

### 12.1 Por que slices verticais (e não C-1..C-6 horizontal)

Origem: D2:284–293.

C-1..C-6 (D1) é horizontal: nenhuma camada sozinha entrega valor, integração só acontece no fim. Risco: 11–16 semanas sem release intermediário, com C-2 (interpreter, 4–6 sem) como ponto único de falha.

Slices verticais invertem: cada slice atravessa todas as camadas necessárias para entregar uma capacidade observável pelo usuário, end-to-end, e é liberável independentemente.

**Range honesto pós-Slice-0.5:** v5.0 (Slices 0–4 + 0.5) = **4.5–7.5 semanas solo, sequencial.** v5.1 (Slice 5) = +6–8 semanas, ≤ Q+2.

### 12.2 Sequência

```
Slice 0     Spike formato + agent-spec-template            🟢 ENTREGUE (sync 4.1.3)
Slice 0.5   Context & Policies                              🟢 ENTREGUE (v4.2.0)
Slice 1     /bugfix command + thin entry-point pattern      🟢 ENTREGUE (v4.2.0 + v4.2.1 + v4.3.0 + v4.3.1)
Slice 1.5   Pulsar bugfix workflow import (§21)             🟢 ENTREGUE (v4.4.0)
Slice 2     TRACE.md (Run Record)                           🔴 PENDENTE (1 sem)
Slice 3a    Pulsar audit workflow import (§22)              🟢 ENTREGUE (v4.5.0)
Slice 3b    Pulsar feature workflow import (§23)            🟢 ENTREGUE (v4.7.0, polido vs v4.6.1)
Slice 3     /feature, /userstory, /ux + ARCH-2 fix          🔴 PENDENTE (0.3-0.7 sem)
Slice 4     Compat regression suite + CI test runner        🟡 PARCIAL (1.5-2 sem)
v5.0.0 (release)
Slice 5     YAML interpreter (COMMITTED v5.1, ≤ Q+2)        🔴 PENDENTE (3-5 sem)
v5.1.0
```

### Status pós-execução 2026-04-30

| Slice | Status | Versão | Observação |
|---|---|---|---|
| 0 | 🟢 | sync 4.1.3 | pipeline-controller, sentinel, type-specific, gates.md já existiam na cache 4.1.3 — sincronizados pro canonical |
| 0.5 | 🟢 | v4.2.0 | CLAUDE.md raiz, AGENTS.md raiz, COMPLEXITY_GATE no registry |
| 1 † | 🟢 | v4.2.0 + v4.2.1 | `/bugfix` thin wrapper, `PRE_CLASSIFIED_TYPE` contract, hook patches; SEC-1+SEC-2 fechados em adversarial review. **† TRACE-defer:** ACs sobre TRACE.md diferidas para Slice 2 (ver §12.5.3 e §17.3 #8) |
| 2 | 🔴 | — | trace-generator + trace-schema/v1.md |
| 3a | 🟢 | v4.5.0 | `/audit` thin wrapper + `audit-light` + `audit-heavy` skills (9 steps cada), §22; reusa `audit-{intake,domain-analyzer,compliance-checker,risk-matrix-generator}` agents |
| 3b | 🟢 | v4.7.0 → v4.8.0 | `/feature-light` + `/feature-heavy` 2 skills separadas espelhando Pulsar `Ligth/` + `Heavy/` 1:1 (igual padrão Slice 1.5/3a). §23. v4.6.0 inicial unificou em single skill com mode flag — **REVERTIDO** em v4.6.1 ([CORREÇÃO 2026-05-03]: fonte canônica tem 2 pastas, port deve ter 2 skills); **POLIDO** em v4.7.0 ([POLISH 2026-05-03]: frontmatter contract completo nos 26 step files + SKILL.md manifests completos + thin entry-point `/pipeline-orchestrator:feature` + tests reais — 11 audit findings fechados). **v4.8.0 (2026-05-03):** SKILL.md frontmatter agora ENFORCED via hooks (sentinel_checkpoints, agent_type per step, gates_at) — antes era advisory. Resolve §17.4 #8. Ver §17.3 #13. Cada step file = cópia literal do prompt Pulsar correspondente + frontmatter contract completo (execution_mode + agent_type + expected_*). |
| Hook Enforcement | 🟢 | v4.8.0 | Sub-slice independente: skill-frontmatter-parser.cjs + 3 hooks estendidos para enforce SKILL.md contracts. Roll-out warn-then-deny (cutover 2026-05-17). Resolve §17.4 #8. Ver §17.3 #13. |
| 3 | 🔴 | — | 3 commands restantes (feature/userstory/ux) + ARCH-2 (trust boundary do prefix — ver §17.3 #7) |
| 4 | 🟡 (90% estrutural) | — | runner.cjs ✅ + workflow YAML ✅ + 5/5 fixtures estruturais (template) + 0/5 baselines reais + performance N/A + protocolo de captura ✅. 2/4 critérios fechados; critério 3 100% estrutural mas 0% real. Falta: capturar 5 baselines via dogfooding + medir wall-clock real. Ver §12.8.3 + §17.3 #10/#11. |
| 5 | 🔴 | — | v5.1, defer |

**Resolução de contradição — ordem Slice 1 vs Slice 2:** D2:799–826 reordenou goal-backward — TRACE.md primeiro porque materializa "caixa de vidro" desde rc.1 e baseline para Slice 4. **Consolidado original adotou ordem D2:** Slice 0 → 0.5 → **2** → 1 → 3 → 4 → 5. (D3:24–30 lista 0 → 0.5 → 1 → 2 → 3 → 4 mas é inventário, não ordem de execução.)

**Ordem REAL entregue (atualizado 2026-05-03 governance audit):** Slice 0 → 0.5 → **1 (TRACE diferido)** → 1.5 → 3a → ... A ordem real divergiu do plano: Slice 1 foi shippado em v4.2.0 antes de Slice 2 existir. TRACE.md como AC do Slice 1 foi diferido para Slice 2 (ver §12.5.3 nota TRACE-defer). Esta inversão está documentada como lição em §17.3 #8 — não foi decisão deliberada, foi optimization de UX (entregar `/bugfix` cedo) que custou consistência prerequisita. Slice 2, quando entregue, retroativamente popula TRACE.md a partir do `gate-decisions.jsonl` já existente.

**Nota sobre Slice 3a vs Slice 3:** Slice 3a (audit workflow import — ver §22) é **ortogonal e independente** de Slice 3 (commands restantes feature/userstory/ux + ARCH-2 fix). Não há dependência entre eles; podem shippar em qualquer ordem ou paralelamente. Slice 3a foi feito antes de Slice 3 porque o playbook Pulsar de audit estava pronto para porte; Slice 3 espera ARCH-2 trust-boundary decision (§17.4 #7).

**Nota sobre numeração de release candidates:** numeração `rc` segue ordem de ship (Slice 2 = `rc.1`; Slice 1 = `rc.2`; Slice 3 = `rc.3`; etc.), independente do número do Slice. Isso garante que `rc.N+1` sempre suceda `rc.N` no tempo, mesmo quando a sequência de execução não casa com o número ordinal do slice.

### 12.3 Slice 0 — Reality Check (Spike, não-shippeável)

**Por que existe:** auditoria identificou bloqueador CRITICAL — design assumia 1100 linhas em `commands/pipeline.md` (real: 957), 7 hooks (real: 2), 12 .md (real: 10), 38 agentes (real: 19). Antes de qualquer slice de produção, verificar premissas sobre o harness do Claude Code.

**Duração:** 2–3 dias. Output decisional, não código de produção.

#### 12.3.1 BDD — Cenários de validação

```gherkin
Feature: Reality check do baseline e do harness Claude Code

Scenario: Inventário verificado do baseline atual
  Given o repositório canonical em D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator
  When eu executo wc -l em commands/pipeline.md, agents/**/*.md
       e find references/pipelines -name "*.md"
       e find hooks -name "*.cjs"
  Then INVENTORY.md lista a contagem real
       e o esforço estimado de cada slice é recalculado contra baseline real

Scenario: Subagent_type dinâmico funciona via Agent tool
  Given um agent slice0-probe-controller em .claude/agents/
  When o controller faz Agent(subagent_type=$dynamicName) onde $dynamicName vem de YAML em runtime
  Then spawn completa para nomes válidos
   And falha previsivelmente para nomes não registrados
   And resultado escrito em SPIKE-DYNAMIC-DISPATCH.md

Scenario: Latência aceitável de hook lendo YAML
  Given um hook PreToolUse:Agent que lê e parseia references/pipelines/bugfix.yaml
  When invocado 50 vezes consecutivas
  Then latência mediana < 200ms, p99 < 1000ms
   And SPIKE-HOOK-LATENCY.md documenta cache strategy

Scenario: Claude Code roda headless em CI
  Given GitHub Action invocando claude --headless
  When pipeline tenta /pipeline-orchestrator:pipeline test-task sem TTY
  Then completa e retorna output capturável (PASS — define snapshot strategy)
   Or falha previsível (FAIL — design alternativo via mocks em SPIKE-CI-HARNESS.md)

Scenario: Spawn aninhado funciona end-to-end (NOVO §15)
  Given pipeline-controller agent criado com tools [Agent, Task, ...]
  When controller spawna task-orchestrator que spawna information-gate
  Then cascata completa sem InputValidationError
   And SPIKE-NESTED-SPAWN.md documenta resultado
```

#### 12.3.2 Definition of Done

- `INVENTORY.md` com contagem real de linhas/hooks/pipelines/agentes.
- `SPIKE-DYNAMIC-DISPATCH.md` com PASS/FAIL e evidência reproduzível.
- `SPIKE-HOOK-LATENCY.md` com benchmark e cache strategy decidida.
- `SPIKE-CI-HARNESS.md` com decisão sobre como testar plugin em CI.
- `SPIKE-NESTED-SPAWN.md` (NOVO §15) — valida que `pipeline-controller` spawna subagentes corretamente.
- `references/agent-spec-template.md` criado.
- **`agents/core/pipeline-controller.md` criado** (pré-requisito P0 — ver §15).
- Estimativas de Slices 1–5 recalculadas.

#### 12.3.3 Refinamentos LOW pendentes (D2:358–370)

Resolver dentro da janela do Spike:

- **R-1.** Consolidar duplicação de Metodologias (header vs seção dedicada). Verificação: `grep -c "TDD" doc.md` retorna 1 ocorrência inicial autoritativa.
- **R-2.** Reduzir repetição de "dogfooding" (manter ocorrência expandida em "Como AIDD funciona"; condensar as outras).
- **R-3.** Definir "1 nível de profundidade" do audit-light em `references/audit-depth-levels.md`. Exemplo: nível-1 (cobertura básica), nível-2 (configuração detalhada), nível-3 (edge cases + threat model).
- **R-4.** Especificar contrato `task-orchestrator` v4 → modos Light/Heavy v5: (a) adapter heurístico (SIMPLES→Light, COMPLEXA→Heavy, MEDIA→inferência via análise de affected_files) ou (b) reescrever task-orchestrator. Documentar em `INVENTORY.md`.
- **R-5.** Documentar ownership de validação de acceptance criteria em feature-light v5.0 em `references/feature-light-criteria-checklist.md`.

#### 12.3.4 Decision Gate

Se Slice 0 revelar que subagent_type dinâmico **não** é suportado, Slice 5 muda fundamentalmente — passa a "cada type tem seu controller agent estático". Decisão tomada AQUI antes de escrever specs do Slice 5.

### 12.4 Slice 0.5 — Context & Policies

Origem: D3 (todo). Inserido entre Slice 0 e Slice 1.

**Duração:** ~22h (~3 dias dono solo). Cada entregável vira commit isolado.

#### 12.4.1 Camada A — Contexto Claude Code (P0)

**A1. `CLAUDE.md` raiz do projeto** (≤200 linhas):

- Identidade: nome, propósito (caixa de vidro), persona (arquiteto B2B senior).
- SSOT do design: aponta para `designs/pipeline-orchestrator-v5-consolidated.md` (ESTE doc).
- Política de edits: "todas as alterações nascem em `D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator`; cache `C:\.claude\plugins\cache` é runtime, NÃO mexer".
- Versão canônica: SSOT em `.claude-plugin/plugin.json`.
- Invariantes resumidos com link para `references/glossary/` e §9 deste doc.
- Política operacional: "edits via Agent tool durante execução de pipeline; nunca inline".
- Ponteiro para `MIGRATION-v4-to-v5.md` quando existir.

**Verificação:** abrir o repo em agent Claude novo, perguntar "qual é o source-of-truth do design v5?". Resposta deve apontar para este consolidated.

**A2. `AGENTS.md` raiz com roster + namespacing:**

- Tabela única: `name | namespace fully-qualified | layer (1/2/3) | model | tools | pipeline owner | invocável emergentemente por`.
- Seção "Bounded Contexts" com glossário curto cada.
- Seção "Cross-Cutting" listando Layer 3.
- Convenção de nomenclatura (`<pipeline>-<role>`).
- Ponteiro para `references/agent-spec-template.md`.

**Versão inicial:** cobre os 19 agentes existentes [VERIFICADO]. Slice 1 e Slice 3 atualizam.

**Verificação:** `grep -c "^|" AGENTS.md` (excluindo headers) iguala contagem real.

**A3. `.claude/rules/` com globs path-specific:**

| Arquivo | Globs | Resumo |
|---|---|---|
| `10-bounded-context.md` | `agents/**`, `skills/**` | Linguagem ubíqua por pipeline; tradução explícita logada no TRACE.md ao cruzar bounded contexts |
| `20-evidencia-cirurgica.md` | `agents/**` | Toda asserção precisa de `file:line:column` ou trecho ≤200 chars |
| `30-composicao-emergente-caps.md` | `agents/**` | Cap 2 níveis, 5 invocações; cada invocação registrada no TRACE.md |
| `40-adversarial-zero-context.md` | `agents/executor/type-specific/adversarial-*.md` | Adversarial agents proibidos de ler `.pipeline-orchestrator/runs/<id>/artifacts/implementer-*.{json,md}` durante o mesmo run |
| `50-non-invention.md` | `**/*.md` | Antes de criar agent/skill/command novo, grepear se algo equivalente existe; rejeição se overlap >80% |

**Verificação:** abrir um arquivo em `agents/quality/`, confirmar que rules 10/20/30 são auto-carregadas.

#### 12.4.2 Camada B — Definition of Done expandida (P1)

**B1. Critério #6 — plan-mode-enforcer:** ver §8 deste doc.

**B2. Invariante #6 — Paralelização de dispatch:** ver §9 deste doc.

**B3. Skill `pipeline` description — exclusões explícitas.** Mudança em `skills/pipeline/SKILL.md:3`:

```yaml
description: |
  Use when task type is genuinely ambiguous and needs auto-classification.
  This skill activates ONLY via the /pipeline-orchestrator:pipeline slash command.
  Do NOT use for: single-file edits, doc-only changes, trivial typos, or when
  task fits clearly in /bugfix, /feature, /audit, /ux — those have specific commands.
```

**B4. Skill `non-invention-guard`:** novo arquivo `skills/non-invention-guard/SKILL.md`. Description: "Use ANTES de adicionar novo agent, skill ou command. Bloqueia adição se grep encontra overlap funcional ≥80%. Força documentação da busca." Invocado pelo `pipeline-controller` antes de aprovar registro de novo agent na allow-list.

#### 12.4.3 Camada C — Enforcement mecânico (P0/P1)

**C1. Estender `dispatch-guard.cjs` com adversarial zero-context.** Pseudocódigo:

```js
if (toolName === 'Read' && agentName?.match(/^adversarial-/)) {
  const path = toolArgs.file_path;
  const runId = currentRunIdFromSentinelState();
  if (path.includes(`.pipeline-orchestrator/runs/${runId}/artifacts/implementer-`)) {
    return {
      decision: 'block',
      reason: 'Adversarial agent cannot read implementer artifacts of same run (rule 40)',
    };
  }
}
```

Tests: `__tests__/dispatch-guard-adversarial.test.cjs` cobrindo (a) bloqueio quando match, (b) permissão para outros agents, (c) permissão para Read em artifacts de runs diferentes.

**Nota crítica de baseline:** `dispatch-guard.cjs` **NÃO existe** [VERIFICADO]. Slice 0.5 deve **criá-lo** ou Slice 0 documentar onde lógica equivalente vive — ver §16 erro #2.

**C2. Estender `force-pipeline-agents.cjs` com plan-mode trigger.** Quando `task-orchestrator` classifica MEDIA+ e fase atual é `implementation`, hook intercepta primeiro Edit/Write se `EnterPlanMode` não foi chamado. Bypass via env var `PIPELINE_NO_PLAN=1`.

Tests: cobrir 3 caminhos (auto-trigger, bypass com flag, sem effect em SIMPLES).

#### 12.4.4 Camada D — Cosméticos & Dívida (P2)

**D1. Cores fora da paleta.** 5 agents com `color: orange` em `agents/executor/type-specific/`:

- `audit-compliance-checker.md:5`
- `audit-domain-analyzer.md:5`
- `bugfix-diagnostic-agent.md:5`
- `bugfix-root-cause-analyzer.md:5`
- `ux-accessibility-auditor.md:5`

Trocar para `yellow`.

**Nota crítica de baseline:** subdiretório `agents/executor/type-specific/` **NÃO existe** [VERIFICADO]. Esses 5 agents são fantasmas — ver §16 erro #8. Slice 0 deve auditar e atualizar D3 lista.

**D2. Padronização `tools:` vs `allowed-tools:`.**

- `agents/core/sentinel.md:6` usa `allowed-tools:` — **MAS `agents/core/sentinel.md` NÃO existe** [VERIFICADO]. Ver §16 erro #7.
- `agents/core/pipeline-controller.md:6` usa `tools:` — **MAS pipeline-controller.md TAMBÉM não existe** [VERIFICADO]. Ver §15.

Padronizar para `tools:` em todos os agents que efetivamente existirem após Slice 0 / 0.5.

**D3. Versões divergentes.**

- `.claude-plugin/plugin.json` declara **3.0.2** [VERIFICADO] (D3:181 dizia 4.1.3 — desatualizado).
- `README.md` badge declara **3.1.0** [VERIFICADO] (D3:182 dizia 4.1.2).
- `commands/pipeline.md` cabeçalho declara `v3.8` (D3:183).
- `skills/pipeline/SKILL.md` declara "v4 thin skill" (D3:184).

**Política:** `plugin.json` é SSOT da versão. Slice 0.5 NÃO bumpa para 5.0.0 (release do Slice 4 faz isso); apenas alinha 3.0.2/3.1.0/v3.8/v4 para um número coerente da v3 atual.

**D4. `autoDiscover: true` em plugin.json.** Campo não-padrão. Confirmar com dono se algum loader proprietário consome; se não, remover. (Open Question residual — ver §17.)

**D5. Arquivar `SKILL.v3-reference.md`.** Mover `skills/pipeline/SKILL.v3-reference.md` → `docs/legacy/SKILL.v3-reference.md`.

**D6. `.githubcopilot/knowledge-base/` órfãos.** `00-index.md` referencia 14 docs (01-14, 30); só 00 e 30 existem. Recomendação: podar `00-index.md` para refletir realidade. (Open Question residual — ver §17.)

#### 12.4.5 Sequência de execução do Slice 0.5

| # | Entregável | Risco | Tempo | Depende |
|---|---|---|---|---|
| 1 | A1 CLAUDE.md raiz | nulo | 2h | — |
| 2 | A2 AGENTS.md raiz | nulo | 3h | inventário Slice 0 |
| 3 | A3 5 rules em .claude/rules/ | nulo | 4h | A1, A2 |
| 4 | D1+D2+D5 cosméticos consolidados | nulo | 1h | Slice 0 (saber o que existe) |
| 5 | D3+D4 versões + autoDiscover | nulo | 1h | decisão D4 |
| 6 | D6 podar knowledge-base index | nulo | 30min | decisão D6 |
| 7 | B3 skill pipeline description | nulo | 30min | — |
| 8 | B4 skill non-invention-guard | baixo | 2h | — |
| 9 | B1+B2 atualizar DoD + Invariantes (este doc) | nulo | 1h | — |
| 10 | C1 dispatch-guard adversarial + tests | médio | 4h | A3 (rule 40), criação do hook se ausente |
| 11 | C2 force-pipeline-agents plan-mode + tests | médio | 4h | B1 |

#### 12.4.6 Verificação do Slice 0.5

1. Contexto carregado: `/cc-toolkit:cc-audit` em repo aberto. Lacunas P0 fechadas.
2. Rules path-specific: editar arquivo em `agents/quality/`, confirmar rules 10/20/30 entram via globs.
3. Hook adversarial: spawnar `adversarial-security-scanner`, tentar Read em `.pipeline-orchestrator/runs/test-fixture/artifacts/implementer-1.json`. Bloqueio com mensagem rule 40.
4. Hook plan-mode: rodar `/pipeline-orchestrator:bugfix [task MEDIA]` sem `--no-plan`; primeiro Edit precedido de EnterPlanMode automático.
5. Cosméticos: `plugin-dev:plugin-validator` sem warnings.

### 12.5 Slice 1 — `/pipeline-orchestrator:bugfix` end-to-end

**Valor:** usuário digita `/pipeline-orchestrator:bugfix [task]` e pipeline correto roda diretamente. TRACE básico gerado. Comando legacy `/pipeline` continua idêntico.

**Duração:** ~1 sem solo. Cobre Problemas #1 e #4 parcialmente.

**Prerequisite slices:** [0, 0.5, 2] (ordem D2 — TRACE.md já existe quando Slice 1 emite type_source).

#### 12.5.1 BDD

```gherkin
Feature: Comando explícito /pipeline-orchestrator:bugfix

Scenario: Usuário invoca bugfix command e pipeline correto roda
  Given plugin pipeline-orchestrator v5.0-rc.1 instalado
   And repositório com bug conhecido em src/auth.js
  When usuário digita "/pipeline-orchestrator:bugfix login está quebrado"
  Then controller pula classificação
   And carrega references/pipelines/bugfix-light.md (ou heavy)
   And executa diagnostic → root-cause → implementation → verification
   And emite PIPELINE COMPLETE com type="bugfix" e type_source="manual"

Scenario: Compat — comando legado idêntico
  Given mesmo repositório
  When usuário digita "/pipeline-orchestrator:pipeline login está quebrado"
  Then classificador roda (task-orchestrator)
   And classifica como type=bugfix
   And restante idêntica ao v4.1.0

Scenario: Modos ortogonais
  Given plugin v5.0-rc.1
  When usuário digita "/pipeline-orchestrator:bugfix --hotfix [task]"
  Then pipeline em modo HOTFIX
   And HOTFIX registrado no TRACE.md como mode="hotfix"
   And type permanece "bugfix"

Scenario: Discovery — /help mostra os 5 commands
  Given plugin instalado
  When usuário digita /help
  Then lista inclui: pipeline, bugfix, e outros nos slices 3
```

#### 12.5.2 TDD — Testes RED primeiro

```
tests/slice1/
├── unit/
│   ├── command-bugfix.test.js
│   │   - "carrega bugfix-light.md quando complexity=SIMPLES" → FAIL
│   │   - "carrega bugfix-heavy.md quando complexity=COMPLEXA" → FAIL
│   │   - "skipa task-orchestrator (classification)" → FAIL
│   │   - "respeita --hotfix sem alterar type" → FAIL
│   └── controller-type-injection.test.js
│       - "passa type='bugfix' como parâmetro fixo" → FAIL
└── integration/
    └── e2e-bugfix-command.test.js
        - "command em fixture-repo gera artefatos esperados" → FAIL
        - "comando legado /pipeline em mesmo input gera mesmo verdict" → FAIL
```

#### 12.5.3 AIDD — Spec executável

```yaml
slice_id: 1
title: "Command /pipeline-orchestrator:bugfix end-to-end"
prerequisite_slices: [0, 0.5]   # ATUALIZADO 2026-05-03: Slice 2 removido por TRACE-defer (ver nota abaixo + §17.3 #8)
prerequisite_decisions:
  - "Slice 0 confirmou: hooks PreToolUse podem inspecionar argumentos do Agent call"
  - "Slice 0 inventário confirmou onde lógica de classificação reside"
  - "Slice 2 estabeleceu schema do TRACE.md e quem escreve o quê"  # PARCIALMENTE ATENDIDA — ver TRACE-defer
  - "Slice 0 criou agents/core/pipeline-controller.md com tools corretas (DoD #7)"

# TRACE-defer (2026-05-03 governance audit):
# Slice 1 foi entregue em v4.2.0 antes de Slice 2 (TRACE.md) existir. As ACs originais do Slice 1
# referenciavam emissão de type_source no TRACE.md ("emite PIPELINE COMPLETE com type_source=manual"),
# mas o TRACE.md não foi gerado — o pipeline emite type_source no log de gate-decisions.jsonl em vez disso.
# Implicação: a parte "TRACE.md universal" das ACs do Slice 1 está oficialmente DIFERIDA para Slice 2,
# que deverá retroativamente popular TRACE.md a partir do gate-decisions.jsonl quando for entregue.
# Isso não invalida v4.2.0+ — só explicita o débito.

files_to_create:
  - path: "commands/bugfix.md"
    purpose: "Slash command entry point. Frontmatter define description; body é prompt curto que invoca pipeline-controller passando pipeline_type='bugfix'."
    constraints:
      - "Não duplica lógica do controller — só passa o tipo fixo"
      - "Aceita mesmos modos do /pipeline (--hotfix, --plan, --grill, --simples, --media, --complexa)"
      - "type_source emitido segue enum fixo: 'manual via /pipeline-orchestrator:{bugfix|feature|audit|ux}' | 'auto via /pipeline'. Setado AQUI, NUNCA mutado por slices posteriores."
      - "pipeline-controller é o ÚNICO escritor de gate-decisions.jsonl. Slice 2 (trace-generator) lê este arquivo."

  - path: "skills/bugfix/SKILL.md"
    purpose: "Skill auxiliar para auto-discovery. Thin — delega ao controller."

files_to_modify:
  - path: "agents/core/pipeline-controller.md"
    change: "Aceitar parâmetro pipeline_type opcional. Se presente, skipa task-orchestrator."
    backwards_compat: "Quando ausente, comportamento idêntico ao v4.1.0"

  - path: ".claude/hooks/sentinel-hook.cjs"
    change: "Reconhecer expected_next='information-gate' quando pipeline_type pré-definido"
    note: "sentinel-hook.cjs é HOOK TEÓRICO — não existe atualmente [VERIFICADO]. Slice 0 deve criar ou Slice 0.5 documentar substituto."

verification:
  red_phase: "todos tests/slice1/ falham"
  green_phase: "todos passam"
  refactor_phase: "code-simplifier sem CRITICAL findings"
  golden_snapshot: "Slice 4 captura output como baseline"
```

#### 12.5.4 Definition of Done

- `commands/bugfix.md` existe e é descoberto via `/help`.
- `skills/bugfix/SKILL.md` existe e auto-trigga em descrições de bug.
- `pipeline-controller` aceita `pipeline_type` sem quebrar caminho legado.
- Todos os testes do Slice 1 GREEN.
- 1 PR atomico, mergeável independente.
- Tag `v5.0.0-rc.2` (ou continua acumulando).

### 12.6 Slice 2 — TRACE.md universal

**Valor:** toda execução gera Run Record. **Default = repo do usuário** (`.pipeline-orchestrator/runs/`), opt-out para privado em `~/.claude/data/` via setting.

**Duração:** ~1 sem solo. Cobre Problema #3 e parte de #2.

**Prerequisite slices:** [0, 0.5].

**Nota TRACE-defer (2026-05-03 governance audit):** Slice 2 também tem responsabilidade retroativa — fechar as ACs do Slice 1 que mencionavam emissão de `type_source` no TRACE.md. Em v4.2.0+ o pipeline emite no `gate-decisions.jsonl`; quando trace-generator existir, deve ler esse log e popular TRACE.md correspondente para runs históricos (best-effort) ou pelo menos para runs novos. Ver §12.5.3 nota TRACE-defer e §17.3 #8 para contexto completo.

#### 12.6.1 BDD

```gherkin
Feature: Run Record persistido por execução

Scenario: Run Record versionado por default
  Given plugin v5.0-rc.2 sem customização
  When pipeline (pipeline ou bugfix) completa
  Then arquivo .pipeline-orchestrator/runs/{timestamp}-{6char}-{slug}/TRACE.md criado no repo
   And contém todos campos do schema_version=1
   And aparece em git status
   And, se 1ª execução no repo, prompt one-time explica default + sugere .gitignore template

Scenario: Opt-out para path privado
  Given usuário adicionou pipeline-orchestrator.persist_runs: private em .claude/settings.json
  When execução completa
  Then TRACE.md em ~/.claude/data/pipeline-orchestrator/runs/{timestamp}-{6char}-{slug}/TRACE.md
   And NÃO aparece em git status

Scenario: TRACE.md captura trilha do classificador
  Given classificador rodou em /pipeline
  When TRACE.md é gerado
  Then type_source = "auto via /pipeline"
   And justification tem 2-3 frases explicando POR QUE classificado como bugfix
   And complexity_source explica domains_touched

Scenario: TRACE.md sobrevive update de plugin
  Given TRACE.md em ~/.claude/data/
  When plugin atualizado v5.0 → v5.1
  Then TRACE.md acessível
   And leitor v5.1 reconhece schema_version=1 como compatível
```

#### 12.6.2 TDD

```
tests/slice2/
├── unit/
│   ├── trace-generator.test.js
│   │   - "path em .pipeline-orchestrator/runs/ por default" → FAIL
│   │   - "path em ~/.claude/data/ quando persist_runs=private" → FAIL
│   │   - "fallback é 'repo' quando setting ausente" → FAIL
│   │   - "schema_version=1 sempre presente" → FAIL
│   │   - "duration_seconds calculado corretamente" → FAIL
│   │   - "user_identity fallback quando não em git repo" → FAIL
│   └── trace-schema-validator.test.js
│       - "rejeita TRACE com campo desconhecido" → FAIL
│       - "rejeita TRACE com schema_version inválido" → FAIL
└── integration/
    └── trace-end-to-end.test.js
        - "pipeline real gera TRACE válido" → FAIL
        - "TRACE inclui Pipeline Definition snapshot" → FAIL
```

#### 12.6.3 AIDD — Spec

```yaml
slice_id: 2
title: "Run Record (TRACE.md) universal"
prerequisite_slices: [0, 0.5]

decisions_locked:
  - "Default = repo (.pipeline-orchestrator/runs/) — honra tese 'anexável a PR'"
  - "Setting: pipeline-orchestrator.persist_runs: 'repo' (default) | 'private' (opt-out)"
  - "Prompt one-time na 1ª execução por repo"
  - "Schema versionado (schema_version: 1) desde dia 1"
  - "trace_schema_version separado de plugin_version"

files_to_create:
  - path: "agents/core/trace-generator.md"
    purpose: "Sub-agent invocado no final para escrever TRACE.md"
    inputs:
      - all phase outputs from PIPELINE_DOC_PATH
      - sentinel-state.json (final)
      - gate-decisions.jsonl (full)
      - PROJECT_CONFIG.persist_runs setting
    output: "TRACE.md no path determinado pela config"

  - path: "references/trace-schema/v1.md"
    purpose: "Schema canônico do TRACE.md v1"

files_to_modify:
  - path: "commands/pipeline.md e commands/bugfix.md"
    change: "Adicionar etapa final que invoca trace-generator antes de PIPELINE COMPLETE"

  - path: "settings.json schema (documentação)"
    change: "Documentar pipeline-orchestrator.persist_runs"

verification:
  red_phase: "tests/slice2/ falham"
  green_phase: "passam + manual smoke (rodar bugfix em fixture e abrir TRACE.md)"
  user_validation_required: "PERGUNTAR ao primeiro adopter beta se TRACE.md em PR é útil ou ruído"
```

#### 12.6.4 Definition of Done

- TRACE.md gerado em toda execução.
- Default repo, opt-out privado documentado.
- Schema validável por script standalone.
- 2 entradas reais geradas em fixture-repo (uma /pipeline, uma /bugfix).
- Tag `v5.0.0-rc.1`.

### 12.7 Slice 3 — `/feature`, `/audit`, `/ux`

**Valor:** 4 tipos têm comando explícito. Documentação `commands × modes` matrix publicada.

**Duração:** ~0.5–1 sem.

**Prerequisite slices:** [0, 0.5, 2, 1].

#### 12.7.1 BDD paramétrico

```gherkin
Feature: Comandos explícitos para feature, audit, ux

Scenario Outline: Cada command força seu tipo
  Given plugin v5.0-rc.3
  When usuário digita "/pipeline-orchestrator:<command> <task>"
  Then pipeline correto carrega sem classificador
   And TRACE.md registra type=<type> e type_source="manual via /pipeline-orchestrator:<command>"

  Examples:
    | command  | type    |
    | feature  | feature |
    | audit    | audit   |
    | ux       | ux      |

Scenario: Matrix commands × modes documentada
  Given release v5.0
  When usuário consulta docs/commands-modes-matrix.md
  Then encontra tabela 5×8 marcando válidos/inválidos/sem-efeito
   And exemplos para cada combinação não-trivial
```

#### 12.7.2 AIDD compacta

```yaml
slice_id: 3
title: "Commands restantes (feature, audit, ux)"
prerequisite_slices: [0, 0.5, 2, 1]
pattern: "Idêntico ao Slice 1, repetido 3x"

files_to_create:
  - "commands/feature.md, commands/audit.md, commands/ux.md (3 thin)"
  - "skills/feature/SKILL.md, skills/audit/SKILL.md, skills/ux/SKILL.md"
  - "docs/commands-modes-matrix.md"
  - "references/glossary/{feature,audit,ux}.md (3 glossários)"

verification:
  - "/help mostra 5 commands"
  - "Cada um carrega seu pipeline"
  - "Matrix doc cobre 40 cells"
```

#### 12.7.3 Definition of Done

- 5 commands em `/help`.
- Matriz documentada.
- Tests Slice 3 GREEN.
- 5 agentes domain-native restantes implementados (feature-slice-architect, feature-slice-implementer, audit-intake-mapper, audit-finding-classifier, ux-journey-walker, ux-improvement-proposer — total 6 sumando, 2 já feitos no Slice 1 = 7 dos 9 [erro: re-checar]). Nota: §7.1.1 lista 9 agentes; Slice 1 cobre 2 (bugfix-*); Slice 3 cobre 7 restantes.
- Tag `v5.0.0-rc.3`.

### 12.8 Slice 4 — Compat regression suite

**Valor:** CI valida que `/pipeline-orchestrator:pipeline` continua produzindo o mesmo **contrato observável** em N cenários canônicos. Quebra trava merge.

**Duração:** ~1.5–2 sem. Cobre Problema #5 parcialmente.

**Prerequisite slices:** [0] (spike CI harness).

#### 12.8.1 BDD

```gherkin
Feature: Compat regression suite

Scenario: Snapshot de contrato observável (não prosa)
  Given cenário canônico "fix-login-bug" em tests/compat/v4-baseline/scenarios/
   And expected.yaml gerado a partir de execução em v4.1.0 contendo:
       - classification: { type, complexity }
       - gates_triggered: [lista ordenada com hardness]
       - agents_invoked: [lista ordenada]
       - artifacts_produced: [filenames apenas]
       - verdict: GO | CONDITIONAL | NO-GO
  When cenário executado em v5.0
  Then todos campos batem
   And texto literal de prompts/outputs intermediários é IGNORADO

Scenario: Quebra de compat trava merge
  Given PR que muda comportamento de classificação
  When CI roda compat-suite e detecta divergência
  Then merge bloqueado
   And PR template pede justificativa explícita

Scenario: Suite executável localmente em < 5 min
  Given dev solo
  When roda npm run test:compat
  Then todos N cenários completam em < 5 min
   And output mostra clearly quais passaram/divergiram
```

#### 12.8.2 AIDD — Spec

```yaml
slice_id: 4
title: "Compat regression suite (escopo honesto)"
prerequisite_slices: [0]
critical_dependency: "SPIKE-CI-HARNESS.md PASS — sem isso, slice é redesenhado"

decisions_locked:
  - "Granularidade: contrato observável (4 campos), não prosa"
  - "Cenários canônicos: 5 inicialmente (1 por type + 1 hotfix)"
  - "CI runtime budget: < 5 min total"

files_to_create:
  - "tests/compat/v4-baseline/scenarios/{name}/input.md"
  - "tests/compat/v4-baseline/scenarios/{name}/expected.yaml"
  - "tests/compat/runner.cjs"
  - ".github/workflows/compat-regression.yml"

branch_on_spike_result:
  PASS:
    description: "claude headless funciona em GitHub Actions"
    implementation: "runner.cjs invoca claude --headless e captura output real"
    fidelity: "alta"
  FAIL:
    description: "CLI não roda headless ou é instável"
    implementation: "runner.cjs usa mock harness — interceptador de Agent calls retornando fixtures"
    fidelity: "média (testa controller, não LLM behavior)"
    not_blocking: "Slice 4 prossegue com mock; documentar limitação"
```

#### 12.8.3 Definition of Done

- 5 cenários canônicos rodando em CI.
- Quebra de compat trava merge.
- Suite < 5 min.
- `tests/compat/README.md` explica como adicionar cenários.
- Tag `v5.0.0` (release final).

**Critério formal de promoção 🟡 PARCIAL → 🟢 ENTREGUE** (adicionado 2026-05-03 via governance audit):

Slice 4 só transita para 🟢 quando os 4 itens abaixo forem TODOS verificáveis por terceiro:

1. **Runner existe e executa:** `tests/compat/runner.cjs` presente e invocável via `node tests/compat/runner.cjs --all`. Saída legível indica per-cenário PASS/DIVERGED/SKIPPED.
2. **CI workflow ativo:** `.github/workflows/compat-regression.yml` registrado, dispara em PRs que tocam `commands/`, `agents/core/`, `agents/quality/`, `references/pipelines/`, `references/gates.md`. Falha do workflow bloqueia merge (branch protection rule configurada).
3. **5 cenários canônicos fixados:** `tests/compat/v4-baseline/scenarios/` contém pelo menos 5 subdiretórios — 1 por type (bugfix, feature, audit, ux) + 1 hotfix — cada um com `input.md` + `expected.yaml` validados contra v4.5.0 (baseline atual, dado que v4.1.0 já foi superado).
4. **Performance budget cumprido:** wall-clock total dos 5 cenários < 5 minutos em runner GitHub Actions (`ubuntu-latest`). Medido via timestamp inicial/final no log do workflow.

**Status atual em 2026-05-03 (atualizado pós-implementação):**

- ✅ **Critério 1 (runner):** `tests/compat/runner.cjs` implementado (~340 linhas, parser YAML inline, modo mock+real, comparação 4-campos com canonicalização key-order-independente, detecção TEMPLATE, exit codes 0/1/2). Smoke test verde. Adversarial review aplicou 7 fixes (2 CRIT + 4 MAJ + 1 MIN). Ver §17.3 #10 para histórico de fixes.
- ✅ **Critério 2 (CI workflow):** `.github/workflows/compat-regression.yml` criado. Dispara em PRs que tocam pipeline-affecting paths (commands, agents core/quality/executor, references, skills, hooks, plugin.json, marketplace.json, CLAUDE.md). Falha do step gera PR comment via `gh pr comment --body-file`. Branch protection rule continua sendo trabalho manual no GitHub UI.
- 🟡 **Critério 3 (5 cenários):** **5/5 estruturalmente implementados** [VERIFICADO 2026-05-03] — `bugfix-fixture/`, `feature-fixture/`, `audit-fixture/`, `ux-fixture/`, `hotfix-fixture/` cada um com `input.md` (task description realista) + `expected.yaml` (contrato observável inferido do spec §7.2.X / `commands/pipeline.md` HOTFIX Mode). Todos marcados `baseline_method: TEMPLATE` → runner detecta e SKIPa, retornando exit 1 com warning "NO REAL VALIDATION" — CI bloqueia merge corretamente. **0/5 com baseline real capturado** — todos precisam de dogfooding em sessão CLI claude para popular `mock-output.json` (modo mock) ou rodar live (modo real). Protocolo executável de captura documentado em `tests/compat/README.md` seção "Protocolo de captura de baseline real" (5 passos por fixture, ~10min cada).
- ⏸️ **Critério 4 (performance):** N/A até os 5 cenários existirem. Runner mede wall-clock per-cenário e total; budget 5min hardcoded.

**Score:** 2/4 ✅ + 1/4 🟡 (80% interno: 4/5 fixtures estruturais + 0/5 baselines reais) + 1/4 ⏸️ = **estrutura completa, faltando captura de baselines + 1 fixture hotfix**. Slice 4 permanece 🟡 até critérios 3 (capturar 5 baselines reais) e 4 (medição wall-clock) fecharem.

**Implicação para v5.0 final:** a tag `v5.0.0` continua bloqueada pela DoD #5 ("Slice 4 verde"). Esta atualização documenta progresso real (50% feito, 50% requer dogfooding) sem afrouxar o critério.

**Próxima ação concreta para fechar Slice 4:**
1. Criar `hotfix-fixture/` (5º cenário) — copiar template do `bugfix-fixture/` ajustando para `--hotfix` flag (force COMPLEXA, type=Bug Fix, severity=Critical, 2 checklists adversarial em vez de 7).
2. Em sessão CLI claude, rodar `/pipeline-orchestrator:pipeline <input de cada fixture>` para os 5 cenários (hoje 4 existem como template + 1 a criar).
3. Para cada um, capturar a saída observável (4 campos) e popular `expected.yaml`: substituir `baseline_method: TEMPLATE` por `baseline_method: captured 2026-MM-DD via dogfooding`. Adicionalmente, salvar snapshot em `mock-output.json` ao lado para o runner usar em modo `--mock` (CI sem claude CLI).
4. Rodar `node tests/compat/runner.cjs --all` e confirmar 5 PASS.
5. Commit + medir wall-clock total → atualizar Critério 4 com número real.

**Tempo estimado para fechar:** ~1h em sessão CLI dedicada (5 cenários × ~10min cada para rodar + capturar + validar).

### 12.9 Slice 5 — YAML interpreter (COMMITTED v5.1, ≤ Q+2)

**Status pós-iter 2 (D2:776–793):** **Compromisso firmado**, não condicional. Pilar (a) da tese ("pipeline declarativo") só fecha com este slice.

**Janela:** ≤ 2 quarters após v5.0.

**Resolução de contradição — YAML interpreter:** D1:262 colocava em v5.0 como C-2 (4–6 semanas, "coração do redesign"). D2 difere para v5.1 (Slice 5). **Consolidado adota D2:** em v5.0 shapes são markdown; YAML em v5.1 com bifurcação obrigatória.

**Sinais de re-priorização (não cancelamento):** se durante v5.0 emergir evidência forte de que YAML é desnecessário (0 issues + autor não sentiu dor), reabrir decisão com novo design doc — não silenciosamente abandonar.

#### 12.9.1 Bifurcação obrigatória se construído

Auditoria identificou risco HIGH em "agent interpretando YAML LLM-style". Se Slice 5 acontecer, deve ser bifurcado:

- **Camada determinística (hook JS + parser):** lê YAML, valida contra schema + allow-list, produz JSON estruturado. Agent **nunca** vê YAML cru.
- **Camada LLM (agent):** recebe JSON pré-validado. Raciocina apenas dentro de constraints declaradas.

#### 12.9.2 Esboço schema YAML (de D1:128–174)

```yaml
schema_version: 1
name: bugfix
description: Bug fix pipeline with diagnostic, root-cause analysis, fix, regression test

complexity_branches:
  SIMPLES:
    phases: [diagnostic, implementation, verification]
  MEDIA:
    phases: [diagnostic, root-cause, implementation, verification]
  COMPLEXA:
    phases: [diagnostic, root-cause, implementation, verification, adversarial]

phases:
  diagnostic:
    purpose: Reconnaissance and ranked hypothesis
    agents: [bugfix-diagnostician]
    gates_before: [INFO_GATE_BLOCKED]
    artifacts: [DIAGNOSTIC_REPORT]

  root-cause:
    purpose: Confirm root cause with evidence chain
    agents: [bugfix-rootcause-confirmer]  # nota: v5.1 agent
    inputs: [DIAGNOSTIC_REPORT]
    artifacts: [ROOT_CAUSE_RESULT]

  implementation:
    purpose: Apply minimal fix
    agents: [executor-implementer-task]
    inputs: [ROOT_CAUSE_RESULT]
    gates_during: [TDD_APPROVAL]

  verification:
    purpose: Regression and adjacent-breakage check
    agents: [bugfix-regression-tester]  # v5.1
    gates_after: [CHECKPOINT_FAIL, FINAL_ADVERSARIAL_GATE]

  adversarial:
    purpose: Adversarial review on COMPLEXA tasks only
    agents: [adversarial-reviewer]
    gates_after: [ADVERSARIAL_GATE_MANDATORY]

success_criteria:
  - root_cause_documented
  - regression_tests_pass
  - sanity_check_passed
```

Esquema completo do Slice 5 fica fora deste documento (não é v5.0 scope).

---

## 13. TRACE.md Schema (schema_version=1)

Origem: D1:200–243 + D2:506–608.

Localização default: `.pipeline-orchestrator/runs/{YYYYMMDD-HHMMSS}-{6char-random}-{slug}/TRACE.md`. Sufixo aleatório evita colisão entre worktrees ou usuários simultâneos.

Localização opt-out (privado): `~/.claude/data/pipeline-orchestrator/runs/{...}/TRACE.md` quando `pipeline-orchestrator.persist_runs: 'private'` em `.claude/settings.json`.

### 13.1 Schema canônico

```markdown
# Pipeline Run: {slug}

- trace_schema_version: 1                       # int
- timestamp_utc: 2026-04-26T15:30:00Z          # ISO 8601 UTC
- started_at: 2026-04-26T15:30:00Z
- ended_at: 2026-04-26T15:42:31Z
- duration_seconds: 751                         # int
- plugin_version: 5.0.0                         # semver
- user_identity: fernandoxavier02@github       # fonte: git config user.email se em repo, OS user fallback
- branch: feature/v5-rc1                       # git branch atual ou "(no-git)"
- repo: github.com/fernandoxavier02/Pipeline-Orchestrator   # git remote ou "(local)"
- task: {task description}

## Classification
- type: bugfix
- type_source: manual via /pipeline-orchestrator:bugfix    # OR auto via /pipeline
- complexity: COMPLEXA
- complexity_source: auto (rationale: domains_touched=3)
- justification: {prose, 2-3 sentences}

## Pipeline Definition (snapshot)
{cópia integral do shape .md (v5.0) ou YAML (v5.1) carregado}

## Execution Log
### Phase: diagnostic
- started_at: 2026-04-26T15:30:00Z
- ended_at: 2026-04-26T15:32:14Z
- agents: [bugfix-diagnostician]
- gate_before: INFO_GATE_BLOCKED → PASS
- artifacts_produced: [DIAGNOSTIC_REPORT]
- status: SUCCESS
- dispatch_mode: parallel | serial                          # NOVO Invariante #6 (por fase)
- dispatch_decision_reason: {prose curta — por que paralelo ou serial nesta fase}
- emergent_invocations: []                                  # ou lista com {agent, motivo, evidência}

### Phase: root-cause
... (idem, com dispatch_mode e dispatch_decision_reason próprios)

## Final Verdict
- status: SUCCESS | DONE_WITH_CONCERNS | BLOCKED
- artifacts: [list of files modified, tests added]
- open_issues: [...]
- recommended_next: {prose}
```

**Nota:** cada fase registra seu próprio `dispatch_mode` — Invariante #6 exige granularidade por-fase, não top-level por execução. Pipelines reais alternam entre paralelo (fases com agentes independentes) e serial (fases com dependência entre agentes), e o TRACE.md precisa preservar essa distinção fase-a-fase para auditoria e debugging.

### 13.2 Versionamento e retenção

`trace_schema_version` permite que TRACEs gerados em v5 sejam lidos por v5.1+. Política de retenção: TRACEs ficam indefinidos (são pequenos, são versionados em git); usuário decide com `.gitignore` ou cleanup manual. v5.0 não implementa rotation.

---

## 14. Security Model

Origem: D1:316–326 + D3:130–146 (rule 40).

### 14.1 Allow-list

YAML/markdown loader (e seus equivalentes em v5.0 markdown shapes) é nova superfície de ataque. Se atacante corrompe `references/pipelines/feature.md`, ele muda o fluxo de execução.

Mitigações em v5.0:

- **Allow-list de phase ids, agent names, gate names** — loader rejeita qualquer valor fora do conjunto registrado em `references/gates/registry.md` (Slice 0.5) e `AGENTS.md` (Slice 0.5 A2).
- **Schema validation** com `schema_version` checagem (v5.1 quando YAML).
- **YAML loader em modo seguro** (sem `!!python/object` ou tags equivalentes) — v5.1.
- **Anti-injection invariant atualizado**: shapes em `references/pipelines/` continuam sendo DATA, não authoritative — controller interpreta, não executa código embutido.
- **PR review obrigatório em mudanças de `references/pipelines/`** via CODEOWNERS.

### 14.2 Adversarial zero-context (rule 40, de D3)

Adversarial agents proibidos de ler `.pipeline-orchestrator/runs/<id>/artifacts/implementer-*.{json,md}` durante o mesmo run.

Enforcement: hook `dispatch-guard.cjs` (Slice 0.5 C1). Documentado em `.claude/rules/40-adversarial-zero-context.md` com glob `agents/executor/type-specific/adversarial-*.md`.

### 14.3 Threat model formal

Para plugin solo OSS pré-1.0, mitigações inline (allow-list, schema validation, hook de bloqueio) bastam. Documento formal `docs/security-model-v5.md` só se usuário corporativo aparecer.

---

## 15. Bug Arquitetural Conhecido — pipeline-controller sem tool Agent quando subagentado

**Status nos 3 docs:** NÃO MENCIONADO em D1, D2 nem D3.

**Origem:** descoberto durante dogfooding em 2026-04-29.

### 15.1 Sintoma & evidência

`pipeline-controller`, quando spawnado como subagente via `subagent_type=pipeline-orchestrator:core:pipeline-controller`, **NÃO recebe a tool `Agent`/`Task` automaticamente** — então não consegue spawnar os N2 (`task-orchestrator`, `information-gate`, etc.). Quebra toda cascata v4.

Evidência cirúrgica: tentativa de spawn aninhado em sessão de dogfooding 2026-04-29 retornou InputValidationError — controller não tinha permissão para invocar Agent tool.

### 15.2 Hipótese de causa-raiz

[HIPOTESE] Claude Code harness não propaga `Agent`/`Task` para subagente a menos que esteja explicitamente declarada em `tools:` no frontmatter do agent `.md`. v5 introduz `pipeline-controller` como agente N1 que dispatch os N2. O agente ainda não foi criado na codebase (ver §16 erro #1). Quando for criado, se o frontmatter `tools:` não declarar explicitamente `Agent` (ou `Task`), o harness não propagará a tool para o subagente — e o controller ficará sem capacidade de spawnar N2. O bug se manifesta na criação do agent v5, não no v4 atual (que usa `task-orchestrator` direto via slash command).

### 15.3 Critério #7 de Definition of Done (NOVO)

`pipeline-controller` declara `tools: [Agent, Task, Read, Write, Bash, Glob, Grep, AskUserQuestion]` em frontmatter, e Slice 0 valida com smoke test que spawn aninhado funciona end-to-end.

Adicionado a §8 como Critério #7.

### 15.4 Validação obrigatória no Slice 0 smoke test

Cenário BDD adicionado a §12.3.1:

```gherkin
Scenario: Spawn aninhado funciona end-to-end (NOVO §15)
  Given pipeline-controller agent criado com tools [Agent, Task, ...]
  When controller spawna task-orchestrator que spawna information-gate
  Then cascata completa sem InputValidationError
   And SPIKE-NESTED-SPAWN.md documenta resultado
```

Output: `SPIKE-NESTED-SPAWN.md` adicionado ao Slice 0 DoD.

### 15.5 Atualização da Invariante #6

Acrescentado em §9: "validar antes de cada execução que o controller herda Agent/Task tools — sem isso, dispatch falha silenciosamente".

---

## 16. Erros de Baseline a Corrigir no Slice 0

Auditoria 2026-04-29 contra repo canonical revelou 10 itens. Todos devem ser endereçados no Slice 0 (criação) ou Slice 0.5 (ajuste de docs/policies).

| # | Erro | Origem nos docs | Real | Slice owner |
|---|---|---|---|---|
| 1 | ~~`pipeline-controller` agent não existe em `agents/core/`~~ | D1, D2, D3 assumem existência (D1:176, D2:148, D3:175) | **EXISTE** [VERIFICADO 2026-04-30 — falso alarme; estava na cache 4.1.3, sincronizado para canonical] | **RESOLVIDO** via sync 4.1.3 (ver §17.3 #5 e §7.5 atualizado). Gap residual: 2 tools faltantes vs DoD #7 — ver §7.5 nota final. |
| 2 | 5 dos 7 hooks referenciados não existem (`sentinel-hook`, `dispatch-guard`, `session-lock-hook`, `edit-guard-hook`, `session-cleanup-hook`) | D1:184–188, D3:132 | Existem apenas `completion-checklist.cjs` e `force-pipeline-agents.cjs` [VERIFICADO] | **Slice 0** auditar; **Slice 0.5 C1/C2** criar `dispatch-guard.cjs` e estender `force-pipeline-agents.cjs` |
| 3 | Versão do plugin = 4.1.x assumida | D1:5, D1:264, D2 (toda referência), D3:181 | **plugin.json declara 3.0.2; README 3.1.0** [VERIFICADO] | **Slice 0.5 D3** alinhar |
| 4 | Contagem de agentes = 38 | D1:12 | **19 agentes** [VERIFICADO] | **Slice 0** auditar e atualizar AGENTS.md (Slice 0.5 A2) |
| 5 | `commands/pipeline.md` ~1100 linhas | D1:262 | **957 linhas** [VERIFICADO]; D2 reality-check também errado ao dizer 38 | **Slice 0** atualizar INVENTORY.md |
| 6 | Pipelines `.md` = 12 | D2 (reality-check seção, implícito) | **10 pipelines `.md`** [VERIFICADO] | **Slice 0** atualizar INVENTORY.md |
| 7 | `agents/core/sentinel.md` referenciado em D3:173 | D3:173 (D2 padronização tools) | **Não existe** [VERIFICADO] | **Slice 0** auditar; remover referência D3 ou criar agent |
| 8 | `agents/executor/type-specific/` subdiretório referenciado em D3:160 (5 agents `color: orange`) | D3:160–168 | **Subdiretório não existe** [VERIFICADO]; os 5 agents listados são fantasmas | **Slice 0** auditar e atualizar D3 lista; Slice 0.5 D1 só roda em arquivos que efetivamente existem |
| 9 | 15 gates implícitos em D1 sem SSOT em `references/gates/registry.md` | D1:86 (lista) | **registry.md não existe** [VERIFICADO] | **Slice 0.5** criar registry com hardness taxonomy (§11.3) |
| 10 | COMPLEXITY_GATE proposto em D2 sem taxonomia formal de hardness | D2:185–192 | **`references/gates/` ausente** [VERIFICADO] | **Slice 0.5** formalizar taxonomy (§11.4) |

### 16.1 Implicação macro

Os 10 erros sugerem que design docs foram empilhados em cima de baseline assumido (provavelmente cópia mental de plugin similar ou versão antiga não-mainline) sem nunca terem sido validados contra `D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator` real. Slice 0 + Slice 0.5 fazem reconciliação. Sem isso, qualquer Slice 1+ vai bater em paredes.

---

## 17. Open Questions Residuais

Origem: D2:850–856 (Q1–Q5 originais decididos) + D3:259–264 (4 residuais).

### 17.1 Decididas (registradas para histórico)

| Q original | Status |
|---|---|
| Q1 (D1): `/pipeline` continua entry point principal ou fallback? | **Decidido (status quo, com risco aceito)**: ambos válidos como peers. Re-avaliar pós-release. |
| Q2 (D1): Modos preservados em todos os 5 commands? | **Decidido**: sim, todos preservados; matriz Slice 3 marca os sem-efeito. |
| Q3 (D1): YAML loader estrito ou permissivo? | **Adiada para Slice 5 (v5.1)**. |
| Q4 (D1): TRACE.md repo ou privado? | **Decidido iter 2**: REPO por default, opt-out privado via setting. |
| Q5 (D1): Comportamento em downgrade v5→v4? | **Decidido**: TRACE.md é só markdown que v4 ignora. Documentar em migration guide. |

### 17.2 Residuais (de D3)

1. **D4 — manter `autoDiscover: true` ou remover?** Inclinação: remover se nenhum loader proprietário consome.
2. **D6 — podar knowledge-base ou completar?** Inclinação: podar (falsa completude é pior).
3. **Slice 0.5 paraleliza com Slice 0?** Possível, zero overlap de arquivos. Decisão do dono.
4. **MEMORY.md raiz — descartado mesmo?** Confirmação: TRACE.md per-run cobre. Decisões arquiteturais persistentes vivem em `designs/` (apropriado).

### 17.3 Novas (surgidas na consolidação e em audits posteriores)

5. **§16 erro #7/#8 — recriar agents fantasmas ou apagar referências?** ✅ **RESOLVIDO em 2026-04-30**: descoberta no sync que ambos JÁ EXISTIAM na cache 4.1.3 (não eram fantasmas — só não estavam no canonical D:\). Sincronizado.
6. **Critério #7 (§15) — pipeline-controller é o ÚNICO agente com bug de tools propagation, ou outros agentes core também?** ✅ **RESOLVIDO via SPIKE-NESTED-SPAWN.md v2** (2026-04-30): auditoria empírica do baseline 4.1.3 mostrou que pipeline-controller é o único N0 que declara `tools:` (least-privilege); demais N1/N2 omitem o campo (= full default tools). Convenção CC 2.x identificada e documentada.
8. **Lição registrada — ordem de execução divergiu do plano (Slice 1 antes de Slice 2).** 📌 **DOCUMENTADA em 2026-05-03 governance audit**: Slice 1 (`/bugfix` thin entry-point) foi shippado em v4.2.0 antes de Slice 2 (TRACE.md generator) existir. ACs do Slice 1 que mencionavam emissão de `type_source` no TRACE.md ficaram sem verificação direta — o pipeline emite no `gate-decisions.jsonl` em vez disso. Ajuste retroativo: §12.5.3 `prerequisite_slices` corrigido para `[0, 0.5]` (era `[0, 0.5, 2]`); §12.6 marcará que Slice 2 retroativamente popula TRACE.md a partir do log existente. **Causa-raiz da divergência:** otimização de UX do dono (entregar comando explícito cedo para dogfooding); custo: prerequisita declarada virou ficção até esta nota. **Lição capturada:** quando ordem real divergir do plano, atualizar prerequisite_slices E status table na MESMA release — não acumular dívida silenciosa. Esta é uma instância concreta do drift que §1.1 já criticou em D1/D2/D3.
9. **Gap residual de tools no pipeline-controller (descoberto 2026-05-03).** ✅ **RESOLVIDO em 2026-05-03**: opção (b) escolhida pelo dono — `Task` e `Bash` adicionadas ao frontmatter de `agents/core/pipeline-controller.md`. Frontmatter atual declara 8 tools (`Read, Write, Glob, Grep, Agent, AskUserQuestion, Task, Bash`), conforme DoD #7. Justificativa para opção (b) sobre opção (a): defensive — adicionar é aditivo e não-breaking; o controller já funcionava sem essas duas, mas pode vir a precisar (ex: `Bash` para invocar exec-window scripts diretamente em vez de via Agent dispatch; `Task` se o harness CC 2.x ganhar nova semântica). Custo zero, risco zero.
10. **Slice 4 instalação parcial (2026-05-03).** 📌 **HISTÓRICO REGISTRADO**: estrutura do Slice 4 entregue em duas sessões pipeline lean-inline. Sessão 1 (01:00-01:06 UTC): runner.cjs + workflow YAML + 1 fixture template (bugfix) + README. Reviewer adversarial (`ce-correctness-reviewer`) cravou NEEDS_REWORK com 2 CRITICAL (parseYaml lookahead via `lines.indexOf` frágil; executeMock retornava expected como actual = PASS sintético) + 6 MAJOR + 4 MINOR. Fix-loop atempt 1/3 aplicou 7 fixes (2 CRIT + 4 MAJ + 1 MIN); 2 MINOR cosméticos pulados; 1 MAJOR (typo CLAUDE_CLI_AVAILABLE) aceito como risco. Smoke test pós-fix verde (exit 1 quando só SKIPPED — não engana CI). Sessão 2 (02:00-02:05 UTC): adicionados 3 fixtures restantes (feature, audit, ux) inferidos do spec §7.2.3/§7.2.2/§7.2.4, todos marcados TEMPLATE. Smoke test 4-fixtures: 4 SKIPPED + exit 1 + warning "NO REAL VALIDATION" — CI bloqueia merge no estado atual. Faltam: 1 fixture (hotfix) + 5 baselines reais via dogfooding + medição wall-clock para promover Slice 4 a 🟢. Owner: dono do plugin.
11. **Slice 4 fixture-5 + protocolo de captura (2026-05-03 sessão 3).** 📌 **HISTÓRICO REGISTRADO**: brainstorming + writing-plans + execução adicionou `hotfix-fixture/` (5º cenário, contrato observável inferido de `commands/pipeline.md` HOTFIX Mode com diferenças explícitas vs bugfix-fixture: campo `mode=hotfix`, pseudo-gate `HOTFIX_CONFIRMATION`, 2 checklists adversarial em vez de 7, `adversarial-{architecture,quality}-reviewer` ausentes, `FINAL_ADVERSARIAL_GATE.decision=SKIPPED`, artefato `HOTFIX_LOG.md` obrigatório, seção `hotfix_assertions` que runner verifica sempre). Mais: seção "Protocolo de captura de baseline real" no `tests/compat/README.md` documenta 5 passos por fixture para quando dogfooding real acontecer. Captura de baselines reais e medição wall-clock continuam adiadas por decisão do dono ("deixa isso que vemos no decorrer das execuções reais"). Score Slice 4: 90% estrutural, 0% baseline real. Ver spec `docs/superpowers/specs/2026-05-03-hotfix-fixture-and-capture-protocol-design.md`.
12. **Slice 3b drift descoberto via adversarial review (2026-05-03 sessão 4).** 📌 **HISTÓRICO REGISTRADO + RESOLVIDO**: durante prep do porte do Pulsar `Implement_new_feature` (Slice 3b), 3 reviewers adversariais (`ce-coherence` + `ce-feasibility` + `ce-scope-guardian`) detectaram drift entre §7.1.1 e realidade do plugin. **§7.1.1 listava** `feature-slice-architect`, `feature-slice-implementer` (nomes que NUNCA existiram); reais são `feature-vertical-slice-planner`, `feature-implementer`, `feature-integration-validator` [VERIFICADO 2026-05-03 via `ls agents/executor/type-specific/feature-*.md`]. Origem: D1/D2 invertaram nomes sem reality-check — mesmo padrão que §1.1 já tinha criticado. **Resoluções aplicadas em 2026-05-03 nesta passada:** (a) §7.1.1 atualizada com 3 nomes corretos; (b) §7.2.3 reescrita — Light = 13 passos compartilhados com Heavy + mode flag (era 6 "redesenhar do zero"), alinhado com Pulsar Light real; (c) ownership mapping corrigido para refletir agentes reais. **Lições adicionais capturadas:** (i) hooks (`sentinel-hook`, `dispatch-guard`, `force-pipeline-agents`) NÃO parseiam SKILL.md frontmatter — campos `sequence_lock`, `gates_at`, `sentinel_checkpoints`, `agent_type` em skill specs são **ADVISORY documentação, não enforcement** (slice 1.5/3a funcionam assim hoje silenciosamente; documentado explicitamente em §17.4 #8 abaixo); (ii) Pulsar TDD step usa paths Firebase-específicos (`functions/src/__tests__/`) que NÃO generalizam — porte deve parametrizar via `expected_inputs.pre_tester_artifacts` em vez de hardcoded shell. Spec mapping 3b: `docs/superpowers/specs/2026-05-03-feature-pulsar-import-mapping.md` (rewrite v2 pós-bugfix em commit subsequente). **Adendo 2026-05-03 v4.6.1 correction:** o pattern "single skill com mode flag" do mapping v2 foi REVERTIDO em v4.6.1 — fonte canônica Pulsar tem 2 pastas (Heavy + Ligth), port deve ter 2 skills. Lição: AskUserQuestion com primeira opção marcada "Recomendado" pode enviesar a escolha do dono. Próximas portabilidades de fonte canônica devem espelhar 1:1 sem reinterpretar estrutura — perguntas técnicas envolvendo "padrão novo vs estrutura da fonte" devem apresentar a estrutura da fonte como recomendada por padrão, não a otimização inventada.

13. **Hook enforcement de SKILL.md frontmatter (v4.8.0 — 2026-05-03).** ✅ **IMPLEMENTADO**: opção (ii) de §17.4 #8 (estender hooks para parsear frontmatter) entregue como sub-slice independente após Slice 3b polish. Escopo final: 6 skills cobertas (bugfix-{light,heavy} + audit-{light,heavy} + feature-{light,heavy}); 3 hooks estendidos (sentinel-hook, dispatch-guard, force-pipeline-agents); 1 shared module (skill-frontmatter-parser.cjs); 1 fixture set (3 SKILL.md sintéticos: good/bad-yaml/no-contract); 4 test files atualizados/criados (32 + 9 + 4 + 13 = 58 novos test assertions). **Decisões técnicas:** (a) Time-based mode toggle: `DENY_MODE_START_ISO = '2026-05-17'`; antes warn (logga + stderr, não bloqueia), depois deny (`permissionDecision: deny`). 14 dias de janela permitem operadores observarem padrões de violação reais antes de blocking quebrar workflows. (b) Override via env `PIPELINE_ENFORCEMENT={warn,deny}` para CI/testing. (c) Hardness `AUDIT` distingue ENFORCEMENT_WARN/DENY dos gates SOFT/HARD/MANDATORY/CIRCUIT_BREAKER existentes. (d) Backward compat preservada: enforcement skipa quando `current_skill` ausente em state ou quando SKILL.md não declara o campo. (e) `dispatch-guard.cjs` mudou matcher de `Skill` para `Skill|Agent` em `hooks/hooks.json` — Agent calls agora também passam pelo guard para validação per-step. (f) `force-pipeline-agents.cjs` enforce em UserPromptSubmit (não pode deny via permissionDecision; emite systemMessage com tag `[ENFORCEMENT_DENY]` em deny mode). **Lições adicionais capturadas:** (i) parser YAML inline de `tests/compat/runner.cjs` comprovou-se reusable + testado em produção — copy-paste para shared module foi opção mais rápida que extrair package; (ii) "advisory durante warn window" é melhor default que "deny imediato" para enforcement novos — permite observabilidade sem regressão; (iii) `sentinel_checkpoints` em frontmatter usa convenção `pre_<N>` (string) ou `<N>` (int) — parser aceita ambos; (iv) Iron Law mantida — nenhum consumer project (FX Studio, Pulsar etc.) foi tocado, só hooks JS + tests do plugin. Resolve §17.4 #8 (atualizado para RESOLVIDO).

### 17.4 Aberta — para Slice 3

7. **ARCH-2 (HIGH) — Trust boundary do `PRE_CLASSIFIED_TYPE` prefix.** Identificada em adversarial review do Slice 1 (2026-04-30): o prefix `PRE_CLASSIFIED_TYPE=<Type>` é uma string injetável pelo usuário se ele invocar `/pipeline-orchestrator:pipeline` direto e digitar o prefix manualmente. O `task-orchestrator` Step 1a obedece sem checar origem. Decisão: **deferida pra Slice 3** quando os 4 entry-points restantes (`/feature`, `/userstory`, `/audit`, `/ux`) forem desenhados juntos. Naquele momento, avaliar se o contrato deve mover de string-prefix para um campo de metadata fora do prompt-string (e.g., Agent.metadata ou frontmatter args).
8. **Hooks NÃO enforce SKILL.md frontmatter (descoberto 2026-05-03 ce-feasibility-reviewer).** ✅ **RESOLVIDO em v4.8.0 (2026-05-03)** — opção (ii) foi escolhida e implementada. Implementação: novo módulo compartilhado `.claude/hooks/skill-frontmatter-parser.cjs` (~210 linhas, parser YAML inline reusado de `tests/compat/runner.cjs`, expõe `getCurrentSkill`, `getEnforcementMode`, `logEnforcementDecision`) + extensão dos 3 hooks: `sentinel-hook.cjs` valida `sentinel_checkpoints` (verifica que `expected_next` está set quando step é checkpoint), `dispatch-guard.cjs` agora processa também Agent calls (matcher `Skill|Agent`) e valida `agent_type` per step contra `skills/<name>/steps/0N-*.md`, `force-pipeline-agents.cjs` valida `gates_at` (verifica evidência de AskUserQuestion em `gate-decisions.jsonl` antes de prosseguir). Roll-out 2-fases time-based: warn mode até **2026-05-17** (logga `ENFORCEMENT_WARN` em gate-decisions.jsonl com `hardness: AUDIT`, não bloqueia), deny mode auto-promove (bloqueia via `permissionDecision: deny`). Override: env var `PIPELINE_ENFORCEMENT={warn,deny}`. Backward compat: hooks skipam silently quando `current_skill` ausente em sentinel-state.json (preserva flows não-skill). Controller atualizado em `agents/core/pipeline-controller.md` para popular `current_skill` + `current_step` antes de Agent spawn. Ver §17.3 #13 para detalhes completos da implementação. (Original): campos do SKILL.md frontmatter eram declarativos para humanos lerem, não enforcement mecânico via hooks — drift teoricamente possível. Issue agora fechada.

---

## 18. Distribution Plan

Origem: D1:304–312, ajustado para incluir Slice 0.5.

- **Release:** tag `v5.0.0` no GitHub, precedido por `v5.0.0-rc.1` (após Slice 1) com 1–2 semanas de feedback antes de cada rc subsequente. Final `v5.0.0` após Slice 4 com todos 7 critérios DoD verdes.
- **Migration guide:** `docs/migration-v4-to-v5.md` cobrindo: quando usar `/pipeline` vs commands específicos, formato do TRACE.md, mudanças em hooks (incluindo novos C1/C2 do Slice 0.5), onde TRACEs ficam, como o Slice 0.5 ajustou cosméticos D1–D6.
- **CHANGELOG:** entrada por Slice (0, 0.5, 1, 2, 3, 4). Inclui menção da milestone v5.1 (DoD #5).
- **Anúncio:** Discord do Claude Code, comunidades de plugin, fóruns DevOps/SRE.
- **Blog post técnico:** "Como o pipeline-orchestrator virou caixa de vidro" — diagrama antes/depois, exemplo de TRACE.md anexado a PR. Idealmente publicado simultâneo com release.
- **Issue templates:** `bug`, `pipeline-feedback`, `audit-trail-request`.
- **CI/CD:** GitHub Actions roda compat regression suite (Slice 4) em PR; merge bloqueado se algum snapshot diverge.

### 18.1 Beta interno

- Rodar `/pipeline-orchestrator:audit` em projeto próprio.
- Validar TRACE.md anexável a PR.
- Confirmar que Slice 0.5 hooks (dispatch-guard adversarial, plan-mode-enforcer) bloqueiam corretamente.

---

## 19. Apêndice A — Histórico de iterações

### 19.1 Componentes C-1..C-6 originais (OBSOLETOS)

D1:96–266 propunha decomposição horizontal:

- **C-1.** Refactor multi-command + multi-skill (1 sem)
- **C-2.** Pipeline-as-YAML interpreter (4–6 sem) — coração do redesign
- **C-3.** Refactor dos 7 hooks (1–2 sem)
- **C-4.** TRACE.md generator (1 sem)
- **C-5.** Compat regression suite CI integration (0.5 sem)
- **C-6.** Histórico consultável (`audit --use-history`, 0.5 sem)

**Total D1:** 11–16 semanas (D1:268).

**Substituído por** Slices 0–5 (este doc §12) com total 4.5–7.5 semanas para v5.0 + 6–8 semanas para v5.1. Razão da substituição: D2 mostrou que organização horizontal é boil the ocean para dev solo; vertical é incremental e shippeável independentemente.

C-1..C-6 não são executáveis. Preservados aqui para rastreabilidade.

### 19.2 Decisões revertidas

- **TRACE.md default:** D1:282 inclinava para repo do usuário; iter 1 do review proposto privado; iter 2 reverteu para repo (default sem opt-in) — ver §8.1.
- **Esforço total v5.0:** D1:268 dizia 11–16 sem; D2:293 reduziu para 4–7 sem; consolidado pós-Slice-0.5 = 4.5–7.5 sem.
- **YAML interpreter em v5.0 vs v5.1:** D1 o colocava em v5.0; D2 deferiu para v5.1; consolidado adota D2.
- **Naming agente bugfix-diagnostician:** D1 dizia `bugfix-diagnostic-agent`; D2 dizia `bugfix-diagnostician`; consolidado adota D2.

### 19.3 Reviewer Concerns residuais (D1:358–365)

Itens MEDIUM/LOW intencionalmente fora do escopo do v5.0:

- **Observabilidade live (Problema #3)** — endereçada parcialmente por TRACE.md *post hoc*. Visualização durante execução em v5.2 (Inspector).
- **Plugin update sobrescrevendo cache** — mitigado pelo TRACE.md morar no repo do usuário, fora de `~/.claude/plugins/cache/`.
- **Auto-discovery em `/help`** — verificar UX após release.
- **Migração assistida dos 12 .md para YAML** — manual em v5.0; ferramentas em v5.1 se necessário.

### 19.4 Review Metrics (D1:368–373)

- Iteração 1 do design original: 5/10 (baseline) → revisão substancial aplicada.
- Issues HIGH originais: 12. Endereçados: 12. Residuais: 0.
- Issues MEDIUM originais: 11. Endereçados: 7. Movidos pra Reviewer Concerns: 4.
- Issues LOW: 2. Endereçados: 2.
- Quality score esperado pós-iteração: 7–8/10.

### 19.5 What I noticed about how you think (D1:346–356)

Observações da sessão original preservadas para contexto autoral. Não afetam decisões técnicas. (Resumo: builder revisita o próprio trabalho com olho de fora; descreve caos próprio antes de fantasia; segue argumento sem casamento; escolhe persona difícil porque sabe que ela importa.)

### 19.6 What fica fora deste plano (D2:860–866)

- Detalhamento de Slice 5 — depende do gatilho pós-release.
- Distribution plan técnico em `docs/release-plan-v5.md` separado.
- Threat model formal — só se usuário corporativo aparecer.
- Inspector pré-execução — v5.2.
- Golden runs completas — Slice 4 é minimal disso; versão completa em v5.1.

---

## 20. Apêndice B — Cross-reference D1/D2/D3 → seções consolidadas

| Seção original | Linhas | Absorvida em |
|---|---|---|
| **D1** Problem Statement | 10–20 | §1 |
| **D1** What Makes This Cool | 22–32 | §2 |
| **D1** Constraints | 34–41 | §3 |
| **D1** Premises | 43–51 | §4 |
| **D1** Approaches Considered | 54–66 | §6.1 |
| **D1** Recommended Approach (alto nível) | 68–77 | §6.2 |
| **D1** Pré-requisitos P-1/P-2/P-3 | 79–94 | §12.3 (Slice 0) absorve P-2/P-3; P-1 schema vai pra Slice 5 |
| **D1** Componentes C-1..C-6 | 96–266 | §19.1 (OBSOLETO) |
| **D1** Effort Estimate (11–16 sem) | 256–272 | §0 (4.5–7.5 sem) + §19.2 (revertida) |
| **D1** Open Questions Q1–Q5 | 274–284 | §17.1 (todas decididas) |
| **D1** Success Criteria | 286–302 | §8 (DoD 7 critérios) |
| **D1** Distribution Plan | 304–312 | §18 |
| **D1** Security Model | 314–326 | §14 |
| **D1** Next Steps | 328–344 | §12 (sequência Slices) |
| **D1** What I noticed | 346–356 | §19.5 |
| **D1** Reviewer Concerns | 358–366 | §19.3 |
| **D1** Review Metrics | 368–373 | §19.4 |
| **D2** Definition of v5.0 Done (5 critérios) | 11–22 | §8 (5 originais + #6 D3 + #7 §15) |
| **D2** Cherry of the Cake | 25–34 | §7.4 |
| **D2** Metodologias TDD+BDD+DDD+AIDD | 37–45 | §7 (mencionado em invariantes), §12 (BDD em cada slice) |
| **D2** Invariantes (5) | 48–60 | §9 (5 + #6 D3) |
| **D2** Layer 1 — agentes domain-native | 64–101 | §7.1 |
| **D2** Layer 2 — pipeline shapes | 104–198 | §7.2 |
| **D2** Layer 3 — ai-dev-team cross-cutting | 202–232 | §7.3 |
| **D2** Light/Heavy & COMPLEXITY_GATE | 236–280 | §10 + §11.2 |
| **D2** Por que slices verticais | 284–293 | §12.1 |
| **D2** Slice 0 (spike) | 297–374 | §12.3 |
| **D2** Slice 1 (/bugfix) | 378–502 | §12.5 |
| **D2** Slice 2 (TRACE.md) | 506–616 | §12.6 |
| **D2** Slice 3 (/feature, /audit, /ux) | 620–682 | §12.7 |
| **D2** Slice 4 (compat suite) | 686–772 | §12.8 |
| **D2** Slice 5 (YAML interpreter) | 776–793 | §12.9 |
| **D2** Sequência recomendada | 795–826 | §12.2 |
| **D2** Como AIDD funciona | 830–844 | §7.4 e §12 (BDD specs) — mencionado contextual |
| **D2** Open Questions endereçadas | 850–856 | §17.1 |
| **D2** O que fica fora | 860–866 | §19.6 |
| **D2** Próximos passos imediatos | 870–882 | §18 + §12 |
| **D3** Por que existe / Posicionamento | 11–32 | §12.4 (Slice 0.5 introdução) |
| **D3** A1 CLAUDE.md raiz | 40–54 | §12.4.1 |
| **D3** A2 AGENTS.md raiz | 56–70 | §12.4.1 |
| **D3** A3 .claude/rules/ | 72–86 | §12.4.1 |
| **D3** B1 Critério #6 plan-mode | 88–94 | §8 (Critério #6) + §12.4.2 |
| **D3** B2 Invariante #6 paralelização | 98–102 | §9 (Invariante #6) + §12.4.2 |
| **D3** B3 Skill pipeline description | 104–116 | §12.4.2 |
| **D3** B4 Skill non-invention-guard | 118–124 | §12.4.2 |
| **D3** C1 dispatch-guard adversarial | 130–148 | §12.4.3 + §14.2 |
| **D3** C2 force-pipeline-agents plan-mode | 150–156 | §12.4.3 |
| **D3** D1–D6 cosméticos & dívida | 158–201 | §12.4.4 (com correções de baseline) |
| **D3** Mudanças nos docs V5 existentes | 205–213 | §12.4 (Slice 0.5 escopo) |
| **D3** Sequência execução Slice 0.5 | 217–237 | §12.4.5 |
| **D3** Verificação Slice 0.5 | 241–256 | §12.4.6 |
| **D3** Open Questions residuais | 259–264 | §17.2 |
| **D3** Status | 268–275 | (não migra — meta-status do D3) |
| **NOVO §15** Bug arquitetural pipeline-controller | — | §15 (descoberto 2026-04-29, não em D1/D2/D3) |
| **NOVO §16** Erros de baseline | — | §16 (10 itens reconciliados contra repo real 2026-04-29) |

---

## 21. Slice 1.5 — Pulsar bugfix workflow import (NOVO 2026-05-01)

### 21.1 Origem e justificativa

Em 2026-05-01, durante validação do Slice 1 entregue (v4.2.0 + v4.3.0 + v4.3.1 — `/bugfix` thin entry-point), o dono apontou que o trabalho não seguiu dois modelos prescritivos detalhados que já existiam em `D:\Projeto Pulsar\.claude\commands\Prompts\Bug_fix\heavy\` (11 passos) e `\light\` (8 passos). Esses modelos contêm prompts prescritivos cobrindo o ciclo completo de bug fix — diagnóstico, root cause, modelagem de invariantes, mudança controlada, TDD, sanity, adversarial review, UX journey, Pa de Cal, validação final.

Auditoria pós Slice 1: **6 dos 19 passos têm gap real no plugin** (3 ausentes, 3 parciais):

| Passo Pulsar | Plugin v4.3.1 | Status |
|---|---|---|
| Heavy 3: Domain Truth Model | sem agent ou prompt | 🔴 AUSENTE |
| Heavy 9: UX User Journey E2E pós-fix | `ux-simulator` cobre type "UX Sim", não step pós-bug | 🟡 PARCIAL |
| Heavy 11: Final Validation Post-After-All | não modelado como step distinto | 🔴 AUSENTE |
| Light 3: Impact Check (invariantes ANTES) | `information-gate` parcial | 🟡 PARCIAL |
| Light 5: promover RED→regression explicitamente | promoção não modelada | 🟡 PARCIAL |
| Light 6: Persistence Quick Check | sem agent | 🔴 AUSENTE |

### 21.2 Decisão de design (após brainstorm 2026-05-01)

**Approach A (markdown prescritivo) + Approach C (execução híbrida seletiva)** — ambos endossados pela doc oficial de Claude Code 2026 (skills page + sub-agents page).

#### 21.2.1 Localização e formato (Approach A)

Per doc oficial: *"Create a skill when you keep pasting the same playbook, checklist, or **multi-step procedure** into chat"* + *"Skills can include multiple files in their directory ... templates for Claude to fill in, example outputs ... or detailed reference documentation"* + *"Keep `SKILL.md` under 500 lines. Move detailed reference material to separate files."*

```
skills/
├── bugfix-light/                  # SIMPLES/MEDIA — 8 steps
│   ├── SKILL.md                   # overview + navigation, <500 linhas
│   ├── steps/
│   │   ├── 01-understand-behavior.md
│   │   ├── 02-simple-bug-analysis.md      # RED test
│   │   ├── 03-impact-check.md             # GAP FECHADO
│   │   ├── 04-point-fix.md
│   │   ├── 05-post-fix-validation.md      # GAP FECHADO (RED→regression)
│   │   ├── 06-persistence-quick-check.md  # GAP FECHADO (novo)
│   │   ├── 07-complexity-gate.md
│   │   └── 08-pa-de-cal.md
│   └── tests/tests-bugfix-light.md
└── bugfix-heavy/                  # COMPLEXA — 11 steps
    ├── SKILL.md                   # overview + navigation, <500 linhas
    ├── steps/
    │   ├── 01-terrain-recon-diagnostic.md
    │   ├── 02-root-cause-consolidation.md
    │   ├── 03-domain-truth-model.md       # GAP FECHADO (novo)
    │   ├── 04-controlled-change-proposal.md  # AskUserQuestion gate
    │   ├── 05-test-pre-impl.md
    │   ├── 06-execute-minimal-diff.md
    │   ├── 07-post-change-sanity-regression.md
    │   ├── 08-adversarial-ux-tech-review.md  # AskUserQuestion gate
    │   ├── 09-ux-user-journey-e2e.md      # GAP FECHADO (parcial→completo)
    │   ├── 10-pa-de-cal.md                # AskUserQuestion gate (GO/NO-GO)
    │   └── 11-final-validation-after-all.md  # GAP FECHADO (novo step)
    └── tests/tests-bugfix-heavy.md
```

**Total novo:** 2 skills + 19 steps + 2 tests = 23 supporting files.

#### 21.2.2 Entry-points (4 modos de invocação)

| Comando | Comportamento |
|---|---|
| `/pipeline-orchestrator:bugfix [task]` | Auto-classifica via `task-orchestrator` → AskUserQuestion gate de aprovação → carrega `bugfix-light` ou `bugfix-heavy` skill |
| `/pipeline-orchestrator:bugfix --light [task]` | Força light, sem auto-classify |
| `/pipeline-orchestrator:bugfix --heavy [task]` | Força heavy, sem auto-classify |
| `/pipeline-orchestrator:bugfix-light [task]` | Atalho direto para a skill light (sem passar pelo `/bugfix`) |
| `/pipeline-orchestrator:bugfix-heavy [task]` | Atalho direto para a skill heavy |

Plus retrocompat: `/pipeline-orchestrator:pipeline [task]` ganha flags `--light`/`--heavy` análogas a `--simples/--media/--complexa` existentes.

#### 21.2.3 Padrão de execução (Approach C — híbrido seletivo)

Cada step declara seu `execution_mode` no frontmatter. Mapeamento canônico:

**Bugfix Heavy:**
| # | Step | Mode | Agent type (se subagent) |
|---|------|------|--------------------------|
| 1 | Terrain Recon | `subagent` | `bugfix-diagnostic-agent` |
| 2 | Root Cause | `subagent` | `bugfix-root-cause-analyzer` |
| 3 | Domain Truth Model | `subagent` | `Explore` (built-in) |
| 4 | Controlled Change Proposal | `inline` | — (AskUserQuestion gate) |
| 5 | TDD Pre-Impl | `inline` | — |
| 6 | Execute Minimal Diff | `inline` | — |
| 7 | Sanity + Regression | `subagent` | `general-purpose` (Bash heavy) |
| 8 | Adversarial Review | `subagent` × 3 paralelos | `adversarial-{security,architecture,quality}-scanner` (existentes, zero-context) |
| 9 | UX Journey E2E | `subagent` | `ux-simulator` (existente) |
| 10 | Pa de Cal | `inline` | — (AskUserQuestion gate) |
| 11 | Final Validation | `subagent` | `general-purpose` (read-only) |

**Bugfix Light** (mais inline porque steps são menores):
| # | Step | Mode |
|---|------|------|
| 1-3 | Understand / Analysis / Impact | inline |
| 4 | Point Fix | inline |
| 5 | Post-Fix Validation | subagent (validation) |
| 6 | Persistence Quick Check | subagent |
| 7-8 | Complexity Gate / Pa de Cal | inline |

#### 21.2.4 Os 3 agents existentes (decisão)

`bugfix-diagnostic-agent`, `bugfix-root-cause-analyzer`, `bugfix-regression-tester` — **mantidos + referenciados pelos steps** quando faz sentido. Zero quebra de retrocompat para quem invoca os agents diretamente. O playbook prescritivo dos 11/8 passos vive na **skill** (per doc oficial); os agents continuam como workers especializados invocáveis pela skill quando o passo precisar.

### 21.3 Regras de execução (enforcement determinístico — 8 regras não-negociáveis)

Per requisito explícito do dono: *"regras de execucao que funcionem, e que nao permitam ao agente fazer o que ele quer"*. As 8 regras abaixo formam o **contrato de execução** das skills `bugfix-{heavy,light}`:

| # | Regra | Mecanismo | Falha → ação |
|---|-------|-----------|--------------|
| 1 | **Sequência rígida** — steps executam em ordem (1→2→...→N), sem skip, sem reorder | `SKILL.md` declara `sequence:` + `sequence_lock: true`; sentinel-hook valida `expected_next` em cada Agent spawn | Block + sentinel deny |
| 2 | **Execution mode bloqueado** — cada step declara `execution_mode` no frontmatter; Claude **NÃO PODE** trocar inline ↔ subagent | dispatch-guard hook valida modo declarado vs spawn real | Block + audit log |
| 3 | **Agent type whitelist** — quando `execution_mode: subagent`, o step declara `agent_type:` específico; Claude só pode spawnar EXATAMENTE esse agent | dispatch-guard hook (existente v4) com whitelist por step | Block + sentinel deny |
| 4 | **Output schema validado** — cada step declara `expected_outputs:` (estrutura YAML); próximo step valida que recebeu antes de prosseguir | Schema check no header de cada step.md (fail-closed) | STOP step + report |
| 5 | **AskUserQuestion gates obrigatórios** — pontos de decisão (Heavy steps 4, 8, 10; Light steps 7, 8) — nunca skipados, nunca substituídos por prosa | Step.md declara `gate_required: true`; SKILL.md força invocação | Block + audit log |
| 6 | **STOP RULE** — 2 falhas consecutivas (build, test, validation) param o pipeline | sanity-checker + checkpoint-validator (existentes v4) registram contagem; SKILL.md força stop | STOP + escalate to user |
| 7 | **Audit log append-only** — toda decisão (gate, AskUserQuestion, step transition, STOP) é registrada em `.pipeline/gate-decisions.jsonl` | Mecanismo já existe v4; SKILL.md força uso explícito | Auditável post-hoc |
| 8 | **Sentinel checkpoints** em transições críticas (Heavy: pré-step-4, pré-step-8, pré-step-10; Light: pré-step-7) — fora delas, sentinel bloqueia | sentinel-hook (existente v4) com checkpoints declarados na SKILL.md | Block + sentinel verdict |

### 21.4 Frontmatter contrato canônico

**`SKILL.md` (skills/bugfix-{light,heavy}/SKILL.md):**
```yaml
---
name: bugfix-light                # ou bugfix-heavy
description: <prescriptive workflow description, <1536 chars>
disable-model-invocation: true    # manual-only invocation
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion]
argument-hint: [bug description with repro details]
sequence: [1, 2, 3, 4, 5, 6, 7, 8]              # imutável
sequence_lock: true                              # impede reorder/skip
gates_at: [7, 8]                                # ou [4, 8, 10] for heavy
sentinel_checkpoints: [pre_7]                   # ou [pre_4, pre_8, pre_10]
stop_rule_max_failures: 2
---
```

**`steps/0X-*.md`:**
```yaml
---
step_number: 7
step_name: "post-change-sanity-regression"
execution_mode: subagent          # ou "inline" — IMUTÁVEL
agent_type: "general-purpose"     # whitelist; só se subagent
expected_inputs:
  - root_cause_hypothesis: from_step_2
  - fix_diff: from_step_6
expected_outputs:
  - test_results: { passed: int, failed: int, regression_introduced: bool }
expected_next: 8
gate_required: false
allowed_tools: [Bash, Read]
---
[prescriptive step content imported/adapted from Pulsar]
```

### 21.5 Migration plan (target: v4.4.0 minor release)

1. **Criar** `skills/bugfix-{heavy,light}/SKILL.md` + steps + tests (23 arquivos novos)
2. **Atualizar** `skills/bugfix/SKILL.md` — detectar flags `--light`/`--heavy` + delegar à skill backing
3. **Atualizar** `agents/core/pipeline-controller.md` — Step 1 IDENTIFY EXECUTION MODE aceitar variant override
4. **Atualizar** `agents/core/task-orchestrator.md` Step 1a — aceitar `force_variant` análogo a `force_type` (Slice 1)
5. **Atualizar** `commands/pipeline.md` — adicionar flags `--light`/`--heavy` na tabela de modes
6. **Atualizar** `references/pipelines/bugfix-{light,heavy}.md` — apontar pra skills novas
7. **Propagar para docs de spec** (instrução do dono "alterar todos os arquivos da spec para adequacao"):
   - `CLAUDE.md` raiz: bump versão, mencionar 2 novas skills
   - `AGENTS.md`: adicionar 2 entries no roster
   - `designs/slice-0/INVENTORY.md`: marcar §3 Slice 1.5 como done quando entregue
   - **ESTE arquivo (consolidated.md)**: §0 metadata bump + §12.2 sequência atualiza com Slice 1.5
   - `CHANGELOG.md`: entry 4.4.0 detalhada
8. **Bump** `plugin.json`/`marketplace.json`/`hooks/hooks.json` SessionStart prompt → v4.4.0
9. **Tests** — 23 arquivos novos + smoke test do enforcement (sequence_lock, execution_mode lock, gate enforcement)
10. **Release flow padrão**: commit temático, push main, tag v4.4.0, cache update

### 21.6 Backward compatibility

- ✅ `/pipeline-orchestrator:bugfix [task]` continua funcionando idêntico (auto-classifica + carrega skill apropriada — usuário não nota diferença)
- ✅ `/pipeline-orchestrator:pipeline [task]` continua idêntico; flags `--light/--heavy` são aditivas
- ✅ 3 agents type-specific bugfix-* permanecem invocáveis isoladamente (CC pattern: agent.md ainda gera `pipeline-orchestrator:executor:type-specific:bugfix-*` namespace)
- ✅ `references/pipelines/bugfix-*.md` continuam acessíveis (apenas atualizam a apontar pra skills)

### 21.7 Riscos identificados

| Risco | Severidade | Mitigação |
|---|---|---|
| Conflito de merge com Slice 2 (TRACE.md generator pendente) | Média | TRACE.md vai precisar registrar transições de step da skill — coordenar contrato de evento |
| Conflito de merge com Slice 3 (4 entry-points restantes) | Baixa | Padrão estabelecido aqui (skill + steps + enforcement rules) é diretamente reutilizável pra `/feature`, `/userstory`, `/audit`, `/ux` |
| Hook `dispatch-guard` precisa estender whitelist por step | Média | Patch determinístico; lógica de leitura do `agent_type` no step.md frontmatter |
| Performance — heavy executa 11 steps, alguns com subagent spawn | Baixa | Doc oficial endossa o pattern; subagents preservam contexto principal |
| ARCH-2 (trust boundary do `PRE_CLASSIFIED_TYPE` prefix — Slice 1) ainda em aberto | Média | Endereçar junto com Slice 3; mover de string-prefix pra Agent.metadata field |

### 21.8 Critérios de done (DoD do Slice 1.5)

- [ ] 23 arquivos novos criados (2 SKILL.md + 19 steps + 2 tests)
- [ ] 6 arquivos existentes atualizados (skills/bugfix/SKILL.md, pipeline-controller, task-orchestrator, commands/pipeline.md, 2 references/pipelines/bugfix-*.md)
- [ ] 5 docs de spec atualizados (CLAUDE.md, AGENTS.md, INVENTORY.md, ESTE consolidated.md §0+§12, CHANGELOG.md)
- [ ] Os 6 gaps mapeados em §21.1 estão fechados (Heavy 3, 9, 11 + Light 3, 5, 6)
- [ ] As 8 regras de enforcement (§21.3) declarativas em frontmatter de cada step + SKILL.md
- [ ] Smoke test: invocar `/pipeline-orchestrator:bugfix-light test` e `/pipeline-orchestrator:bugfix-heavy test` numa fixture confirma execução determinística (sem skip, sem reorder, AskUserQuestion gates dispararam)
- [ ] Release: tag v4.4.0 + cache update + marketplace.json com v4.4.0
- [ ] Backward compat verificada: `/pipeline-orchestrator:bugfix existing-task-format` ainda funciona

### 21.9 Próximos passos

1. **Imediato (este advisor flow):** transição pra `/superpowers:writing-plans` (Step 9 do checklist do brainstorming) que vai gerar a spec executável (já temos o design — falta o plano de execução com tasks e ordering)
2. **Slice 1.5 execution:** invocar `/superpowers:executing-plans` (após writing-plans) com a spec em mãos
3. **Slice 1.5 verification:** invocar `/superpowers:verification-before-completion` ao final
4. **Pós-Slice 1.5:** Slice 2 (TRACE.md) ou Slice 3 (`/feature`, `/userstory`, `/audit`, `/ux` — reusam o padrão estabelecido aqui)

---

## 22. Slice 3a — Pulsar audit workflow import (NOVO 2026-05-02)

### 22.1 Origem e justificativa

Slice 3 (§12.7) compromete `/feature`, `/audit`, `/ux` num único entregável. O usuário pediu a **portabilidade isolada do workflow de audit** primeiro — mesma operação que Slice 1.5 fez pra bugfix. Esta seção (§22) documenta o sub-slice **3a** que entrega especificamente a porção de audit, mantendo Slice 3 (resto) pendente para feature/userstory/ux.

A spec do Pipeline-Orchestrator já tinha as 4 peças necessárias:

- `agents/executor/type-specific/audit-{intake,domain-analyzer,compliance-checker,risk-matrix-generator}.md` — 4 agentes domain-native, todos read-only, IRON LAW enforced.
- `references/pipelines/audit-heavy.md` + `audit-light.md` — team-composition references com 9-step Pulsar flow + Pa de Cal.
- §7.2.2 — design da forma do pipeline (9 passos forenses, "Light = Heavy em estrutura").
- Pulsar source canônica em `D:\Projeto Pulsar\.claude\commands\Prompts\Audtiroria\` — Heavy 9 steps + Light 9 steps + manifests + TESTS.

O que faltava era o **wrapper executável**: SKILL.md com sequence_lock + step files com frontmatter contrato + thin entry-point. Slice 3a entrega isso.

### 22.2 Decisão de design

Reusa **literalmente** o template provado em Slice 1.5 (§21), aplicado aos 9 passos da Pulsar:

- **3 skills criados:** `skills/audit/` (thin entry-point com `--light`/`--heavy` flags), `skills/audit-light/` (9 steps + tests), `skills/audit-heavy/` (9 steps + tests).
- **Ownership mapping confirmado:** step 1 = `audit-intake`; steps 2–4 = `audit-domain-analyzer` (Heavy) ou `audit-compliance-checker` light_mode (Light); steps 5–8 = `audit-compliance-checker`; step 9 = `audit-risk-matrix-generator`.
- **Iron-Law extension:** invariante 9 ("Read-only enforcement") declarada no manifest via `report_only: true` e em cada step via `production_writes_allowed: false`. `edit-guard-hook.cjs` enforça.
- **Gates:** Heavy + Light = 2 gates AskUserQuestion cada. Step 1 (scope approval) e step 9 (Pa de Cal). Light step 9 tem 4ª opção `ESCALATE-TO-HEAVY` quando triggers detectam scope insuficiente.
- **Sentinel checkpoints:** Heavy = `[pre_1, pre_5, pre_9]` (mid-pipeline coherence em data layer). Light = `[pre_1, pre_9]` (cap reduzido).

### 22.3 Forma do pipeline — 9 passos canônicos

Heavy (cobertura completa) e Light (1 área / 1 nível) compartilham a mesma sequência semântica:

| # | Heavy | Light | Output Heavy | Output Light |
|---|-------|-------|--------------|--------------|
| 1 | Intake + Spec + Inventory | Initial Read + Project Map | `AuditIntake` | `AuditSnapshot` |
| 2 | Architecture + Boundaries + Dependencies | Architecture + Organization + Responsibilities | `DependencyImpactAudit` | `ArchitectureAudit` |
| 3 | Domain + Rules + SSOT + Decisions | Domain + Rules + SSOT | `DecisionSSOTAudit` | `DomainSSOTAudit` |
| 4 | Contracts + APIs + Endpoints + Validations | APIs + Endpoints + Contracts | `ContractGovernanceAudit` | `ContractAudit` |
| 5 | Data + Migrations + Integrity + Security | Data + Persistence + Migrations | `DataGovernanceAudit` | `DataAudit` |
| 6 | Frontend + State + A11y + PWA | Frontend Quality + State + UI | `FrontendDeepAudit` | `FrontendAudit` |
| 7 | Backend + Errors + Auth + Observability | Backend Services + Security | `BackendDeepAudit` | `BackendAudit` |
| 8 | Governance + Tests + CI/CD + Docs | Tests + Observability + Performance | `DeliveryGovernanceAudit` | `QualityOpsAudit` |
| 9 | Pá de Cal + Risk Matrix | Pá de Cal + Conclusion + Plan | `AuditMasterSeal` | `AuditFinalSeal` |

### 22.4 Regras de execução (8 regras + Iron Law)

Mesmas 8 regras de Slice 1.5 (§21.3) + invariante 9 específico de audit (read-only). Frontmatter contrato + dispatch-guard + sentinel-hook + edit-guard-hook validam tudo deterministicamente em runtime.

### 22.5 Migration plan

Target: **v4.5.0** (minor release, retro-compatível). Lineage: v4.4.1 → v4.5.0.

1. Files criados/atualizados:
   - `skills/audit/SKILL.md` (thin entry-point, ~60 linhas).
   - `skills/audit-heavy/SKILL.md` + `steps/01..09.md` + `tests/tests-audit-heavy.md`.
   - `skills/audit-light/SKILL.md` + `steps/01..09.md` + `tests/tests-audit-light.md`.
   - `references/glossary/audit.md` (NOVO — domain glossary).
   - `references/pipelines/audit-heavy.md` + `audit-light.md` (header pointer "As of v4.5.0").
   - `designs/pipeline-orchestrator-v5-consolidated.md` (esta §22 + §0 metadata + §12.2 sequência).
2. Hooks: NENHUM hook precisou ser criado ou modificado. Os 4 hooks existentes (`dispatch-guard`, `sentinel-hook`, `edit-guard-hook`, `force-pipeline-agents`) cobrem o novo skill via contrato declarativo.
3. Agents: NENHUM agente precisou ser criado. Os 4 audit agents já existiam desde antes do Slice 1.

### 22.6 Backward compatibility

Aditivo: nenhum comportamento existente alterado. `/pipeline-orchestrator:audit` é novo entry-point manual; auto-classify via `/pipeline-orchestrator:pipeline` continua igual e agora pode rotear para `audit-{light,heavy}` via pipeline_variant.

### 22.7 Critérios de conclusão — 9/10 (1 smoke test em débito reconhecido)

- [x] `skills/audit/SKILL.md` criado com thin wrapper + variant flag handling.
- [x] `skills/audit-heavy/` completo (SKILL.md + 9 step files + tests).
- [x] `skills/audit-light/` completo (SKILL.md + 9 step files + tests).
- [x] `references/glossary/audit.md` criado.
- [x] `references/pipelines/audit-{heavy,light}.md` atualizados com header pointer.
- [x] §22 desta spec preenchida; §0 metadata bumpada; §12.2 sequência marca Slice 3a 🟢.
- [x] `plugin.json` bumpado para v4.5.0 [VERIFICADO 2026-05-03 — `version: "4.5.0"` confirmado].
- [x] `hooks/hooks.json` SessionStart prompt atualizado [VERIFICADO 2026-05-03 — prompt diz "Pipeline Orchestrator v4.5.0 loaded" e referencia `/audit`/`audit-light`/`audit-heavy` + Slice 3a].
- [x] `CHANGELOG.md` atualizado [VERIFICADO 2026-05-03 — entry `[4.5.0] - 2026-05-02` presente com seções Added/Changed completas].
- [ ] **Smoke test PENDENTE:** invocar `/pipeline-orchestrator:audit-light test-fixture` e `/pipeline-orchestrator:audit-heavy test-fixture` para confirmar execução determinística. **Estado em 2026-05-03:** `tests/manual-validation-log.md` ainda mostra `_(first run pending)_`. **Débito reconhecido:** v4.5.0 foi tagueada antes deste smoke test rodar — registrado retroativamente. Próxima ação: rodar ambas as variantes contra fixture e popular log.

**Status DoD §22.7 em 2026-05-03:** 9/10 itens concluídos (smoke test único pendente). Reconciliação retroativa feita após governance audit do design v5 detectar que checkboxes não refletiam estado real (3 itens estavam feitos mas marcados [ ]).

### 22.8 Próximos passos

1. **Pós-Slice 3a:** Slice 2 (TRACE.md) ou Slice 3 (resto) — `/feature`, `/userstory`, `/ux` reusam o mesmo padrão estabelecido aqui e em Slice 1.5.
2. **Slice 3 (resto):** 3 commands restantes (feature, userstory, ux) seguem template idêntico — ~0,5 semana cada com playbook Pulsar disponível.

---

## 23. Slice 3b — Pulsar feature workflow import (NOVO 2026-05-03)

### 23.1 Origem e justificativa

Igual a Slice 1.5 (bugfix) e Slice 3a (audit) — port do workflow Pulsar (`D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\`) com 13 steps Heavy + 13 Light. **Único entre os 3 ports: usa pattern single-skill-com-mode-flag** em vez de 2 skills separadas. Origem da decisão: bugfix-heavy adversarial review 2026-05-03 (3 reviewers paralelos) cravou que Pulsar Light é estruturalmente igual a Heavy (13=13 passos), só diferindo em verbosidade de prompt. Spec mapping: `docs/superpowers/specs/2026-05-03-feature-pulsar-import-mapping.md` (v2 pós-bugfix com 0 decisões pendentes).

### 23.2 Decisão de design (CORRIGIDA em v4.6.1)

**v4.6.0 inicial (REVERTIDO):** propunha single skill `feature` com mode flag (`mode: heavy|light`). Justificativa era reduzir file count (1 skill com 13 step files vs 2 skills com 13 cada). Aprovado via AskUserQuestion mas o "Recomendado" foi influência do agent — não validade neutra. Dono apontou após review: fonte canônica Pulsar tem 2 pastas separadas (`Heavy/` + `Ligth/`), port deve espelhar 1:1 igual Slice 1.5/3a.

**v4.6.1 corrigido (vigente):**

- **2 skills separadas** (padrão igual a Slice 1.5/3a):
  - `skills/feature-light/` — SKILL.md + 13 step files (`steps/01..13-*.md`) + tests = 15 arquivos
  - `skills/feature-heavy/` — SKILL.md + 13 step files + tests = 15 arquivos
  - Total: **30 arquivos novos** (era 16 na unificação errada)
- **Cada step file é cópia LITERAL** do arquivo Pulsar correspondente + frontmatter mínimo (`step_number`, `step_name`, `source`). Sem mode flag, sem GATE sections inventadas, sem parametrização TDD — espelhamento 1:1.
- **Pré-check Pulsar** (`HEAVY_A_*` + `Avaliacao-pre-melhoria-ligth.md`) NÃO incluído nas skills. Pode ser absorvido por Phase 0 do pipeline (info-gate + design-interrogator) quando relevante.
- **Hooks ADVISORY:** mantido (ver §17.4 #8). Sem mudança.
- **Agentes reusados:** se controller dispatcha agentes para steps específicos, mantém os 5 existentes (`feature-vertical-slice-planner`, `feature-implementer`, `feature-integration-validator`, `pre-tester`, `quality-gate-router`). Mas SKILL.md NÃO declara ownership por step — fica a cargo do controller decidir runtime.

### 23.3 Forma do pipeline — 13 passos canônicos

Per spec mapping §3 — Heavy = Light em estrutura (mode flag controla verbosidade):

| # | Step | Output Heavy | Output Light |
|---|---|---|---|
| 1 | Intent + Value + Scope | `IntentDoc` completo | `IntentDoc` mínimo |
| 2 | Terrain Recon | mapa detalhado | mapa rápido |
| 3 | User Flow + UX **[GATE]** | matriz cenários completa | top-3 cenários |
| 4 | Domain Rules | regras + property tests | regras + 1 unit test |
| 5 | Source of Truth | SSOT mapping completo | SSOT inline |
| 6 | Data Model + Persistence | schema + migration tests | schema + integration test |
| 7 | Architecture Design Options **[GATE]** | 3 opções + trade-offs | 2 opções |
| 8 | Risk Controls | risk register completo | top risks |
| 9 | Implementation Plan **[GATE; SKIP se Phase 1.5]** | plan completo | plan mínimo |
| 10 | TDD Pre-Impl (RED) **[GATE]** | full coverage | 1 main + 1 regression + 1 edge |
| 11 | Execution Minimal Diff (GREEN) | código completo | código mínimo |
| 12 | Testing Validation | suite completa | unit + integration |
| 13 | Release + Observability | release notes + monitoring | release notes mínimo |

### 23.4 Regras de execução

Mesmas 8 regras herdadas de Slice 1.5 (§21.3) — sequence_lock, execution_mode, agent_type whitelist, output schema, AskUserQuestion gates, STOP RULE, audit log, sentinel checkpoints. Hooks são ADVISORY (não enforcement) — controller respeita o contrato.

### 23.5 Migration plan

Target: **v4.6.0** (minor release). Lineage: v4.5.0 → v4.6.0.

1. Files criados: `skills/feature/SKILL.md`, 13 `steps/*.md`, `tests/tests-feature.md`, `references/pipelines/feature.md`.
2. Files modificados: `commands/pipeline.md` (--variant=feature + --mode flag), `agents/core/task-orchestrator.md` (FORCE_VARIANT), `references/pipelines/implement-{heavy,light}.md` (DEPRECATED redirects), `CLAUDE.md`, `AGENTS.md`, `CHANGELOG.md`, `plugin.json`, `hooks/hooks.json`.
3. Hooks: NENHUM modificado (ADVISORY model — ver §17.4 #8).
4. Agents: NENHUM novo criado.

### 23.6 Backward compatibility

- ✅ `/pipeline-orchestrator:pipeline [task]` continua funcionando idêntico (auto-classify roteia para variant correto).
- ✅ `/pipeline-orchestrator:feature [task]` é novo entry-point manual (Slice 3b).
- ✅ `references/pipelines/implement-{heavy,light}.md` continuam acessíveis com deprecation header (redirect).
- ✅ Slice 1.5 (bugfix) e Slice 3a (audit) sem mudança.

### 23.7 Critérios de done (DoD do Slice 3b POLIDO v4.7.0)

**v4.6.1 baseline (estrutural):**

- [x] `skills/feature-light/SKILL.md` + 13 step files (cópia literal Pulsar Ligth/) + tests
- [x] `skills/feature-heavy/SKILL.md` + 13 step files (cópia literal Pulsar Heavy/) + tests
- [x] `skills/feature/` (unificação errada v4.6.0) REMOVIDO
- [x] `references/pipelines/feature.md` (single, errado) REMOVIDO; futuras references `feature-light.md` + `feature-heavy.md` quando precisarem
- [x] Plugin metadata bumpado 4.6.0 → 4.6.1 (plugin.json + hooks.json)
- [x] CLAUDE.md + AGENTS.md + CHANGELOG.md atualizados (CHANGELOG marca v4.6.0 como DEPRECATED)
- [x] §12.2 status table reflete v4.6.1 (depois v4.7.0)
- [x] §23 reescrito documentando reversão
- [x] §17.3 #12 estendido com lição capturada

**v4.7.0 polish (funcional):**

- [x] 26 step files com frontmatter contract completo (execution_mode + agent_type + expected_inputs/outputs/next + gate_required + allowed_tools); duplo frontmatter mergeado em single block; bodies dos prompts Pulsar INTOCADOS
- [x] `skills/feature-light/SKILL.md` + `skills/feature-heavy/SKILL.md` com manifest declarativo completo (sequence_lock + gates_at + sentinel_checkpoints + stop_rule_max_failures + ownership por step + gates listados + sentinel checkpoints listados)
- [x] `skills/feature/SKILL.md` CRIADO (thin entry-point com `--light`/`--heavy` flag handling, espelha audit/SKILL.md + bugfix/SKILL.md)
- [x] `tests/tests-feature-{light,heavy}.md` REESCRITOS de placeholder TESTS_USER_STORY para tests reais do skill workflow
- [x] `references/feature-user-story-guidelines.md` CRIADO absorvendo o conteúdo OLD dos tests files (merged Light + Heavy)
- [x] `references/pipelines/implement-{heavy,light}.md` deprecated headers corrigidos (apontavam para `feature.md` deletado)
- [x] `AGENTS.md` header corrigido (38 → 19 agents auditado)
- [x] `docs/superpowers/specs/...mapping.md` + `docs/superpowers/plans/...slice-3b.md` com correction headers explicando reversão v4.6.1 + polish v4.7.0
- [x] Plugin metadata bumpado 4.6.1 → 4.7.0
- [x] CHANGELOG entry [4.7.0] explicando os 11 fixes

### 23.7.1 Polish nota (v4.7.0)

A v4.6.1 corrigiu a estrutura de pastas (2 skills separadas espelhando Pulsar 1:1) mas deixou os skills funcionalmente incompletos: frontmatter mínimo nos SKILL.md, duplo frontmatter nos step files (gerado por concatenação automática durante o port inicial), tests files com conteúdo placeholder de TESTS_USER_STORY (que são guidelines de tradução de user story, não tests do skill workflow), e sem thin entry-point `/feature` (que existia em v4.6.0 mas foi deletado junto com a unificação errada).

**Lição capturada:** entrega "estrutura correta + frontmatter mínimo" não é equivalente a "skill funcional pronto para uso". Próximas portabilidades de fonte canônica devem incluir frontmatter contract completo + thin entry-point + tests reais como parte do scope inicial, não como polish posterior. Audit pós-correção é mecanismo válido para detectar esse gap, mas idealmente deveria estar no DoD original do Slice.

### 23.8 Próximos passos

1. **Pós-Slice 3b:** Slice 2 (TRACE.md) ou Slice 3c/3d (`/userstory`, `/ux` — provavelmente também single-skill-com-mode-flag se Pulsar source seguir mesmo pattern).
2. **Backport question:** considerar refactor de `audit-{light,heavy}` para single-skill-com-mode-flag (audit também é Light=Heavy=9). Slice 3e potencial.
3. **v5.0 final:** continua bloqueado por Slice 4 verde (§12.8.3).

---

## Status final
