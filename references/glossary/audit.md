# Audit Bounded Context — Glossary

> Domain glossary for the `/pipeline-orchestrator:audit` workflow. Required by spec §11.1 (one glossary per pipeline bounded context). The terms here are the **only** accepted vocabulary inside the `audit-heavy` and `audit-light` skills, agents, and reports.

## Core terms

### finding
A single observation produced by an audit step. Always carries:
- A statement (one sentence, declarative).
- An evidence chain (file:line OR explicit tag — see `tag` below).
- A severity (`Critical | High | Medium | Low`).
- A source step (which of steps 1–8 produced it).

A finding never proposes code changes — it describes the state of the system. Recommendations attached to a finding are advisory and feed step 9's priority backlog.

### severity
Four levels:

- **Critical** — exploitable security flaw, data corruption risk, regulatory violation. P0 remediation. Audit-light is BLOCKED if Critical surfaces during scope definition (regulatory).
- **High** — production reliability risk, SSOT divergence, missing rollback for data migration. P1 remediation.
- **Medium** — code quality, missing observability, incomplete test coverage. P2 remediation.
- **Low** — naming, minor inconsistency, doc gap. Backlog item.

Severity is independent of probability and impact (which combine into the risk-matrix cell at step 9).

### surface area
The set of files / modules / endpoints / data paths that the audit covers. Declared at step 1 inside the audit spec. Out-of-scope axes are explicitly excluded (`"not in audit scope"`). The surface area is fixed at step 1 — it cannot expand mid-audit; if the agent discovers something material outside the surface area, it is recorded in the report's "scope expansion candidates" section but not analyzed within this run.

### threat model
A structured enumeration of (a) trust boundaries, (b) assets being protected, (c) actors (legitimate + adversarial), (d) attack surfaces, (e) controls in place. The audit-heavy step 5 (data + security) and step 7 (backend + auth + observability) produce partial threat-model artifacts; step 9 consolidates them. Audit-light produces a simplified version inside `BackendAudit.security_risks_top` only.

### intake
The entry phase of the audit. In `audit-heavy` step 1 produces `AuditIntake` (deep). In `audit-light` step 1 produces `AuditSnapshot` (trimmed). Both are user-facing gates (scope approval). The intake establishes the spec, the inventory, the evidence-classification framework, and the audit_id used downstream.

### risk matrix
The structured artifact at step 9 that maps every consolidated finding to (impact × probability × severity × evidence). Heavy produces `AuditMasterSeal.risk_matrix`; Light produces `AuditFinalSeal.risks_ranked`. The matrix is the primary deliverable consumed by downstream Bug Fix / Feature pipelines when remediation is dispatched.

### evidence tag
Every finding carries one of three tags:

- `[VERIFIED]` — the claim is backed by a specific file:line citation. Default required state for any severity ≥ Medium.
- `[HYPOTHESIS]` — plausible risk; not directly evidenced. Only acceptable for Low severity OR when the agent has exhausted available evidence avenues. In Light, light_mode-derived findings are auto-tagged `[HYPOTHESIS]`.
- `[DESIGN]` — the observed behavior may be intentional. The audit reports the observation but defers severity-classification to a stakeholder review (typically surfaces in step 4 contract assessment when an unusual API shape may be deliberate).

A finding can never be untagged. The evidence-rule contract assertion in `tests-audit-{heavy,light}.md` enforces this with a regex over the report.

### Pa de Cal
Step 9 in both Heavy and Light. The final user-facing gate. Issues `GO | CONDITIONAL | NO-GO` (Heavy) or adds `ESCALATE-TO-HEAVY` (Light only). The decision applies to **the audit report itself** (is the report complete and evidence-backed?), never to a code change — audits do not produce code.

### light_mode
A Light-tier annotation that flags reduced depth. When `audit-domain-analyzer` is SKIPPED (Light), `audit-compliance-checker` runs in `light_mode`: it does inline domain discovery from `AuditSnapshot` and tags architecture-dependent findings as `[HYPOTHESIS]`. The annotation `light_mode: true` is mirrored in every step 2–4 deliverable JSON.

### escalation
The Light-only mechanism where step 9 recommends promoting the audit to `audit-heavy`. Triggered by ANY of:
- Critical severity finding.
- ≥30% of findings tagged `[HYPOTHESIS]`.
- Cascade risk across 3+ areas.
- Regulatory keyword in scope (GDPR, HIPAA, SOC2, LGPD).

Escalation is surfaced as the recommended option in the AskUserQuestion gate at step 9, but the user may override (with explicit acknowledgement of residual risk).

### SSOT (Single Source of Truth)
The authoritative location for a piece of state. Audit step 3 maps `ssot_map` per state concept. Mismatches between SSOT and downstream consumers (contracts, frontend, cache) are flagged as `inconsistency_risks` and bubble up to the risk matrix. Audit reports the SSOT divergence; choosing which side is "right" is a Bug Fix / Feature decision, not an audit decision.

### atomicity / independence / cascade effect / coupling
Architecture concepts applied at step 2:

- **Coupling** — tight dependency between modules. High-coupling nodes are central files imported by many; changes to them ripple.
- **Cascade effect** — a change in one place that breaks others. The risk surface area when coupling is high.
- **Atomicity** — small, reversible changes. The architectural ideal: a fix lands in one file with one commit and can be reverted with one revert.
- **Independence** — extension without touching the core. Plugin architectures, declarative configs, and well-defined seams enable this.

The audit reports where these properties hold and where they break, but does not propose refactors.

### deliverable JSON shape
Every step produces a typed JSON deliverable in addition to the narrative. The schemas:

| Step | Heavy | Light |
|------|-------|-------|
| 1 | `AuditIntake` | `AuditSnapshot` |
| 2 | `DependencyImpactAudit` | `ArchitectureAudit` |
| 3 | `DecisionSSOTAudit` | `DomainSSOTAudit` |
| 4 | `ContractGovernanceAudit` | `ContractAudit` |
| 5 | `DataGovernanceAudit` | `DataAudit` |
| 6 | `FrontendDeepAudit` | `FrontendAudit` |
| 7 | `BackendDeepAudit` | `BackendAudit` |
| 8 | `DeliveryGovernanceAudit` | `QualityOpsAudit` |
| 9 | `AuditMasterSeal` | `AuditFinalSeal` |

The shape is frozen at the skill contract layer. Any change requires a minor-version bump and a migration note.

### audit_id
The unique identifier for an audit run. Format: `<YYYYMMDD-HHMM>-<scope-slug>` (Heavy) or `<YYYYMMDD-HHMM>-<scope-slug>-light` (Light). Used for downstream cross-reference (Bug Fix / Feature pipelines that act on findings cite the source audit_id + finding ID).

### finding ID
Format: `AUDIT-NNN` (Heavy) or `AUDIT-LIGHT-NNN` (Light). Assigned at step 9 during deduplication. Stable for the lifetime of the audit_id; downstream remediation pipelines reference these IDs.

## Cross-references

- `references/pipelines/audit-heavy.md` — team composition (which agent runs at which step).
- `references/pipelines/audit-light.md` — team composition (Light tier).
- `skills/audit-heavy/SKILL.md` — prescriptive 9-step Heavy procedure.
- `skills/audit-light/SKILL.md` — prescriptive 9-step Light procedure.
- `agents/executor/type-specific/audit-{intake,domain-analyzer,compliance-checker,risk-matrix-generator}.md` — agent contracts.
- `references/gates.md` — Hardness Taxonomy (gates referenced in audit reports' `recommended_gates`).
- `designs/pipeline-orchestrator-v5-consolidated.md` §22 — Slice 3a design rationale.
- Pulsar source playbook (read-only ancestor): `D:\Projeto Pulsar\.claude\commands\Prompts\Audtiroria\`.

## Versioning

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-02 | Initial — Slice 3a (audit import). |
