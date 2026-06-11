# Test Strategy — UX Sim Light (5 prescriptive steps)

> **Note:** UX Simulation pipelines are **REPORT ONLY**. The "tests" below are golden-run / contract tests that validate the simulation *workflow*. No code is modified at any step.

## Source ancestry

Synthesized from `references/pipelines/ux-sim-light.md` (team table + Step-by-Step Flow + report format) and the three UX agent contracts (`ux-simulator`, `ux-qa-validator`, `ux-accessibility-auditor`). The journey-walkthrough step follows the style of the Pulsar Bug Fix `HEAVY_09_UX_USER_JOURNEY_SIMULATION` playbook. There is no Pulsar UX source folder.

## What gets tested

| Layer | What we test | How |
|-------|--------------|-----|
| Frontmatter contract | Each `steps/0X-*.md` declares all required fields incl. `production_writes_allowed: false`. | Static parser walks all 5 step files. |
| Sequence lock | Steps execute strictly 1→2→3→4→5. | Golden run; audit log shows linear transitions. |
| Iron Law (read-only) | No Edit / Write call originates from any UX agent or step body. | `edit-guard-hook.cjs`. |
| Gate at step 1 | AskUserQuestion `Jornada` invoked once (journey scope approval). | Hook event capture. |
| Gate at step 5 | AskUserQuestion `UX` invoked with dynamic recommendation (NO-GO when a blocker exists). | Golden runs across fixture types. |
| Sentinel checkpoints | Sentinel state validates before steps 1 and 5 (`pre_1`, `pre_5`). | `sentinel-hook` events. |
| STOP RULE | 2 consecutive failures halt the pipeline. | Inject failure; expect halt. |
| Output schema | Each step's `expected_outputs` is well-typed and chains to the next step. | Schema check on JSON deliverables. |
| Evidence rule | Every friction point has file:line OR explicit `[NEEDS-RUNTIME-VERIFICATION]`. | Regex check on report text. |
| Problems-first | The report leads with problems, not praise; sorted by impact. | Golden run; report ordering check. |
| Light skip | `ux-accessibility-auditor` is SKIPPED; a11y folded inline in `ux-simulator`. | Agent-dispatch trace shows no auditor spawn. |

## Per-step contract assertions (Light)

- **Step 1 — JourneyMap** has 2-3 journeys, each with entry/steps/exit + evidence; gate `Jornada` invoked; escalation candidate flagged when >3 journeys.
- **Step 2 — SimulationPlan** has a representative persona + per-journey pages/states with file references; inline a11y notes present.
- **Step 3 — UX_SIMULATION** has persona matrix (1 in Light) + journey maps + `friction_catalog` with file-level evidence; 5 Bug-Fix-HEAVY-09 validation questions answered.
- **Step 4 — UX_QA_REPORT** all findings severity-tagged; duplicates merged; priority matrix populated; action items have definition of done.
- **Step 5 — UX_SIMULATION_REPORT** has `journeys_tested`, `problems_found{blocker,major,minor}`, `top_problems[]`; `ux_assessment` ∈ `{GO, CONDITIONAL, NO-GO}`; AskUserQuestion option 1 dynamic (NO-GO recommended when a blocker exists).

## Golden runs (suggested)

- **clean-2-journey-flow** — exercises full 5 steps; expects clean GO.
- **blocker-journey-fixture** — seeds a dead-end journey → step 5 must recommend NO-GO.
- **library-no-ui-fixture** — exercises N/A handling: journeys with no evidenced UI surface declare "not evidenced".

## Anti-tests

- No code modification (Iron Law).
- No skip / reorder (sequence_lock).
- No prose substitute for AskUserQuestion at steps 1 and 5.
- No new findings invented at step 4 (consolidation only — `ux-qa-validator` does not discover).
- No GO at step 5 when a blocker exists (override must be a conscious AskUserQuestion choice, not the agent's default).
- No praise-first report (problems must lead).
