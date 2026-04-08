# Sentinel Integration Reference

> **SSOT for sentinel behavior within pipeline.md.**
> This file is loaded by the pipeline controller. It defines HOW the controller
> interacts with the sentinel system (state file, hook, agent).

---

## 1. State File Management

### Creation (Phase 0, before any agent spawn)

The pipeline controller MUST create `{PIPELINE_DOC_PATH}/sentinel-state.json` via the Write tool BEFORE spawning the first agent (task-orchestrator).

Initial state:

```json
{
  "schema_version": 1,
  "pipeline_active": true,
  "pipeline_id": "{ISO_TIMESTAMP}_{variant_placeholder}",
  "variant": null,
  "last_updated": "{ISO_TIMESTAMP}",
  "sequence_counter": 0,
  "orchestrator_decision": null,
  "current_phase": "0a",
  "current_agent": null,
  "expected_next": "task-orchestrator",
  "pending_checkpoint": null,
  "completed_phases": [],
  "gate_summary": {
    "mandatory_completed": [],
    "hard_completed": [],
    "soft_skipped": [],
    "soft_completed": []
  },
  "batch_state": {
    "current_batch": 0,
    "total_batches_estimated": 0,
    "consecutive_failures": 0
  },
  "consecutive_corrections": 0,
  "confidence_score": 1.0,
  "sentinel_log": []
}
```

### Update Pattern (before EVERY agent spawn)

Before each Agent tool call, the controller MUST update sentinel-state.json via the Write tool:

1. Set `current_phase` to the phase being entered
2. Set `current_agent` to the agent being spawned
3. Set `expected_next` to the agent that should be spawned AFTER the current one completes
4. Increment `sequence_counter`
5. Set `last_updated` to current ISO timestamp

The Write tool call MUST complete before the Agent tool call is made. This ensures the hook reads the correct state.

### Determining `expected_next`

The controller determines `expected_next` by consulting:
1. The universal phase flow (0a→0b→0c→1→1.5→2→3) from this controller's own phase logic
2. The variant-specific agent sequence from `references/pipelines/{variant}.md`

For conditional phases (0c, 1.5):
- If the condition is met (COMPLEXA, or --grill/--plan flag) → `expected_next` = the conditional agent
- If not → skip to the next mandatory phase's agent

### Finalization (after Pa de Cal)

After the final-validator returns and sentinel post_final_validator checkpoint passes:
- Set `pipeline_active: false`
- The hook becomes a silent pass-through

---

## 2. Sentinel Checkpoints

The controller MUST spawn `Agent(pipeline-orchestrator:core:sentinel)` at these checkpoints:

### Checkpoint #1: post_orchestrator (MANDATORY for all complexities)

**When:** Immediately after task-orchestrator returns ORCHESTRATOR_DECISION
**Before:** Update state file with full orchestrator_decision, then spawn sentinel
**Mode:** ORCHESTRATOR_VALIDATION
**Prompt template:**

```
Validate the orchestrator decision.
- mode: ORCHESTRATOR_VALIDATION
- state_file_path: {PIPELINE_DOC_PATH}/sentinel-state.json
- trigger: checkpoint_critical
Plugin root: {CLAUDE_PLUGIN_ROOT} (for reading references/complexity-matrix.md)
```

### Checkpoints #2-5: Phase transitions

| # | Checkpoint | When | Mode | Required |
|---|-----------|------|------|----------|
| 2 | phase_0_to_1 | After Phase 0 complete, before Phase 1 | COHERENCE_VALIDATION | COMPLEXA mandatory, MEDIA recommended |
| 3 | phase_1_to_2 | After Phase 1/1.5 complete, before Phase 2 | COHERENCE_VALIDATION | COMPLEXA mandatory, MEDIA recommended |
| 4 | phase_2_to_3 | After last batch + reviews, before Phase 3 | COHERENCE_VALIDATION | **Mandatory ALL** |
| 5 | post_final_validator | After Pa de Cal returns | COHERENCE_VALIDATION | COMPLEXA mandatory, MEDIA recommended |

**Prompt template for coherence checkpoints:**

```
Validate phase transition coherence.
- mode: COHERENCE_VALIDATION
- state_file_path: {PIPELINE_DOC_PATH}/sentinel-state.json
- trigger: phase_transition
- transition: {from_phase}_to_{to_phase}
Plugin root: {CLAUDE_PLUGIN_ROOT}
Pipeline doc path: {PIPELINE_DOC_PATH} (for reading gate-decisions.jsonl)
```

---

## 3. Handling SENTINEL_VERDICT

After EVERY sentinel spawn, the controller reads the SENTINEL_VERDICT and acts:

### PASS

1. Append to `sentinel_log` in state file: `{ timestamp, mode, status: "PASS", checks: N }`. Cap at 20 entries (rolling window — remove oldest if length > 20).
2. Reset `consecutive_corrections` to 0
3. Proceed to next phase/agent normally

### CORRECTED

1. Read `correction.should_be` — this is the correct next action
2. Apply the correction:
   - **Variant changed:** Reload the pipeline reference file for the new variant. Adjust batch_size and checklists accordingly.
   - **Complexity elevated:** Update `orchestrator_decision.complexity` and `variant`. Re-determine the pipeline flow.
   - **Phase missing:** Execute the missing phase BEFORE proceeding to the originally intended phase.
3. Update state file: increment `consecutive_corrections`, append to `sentinel_log`
4. Update `expected_next` to match the corrected flow
5. Proceed with the corrected action

### BLOCKED

1. Do NOT proceed with any agent spawn
2. Present the block reason to the user via AskUserQuestion:
   ```
   SENTINEL BLOCKED the pipeline.
   Reason: {block.reason}
   Required action: {block.required_action}

   Options:
   a) Resolve the issue and resume
   b) Force override (-0.20 confidence penalty, logged as SOFT skip)
   c) Cancel pipeline
   ```
3. If user chooses (b) override: log to gate-decisions.jsonl with `gate: "SENTINEL_BLOCK"`, `decision: "SKIPPED"`, `hardness: "HARD"`. Apply -0.20 confidence penalty. Proceed.
4. If user chooses (c) cancel: set `pipeline_active: false` and exit.

---

## 4. Handling Hook Deny (SEQUENCE_VALIDATION flow)

When the sentinel hook denies an Agent tool call:

1. Claude receives the deny reason automatically (fed by Claude Code)
2. The deny reason instructs Claude to spawn sentinel with mode SEQUENCE_VALIDATION
3. Claude spawns sentinel (hook allows — anti-loop: target is "sentinel")
4. Sentinel returns SENTINEL_VERDICT
5. Controller applies VERDICT per Section 3 above
6. Controller spawns the CORRECT agent (with state file updated)

---

## 5. Bootstrap — First Spawn

On the FIRST `/pipeline [task]` invocation:

1. Controller creates sentinel-state.json with `expected_next: "task-orchestrator"`
2. Controller spawns task-orchestrator
3. Hook reads state file → expected = "task-orchestrator" → MATCH → allow
4. Normal flow continues

If state file does NOT exist when hook fires:
- Hook uses **hybrid fail** behavior:
  - `task-orchestrator` → fail-open (bootstrap agent, allowed without state file)
  - All other `pipeline-orchestrator:*` agents → **fail-closed** (denied with actionable message)
- Controller creates the state file after task-orchestrator returns

**Auto-discovery:** The hook scans `.pipeline/docs/Pre-*-action/*/sentinel-state.json` automatically
(newest by mtime). The `PIPELINE_DOC_PATH` env var is an optional override, not a requirement.

---

## 6. `/pipeline continue` — Resume Flow

1. Controller checks if sentinel-state.json exists in PIPELINE_DOC_PATH:
   - **Exists + pipeline_id matches:** Restore state.
   - **Exists + pipeline_id mismatch:** Create fresh state file.
   - **Does not exist:** Create fresh state file.
2. Apply STALE_CONTEXT gate (if state restored and last_updated > 24h ago):
   - Present options: re-validate from Phase 0 OR proceed with warning.
   - If user chooses re-validate → restart from Phase 0 with fresh state.
   - If user chooses proceed → continue to step 3.
3. Spawn sentinel with COHERENCE_VALIDATION before resuming execution.
   - Sentinel validates: completed_phases are consistent, gate_summary is coherent, no MANDATORY gates SKIPPED.
4. If sentinel PASS → resume pipeline from last incomplete phase.
5. If sentinel BLOCKED → present block reason, user decides (resolve / cancel).
