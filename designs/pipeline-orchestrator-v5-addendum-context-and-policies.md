# Addendum V5: Context & Policies (Slice 0.5)

**Sub-documento de:** `pipeline-orchestrator-v5-pipeline-as-code.md`
**Complementa:** `pipeline-orchestrator-v5-execution-vertical-slices.md`
**Data:** 2026-04-29
**Status:** DRAFT — aguarda aprovação do dono
**Origem:** análise comparativa entre design V5 e auditoria 3-lente (plugin-validator + skill-reviewer + cc-context-auditor)

---

## Por que este addendum existe

O design V5 é estrutural (pipeline-as-code, 5 commands, TRACE.md, 9 agentes domain-native, composição emergente). Cobre arquitetura e fluxo de execução com profundidade. Mas três camadas adjacentes ficaram fora do escopo do design original — e foram reveladas por uma auditoria independente:

1. **Infraestrutura de contexto Claude Code do projeto** (CLAUDE.md, AGENTS.md, .claude/rules/) — sem isso, agentes que abrem o repo caem no contexto global do usuário e ignoram política específica.
2. **Enforcement mecânico das policies já implícitas** — V5 menciona "adversarial reviewer" e "cap de 5 invocações", mas não há hook bloqueando violações.
3. **Cosméticos e dívida técnica** que vieram à tona na revisão estrutural (color fora da paleta, campos `tools` vs `allowed-tools`, versões divergentes, órfãos em `.githubcopilot/knowledge-base/`).

Este addendum acrescenta um **Slice 0.5 — Context & Policies**, posicionado entre Slice 0 (spike de formato + agent-spec-template) e Slice 1 (/bugfix command). Razão: zero mudança de comportamento de runtime, mas prepara o terreno para os 5 Slices subsequentes lerem políticas auto-carregadas.

## Posicionamento na sequência de Slices

```
Slice 0     Spike formato + agent-spec-template.md     (2-3 dias)
Slice 0.5   Context & Policies (este addendum)         (2-3 dias)  ← NOVO
Slice 1     /bugfix command + 2 agentes domain-native  (1 sem)
Slice 2     TRACE.md (Run Record)                      (1 sem)
Slice 3     /feature, /audit, /ux + 5 agentes restantes (0.5-1 sem)
Slice 4     Compat regression suite                    (1.5-2 sem)
```

Slice 0.5 é low-risk, zero comportamento de runtime, paralelizável com Slice 0 se desejado. Adiciona ~2-3 dias ao range honesto da V5.0 (4-7 sem → 4.5-7.5 sem).

---

## Inventário do Slice 0.5 — 10 entregáveis

### Camada A — Contexto Claude Code (P0)

#### A1. `CLAUDE.md` raiz do projeto

**Por quê:** auditoria cc-context-auditor confirmou que repo não tem CLAUDE.md projeto-level. Agentes que abrem o repo caem no `~/.claude/CLAUDE.md` global.

**Conteúdo proposto** (≤200 linhas):

- Identidade do projeto: nome, propósito (caixa de vidro), persona alvo (arquiteto B2B senior).
- SSOT do design: apontar para `designs/pipeline-orchestrator-v5-pipeline-as-code.md` e `designs/pipeline-orchestrator-v5-execution-vertical-slices.md`.
- Política de edits: "todas as alterações nascem em `D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator`; cache `C:\.claude\plugins\cache` é runtime, NÃO mexer".
- Versão canônica: SSOT em `.claude-plugin/plugin.json`; README badge e CHANGELOG seguem.
- Invariantes resumidos (linguagem ubíqua, evidência cirúrgica, composição emergente caps, AIDD, outputs versionáveis) com link para `references/glossary/` e seção de invariantes do execution-vertical-slices.
- Política operacional: "edits via Agent tool durante execução de pipeline; nunca inline".
- Ponteiro para `MIGRATION-v4-to-v5.md` quando existir.

**Verificação:** abrir o repo num agente Claude novo, perguntar "qual é o source-of-truth do design v5?". Resposta deve apontar para `designs/`.

#### A2. `AGENTS.md` raiz com roster + namespacing

**Por quê:** os 38 agentes existentes + 9 novos domain-native (Layer 1) precisam de tabela top-level navegável. Hoje contagem está espalhada em `commands/pipeline.md`, `references/team-registry.md` e tabelas dos shapes.

**Conteúdo proposto:**

- Tabela única: `name | namespace fully-qualified | layer (1/2/3) | model | tools | pipeline owner | invocável emergentemente por`.
- Seção "Bounded Contexts" listando os 4 pipelines (bugfix, feature, audit, ux) com glossário curto cada (10-15 termos).
- Seção "Cross-Cutting" listando agentes Layer 3 (`adversarial-reviewer`, futuros `security-scanner`, `quality-gate`, `context-injector`).
- Convenção de nomenclatura (`<pipeline>-<role>`).
- Ponteiro para `references/agent-spec-template.md` (criado em Slice 0).

**Entrega:** versão inicial em Slice 0.5 cobre os 38 agentes existentes da V4. Slice 1 e Slice 3 atualizam à medida que agentes domain-native nascem.

**Verificação:** `grep -c "^|" AGENTS.md` (excluindo headers) deve igualar contagem real do `agents/**/*.md`.

#### A3. `.claude/rules/` com globs path-specific

**Por quê:** policies da V5 (linguagem ubíqua, evidência cirúrgica, caps de composição, adversarial zero-context, non-invention) vivem dispersas em 1100+ linhas de `commands/pipeline.md`. Claude Code suporta auto-load via `globs:` no frontmatter — feature subutilizada.

**Arquivos propostos:**

| Arquivo | Globs | Conteúdo (resumo) |
|---|---|---|
| `10-bounded-context.md` | `agents/**`, `skills/**` | Linguagem ubíqua por pipeline; tradução explícita logada no TRACE.md ao cruzar bounded contexts |
| `20-evidencia-cirurgica.md` | `agents/**` | Toda asserção precisa de `file:line:column` ou trecho ≤200 chars; sem evidência = não conta como output |
| `30-composicao-emergente-caps.md` | `agents/**` | Cap 2 níveis de aninhamento, 5 invocações emergentes por execução; cada invocação registrada no TRACE.md com motivo |
| `40-adversarial-zero-context.md` | `agents/executor/type-specific/adversarial-*.md` | Adversarial agents proibidos de ler `.pipeline-orchestrator/runs/<id>/artifacts/implementer-*.{json,md}` durante o mesmo run; enforcement por hook (ver C1) |
| `50-non-invention.md` | `**/*.md` | Antes de criar agent/skill/command novo, grepear se algo equivalente existe; documentar busca; rejeição se overlap >80% |

**Verificação:** abrir um arquivo em `agents/quality/`, confirmar que rules 10/20/30 são auto-carregadas pelo Claude Code.

### Camada B — Definition of Done expandida (P1)

#### B1. Critério #6 — plan-mode-enforcer

**Adição à Definition of v5.0 Done** (do execution-vertical-slices.md):

> **6. Tasks classificadas como MEDIA ou COMPLEXA acionam EnterPlanMode automaticamente antes de qualquer Edit/Write.** Bypass exige flag `--no-plan` explícita + entrada no TRACE.md justificando. Verificação: rodar `/pipeline-orchestrator:bugfix [task com domains_touched=2]` em fixture; confirmar que log mostra `EnterPlanMode` invocado antes da fase de implementation.

**Trigger:** classe ∈ {MEDIA, COMPLEXA}. Reusa `references/complexity-matrix.md` como SSOT (sem inventar métrica nova).

#### B2. Invariante #6 — Paralelização de dispatch

**Adição aos Invariantes Compartilhados** (do execution-vertical-slices.md):

> **6. Dispatch paralelo quando independente.** Agentes cujos inputs não dependem de outputs entre si DEVEM ser dispatchados via 1 chamada `Agent` múltipla (paralelo). Agentes com dependência ficam seriais. Decisão registrada no TRACE.md como `dispatch_mode: parallel|serial` por fase. Cap 5 dispatches paralelos simultâneos para evitar context explosion no main LLM.

#### B3. Skill `pipeline` description — exclusões explícitas

**Por quê:** skill-reviewer #1 — description "ANY task" faz roteador acionar em pedidos triviais. Com 5 commands em V5, ambiguidade aumenta.

**Mudança em `skills/pipeline/SKILL.md:3`:**

```yaml
description: |
  Use when task type is genuinely ambiguous and needs auto-classification.
  This skill activates ONLY via the `/pipeline-orchestrator:pipeline` slash command.
  Do NOT use for: single-file edits, doc-only changes, trivial typos, or when
  task fits clearly in /bugfix, /feature, /audit, /ux — those have specific commands.
```

#### B4. Skill `non-invention-guard`

**Novo arquivo:** `skills/non-invention-guard/SKILL.md`

**Description:** "Use ANTES de adicionar novo agent, skill ou command. Bloqueia adição se grep da codebase encontra agent/skill/command com overlap funcional ≥80%. Força documentação da busca."

**Mecanismo:** invocado pelo `pipeline-controller` em ponto único — antes de aprovar registro de novo agent na allow-list (que é feature da v5.0 conforme security model).

### Camada C — Enforcement mecânico (P0/P1)

#### C1. Estender `dispatch-guard.cjs` com adversarial zero-context

**Por quê:** rule 40 declara a política, mas sem hook bloqueando o Read, ela é confiada ao prompt do agent — frágil.

**Mudança em `.claude/hooks/dispatch-guard.cjs`:**

```js
// Pseudocódigo — implementação real em CommonJS
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

**Tests:** `__tests__/dispatch-guard-adversarial.test.cjs` cobrindo (a) bloqueio quando match, (b) permissão para outros agents, (c) permissão para Read em artifacts de runs diferentes.

#### C2. Estender `force-pipeline-agents.cjs` com plan-mode trigger

**Por quê:** B1 acima especifica EnterPlanMode automático para MEDIA+. Hook é o lugar natural para enforcement.

**Mudança:** quando `task-orchestrator` classifica MEDIA+ e fase atual é `implementation` (qualquer pipeline), hook intercepta primeiro Edit/Write se `EnterPlanMode` não foi chamado. Bypass via env var `PIPELINE_NO_PLAN=1` setada quando `--no-plan` é passado.

**Tests:** cobrir os 3 caminhos (auto-trigger, bypass com flag, sem effect em SIMPLES).

### Camada D — Cosméticos & Dívida (P2)

#### D1. Cores fora da paleta

5 agents com `color: orange`:
- `agents/executor/type-specific/audit-compliance-checker.md:5`
- `agents/executor/type-specific/audit-domain-analyzer.md:5`
- `agents/executor/type-specific/bugfix-diagnostic-agent.md:5`
- `agents/executor/type-specific/bugfix-root-cause-analyzer.md:5`
- `agents/executor/type-specific/ux-accessibility-auditor.md:5`

Trocar para `yellow` (mais próximo dentro da paleta padrão `blue/cyan/green/yellow/magenta/red`).

#### D2. Padronização `tools:` vs `allowed-tools:`

- `agents/core/sentinel.md:6` usa `allowed-tools:` (divergente).
- `agents/core/pipeline-controller.md:6` usa `tools:` (canônico).

Padronizar para `tools:` em todos os agents.

#### D3. Versões divergentes

- `.claude-plugin/plugin.json` declara `4.1.3`.
- `README.md` badge declara `4.1.2`.
- `commands/pipeline.md` cabeçalho declara `v3.8`.
- `skills/pipeline/SKILL.md` declara "v4 thin skill".

**Política:** `plugin.json` é SSOT da versão. Slice 0.5 NÃO bumpa para 5.0.0 (releaser do Slice 4 faz isso); apenas alinha 4.1.2/4.1.3 e v3.8/v4 para um número coerente da v4 atual.

#### D4. `autoDiscover: true` em plugin.json

Campo não-padrão. Confirmar com dono se algum loader proprietário consome; se não, remover.

#### D5. Arquivar `SKILL.v3-reference.md`

Mover `skills/pipeline/SKILL.v3-reference.md` → `docs/legacy/SKILL.v3-reference.md`. Auto-discover só carrega `SKILL.md`, mas movimento previne confusão futura.

#### D6. `.githubcopilot/knowledge-base/` órfãos

`00-index.md` referencia 14 docs (01-14, 30); só 00 e 30 existem. Decisão do dono:
- (a) podar `00-index.md` para refletir realidade.
- (b) criar os 12 docs faltantes.

Recomendação: (a) — falsa completude é pior que ausência declarada.

---

## Mudanças nos docs V5 existentes

Slice 0.5 NÃO reescreve os 1255 linhas existentes. Apenas adiciona dois pontos cirúrgicos:

1. **`pipeline-orchestrator-v5-execution-vertical-slices.md`** — adicionar Slice 0.5 entre Slice 0 e Slice 1 nas seções de inventário e timeline.
2. **`pipeline-orchestrator-v5-execution-vertical-slices.md` Definition of v5.0 Done** — adicionar critério #6 (plan-mode-enforcer).
3. **`pipeline-orchestrator-v5-execution-vertical-slices.md` Invariantes Compartilhados** — adicionar Invariante #6 (dispatch paralelo).

Nenhum item do design original é removido ou modificado em comportamento.

---

## Sequência de execução do Slice 0.5

Order otimizada para low-risk + reuso máximo:

| # | Entregável | Risco | Tempo | Depende |
|---|---|---|---|---|
| 1 | A1 CLAUDE.md raiz | nulo | 2h | — |
| 2 | A2 AGENTS.md raiz | nulo | 3h | inventário atual |
| 3 | A3 5 rules em .claude/rules/ | nulo | 4h | A1, A2 |
| 4 | D1+D2+D5 cosméticos consolidados | nulo | 1h | — |
| 5 | D3+D4 versões + autoDiscover | nulo | 1h | decisão D4 |
| 6 | D6 podar knowledge-base index | nulo | 30min | decisão D6 |
| 7 | B3 skill pipeline description | nulo | 30min | — |
| 8 | B4 skill non-invention-guard | baixo | 2h | — |
| 9 | B1+B2 atualizar Definition of Done + Invariantes | nulo | 1h | — |
| 10 | C1 dispatch-guard adversarial + tests | médio | 4h | A3 (rule 40) |
| 11 | C2 force-pipeline-agents plan-mode + tests | médio | 4h | B1 |

Total estimado: ~22h (~3 dias dono solo). Cabe no range honesto.

Cada entregável vira commit isolado para facilitar review e rollback.

---

## Verificação do Slice 0.5

Smoke tests após implementar tudo:

1. **Contexto carregado:** abrir o repo num agent Claude novo, fazer `/cc-toolkit:cc-audit`. Lacunas P0 do auditor original devem estar fechadas (CLAUDE.md presente, .claude/rules/ presente, AGENTS.md presente).
2. **Rules path-specific:** editar arquivo em `agents/quality/`, confirmar que rules 10/20/30 entram no contexto via globs.
3. **Hook adversarial:** spawnar agent `adversarial-security-scanner`, tentar Read em `.pipeline-orchestrator/runs/test-fixture/artifacts/implementer-1.json`. Hook bloqueia com mensagem de rule 40.
4. **Hook plan-mode:** rodar `/pipeline-orchestrator:bugfix [task MEDIA]` sem `--no-plan`; primeiro Edit deve ser precedido de EnterPlanMode automático.
5. **Cosméticos:** validator novo (`plugin-dev:plugin-validator`) não emite mais warnings sobre cor, tools field, ou SKILL.v3-reference.

Verificação cruzada:

- Rodar `cc-context-auditor` segunda vez — todas as lacunas P0 devem estar fechadas.
- Rodar `plugin-dev:plugin-validator` segunda vez — warnings cosméticos zerados.
- Rodar `plugin-dev:skill-reviewer` segunda vez — descriptions e gates precedentes endereçados.

---

## Open Questions (residuais — usuário decide)

1. **D4 — manter `autoDiscover: true` ou remover?** Inclinação: remover se nenhum loader proprietário consome; documentar caso contrário.
2. **D6 — podar knowledge-base ou completar?** Inclinação: podar (falsa completude é pior).
3. **Slice 0.5 paraleliza com Slice 0?** Possível, pois zero overlap de arquivos. Decisão do dono se quer paralelizar para encurtar timeline.
4. **MEMORY.md raiz — descartado mesmo?** Confirmação: TRACE.md per-run cobre. Sem MEMORY.md de projeto, decisões arquiteturais persistentes vivem nos próprios docs em `designs/` (apropriado).

---

## Status

DRAFT pronto para revisão do dono. Após aprovação:

1. Aplicar mudanças cirúrgicas em `pipeline-orchestrator-v5-execution-vertical-slices.md` (Slice 0.5 + Critério #6 + Invariante #6).
2. Iniciar execução do Slice 0.5 na ordem da tabela acima.
3. Cada entregável → commit isolado → push → PR (se já tiver fluxo de PR; senão, commits direct na feature branch).
