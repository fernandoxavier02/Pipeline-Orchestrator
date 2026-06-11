# Test Strategy — UX Sim Heavy (7 prescriptive steps)

> **Note:** UX Simulation pipelines are **REPORT ONLY**. The "tests" below are golden-run / contract tests that validate the comprehensive simulation *workflow*. No code is modified at any step.

## Source ancestry

Synthesized from `references/pipelines/ux-sim-heavy.md` (team table + Step-by-Step Flow + report format + parallel-dispatch note) and the three UX agent contracts (`ux-simulator`, `ux-accessibility-auditor`, `ux-qa-validator`). The per-journey-walkthrough step follows the style of the Pulsar Bug Fix `HEAVY_09_UX_USER_JOURNEY_SIMULATION` playbook. There is no Pulsar UX source folder.

## What gets tested

| Layer | What we test | How |
|-------|--------------|-----|
| Frontmatter contract | Each `steps/0X-*.md` declares all required fields incl. `production_writes_allowed: false`. | Static parser walks all 7 step files. |
| Sequence lock | Steps execute strictly 1→2→3→4→5→6→7. | Golden run; audit log shows linear transitions. |
| Iron Law (read-only) | No Edit / Write call originates from any UX agent or step body. | `edit-guard-hook.cjs`. |
| Parallel dispatch | Steps 3 (`ux-simulator`) and 5 (`ux-accessibility-auditor`) dispatched in parallel (single message, two Task calls). | Dispatch-trace shows both spawned together. |
| Gate at step 1 | AskUserQuestion `Escopo` invoked once (journey scope approval). | Hook event capture. |
| Gate at step 6 | AskUserQuestion `Adversarial` invoked (review approval). | Hook event capture. |
| Gate at step 7 | AskUserQuestion `UX` invoked with dynamic recommendation (NO-GO when a blocker or accessibility FAIL exists). | Golden runs across fixture types. |
| Sentinel checkpoints | Sentinel state validates before steps 1, 3, 6, 7. | `sentinel-hook` events. |
| Plan Mode | COMPLEXA discipline: simulation execution order planned before step 2. | Plan-mode note present in step-1 output. |
| STOP RULE | 2 consecutive failures halt the pipeline. | Inject failure; expect halt. |
| Output schema | Each step's `expected_outputs` is well-typed and chains to the next step. | Schema check on JSON deliverables. |
| Evidence rule | Every finding/violation has file:line OR explicit `[CODE-ANALYSIS]`/`[NEEDS-RUNTIME-VERIFICATION]`. | Regex check on report text. |
| Problems-first | The report leads with problems, not praise; sorted by user impact. | Golden run; report ordering check. |

## Per-step contract assertions (Heavy)

- **Step 1 — JourneyInventory** has 5+ journeys, 3+ personas, devices, accessibility needs + plan-mode note; gate `Escopo` invoked.
- **Step 2 — StateMatrix** enumerates journey × persona × device × critical-state cells with setup requirements + file references.
- **Step 3 — UX_SIMULATION** full persona matrix (3+, worst-case + most-frequent identified) + journey maps (min-3 alternative paths) + `friction_catalog`; technical checkpoints with replicable commands.
- **Step 4 — CrossCuttingFindings** recurring patterns (3+ journeys = systemic) + inconsistencies + consolidated friction (duplicates merged).
- **Step 5 — A11Y_REPORT** WCAG 2.1 AA violations + keyboard-nav + contrast + touch-target issues with file:line + confidence tags.
- **Step 6 — AdversarialFindings** challenges severity tags + missed vectors; gate `Adversarial` invoked; final security review opt-in.
- **Step 7 — UX_SIMULATION_REPORT** has `journeys_tested`, `personas_covered`, `devices_tested`, `problems_found{blocker,major,minor,accessibility}`, `top_problems[]`, `cross_cutting_issues[]`, `accessibility_summary{}`; `ux_assessment` ∈ `{GO, CONDITIONAL, NO-GO}`; gate `UX` invoked with dynamic recommendation.

## Golden runs (suggested)

- **clean-5-journey-cross-device** — exercises all 7 steps; expects clean GO.
- **blocker-journey-fixture** — seeds a dead-end journey → step 7 must recommend NO-GO.
- **a11y-fail-fixture** — seeds a keyboard trap / contrast failure → accessibility_summary FAIL → step 7 must recommend NO-GO (compliance risk).
- **systemic-pattern-fixture** — seeds the same friction across 3+ journeys → step 4 must surface it as a cross-cutting pattern.

## Anti-tests

- No code modification (Iron Law).
- No skip / reorder (sequence_lock).
- No prose substitute for AskUserQuestion at steps 1, 6, 7.
- No new findings invented at step 4 (consolidation/pattern analysis only).
- No GO at step 7 when a blocker or accessibility FAIL exists (override must be a conscious AskUserQuestion choice).
- No praise-first report (problems must lead).
- No serial dispatch of steps 3 + 5 when parallel is contractually required.
