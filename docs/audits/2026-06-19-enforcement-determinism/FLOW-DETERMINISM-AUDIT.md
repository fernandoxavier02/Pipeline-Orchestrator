# Flow Determinism Audit — Full Report (2026-06-19)

> **Goal of this audit:** find every place where the pipeline FLOW — phase
> transitions, agent activations, gate triggers, stop rules — is enforced ONLY by
> prose the LLM is expected to obey, and design the deterministic (code-enforced)
> replacement for each. "Deterministic" here means a hook the harness runs that
> can **deny** the action; the model cannot talk its way past it.
>
> Method: three independent zero-context audits (the controller spec `commands/pipeline.md`;
> the agent-activation chain via `lib/step-ledger.cjs` + `references/sentinel-integration.md`;
> and the ground-truth hook layer via `hooks/hooks.json` + every hook/lib). Consolidated here.
>
> Status: **report only — no code changed.** This is the backlog to convert, in waves.

---

## 1. Executive summary (plain language)

The pipeline's **skeleton** is now genuinely deterministic (since v8.6.0–v8.8.0): you
must "arm" a run before doing substantive work, the main agents must run **in order**
(you can't skip a spine step forward), the fix-loop can't exceed its cap, and the
per-batch adversarial review is enforced. Direct inline edits during a session are
blocked. These are real code gates that deny.

But the pipeline's **brain** — almost every decision that depends on *reading a
result* — is still prose. ~20 distinct flow-control points remain prompt-only.

## 2. Root cause (one sentence)

**The hooks never read an agent's verdict.** A hook only ever sees three things: that
an agent was *spawned* (its name/metadata), that a *file was written*, and the
*state file the controller itself authored*. No hook reads the structured *output* an
agent produced. So every decision of the form "look at what the agent concluded and
branch on it" falls to the prose side: *did the build pass? is there an SSOT conflict?
was the plan rejected? did the final review find a CRITICAL? did this batch touch
auth/payment?* — none of these is readable by today's hooks.

## 3. The universal fix pattern

Every conversion below is the **same three pieces** we already used for the fix-loop
cap and the batch-review gate:

1. **STAMP** — when an agent finishes, its *verdict* is recorded into the HMAC-signed
   state (a PostToolUse stamp, or the agent writes a structured verdict line that a
   stamp/gate reads from a known file). Recorded facts, not prose claims.
2. **GATE** — a PreToolUse hook reads the stamped verdict before the next spawn and
   **denies** if the rule isn't satisfied.
3. **DEFAULT DENY + signed state** — no silent `warn` escape on flow-critical gates;
   the state must be cryptographically signed so a hand-forged verdict is rejected.

**Honest ceiling (applies to all verdict gates):** a verdict stamp is far stronger
than a prose claim — the agent has to actually run and record a result a hook can read
— but the ultimate floor is "the agent could record a dishonest verdict." We narrow
that by recording machine-checkable facts where possible (e.g. a real command exit
code, the actual list of changed files from git) rather than the agent's opinion. This
is the same ceiling the batch-review gate already documents (it counts real completions,
not the review's findings). Stated here so the report doesn't oversell.

---

## 4. CLASS A — Verdict gates (the trava reads a stamped result)

| # | Control (plain) | Today | Deterministic design (STAMP → GATE) | Priority |
|---|---|---|---|---|
| A1 | **Don't advance with a red build/test** | The checkpoint agent runs build/tests but only *prose* says "if it fails, stop". No hook reads the result. | STAMP: checkpoint-validator records the real build/test **exit code** + a `checkpoint_verdict: pass\|fail` into signed state. GATE: deny the next implementer/checkpoint/advance spawn while the last verdict is `fail`. Fact-based (exit code), hard to fake. | **HIGH** |
| A2 | **Stop after 2 consecutive build failures** | `STOP_RULE` circuit-breaker described in prose; no counter in code. | STAMP: increment `consecutive_checkpoint_failures` on each `fail`, reset to 0 on `pass`. GATE: circuit-break (deny all further work spawns) at 2 — mirror of the fix-loop cap. | **HIGH** |
| A3 | **Stop after 2 consecutive sanity failures** | Same as A2 but for the closure sanity step; prose only. | Same counter pattern on `sanity-checker` verdict. | MED |
| A4 | **Sensitive domain ⇒ review is MANDATORY (no skip)** | Doc labels it MANDATORY, but **zero code reads which files changed**. The "skip blocked if auth/crypto/data/payment" is pure prose. (All 3 auditors flagged this as the worst gap.) | STAMP: derive `domains_touched` deterministically from the batch **git diff** against a path/pattern allowlist (auth, crypto, payment, data-model) and record it. GATE: when `domains_touched` is non-empty, the batch-review gate refuses the `warn` escape and **requires** the review stamp before advancing. | **HIGH** |
| A5 | **Don't close with an unresolved CRITICAL from the final review** | `FINAL_ADVERSARIAL_REWORK`: prose says critical findings are "BLOCKING"; no hook reads the verdict. | STAMP: final-adversarial-orchestrator records `final_review_verdict: clean\|critical_open` + count. GATE: deny `finishing-branch`/closeout while a CRITICAL is open. | MED |
| A6 | **Block on conflicting sources of truth** | `SSOT_CONFLICT` MANDATORY; no hook reads `ssot_status`. | STAMP: task-orchestrator records `ssot_status: ok\|conflict`. GATE: deny any further spawn while `conflict`. (Detecting the conflict stays semantic/agent-side; the gate just enforces the recorded verdict.) | MED |
| A7 | **Stop when the info-gate is BLOCKED** | `INFO_GATE_BLOCKED` HARD; prose-evaluated. | STAMP: information-gate records `info_gate: clear\|blocked`. GATE: deny the planning/execution spawn while `blocked`. | MED |
| A8 | **Plan rejected ⇒ roll back, don't execute** | `PLAN_REJECTED` HARD; no hook reads the plan status. | STAMP: plan-architect / the approval gate records `plan_status: approved\|rejected`. GATE: deny the executor spawn unless `approved`. | MED |
| A9 | **GO/NO-GO of the final validator becomes a real block** | Validator computes GO/CONDITIONAL/NO-GO in prose; finishing-branch isn't gated on it. | STAMP: final-validator records `final_decision`. GATE: deny push/PR closeout on NO-GO (and require explicit ack on CONDITIONAL). | MED |
| A10 | **Outer cap: 4 review→fix→re-review cycles per batch** | `ADVERSARIAL_LOOP_BREAKER`: the inner per-finding cap is coded (fix-loop), but the outer 4-cycle counter + the DIAGNOSE-THEN-REIMPLEMENT escape are tracked in prose state. | STAMP: increment `adversarial_loop_count` per completed cycle (reset per batch). GATE: at 4, deny another fix cycle and force the escape — mirror of fix-loop cap. | MED |
| A11 | **Phase-3 rework can happen at most once** | The "option A at most 1 time" cap is prose. | STAMP: `phase3_rework_used` flag. GATE: suppress the rework path once used. | LOW |

## 5. CLASS B — Proof-of-decision gates (require a recorded user approval)

No hook today verifies that a user decision was actually solicited via `AskUserQuestion`
before the next phase spawns. The model could simply proceed.

| # | Control (plain) | Deterministic design |
|---|---|---|
| B1 | **Proposal confirmed before execution** | STAMP a `proposal_confirmed` decision (the approval logged to the audit trail with `decided_by: user`). GATE: deny the planning/execution spawn until it's present. |
| B2 | **Tests approved before implementation (TDD)** | STAMP `tdd_approved` when the test scenarios are user-approved. GATE: deny the implementer spawn until present. (Today the related gate-log check is **warn** — promote to deny.) |
| B3 | **Per-batch review question actually asked** | The batch-review gate already enforces the *review ran*; add that the *user gate* was recorded, so "skip" is a logged decision, never silent. |
| B4 | **Closeout confirmed before push/PR or discard** | `CLOSEOUT_CONFIRM`: STAMP the confirmation; GATE deny the push/PR/discard tool path until present. |

**Note on B-class strength:** a hook can verify a decision was *recorded*, not that a
human truly chose it (the model authors the record). This raises the bar from "nothing"
to "must produce an auditable, signed decision entry", but the human-intent floor
remains. It still kills the silent-skip.

## 6. CLASS C — Close the escapes (determinism that exists today but leaks)

These don't need new gates — they need existing ones tightened. Without these, the
Class A/B work can still be bypassed.

| # | Leak | Fix |
|---|---|---|
| C1 | **The audit-log gate only WARNS by default** (`PIPELINE_GATE_LOG_ENFORCEMENT=warn`), and only two phases are even mapped. | Flip default to deny; extend the required-gate map to every phase transition. |
| C2 | **HMAC signing is OFF by default** (`PIPELINE_HMAC_STRICT` unset) → unsigned/forged state is trusted → the counters/verdicts every gate reads are forgeable. | Make strict the default for enforced runs; unsigned active state ⇒ fail closed on governed spawns (the batch-review gate already does this opt-in via strict). |
| C3 | **State discovered by "newest file" is not signature-verified** — only the authoritative pointer path is. | Require the signed pointer; refuse the mtime-fallback for governed/flow gates. |
| C4 | **The order ledger covers only ~9 spine agents.** `finishing-branch`, all executor sub-agents, all type-specific reviewers, the final-adversarial team, and the entire Spec/brainstorm workflows are **ungoverned** (Spec/brainstorm have manifests but no agent map). Skill-delegated Phase 2 is also unordered. | Add the missing agents to the agent→step map; give Spec/brainstorm real agent maps; add `finishing-branch` as a terminal step requiring `final` stamped. |
| C5 | **The Sentinel guardian is prose-policed.** Nothing forces the sentinel *agent* to run at its 5 checkpoints; the sentinel *hook* only checks the spawn against `expected_next`, a string the controller (prose) writes — it trusts the same writer it's supposed to police. | Derive `expected_next` from the workflow manifest **in code** (not controller-authored); stamp a `sentinel_ran` signal per checkpoint and gate the next phase on it. |
| C6 | **Every deny gate has a blanket `PIPELINE_*_ENFORCEMENT=warn` env escape.** | Keep the escape for rollout, but emit a loud AUDIT event whenever warn-mode lets a flow-critical action through (no silent bypass), and document which gates must never be relaxed in production. |
| C7 | **Mode branching (DIAGNOSTIC / HOTFIX / REVIEW-ONLY / PAPERCLIP) is prose.** | A hook parses the raw invocation and writes a canonical `mode` into the arm marker; gates key off it (e.g. DIAGNOSTIC denies post-Phase-1 spawns; REVIEW-ONLY denies implementer spawns). |

---

## 7. Recommended wave ordering

1. **Wave 1 — the "keep going when you shouldn't" trio:** A1 (red build), A2/A3 (stop
   counters), A4 (sensitive-domain mandatory review). Highest harm, cheapest to build
   (counters + a diff-based domain check), all mirror existing patterns.
2. **Wave 2 — verdict gates for the decision points:** A5–A9 (final-critical, SSOT,
   info-gate blocked, plan rejected, GO/NO-GO), plus A10/A11.
3. **Wave 3 — proof-of-user-approval:** B1–B4, and promote the audit-log gate C1 to deny.
4. **Wave 4 — close the structural escapes:** C2 (HMAC strict default), C3 (signed
   discovery), C4 (ledger coverage), C5 (sentinel from manifest), C6 (loud warn), C7 (mode).

Each item ships as: one pure decision lib + one PreToolUse gate + one PostToolUse stamp
+ a regression file, reviewed by a zero-context adversarial pass (which on this gate's
first cut found 1 CRITICAL + 3 HIGH — the loop pays for itself every time).

**Scope guarantee:** everything lives in `hooks/`, `lib/`, `scripts/`, `tests/` — no
agent-prompt rewrites, Iron Law preserved (the gate registry / mandatory table are
data the gates read, not rewritten).

---

## 8. Appendix — what is ALREADY deterministic (deny) today

So this report is self-contained. These genuinely block, by code:

- **Arming:** can't do substantive work after `/pipeline` until a run is armed (`pipeline-arm-gate`, deny).
- **Spine order:** the 9 mapped spine agents must run in order (`step-ledger-gate`, deny — but inert until the ledger is stamped).
- **Fix-loop cap:** the (max+1)th fix spawn is denied (`fix-loop`, deny, cap≤3).
- **Per-batch review:** advancing/closing blocked until reviews ≥ checkpoints (`batch-review-gate`, deny; corrupt state fails closed).
- **Plan-mode / brainstorm / sealed-spec bypass:** denied (`dispatch-guard`, deny).
- **Inline edits during a session / pending handshake / no approved plan:** denied (`edit-guard`, no env off-switch).
- **Scope/diff discipline:** writes outside the change contract denied (`scope-lock`, no env off-switch).
- **Handshake pending:** all inline parent work denied until resolved (`dispatch-pending-gate`, deny).

Warn-only today (soft, listed above as C1/C6): the audit-log gate, the parallel-dispatch
gate, and anything gated behind `PIPELINE_HMAC_STRICT` while it's unset.
