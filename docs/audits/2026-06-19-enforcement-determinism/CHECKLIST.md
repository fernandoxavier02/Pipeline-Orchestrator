# Enforcement Determinism Checklist — 2026-06-19

> **Question this answers:** for every control point in the pipeline, is it
> enforced by **CODE** (a hook the harness runs, blocks deterministically) or is
> it **PROMPT-ONLY** (lives in agent markdown, depends on the LLM obeying)?
>
> Prompt-only control points are the ones that silently fail — the model can skip
> them and nothing stops it. This is the burn-down list to convert each one into
> a deterministic gate, in the same pattern as `lib/fix-loop.cjs` /
> `lib/gate-log-guard.cjs` / `lib/batch-review-guard.cjs` (pure decision +
> PreToolUse I/O gate + PostToolUse stamp into signed state).
>
> Legend: **CODE** = a hook blocks. **PARTIAL** = a hook exists but is warn-only
> or trusts prompt-authored state. **PROMPT** = no code; LLM must obey markdown.

---

## A. CODE-ENFORCED (deterministic — a hook blocks)

| Control | Hook (deterministic) | Mode |
|---|---|---|
| Pipeline must be ARMED before substantive work | `pipeline-arm-gate.cjs` | deny |
| Agents run in declared step ORDER | `step-ledger-gate.cjs` + `step-ledger-stamp.cjs` | deny |
| Fix-loop cap (no infinite re-fix) | `lib/fix-loop.cjs` via step-ledger-gate | deny |
| Plan Mode bypass | `dispatch-guard.cjs` | deny |
| Brainstorm / STEP 1.7 bypass | `dispatch-guard.cjs` | warn→deny |
| Sealed-spec → implementation handoff | `dispatch-guard.cjs` | deny |
| Parent work blocked during a pending handshake | `dispatch-pending-gate.cjs` | deny |
| Scope / diff discipline (CHANGE_CONTRACT) | `scope-lock-hook.cjs` | deny |
| No production edits without an approved plan | `edit-guard-hook.cjs` | deny |
| Spec seal preconditions | `spec-seal-guard.cjs` | deny |
| Signed-state integrity (HMAC) | `sentinel-hook.cjs` + `lib/sentinel-state-signer.cjs` | warn (strict=deny) |
| **Per-batch adversarial review before advancing/closing** | **`batch-review-gate.cjs` + `lib/batch-review-guard.cjs` (NEW, this work)** | **deny** |

---

## B. PARTIAL (hook exists, but enforcement is weak or trusts prompt-authored state)

| Control | Why it's only partial | Deterministic upgrade |
|---|---|---|
| **Sentinel divergence guard** (`sentinel-hook.cjs`) | It DOES run on every agent spawn and CAN deny — **but it only compares the spawned agent against `state.expected_next`, and `expected_next` is authored by the controller (prompt).** A controller that simply never names the adversarial reviewer in `expected_next` sails right past the sentinel — the hook enforces the sequence the controller *declares*, not the sequence the **doc mandates**. | Derive `expected_next` from the workflow manifest in **code** (like `lib/step-ledger.cjs`), so the sequence check enforces the canonical order, not a self-reported one. The new batch-review gate already sidesteps this by counting *real* completions instead of trusting `expected_next`. |
| **Sentinel AGENT** (`agents/core/sentinel.md`, the deep SEQUENCE_VALIDATION guardian) | **Nothing in code forces it to run** at the 5 "mandatory" checkpoints. It runs only if the controller spawns it, or if the divergence-deny message convinces the LLM to spawn it. Prompt-dispatched. | A PostToolUse stamp + PreToolUse gate that requires a `sentinel`-agent stamp at each declared checkpoint before the next phase agent spawns. |
| TDD approval ordering (`gate-log-gate.cjs`) | Requires `TDD_APPROVAL` logged before `executor-controller` — but default **warn**, and it checks the *log line exists*, not that tests were really approved. | Promote to deny; stamp the real approval event (not just a log line). |
| HMAC integrity (`sentinel-hook.cjs`) | Warn-first by default; only fails closed under `PIPELINE_HMAC_STRICT`. | Make strict the default for governed runs. |

---

## C. PROMPT-ONLY (no code — the LLM must obey markdown). **This is the burn-down list.**

Each row is a gate from `references/gates.md` whose enforcement today is purely
the controller obeying prose. Priority = how badly a silent skip hurts.

| # | Control (gate) | What it should force | Deterministic fix (same pattern as batch-review-gate) | Priority |
|---|---|---|---|---|
| 1 | **ADVERSARIAL_GATE** (per batch) | Run the adversarial review every batch before advancing | ✅ **DONE — this work.** `batch-review-gate` counts checkpoints vs reviews, denies advance/closure when reviews lag. | — (shipped) |
| 2 | **CHECKPOINT_FAIL** | Don't advance to the next batch while build/tests are RED | Stamp the checkpoint **verdict** (pass/fail) into signed state; a PreToolUse gate denies the next implementer/checkpoint spawn while the last checkpoint verdict is FAIL. | **HIGH** |
| 3 | **STOP_RULE** | Hard-stop after 2 consecutive batch failures | Counter `consecutive_checkpoint_failures` stamped on each FAIL; circuit-break at 2 (mirror `fix-loop.cjs`). | **HIGH** |
| 4 | **ADVERSARIAL_GATE_MANDATORY** | Sensitive domains (auth/crypto/data) MUST get a review — no skip | Detect sensitive-path touches from the batch diff (path/diff heuristic); force a review stamp before advance even in `warn` for normal batches. | **HIGH** |
| 5 | **ADVERSARIAL_LOOP_BREAKER** (outer cycle) | Stop after 4 full review→fix→re-review cycles per batch | Port the outer-cycle counter into code (mirror `fix-loop.cjs`); today it lives in `review_state` but enforcement is prose. | MED |
| 6 | **FINAL_ADVERSARIAL_REWORK** | Don't close out with unresolved CRITICAL final-review findings | Stamp the final-adversarial verdict; deny `closeout` / `finishing-branch` while a CRITICAL is open. | MED |
| 7 | **SSOT_CONFLICT** | Total block on multiple sources of truth | Hard to make deterministic (semantic); leave prompt, but log an AUDIT when detected. | LOW |
| 8 | **INFO_GATE_BLOCKED / MICRO_GATE_GAP** | Stop on critical information gaps | Partially structural; the information-gate agent decides. Could stamp "gate cleared" and gate the next phase on it. | LOW |
| 9 | **Review independence** (Invariant #9, zero-context) | Reviewers must have no implementation context | Structural (separate Agent spawns already give fresh context); hard to assert in code beyond "a review-orchestrator spawn happened". | LOW |
| 10 | **Verification-before-claim** (Invariant #11) | No "done" without evidence | Behavioral; partially covered by `verify-completion` before Pa de Cal, which is itself prompt-dispatched. | LOW |

---

## Recommended next builds (in order)

1. **CHECKPOINT_FAIL gate (#2)** — same shape as this work: stamp the checkpoint
   verdict, deny advance on RED. This is the second-biggest silent-skip after the
   adversarial one — it stops "tests are red but let's keep going".
2. **STOP_RULE counter (#3)** — trivially mirrors `fix-loop.cjs`.
3. **Sentinel `expected_next` from manifest (B-row)** — removes the prompt-authored
   sequence weakness so the existing sentinel hook enforces the *doc's* order.
4. **ADVERSARIAL_GATE_MANDATORY (#4)** — sensitive-domain forcing.

Each is one pure lib + one PreToolUse gate + one PostToolUse stamp + a v8.8.x
regression file, reviewed by the same zero-context adversarial pass that this
gate went through (which found 1 CRITICAL + 3 HIGH on the first cut — proof the
loop is worth running every time).
