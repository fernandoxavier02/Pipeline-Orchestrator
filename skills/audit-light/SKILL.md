---
name: audit-light
description: Prescriptive 9-step audit workflow for SIMPLES/MEDIA audits (1 area, 1 depth level, single-axis or narrow scope). Imported from Pulsar audit workflow per spec §22. Use when audit complexity is light. REPORT-ONLY by Iron Law — no code modification under any circumstance. Same 9-step structure as audit-heavy (§7.2.2 — Light = Heavy em estrutura) but capped scope and collapsed ownership audit-domain-analyzer is SKIPPED in Light per references/pipelines/audit-light.md; domain analysis runs inline inside audit-compliance-checker's light_mode fallback. Steps 1 subagent gate (intake — REQUIRES SCOPE APPROVAL), 2-4 subagent (architecture + domain/SSOT + contracts via audit-compliance-checker light_mode), 5-8 subagent (data + frontend + backend + governance via audit-compliance-checker), 9 subagent gate (Pa de Cal via audit-risk-matrix-generator — REQUIRES GO/NO-GO). Manual-only invocation via /pipeline-orchestrator:audit-light or via /pipeline-orchestrator:audit --light.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion]
argument-hint: [audit scope — narrow area, single depth level]
sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9]
sequence_lock: true
gates_at: [1, 9]
sentinel_checkpoints: [pre_1, pre_9]
stop_rule_max_failures: 2
report_only: true
---

# Audit Light Workflow (9 prescriptive steps — REPORT ONLY)

This skill executes a deterministic 9-step procedure for SIMPLES/MEDIA audits. Per spec §7.2.2 the audit pipeline is unique in that **Light = Heavy in structure** — pulando fases compromete cobertura. Light differs from Heavy in **depth**, not in **shape**:

- **Heavy**: full coverage of all axes, deep evidence, baseline cross-checks.
- **Light**: capped scope (1 area, 1 depth level), faster pass, no audit-domain-analyzer (its work folds into `audit-compliance-checker`'s `light_mode` fallback).

> **Light vs heavy = content DEPTH, not step count (HonestLightDocs / Req 3.3).** This light variant runs the SAME 9 steps as `audit-heavy` (§7.2.2 — Light = Heavy em estrutura). The one real structural difference is that light dispatches **one fewer distinct agent**: `audit-domain-analyzer` is folded INLINE into `audit-compliance-checker`'s `light_mode` (capped scope + collapsed ownership) — a depth/ownership modulation within an unchanged step, NOT a removed step. No step was removed — audit steps are chained evidence bridges (intake → domain → compliance → risk-matrix) where removing one breaks the next step's input chain; this disposition is reversible only with explicit user authorization. See `references/complexity-matrix.md` › "Light vs Heavy".

## When to use this skill

Use **audit-light** when ALL of the following hold:

- Audit covers a single area (e.g., only `auth/`, only `data layer`, only `frontend state`).
- Single depth level — basic coverage, not deep edge-case + threat-model traversal.
- Not a regulatory / compliance audit (audit-light is BLOCKED for GDPR/HIPAA/SOC2 per §11.2).
- No production-incident driver requiring full forensic depth.

If any of these does not hold, the workflow auto-escalates at step 9 (Pa de Cal) and recommends `audit-heavy`.

## Iron Law — REPORT ONLY

Same as audit-heavy: **no production file may be modified at any point**. All deliverables are structured reports (Markdown narrative + typed JSON). `edit-guard-hook.cjs` enforces.

## Steps overview

| # | Step | File | execution_mode | agent_type | Output | Gate? |
|---|------|------|----------------|------------|--------|-------|
| 1 | Initial Read + Project Map | [steps/01-leitura-inicial-mapa-projeto.md](steps/01-leitura-inicial-mapa-projeto.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-intake` | `AuditSnapshot` | **yes (SCOPE APPROVAL)** |
| 2 | Architecture + Organization + Responsibilities | [steps/02-arquitetura-organizacao-responsabilidades.md](steps/02-arquitetura-organizacao-responsabilidades.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-compliance-checker` (light_mode) | `ArchitectureAudit` | no |
| 3 | Domain + Business Rules + SSOT | [steps/03-dominio-regras-ssot.md](steps/03-dominio-regras-ssot.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-compliance-checker` (light_mode) | `DomainSSOTAudit` | no |
| 4 | APIs + Endpoints + Contracts | [steps/04-apis-endpoints-contratos.md](steps/04-apis-endpoints-contratos.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-compliance-checker` (light_mode) | `ContractAudit` | no |
| 5 | Data + Persistence + Migrations | [steps/05-dados-persistencia-migracoes.md](steps/05-dados-persistencia-migracoes.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-compliance-checker` | `DataAudit` | no |
| 6 | Frontend Quality + State + UI | [steps/06-frontend-qualidade-estado-ui.md](steps/06-frontend-qualidade-estado-ui.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-compliance-checker` | `FrontendAudit` | no |
| 7 | Backend Services + Security | [steps/07-backend-servicos-seguranca.md](steps/07-backend-servicos-seguranca.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-compliance-checker` | `BackendAudit` | no |
| 8 | Tests + Observability + Performance | [steps/08-testes-observabilidade-performance.md](steps/08-testes-observabilidade-performance.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-compliance-checker` | `QualityOpsAudit` | no |
| 9 | Pá de Cal + Conclusion + Plan | [steps/09-pa-de-cal-conclusao.md](steps/09-pa-de-cal-conclusao.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-risk-matrix-generator` | `AuditFinalSeal` | **yes (GO/CONDITIONAL/NO-GO + escalate-to-heavy)** |

## Light mode marking (per `audit-compliance-checker` frontmatter)

Steps 2–4 invoke `audit-compliance-checker` with `light_mode: true` annotation. Per the agent's frontmatter (`Light Mode Fallback` section), it does inline domain discovery from `AuditSnapshot` directly (using Grep/Glob) and tags all architecture-dependent findings as `[HYPOTHESIS]` to flag the absence of `audit-domain-analyzer`'s deeper verification.

## Execution rules (8 enforcement rules — non-negotiable)

Same rules as audit-heavy (sequence lock, execution-mode lock, agent-type whitelist, output schema, AskUserQuestion gates, STOP RULE, audit log, sentinel checkpoints). Only the sentinel checkpoint set is reduced (`pre_1`, `pre_9`) — Light does not require the mid-pipeline `pre_5` checkpoint because the scope cap keeps state simpler.

## Iron-Law extension — Read-only enforcement

Same as audit-heavy: `report_only: true` mirrored in every step's `production_writes_allowed: false` and in every audit agent's IRON LAW section. `edit-guard-hook.cjs` rejects any Edit/Write call.

## Auto-escalation rules (step 9 may bounce to audit-heavy)

The Pá de Cal gate at step 9 recommends escalation to `audit-heavy` when ANY of the following surface during steps 1–8:

- Findings tagged `Critical` severity (compliance, security, data corruption).
- Multiple `[HYPOTHESIS]` tags that can only be resolved with `audit-domain-analyzer` depth.
- Cascade risk discovered touching 3+ areas (audit was scoped to 1 — scope was wrong).
- Regulatory keyword detected during scope (GDPR, HIPAA, SOC2) — Light is BLOCKED for these.

When escalation is recommended, AskUserQuestion at step 9 surfaces it as the recommended option.

## How execution flows

1. The skill is invoked via `/pipeline-orchestrator:audit-light "<scope description>"` (or via `/pipeline-orchestrator:audit --light` after pipeline-controller dispatch).
2. The orchestrator reads `sequence:` from this file and walks the steps.
3. For each step, the orchestrator opens `steps/0X-*.md`, reads the frontmatter, and spawns a Task with the declared `agent_type:` plus `light_mode: true` (when steps 2–4) and passes `expected_inputs` from previous steps.
4. Outputs are accumulated; `expected_next` chains to the following step.
5. Gates (steps 1, 9) raise AskUserQuestion before transitioning out.
6. On any failure, the STOP RULE may halt the pipeline.

## Reference docs

- Test strategy across the 9 steps: [tests/tests-audit-light.md](tests/tests-audit-light.md)
- Design rationale: `designs/pipeline-orchestrator-v5-consolidated.md` §22 (Slice 3a — audit import)
- Pulsar source playbook (read-only ancestor): `D:\Projeto Pulsar\.claude\commands\Prompts\Audtiroria\light\` (LIGHT_01..09 + TESTS_AUDITORIA_LIGHT)
- Heavy-tier counterpart (when scope demands depth): `skills/audit-heavy/SKILL.md`
- Team composition reference: `references/pipelines/audit-light.md`
- Audit glossary: `references/glossary/audit.md`

## Gap closures relative to v4.4.x plugin

Same as audit-heavy: prescriptive step procedure didn't exist before Slice 3a. The `audit-light` reference described the team and Pa de Cal; this skill prescribes WHAT each step must produce, in WHAT FORMAT, with WHAT EVIDENCE, chained under sequence-lock, with light_mode fallback baked into the contract.
