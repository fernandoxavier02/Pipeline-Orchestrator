> ## ⚠️ CORREÇÃO (2026-06-14, audit-heavy) — LEIA ANTES DE EXECUTAR ESTE PLANO
>
> Uma auditoria audit-heavy do próprio pipeline (relatório em `.pipeline/docs/Pre-Heavy-action/2026-06-14-contract-enforcement-base-audit/`) confirmou que a **Fase 1 foi executada e entregue** (v7.14.1), mas que as premissas herdadas de `01-audit-verdict.md` §2 estão **defasadas** (foram escritas contra ~v7.8.0). Antes de executar qualquer Fase 2–6:
>
> - O repositório está em **v7.14.0/7.14.1**, não 7.8.0.
> - Arquivos que o plano trata como "criar novo" / "inexistente" **já existem**: `lib/step-1-7-routing.cjs`, `references/plan-mode-mandatory-agents.json`, `references/step-1-7-enforcement.json`, `references/entry-points.json`, `lib/entry-points.cjs`, `lib/exclusive-lock.cjs`. Criar SSOTs duplicados para eles **reintroduz o drift** que este plano quer eliminar.
> - `scripts/run-tests.cjs` já varre `tests/unit`/`tests/packaging`/`tests/watchdog` (desde v7.13.0).
> - **Revalide cada passo das Fases 2–6 contra o código atual** antes de tocá-lo.

# Plano de Implementação — Contratos Executáveis SSOT (versão corrigida pós-auditoria)

**Data:** 2026-06-14
**Base:** proposta original "TypeScript Contract Enforcement", revisada pela auditoria `01-audit-verdict.md`.
**Diferença-chave vs proposta original:** contratos como módulos **`.cjs` SSOT** (não `.cts` compilados); ordem reordenada por urgência/risco; passos sobre arquivos inexistentes removidos ou marcados como "criar novo de propósito"; fail-closed do scope-lock condicionado; quebra de Iron Law tratada como decisão explícita de versionamento.

> **Por que `.cjs` e não `.cts`:** o repo é zero-build, zero-devDependency, CommonJS puro. O enforcement de runtime já vem de `throw TypeError`/validação de chaves. Tipos estáticos não rodam em produção. `// @ts-check` + JSDoc dá checagem em dev sem etapa de build e sem risco de publicar `lib/` dessincronizado. Ver §3.1 da auditoria.

---

## Princípios invioláveis deste plano

1. Não migrar o runtime para ESM. Continua CommonJS, Node `>=18`.
2. Hooks continuam `.cjs` e registrados em `hooks/hooks.json`. Nenhum hook existente é removido.
3. Não depender de `.claude/settings.json` / `subagent_permissions` (campo inexistente na doc oficial). Enforcement só em hooks + contratos.
4. Não tocar repositórios irmãos (Codex/Gemini/Copilot/Paperclip) — salvo espelho `.codex/` quando um hook espelhado mudar (regra existente do `CLAUDE.md`).
5. Para MEDIA/COMPLEXA/Spec, enforcement tende a fail-closed — **mas** com trava de contexto (ver Fase 4).
6. Toda contagem fixada em teste só é legítima se o contrato `.cjs` for o SSOT e a doc for verificada contra ele.
7. **Decisão de governança explícita:** este trabalho toca `lib/`, `references/` e `agents/core/` — quebra a Iron Law additive-only. Versionar conscientemente (sugiro MINOR `7.x.0` com nota "core-touching hardening, justificado por bug de auto-auditoria") e registrar no `CHANGELOG.md`.

---

## Fase 0 — Baseline (read-only, sem risco)

- Branch: `feature/contract-enforcement-ssot`.
- Baseline já capturado nesta auditoria: `node scripts/run-tests.cjs` → `58/2/60`; as 2 falhas são Langfuse F9/F10 ambientais (pré-existentes). `npm run build` (= `node scripts/build.cjs`) a confirmar.
- Arquivos já lidos e confirmados: `package.json`, `hooks/hooks.json`, `.claude-plugin/plugin.json` (v7.8.0), `lib/gate-decision-writer.cjs`, `lib/jsonl-sanitizer.cjs`, `lib/fidelity-reporter.cjs`, `.claude/hooks/scope-lock-hook.cjs`, `.claude/hooks/dispatch-guard.cjs`, `agents/core/final-validator.md`, `agents/core/pipeline-controller.md`, `references/audit-trail.md`, `references/gates.md`.
- **Correção de premissa:** `lib/step-1-7-routing.cjs` e `references/plan-mode-mandatory-agents.json` **não existem**. Qualquer passo que dependa deles é "criar SSOT novo", não "espelhar existente".

---

## Fase 1 — URGENTE: fechar o drift de schema do gate-decisions (sem TypeScript)

**Objetivo:** matar o bug em que o plugin marca o próprio audit trail como anômalo e procura `decision: RESOLVED` que nunca existe. Pacote pequeno, fail-safe, alto valor.

1. Criar `lib/contracts/gate-decision.cjs` (SSOT puro CommonJS, `// @ts-check`):
   - `CANONICAL_DECISIONS` (Set dos 8), `CANONICAL_HARDNESS` (Set dos 5), `ALLOWED_GATE_DECISION_KEYS` (8 base + 5 correlação), `SCHEMA_VERSION`.
2. `lib/gate-decision-writer.cjs`: importar `CANONICAL_DECISIONS`/`CANONICAL_HARDNESS`/`SCHEMA_VERSION` do contrato (hoje declarados inline). Manter exports atuais (re-export) para compat. Comportamento público inalterado.
3. `lib/jsonl-sanitizer.cjs`: importar `ALLOWED_GATE_DECISION_KEYS` do contrato; remover a lista paralela (ou deixá-la como fallback comentado "legacy").
4. `lib/fidelity-reporter.cjs`: já consome `CANONICAL_*` (via writer); apontar para o contrato direto. Sem mudança de comportamento.
5. **`references/audit-trail.md`** (linha ~66): trocar "exactly these keys [8]" por: o parser aceita exatamente o conjunto canônico de chaves de `GateDecisionEntry` (8 base + 5 correlação `run_id`, `plugin_version`, `schema_version`, `type`, `complexity`); só chaves **fora** desse conjunto são anomalia. Documentar o envelope de correlação.
6. **`agents/core/pipeline-controller.md`** (linha ~257): mesma correção do item 5. Remover a regra "parse ONLY the 8 documented fields".
7. **`agents/core/final-validator.md`** (linha ~66): remover `RESOLVED`. Nova regra: "MANDATORY/HARD nunca podem ser `SKIPPED`; valores válidos são os 8 canônicos; sucesso/falha é interpretado por-gate". Aceitar campos de correlação no parse; schema antigo sem envelope → aceitar como legacy com warning, não como anomalia fatal.
8. **Atenção a um terceiro local de invariante:** a própria spec `commands/pipeline.md` (CRITICAL/Inline Invariants) repete "exactly these keys" — incluir na correção para não deixar drift residual.
9. Testes em `tests/regression/v7.9.0/` (versão corrente já existe):
   - writer aceita os 8; rejeita `RESOLVED` com TypeError; grava os 5 campos de correlação.
   - sanitizer não dropa correlação.
   - `final-validator.md` não contém mais `RESOLVED | APPROVED`.
   - `audit-trail.md` e `pipeline-controller.md` documentam os campos de correlação.
   - teste unit direto do contrato.

**DoD da Fase 1:** suíte volta a `58/2` (sem novas regressões); 3+ arquivos de doc alinhados ao writer; SSOT único de decisões/hardness/chaves em `lib/contracts/gate-decision.cjs`.

---

## Fase 2 — SSOT de gates + sync-check (sem TypeScript)

1. `lib/contracts/gates.cjs`: `GATE_REGISTRY` (estado atual de `references/gates.md`) + `MANDATORY_GATES_BY_COMPLEXITY` (move do `fidelity-reporter.cjs:94`).
2. `lib/fidelity-reporter.cjs`: `mandatorySetFor` consome o contrato; remover a constante local.
3. `scripts/verify-contract-sync.cjs`: carrega `lib/contracts/gates.cjs`, lê `references/gates.md`, confere (a) cobertura mútua de gates, (b) hardness batendo, (c) contagens da tabela mandatory. Exit 1 em drift. Adicionar script npm `verify:contracts`.
4. Regression que chama o sync-check via child_process + fixtures de drift (gate faltante / hardness divergente).

**Nota sobre contagens:** "35 gates / 23 mandatory" só viram pin quando o contrato é o SSOT e a doc é verificada contra ele — aí o pin é legítimo.

---

## Fase 3 — Workflow / FQN SSOT (sem TypeScript)

1. `lib/contracts/workflow.cjs`: `AGENT_LEAF_TO_FQN` (move do `dispatch-guard.cjs:39`), `PHASE_ORDER`, `WORKFLOW_TRANSITIONS`, `STEP_1_7_ENFORCEMENT_TARGETS`. Plan-mode mandatory agents: **criar** `lib/contracts/plan-mode-agents.cjs` como SSOT novo (não existe `references/plan-mode-mandatory-agents.json`).
2. `.claude/hooks/dispatch-guard.cjs` e `.claude/hooks/sentinel-hook.cjs` consomem o contrato; manter detecções `PLAN_MODE_BYPASS` e `BRAINSTORM_BYPASS`; manter HMAC/discovery/stale do sentinel-hook.
3. Espelhar mudanças no `.codex/hooks/*` correspondente (regra do `CLAUDE.md`).
4. Regression + testes de hook (`.claude/hooks/__tests__/`): FQN sem duplicata, todos os leaves presentes, deny/exit-0 com JSON correto.

---

## Fase 4 — Scope-lock fail-closed CONDICIONADO (alto cuidado)

**Só depois das fases anteriores. Esta é a de maior risco operacional.**

1. `lib/contracts/change-contract.cjs` + `lib/validators/validate-change-contract.cjs` (`.cjs`, não `.cts`): shape do `CHANGE_CONTRACT`, `isStrictContractRequired({complexity,type,code_changing})`, `evaluateScopeTarget(...)`.
2. `scope-lock-hook.cjs` muda **apenas** assim:
   - `forbidden_files` sempre bloqueia (já faz).
   - `allowed_files`/`allowed_new_files` populados = allowlist (já faz).
   - **Novo fail-closed, com TRAVA DUPLA:** negar `Write/Edit` fora de `.pipeline/` **somente se** (a) há lock ativo **não-stale** (heartbeat válido) **E** (b) run-context positivamente identificado como `MEDIA|COMPLEXA|Spec` code-changing sem contrato válido.
   - **Em contexto indeterminável → `warn` + telemetria, NUNCA `deny` cego.** `.pipeline/` e o arquivo de contrato sempre graváveis. Isto preserva o "edits diretos OK fora do pipeline" do `CLAUDE.md` e evita deadlock por lock órfão.
   - `bootstrap.active` só libera com `bootstrap.reason` presente.
3. Regression cobrindo: MEDIA sem contrato + lock ativo não-stale bloqueia fora de `.pipeline`; contexto indeterminável → warn, não deny; forbidden ganha de allowed; `agents/**` não bloqueia `agents-extra/foo`; backslash Windows normaliza; bootstrap sem reason não libera.

---

## Fase 5 — Protocolo Achado #7 tipado (opcional, menor prioridade)

`lib/validators/validate-protocol-block.cjs`: parser determinístico de `GATE_REQUEST`/`DISPATCH_REQUEST`/`PLAN_MODE_REQUEST` e respostas; YAML malformado → erro estruturado, nunca guess; nunca executa conteúdo do bloco. Alinhar `pipeline-controller.md` (preferir `DISPATCH_REQUEST` a depender de Skill tool em runtime). Regression F-protocol.

---

## Fase 6 — Packaging e fechamento

1. `package.json files[]`: incluir `lib/contracts/` e `lib/validators/`. (Não precisa de `tsconfig` porque não há build TS.)
2. `tests/packaging/`: `npm pack --dry-run` inclui `lib/contracts/`, `lib/validators/`, `hooks/hooks.json`, `.claude/hooks/`. Runtime não depende de `src/`.
3. Rodar `node scripts/run-tests.cjs` + `verify:contracts` + `node scripts/build.cjs`. Suíte verde (modulo as 2 falhas Langfuse ambientais conhecidas).
4. `CHANGELOG.md` + bump de versão consciente. Atualizar a linha canônica do `CLAUDE.md`.
5. Relatório final em `docs/audits/2026-06-14-typescript-contract-enforcement/03-report.md`.

---

## Definition of Done (revisado)

- `node scripts/run-tests.cjs` sem novas regressões (baseline `58/2`).
- `verify:contracts` verde; `references/gates.md` em sync com `lib/contracts/gates.cjs`.
- Schema de gate-decision único entre writer, sanitizer, fidelity-reporter, `audit-trail.md`, `pipeline-controller.md`, `final-validator.md` e `commands/pipeline.md`.
- `RESOLVED` não aparece mais como decisão válida em lugar nenhum.
- scope-lock fail-closed **com trava de contexto**; contexto indeterminável = warn, não deny.
- dispatch-guard/sentinel-hook consomem contratos `.cjs`.
- Hooks continuam `.cjs` e compatíveis com `hooks/hooks.json`; nenhum removido.
- Pacote publicado contém `lib/contracts/` e `lib/validators/`.
- Sem dependência de `subagent_permissions`. Sem migração ESM. Sem `tsc` no caminho de publicação.
- Quebra de Iron Law registrada conscientemente no CHANGELOG com justificativa (bug de auto-auditoria).

## O que NÃO fazer

- Não adicionar `typescript` como devDependency nem `tsc` ao `build`/`prepublishOnly` nesta etapa.
- Não tornar o scope-lock fail-closed cego em contexto indeterminável.
- Não criar gate novo sem justificativa (usar `protocol-events.jsonl` para eventos audit-only).
- Não mascarar as 2 falhas Langfuse como baseline novo — elas já eram baseline.
- Não "corrigir" contagens na doc à mão sem o contrato/sync-check por trás.
