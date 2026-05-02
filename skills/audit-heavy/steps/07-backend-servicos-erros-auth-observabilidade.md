---
step_number: 7
step_name: "backend-servicos-erros-auth-observabilidade"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-compliance-checker"
production_writes_allowed: false
expected_inputs:
  - AuditIntake: from_step_1
  - DependencyImpactAudit: from_step_2
  - ContractGovernanceAudit: from_step_4
  - DataGovernanceAudit: from_step_5
expected_outputs:
  - BackendDeepAudit: object
  - backend_narrative: string
  - backend_architecture: object
  - validation_and_safety: object
  - authn_authz_model_guess: object
  - error_handling_assessment: object
  - observability_assessment: object
  - reliability_risks_top: list
  - hardening_recommendations: list
expected_next: 8
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 07 — Backend + Services + Errors + Auth + Observability

## Objective

Audit the backend with focus on **reliability** and **security**:

- Structure (routes / controllers / services / repositories).
- **Validation and sanitization** of input.
- **Error handling** without leaking sensitive data.
- **Authentication and authorization** model.
- **Observability** (useful logs with correlation IDs, metrics, tracing).
- **Resilience** (timeouts, retries, idempotency where applicable).

This is the layer where production incidents usually originate. Audit findings here drive most of the post-deploy monitoring recommendations in step 9.

## Why subagent (audit-compliance-checker, third invocation)

Same agent as steps 5 and 6, fresh context for the backend pass. Produces a typed `BackendDeepAudit` deliverable.

## Inputs

- `AuditIntake` (from step 1) — `entry_points` for service surfaces.
- `DependencyImpactAudit` (from step 2) — service-layer coupling.
- `ContractGovernanceAudit` (from step 4) — entry-validation findings.
- `DataGovernanceAudit` (from step 5) — DB access patterns and access controls.

## Instructions

### 7.1 Backend narrative

Describe in flowing text:

- Backend architecture (framework, layering, routing model, service composition).
- Validation pipeline (where input is checked, with what library, what happens on failure).
- Error-handling pipeline (centralized handler? per-route? what gets logged? what gets returned?).
- Auth model (sessions / JWT / OAuth / SSO; role/permission scheme).
- Observability surface (logs, metrics, traces; correlation IDs; structured vs free-form).
- Resilience patterns (timeouts on external calls, retries, idempotency keys, circuit breakers).

Cite file:line for each claim.

### 7.2 BackendDeepAudit (typed JSON)

Produce the structured deliverable:

```yaml
BackendDeepAudit:
  backend_architecture:
    framework: <text>
    layering: <text — controllers/services/repos pattern>
    routing_model: <text>
    tag: <[VERIFIED]>
  validation_and_safety:
    input_validation: <text — library + coverage>
    sanitization: <text — escaping, parameterized queries>
    coverage: <full | partial | none>
    file_evidence: [<file:line>]
    tag: <[VERIFIED]>
  authn_authz_model_guess:
    authn_mechanism: <session | jwt | oauth | sso | api_key | mixed>
    authz_model: <rbac | abac | acl | inline_checks | none>
    sensitive_endpoints_protected: <true | false | partial>
    file_evidence: [<file:line>]
    tag: <[VERIFIED] | [HYPOTHESIS]>
  error_handling_assessment:
    centralized: <true | false>
    leaks_sensitive_data: <true | false | unknown>
    user_facing_messages_quality: <good | poor | mixed>
    file_evidence: [<file:line>]
    tag: <[VERIFIED] | [HYPOTHESIS]>
  observability_assessment:
    logging:
      structured: <true | false>
      correlation_ids: <true | false>
      pii_safety: <safe | unsafe | unknown>
    metrics: <text or "none evidenced">
    tracing: <text or "none evidenced">
    tag: <[VERIFIED] | [HYPOTHESIS]>
  reliability_risks_top:
    - risk: <text — missing timeout, no retry, no idempotency on POST that has side effects>
      affected_path: <route or service>
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  hardening_recommendations:
    - recommendation: <text>
      rationale: <text — what attack/incident it prevents>
      effort_estimate: <S | M | L>
      priority: <P0 | P1 | P2>
```

### 7.3 Cross-checks

- **vs SSOT (step 3)**: do backend services respect the SSOT for state writes? Or do multiple services write the same state inconsistently?
- **vs Contracts (step 4)**: does the validation library at the boundary actually enforce the contract? Or is validation declared but bypassed (e.g., decorator not applied)?
- **vs Data (step 5)**: do queries use parameterized binding and least-privilege roles? Hardcoded SQL with concatenation gets a high-severity tag.

## Done criteria

- Backend narrative written.
- `BackendDeepAudit` JSON populated with all eight top-level fields.
- Auth model identified with sensitive endpoint coverage assessed.
- Error-handling sensitive-data-leak risk evaluated.
- Observability triple (logs / metrics / tracing) assessed.
- Top reliability risks listed with severity.
- Hardening recommendations prioritized P0/P1/P2.

## Outputs (handoff to step 8)

```yaml
BackendDeepAudit: <full structured JSON above>
backend_narrative: <text>
backend_architecture: <copied>
validation_and_safety: <copied>
authn_authz_model_guess: <copied>
error_handling_assessment: <copied>
observability_assessment: <copied>
reliability_risks_top: <copied>
hardening_recommendations: <copied>
```

## Next

Proceed to `steps/08-governanca-testes-ci-cd-documentacao.md`.
