---
name: audit-heavy
description: Prescriptive 9-step audit workflow for COMPLEXA audits (full system, multi-axis, regulatory, security-sensitive). Imported from Pulsar audit workflow per spec §22. Use when audit complexity is heavy or when audit-light auto-escalates at its scope gate. REPORT-ONLY by Iron Law — no code modification under any circumstance. Steps 1 subagent gate (intake + spec + inventory — REQUIRES SCOPE APPROVAL), 2-4 subagent (architecture + domain/SSOT + contracts via audit-domain-analyzer), 5-8 subagent (data + frontend + backend + governance via audit-compliance-checker), 9 subagent gate (Pa de Cal + risk matrix via audit-risk-matrix-generator — REQUIRES GO/NO-GO). Each step produces a typed JSON output (AuditIntake, DependencyImpactAudit, DecisionSSOTAudit, ContractGovernanceAudit, DataGovernanceAudit, FrontendDeepAudit, BackendDeepAudit, DeliveryGovernanceAudit, AuditMasterSeal). Manual-only invocation via /pipeline-orchestrator:audit-heavy or via /pipeline-orchestrator:audit --heavy.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion]
argument-hint: [audit scope — modules, axes, baseline]
sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9]
sequence_lock: true
gates_at: [1, 9]
sentinel_checkpoints: [pre_1, pre_5, pre_9]
stop_rule_max_failures: 2
report_only: true
---

# Audit Heavy Workflow (9 prescriptive steps — REPORT ONLY)

This skill executes a deterministic 9-step procedure for COMPLEXA audits. The procedure is **non-negotiable**: order is locked, execution mode per step is locked, gates cannot be skipped, and **no production file may be modified at any point**. Every audit agent is read-only by frontmatter and Iron Law.

## When to use this skill

Use **audit-heavy** when ANY of the following hold:

- Audit covers more than 2 axes (e.g., architecture + data + security; or contracts + frontend + backend).
- Audit covers a full system / regulatory boundary (LGPD/GDPR, SOC2, HIPAA).
- Production-grade audit feeding into release gating, due diligence, or compliance review.
- Cross-cutting concerns are involved: persistence, concurrency, multi-user, identity, payment, idempotency, source of truth.
- Baseline available — historical findings to verify, regression to confirm.
- `audit-light` auto-escalated at its step 9 scope gate.

If none of these hold, prefer `audit-light` (same 9 steps, but capped to 1 area / 1 depth level).

## Iron Law — REPORT ONLY

**No step in this skill may create, modify, or delete a production file.** All deliverables are structured reports (Markdown narrative + typed JSON) appended to `.pipeline/audit-runs/<run-id>/` (or equivalent). Audit agents (`audit-intake`, `audit-domain-analyzer`, `audit-compliance-checker`, `audit-risk-matrix-generator`) enforce this in their own frontmatter and prompts.

If at any step the agent finds itself about to write production code or refactor — STOP. The audit reports the issue; remediation is a separate Bug Fix or Feature pipeline run by the user.

## Steps overview

| # | Step | File | execution_mode | agent_type | Output | Gate? |
|---|------|------|----------------|------------|--------|-------|
| 1 | Intake + Spec + Inventory | [steps/01-intake-spec-inventario.md](steps/01-intake-spec-inventario.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-intake` | `AuditIntake` | **yes (SCOPE APPROVAL)** |
| 2 | Architecture + Module Boundaries + Dependencies | [steps/02-arquitetura-limites-dependencias.md](steps/02-arquitetura-limites-dependencias.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-domain-analyzer` | `DependencyImpactAudit` | no |
| 3 | Domain + Business Rules + SSOT + Decisions | [steps/03-dominio-regras-ssot-decisoes.md](steps/03-dominio-regras-ssot-decisoes.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-domain-analyzer` | `DecisionSSOTAudit` | no |
| 4 | Contracts + APIs + Endpoints + Validations | [steps/04-contratos-apis-endpoints-validacoes.md](steps/04-contratos-apis-endpoints-validacoes.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-domain-analyzer` | `ContractGovernanceAudit` | no |
| 5 | Data + Migrations + Integrity + Security | [steps/05-dados-migracoes-integridade-seguranca.md](steps/05-dados-migracoes-integridade-seguranca.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-compliance-checker` | `DataGovernanceAudit` | no |
| 6 | Frontend + State + Accessibility + PWA | [steps/06-frontend-estado-acessibilidade-pwa.md](steps/06-frontend-estado-acessibilidade-pwa.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-compliance-checker` | `FrontendDeepAudit` | no |
| 7 | Backend + Services + Errors + Auth + Observability | [steps/07-backend-servicos-erros-auth-observabilidade.md](steps/07-backend-servicos-erros-auth-observabilidade.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-compliance-checker` | `BackendDeepAudit` | no |
| 8 | Governance + Tests + CI/CD + Documentation | [steps/08-governanca-testes-ci-cd-documentacao.md](steps/08-governanca-testes-ci-cd-documentacao.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-compliance-checker` | `DeliveryGovernanceAudit` | no |
| 9 | Pa de Cal + Risk Matrix + Priority Backlog | [steps/09-pa-de-cal-matriz-de-risco.md](steps/09-pa-de-cal-matriz-de-risco.md) | subagent | `pipeline-orchestrator:executor:type-specific:audit-risk-matrix-generator` | `AuditMasterSeal` | **yes (GO/CONDITIONAL/NO-GO on report)** |

## Execution rules (8 enforcement rules — non-negotiable)

These rules are baked into the frontmatter contract. The `dispatch-guard` hook + `sentinel-hook` validate them at runtime. Violations are blocked deterministically.

1. **Sequence lock** — steps execute strictly in order 1→2→3→4→5→6→7→8→9. No skip, no reorder. Validated via `sequence:` + `sequence_lock: true` plus `expected_next:` per step.
2. **Execution-mode lock** — each step declares `execution_mode: subagent`. Cannot be swapped to inline at runtime.
3. **Agent-type whitelist** — when `execution_mode: subagent`, the step declares the EXACT `agent_type:` allowed. `dispatch-guard` rejects any other agent.
4. **Output schema** — each step declares `expected_outputs:`; the next step verifies inputs match before proceeding. Fail-closed.
5. **AskUserQuestion gates obrigatórios** — steps 1 (scope approval) and 9 (Pa de Cal GO/NO-GO) declare `gate_required: true`. The skill MUST invoke AskUserQuestion at those points. Prose substitution is forbidden.
6. **STOP RULE** — 2 consecutive failures (missing inputs, invalid evidence chain, agent timeout) halt the pipeline. `stop_rule_max_failures: 2` enforced by sanity-checker + checkpoint-validator.
7. **Audit log append-only** — every gate decision, AskUserQuestion answer, step transition, and STOP event is appended to `.pipeline/gate-decisions.jsonl`.
8. **Sentinel checkpoints** — `sentinel-hook` validates state coherence before steps 1, 5, 9 (`sentinel_checkpoints: [pre_1, pre_5, pre_9]`). Outside these checkpoints, sentinel blocks execution.

## Iron-Law extension — Read-only enforcement

Beyond the 8 rules above, this skill carries a 9th non-negotiable invariant unique to audit pipelines:

9. **Read-only enforcement** — `report_only: true` in this manifest is mirrored in every step's frontmatter (`production_writes_allowed: false`) and in every audit agent's IRON LAW section. `edit-guard-hook.cjs` rejects any Edit/Write call originating from a step or agent declared read-only. Findings → reports, never patches.

## How execution flows

1. The skill is invoked via `/pipeline-orchestrator:audit-heavy "<scope description>"` (or via `/pipeline-orchestrator:audit --heavy` after pipeline-controller dispatch, or via auto-escalation from `audit-light` step 9).
2. The orchestrator reads `sequence:` and walks the steps.
3. For each step, the orchestrator opens `steps/0X-*.md`, reads the frontmatter, and:
   - spawns a Task with the declared `agent_type:` and passes `expected_inputs` from previous steps
   - the audit agent produces the typed JSON deliverable plus narrative
4. Outputs accumulate; `expected_next` chains the next step.
5. Gates (steps 1 and 9) raise AskUserQuestion before transitioning.
6. On any failure, the STOP RULE may halt the pipeline.

## Reference docs

- Test strategy across the 9 steps: [tests/tests-audit-heavy.md](tests/tests-audit-heavy.md)
- Design rationale: `designs/pipeline-orchestrator-v5-consolidated.md` §22 (Slice 3a — audit import)
- Pulsar source playbook (read-only ancestor): `D:\Projeto Pulsar\.claude\commands\Prompts\Audtiroria\Heavy\` (HEAVY_01..09 + TESTS_AUDITORIA_HEAVY)
- Light-tier counterpart (when scope allows): `skills/audit-light/SKILL.md`
- Team composition reference: `references/pipelines/audit-heavy.md`
- Audit glossary: `references/glossary/audit.md`

## Gap closures relative to v4.4.x plugin

Before Slice 3a the plugin had the 4 audit agents (`audit-intake`, `audit-domain-analyzer`, `audit-compliance-checker`, `audit-risk-matrix-generator`) and the team-composition references (`references/pipelines/audit-{heavy,light}.md`), but no prescriptive step procedure. The `audit-heavy` reference described WHO runs WHEN; this skill prescribes WHAT each step must produce, in WHAT FORMAT, with WHAT EVIDENCE, and chains them under sequence-lock. Closures:

- **Audit 1 — Intake-as-gate**: scope approval is now a mandatory AskUserQuestion gate at step 1 (was implicit "user blesses scope" in references). Prevents scope creep mid-audit.
- **Audit 2-4 — Architecture/Domain/Contracts as separate steps**: previously bundled under `audit-domain-analyzer` as a single pass. Now three focused invocations, each with its own typed deliverable (DependencyImpactAudit / DecisionSSOTAudit / ContractGovernanceAudit). Reduces context bloat per agent invocation and surfaces issues earlier.
- **Audit 5-8 — Data/Frontend/Backend/Governance as separate steps**: previously bundled under `audit-compliance-checker`. Now four focused invocations (DataGovernanceAudit / FrontendDeepAudit / BackendDeepAudit / DeliveryGovernanceAudit). Same benefit: focused context, parallel-friendly future evolution.
- **Audit 9 — Pa de Cal as GO/CONDITIONAL/NO-GO gate**: previously a free-form synthesis. Now an explicit AskUserQuestion gate with risk-matrix-backed decision and rollback plan for any HIGH-severity finding requiring follow-up.
