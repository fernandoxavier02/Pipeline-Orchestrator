# CLAUDE.md — Pipeline-Orchestrator (canonical)

## Estilo de comunicacao (vale neste projeto tambem)

Texto fluido em paragrafos curtos, linguagem do dia a dia, veredicto na primeira linha (deu certo, deu errado, ou inconclusivo, e por que), detalhe vindo em seguida. O usuario nao e programador; escreva como se conversasse com alguem inteligente que nao programa. Termo tecnico so entra se vier com uma explicacao curta logo em seguida, na primeira vez que aparece. Sem isso, troque por palavra comum.

Este projeto tem um agravante importante: o usuario costuma escutar as respostas no modo de voz, entao **o texto precisa soar bem em voz alta**, nao so ler bem na tela. Isso impoe restricoes especificas:

A narrativa nunca carrega caminho de arquivo, endereco da internet, hash de commit, identificador de versao, tag entre colchetes, sigla nao explicada, ou nome tecnico de gate. Se a explicacao precisa de algum desses, ele vai num bloco de comando agrupado no FINAL da resposta, separado da prosa. O leitor de voz pula blocos de comando naturalmente; ja paths e enderecos lidos letra por letra destroem a experiencia. Em vez de dizer "edite o arquivo tal ponto md", diga "edite o agente de planejamento". Em vez de "veja o link da issue", diga "abri uma issue para registrar isso" e ponha o endereco la no bloco de comandos no fim, se for mesmo necessario o usuario abrir.

Bullets, tabelas e cabecalhos sao para comparacao real ou inventario; quando 2-3 frases corridas resolvem, prefira prosa. Listas com marcadores fragmentam a leitura em voz; paragrafos curtos fluem. Tabela so com 3 ou mais colunas e uma decisao por linha; do contrario, vira ruido.

Completude continua exigida. Cortar nome de arquivo nao e cortar a explicacao do que aconteceu, por que importou e o que fazer agora. A resposta tem que entregar essas tres coisas independente do canal.

Modo tecnico completo (com paths, hashes, listas de gates pelos nomes exatos, citacoes de linha) so quando o usuario pedir explicitamente, com expressoes do tipo "me detalha", "modo verboso", "me mostra os arquivos". Fora isso, mesmo discussao de arquitetura e pipeline vai na narrativa em portugues comum.

**Marcacao visual para o canal da tela.** A leitura por voz ignora marcacao de markdown — negrito, italico, codigo entre crases tudo passa em branco no audio. Isso libera essas marcacoes para destacar o que importa na leitura visual sem poluir o audio. Use negrito para o veredito final (**deu certo**, **deu errado**, **inconclusivo**), codigo entre crases para resultados numericos e estados que merecem destaque (`42 de 42 verde`, `build ok`, `EXIT=0`), e italico com moderacao para enfase. Use com parcimonia: duas ou tres marcacoes por resposta resolvem; markdown empilhado vira ruido visual igual a prosa empilhada.

**Brevidade agressiva.** Tamanho ideal da resposta principal: **dois a tres paragrafos curtos**, no maximo. Se sobrar coisa pra dizer, vai pra um bloco de comandos no fim ou pra um follow-up. Resposta longa e falha de filtro — significa que voce nao decidiu o que cortar. O usuario pede mais detalhe se quiser; o padrao e enxuto. Em particular: nao repita o que ja foi dito, nao expanda o veredito em sinonimos, nao explique o que voce vai fazer antes de fazer (so faca e reporte).

A regra mestra inquebravel com as seis regras detalhadas, exemplos de antes/depois e teste de ouvido vive no CLAUDE.md global do usuario, secao "Estilo de Conversa com o Usuario". Aquele documento e a fonte unica; este aqui apenas reforca, com a observacao adicional de que neste projeto o piloto opera por voz com frequencia, entao o teste do ouvido nao e cosmético, e gate de qualidade.

---

## Identidade

**Nome:** Pipeline-Orchestrator (CC plugin para Claude Code)
**Propósito:** caixa de vidro multi-agente — todo trabalho não-trivial passa por triagem, planejamento, execução em batches com TDD e adversarial review, fechando com Pa de Cal e audit trail.
**Persona dos contributors:** arquitetos B2B sêniores. Plugin é OSS e shippado via marketplace; usuários incluem outros engenheiros, não consumidores finais.

## Source-of-Truth Layer Map

| Camada | SSOT | Notas |
|---|---|---|
| **Design v5** | `designs/pipeline-orchestrator-v5-consolidated.md` | 1796 linhas, sucessor único dos 3 docs em `designs/legacy/` |
| **Design v5 Slice 0** | `designs/slice-0/INVENTORY.md` + 4 SPIKEs | Reality-check pós-sync 4.1.3 — INVENTORY atualizado em 2026-04-30 (Slices 0+0.5+1 marcados como concluídos) |
| **Versão canônica** | `.claude-plugin/plugin.json` `"version"` | Atualmente: **7.1.1** (2026-05-21). Lineage: v4.2.x → v4.3.x → v4.4.x → v4.5.0 → v4.6.x → v4.7.0 → v4.8.0 → v4.9.x → v4.10.0 → v4.11.0 → v4.12.0 → v4.13.0 → v4.14.0 → v4.15.0 → v4.16.0 → v4.17.0 → **v5.0.0** (2026-05-06, first major) → v5.1.0 (brainstorm + Kiro skill clone) → v5.2.0-rc.1 (Achado #7 GATE_REQUEST/DISPATCH_REQUEST protocol) → v5.2.0-rc.2 (Achado #7 expanded to 5 SKILLs + brainstorm steps + 9 dispatch sites) → **v5.2.0** (2026-05-08, promoted from rc.2) → **v6.0.0** (2026-05-15, MAJOR — comprehensive audit + hardening: 12/12 CRITICAL findings resolved, 22/22 gates runtime tested, 3 new security libraries (HMAC signer + JSONL sanitizer + pipeline.local sandbox parser), 39 regression tests in tests/regression/v6.0.0/, audit reports in docs/audits/2026-05-15-ifrs16-deep-audit/, visual documentation in docs/diagrams/, STALE constants renamed to canonical names with deprecated aliases. Coverage 30% → 95%.) → v6.1.0 (2026-05-15, MINOR — ATDD/BDD/DDD workflow contracts: D5 non-spec Given/When/Then in quality-gate-router Step 1b, D6 BDD Gherkin per slice in feature-vertical-slice-planner Step 3b with flat naming, D7 DDD lightweight Bounded Contexts in plan-architect with SOFT BOUNDED_CONTEXT_MISSING event using canonical protocol-events.jsonl schema. 4 new regression tests in tests/regression/v6.1.0/.) → **v6.2.0 (2026-05-18, MINOR — clarification overhaul: step-01-explore reescrito como agente dinâmico de 4 fases substituindo template fixo de 7 perguntas (Phase A read-first project context; Phase B 11-lens gap inventory; Phase C one GATE_REQUEST per real gap with mandatory file:line evidence; Phase D record + telemetry). Novo step-01b-alternatives propõe 2-4 abordagens (Minimal/Pattern-aligned/Aggressive/Contrarian) com auto-skip para tarefas mecânicas. Drift fix em complexity-matrix.md (Has spec MEDIA: Optional → Required (auto-dispatch)). +5 gates + nova classe AUDIT hardness; registro 22 → 27. Brainstorm controller table 9 → 10 steps. Dogfood evidence em docs/audits/2026-05-18-clarification-overhaul-dogfood/ (real IFRS-16 scenario, 14 telemetry events, 4 anti-invention blockers surfaced).)** → **v6.3.0 (2026-05-19, MINOR — Implementation Discipline Layer: new SSOT `references/implementation-discipline.md` (scope control, minimal diff, SOLID/KISS/DRY/YAGNI, dep/config/contract/migration restrictions, test integrity, evidence, severity PASS/NEEDS_REDUCTION/REJECTED); CHANGE_CONTRACT inline em plan-architect.md (allowed/forbidden files, forbidden_change_types, diff_budget, bootstrap); SCOPE LOCK CHECK em executor-implementer-task.md (fires before every Write/Edit; Read free); novo agente `agents/quality/diff-discipline-reviewer.md` (tools=Read/Grep/Glob, static-only, max_fix_attempts=5 independente do ADVERSARIAL_BLOCK max=3); 3-way parallel em review-orchestrator (adversarial-batch + architecture-reviewer + diff-discipline-reviewer) com fix_loop_counters duais; architecture-reviewer +5 novos checks (abstraction-without-second-use, new-file-where-local-suffices, unnecessary-layer, unrelated-refactor, public-contract-drift); 7 regression tests novos (F8-F14) em tests/regression/v6.3.0/. **Invariantes preservadas:** 22-row Mandatory Gates by Complexity untouched (F1 intacto); 32-row Gate Registry untouched (F14 defense-in-depth). **Roster 19 → 20 agentes** com diff-discipline-reviewer. **Bootstrap exception** one-time: tasks T1-T3 de v6.3.0 rodaram sem enforcement runtime (mecanismo nascendo); T4+ enforced. Setting bootstrap.active=true em planos futuros é forbidden_change_type. Backward compat: plans pré-v6.3.0 sem CHANGE_CONTRACT skipam diff-discipline cleanly; v6.4.0 promoverá HARD.)** → **v7.0.0 (2026-05-19, MAJOR — LICENSE-ONLY: PolyForm Shield 1.0.0 (source-available com noncompete clause). Bloqueia revenda comercial + managed-service competidor; permite uso interno/pessoal/educacional/modificação/redistribuição. Nenhuma mudança de código vs v6.3.0; o bump MAJOR sinaliza license change per SemVer convention. Trademark: "Pipeline Orchestrator" + "FX Studio AI" reservados — forks devem renomear. NOTICE.md documenta atribuição obrigatória, proibição de falsificar autoria, e política de enforcement (DMCA, cease-and-desist, terminação de licença, ação civil). Marketplace + NPM canais inalterados, ambos sob Shield.)** → v7.1.0 (2026-05-19, MINOR — telemetry hygiene) → **v7.1.1 (2026-05-21, PATCH — docs only: enriches `docs/diagrams/pipeline-overview.html` with new "Fluxos detalhados ponta a ponta" section covering 7 workflows E2E (bugfix/audit/UX light+heavy + plan/brainstorm/hotfix/review-only), 12 inline SVG step diagrams (color-coded agents + gates), Thariq-style interactive layer (sticky TOC pills, light/heavy filter pills, per-flow review checkboxes with localStorage, Copy summary buttons, collapsible exemplo cards, 11-option response form with Save/Copy/Clear, live N/7 counter). 380 → 1498 lines net. ZERO runtime changes; 22-row Mandatory Gates + 27-row Registry preserved.)**. Marketplace lê este arquivo. |
| **Pipeline flow** | `commands/pipeline.md` (full classifier) + `commands/bugfix.md` (thin shortcut) | 1112 linhas no full + 40 no thin. **Inline Invariants** em `pipeline.md` sobrepõem Grep-loaded refs em caso de conflito |
| **Agent orchestrator** | `agents/core/pipeline-controller.md` | N1, dispatched pela skill, coordena 4 fases |
| **Gates** | `references/gates.md` | Hardness Taxonomy + 22-gate Registry |
| **Audit Trail** | `references/audit-trail.md` | Phase Transition Summary + JSONL log format |
| **Confidence** | `references/confidence.md` | Scoring schema (advisory) |
| **Sentinel** | `references/sentinel-integration.md` + `agents/core/sentinel.md` | 5 mandatory checkpoints |
| **Team roster** | `references/team-registry.md` | **20 agents reais** [VERIFICADO 2026-05-19, v6.3.0 added `diff-discipline-reviewer`] (`agents/**/*.md`). O número antigo "38" estava errado — vinha do D1 sem reality-check; corrigido em `designs/pipeline-orchestrator-v5-consolidated.md` §1.1 e §16 erro #4. `team-registry.md` pode ainda mostrar 38 — atualizar quando tocado. |

## Política de edits

🔴 **REGRA #1:** Todas as alterações nascem em `D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator` (este repo). 

🔴 **REGRA #2:** O cache `C:\.claude\plugins\cache\FX-studio-AI\pipeline-orchestrator\<version>\` é **runtime read-only** — NUNCA editar lá. Ele é populado pelo marketplace ao instalar/atualizar.

🟡 **HISTÓRICO:** Antes de 2026-04-30, releases 3.8.0 → 4.1.3 foram publicadas no marketplace SEM passar pelo git canonical (deriva de 97 commits). Em 2026-04-30, canonical foi sincronizado com cache 4.1.3 via 5 commits temáticos (`59e0984..c5c9477` em `feat/v5-addendum-context-policies`). Mesmo dia: Slice 0.5 + Slice 1 (`/bugfix` entry-point) entregues como v4.2.0 + patch v4.2.1 (SEC-1+SEC-2), seguidos de v4.3.0 (skill migration), v4.3.1 (review polish), v4.4.0 (Slice 1.5 Pulsar bugfix import) em 2026-05-01, v4.4.1 (exec-window wrapper) e v4.5.0 (Slice 3a Pulsar audit import) em 2026-05-02. Daqui em diante, **todo release passa pelo git** antes de virar marketplace package.

## Política operacional para Claude (este agent)

1. **Edits via Agent tool durante execução de pipeline.** Quando dentro do pipeline (skill `pipeline` ativada), o `pipeline-controller` é o N1 e dispatcha N2/N3. NUNCA editar inline durante execução.
2. **Edits diretos OK fora do pipeline.** Ad-hoc fixes, doc updates, design iteração — usar Edit/Write direto.
3. **Espelhamento Codex:** `.codex/hooks/force-pipeline-agents.cjs` deve seguir mudanças em `.claude/hooks/force-pipeline-agents.cjs` (manter espelho funcional).
4. **Untracked locais:** `.kiro/`, `.pipeline/` são working-state — NUNCA commitar.
5. **Designs preservados:** `designs/`, `designs/legacy/`, `designs/slice-0/` são history do design v5 — preservar mesmo durante syncs.

## Invariantes resumidos

Os 13 invariantes operacionais vivem em `commands/pipeline.md` (CRITICAL REMINDERS section). Em resumo:
1. Single PIPELINE_DOC_PATH + sentinel state file
2. TDD mandatory para code-changing pipelines
3. Non-Invention + Proportionality
4. User approval em gates específicos
5. AskUserQuestion sempre (nunca prosa para decisão)
6. Automatic batching por complexity
7. Per-batch adversarial + Fix loop max 3
8. Stop rule + phase rollback
9. Review independence (zero-context)
10. Parallel reviewers em final adversarial
11. Verification-before-claim
12. Gate decision log + confidence score (advisory)
13. Sentinel state tracking via PreToolUse hook

Ver `commands/pipeline.md` linhas finais para detalhamento.

## Glossário e referência cruzada

- `references/glossary.md` — termos canônicos (Pipeline, Phase, Gate, Adversarial, etc.)
- `references/complexity-matrix.md` — Pipeline Routing Matrix + Proportional Behavior
- `references/audit-depth-levels.md` — níveis 1/2/3 de auditoria (R-3 do consolidated)
- `references/feature-light-criteria-checklist.md` — ownership de acceptance criteria em feature-light v5.0 (R-5)
- `docs/MIGRATION-v3-to-v4.md` — guia de migração v3 → v4
- `docs/assets/sentinel-philosophy.md` — fundamentos de design do sentinel

## Ponteiros futuros

- `docs/migration-v4-to-v5.md` — a ser criado quando v5.0 for lançado (Slice 4 / DoD)
- `references/trace-schema/v1.md` — a ser criado no Slice 2 (TRACE.md generator)

## Versão deste arquivo

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-04-30 | Inicial — pós-sync 4.1.3 (Slice 0.5 A1) |
| v1.1 | 2026-05-03 | Bump versão canônica 4.4.0 → 4.5.0; lineage estendida com v4.3.x/4.4.x/4.5.0; corrigida contagem do consolidated (1491 → 1796 linhas). Reconciliação de governança disparada por audit do design v5. |
| v1.2 | 2026-05-03 | Team roster corrigido (38 → 19 agents reais [VERIFICADO]) após coherence review apontar drift. |
| v1.3 | 2026-05-03 | Bump versão canônica 4.5.0 → 4.6.0 (Slice 3b — feature skill com mode flag, pattern novo vs Slice 1.5/3a). |
| v1.4 | 2026-05-03 | CORREÇÃO: bump 4.6.0 → 4.6.1. Decisão de "single skill com mode flag" foi revertida — port deve espelhar EXATAMENTE a fonte canônica (Pulsar Heavy/ + Ligth/ = 2 pastas → skills/feature-light/ + skills/feature-heavy/ separadas). Pattern volta a ser igual a Slice 1.5/3a. |
| v1.5 | 2026-05-03 | POLISH: bump 4.6.1 → 4.7.0. Slice 3b polido com 11 fixes audit-driven: contrato declarativo completo nos 26 step files (execution_mode + agent_type + expected_*), SKILL.md manifests completos (sequence_lock + gates_at + sentinel_checkpoints), thin entry-point `/pipeline-orchestrator:feature` criado (espelhando /audit + /bugfix), tests reais substituindo placeholder TESTS_USER_STORY (que virou `references/feature-user-story-guidelines.md`), deprecated headers corrigidos (apontavam para `feature.md` deletado), AGENTS.md count fix (38 → 19), correction headers em spec/plan docs. Skill funcional + 1:1 fidelity Pulsar preservada (texto dos prompts intocado). |
| v1.6 | 2026-05-03 | ENFORCEMENT: bump 4.7.0 → 4.8.0. Hooks NÃO enforce SKILL.md frontmatter (consolidated.md §17.4 #8) RESOLVIDO. Adicionado shared module `.claude/hooks/skill-frontmatter-parser.cjs` (parser YAML + getCurrentSkill + getEnforcementMode + logEnforcementDecision) consumido pelos 3 hooks: sentinel-hook valida `sentinel_checkpoints`, dispatch-guard valida `agent_type` per step (matcher agora `Skill\|Agent`), force-pipeline-agents valida `gates_at`. Roll-out 2-fases time-based: warn mode até 2026-05-17 (logga ENFORCEMENT_WARN em gate-decisions.jsonl com hardness AUDIT, não bloqueia), deny mode auto-promove (bloqueia via permissionDecision). Override via env `PIPELINE_ENFORCEMENT={warn,deny}`. Backward compat: hooks skipam silently quando state.current_skill ausente. Controller (`agents/core/pipeline-controller.md`) atualizado para popular current_skill + current_step antes de spawn. Iron Law respected: só hooks JS + tests modificados. |
| v1.7 | 2026-05-05 | Bump 4.10.0 → 4.11.0 (Wave 3-spec) — type=Spec first-class classification, 4-signal detection, routing dispatch in pipeline-controller, 5 sentinel checkpoints, AC-seeded ATDD in quality-gate-router. 4 core agents wired to existing Wave 1+2 spec lifecycle skills. Backward compat preserved. |
| v1.8 | 2026-05-05 | Bump 4.11.0 → 4.13.0 (skipping intermediate 4.12.0 lineage already in row 21). Wave 5-spec: gates registry from 16→22, Inline Invariants from 15→21 names, complexity-matrix routing for type=Spec, mode_used persistence in spec-closer, +16 unit tests. ARCH-1 drift between pipeline-controller.md Inline Invariants and references/gates.md Registry resolved. |
| v1.9 | 2026-05-06 | Bump 4.13.0 → 4.17.0 (intermediate v4.14/v4.15/v4.16 covered in lineage row). Wave 8-spec: TRACE.md schema + writer + standalone validator + plan-mode auto-trigger on MEDIA + `--no-plan` flag with asymmetric override semantics (COMPLEXA ignores it, plan runs anyway, override logged in TRACE). Closes DoD #2 #3 #6 in one wave. +7 integration tests, +5+5 unit tests. Suite 149/0/1 → 166/0/1. **DoD #5 closed post-tag** via [milestone #1](https://github.com/fernandoxavier02/Pipeline-Orchestrator/milestone/1) "v5.1 — Pipeline Declarativo (Slice 5)" (target Q3 2026) + 3 placeholder issues (#16 YAML grammar, #17 dispatch table, #18 interpreter spike). v5.0.0-rc.1 fully unblocked. Self-hosted dogfood revealed sentinel-hook cwd-discovery brittleness — flagged as v5.0-rc.1 follow-up. |
| v2.0 | 2026-05-06 | **Promote v5.0.0-rc.1 → v5.0.0** (first major release). Same content as rc.1; user waived feedback window. plugin.json + marketplace.json + test pin bumped 4.17.0 → 5.0.0. Marketplace.json `ref` bumped to `v5.0.0`. CHANGELOG `[5.0.0]` section added. All 7 v5.0 DoD criteria DONE. Suite remains GREEN at 166/0/1 + 5/1 mock + 8/8 hooks (zero regressions vs v4.16.0 baseline of 149). |
| v2.1 | 2026-05-15 | Bump 6.0.0 → 6.1.0 (v6.1.0 release). D5 (ATDD non-spec branch in quality-gate-router Step 1b, EARS And/But), D6 (BDD Gherkin per slice in feature-vertical-slice-planner Step 3b, flat naming), D7 (DDD lightweight Bounded Contexts in plan-architect, SOFT BOUNDED_CONTEXT_MISSING event with canonical schema). 4 new regression tests v6.1.0. Suite 17 → 19 GREEN. Forward dependencies tracked for v6.2: bdd_artifact consumer, gherkin_content persist, SLICE-NN >=100. |
| v2.2 | 2026-05-18 | Bump 6.1.0 → 6.2.0 (v6.2.0 release). Clarification overhaul: `step-01-explore` reescrito do template fixo de 7 perguntas para agente dinâmico de 4 fases (A read-first, B 11-lens gap inventory, C evidence-cited GATE_REQUEST per gap, D record + telemetry); novo `step-01b-alternatives` propõe 2-4 abordagens (Minimal/Pattern/Aggressive/Contrarian) com auto-skip para tarefas mecânicas; drift fix em `references/complexity-matrix.md` (Has spec MEDIA: Optional → Required (auto-dispatch)); +5 gates + nova classe AUDIT hardness; registro 22 → 27 gates; brainstorm controller table 9 → 10. Dogfood evidence em `docs/audits/2026-05-18-clarification-overhaul-dogfood/` (cenário real contra IFRS 16 contracts.py:232, 14 eventos de telemetria, 4 inventions prevented). Backward compat preservada. |
| v2.4 | 2026-05-21 | Bump 7.1.0 → 7.1.1 (v7.1.1 release, PATCH, docs only). Enrichment of `docs/diagrams/pipeline-overview.html`: new "Fluxos detalhados ponta a ponta" section covering 7 workflows E2E (bugfix light/heavy, audit light/heavy, UX light/heavy, plan, brainstorm, hotfix, review-only), 12 inline SVG step diagrams (color-coded agents + gates), Thariq-style interactive layer (sticky TOC pills, light/heavy filter pills, per-flow review checkboxes + Copy summary buttons with localStorage, collapsible exemplo cards, 11-option response form with Save/Copy/Clear, live `N/7` counter, TOC pills marked ✓ when reviewed). 380 → 1498 lines net. ZERO changes to runtime (agents/skills/references/commands/hooks/lib/tests untouched); 22-row Mandatory Gates and 27-row Registry preserved. Iron Law respected. |
| v2.3 | 2026-05-19 | Bump 7.0.0 → 7.1.0 (v7.1.0 release). Telemetry hygiene: new `lib/gate-decision-writer.cjs` SSOT writer (8-value canonical decision vocab BLOCKED/DISPATCHED/SKIPPED/APPROVED/CONFIRMED/REJECTED/TRIGGERED/NOT_TRIGGERED + auto-correlation run_id/plugin_version/schema_version/type/complexity; runtime throws on unknown values). Migrates 8 write sites in `lib/codex-operational-runtime.cjs` to use the new helper via local `logGateDecision` wrapper. `lib/fidelity-reporter.cjs` widens VALID_HARDNESS to include AUDIT (was missing since v6.2.0) and VALID_DECISION to all 8 canonical values; `validate*` now pushes a warning to fidelity-report's `warnings[]` when an invalid value is encountered (was silently nullified). New `.claude/hooks/stop-hook.cjs` (registered in `.claude/settings.json` Stop event) calls `lib/run-log.cjs::appendRunLog` on every session end including crashes — closes the 1-line-per-20-runs aggregate bug. `lib/jsonl-sanitizer.cjs` ALLOWED_GATE_DECISION_KEYS extended with the 5 correlation fields. `agents/quality/diff-discipline-reviewer.md` gains a Step 4b SSOT-bypass static check. 4 agent prose files (`finishing-branch`, `pipeline-controller`, `spec-closer`, `step-01b-alternatives`) reference the canonical vocab. 7 regression tests in `tests/regression/v7.1.0/` (F1-F7). Invariants preserved: 22-row Mandatory Gates by Complexity table untouched; 27-row Registry untouched. Backward compat: historical events still tolerated as `(invalid)`; no migration. Deferred to v7.2.0: Finding #3 (gate rename CHECKPOINT_FAIL/PLAN_REJECTED) and Finding #5 (timestamp format normalization). |
