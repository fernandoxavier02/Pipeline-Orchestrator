# Manual Live-Validation Probe Script — Enforcement Determinism

> **Deliverable T7 / REQ-DEFER-LIVE.** This is the concrete artifact that closes **every live-only DEFER** in the sealed spec (`spec/requirements.md` Part A + the DEFER ledger in `spec/tasks.md`). It is an executable, copy-pasteable checklist a **human** runs on an **authenticated machine** (one with a working `ANTHROPIC_API_KEY` — the VPS audit machine had none, so none of these could run there: `REPORT.md:38`).
>
> **Plugin version this script targets:** `8.9.0` (`.claude-plugin/plugin.json:3`). Claude Code observed during the audit: `2.1.185`.
>
> **How to read each step:** every step gives (a) the exact command(s), (b) the **PASS** observation, and (c) what a **FAIL** means and which DEFER it leaves open. Record the literal output next to each step. Nothing here may be marked "approved" on prose alone — paste the real terminal/UI output (NFR-DEFER-LIVE-E2E, `requirements.md:178`).

---

## 0. Preconditions (run once, before anything else)

```bash
cd claude-code/Pipeline-Orchestrator
claude --version                       # expect: 2.1.185 (Claude Code) or newer
echo "${ANTHROPIC_API_KEY:+present}"   # expect: present   (if empty, STOP — none of this works)
claude plugin validate . --strict      # expect: ✔ Validation passed
```

- **PASS:** version prints, key is `present`, validation passes.
- **FAIL:** if the key is empty, this whole script is blocked — that is the exact DEFER condition (`AC-4`). If `--strict` fails, fix packaging before going further (it passed on the audit machine, `REPORT.md:131`).

Throughout, the canonical launch is **`claude --plugin-dir .`** from the repo root, so the local working tree (not the marketplace cache) is what registers.

---

## STEP 1 — DoD#19: the two new hooks register (`/reload-plugins`, `/hooks`, `/agents`, `/skills`, `/doctor`)

**What we are confirming:** the two hooks this iteration added/owns actually register under a real `--plugin-dir` session. From the shipped manifest (`hooks/hooks.json`):

- **`dispatch-record-hook.cjs`** is registered on **`PreToolUse` matcher `Agent`** (`hooks/hooks.json:118-121`) — the dispatch record writer (REQ-DISPATCH-RECORD).
- **`stop-gate-hook.cjs`** is registered on **`Stop`** (`:43`), **`SessionEnd`** (`:66`), and **`StopFailure`** (`:77`) — the single authoritative Stop gate (REQ-STOP-GATE / REQ-STOP-RECOVERY).

```text
# inside the interactive session: claude --plugin-dir .
/reload-plugins
/hooks
/agents
/skills
/doctor
```

- **PASS:**
  - `/hooks` lists `dispatch-record-hook.cjs` under `PreToolUse:Agent` AND `stop-gate-hook.cjs` under each of `Stop`, `SessionEnd`, `StopFailure`.
  - `/skills` lists the pipeline-orchestrator skills (pipeline, bugfix, audit, feature, spec, etc.).
  - `/agents` lists the plugin agents (see STEP 2 for the shadow inspection).
  - `/doctor` reports no plugin-load errors for `pipeline-orchestrator`.
- **FAIL:** if either hook is absent from `/hooks`, DoD#19 is **not** satisfied — registration is broken (likely a `hooks/hooks.json` path typo or a missing `files[]` entry). This leaves DoD#19 (`requirements.md:266`) open.

---

## STEP 2 — GAP-01: `/agents` shadow detection (REQ-DEFER-AGENT-SHADOW)

**What we are confirming:** within-plugin agent-name uniqueness is already locked by a contract test (`tests/contracts/agent-frontmatter-contract.test.cjs:109-116`, REQ-DISMISS-AGENT-UNIQUE). What is **not** checkable from inside the plugin is whether an **external** agent — defined by a project `.claude/agents/`, a user-level agent, a CLI `--agents` entry, or a managed-policy agent — **shadows** a plugin agent of the same `name`. Only the live `/agents` panel resolves the host's full agent set (`requirements.md:128,131`).

```text
# inside: claude --plugin-dir .
/agents
```

Then, for each agent the panel lists, note its **source** (plugin / project / user / CLI / managed). Cross-check every plugin agent `name` against every non-plugin agent `name`.

- **PASS:** every `pipeline-orchestrator:*` agent shows **source = plugin** and **no** non-plugin agent shares a `name` with a plugin agent. Record the full list as evidence (this is the FASE 2 line-244 shadow report).
- **FAIL:** if any plugin agent name is **also** defined by a project/user/CLI/managed source, the host may resolve the wrong agent for that `agent_type` — record which name collides and from which source. That is the live finding REQ-DEFER-AGENT-SHADOW exists to capture.

---

## STEP 3 — PreToolUse:Agent `tool_use_id` present? + `DISPATCH_ID_FALLBACK` breadcrumb

**What we are confirming:** the dispatch record (REQ-DISPATCH-RECORD) keys on `dispatch_id = payload.tool_use_id`. That field is **ASSUME-TO-CONFIRM** on `PreToolUse:Agent` — today `tool_use_id` is only observed on `PostToolUse:AskUserQuestion` (`requirements.md:20`, `human-gate-record.cjs:90`). When the field is absent the writer keys on `'unknown'` and MUST emit a `DISPATCH_ID_FALLBACK` AUDIT breadcrumb (M1, `requirements.md:50`).

Run a real governed pipeline so a subagent is actually spawned (this fires `PreToolUse:Agent`):

```bash
claude --plugin-dir . --debug hooks -p "/pipeline-orchestrator:pipeline fix a trivial typo in the README"
```

While it runs, inspect the dispatch records and the AUDIT stream of the active run:

```bash
# find the active run dir, then:
cat .pipeline/docs/**/protocol-events.jsonl | grep -E "DISPATCH_ID_FALLBACK|DISPATCH_RECORD"
# inspect the persisted dispatch records in the signed sentinel-state:
cat <run-dir>/sentinel-state.json | node -e "let s=JSON.parse(require('fs').readFileSync(0));console.log(Object.keys(s.pending_dispatches||{}))"
```

- **PASS (the fact holds):** the `pending_dispatches` keys are **real `tool_use_id` values** (not the literal `'unknown'`), and **no** `DISPATCH_ID_FALLBACK` breadcrumb fired. This confirms `tool_use_id` is present on `PreToolUse:Agent` → the dispatch contract can rely on it, and REQ-DISPATCH-RECORD is certified live.
- **PASS (fallback path, still honest):** if the keys are `'unknown'` AND a `DISPATCH_ID_FALLBACK` breadcrumb fired for each spawn, the **fallback behaves as designed** — but it means the field is **NOT** available on `PreToolUse:Agent`, so REQ-DISPATCH-ENVELOPE and REQ-DEFER-MACHINE-EVIDENCE (which need the same correlation) stay blocked. Record which case you observed.
- **FAIL:** keys are `'unknown'` but **no** breadcrumb fired (the fallback is silent — a defect), or two parallel same-type spawns collide on one key (the lost-update the lock is meant to prevent).

---

## STEP 4 — `updatedInput` honored by the harness (REQ-DISPATCH-ENVELOPE prerequisite)

**What we are confirming:** no hook emits `updatedInput` today (grep empty, `requirements.md:21`); REQ-DISPATCH-ENVELOPE (the prompt-envelope injection) is DEFER'd precisely because we cannot prove the harness honors a whole-input replacement without a live run.

Use a throwaway probe hook on a scratch plugin copy (do NOT modify the shipped hooks). A minimal `PreToolUse:Agent` hook that returns:

```json
{ "hookSpecificOutput": { "permissionDecision": "allow", "updatedInput": { "prompt": "PROBE_SENTINEL_MARKER" } } }
```

Then spawn one agent and inspect whether the subagent received `PROBE_SENTINEL_MARKER` instead of the original prompt.

- **PASS:** the subagent's actual input contains `PROBE_SENTINEL_MARKER` → the harness honors `updatedInput` on `PreToolUse:Agent`. REQ-DISPATCH-ENVELOPE can be built against this contract.
- **FAIL:** the subagent received the original prompt unchanged (or the harness rejected the field) → `updatedInput` is **not** honored as a whole-input replace; REQ-DISPATCH-ENVELOPE stays DEFER'd and the design must not assume injection.

---

## STEP 5 — `SubagentStop` can block / its payload shape (REQ-DEFER-SUBAGENTSTOP prerequisite)

**What we are confirming:** no `SubagentStop` hook is registered today (`REPORT.md:37`); whether it can return a blocking decision and what its payload carries (`agent_id`, `stop_hook_active`, `last_assistant_message`) are ASSUME-TO-CONFIRM (`requirements.md:23`). Building a commit-point validator now would be dormant.

On a scratch copy, register a throwaway `SubagentStop` hook that (a) logs the full payload to a file and (b) returns `{ "decision": "block", "reason": "PROBE" }`. Spawn one subagent and let it finish.

- **PASS:** the logged payload contains `agent_id` + `last_assistant_message` (record the exact JSON shape), AND the `block` decision actually prevents the subagent's conclusion from being accepted (the parent sees the block). This is the shape REQ-RESULT-ENFORCE/REQ-DEFER-SUBAGENTSTOP would be built against.
- **FAIL:** no `SubagentStop` event fires at all, or the payload lacks `last_assistant_message`, or `block` is ignored → the commit-point design stays DEFER'd; record exactly which piece is missing.

---

## STEP 6 — `Stop` can block; armed deny → 3rd-cycle `hard_failed`; NO teardown deadlock (REQ-STOP-GATE)

**What we are confirming:** the single authoritative Stop gate (`stop-gate-hook.cjs`) can return `decision:block` for an incomplete governed run with the **exact next action**, caps at 3 continuities then writes `hard_failed`, and — critically — does **not** deadlock teardown when armed. Default is **off** this iteration; you must **arm** it (`PIPELINE_STOP_BLOCK_ENFORCEMENT=deny`, `requirements.md:99-100`).

```bash
export PIPELINE_STOP_BLOCK_ENFORCEMENT=deny
claude --plugin-dir . --debug hooks -p "/pipeline-orchestrator:pipeline implement a small feature"
# then DELIBERATELY leave the run incomplete (interrupt before closure / stop mid-batch).
```

Observe across the run + its run-dir:

- **PASS (all four must hold):**
  1. On the first incomplete Stop, the gate returns `decision:block` with a concrete **next action** message (not a generic refusal).
  2. The block recurs at most **3** times; on the 3rd, the run state is written as **`hard_failed`** (an honest terminal state, not `completed`).
  3. The session **does** eventually tear down — no hang, no infinite block loop (NO teardown deadlock).
  4. `session-cleanup-hook.cjs` did **NOT** mark the lock `completed` before the terminal `hard_failed` write (the H3 invariant; the local armed-reorder test asserts this same property, `requirements.md:102`).
- **FAIL:** the gate never blocks (arming had no effect — Stop-can-block is false for 2.1.185), OR it blocks forever (deadlock — the exact risk that kept this default-off), OR cleanup marked `completed` before terminal. Each leaves the full default-ON Stop block DEFER'd.

> After this step: `unset PIPELINE_STOP_BLOCK_ENFORCEMENT` so later steps run with the shipped default-off posture.

---

## STEP 7 — `PostToolUse:AskUserQuestion` answer shape (REQ-DEFER-ACTIVE-GATE prerequisite)

**What we are confirming:** `human-gate-record.cjs` already records the real answer (DoD#12, preserved — `requirements.md:106,108`). The active-gate machine (REQ-DEFER-ACTIVE-GATE) is DEFER'd because it would have to **branch** on the answer (approve/reject), and the exact `tool_response` answer shape is unconfirmed. `HUMAN_GATE` must stay AUDIT-only until that shape is live-confirmed (`requirements.md:109`, `REPORT.md:123`).

```bash
claude --plugin-dir . -p "/pipeline-orchestrator:pipeline a task that reaches a user gate"
# answer the AskUserQuestion prompt when it appears (try both an approve-style and a reject-style answer in two runs).
cat <run-dir>/gate-decisions.jsonl | grep HUMAN_GATE
```

- **PASS:** a `HUMAN_GATE` line is written carrying the real `tool_use_id` and the literal answer text; **record the exact `tool_response` JSON** the harness delivered (the field that holds the chosen option). This is the shape REQ-DEFER-ACTIVE-GATE needs to branch on.
- **FAIL:** no `HUMAN_GATE` line (the recorder regressed — that would violate NFR-PRESERVE), or the answer text is absent/garbled. Until the shape is captured, the active-gate machine stays DEFER'd and `HUMAN_GATE` must NOT be used to branch enforcement.

---

## STEP 8 — checkpoint-verdict producer prerequisite for green-close (REQ-DEFER-GREEN-CLOSE)

**What we are confirming:** green-close was reclassified IMPLEMENT→DEFER (C1) because `checkpoint-verdict-gate.cjs` reads `state.last_checkpoint_verdict`, which stays `null` until a **checkpoint-validator producer emits `checkpoint-verdict.json`** — and **no producer is wired** (`requirements.md:94`). Arming over a perpetually-`null` field either deadlocks every governed close or tests a value nothing writes.

```bash
# run a real code-changing pipeline through to a checkpoint:
claude --plugin-dir . -p "/pipeline-orchestrator:pipeline fix a real bug with tests"
# after a batch checkpoint, inspect:
cat <run-dir>/sentinel-state.json | node -e "let s=JSON.parse(require('fs').readFileSync(0));console.log('last_checkpoint_verdict =', s.last_checkpoint_verdict)"
ls <run-dir>/checkpoint-verdict.json   # does any producer write this file?
```

- **PASS (producer confirmed):** `checkpoint-verdict.json` exists AND `last_checkpoint_verdict` holds a real `pass`/`red`/`fail` value the **machine** wrote (not agent prose). Only then can green-close be armed by default and the red-close deny test assert a real value — record this as the precondition met.
- **PASS (confirms the DEFER, expected today):** `last_checkpoint_verdict` is `null` and no `checkpoint-verdict.json` is produced → arming would deadlock; REQ-DEFER-GREEN-CLOSE correctly stays deferred. The env escape `PIPELINE_REQUIRE_GREEN_CLOSE=true` remains for operators who HAVE wired a producer.
- **FAIL:** a producer writes the file but the gate doesn't read it (wiring bug), or the field holds an **agent-reported** value (prose-as-evidence — would violate NFR-NO-PROSE-ENFORCEMENT).

---

## STEP 9 — FASE 14 live items: packed-copy / temp-env, safe-mode negative control, disableAllHooks / managed-policy

These three close the GAP-05 (c)/(d)/(e) DEFERs (`requirements.md:149-151`). Packaging-of-files (b) is already DONE and tested (`tests/packaging/hook-packaging.test.cjs`, REQ-DISMISS-PACK-FILES); these are the **runtime** halves.

### 9a — Packed-copy / temp-env without personal settings (REQ-DEFER-PACKED-E2E)

```bash
npm pack                                  # produces pipeline-orchestrator-8.9.0.tgz
mkdir -p /tmp/pp-clean && tar -xzf pipeline-orchestrator-8.9.0.tgz -C /tmp/pp-clean
cd /tmp/pp-clean/package
# launch with a clean config dir so NO personal settings leak in:
CLAUDE_CONFIG_DIR=/tmp/pp-cleancfg claude --plugin-dir . -p "/pipeline-orchestrator:pipeline trivial task"
```

- **PASS:** the plugin loads from the **extracted tarball** in a clean env, hooks register (re-run `/hooks`), and a governed run still enforces. This proves the shipped artifact — not the dev tree — works without personal settings.
- **FAIL:** a hook is missing or a path resolves against the dev tree → the packaged artifact is incomplete; record which file. Leaves REQ-DEFER-PACKED-E2E open.

### 9b — Safe-mode negative control (enforcement disappears) (REQ-DEFER-SAFEMODE)

```bash
# launch in safe mode (no plugin customizations / hooks loaded):
claude --plugin-dir . --safe-mode -p "/pipeline-orchestrator:pipeline a governed task"   # or the harness's documented safe-mode flag
```

- **PASS:** with customizations off, the deterministic enforcement **disappears** — no deny gate fires, no sentinel-state is written. The behavior vanishing is the negative control proving the enforcement is genuinely hook-driven (not coincidental).
- **FAIL:** enforcement still appears to fire in safe mode → either the test setup is wrong or some behavior is not actually hook-gated. Record the discrepancy.

### 9c — disableAllHooks / managed-policy reports "modo determinístico não operacional" (REQ-DEFER-SAFEMODE)

```bash
# with managed policy or disableAllHooks set (per the harness's documented mechanism), run a governed task.
```

- **PASS:** when hooks are policy-disabled, the run proceeds **without** deterministic enforcement AND the situation is honestly reported as **"modo determinístico não operacional"** (the honest statement of seed:864). The point is not to pretend enforcement is active when policy killed it.
- **FAIL:** hooks are disabled but the system still claims deterministic protection (dishonest), OR 2.1.185 exposes **no** introspection surface for a plugin to learn it was hook-disabled — record that, because the absence of that surface is itself the objective blocker that keeps REQ-DEFER-SAFEMODE deferred (`requirements.md:151`).

---

## STEP 10 — GAP-06 runtime residual: a subagent cannot invoke EnterPlanMode/ExitPlanMode

**What we are confirming:** the frontmatter-declaration half is already LOCKED — no agent declares `EnterPlanMode`/`ExitPlanMode` (`agent-frontmatter-contract.test.cjs:158-170`, REQ-DISMISS-PLANMODE-DECL). The **runtime** half — that a subagent genuinely cannot *invoke* Plan Mode even if it tried — stays ASSUME-TO-CONFIRM (`requirements.md:156`).

During any of the governed runs above, watch whether a spawned subagent ever surfaces a Plan Mode UI or successfully calls `EnterPlanMode`.

- **PASS:** no subagent enters Plan Mode; the tool is stripped from subagent manifests at runtime (consistent with Achado #7). Record that no Plan Mode UI appeared from a subagent.
- **FAIL:** a subagent does enter Plan Mode → the runtime prohibition does not hold and the design must adapt; record the agent and the trigger.

---

## STEP 11 — GAP-07: Plan-Mode demonstrated-benefit + E2E (REQ-DEFER-PLANMODE-JUSTIFY)

**What we are confirming:** either (a) attach a passing **live Plan-Mode E2E** and keep the ceremony, or (b) record that `plan-result + REQ-RESULT-CONTRACT + human gate` covers the same contract, recommending the ceremony be retired (`requirements.md:159-160`).

Run a MEDIA/COMPLEXA pipeline (which mandates plan mode) and observe whether the Plan Mode ceremony adds enforcement value the cheaper plan-result+user-gate path lacks.

- **PASS (a):** a live Plan-Mode E2E completes and demonstrably gates something the plan-result path would not — attach the transcript; keep the requirement.
- **PASS (b):** the same enforcement is shown achievable via plan-result + user-gate — record the comparison; recommend retiring the ceremony.
- **FAIL:** inconclusive (no live run) → REQ-DEFER-PLANMODE-JUSTIFY stays open.

---

## STEP 12 — GAP-03 residual: matrix-F machine-evidence rows (REQ-DEFER-MACHINE-EVIDENCE)

**What we are confirming:** the deterministic evidence collectors (real build exit code, real test exit code, truncated-output indicator, real `git diff` changed-file list, sensitive-domain detection, prior-batch file, missing-artifact, tampered-artifact) are DEFER'd — there is **no** `PostToolUse:Bash`/`PostToolUse:PowerShell` collector today (`requirements.md:121,125`). These rows can only be observed **once the collectors are wired**, and the wiring depends on the same `tool_use_id` correlation STEP 3 probes.

For each of the eight matrix-F rows, once a collector exists, drive the live scenario and confirm the **machine-produced** value is recorded (not agent prose): build exit code, test exit code, truncation flag, `git diff` file list, sensitive-domain hit, prior-batch file read, missing-artifact block, tampered-artifact rejection.

- **PASS:** each row's value is written by a hook from a real shell result, correlated by `tool_use_id`→`evidence_id`. Record the eight values.
- **FAIL / NOT-YET (expected today):** no collector exists, so these remain agent-reported prose — record "collector not wired" for each row. This keeps REQ-DEFER-MACHINE-EVIDENCE and (via GAP-08) REQ-DEFER-EVIDENCE-BLOCK open, honestly.

---

## Coverage map — which DEFER each step closes

| Step | DEFER / obligation closed-or-probed | Spec anchor |
|---|---|---|
| 1 | DoD#19 registration of the two new hooks | `requirements.md:266` |
| 2 | REQ-DEFER-AGENT-SHADOW (GAP-01 `/agents` shadow report) | `requirements.md:131` |
| 3 | REQ-DISPATCH-RECORD live cert + `DISPATCH_ID_FALLBACK` | `requirements.md:50` |
| 4 | REQ-DISPATCH-ENVELOPE (`updatedInput` honored) | `requirements.md:51` |
| 5 | REQ-DEFER-SUBAGENTSTOP (can-block + payload shape) | `requirements.md:60-61` |
| 6 | REQ-STOP-GATE armed-deny + 3rd-cycle hard_failed + no deadlock | `requirements.md:99-103` |
| 7 | REQ-DEFER-ACTIVE-GATE (AskUserQuestion answer shape) | `requirements.md:109` |
| 8 | REQ-DEFER-GREEN-CLOSE (checkpoint-verdict producer) | `requirements.md:94-95` |
| 9 | REQ-DEFER-PACKED-E2E / REQ-DEFER-SAFEMODE (FASE 14 c/d/e) | `requirements.md:149-151` |
| 10 | GAP-06 runtime EnterPlanMode/ExitPlanMode prohibition | `requirements.md:156` |
| 11 | REQ-DEFER-PLANMODE-JUSTIFY (GAP-07) | `requirements.md:159-160` |
| 12 | REQ-DEFER-MACHINE-EVIDENCE (GAP-03 matrix-F rows) | `requirements.md:125` |

**Honesty rule (NFR-NO-PROSE-ENFORCEMENT, `requirements.md:171`):** record the literal command output for each PASS. A step is only "approved" with pasted evidence — never on the strength of this script's prose.
