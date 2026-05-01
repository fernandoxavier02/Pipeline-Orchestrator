# Team Registry — Type-Specific Agent Teams

> **SSOT** for type-to-team mappings. executor-controller reads this file at Step 0 to resolve which agent team to dispatch.

## Type-to-Team Mapping

| task_type | sub_route_condition | variant | team_agents (execution order) | parallel_groups | skip_in_light | mode |
|-----------|--------------------|---------|-----------------------------|----------------|--------------|------|
| Bug Fix | - | heavy | bugfix-diagnostic-agent -> bugfix-root-cause-analyzer -> [executor-implementer-task] -> bugfix-regression-tester | none | - | code-changing |
| Bug Fix | - | light | bugfix-diagnostic-agent -> [executor-implementer-task] -> bugfix-regression-tester | none | bugfix-root-cause-analyzer | code-changing |
| Feature | - | heavy | feature-vertical-slice-planner -> feature-implementer -> feature-integration-validator | none | - | code-changing |
| Feature | - | light | feature-vertical-slice-planner -> feature-implementer | none | feature-integration-validator | code-changing |
| User Story | - | heavy | (same as Feature heavy) | none | - | code-changing |
| User Story | - | light | (same as Feature light) | none | feature-integration-validator | code-changing |
| UX Simulation | - | heavy | [ux-simulator ‖ ux-accessibility-auditor] -> ux-qa-validator | ux-simulator + ux-accessibility-auditor | - | report-only |
| UX Simulation | - | light | ux-simulator -> ux-qa-validator | none | ux-accessibility-auditor | report-only |
| Audit | no adversarial keywords | heavy | audit-intake -> audit-domain-analyzer -> audit-compliance-checker -> audit-risk-matrix-generator | none | - | report-only |
| Audit | no adversarial keywords | light | audit-intake -> audit-compliance-checker -> audit-risk-matrix-generator | none | audit-domain-analyzer | report-only |
| Audit | adversarial keywords + user confirms | heavy | adversarial-review-coordinator -> [adversarial-security-scanner ‖ adversarial-architecture-critic] | adversarial-security-scanner + adversarial-architecture-critic | - | review +/- fix |
| Audit | adversarial keywords + user confirms | light | adversarial-review-coordinator -> adversarial-security-scanner | none | adversarial-architecture-critic | review +/- fix |
| [fallback] | - | any | executor-implementer-task (generic chain) | none | - | code-changing |

## Variant Resolution

| Complexity | Variant |
|-----------|---------|
| COMPLEXA | heavy |
| MEDIA | heavy |
| SIMPLES | light |

> **Terminology note:** "variant" (heavy/light) controls **agent team composition** only — which agents are dispatched and in what order. It is independent of the **pipeline discipline** (heavy/light pipeline reference files in `references/pipelines/`), which controls the outer ceremony (sentinel checkpoints, design interrogator, plan mode). A MEDIA task gets the heavy agent team (all agents) but the light pipeline discipline (fewer sentinel checkpoints). This is intentional: MEDIA tasks need full analysis depth but less overhead ceremony.

## Mode Definitions

| Mode | Behavior |
|------|----------|
| code-changing | Agents write code. Post-execution: spec-reviewer -> quality-reviewer -> checkpoint-validator. Phase 3 active. |
| report-only | Agents produce reports only (IRON LAW: no code changes). Post-execution: CONDITIONAL_SKIP { hardness: "SOFT" }. Phase 3 skip. |
| review +/- fix | review-only: same as report-only. fix mode: critical/high findings -> executor-implementer-task -> spec-reviewer -> quality-reviewer -> checkpoint. Phase 3 active for fix mode. |

## Adversarial Sub-Routing

When task_type == "Audit" AND task description contains adversarial keywords ("adversarial review", "security audit", "threat model"):
1. executor-controller asks via AskUserQuestion: "Detectei keywords adversariais na descricao. Quer executar como Adversarial Review ou Audit normal?"
2. User response determines which team is dispatched
