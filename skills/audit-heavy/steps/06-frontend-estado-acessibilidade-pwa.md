---
step_number: 6
step_name: "frontend-estado-acessibilidade-pwa"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-compliance-checker"
production_writes_allowed: false
expected_inputs:
  - AuditIntake: from_step_1
  - DependencyImpactAudit: from_step_2
  - ContractGovernanceAudit: from_step_4
expected_outputs:
  - FrontendDeepAudit: object
  - frontend_narrative: string
  - ui_architecture: object
  - shared_component_risk_map: list
  - state_lifecycle_patterns: list
  - a11y_findings: list
  - pwa_cache_strategy: object
  - ui_regression_controls_recommended: list
expected_next: 7
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 06 — Frontend + State + Accessibility + PWA

## Objective

Deep frontend audit, focused on:

- **UI consistency** (design system, tokens, style coherence).
- **Shared components** and cascade risk (a change in one component affects many screens).
- **State / lifecycle patterns** (loading, error, empty-data, retry, optimistic updates).
- **Accessibility (a11y)** when evidenced (WCAG, semantic HTML, keyboard nav, color contrast).
- **PWA / cache strategy** when present (service worker, cache-first vs network-first, update flow).

The user-facing failure modes detected here surface as "fix works in dev but users see stale UI" or "screen renders but is unusable".

## Why subagent (audit-compliance-checker, second invocation)

Same agent as step 5, fresh context for the frontend pass. Produces a typed `FrontendDeepAudit` deliverable.

## Inputs

- `AuditIntake` (from step 1) — `repo_map` for frontend folders, `stack_detected` for framework.
- `DependencyImpactAudit` (from step 2) — `high_coupling_nodes` often correlate with shared UI components.
- `ContractGovernanceAudit` (from step 4) — to verify frontend reads from the SSOT-respecting contract path.

## Instructions

### 6.1 Frontend narrative

Describe in flowing text user-impacting findings:

- UI architecture (component model, routing, navigation, layout system).
- Shared components and where they are reused.
- State management approach (local state, store, server state cache).
- Data lifecycle (loading / error / empty / success states explicitly handled?).
- Accessibility evidence (a11y libs, ARIA, semantic markup, keyboard handlers).
- PWA evidence (service worker, manifest, cache strategy, update prompt).

Cite file:line for each claim.

### 6.2 FrontendDeepAudit (typed JSON)

Produce the structured deliverable:

```yaml
FrontendDeepAudit:
  ui_architecture:
    framework: <text>
    component_model: <text>
    routing: <text>
    layout_system: <text>
    design_system: <text or "none evidenced">
    tag: <[VERIFIED]>
  shared_component_risk_map:
    - component: <path>
      reused_in_count: <int>
      cascade_risk: <low | medium | high>
      reason: <text>
      tag: <[VERIFIED]>
  state_lifecycle_patterns:
    - pattern: <"loading" | "error" | "empty" | "success" | "retry" | "optimistic" | "stale-while-revalidate">
      coverage: <full | partial | none>
      example_evidence: <file:line>
      tag: <[VERIFIED]>
  a11y_findings:
    - finding: <text>
      file: <path>
      line: <int>
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  pwa_cache_strategy:
    has_service_worker: <true | false>
    cache_strategy: <text or "n/a">
    update_flow: <text or "n/a">
    stale_content_risk: <low | medium | high | n/a>
    tag: <[VERIFIED] | [HYPOTHESIS]>
  ui_regression_controls_recommended:
    - control: <visual regression | interaction tests | a11y CI | snapshot>
      rationale: <text>
      effort_estimate: <S | M | L>
```

### 6.3 Cross-checks

- **vs SSOT (step 3)**: does the frontend read from the same source the backend writes? UI divergence usually starts here.
- **vs Contracts (step 4)**: are frontend types generated from / aligned with the contract source? If hand-written and parallel, drift is inevitable.
- **vs Cascade risk (step 2)**: shared UI components flagged as `high_coupling_nodes` get an automatic high-cascade severity.

## Done criteria

- Frontend narrative written.
- `FrontendDeepAudit` JSON populated with all seven top-level fields.
- ≥1 shared component cataloged with cascade risk (or explicit "no shared components evidenced").
- State lifecycle coverage assessed for loading/error/empty/success.
- A11y findings recorded with severity (or explicit "no a11y signals evidenced").
- PWA presence assessed.

## Outputs (handoff to step 7)

```yaml
FrontendDeepAudit: <full structured JSON above>
frontend_narrative: <text>
ui_architecture: <copied>
shared_component_risk_map: <copied>
state_lifecycle_patterns: <copied>
a11y_findings: <copied>
pwa_cache_strategy: <copied>
ui_regression_controls_recommended: <copied>
```

## Next

Proceed to `steps/07-backend-servicos-erros-auth-observabilidade.md`.
