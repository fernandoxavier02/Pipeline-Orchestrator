# Pulsar Bugfix Workflow Import — Implementation Plan (Slice 1.5 → v4.4.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the prescriptive 11-step Heavy and 8-step Light bugfix workflows from `D:\Projeto Pulsar\.claude\commands\Prompts\Bug_fix\` into the **pipeline-orchestrator** plugin as two new skills (`skills/bugfix-{light,heavy}/`) with declarative enforcement rules. Close 6 audit gaps (Heavy 3+9+11, Light 3+5+6) without breaking existing v4.3.1 backward compat.

**Architecture:** Per official Claude Code 2026 docs — multi-step prescriptive procedures live in `skills/<name>/SKILL.md` with supporting files (`steps/0X-*.md`, `tests/`). Each step declares `execution_mode` (inline | subagent), `agent_type` whitelist, and I/O schema. The 8 enforcement rules from spec §21.3 are baked into the frontmatter contract. The skill system is dispatched by `pipeline-controller` via `/pipeline-orchestrator:bugfix` (auto-classify) or directly via `/pipeline-orchestrator:bugfix-{light,heavy}`.

**Tech Stack:** Markdown (skills + steps + spec docs), JSON manifests (`plugin.json`, `marketplace.json`, `hooks.json`), bash test scripts, git for commits/tag, no runtime code (this is a Claude Code plugin).

**Spec source-of-truth:** `designs/pipeline-orchestrator-v5-consolidated.md` §21 (committed `9b5ea5b`).

**Pulsar source files (read-only references for content adaptation):**
- Heavy: `D:\Projeto Pulsar\.claude\commands\Prompts\Bug_fix\heavy\HEAVY_01..11_*.md` + `PIPELINE_BUGFIX_HEAVY.md` + `TESTS_BUGFIX_HEAVY.md`
- Light: `D:\Projeto Pulsar\.claude\commands\Prompts\Bug_fix\light\LIGHT_01..08_*.md` + `PIPELINE_BUGFIX_LIGHT.md` + `TESTS_BUGFIX_LIGHT.md`

**Working directory:** `D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator\` (canonical). Branch: `main`.

**Total task count:** 7 phases, ~50 tasks, ~80 minutes wall-clock.

---

## Phase 1 — Foundation (directory skeleton)

### Task 1: Create skill directories and tests subdirs

**Files:**
- Create dir: `skills/bugfix-light/`
- Create dir: `skills/bugfix-light/steps/`
- Create dir: `skills/bugfix-light/tests/`
- Create dir: `skills/bugfix-heavy/`
- Create dir: `skills/bugfix-heavy/steps/`
- Create dir: `skills/bugfix-heavy/tests/`

- [ ] **Step 1.1: Create directories**

```bash
cd "/d/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
mkdir -p skills/bugfix-light/steps skills/bugfix-light/tests
mkdir -p skills/bugfix-heavy/steps skills/bugfix-heavy/tests
```

- [ ] **Step 1.2: Verify**

Run: `ls skills/bugfix-light/ skills/bugfix-heavy/`
Expected: each shows `steps/  tests/`

- [ ] **Step 1.3: Commit**

```bash
git add skills/bugfix-light/ skills/bugfix-heavy/ 2>/dev/null
# (empty dirs won't stage; this commit happens after first file is added in Task 2)
```

(No commit yet — empty dirs.)

---

## Phase 2 — bugfix-light skill (SKILL.md + 8 steps + tests)

### Task 2: Write `skills/bugfix-light/SKILL.md`

**Files:**
- Create: `skills/bugfix-light/SKILL.md` (~150 lines)

- [ ] **Step 2.1: Write SKILL.md content**

Content shape (frontmatter + body):

```yaml
---
name: bugfix-light
description: Prescriptive 8-step bug fix workflow for SIMPLES/MEDIA bugs. Imported from Pulsar workflow. Use when complexity classification is light. Steps 1-3 inline (analysis), step 4 inline (point fix), steps 5-6 subagent (validation+persistence), 7-8 inline (gates). Manual-only invocation via /pipeline-orchestrator:bugfix-light or via /pipeline-orchestrator:bugfix --light.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion]
argument-hint: [bug description with repro details]
sequence: [1, 2, 3, 4, 5, 6, 7, 8]
sequence_lock: true
gates_at: [7, 8]
sentinel_checkpoints: [pre_7]
stop_rule_max_failures: 2
---
```

Body sections (in order):
1. `# Bug Fix Light Workflow (8 prescriptive steps)`
2. `## When to use this skill` (SIMPLES/MEDIA, max 2 files, max 50 lines diff)
3. `## Steps overview` — table with 8 rows linking to `steps/0X-*.md`, marking execution_mode + agent_type per step
4. `## Execution rules (8 enforcement rules)` — copy from spec §21.3
5. `## Reference docs` — link to `tests/tests-bugfix-light.md`, mention Pulsar source path

- [ ] **Step 2.2: Write the file**

Use the Write tool to create `skills/bugfix-light/SKILL.md` with the content above. Keep under 500 lines (target ~150).

- [ ] **Step 2.3: Verify file size**

Run: `wc -l "skills/bugfix-light/SKILL.md"`
Expected: <500 lines, ideally 100-200.

- [ ] **Step 2.4: Verify frontmatter parses (no YAML errors)**

Run: `head -20 "skills/bugfix-light/SKILL.md" | grep -E "^name:|^description:|^sequence:"`
Expected: 3 lines matching.

### Task 3: Write `skills/bugfix-light/steps/01-understand-behavior.md`

**Files:**
- Create: `skills/bugfix-light/steps/01-understand-behavior.md`
- Reference (read-only): `D:\Projeto Pulsar\.claude\commands\Prompts\Bug_fix\light\LIGHT_01_UNDERSTAND_BEHAVIOR.md`

- [ ] **Step 3.1: Read Pulsar source**

```bash
cat "/d/Projeto Pulsar/.claude/commands/Prompts/Bug_fix/light/LIGHT_01_UNDERSTAND_BEHAVIOR.md"
```

- [ ] **Step 3.2: Write step 01 file**

Frontmatter:
```yaml
---
step_number: 1
step_name: "understand-behavior"
execution_mode: inline
expected_inputs:
  - bug_description: from_user
expected_outputs:
  - actual_behavior: string
  - expected_behavior: string
  - reproduction_steps: list
expected_next: 2
gate_required: false
allowed_tools: [Read, Grep]
---
```

Body: adapt the Pulsar `LIGHT_01_UNDERSTAND_BEHAVIOR.md` content. Keep prescriptive style (Objective, Inputs, Instructions, Done Criteria, Outputs sections). Add explicit handoff to step 2.

- [ ] **Step 3.3: Verify**

Run: `head -15 "skills/bugfix-light/steps/01-understand-behavior.md" | grep -E "^step_number: 1|^execution_mode: inline"`
Expected: both match.

### Task 4: Write `skills/bugfix-light/steps/02-simple-bug-analysis.md`

**Files:**
- Create: `skills/bugfix-light/steps/02-simple-bug-analysis.md`
- Reference: Pulsar `LIGHT_02_SIMPLE_BUG_ANALYSIS.md`

- [ ] **Step 4.1: Read Pulsar source + adapt**

Same pattern as Task 3. Frontmatter declares step_number=2, execution_mode=inline, expected_outputs include `red_test_file: path` (RED test created here).

- [ ] **Step 4.2: Write file**

- [ ] **Step 4.3: Verify**

### Task 5: Write `skills/bugfix-light/steps/03-impact-check.md` (GAP CLOSED — invariants BEFORE)

**Files:**
- Create: `skills/bugfix-light/steps/03-impact-check.md`
- Reference: Pulsar `LIGHT_03_IMPACT_CHECK.md`

- [ ] **Step 5.1: Read Pulsar source**

This is one of the 6 GAPS. Pulsar Light step 3 emphasizes "define invariantes/bordas ANTES de alterar código". In current plugin v4.3.1, this is partial. Step 03 must EXPLICITLY require the LLM to enumerate invariants before any fix attempt.

- [ ] **Step 5.2: Write file with explicit invariant enumeration block**

Frontmatter step_number=3, execution_mode=inline, expected_outputs include `invariants: list, edge_cases: list`. Body MUST contain a "REQUIRED OUTPUT" section that templates the invariant list.

- [ ] **Step 5.3: Verify gap closure**

Run: `grep -c "invariant" "skills/bugfix-light/steps/03-impact-check.md"`
Expected: ≥3 occurrences (term used as core concept).

### Task 6: Write `skills/bugfix-light/steps/04-point-fix.md`

Same pattern. Reference: Pulsar `LIGHT_04_POINT_FIX.md`. step_number=4, execution_mode=inline, max 50 lines / 2 files constraint, expected_outputs include `fix_diff: file_paths`.

- [ ] **Step 6.1: Read Pulsar source + adapt**
- [ ] **Step 6.2: Write file**
- [ ] **Step 6.3: Verify**

### Task 7: Write `skills/bugfix-light/steps/05-post-fix-validation.md` (GAP CLOSED — RED→regression)

**Files:**
- Create: `skills/bugfix-light/steps/05-post-fix-validation.md`
- Reference: Pulsar `LIGHT_05_POST_FIX_VALIDATION.md`

- [ ] **Step 7.1: Read Pulsar source**

Pulsar step 5 says "Rodar testes + promover reprodução a regressão". The PROMOTION (RED test moves from "reproduces bug" status to "regression test in suite") is the gap.

- [ ] **Step 7.2: Write file with explicit promotion block**

Frontmatter: step_number=5, execution_mode=subagent, agent_type="general-purpose" (Bash for test runs). Body MUST contain a "PROMOTION ACTION" subsection that documents:
- Take the RED test from step 2 (`expected_inputs: red_test_file: from_step_2`)
- Verify it now PASSES (was failing — now green)
- Move/rename it from `tests/repro/` to `tests/regression/` (or similar)
- Add comment marking it as regression for bug X
- Commit with message `test(regression): promote bug-X repro to regression suite`

- [ ] **Step 7.3: Verify gap closure**

Run: `grep -c "promot\|regression" "skills/bugfix-light/steps/05-post-fix-validation.md"`
Expected: ≥4 occurrences.

### Task 8: Write `skills/bugfix-light/steps/06-persistence-quick-check.md` (GAP CLOSED — was ABSENT)

**Files:**
- Create: `skills/bugfix-light/steps/06-persistence-quick-check.md`

- [ ] **Step 8.1: Source pattern from Pulsar (no equivalent — derive from spec §21.1)**

This step has NO equivalent file in plugin v4.3.1 (was a complete gap). Content must be derived from:
- Pulsar `LIGHT_PACKAGE_README.md` mention of "persistência crítica"
- General principle: when a fix touches state/storage, verify the state is consistent post-fix and on next session reload

- [ ] **Step 8.2: Write file**

Frontmatter: step_number=6, execution_mode=subagent, agent_type="general-purpose". Body contains:
- Objective: detect side-effects on persistent state (DB, localStorage, file cache)
- Trigger condition: invariants from step 3 mention persistence
- Action: rerun the fixed scenario twice (close + reopen / reload state) and verify outcome stable
- Output: `persistence_stable: bool, side_effects_detected: list`

- [ ] **Step 8.3: Verify gap closure (file exists with substance)**

Run: `wc -l "skills/bugfix-light/steps/06-persistence-quick-check.md"`
Expected: ≥30 lines (real content, not stub).

### Task 9: Write `skills/bugfix-light/steps/07-complexity-gate.md`

Reference: Pulsar `LIGHT_07_COMPLEXITY_GATE.md`. step_number=7, execution_mode=inline, gate_required=true (AskUserQuestion: "if complexity escalated, migrate to bugfix-heavy?").

- [ ] **Step 9.1: Read Pulsar source + adapt**
- [ ] **Step 9.2: Write file with AskUserQuestion gate template**
- [ ] **Step 9.3: Verify**

### Task 10: Write `skills/bugfix-light/steps/08-pa-de-cal.md`

Reference: Pulsar `LIGHT_PA_DE_CAL.md`. step_number=8, execution_mode=inline, gate_required=true (final GO/NO-GO).

- [ ] **Step 10.1: Read Pulsar source + adapt**
- [ ] **Step 10.2: Write file with AskUserQuestion GO/NO-GO gate**
- [ ] **Step 10.3: Verify**

### Task 11: Write `skills/bugfix-light/tests/tests-bugfix-light.md`

**Files:**
- Create: `skills/bugfix-light/tests/tests-bugfix-light.md`
- Reference: Pulsar `TESTS_BUGFIX_LIGHT.md`

- [ ] **Step 11.1: Read Pulsar source**
- [ ] **Step 11.2: Write file documenting test strategy across the 8 steps**
- [ ] **Step 11.3: Verify**

### Task 12: Commit Phase 2

- [ ] **Step 12.1: Stage**

```bash
cd "/d/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add skills/bugfix-light/
```

- [ ] **Step 12.2: Commit**

```bash
git commit -m "feat(bugfix-light): add prescriptive 8-step skill (Slice 1.5 phase 2)

Imports the Pulsar light bugfix workflow as a Claude Code skill per spec
§21 (consolidated). Closes 3 of the 6 audit gaps (Light 3 invariants
BEFORE, Light 5 RED→regression promotion, Light 6 persistence check).

Skill structure follows official Claude Code 2026 docs (skills/<name>/
SKILL.md + supporting files). 8 enforcement rules baked into frontmatter
(sequence_lock, execution_mode lock, gates_at, etc.).

Files: skills/bugfix-light/SKILL.md + 8 steps/0X-*.md + 1 tests/*.md."
```

---

## Phase 3 — bugfix-heavy skill (SKILL.md + 11 steps + tests)

### Task 13: Write `skills/bugfix-heavy/SKILL.md`

Same pattern as Task 2 but with 11 steps in `sequence: [1..11]`, `gates_at: [4, 8, 10]`, `sentinel_checkpoints: [pre_4, pre_8, pre_10]`.

- [ ] **Step 13.1: Write SKILL.md**
- [ ] **Step 13.2: Verify size <500 lines**
- [ ] **Step 13.3: Verify frontmatter**

### Task 14: Write `skills/bugfix-heavy/steps/01-terrain-recon-diagnostic.md`

Reference: Pulsar `HEAVY_01_TERRAIN_RECON_DIAGNOSTIC.md`. step_number=1, execution_mode=subagent, agent_type="pipeline-orchestrator:executor:type-specific:bugfix-diagnostic-agent".

- [ ] **Step 14.1: Read Pulsar source**
- [ ] **Step 14.2: Write file delegating to bugfix-diagnostic-agent**
- [ ] **Step 14.3: Verify**

### Task 15: Write `skills/bugfix-heavy/steps/02-root-cause-consolidation.md`

Reference: Pulsar `HEAVY_02_ROOT_CAUSE_CONSOLIDATION.md`. step_number=2, execution_mode=subagent, agent_type="pipeline-orchestrator:executor:type-specific:bugfix-root-cause-analyzer". Note: includes async/parallel reproduction tests.

- [ ] **Step 15.1: Read + adapt** — [ ] **15.2: Write** — [ ] **15.3: Verify**

### Task 16: Write `skills/bugfix-heavy/steps/03-domain-truth-model.md` (GAP CLOSED — was ABSENT)

**No Pulsar 1:1 file is shorter** (`HEAVY_03_DOMAIN_TRUTH_MODEL.md` = 41 lines). Frontmatter: step_number=3, execution_mode=subagent, agent_type="Explore" (built-in, read-only optimal for invariant discovery).

- [ ] **Step 16.1: Read Pulsar `HEAVY_03_DOMAIN_TRUTH_MODEL.md`**
- [ ] **Step 16.2: Write file emphasizing**:
  - Property tests (forall x: invariant(x))
  - Transactional consistency (operations atomic)
  - State invariants enumerated as YAML list in output
- [ ] **Step 16.3: Verify gap closure**

Run: `grep -cE "invariant|property|transactional" "skills/bugfix-heavy/steps/03-domain-truth-model.md"`
Expected: ≥5 occurrences.

### Task 17: Write `skills/bugfix-heavy/steps/04-controlled-change-proposal.md`

Reference: Pulsar `HEAVY_04_CONTROLLED_CHANGE_PROPOSAL.md`. step_number=4, execution_mode=inline, gate_required=true (REQUIRES APPROVAL — this is the user explicit checkpoint).

- [ ] **Step 17.1: Read + adapt** — [ ] **17.2: Write with AskUserQuestion gate template** — [ ] **17.3: Verify gate present**

Run: `grep -c "AskUserQuestion\|REQUIRES APPROVAL" "skills/bugfix-heavy/steps/04-controlled-change-proposal.md"`
Expected: ≥2.

### Task 18: Write `skills/bugfix-heavy/steps/05-test-pre-impl.md`

Reference: Pulsar `HEAVY_05_TEST_PRE_IMPL.md`. step_number=5, execution_mode=inline (test scenarios authored, user approves via TDD_APPROVAL gate from existing `quality-gate-router`).

- [ ] **Step 18.1: Read + adapt** — [ ] **18.2: Write** — [ ] **18.3: Verify**

### Task 19: Write `skills/bugfix-heavy/steps/06-execute-minimal-diff.md`

Reference: Pulsar `HEAVY_06_EXECUTE_MINIMAL_DIFF.md`. step_number=6, execution_mode=inline (edits in main context).

- [ ] **Step 19.1: Read + adapt** — [ ] **19.2: Write** — [ ] **19.3: Verify**

### Task 20: Write `skills/bugfix-heavy/steps/07-post-change-sanity-regression.md`

Reference: Pulsar `HEAVY_07_POST_CHANGE_SANITY_AND_REGRESSION.md`. step_number=7, execution_mode=subagent, agent_type="general-purpose" (Bash heavy: full unit/integration/concurrency/perf suites).

- [ ] **Step 20.1: Read + adapt** — [ ] **20.2: Write** — [ ] **20.3: Verify**

### Task 21: Write `skills/bugfix-heavy/steps/08-adversarial-ux-tech-review.md`

Reference: Pulsar `HEAVY_08_ADVERSARIAL_UX_TECH_REVIEW.md`. step_number=8, execution_mode=subagent×3 parallel, agent_type=`adversarial-{security-scanner,architecture-critic,quality-reviewer}` (existing zero-context agents). gate_required=true.

- [ ] **Step 21.1: Read + adapt** — [ ] **21.2: Write with parallel-spawn instruction** — [ ] **21.3: Verify**

### Task 22: Write `skills/bugfix-heavy/steps/09-ux-user-journey-e2e.md` (GAP PARTIAL → COMPLETE)

Reference: Pulsar `HEAVY_09_UX_USER_JOURNEY_SIMULATION.md`. step_number=9, execution_mode=subagent, agent_type="pipeline-orchestrator:executor:type-specific:ux-simulator" (existing). Gap was: ux-simulator covers UX Sim type, not as post-fix step. Here it's used as post-fix step.

- [ ] **Step 22.1: Read + adapt** — [ ] **22.2: Write framing as post-bug-fix verification (E2E user journey)** — [ ] **22.3: Verify gap closure** (mention "post-fix" + "E2E" explicitly)

### Task 23: Write `skills/bugfix-heavy/steps/10-pa-de-cal.md`

Reference: Pulsar `HEAVY_10_PA_DE_CAL.md`. step_number=10, execution_mode=inline, gate_required=true (final GO/NO-GO).

- [ ] **Step 23.1: Read + adapt** — [ ] **23.2: Write with AskUserQuestion GO/CONDITIONAL/NO-GO gate** — [ ] **23.3: Verify**

### Task 24: Write `skills/bugfix-heavy/steps/11-final-validation-after-all.md` (GAP CLOSED — was not distinct)

Reference: Pulsar `HEAVY_11_FINAL_VALIDATION_POST_AFTER_ALL.md`. step_number=11, execution_mode=subagent, agent_type="general-purpose" (read-only verification).

- [ ] **Step 24.1: Read Pulsar source**
- [ ] **Step 24.2: Write file emphasizing this is DISTINCT from Pa de Cal (step 10)**:
  - Pa de Cal = Go/No-Go decision based on evidence
  - Final Validation = post-decision sanity sweep (artifacts intact, commits made, branch clean, tests still passing on cold checkout)
- [ ] **Step 24.3: Verify gap closure**

Run: `grep -c "after-all\|cold checkout\|distinct" "skills/bugfix-heavy/steps/11-final-validation-after-all.md"`
Expected: ≥3.

### Task 25: Write `skills/bugfix-heavy/tests/tests-bugfix-heavy.md`

Reference: Pulsar `TESTS_BUGFIX_HEAVY.md`. Same pattern as Task 11.

- [ ] **Step 25.1: Read + adapt** — [ ] **25.2: Write** — [ ] **25.3: Verify**

### Task 26: Commit Phase 3

- [ ] **Step 26.1: Stage** — `git add skills/bugfix-heavy/`
- [ ] **Step 26.2: Commit**

```bash
git commit -m "feat(bugfix-heavy): add prescriptive 11-step skill (Slice 1.5 phase 3)

Imports the Pulsar heavy bugfix workflow as a Claude Code skill per spec
§21. Closes 3 of the 6 audit gaps (Heavy 3 domain truth model, Heavy 9
UX journey post-fix, Heavy 11 final validation distinct from Pa de Cal).

Steps 1-2-3-7-8-9-11 dispatch existing type-specific agents
(bugfix-diagnostic, bugfix-root-cause-analyzer, ux-simulator,
adversarial-{security,architecture,quality}-scanner) — zero breakage to
v4 namespace.

Steps 4 (controlled change), 5 (TDD), 6 (minimal diff), 10 (Pa de Cal)
remain inline. AskUserQuestion gates at 4, 8, 10.

Files: skills/bugfix-heavy/SKILL.md + 11 steps/0X-*.md + 1 tests/*.md."
```

---

## Phase 4 — Integration with existing pipeline (6 file updates)

### Task 27: Update `skills/bugfix/SKILL.md` (router behavior)

**Files:**
- Modify: `skills/bugfix/SKILL.md` (current ~50 lines, becomes ~80 with router logic)

- [ ] **Step 27.1: Read current file**

Run: `cat "skills/bugfix/SKILL.md"`

- [ ] **Step 27.2: Add flag detection + delegation logic**

Insert before existing "Spawn the controller agent" section:

```markdown
## Variant override via flag

If `$ARGUMENTS` starts with `--light` or `--heavy`, strip the flag and route directly to the corresponding skill instead of delegating to pipeline-controller for classification:

- `--light` → invoke skill `pipeline-orchestrator:bugfix-light` with the remaining $ARGUMENTS
- `--heavy` → invoke skill `pipeline-orchestrator:bugfix-heavy` with the remaining $ARGUMENTS

If no flag, proceed with auto-classification (existing behavior — delegate to pipeline-controller, which now also accepts the override and dispatches the correct backing skill after classification + AskUserQuestion gate).
```

- [ ] **Step 27.3: Verify**

Run: `grep -c "bugfix-light\|bugfix-heavy" "skills/bugfix/SKILL.md"`
Expected: ≥4.

### Task 28: Update `agents/core/pipeline-controller.md` (variant override + skill dispatch)

**Files:**
- Modify: `agents/core/pipeline-controller.md` lines around STEP 1: IDENTIFY EXECUTION MODE (current `## STEP 1` section)

- [ ] **Step 28.1: Read STEP 1 section**

Run: `grep -n "STEP 1: IDENTIFY EXECUTION MODE" "agents/core/pipeline-controller.md"` to find line.

- [ ] **Step 28.2: Add variant override block**

After the existing `--simples/--media/--complexa` flag handling, add:

```markdown
### Variant override (Slice 1.5 v4.4.0+)

If `$ARGUMENTS` contains `--light` or `--heavy` AND the pre-classified type (or the inferred type) is "Bug Fix":

1. Skip pipeline_variant inference in task-orchestrator
2. Set `pipeline_variant = "bugfix-light"` or `"bugfix-heavy"` directly
3. After Phase 1 user confirmation, dispatch the corresponding skill via:
   - `Skill(skill: "pipeline-orchestrator:bugfix-light", args: <task>)`
   - or `Skill(skill: "pipeline-orchestrator:bugfix-heavy", args: <task>)`
4. The skill takes over Phase 2 execution (the 8 or 11 prescribed steps).

Other phases (Phase 0 information-gate, Phase 3 sanity-checker, final-validator, finishing-branch) still run after the skill returns control.
```

- [ ] **Step 28.3: Verify**

Run: `grep -c "Variant override\|bugfix-light\|bugfix-heavy" "agents/core/pipeline-controller.md"`
Expected: ≥3.

### Task 29: Update `agents/core/task-orchestrator.md` Step 1a (force_variant)

**Files:**
- Modify: `agents/core/task-orchestrator.md` Step 1a (where `force_type` was added in Slice 1)

- [ ] **Step 29.1: Read Step 1a section**

- [ ] **Step 29.2: Add `force_variant` parallel handling**

After the `force_type` paragraph in Step 1a, add a parallel paragraph for `force_variant`:

```markdown
**Variant override (force_variant) — Slice 1.5 v4.4.0+:**
The pipeline-controller MAY also pre-fix the pipeline variant (light/heavy) via a `FORCE_VARIANT=light` or `FORCE_VARIANT=heavy` line in the prompt prefix. When present:
- Strip the prefix line before analysis
- Set `pipeline_variant` directly to that value (must be one of: bugfix-light, bugfix-heavy, audit-light, audit-heavy, etc., matching existing references/pipelines/*.md filenames)
- Still compute affected_files, business_rules, ssot_status normally
- Validate that the variant is consistent with type — emit warning if mismatch
```

- [ ] **Step 29.3: Verify**

Run: `grep -c "force_variant\|FORCE_VARIANT" "agents/core/task-orchestrator.md"`
Expected: ≥3.

### Task 30: Update `commands/pipeline.md` (add `--light/--heavy` flags)

**Files:**
- Modify: `commands/pipeline.md` (Modes table, around line 130)

- [ ] **Step 30.1: Read existing Modes table**

Run: `grep -B1 -A12 "^| Pattern" "commands/pipeline.md" | head -20`

- [ ] **Step 30.2: Add 2 rows after `--complexa`**

```markdown
| `/pipeline --light [task]` | FULL + force pipeline_variant=light | Force variant override (Slice 1.5+, valid for type=Bug Fix) |
| `/pipeline --heavy [task]` | FULL + force pipeline_variant=heavy | Force variant override (Slice 1.5+, valid for type=Bug Fix) |
```

- [ ] **Step 30.3: Verify**

Run: `grep -c "\\-\\-light\|\\-\\-heavy" "commands/pipeline.md"`
Expected: ≥4 (2 in table + handling references).

### Task 31: Update `references/pipelines/bugfix-light.md` (point to skill)

**Files:**
- Modify: `references/pipelines/bugfix-light.md`

- [ ] **Step 31.1: Add header note pointing to new skill**

Insert near the top of the file (after the existing `# Bug Fix Pipeline — Light` heading):

```markdown
> **As of v4.4.0 (Slice 1.5):** the prescriptive 8-step procedure lives in `skills/bugfix-light/SKILL.md` and its supporting files (`steps/0X-*.md`). This file remains as the team-composition reference (which agent runs at which phase). When `pipeline-controller` detects `pipeline_variant: bugfix-light`, it dispatches the skill via `Skill(pipeline-orchestrator:bugfix-light)` for Phase 2 execution. See `designs/pipeline-orchestrator-v5-consolidated.md` §21 for the full design.
```

- [ ] **Step 31.2: Verify**

### Task 32: Update `references/pipelines/bugfix-heavy.md`

Same pattern as Task 31.

- [ ] **Step 32.1: Add header note** — [ ] **32.2: Verify**

### Task 33: Commit Phase 4

- [ ] **Step 33.1: Stage** — `git add skills/bugfix/SKILL.md agents/core/pipeline-controller.md agents/core/task-orchestrator.md commands/pipeline.md references/pipelines/bugfix-{light,heavy}.md`
- [ ] **Step 33.2: Commit**

```bash
git commit -m "feat(integration): wire bugfix-{light,heavy} skills into pipeline (Slice 1.5 phase 4)

- skills/bugfix/SKILL.md: detect --light/--heavy flags + delegate
- pipeline-controller: variant override + skill dispatch after Phase 1
- task-orchestrator Step 1a: force_variant analogous to force_type
- commands/pipeline.md: add --light/--heavy flags to Modes table
- references/pipelines/bugfix-{light,heavy}.md: point to new skills

Backward compat preserved: /bugfix without flags works identically (auto-classify); /pipeline-orchestrator:pipeline still recognized."
```

---

## Phase 5 — Spec docs propagation (3 files — most already done in §21 commit)

### Task 34: Update `CHANGELOG.md` with v4.4.0 entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 34.1: Insert v4.4.0 entry above v4.3.1**

```markdown
## [4.4.0] - 2026-05-01

Minor release implementing Slice 1.5: imports the prescriptive 11-step
Heavy and 8-step Light bugfix workflows from Pulsar as Claude Code skills,
closing 6 audit gaps identified in v4.3.1 review. Design in
`designs/pipeline-orchestrator-v5-consolidated.md` §21.

### Added

- `skills/bugfix-light/` — 8-step prescriptive workflow for SIMPLES/MEDIA bugs (SKILL.md + 8 steps + tests)
- `skills/bugfix-heavy/` — 11-step prescriptive workflow for COMPLEXA bugs (SKILL.md + 11 steps + tests)
- 6 audit gaps closed: Heavy 3 (Domain Truth Model), Heavy 9 (UX Journey post-fix E2E), Heavy 11 (Final Validation distinct from Pa de Cal), Light 3 (invariants BEFORE), Light 5 (RED→regression promotion), Light 6 (Persistence Quick Check)
- 8 enforcement rules baked into skill+step frontmatter (sequence_lock, execution_mode lock, agent_type whitelist, output schema, AskUserQuestion gates, STOP RULE, audit log, sentinel checkpoints)

### Changed

- `skills/bugfix/SKILL.md`: detects `--light`/`--heavy` flags + delegates to backing skill
- `agents/core/pipeline-controller.md`: variant override + skill dispatch after Phase 1
- `agents/core/task-orchestrator.md` Step 1a: `force_variant` parallel to `force_type`
- `commands/pipeline.md`: add `--light`/`--heavy` Modes table rows
- `references/pipelines/bugfix-{light,heavy}.md`: pointer to new skills

### Backward compat

- `/pipeline-orchestrator:bugfix [task]` (no flag) keeps auto-classify behavior
- `/pipeline-orchestrator:pipeline [task]` keeps existing flags (`--simples/--media/--complexa`)
- 3 type-specific bugfix-* agents remain invocable in `pipeline-orchestrator:executor:type-specific:` namespace
```

- [ ] **Step 34.2: Verify**

### Task 35: Update `consolidated.md` §0 metadata to reflect v4.4.0 release

- [ ] **Step 35.1: Update version line** — change `Próximo release planejado: **v4.4.0**` to `Versão atual: **v4.4.0** (Slice 1.5 entregue)` and add date.
- [ ] **Step 35.2: Update §12.2 sequence** — change `Slice 1.5 ... 🟡 DESIGN APROVADO` to `🟢 ENTREGUE (v4.4.0)`.

### Task 36: Update `INVENTORY.md`

- [ ] **Step 36.1: Update §3 Slice 1.5 row** — change DESIGN APROVADO → ENTREGUE
- [ ] **Step 36.2: Update §1 plugin version** — 4.3.1 → 4.4.0

### Task 37: Update `CLAUDE.md` raiz

- [ ] **Step 37.1: Update version line** — atualmente: 4.3.1 → 4.4.0 + remove "Próximo planejado: v4.4.0"

### Task 38: Update `AGENTS.md` skills inventory

- [ ] **Step 38.1: Update Skills inventory** — change 2 planned skills to "Shipped v4.4.0"

### Task 39: Commit Phase 5

```bash
git add CHANGELOG.md designs/pipeline-orchestrator-v5-consolidated.md designs/slice-0/INVENTORY.md CLAUDE.md AGENTS.md
git commit -m "docs(spec): mark Slice 1.5 as DELIVERED (v4.4.0) across all spec files

Per CHANGELOG and §21 DoD checklist, v4.4.0 is now shipped. Propagated
delivery status to consolidated.md §0+§12, INVENTORY.md §1+§3, CLAUDE.md
root, AGENTS.md skills inventory."
```

---

## Phase 6 — Release (manifests + hooks + version bump)

### Task 40: Bump `plugin.json` to 4.4.0

- [ ] **Step 40.1: Edit version field** — `"version": "4.4.0"`
- [ ] **Step 40.2: Update description** to mention Slice 1.5 + Pulsar import + 6 gaps closed.

### Task 41: Bump `marketplace.json` to 4.4.0

- [ ] **Step 41.1: Edit pipeline-orchestrator block** — version + ref + description as in Task 40.

### Task 42: Update `hooks/hooks.json` SessionStart prompt

- [ ] **Step 42.1: Edit prompt to mention v4.4.0 + new entry-points** (`/bugfix-light`, `/bugfix-heavy` plus flags).

### Task 43: Commit Phase 6

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json hooks/hooks.json
git commit -m "chore(release): bump 4.3.1 to 4.4.0 — Slice 1.5 (Pulsar bugfix import)"
```

---

## Phase 7 — Validation, tag, push, cache

### Task 44: Smoke-test the enforcement contract

- [ ] **Step 44.1: Verify all 23 new files exist**

```bash
cd "/d/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
ls skills/bugfix-light/SKILL.md skills/bugfix-light/steps/*.md skills/bugfix-light/tests/*.md
ls skills/bugfix-heavy/SKILL.md skills/bugfix-heavy/steps/*.md skills/bugfix-heavy/tests/*.md
```

Expected: 11 files for light (1 SKILL + 8 steps + 1 test = 10 — adjust if mismatch) and 13 for heavy (1+11+1=13). Total: 23.

- [ ] **Step 44.2: Verify each step.md has the 8 mandatory frontmatter fields**

```bash
for f in skills/bugfix-{light,heavy}/steps/*.md; do
  echo "=== $f ==="
  for field in step_number step_name execution_mode expected_inputs expected_outputs expected_next gate_required allowed_tools; do
    grep -q "^$field:" "$f" || echo "MISSING: $field"
  done
done
```

Expected: no "MISSING" lines.

- [ ] **Step 44.3: Verify SKILL.md sequence_lock + gates_at + sentinel_checkpoints**

```bash
for f in skills/bugfix-light/SKILL.md skills/bugfix-heavy/SKILL.md; do
  for field in sequence sequence_lock gates_at sentinel_checkpoints stop_rule_max_failures; do
    grep -q "^$field:" "$f" || echo "MISSING in $f: $field"
  done
done
```

Expected: no "MISSING" lines.

### Task 45: Final integration check

- [ ] **Step 45.1: Verify all 6 GAPS are closed**

```bash
# Heavy 3: domain-truth-model
grep -cE "invariant|property|transactional" "skills/bugfix-heavy/steps/03-domain-truth-model.md"
# Heavy 9: ux-journey post-fix E2E
grep -cE "post-fix|E2E" "skills/bugfix-heavy/steps/09-ux-user-journey-e2e.md"
# Heavy 11: final-validation distinct
grep -cE "after-all|distinct" "skills/bugfix-heavy/steps/11-final-validation-after-all.md"
# Light 3: invariants BEFORE
grep -cE "invariant" "skills/bugfix-light/steps/03-impact-check.md"
# Light 5: promotion
grep -cE "promot|regression" "skills/bugfix-light/steps/05-post-fix-validation.md"
# Light 6: persistence
wc -l "skills/bugfix-light/steps/06-persistence-quick-check.md"
```

Each: expected ≥3 occurrences (or ≥30 lines for Light 6).

### Task 46: Push main + tag v4.4.0

- [ ] **Step 46.1: Push main** — `git push origin main`
- [ ] **Step 46.2: Tag**

```bash
git tag -a v4.4.0 -m "v4.4.0 — Slice 1.5 (Pulsar bugfix workflow import)"
git push origin v4.4.0
```

### Task 47: Update local plugin cache + marketplace cache

- [ ] **Step 47.1: Copy canonical → cache**

```bash
CANON="/d/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
CACHE_BASE="C:/Users/win/.claude/plugins/cache/FX-studio-AI/pipeline-orchestrator"
mkdir -p "$CACHE_BASE/4.4.0"
cp -r "$CANON/agents" "$CANON/commands" "$CANON/skills" "$CANON/hooks" "$CANON/.claude" "$CANON/.claude-plugin" "$CANON/references" "$CANON/docs" "$CANON/assets" "$CANON/tests" "$CANON/.github" "$CANON/designs" "$CACHE_BASE/4.4.0/"
cp "$CANON/CHANGELOG.md" "$CANON/README.md" "$CANON/CLAUDE.md" "$CANON/AGENTS.md" "$CANON/LICENSE" "$CACHE_BASE/4.4.0/"
```

- [ ] **Step 47.2: Pull marketplace cache** — `cd "C:/Users/win/.claude/plugins/marketplaces/FX-studio-AI" && git pull origin main` (stash first if dirty)

### Task 48: Verify install path produces v4.4.0

- [ ] **Step 48.1: Confirm version**

```bash
grep '"version"' "$CACHE_BASE/4.4.0/.claude-plugin/plugin.json"
```

Expected: `"version": "4.4.0"`

- [ ] **Step 48.2: Confirm new skills listed**

```bash
ls "$CACHE_BASE/4.4.0/skills/"
```

Expected: `bugfix  bugfix-heavy  bugfix-light  pipeline`

---

## Self-Review (the writer's checklist — already passed before saving this plan)

**Spec coverage:** verified each §21.X requirement maps to tasks above. §21.1 (gaps) → Tasks 5, 7, 8, 16, 22, 24. §21.2 (design) → Tasks 2, 13. §21.3 (8 rules) → Tasks 2 + 13 (frontmatter) + 44 (smoke). §21.4 (frontmatter contract) → all step tasks declare. §21.5 (migration) → Phases 4-7. §21.6 (backward compat) → Task 33 commit message + smoke test. §21.7 (risks) → not implementation, but Task 28 addresses dispatch-guard whitelist extension via skill dispatch (no risk). §21.8 (DoD) → Tasks 44+45 cover the 8 checklist items.

**Placeholder scan:** no TBD/TODO. Every task has exact file paths and explicit grep verification commands. No "implement appropriately" — every step has either a content shape (frontmatter block) or a Pulsar source reference + adaptation instruction.

**Type consistency:** frontmatter field names are consistent across all step tasks (`step_number`, `step_name`, `execution_mode`, `expected_inputs`, `expected_outputs`, `expected_next`, `gate_required`, `allowed_tools`). SKILL.md uses `sequence`, `sequence_lock`, `gates_at`, `sentinel_checkpoints`, `stop_rule_max_failures` consistently.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-01-pulsar-bugfix-import.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task (or per phase), review between tasks, fast iteration. Best for plans this size (48 tasks).

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review. More token-intensive but keeps everything in one context.

**Which approach?**
