# Changelog

All notable changes to the pipeline-orchestrator plugin are documented here.

## [8.24.0] - 2026-07-11

### Added

- next-action-contract pack (loop/next-action-contract, batches 1-7): subagent-fallback wired into the 4 highest-value enforcement hooks (edit-guard, dispatch-pending-gate, dispatch-guard, run-step-guard) so a governed deny always names a reachable next action for subagents; subagent-reachable denies + deny-sweep liveness check (F8); stop-gate live-dispatch exemption (T2.2); /pipeline-orchestrator:unblock skill + scripts/unblock-diagnose.cjs (T1.3, partial).
- lib/contracts/gate-expectation.cjs — hardened gate-expectation selector contract (S2 ruler recalibration), with regression suites tests/regression/v8.21.0/F1-F3 now GREEN (previously frozen RED).
- e2e-eval fixtures for the 2026-06-29 telemetry-instrumentation-spec run (tests/fixtures/e2e-eval/) + recalibrated lib/e2e-evaluator.cjs and lib/fidelity-reporter.cjs (same-selector fidelity, reporter bypass guard).
- docs/port-zcode/ portability inventory (hooks/agents/workflows/gates/lib + plan) and docs/audits/2026-07-08-agent-lockup-audit/.
- Merged docs/2026-06-11-enforcement-variants-audit into main (historical audit record).
- .gitattributes pinning eol=lf for Node sources — prevents core.autocrlf checkouts from breaking byte-hash-pinned guard tests (found by adversarial review).

### Notes

- Suite baseline: 0 new failures vs loops/next-action-contract/baseline_failures.txt (3 cured: v8.21.0 F1-F3). Iron Law preserved: Mandatory Gates table + Gate Registry untouched.

## [8.23.0] - 2026-07-10

### Added

- Write-time audit-trail anti-fabrication guard: new PreToolUse hook audit-fabrication-gate.cjs (+ pure brain lib/audit-forgery-guard.cjs) blocks a Write/Edit/MultiEdit to gate-decisions.jsonl or sentinel-state.json inside a run dir when the incoming content is forged - a backdated entry without a BACKFILLED marker; a final_decision:GO / completed:true without the logged closure chain (FINAL_ADVERSARIAL_GATE [+ CLOSEOUT_CONFIRM]); or a decided_by:user entry with no corroborating user-gate protocol-event. Runs BEFORE the PostToolUse autosign, so a forgery can no longer be laundered into a valid HMAC signature. Default deny; escape PIPELINE_AUDIT_FABRICATION_ENFORCEMENT=warn; threshold PIPELINE_BACKFILL_THRESHOLD_MS. Fail-open on unreadable/absent state. Iron Law preserved (only .claude/hooks/ + lib/ + tests/ + hooks.json; Mandatory Gates + Registry untouched; no .codex mirror). Residual deferred layer (planting the closure chain or fabricating the protocol-event) needs PIPELINE_HMAC_STRICT plugin-wide. TDD tests/regression/v8.23.0/F1-F2; adversarial review round 1 (5 hardening fixes).

## [8.22.0] - 2026-07-07

### Fixed — hook-unblock pack (2026-07-07 corrective-telemetry diagnosis)

Five anti-deadlock/anti-friction fixes to the enforcement layer, from the diagnosis of 27 corrective triggers (2026-06-29 → 07-04) and the live egg-and-chicken deadlock that killed run `2026-07-04-e2e-ruler-recalibration-s2` with a 0/320 diff. (8.21.0 is reserved for the in-flight S2 ruler-recalibration slice, whose frozen RED tests live in `tests/regression/v8.21.0/`.)

- **T1 — already-dispatched exemption** (`edit-guard-hook.cjs`): new `pendingAlreadyDispatched` + `dispatchTargetMatches` (exported). A live `DISPATCH_REQUEST` whose target subagent was **genuinely spawned** — proven by the `pending_dispatches[tool_use_id]` record the `dispatch-record-hook` already persists into the same signed state, with `created_at >= emitted_at` and leaf-containment matching mirroring `isResolutionAgent` — is no longer "live", freeing all 3 session blockers at once (`dispatch-pending-gate`, `shouldBlockOnPendingDispatch`, `isDispatchPending`). Subagents share the parent session; the old behavior denied the dispatched subagent's own Bash/Write. Block between REQUEST and spawn, tamper fail-closed branch and malformed-shape guard (`pending_dispatches` array) preserved.
- **T2 — anchored exec-window control-plane exemption** (`dispatch-pending-gate.cjs`): new `isExecWindowControlCommand` (exported). A Bash/PowerShell command that IS exactly `node …/scripts/exec-window/open.cjs|close.cjs` (env `VAR=val` prefixes tolerated, quoted Windows paths normalized) passes with a live pending — it was the designed way out, denied by the very gate it unblocks. Composition (`&&`, `;`, `|`, backtick, newline, `$(…)`) or the path embedded as another program's argument NEVER earns the exemption (anti-injection pinned by tests).
- **T3 — deterministic pending clear** (`step-ledger-stamp.cjs`, PostToolUse:Agent): new `clearSatisfiedPending` (exported). When the returning agent is the target of a `DISPATCH_REQUEST` pending block and returned a **usable** result, the entry is removed from the signed state (`withLock` + read-verify-refuse-launder, same posture as `record-step.cjs`). Replaces the honor-only controller prose "clear the pending on RESULT" whose omission caused a false 482-minute `PROTOCOL_HANDSHAKE_TIMEOUT` on 2026-07-04. Errored/no-op returns leave the handshake pending; other targets' entries untouched.
- **T4 — disk-truth anti-false-timeout** (`edit-guard-hook.cjs` + `cleanup-orphan-sentinel-state-hook.cjs`): new `pendingResolvedByEvents` (exported). A `DISPATCH_REQUEST` whose id has a matching `DISPATCH_RESULT` in the run's `protocol-events.jsonl` (timestamp `>=` request) is RESOLVED — wired into `findLivePendingBlock` (the 3 gates) and into the `checkHandshakeTimeouts` sweep, which finally implements its own docstring promise ("AND no matching response arrived"). DISPATCH-only scope: GATE/PLAN_MODE requests stay human-resolved. Bounded tail read; absent/unreadable events file keeps prior behavior.
- **T5 — tdd stamp-by-evidence** (`step-ledger-gate.cjs`): frozen RED tests approved in a prior session satisfy `TDD_APPROVAL` in `gate-decisions.jsonl` but never stamped the `tdd` ledger step, so the executor spawn was denied by order (live: protocol-events line 19 of the 07-04 run). The gate now grants the step by evidence (`TDD_APPROVAL` `APPROVED|CONFIRMED`), persists the stamp via `recordStep` (idempotent, signed) and appends a `STEP_STAMP_BY_EVIDENCE` audit event to `protocol-events.jsonl` — **NOT a new gate** (Iron Law: Mandatory Gates table + Gate Registry untouched). No evidence, or an earlier step missing → denies exactly as before.

### Tests

- `tests/regression/v8.22.0/F1-F5` — 41 scenarios, TDD RED→GREEN per task (F1 11, F2 11, F3 7, F4 7, F5 5); allow-side and block-side both pinned (tamper, injection, wrong-target, stale-record, ordering). Suite `258 pass / 8 fail / 266` = the pre-existing baseline exactly (3× Langfuse v7.3.0 + score-writer v7.6.0 + F4 v8.8.0 + 3× v8.21.0 frozen RED of the in-flight S2 slice); 0 new failures. Known flake: `v7.13.0/F07` failed once under full-suite load, passes 3/3 standalone (historical, documented since v8.3.0).
- Iron Law: only `.claude/hooks/` + `tests/` (+ `loops/hook-unblock/` process artifacts) touched; no `.codex` mirror (these hooks do not mirror).

### Process note

Authored via the loopify harness on branch `loop/hook-unblock` (per-task selective commits; base checkpoint also landed the previously-uncommitted S1 spec-artifact-exemption work). The headless loop could not edit `.claude/hooks/**` (harness sensitive-file protection, not overridable by permission rules in a non-interactive session) — implementation landed from the interactive session; lesson recorded in `loops/hook-unblock/LOOP_DONE.md`.

## [8.20.0] - 2026-07-02

### Fixed — enforcement unblocking pack (2026-07-02 hook audit)

- **Stop-trap fail-open (the only true no-exit prison):** `stop-gate-hook.cjs`, `e2e-eval-gate.cjs` and `subagent-stop-commit-hook.cjs` blocked **forever** when their continuity counter could not be persisted (signer unavailable, `verifyState` failing/throwing at write time, read-only state file or dir) — the 3-cap that converts a block into an honest terminal could never fire. `persist()`/`withSignedState()` now report real commit success; each block call site fails **OPEN** with an audit trace (`STOP_GATE_COUNTER_UNPERSISTABLE` / `E2E_COUNTER_UNPERSISTABLE` / `SUBAGENTSTOP_COUNTER_UNPERSISTABLE`), extending the existing `!statePath → allow` B5 guard to every unpersistable shape. Healthy paths (block + persisted counter + cap → `hard_failed`/`forced`) are pinned unchanged.
- **scope-lock-hook invisible deny:** migrated every emit (allow and deny) from the FLAT top-level `{permissionDecision, reason}` shape — which the harness does not honor, so the refactor scope deny was ignored or bound without its reason reaching the model — to the canonical `hookSpecificOutput.{hookEventName, permissionDecision, permissionDecisionReason}` envelope used by every sibling gate.
- **One reachable next action in arm messages:** `PIPELINE_NOT_ARMED` and `CORRUPT_STATE` deny reasons plus the `pipeline-arm-writer`/`pipeline-session-arm-hook` banners now lead with the single reliable unblocking action — `Agent(subagent_type: "pipeline-orchestrator:core:pipeline-controller", prompt: <task>)` (what `skills/pipeline/SKILL.md` itself does). The impossible "create sentinel-state.json by hand" recipe (the LLM has no HMAC signer; the hand-written state deepened the block and contradicted the `MARKER_TAMPERED` branch) and the literal unresolved `{PIPELINE_DOC_PATH}`/`<cwd>` placeholders are gone.
- **Phantom arm via teammate/agent messages (live 2026-07-02):** `lib/pipeline-arm.cjs::HARNESS_OPEN_TAG` now also cuts `<teammate-message>`/`<agent-message>` envelopes. A background subagent report quoting `/pipeline-orchestrator:pipeline continue` in prose arrived as a prompt turn, leaked past the positional cut, armed a phantom `CONTINUE` run (`source flag:continue`) and bricked the session's Bash/PowerShell/Agent until the 30-min TTL.

### Added

- **`sentinel-state-autosign.cjs`** (PostToolUse `Edit|Write|NotebookEdit|MultiEdit`): hook-side signing for the Bash-less controller. The `pipeline-controller` subagent cannot run the signer its spec prescribes (no Bash tool), so its `sentinel-state.json` landed UNSIGNED → `STATE_FILE_INIT_FAIL` + most of the corrective-loop noise. The hook signs a freshly-written, **unsigned** run-dir `sentinel-state.json` (`.pipeline/docs/**` or `pipeline-runs/**`). Posture guards: never touches a file whose `__signature` is present (invalid = tamper evidence), skips under `PIPELINE_HMAC_STRICT=true` (no auto-launder in strict), fail-open silent. Zero security delta: unsigned was already tolerated by default.

### Tests

- `tests/regression/v8.20.0/F1-F5` (26 scenarios, TDD RED→GREEN, incl. a live-repro fixture of the phantom arm). Co-updated pins: `.claude/hooks/__tests__/scope-lock-hook.test.cjs`, `tests/regression/v8.8.0/F5_refactor_scope_lock.cjs` (envelope), version pins F7/F6/F01. Suite `257 pass / 5 fail` — the same 5 pre-existing failures (3 Langfuse + score-writer + v8.18.0 F4).
- Iron Law: only `.claude/hooks/`, `lib/`, `hooks/hooks.json`, `tests/` touched; Mandatory Gates table + Gate Registry UNTOUCHED; no `.codex` mirror (none of the touched hooks mirrors).

## [8.19.3] - 2026-07-01

### Fixed — arm-classifier: keyword-inferred read-only runs no longer arm (recurring phantom-arm deadlock)

- A natural-language review/audit/analysis request (`/pipeline-orchestrator:pipeline faça revisão adversarial`, `faça uma auditoria`, `análise`) is classified `FULL/Audit` by keyword. `lib/pipeline-arm.cjs::writeArmPending` only skipped arming for the read-only **modes** (`REVIEW-ONLY`/`DIAGNOSTIC`), so a keyword-inferred **Audit / UX-Simulation** armed the `pipeline-arm-pending` marker. Read-only work never opens an exec window → it hits `INLINE_WORK_BLOCKED`, aborts, and the orphan marker then bricks the next task with `PIPELINE_NOT_ARMED` until TTL/restart. Reproduced live in the interview-coach project on 2026-06-30 and 2026-07-01 (the second run still armed the marker whose `session_id` was `78ef80e4…`).
- **FIX:** `writeArmPending` now also skips arming for the read-only **types** (`Audit`, `UX Simulation`) **when they were inferred from keywords** (`source` begins `kw:`). An **explicit `--audit`/`--ux` flag** stays a deliberate governed run and still arms — preserving the `STEP_1_7` direct-entry evidence (v8.16.0). Safe direction per the documented arm trade-off: a missed arm is recoverable (re-invoke); a phantom arm deadlocks the session.
- TDD via `tests/regression/v8.19.3/F1-readonly-types-no-arm.test.cjs` (RED 4-fail → GREEN: natural-language review/audit/ux return `null` and write no marker; a Bug Fix control still arms). Two deliberate v8.7.0 pins (`F2-2`, `F2-5`) were updated to exercise the `--audit`-flag arming path, since keyword-audit intentionally no longer arms.
- Iron Law preserved: only `lib/pipeline-arm.cjs` + `tests/` touched; Mandatory Gates table + Gate Registry UNTOUCHED; no `.codex` mirror. Suite 252/5 (5 pre-existing: 3 Langfuse + score-writer + F4 dispatch-pending-gate). Lockstep across all version surfaces.

## [8.19.2] - 2026-07-01

### Fixed — edit-guard-hook robustness (Cursor-crash hardening, Claude-Code-scoped)

- The PreToolUse `edit-guard-hook.cjs` could crash into its opaque external catch — surfacing `edit-guard-hook internal error — failing closed` and denying **every** Edit/Write/Bash — whenever an `fs` call inside the guard threw. The reproducing case: `.pipeline/sessions` present but **unreadable** (a file where a directory is expected → `ENOTDIR`, or `EACCES`), which made the unguarded `readdirSync` in `getActiveLock`/`getActiveExecWindow` throw. Reported from a non-native (Cursor) runtime where malformed/empty payloads hit the same catch.
- **FIX (3 minimal guards, no posture change):** (1) `getActiveLock` wraps `readdirSync` in try/catch → returns `null` (no lock) instead of throwing; (2) `getActiveExecWindow` does the same → returns `null`; (3) the CLI external catch now includes the **real error, sanitized** (single-line, printable-ASCII, capped 200 chars) — `edit-guard-hook internal error: <msg> — failing closed` — so a genuine failure is debuggable instead of opaque. The guard still **fails closed** (deny) when it cannot evaluate — the security posture is unchanged.
- **Deliberately out of scope (Claude-Code-only):** no foreign tool-name vocabulary (`StrReplace`/`Shell`/`Delete`/…) and no payload-schema normalization were added — cross-runtime tool mapping is the other editor's concern. This hardens the Claude Code side and makes a failure legible; it does not, by itself, make a foreign runtime enforce end-to-end.
- TDD via `tests/regression/v8.19.2/F1-edit-guard-robustness.test.cjs` (RED 7-fail → GREEN, 8 checks incl. a CLI-level malformed-stdin probe proving the message now carries detail while staying `deny`). Iron Law preserved: only `.claude/hooks/edit-guard-hook.cjs` + `tests/` touched; Mandatory Gates table + Gate Registry UNTOUCHED; no `.codex` mirror. Suite 251/5 (5 pre-existing: 3 Langfuse + score-writer + F4 dispatch-pending-gate). Lockstep 9 surfaces.

## [8.19.1] - 2026-06-30

### Fixed — arm-marker consume-on-close deadlock

- The `pipeline-arm-pending` marker (written at `/pipeline` invocation by `pipeline-arm-writer.cjs`, 30-min TTL, HMAC-signed-by-shape, session-stamped since v8.18.0) was **never consumed when a governed run ended deliberately**. Only TTL expiry or a session restart (via v8.18.0 session isolation) cleared it. So a finished **code-mutating** run left its still-live marker in place, and `pipeline-arm-gate.cjs` kept denying the NEXT non-pipeline task in the same session with `PIPELINE_NOT_ARMED` for up to 30 min. (`REVIEW-ONLY`/`DIAGNOSTIC` runs never arm — `lib/pipeline-arm.cjs::writeArmPending` skips them — so the real trigger is a FULL/code run that armed, completed, and was never disarmed.)
- **FIX:** `.claude/hooks/stop-gate-hook.cjs` (the authoritative Stop-event terminal owner) now consumes the marker on its closed-run ALLOW paths — completed / GO-completer / spec-seal / hard_failed continuity-cap / deliberate-inactive — via a new `lib/pipeline-arm.cjs::clearArmPendingForSession(cwd, sessionId)`. It is **never** called on a block, on `SessionEnd`/`StopFailure` recovery, or on corrupt state.
- **Positive-ownership delete** (symmetric with the read path's v8.18.0 session isolation): the marker is removed only when marker and caller `session_id` are both present and equal, OR both absent; any ambiguous (stamped-vs-absent) or mismatched case is preserved and left to the TTL / `SessionStart` cleanup — never delete a marker we cannot prove we own (closes a cross-session un-govern vector). The **tamper verdict is delegated to the `lib/arm-pending` SSOT** (`markerIsTampered`), so a signed-but-invalid marker stays fail-closed (parity with the arm-gate's verify-on-read; no fourth divergent copy of that rule).
- 2 zero-context adversarial review rounds found 1 HIGH (tamper-bypass on delete) + 1 CRITICAL (cross-session/sessionless delete); both fixed; a final independent pass returned CLEAN. TDD via `tests/regression/v8.19.1/F1` (10 scenarios — all 5 call sites + tamper-preserve + the full session-ownership truth table).
- Iron Law preserved: only `.claude/hooks/stop-gate-hook.cjs` + `lib/pipeline-arm.cjs` + `tests/` touched; the Mandatory Gates table + Gate Registry are UNTOUCHED; no `.codex` mirror (stop-gate does not mirror). Suite 250/5 (5 pre-existing: 3 Langfuse + score-writer + F4 dispatch-pending-gate; F07 jsonl-writer flaky). Lockstep 9 surfaces.

## [8.19.0] - 2026-06-29

### Added — spec-authoring output enforcement (close the return-channel gap)

Closes the spec-authoring communication/return-channel gap: the seal was already
code-enforced, but the contract that the spec-controller emit a terminal result
block and that the parent surface it was honor-only. Three changes close it:

- **(A) Terminal block contract.** `spec-controller` Step 9 must now end on a fenced
  `PIPELINE_AGENT_RESULT_V1` block — the run no longer terminates on prose alone.
- **(B) Governed Spec leaf.** `spec-controller` is now a governed Spec leaf in
  `lib/contracts/workflow-manifest.cjs`, resolved by `spec_authoring_progress` and
  policed by the already-armed SubagentStop check. The stale `DEFAULT-OFF` comment
  was corrected.
- **(C) Seal-evidence Stop gate.** The Stop gate now closes a Spec run only with
  on-disk seal evidence, never mere inactivity (HIGH-1).

Safety properties:

- **Emit-and-hoist safety.** Intermediate `AWAITING_*` stops pass un-counted; only the
  terminal stop is policed (the v8.19.0 hoist-cap CRITICAL, fixed).
- **Seal-forgery guard.** Seal authority is consolidated onto the signed sentinel's
  `final_decision` via the shared `lib/contracts/workflow-manifest.cjs::sealEvidence`;
  the unsigned `manifest.yaml` status is no longer an independent grant.

Adversarial loop converged (1 CRITICAL hoist-cap + 1 LOW over-match + 1 LOW
manifest-forgery, all fixed). Tests: `tests/regression/v8.19.0/F1-F8` + the manifest
contract suite. Iron Law: only 2 hooks + `spec-controller.md` + the manifest contract
+ tests touched; the Mandatory Gates table + Gate Registry are UNTOUCHED; no `.codex`
mirror. Lockstep 9 surfaces.

## [8.18.2] - 2026-06-29

### Fixed — observer governance guard (false-positive SUBAGENTSTOP_RESULT_MISSING)

- **Observer fired for non-pipeline agents.** `.claude/hooks/corrective-error-signal-gate.cjs`
  treated ANY SubagentStop payload with a non-empty `agent_type` as a governed
  spine leaf. The harness fires SubagentStop for EVERY subagent — including
  non-pipeline harness agents (`Explore`, `general-purpose`, `Plan`) and other-plugin
  agents — so a plain `Explore` finishing without a `PIPELINE_AGENT_RESULT_V1` block
  emitted a FALSE `SUBAGENTSTOP_RESULT_MISSING` signal and fired a spurious corrective
  dispatch (observed live 2026-06-29 with `run_id:""`, no governed run active).
- **Fix.** The agent→step inversion is promoted to the manifest SSOT
  (`lib/contracts/workflow-manifest.cjs`) as `stepForAgentType` + a new `isGovernedLeaf`.
  The observer now rejects any agent that is not a manifest-recognized governed spine
  leaf. The sibling `subagent-stop-commit-hook.cjs` delegates its previously-local
  inversion to the same SSOT (no duplicated logic).
- **Deliberate scope.** The observer is membership-by-name + run-blind by design (a
  non-blocking signal emitter), explicitly NOT identical to the run-aware commit gate
  (which also requires `pipeline_active===true` and keys off `state.workflow`). The
  narrow residual (a governed leaf finishing with no active run still emits) is
  documented as accepted.
- **Tests.** `tests/regression/v8.18.2/F1_observer_governance_guard.cjs` (RED→GREEN:
  `Explore` no longer emits; a real governed leaf still does). `tests/contracts/workflow-manifest-contract.test.cjs`
  gains S1-14..S1-17 — all 9 FULL leaves, null-spine, falsy inputs, and a drift-lock
  parity test asserting `WORKFLOWS.FULL.agents_by_step` is the exact inverse of
  step-ledger's `AGENT_STEP_MAP.FULL`.
- **Review.** Three zero-context adversarial lenses (security / architecture / quality)
  in a correction loop to CLEAN — no CRITICAL/HIGH; misleading "identical posture"
  comments + coverage/drift gaps fixed.
- Iron Law preserved: only `.claude/hooks/`, `lib/`, `tests/` touched; the 35-row
  Mandatory Gates table + 49-row Gate Registry UNTOUCHED. Suite 241 pass / 5 fail
  (the 5 pre-existing baseline failures: 3 Langfuse + score-writer + F4
  dispatch-pending-gate inherited from the v8.18.0 deadlock-recovery change). Lockstep 9 surfaces.

## [8.18.1] - 2026-06-29

### Fixed — phantom-arm deadlock (all workflows) + ARCH refactors

- **Phantom arming from harness-injected text.** `lib/pipeline-arm.cjs::writeArmPending`
  classified the RAW prompt, so a harness-injected envelope (task-notification,
  agent result, system-reminder) that merely *mentioned* a pipeline token armed a
  phantom run and re-locked the session in a loop. Fix: classify only the
  user-authored segment via the new positional `userPromptSegment()` — it cuts at
  the first injected-envelope opening tag and ignores closing tags/nesting (a
  subtractive close-tag strip is evadable: a lazy match stops at an inner close-tag
  an agent result printed, leaking the tail). Applies at the arming chokepoint, so
  it covers EVERY workflow and BOTH arming paths (UserPromptSubmit writer +
  SessionStart session-arm hook).
- **REVIEW-ONLY / DIAGNOSTIC skip arming.** These read-only modes no longer write
  an arm marker (no governed window → nothing to deadlock).
- **ARCH-001 / ARCH-002** (`enforcement-surface-verify-hook.cjs`): extracted
  `probeEnforcementInactive()` (SRP); imported `isCwdSandboxOk` from the
  cleanup-orphan hook instead of duplicating it (DRY), fail-closed.
- Tests: `tests/regression/v8.7.0/F2_pipeline_arm_marker.cjs` F2-7..F2-15,
  including adversarial-review evasion pins (inner close-tag echo, nesting,
  out-of-allowlist wrapper) found by a zero-context security reviewer.
- Reconciled all 9 version surfaces to 8.18.1 (the 8.18.0 bump was incomplete and
  left plugin.json/marketplace/cursor/lib-index/README/CLAUDE at 8.17.0).

## [8.18.0] - 2026-06-28

### Fixed — deadlock recovery + session isolation

Two structural bugs that caused agents to get stuck and required manual
intervention (renaming `.pipeline/`) to unblock.

- **Bug 1 — Investigation tools deadlock.** `dispatch-pending-gate.cjs` blocked
  Read/Grep/Glob/ToolSearch when sentinel-state was corrupt or a handshake was
  pending, while the error message said "use Agent/AskUserQuestion to resolve."
  The agent couldn't even READ files to understand the situation. Fix: added
  Read/Grep/Glob/ToolSearch to ALWAYS_ALLOW_TOOLS (parity with
  pipeline-arm-gate). Also added pipeline_active=false check and 2h staleness
  recovery — a corrupt state from a dead session no longer blocks new sessions.

- **Bug 2 — Cross-session arm-pending blocking.** Two terminals on the same
  project shared `.pipeline/pipeline-arm-pending.json` without session scoping.
  One terminal's `/pipeline` arm blocked the other's tools. Fix: marker now
  includes `session_id` on write; `readArmPending` and `readArmPendingMarker`
  filter by session. Legacy markers (no session_id) remain backward-compatible.

- **Tests:** 25 new tests (F1: 17, F2: 8), 4 existing tests updated for the
  new Read-as-investigation behavior (F37-I1/I9/I11/I15, T4-D3).

## [8.17.0] - 2026-06-28

### Fixed — autonomous bugfix run delivers 4 audit-driven fixes + 1 meta-escape

The previous attempt to close 4 findings from the v8.16.0 audit run hit the
chain-tied enforcement deadlock that the audit run itself had recommended
closing. This release applies the 4 audit-driven fixes AND ships the
meta-escape that institutionalizes the user-authorized recovery path, so a
future autonomous bugfix run can complete without hacking the sentinel.

- **AUDIT-001 (MED-LOW) — stop-hook write-verify.** After
  `.claude/hooks/stop-hook.cjs::handleStop` calls `appendRunLog`, it now reads
  the tail of `<repoRoot>/.pipeline/run-log.jsonl` back and compares the last
  line's `run_id` against the one just persisted. On mismatch, a single
  `run-log verify mismatch: expected <X> got <Y>` warn fires on stderr —
  operators search for that literal token. Soft-fail by contract: missing
  file, unreadable file, malformed tail line, or any other error degrades to
  a silent no-op. Exported as `verifyRunLogAppend` for unit testing.
- **AUDIT-004 (CRIT, deployment-only) — `ENFORCEMENT_INACTIVE` detector.**
  New `lib/enforcement-status.cjs::detectEnforcementStatus({hooksDir,
  expectedCanonicalHook})` probes the install for the canonical
  execution-gate hook (`pipeline-arm-gate.cjs`). Wired into the existing
  SessionStart `enforcement-surface-verify-hook.cjs` so a missing canonical
  hook emits a dedicated `ENFORCEMENT_INACTIVE` event with HIGH severity to
  `protocol-events.jsonl`. The event is registered in
  `lib/contracts/e2e-eval.cjs::HYGIENE_EVENT_SEVERITY` at weight 1.0 so a
  run with enforcement INACTIVE cannot reach a clean ProcessHygiene score —
  the rest of the trace is not trustworthy when the porter was absent. Pure
  function (no env reads, no global state); SOFT-fails to `inactive` on any
  error so the doubt always surfaces.
- **AUDIT-005 (HIGH) — machine-readable audit-read-budget deny.**
  `lib/audit-read-budget.cjs::buildAuditCorrectiveDescriptor` now exposes
  closed-vocabulary fields `corrective_action: "dispatch_agent"` +
  `agent_type: "audit-intake"` alongside the existing descriptor fields
  (`invariant_id`, `what_failed`, `what_is_missing`, `fix_instruction`,
  `resume_instruction`, `workflow`, `blocking` — all preserved unchanged).
  `buildAuditInlineReason` appends a
  `[corrective_action=dispatch_agent agent_type=audit-intake]` suffix to
  the prose reason (no newline — keeps CR/LF injection defense intact) so
  even a parent reading only text can pattern-match the recovery action.
- **AUDIT-006 (NEW, MED) — evaluator-abort-blindspot.**
  `lib/e2e-evaluator.cjs::scoreRun` now short-circuits on aborted runs: when
  `state.abort_reason` is a non-empty string AND `state.pipeline_outcome`
  starts with `ABORTED_`, the evaluator drops StepCompletion / GateCoverage /
  OrderIntegrity (null → renormalized over ProcessHygiene) and emits exactly
  ONE AUDIT-class `hygiene_violation` named `PIPELINE_ABORTED` (severity
  high, weight 1.0). Before this branch, aborted runs were scored as
  catastrophic failures with a wall of `missing_step` / `missing_gate`
  noise that buried real findings.
- **META — `PIPELINE_AUTONOMOUS_RECOVERY_MODE` escape.**
  `.claude/hooks/skill-frontmatter-parser.cjs::getEnforcementMode` honours
  the `PIPELINE_AUTONOMOUS_RECOVERY_MODE=true` env flag by DOWNGRADING
  `deny` to `warn` for the current process. The conversion is one-shot
  audited via a single `[AUDIT] PIPELINE_AUTONOMOUS_RECOVERY_MODE=true
  active — enforcement DOWNGRADED to warn for this process.` stderr line per
  process. Case-sensitive `"true"` only (typos / shell quirks do not broaden
  the escape footprint); downgrade-only (never escalates `warn` to `deny`).
  Institutionalizes the user-authorized recovery path from the v8.16.0
  audit-run failure: an autonomous run that needs to dispatch a sequence of
  governed agents under `/goal full autonomy` can now convert chain-tied
  DENY to WARN at the env layer instead of hacking the sentinel mid-run.

### TDD

- `tests/regression/v8.17.0/F1_stop_hook_write_verify.cjs` (4 cases — match,
  mismatch, missing file, malformed tail).
- `tests/regression/v8.17.0/F2_enforcement_inactive_detector.cjs` (10+
  cases — hook present, hook absent, missing hooks dir, contract weight,
  bad-input safety).
- `tests/regression/v8.17.0/F3_audit_read_budget_machine_readable.cjs`
  (9 cases — closed-vocabulary fields on descriptor + prose suffix +
  Scenario 4 regression that existing corrective fields survive).
- `tests/regression/v8.17.0/F4_evaluator_abort_branch.cjs` (14 cases — abort
  branch drops sub-scores, emits one PIPELINE_ABORTED, normal/partial state
  doesn't trigger).
- `tests/regression/v8.17.0/F5_autonomous_recovery_mode.cjs` (5 cases —
  flag unset is no-op, flag downgrades deny→warn, never escalates warn,
  case-sensitive "true" only, audit line on stderr).

### Iron Law preserved

- Only `.claude/hooks/`, `.codex/hooks/` (mirror), `lib/` and `tests/`
  touched. The 35-row Mandatory Gates by Complexity table and the 49-row
  Gate Registry are **untouched** — every new event in this release is an
  AUDIT-class signal in `protocol-events.jsonl`, not a new gate row.
- Suite: 4 fail = the 4 pre-existing Langfuse/env baseline (v7.3.0/F8,
  v7.3.0/F9, v7.3.0/F10 langfuse + v7.6.0/F2 score-writer) unchanged.

## [8.16.0] - 2026-06-28

### Fixed — autonomous bugfix of 2 glitches from the v8.15.1 self-audit run
- **Glitch A (HIGH, weight 1) — `missing_step: final`.** The v8.15.0 deterministic
  E2E evaluator flagged that the `final` agent-step was never stamped into
  `sentinel-state.json:step_ledger` after the final-validator subagent returned.
  Investigation confirmed the existing `step-ledger-stamp.cjs` PostToolUse:Agent
  hook already handles the standard Agent return shape correctly — the audit-run
  miss was a path-specific artifact of the parent-driven dispatch loop. The fix
  here PINS that contract with `tests/regression/v8.16.0/F1_subagent_return_stamps_ledger.cjs`
  (4 cases: final-validator Agent return stamps `final`; raw PIPELINE_AGENT_RESULT_V1
  string accepted; errored return rejected; ungoverned agent return does not mutate
  the ledger) — RED on a hypothetical regression to the stamping path, GREEN on the
  current code. A future change that breaks the stamper now fails at the gate.
- **Glitch B (MEDIUM, weight 0.5) — `hygiene_violation: BRAINSTORM_EVIDENCE_MISSING`.**
  The v7.14.0 `STEP_1_7_ROUTING` enforcement requires every MEDIA/COMPLEXA/Spec run
  to log one of `{load-existing, dispatch-brainstorm, no-prep-override, simples-bypass}`
  in `gate-decisions.jsonl`. A direct-entry `/pipeline-orchestrator:pipeline` path
  (e.g. `--audit`) never auto-emitted `no-prep-override`, so the final-validator
  hygiene check raised `BRAINSTORM_EVIDENCE_MISSING`. `.claude/hooks/step-ledger-stamp.cjs`
  now auto-emits a single `STEP_1_7_ROUTING(no-prep-override)` entry the FIRST time
  a governed step is stamped on a direct-entry run — via the existing SSOT
  `lib/step-1-7-routing.cjs::appendStep17Routing`. Idempotent (skipped when the run
  already carries a `step_1_7` block in signed state or a `STEP_1_7_ROUTING` gate
  entry on disk) and scoped to MEDIA/COMPLEXA/Spec (SIMPLES + non-Spec runs are
  exempt, matching the dispatch-guard `handleBrainstormDispatch` in-scope rule).
  TDD: `tests/regression/v8.16.0/F2_direct_entry_emits_step_1_7.cjs` (4 cases:
  arm-marker classifies; stamping `classify` auto-emits exactly one entry;
  pre-existing entry is not duplicated; SIMPLES is exempt) — RED on the old code,
  GREEN after the fix.

### Iron Law preserved
- Only `.claude/hooks/step-ledger-stamp.cjs` (the existing PostToolUse:Agent hook)
  and `tests/regression/v8.16.0/` are touched.
- The 35-row Mandatory Gates by Complexity table and the 49-row Gate Registry are
  **untouched** — `STEP_1_7_ROUTING` is an existing v7.14.0 audit-event surface,
  not a new gate. No new hook is registered; the lib helper
  (`lib/step-1-7-routing.cjs`) was already shipping.
- Suite **234/4** (baseline 232 + the 2 new test files; the 4 pre-existing
  Langfuse/env failures unchanged — `v7.3.0/F8`, `v7.3.0/F9`, `v7.3.0/F10`,
  `v7.6.0/F2`).

## [8.15.1] - 2026-06-27

### Fixed — AUDIT read-budget dispatch-exemption persistence
- `writeLedger()` in `lib/audit-read-budget.cjs` now carries the `dispatched` flag across
  writes. Previously the PostToolUse read-counter (`bumpLedger`) rebuilt the ledger object
  without `dispatched`, so the first read after `markDispatched` wiped the exemption and the
  next read re-blocked — a dispatched audit/review subagent was starved by the very read
  budget that is supposed to exempt it (observed live: zero-context reviewers blocked at
  `files_reviewed: 0`). The flag is now read under the same tamper + `arm_id` guard as the
  count, so reset-on-new-invocation and tamper-reset still hold; `markDispatched` still sets
  it true and `bumpLedger` preserves it.
- **TDD:** `tests/regression/v8.14.0/F11` gains a regression block (markDispatched →
  bumpLedger×N → `dispatched` stays true) — RED on the old code, GREEN after the fix.
- **Adversarial review** (independent, code-grounded): 0 critical / 0 high / 0 medium; 1 info
  (a forged *unsigned* `dispatched:true` now persists into a signed ledger — pre-existing
  cooperative-model posture, within the accepted threat model, closed by `PIPELINE_HMAC_STRICT`).
- Suite 232/4 (the 4 are the pre-existing Langfuse/env failures). Iron Law preserved: only
  `lib/` + `tests/` touched; Mandatory Gates table + Gate Registry untouched.

## [8.15.0] - 2026-06-26

### Added — E2E self-evaluation loop
- Deterministic step-by-step run evaluator (`lib/e2e-evaluator.cjs`) over an explicit
  contract (`lib/contracts/e2e-eval.cjs`): scores a finished pipeline run phase-by-phase,
  assigns a grade, and surfaces **human-gated** improvement proposals at the `Stop` event.
- `e2e-eval-gate.cjs` hook + `scripts/e2e-eval-complete.cjs` loop-closer + `/self-eval`
  command wire the loop into the existing fidelity/logging infrastructure (≈70% reused).

### Changed — chain-tied enforcement remediation
- **SSOT marker reading.** The arm-pending marker's verify-on-read (SEC-1 HMAC),
  TTL resolution (SEC-3 floor), and well-formed/expired/tampered discrimination are
  consolidated into one module (`lib/arm-pending.cjs`), consumed by the arm-gate, the
  audit-read-budget gate, and the new `audit-dispatch-marker.cjs` hook. Closes a DRY/DIP
  violation where the same logic lived in three places and two hooks borrowed predicates
  from a sibling hook.
- **Dispatch-aware read budget.** The AUDIT read-budget now exempts a genuinely dispatched
  subagent, so legitimate orchestration is never throttled by the read ceiling.

### Security (final-review findings, fixed)
- **SEC-1** — the dispatch-mark ledger now uses an **allowlist**: only real review/audit/ux
  agents mark the budget as dispatched; the sentinel, task-orchestrator, and brainstorm
  steps never do (the earlier denylist let those collide).
- **SEC-3** — the rehydration deny-message no longer teaches the exec-window write path
  ("a janela não se abre à mão"); the agent is told to dispatch the step's agent instead.
- **SEC-4** — a workflow label echoed into an LLM-facing deny reason is reconstructed from a
  validated `MODE/Type` allowlist (injection-safe SSOT in `lib/pipeline-workflow-classifier.cjs`),
  so an attacker-controlled prefix never survives into model-facing tool-response text.

### Known limitation (cooperative-model floor)
- Enforcement is prompt/coordination-based, **not cryptographic against the parent**. A parent
  with `.pipeline/` write access can still un-govern itself by deleting its own coordination
  state — equivalent to never invoking the pipeline. Full closure of that class requires
  `PIPELINE_HMAC_STRICT` default-on across the whole plugin, a deliberate plugin-wide posture
  change deferred to a future major (touching it now would span many files outside this
  changeset and break the migration-tolerant unsigned default the rest of the plugin relies on).

### Tests / invariants
- `tests/regression/v8.14.0/` (F1–F13, incl. F12 SSOT parity gate↔lib and F13 SEC-4 injection)
  + `tests/regression/v8.15.0/`. Full suite **232 / 4** (the 4 are the pre-existing
  Langfuse/env failures: F8/F9/F10 langfuse + F2 score-writer).
- Iron Law preserved: only `.claude/hooks/`, `lib/`, `hooks.json`, `commands/`, `scripts/`,
  `tests/` — the Mandatory Gates by Complexity table and the Gate Registry are UNTOUCHED.
- Lockstep across the 9 version surfaces.

## [8.13.0] - 2026-06-23

### Added — deterministic AUDIT read-budget gate (closes the read-only inline escape)
- **Root cause**: `pipeline-arm-gate.cjs` always-allows `Read/Grep/Glob` (so a diagnostic is never frozen), so read-only pipeline types (Audit, UX Simulation) ran ENTIRELY inline — never arming, never dispatching the audit-* agents. Same bug class as v8.12.1 R1-SEC-2 (enforcement tied to mutation events, blind to reads).
- **Fix**: in the governed-UNARMED window, count investigation reads in a signed ledger (`.pipeline/state/governed-read-ledger.json`, keyed by `sha256(requested_at)`, reset per /pipeline invocation) and BLOCK the (budget+1)th read for `Audit`/`UX Simulation`. Budget default 12 (`PIPELINE_AUDIT_READ_BUDGET`, floor 1); deny default, escape `PIPELINE_AUDIT_BUDGET_ENFORCEMENT=warn`.
- **Shape**: pure brain `lib/audit-read-budget.cjs` (`decideAuditReadBudget`) + PreToolUse blocker `audit-read-budget-gate.cjs` + PostToolUse counter `audit-read-counter-hook.cjs` (two dedicated `Read|Grep|Glob` matcher blocks in `hooks/hooks.json`). Reuses the arm-gate exported predicates + the HMAC signer (two-tier verify) + exclusive-lock. `pipeline-arm-gate.cjs` is UNCHANGED.
- Light diagnostics pass; arming/dispatch + `.pipeline/` reads are exempt; the marker TTL expires (no deadlock). TDD RED→GREEN (41 scenarios: B0 brain 15 + B0 contract 14 + B2 live 12) + zero-context adversarial review CLEAN (0 CRITICAL / 0 HIGH). Suite 215/4 (the 4 are pre-existing Langfuse/env). Iron Law preserved (registry 49 + Mandatory 24 untouched — enforcement hook, not a registry gate).

### Known issues (MEDIUM/LOW — backlog, accepted threat model, same as v8.12.1)
- Unsigned ledger is tolerated (strip → reset budget); `PIPELINE_HMAC_STRICT=true` closes it. Bash is blocked in the governed window so it cannot be written inline.
- The blocker reads the count without a lock → 1-2 read overshoot under concurrent subagents (the budget is a behavioral heuristic, not a hard limit).
- `isAlignedRead` does not inspect a Glob `pattern` (over-counts a `.pipeline/**` glob — stricter, not weaker).
- `sanitizeWorkflow` keeps `/` (parity with the arm-gate; plain-text reason, no injection).

## [8.12.1] - 2026-06-23

### Fixed (spec 006 — closes the 2 HIGH that left v8.12.0 CONDITIONAL)
- **R1-SEC-1 (HIGH) — verify-on-read** added to ALL THREE corrective read channels in `lib/corrective-dispatch.cjs` (`readActiveSentinelState`, `readCorrectiveTriggers`, `readErrorSignals`): two-tier polarity — signature present+valid accept; present+INVALID reject/drop (fail-closed); unsigned tolerate (migration); key-unavailable tolerate. Reuses `lib/sentinel-state-signer.cjs` verifyState, mirrors `.claude/hooks/edit-guard-hook.cjs`. Forged/replayed on-disk state/trigger/error-signal is now rejected.
- **R1-SEC-2 (HIGH) — dead consumer wiring** fixed: the `corrective-dispatch-gate` PostToolUse matcher in `hooks/hooks.json` now includes `Read|Glob|Grep`, so the corrective drain fires during the governed-unarmed window (where Edit|Write|Bash are denied at PreToolUse). The gate reads via `fs` (no tool recursion); the per-window ceiling (M1) remains the storm backstop.
- TDD: `tests/regression/v8.12.0/SEC_2high_fix.cjs` (7 scenarios RED→GREEN). Full bugfix-heavy pipeline: per-batch adversarial review (Batch A + B CLEAN) + final zero-context security scan (0 CRITICAL / 0 HIGH — both original HIGH genuinely closed). Pa de Cal GO. Suite 212/4 (the 4 are pre-existing Langfuse/env). Iron Law preserved.

### Known issues (pre-existing MEDIUM/LOW — backlog, NOT introduced by this release)
- Strip-attack: an actor with write access to `.pipeline/state/` can strip `__signature` so a forged record passes as unsigned-tolerated (the accepted migration stance; `PIPELINE_HMAC_STRICT=true` closes it). Document in the verify path.
- `active-run.json` pointer is read without an integrity check.
- `corrective-ledger.json` / `*.consumed.json` control files are unsigned (idempotency tamper).

## [8.12.0] - 2026-06-23

### Added (spec 006 — self-healing remediation, Batches 4-7)
- **Batch 4** — corrective engine wired on a gate trip via a deterministic orchestrator hook (`corrective-dispatch-gate.cjs`) reusing the complete `lib/corrective-dispatch.cjs` engine.
- **Batch 5** — LAYER B: signed `error-signals.jsonl` channel (`appendErrorSignal`/`readErrorSignals`) + corrector (`corrective-error-signal-gate.cjs`), fire-and-continue, idempotency dedup.
- **Batch 6** — load-time enforcement-surface self-verification (`enforcement-surface-verify-hook.cjs`).
- TDD RED→GREEN per batch + per-batch independent zero-context adversarial review. Suite 211/4 (the 4 are pre-existing Langfuse/env failures). Iron Law preserved (registry 49 + Mandatory 24 untouched).

### Known issues (2 HIGH — fix in a follow-up run; final-validator verdict CONDITIONAL)
- **R1-SEC-1** (HIGH): corrective channels are signed-on-write but NOT verified-on-read (`readActiveSentinelState` raw `JSON.parse`; engine has no `verifyState`) → forged/replayed on-disk state/trigger accepted; dedup window collapsible. Fix: verify-on-read via edit-guard `findActiveSentinelState`.
- **R1-SEC-2** (HIGH): `corrective-dispatch-gate` is registered under PostToolUse `Edit|Write|NotebookEdit|MultiEdit|Bash|PowerShell`, but those are DENIED at PreToolUse during the governed-unarmed window so no PostToolUse fires → the drain is mostly dead in prod. Fix: matcher include `Read|Grep|Glob` or drain at SessionStart/Stop.
- This MINOR is a user-requested CHECKPOINT release with both HIGHs documented; a follow-up addresses them.

## [8.11.1] - 2026-06-22

### Fixed
- **Enforcement deadlock (dispatch-pending-gate × sentinel-hook).** `.claude/hooks/dispatch-pending-gate.cjs` now exempts a spawn of the `sentinel` agent in BOTH branches (live pending handshake + corrupt signed state), mirroring the exemption `sentinel-hook.cjs` already grants ("sentinel always passes"). Closes the irrecoverable deadlock where a sequence divergence instructs the parent to run the sentinel to auto-correct, but the dispatch-pending lock blocks the sentinel spawn — leaving the run wedged. The sentinel is a read-mostly recovery/diagnosis action, not inline production work, so this is not the wrong-Agent bypass. Found by live dogfood. Test: `tests/regression/v8.12.0/T4_sentinel_recovery_exemption.cjs` (6 scenarios RED→GREEN, incl. security: non-sentinel agent + inline Read still blocked; F37 regression intact). Iron Law: only `.claude/hooks/` + `tests/` touched; no `.codex` mirror. Full suite 206/4 (4 pre-existing Langfuse/env failures).

## [8.11.0] - 2026-06-22

### Changed (the two strong gates now ship ARMED BY DEFAULT in code)
- **SubagentStop commit point is DEFAULT-ON** (`.claude/hooks/subagent-stop-commit-hook.cjs`): a shipped install now enforces it. Opt OUT with `PIPELINE_SUBAGENTSTOP_ENFORCEMENT=warn|off|0|false|no|allow|disabled|observe`. The prior arming lived in dev-only `settings.json`, which is never packaged.
- **Incomplete-run Stop block is DEFAULT-ON** (`.claude/hooks/stop-gate-hook.cjs::isArmed`): opt OUT with `PIPELINE_STOP_BLOCK_ENFORCEMENT=warn|…`.

### Added (the 5 missing wires)
- **B1 — happy-path completer** (`stop-gate-hook.cjs`): on `Stop`, persists `terminal_state=completed` from a REAL success signal (signed-state `final_decision`, else the most-recent `CLOSEOUT_CONFIRM`/`PA_DE_CAL` in a bounded tail of `gate-decisions.jsonl`), so arming the Stop block cannot deadlock a run that actually finished. `persist()` now uses a commit-flag and `writeCompleted` re-checks `isComplete` under the lock (lost-update + idempotency safe; never overwrites a concurrent `aborted_by_user`/`hard_failed`).
- **B2 — green-close producer WIRED** (`machine-evidence-hook.cjs` → `lib/checkpoint-verdict-producer.cjs`): on a CHECKPOINT command only (runner-aware `isCheckpointCommand`; env/`sudo`/`time` prefixes tolerated; build/lint excluded), derives the verdict from the real stdout (now also pytest `N failed`, jest `Tests: N failed`, go `FAIL`/`ok`) and records `last_checkpoint_verdict`. `recordCheckpointVerdict` gained `{countFailure:false}` so the A2/A3 STOP_RULE counter is not double-counted across the two producers (a `pass` still resets it).
- **B3 — consume-once** (`step-ledger-stamp.cjs`): a step-unlocking verdict file (`checkpoint-verdict.json` + the 5 phase verdict files) is renamed (`…consumed-N`, collision-free, audit-preserving) AFTER a successful record, so a stale verdict can't re-unlock a new batch. `batch-files.json` (domains) is left accumulating by design.
- **B4 — readiness lock** (`tests/regression/v8.11.0/B4_subagentstop_readiness.cjs`): fails if any of the 9 governed agents stops emitting `PIPELINE_AGENT_RESULT_V1` (the precondition for default-on commit enforcement).
- **B5 — fail-safe**: an unresolvable `statePath` ALLOWS the Stop instead of looping forever (the continuity counter can't advance, so an infinite block is impossible).

### Quality / process
- Per-batch adversarial review (3 zero-context lenses each) + a final 3-lens integration review. Real defects fixed: overwriting a concurrent `aborted` with `completed`, a red intermediate build falsely failing the close, double-counting one red checkpoint, a green not resetting the counter, an infinite deadlock on a null state path. False alarms (HMAC on `gate-decisions.jsonl`, race with `session-cleanup`) refuted with code evidence (the `CORRUPT_SENTINEL` guard + the H3 ordering test).
- Live `--plugin-dir` probe (OAuth, Claude Code 2.1.183): the code loads, validates and runs; the enforcement hooks fire live and write canonical gate decisions; a control run (armed vs disarmed) was **identical**, proving the new gates are flow-neutral. A full end-to-end close needs an interactive session (the pipeline has human gates that headless `-p` cannot answer).

### Notes
- **Iron Law preserved**: changes only under `.claude/hooks/`, `lib/`, `scripts/`, `tests/`. The Mandatory Gates by Complexity table and the Gate Registry are UNTOUCHED. No production agent `.md` changed — only test co-updates (T13/T14/F5/F6/F7). `tests/regression/v8.11.0/` B1–B5 green; the only suite failures are the pre-existing Langfuse/vendoring env tests + the flaky F07.

## [8.10.0] - 2026-06-21

### Added
- **SubagentStop commit point** (`.claude/hooks/subagent-stop-commit-hook.cjs`, DEFAULT-OFF): parses the agent’s real `last_assistant_message` via the strict result contract and BLOCKS completion on a missing/invalid result; 3-correction cap → `hard_failed`. Live-probe proven that the harness honors the block.
- **9 governed agents emit `=== PIPELINE_AGENT_RESULT_V1 ===`** — the producer that makes the commit point armable.
- **Dispatch `updatedInput` envelope** (prepend-once) on `dispatch-record-hook.cjs`; `agent_type` on the dispatch record.
- **Machine-evidence collector** (`machine-evidence-hook.cjs`, PostToolUse:Bash|PowerShell): records the real command output + `interrupted`. Live finding: the harness exposes no structured Bash exit code, so evidence uses `interrupted` + the runner stdout summary.
- **Stop recovery signal**: the Stop-gate block now also returns `additionalContext` (the exact next action).
- **Leaf-spawn lock**: the `Agent` tool is granted only to the 6 genuine orchestrators; ~37 leaf agents pinned with explicit tools; a tool-sufficiency contract invariant.
- **Green-close checkpoint-verdict producer** (`lib/checkpoint-verdict-producer.cjs`, DEFAULT-OFF): derives the verdict from real signals (runner stdout summary + `interrupted`), closing the v8.9.0 C1 null-verdict hole.
- Full-coverage spec for the enforcement source prompt (18 phases + PLAN MODE + 22 DoD, zero GAP).

### Notes
- Every enforcing gate ships DEFAULT-OFF and arms via env (`PIPELINE_SUBAGENTSTOP_ENFORCEMENT=deny`, `PIPELINE_REQUIRE_GREEN_CLOSE=true`) — fail-closed WITHOUT deadlock. Parent-child authenticated identity stays deferred (the harness exposes no spawning-agent identity).
- Confirmed against Claude Code 2.1.183 via a live `--settings` hook probe.

## [8.9.0] - 2026-06-20 — Flow-determinism gates Wave 1+2: red-build / STOP_RULE / sensitive-domain + generic phase-verdict (A1-A9) (MINOR)

Converts prompt-only pipeline flow rules into deterministic DENY gates (consumer side; progressive activation).

### Wave 1
- **A1 checkpoint-verdict** — deny advancing (review-orchestrator/final-validator) while the last build/test verdict is RED. `lib/checkpoint-verdict.cjs` + `.claude/hooks/checkpoint-verdict-gate.cjs`.
- **A2/A3 STOP_RULE** — deny advancing after 2 consecutive checkpoint/sanity fails. `lib/consecutive-failure-counter.cjs`.
- **A4 sensitive-domain** — auth/crypto/payment/data-model touch makes the adversarial review mandatory (warn escape denied). `lib/domain-scanner.cjs` + `lib/batch-review-guard.cjs` sensitive flag.

### Wave 2
- **A5-A9 generic phase-verdict gate** — SSOT conflict, info-gate blocked, plan rejected, open final CRITICAL, and NO-GO each deny the correct downstream agent. `lib/phase-verdict-guard.cjs` + `.claude/hooks/phase-verdict-gate.cjs`.

### Plumbing & safety
- `recordCheckpointVerdict` / `recordDomainsTouched` / `recordPhaseVerdict` in `scripts/record-step.cjs` (closed allowlist, anti-injection, under the exclusive-lock) + `step-ledger-stamp.cjs` verdict-file wiring.
- Gates **fail-OPEN** until the producing agent emits its verdict file (progressive activation as producers are wired); the A1b close-on-green rule is **opt-in** via `PIPELINE_REQUIRE_GREEN_CLOSE` so the default flow never deadlocks.
- Per-wave + FINAL adversarial review (3 zero-context reviewers): plural-evasion in the domain scanner fixed (`sessions/`, `payments/`, `credentials/`); A1b closeout deadlock removed; overwrite-is-the-corrective-path documented.

Tests `tests/regression/v8.9.0/` F1-F3 (39 green); full suite 176/180 (4 pre-existing Langfuse env failures). Iron Law preserved (`hooks/`,`lib/`,`scripts/`,`tests/` only; Mandatory Gates table + Registry untouched; no TypeScript). Lockstep 9 surfaces.

## [8.8.0] - 2026-06-20 — Determinism enforcement hardening: gate-log deny default, governed fail-closed, REFACTOR_SCOPE_LOCK write-time hook, bare /refactor skill, signed arm-pending marker (MINOR)

Closes the 2026-06-19 flow-determinism audit findings AUDIT-001 through AUDIT-007. Six remediation batches, each TDD RED→GREEN with its own regression test under `tests/regression/v8.8.0/` (F3–F9):

- **B1 (AUDIT-001):** `gate-log-gate.cjs` enforcement default flips `warn` → `deny` for governed leaves — a missing required gate now blocks rather than only warning.
- **B2 (AUDIT-003):** `step-ledger-gate.cjs`, `gate-log-gate.cjs`, and `dispatch-pending-gate.cjs` now fail **CLOSED** on a corrupt (tampered-HMAC) sentinel-state for GOVERNED actions, reaching parity with `batch-review-gate.cjs`. Absent state stays fail-open (absent ≠ corrupt); warn escape still relaxes; ungoverned actions never deadlock. A documenting comment marks the intentional front-door fail-OPEN exception in `pipeline-arm-gate.cjs`.
- **B3 (AUDIT-002):** new write-time enforcement in `scope-lock-hook.cjs` — the FIRST production write under a `refactor-light`/`refactor-heavy` run is denied until `REFACTOR_SCOPE_LOCK` is recorded in `gate-decisions.jsonl` (env escape `PIPELINE_REFACTOR_SCOPE_LOCK_ENFORCEMENT=warn`; `.pipeline/` always exempt; governed-fail-closed per AUDIT-003). The two refactor `SKILL.md` files and `lib/step-ledger.cjs` header now credit this code-level hook.
- **B4 (AUDIT-006):** new bare routing skill `skills/refactor/SKILL.md` (mirrors `skills/bugfix/SKILL.md`) — routes `--light`/`--heavy` and delegates flagless input to the controller with `PRE_CLASSIFIED_TYPE=Refactor`; no `steps/` folder.
- **B5 (AUDIT-007):** `lib/pipeline-arm.cjs::writeArmPending` now HMAC-signs the arm-pending marker via the existing sentinel-state signer (SSOT); `pipeline-arm-gate.cjs` verifies it and treats a tampered marker as not-armed. Unsigned markers tolerated by default; `PIPELINE_HMAC_STRICT=true` rejects unsigned too.
- **B6 (AUDIT-005):** version bump 8.7.0 → 8.8.0 across the lockstep surfaces (this entry).

Iron Law preserved: the `references/gates.md` Mandatory Gates by Complexity table and Gate Registry are UNTOUCHED — the new behavior lives entirely in the existing enforcement hooks and the additive refactor skill. No TypeScript; `.cjs` + `.md` only.

## [8.7.0] - 2026-06-18 — Deterministic enforcement layer: arm-gate + step-ledger + loop-cap + gate-log (MINOR)

Closes the 2026-06-18 root-cause audit: the pipeline's enforcement all keyed off a `sentinel-state.json` that the LLM had to VOLUNTARILY create — the front-door UserPromptSubmit hook can only print a reminder, never deny — so any `/pipeline` invocation could be handled inline with zero enforcement (observed live: the controller treated `/pipeline` as a Q&A and never armed a run). v8.7.0 adds the deterministic, code-enforced layer that makes the agent unable to do real work until a run is armed and run in order. Built and validated BY the pipeline with real spawned subagents.

### Added (TDD RED→GREEN; 12 new regression suites tests/regression/v8.7.0/ F1–F12)
- `lib/pipeline-workflow-classifier.cjs` — deterministic workflow detection from the `/pipeline` prompt; explicit type flags beat keyword heuristic; `review-only`/`diagnostic` guarded by `isPipelineInvocation`.
- `lib/pipeline-arm.cjs` + `.claude/hooks/pipeline-arm-writer.cjs` (UserPromptSubmit) — write an arm-pending marker (classified workflow) on `/pipeline`.
- `.claude/hooks/pipeline-arm-gate.cjs` (PreToolUse) — DENIES substantive work (Edit/Write/Bash/generic Agent) while a pipeline is requested-but-unarmed; reads/questions/.pipeline-writes/pipeline-agent-spawns stay free; default deny; TTL floored; deny reason sanitized; fail-open on missing/corrupt/discovery-absent.
- `lib/step-ledger.cjs` + `.claude/hooks/step-ledger-gate.cjs` (PreToolUse) + `.claude/hooks/step-ledger-stamp.cjs` (PostToolUse) + `scripts/record-step.cjs` — phase-order enforcement: each governed agent's completion stamps its step into the HMAC-signed state; out-of-order spawns denied. HMAC verified before trust/re-sign (no forged-state laundering). Default deny.
- `lib/fix-loop.cjs` (+ wiring in step-ledger gate/stamp) — deterministic fix-loop cap (default 3): denies the (max+1)th `executor-fix`; in-state `fix_loop_max` can only LOWER the cap. Default deny.
- `lib/gate-log-guard.cjs` + `.claude/hooks/gate-log-gate.cjs` (PreToolUse) — gate-logging enforcement: a phase-transition agent is gated until the prior phase's required `gate-decisions.jsonl` entries exist (executor-controller←TDD_APPROVAL, final-validator←ADVERSARIAL_GATE). Default warn (rollout).
- `.claude/hooks/sentinel-hook.cjs` — `expected_next` may now be an ARRAY (sanctioned parallel review fan-out); single-string behavior unchanged.

### Validation (multi-agent, in-pipeline)
2 adversarial review rounds (6 zero-context reviewers — security/architecture/quality — run in parallel) + 3 `executor-fix` passes. Found+fixed 2 CRITICAL (forged-state laundering; step-ledger warn-default) and HIGH (review-only/diagnostic misclassification, unclamped fix_loop_max, fail-closed arm-gate, negative-TTL disable, deny-reason injection); all 6 re-confirmed closed in the final review. Suite: 120 pass / 4 fail (the 4 = pre-existing Langfuse env baseline).

### Known follow-ups (tracked, non-blocking)
- HIGH: `REQUIRED_GATES_BEFORE` vs `AGENT_STEP_MAP` are two order maps without a single source (F12 pins the subset relationship; derive-from-one is post-ship); `final-validator` on COMPLEXA should require `FINAL_ADVERSARIAL_GATE` (gate-log is complexity-blind today).
- HIGH: denial opacity — up to ~8 PreToolUse hooks on an Agent spawn; document order + which deny wins.
- MEDIUM: extract a shared resolve-active-run module (4 hooks discover state 3 ways); Spec/brainstorm have step manifests but no agent map (ungoverned); flip gate-log default warn→deny after dogfood.

## [8.6.0] - 2026-06-18 — Adversarial loop-breaker + universal SIMPLES scope (MINOR)

Replaces the per-batch adversarial fix loop's "stop on the 3rd failure" model with a bounded two-level guardrail and a self-healing escape, and makes plan mode + adversarial review universal (including SIMPLES).

**New gate `ADVERSARIAL_LOOP_BREAKER` (CIRCUIT_BREAKER).** The existing inner counter (`adversarial_block_attempts`, max 3 per cycle) is now nested inside a new outer counter (`adversarial_loop_count`, max 4 cycles per batch). When the inner counter hits 3 without a CLEAN adversarial result, the review cycle has completed without success: the orchestrator increments the outer counter FIRST, then branches (increment-before-compare). If the new value is < 4 it resets the inner counter and starts a new cycle; when the increment makes it == 4 (4 full cycles = 12 fix attempts done), the 5th adversarial review fires `ADVERSARIAL_LOOP_BREAKER` and runs the DIAGNOSE-THEN-REIMPLEMENT escape instead of a 5th fix cycle. The escape (review-orchestrator Step 2b) reads the prior `04-adversarial-batch-*.md` reports, classifies why the loop is stuck (contradictory-findings / false-positive / impossible-constraint), then dispatches `executor-fix` in a new `mode: REIMPLEMENT` that rewrites the contested section from a blank slate rather than patching prior patches. After a checkpoint and ONE final adversarial pass: PASS → return to normal flow; FAIL or escape already used (`escape_used` sticky flag) → `FIX_LOOP_EXHAUSTED` hard stop. The escape runs at most once per batch.

**Universal scope (SIMPLES).** Plan mode now runs automatically for SIMPLES (the `--no-plan` override is logged but ignored, same as COMPLEXA), and adversarial review is now mandatory for SIMPLES (auth + input-validation + error-handling minimum — the "skip entirely" loophole is removed). The SIMPLES mandatory gate set grows 6 → 11 (adds PLAN_REJECTED, ADVERSARIAL_GATE, ADVERSARIAL_BLOCK, FIX_LOOP_EXHAUSTED, ADVERSARIAL_LOOP_BREAKER); MEDIA 11 → 13 (+FIX_LOOP_EXHAUSTED, +ADVERSARIAL_LOOP_BREAKER, per the cumulative rule); COMPLEXA 17 → 18 (+ADVERSARIAL_LOOP_BREAKER). Gate registry header 43 → 44; Mandatory Gates by Complexity table 23 → 24 rows.

**Deliberate Iron Law change.** The F1 Mandatory-Gates invariant is intentionally updated this release (gates.md table ↔ fidelity-reporter.cjs constant in lockstep). The cumulative superset rule is preserved with no exceptions: because `FIX_LOOP_EXHAUSTED` is now mandatory for SIMPLES, it is mandatory for MEDIA and COMPLEXA too.

**State.** `sentinel-state.json` `review_state` gains `adversarial_loop_count` and `escape_used` (both reset on batch change), documented in references/sentinel-integration.md.

**Tests.** New `tests/regression/v8.6.0/F1_adversarial_loop_breaker.cjs` (17 scenarios, GREEN). F7 version-sync rolled to 8.6.0 / prev 8.4.0; the phase-1-5-trigger canonical fixture updated for universal SIMPLES plan mode.

**Surfaces touched:** references/gates.md, lib/fidelity-reporter.cjs, references/sentinel-integration.md, agents/quality/review-orchestrator.md, agents/core/adversarial-batch.md, agents/executor/executor-fix.md, commands/pipeline.md, agents/core/pipeline-controller.md, references/complexity-matrix.md, references/plan-mode-mandatory-agents.json, plus the 8 version-lockstep surfaces. Branched off 8.4.0 — must be rebased over the in-flight 8.5.0 that lives only on `main`. No `.codex` mirror needed (only langfuse/stop hooks mirror, and neither references adversarial logic). `lib/contracts/gate-decision.cjs` carries no gate-name allowlist, so no edit was required there.

## [8.5.0] - 2026-06-18 — Deterministic /spec authoring enforcement force-back (MINOR)

Deterministic /spec authoring enforcement force-back (P1-P5): seal-gate (`sealSpecRun()` 4 pre-seal checks + `spec-seal-guard.cjs` hook), `record-spec-step.cjs` writer + per-step stamping, review-convergence gate, code-produced `implementation_contract` + sealed-spec→implementation handoff guard (`dispatch-guard` `handleSealedSpecImplementation`, `final-validator` SPEC_CONTRACT_DISCIPLINE_MISSING, `pipeline-controller` Phase 0), structural parallel-dispatch (`DISPATCH_REQUEST` `group_id`/`batch_mode` + `parallel-dispatch-gate.cjs`). 4 AUDIT gates; Iron Law F1 table unchanged. New `tests/regression/v8.5.0/` F1-F6.

### Added
- `lib/run-seal.cjs` (P1): `sealSpecRun()` gains 4 pre-seal preconditions — `spec_review_done`, the 4 required artifacts (`requirements.md`/`design.md`/`tasks.md`/`spec.json`), `research.md` existence, and `spec_review_converged` in the sentinel-state. All return the canonical `{ok:false, error:'sealSpecRun: …'}` shape; legacy runs without a spec manifest pass fail-open.
- `.claude/hooks/spec-seal-guard.cjs` (NEW, P1): PreToolUse `Bash|PowerShell` hook that intercepts `run-seal.cjs` invocations and denies (env `PIPELINE_SPEC_AUTHORING_ENFORCEMENT=deny`) / emits `SPEC_AUTHORING_INCOMPLETE` when the sentinel shows the review loop did not converge. Fail-open on any extraction/read failure.
- `scripts/record-spec-step.cjs` (NEW, P2): `recordSpecStep(pipelineDocPath, step, status)` merges `spec_authoring_progress[step]` into the signed sentinel-state (closed vocabulary of 9 steps × {done, auto-skipped}); CLI entry. `spec-controller` Steps 1-9 stamp each step; emits `SPEC_AUTHORING_STEP_BYPASS` on a skipped step.
- `.claude/hooks/parallel-dispatch-gate.cjs` (NEW, P5): PreToolUse `Agent` hook enforcing the armed `parallel_dispatch_expected` group; warn-first (`PARALLEL_DISPATCH_VIOLATION`), deny only under `PIPELINE_PARALLEL_ENFORCEMENT=deny`. Fail-open on every parse/read/verify error.
- `tests/regression/v8.5.0/` F1-F6 covering seal preconditions, per-step recording, review convergence, the implementation_contract handoff, parallel dispatch, and this registration + lockstep batch.

### Changed
- `agents/core/spec-controller.md`, `agents/core/pipeline-controller.md`, `agents/core/final-validator.md`, `.claude/hooks/dispatch-guard.cjs` (P3/P4): code-produced `implementation_contract` (sealed, `required_impl_gates[]`, `spec_dir`) written at review convergence; sealed-spec→implementation dispatch guarded; `final-validator` downgrades GO → CONDITIONAL and emits `SPEC_CONTRACT_DISCIPLINE_MISSING` when required gates are unsatisfied; `pipeline-controller` Phase 0 detects a sealed contract and forces `type=Spec`.
- `references/gate-request-protocol.md` + the 3 parallel-emitting agents (`final-adversarial-orchestrator`, `review-orchestrator`, `executor-controller`) (P5): `DISPATCH_REQUEST` gains optional `group_id` + `batch_mode: parallel` (absent = legacy serial behavior).
- `references/gates.md`: new "Spec-authoring enforcement gates (v8.5.0)" subsection lists the 4 new AUDIT gates; registry header count 43 → 47. The "Mandatory Gates by Complexity" table is byte-identical (23 rows, F1 preserved). The 4 AUDIT names go to `protocol-events.jsonl`, never `lib/contracts/gate-decision.cjs`.
- `hooks/hooks.json`: registers `spec-seal-guard.cjs` (Bash|PowerShell) + `parallel-dispatch-gate.cjs` (Agent); SessionStart banner declares v8.5.0.
- `.claude/hooks/parallel-dispatch-gate.cjs` (folded B5 minors): `armed_ts` is validated against an ISO-8601 prefix regex before `Date.parse` (CRYPTO-1, fail-open otherwise); group-member leaf matches require the spawned `subagent_type` to be namespaced `pipeline-orchestrator:` so a third-party agent with a colliding leaf is NOT treated as in-group (INPUT-1, mirrors dispatch-guard).

### Codex parity
- The 2 new hooks have NO `.codex/hooks/` mirror by design — only the langfuse/stop hooks mirror to `.codex`; `dispatch-guard.cjs` itself has no codex mirror, so neither do these.

### Version lockstep (9 surfaces)
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (version + `source.ref`), `package.json`, `lib/index.cjs`, `CLAUDE.md`, `README.md` (version + gates badge 47), `CHANGELOG.md`, `.cursor-plugin/plugin.json`, `hooks/hooks.json` banner — all at 8.5.0. `tests/regression/v7.1.0/F7_version_sync.cjs` bumped (VERSION=8.5.0, PREV=8.4.0).

## [8.4.0] - 2026-06-18 — Spec-workflow telemetry/fidelity bridge (MINOR)

Makes the `/pipeline-orchestrator:spec` authoring workflow (spec-controller, v8.0.0) leave a MEASURABLE telemetry/fidelity/Langfuse trail. An audit-heavy run with 4 real subagents found (AUDIT-001..006) that spec runs live in `pipeline-runs/<run_id>/` but the telemetry layer (stop-hook, langfuse-hook, fidelity-reporter) only discovers runs via `.pipeline/active-run.json` → `sentinel-state.json` or by scanning `.pipeline/docs/` — so spec runs were invisible (zero run-log entries; REST query confirmed 50 Langfuse traces, 0 spec) and the fidelity yardstick used the wrong (processing) gate set. Fix is ADDITIVE: it teaches the spec workflow to leave the trail the existing fast-path already knows how to read — it does NOT move runs, change the `.pipeline/docs/` scan, or touch the Mandatory Gates table (Iron Law preserved).

### Added
- `lib/run-seal.cjs` (NEW): `sealSpecRun(runDir, {variant, grade})` updates the manifest (new `sealed` status, phase 3, step 9, `spec_lifecycle_completed`, `notes.options.spec_sealed`/`controller_type`), closes the run's sentinel-state (`pipeline_active:false`, re-signed), and appends a `SPEC_SEALED` line to `gate-decisions.jsonl`. Idempotent + fail-safe, with a `node lib/run-seal.cjs <runDir> --variant spec-authoring` CLI entry (rejects non-absolute runDir).
- `tests/regression/v8.4.0/F6_spec_telemetry_bridge.cjs` (17 sub-tests) covering allocate→discover→seal→score end-to-end, the HMAC-gated authoring yardstick, the tampered-signature fallback, and the CLI.

### Changed
- `lib/run-directory.cjs` `allocate()`: after publishing `PIPELINE_RUN_ID`, fail-safely writes `.pipeline/active-run.json` (atomic temp+rename) + a signed `sentinel-state.json` in the run dir — the telemetry bridge that makes pipeline-runs/ runs discoverable.
- `.claude/hooks/stop-hook.cjs` + `.claude/hooks/langfuse-hook.cjs` (+ `.codex/` mirrors): discover a SEALED (`pipeline_active:false`) run pointed-to by `active-run.json` when it lies OUTSIDE `.pipeline/docs/` (a pipeline-runs/ run), so a just-sealed spec run is logged once (dedup via existing `shouldAppendRunLogEntry`). The authoring fidelity yardstick is only honored when the sentinel's HMAC verifies (a forged/unsigned sentinel falls back to the larger, safe legacy set).
- `lib/fidelity-reporter.cjs`: `mandatorySetFor(complexity, type, variant)` is flow-aware — authoring runs (exact allowlist `{spec-authoring, spec-author}`) score against `[SPEC_SEALED, SPEC_REVIEW_FINDINGS]`; processing variants (spec-light/heavy/audit-only) keep the existing set. `lib/run-manifest.cjs` adds the `sealed` status + exports `notesToObject`.
- `agents/core/spec-controller.md`: Step 0 stamps `controller_type=spec` + notes the bridge files; Step 8 appends `SPEC_REVIEW_FINDINGS` per critic round; Step 9 calls `sealSpecRun` (manifest no longer left stale, AUDIT-004).

### Adversarial review (3 zero-context reviewers, 3 rounds → converged, no CRITICAL/HIGH)
- Round 1 caught the ship-blocker: the authoring yardstick was never threaded into the stop-hook teardown path (`ensureFidelityReport`/`buildRunLogEntry`), so it would never fire on a real run — fixed (FIX-A). Plus exact-allowlist hardening (yardstick hijack), atomic pointer write, CLI entry, sanitization, audit recovery. Round 2 raised the unverified-variant downgrade (HMAC-gated, FIX-K). Round 3 closed the last MEDIUM/LOW (lib-level absolute-path guard, fail-closed). Full suite 142/4 (4 pre-existing Langfuse env), F6 17/17, F3 3/3; `.codex` mirrors byte-identical. Dogfood: built BY the pipeline with real subagents (2 implementers + 4 fix passes + 7 adversarial reviews).

## [8.3.0] - 2026-06-17 — Obrigar o dispatch de subagentes (MINOR)

Deterministic enforcement that the parent orchestrator must DISPATCH subagents instead of doing the work inline. Closes audit finding AUDIT-001/SEC-001 (the root cause behind runs with 0 gates and no protocol-events): Plan-Mode and Brainstorm enforcement defaulted to `warn` (logged but allowed), and the dispatch-pending lock only covered file WRITES — a parent that simply kept working inline (reads, reasoning, shell) was never stopped.

### Changed
- `.claude/hooks/dispatch-guard.cjs`: PLAN_MODE and BRAINSTORM enforcement default flipped `warn` → `deny` (~lines 411, 590). The first dispatch is always allowed; only a boundary-bypassing re-dispatch is denied. `PIPELINE_PLAN_MODE_ENFORCEMENT=warn` / `PIPELINE_BRAINSTORM_ENFORCEMENT=warn` remain the explicit opt-in escape.

### Added
- `.claude/hooks/dispatch-pending-gate.cjs` (NEW): a PreToolUse gate that, while a protocol handshake (DISPATCH/GATE/PLAN_MODE_REQUEST) is pending+live in the sentinel-state, BLOCKS any parent work tool (Read/Edit/Write/Bash/Grep/Glob/WebFetch/MCP/…) — closing the "inline work without writing" hole. Only the resolution passes: an `Agent` spawn that targets the pending block OR carries a DISPATCH_RESULTS/GATE_RESPONSES/PLAN_MODE_RESULTS payload, plus AskUserQuestion/EnterPlanMode/Task*/TodoWrite. Deadlock-proof exemptions: valid exec-window, `.pipeline/` paths, expired pending (timeout recovery), and absent/corrupt state (fail-open). Default `deny`; escape `PIPELINE_DISPATCH_INLINE_ENFORCEMENT=warn` (logs INLINE_WORK_BLOCKED). Registered in hooks.json with a catch-all matcher; reuses edit-guard-hook state-discovery (SSOT). `edit-guard-hook.cjs` now exports `getActiveLock`.

### Tests
- New `tests/regression/v8.3.0/F36-deny-default-enforcement.test.cjs` (4) and `F37-dispatch-pending-gate.test.cjs` (18, incl. the SEC-1 wrong-Agent bypass + MCP-tool block surfaced by the adversarial review). F29/F33 updated to the new contract (warn is now the explicit escape). Hook+unit suite 185/185; full suite no new failures (4 pre-existing Langfuse + flaky F07).

### Adversarial review (3 zero-context reviewers) — fixed
- SEC-1 (HIGH): `Agent` is no longer unconditionally allowed — only resolution dispatches pass (closes the wrong-Agent bypass). SEC-3/RISK-1 (HIGH): matcher widened to catch-all so MCP tools cannot slip through. Plus QUAL-1 (SSOT claim), CLAR-1 (tool string-guard), SEC-8 (detail sanitization), and test-coverage gaps.

### Follow-ups (documented, non-blocking)
- SEC-6: `dispatch-guard` clears pending on bypass, allowing one "fresh" retry before re-detecting — harden to a sticky bypass flag. SEC-2/SEC-4: scope the cleanup-orphan-vs-authoritative-corrupt window and the exec-window read-tool exemption. ARCH-1/2/3 (REC-1): extract a shared `lib/sentinel-state-inspector.cjs` kernel so the gate depends on a kernel, not on the sibling guard. Port the new gate's logic to Cursor/OpenCode.

Lockstep 9 surfaces → 8.3.0.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [8.2.2] - 2026-06-17 — detectShellWrite back-port (PATCH)

Back-ports the OpenCode v0.2.0 `detectShellWrite` hardening into the canonical edit-guard — audit finding A1 from the 2026-06-17 ecosystem audit. The fix had landed in OpenCode but not here, so the canonical Plan-Mode/dispatch terminal guard still let a terminal write slip through while armed.

### Fixed
- `.claude/hooks/edit-guard-hook.cjs::detectShellWrite`: (1) numbered-fd redirect to a file (`echo x 2> src/f.cjs`, `1> out`) is now detected — the redirect regex left side `[^0-9&]` became `[^&]` (only true fd-dups `>&`/`2>&1` stay excluded, via the right side); (2) WRITE_CMDS expanded with `touch|mkdir|rm|rmdir|unlink|shred`, `curl|wget -o/-O`, `tar -x`, `unzip|gunzip|bsdtar|7z`, `git checkout|apply|stash|restore|clean|reset`, `[gm]?awk -i inplace`, `python -m`, `Remove-Item`; (3) verbs now tested on the QUOTE-STRIPPED string (kills the `echo "cp ..."` false positive); (4) heredoc moved out of WRITE_CMDS and tested on the RAW command (so `<<'EOF'` survives stripping).

### Tests
- New `.claude/hooks/__tests__/detect-shell-write-backport.test.cjs` (BP1–BP5, RED→GREEN). Hook+unit suite 173/173; full suite no new failures (4 pre-existing Langfuse + flaky F07).

Lockstep 9 surfaces → 8.2.2. Iron Law: change limited to `detectShellWrite` + its test + lockstep.

## [8.2.1] - 2026-06-17 — Plan-Mode deadlock fix (PATCH)

The v8.2.0 deterministic Plan-Mode gate exempted only `.pipeline/`. But the harness writes the Plan-Mode plan file to `~/.claude/plans/` (or `$CLAUDE_CONFIG_DIR/plans`), OUTSIDE `.pipeline/`. Since the gate arms in Phase 0 and the controller writes the plan in Phase 1.5 (before approval), the gate **deadlocked Plan Mode in every real MEDIA/COMPLEXA/Spec run** — the plan file could not be written at all. Found by live dogfood: the very run porting the gate to OpenCode hit the deadlock when writing its own plan.

### Fixed
- `.claude/hooks/edit-guard-hook.cjs`: new `isPlanFile()` (detects the harness plan dir via `$CLAUDE_CONFIG_DIR/plans`, `os.homedir()/.claude/plans`, or any `.claude/plans/` path segment) + `isExemptPath()` (= `isInsidePipelineDirs` OR `isPlanFile`). The three preventive-lock exemption sites (`shouldBlockWithoutApprovedPlan`, `shouldBlockOnPendingDispatch`, `corruptResult`) now use `isExemptPath`. Writing the plan is planning, not production code.
- Production code outside `.pipeline/` and the plan dir stays blocked (regression-tested). No other lock behavior changed.

### Tests
- New `.claude/hooks/__tests__/plan-mode-exemption.test.cjs` (EX1–EX5, RED→GREEN): plan-file write allowed while armed (plain path, `$CLAUDE_CONFIG_DIR`, and dispatch-lock variant); production code still blocked. Hook+unit suite 168/168; full project suite shows no new failures (4 pre-existing Langfuse + the known flaky F07).

Lockstep 9 surfaces → 8.2.1. Iron Law: change limited to `.claude/hooks/edit-guard-hook.cjs` + its test + lockstep.

## [8.2.0] - 2026-06-17 — Deterministic Plan-Mode gate + hardened write locks (MINOR)

Closes the root cause the user demanded: **no production code is written in a pipeline run until an APPROVED plan is registered in the state** — enforced by code, in all code-writing workflows, not by prose. Also hardens the v8.1.0 dispatch lock against the 3 critical escapes an independent adversarial review found (v8.1.0 had shipped vulnerable).

### Added
- **Deterministic Plan-Mode gate** in `.claude/hooks/edit-guard-hook.cjs` (`shouldBlockWithoutApprovedPlan` + `planGateArmedFromState`): denies production-code writes (Edit/Write/NotebookEdit/MultiEdit AND Bash/PowerShell write-commands) while the active run requires a plan and `phase_1_5_plan.approved !== true`. Fail-safe: a schema≥2 active run with no recorded approval blocks by default.
- `scripts/record-plan-gate.cjs` — arm/approve/reject the gate by read-merge-resigning the HMAC-signed sentinel-state. `arm` derives `required` per workflow type (code-writing → required; Audit/UX read-only → not). approve/reject require a prior arm.
- Controller wiring (`agents/core/pipeline-controller.md`): arm at Sentinel Checkpoint #1, approve/reject at the `phase-1-5-plan-approval` gate. New state field `phase_1_5_plan` (schema_version → 2; legacy schema-1 tolerated). `Bash|PowerShell` matcher added to `hooks/hooks.json`.

### Fixed (security — two adversarial review rounds)
- **Terminal bypass closed**: shell write-commands (redirects incl. `>|`, tee, sed -i, cp/mv/ln/dd, node -e, perl/ruby/php -e, Set-Content/Out-File/Start-Process/iex, heredoc) blocked while a lock is armed; `detectShellWrite` strips quoted substrings to avoid false-positives on reads (`grep 'a>b'`).
- **State substitution closed**: canonical `discoverStatePath` (PIPELINE_DOC_PATH-contained > active-run.json pointer > PIPELINE_RUN_ID > mtime) ties enforcement to the active run.
- **Env-var off-switch removed** (`PIPELINE_DISPATCH_LOCK=warn` no longer disarms).
- **Signature verification on read** (SEC-1): an authoritatively-pointed run whose signed state was tampered on disk → CORRUPT → fail-closed; unsigned/keyless tolerated (migration).
- Corrupt-vs-absent distinction; three block-id aliases (gate_id/dispatch_id/plan_id); handshake-timeout ceiling; approve-without-arm rejected; ReDoS pattern removed.

### Known limitations / follow-up
- `record-plan-gate.cjs approve` is callable directly (cooperative-agent threat model; mitigated by requiring a prior arm). Session-lock check is a follow-up.
- Accepted debt (non-blocking): extract `discoverStatePath` + read-merge-resign into shared `lib/` modules (3 copies exist across hooks).

Iron Law: changes limited to `.claude/hooks/`, `hooks/hooks.json`, `scripts/`, tests, and the Plan-gate wiring in `agents/core/pipeline-controller.md` + lockstep.

## [8.1.0] - 2026-06-17 — Dispatch-pending preventive lock (MINOR)

Real-time enforcement closing the Achado #7 failure mode where the parent main LLM ignores a pending `DISPATCH_REQUEST`/`GATE_REQUEST`/`PLAN_MODE_REQUEST` handshake and conducts work inline (observed live in a real Clínica Companion run: fidelity 0.0435, 1/23 mandatory gates). Until now, parent-side enforcement was prompt-only plus a reactive SessionStart timeout that fired ~12h later.

### Added

- `shouldBlockOnPendingDispatch(filePath, pipelineDir)` in `.claude/hooks/edit-guard-hook.cjs`: denies `Edit`/`Write`/`NotebookEdit`/`MultiEdit` to paths outside `.pipeline/` + `pipeline-runs/` while the run's `sentinel-state.json` has a live pending protocol block (age ≤ `PIPELINE_HANDSHAKE_TIMEOUT_MS`, default 30 min). Robust to the `pipeline_active=false` escape (only `pending_blocks` + age matter); expired blocks → allow (recovery via the cleanup-orphan hook); a valid exec-window → allow (legitimate executor). Deny by default; `PIPELINE_DISPATCH_LOCK=warn` audits without blocking. Fail-OPEN on absent/illegible state. Wired into `handlePreToolUse` after the existing lock check — enters force via the already-registered `PreToolUse` `Edit|Write|NotebookEdit|MultiEdit` hook, no manifest change.
- `.claude/hooks/__tests__/dispatch-pending-lock.test.cjs` — 12 scenarios incl. T5 (Clínica Companion reproduction that now BLOCKs) and T12 (CLI dogfood invoking the hook via stdin as Claude Code does). Hooks suite 131/131; full project suite shows no new failures (the 4 pre-existing Langfuse failures are unchanged).
- `docs/plans/2026-06-17-dispatch-pending-lock.md` — Fase 1 of the "parent-orchestrates" re-architecture (Fases 2-3 to follow: state advanced by hook; parent becomes the orchestrator, retiring the DISPATCH_REQUEST hoist).

Iron Law preserved: changes limited to `.claude/hooks/` + tests + docs; no gate registry / agents / skills / commands changes.

## [8.0.3] - 2026-06-17 — Protocol doc guard: no-SendMessage anti-pattern note (PATCH)

Documentation-only. ZERO changes to the plugin runtime, agents, skills, commands, hooks, or `lib/` behavior.

### Fixed
- **Parent main LLM mis-reads the emit-and-hoist handshake as needing `SendMessage` (HIGH, dogfood).** When the `spec-controller` (or any subagent) emits an `AWAITING_DISPATCH_RESULTS` / `AWAITING_GATE_RESPONSES` / `AWAITING_PLAN_MODE_RESULTS` handshake, the parent must re-dispatch with a **fresh `Agent()` call** — the subagent re-hydrates its state from the run-dir on disk. A dogfood session instead concluded it needed `SendMessage` to "continue the same live agent", could not use it, and abandoned the run. The pipeline does **not** use `SendMessage` anywhere; even where it exists it is a deferred tool loadable via `ToolSearch`. Added an explicit anti-pattern note in two places so the next parent does not repeat it:
  - `references/gate-request-protocol.md` (parent-side handler): "re-dispatch" = fresh `Agent()` + disk re-hydration; "SAME subagent" = same `subagent_type` + `run_id`, not the same live process.
  - `skills/spec/SKILL.md` (Achado #7 handler): same guard at the point the parent reads the handler contract.

### Notes
- Covers the Claude plugin and the Cursor plugin (shared file tree); the OpenCode sibling does not use these files.

## [8.0.2] - 2026-06-16 — Release hygiene: clean npm tarball + paperclip tests gated + doc refresh (PATCH)

Closes 4 confirmed findings from an adversarial review of the v8.0.1 release. ZERO changes to the plugin runtime, agents, skills, commands, hooks, or `lib/` behavior.

### Fixed
- **npm tarball ≠ git tag (HIGH).** The published 8.0.1 tarball shipped two files absent from the `v8.0.1` git tree: an untracked `commands/help.md` and a leaked runtime session lock `commands/.pipeline/sessions/<uuid>.lock`. Root cause: `package.json` `files[]` whitelists `commands/` wholesale and the unanchored `.pipeline/` `.npmignore` line is not honored for a nested occurrence under a whitelisted dir. Fix: deleted the stray `.pipeline/` tree, **committed `commands/help.md`** (it is a real `/help` command surface — now consistent across npm + marketplace), and hardened `.npmignore` (`**/.pipeline/`, `*.lock`, `**/*.lock`).
- **Stale manifest descriptions (LOW).** `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `.cursor-plugin/plugin.json` reported `version` 8.0.1 but their human-facing `description` prose was frozen at "v7.14.1", so the marketplace listing advertised the wrong release. Prepended v8.0.0/v8.0.1/v8.0.2 summaries (identical across the three manifests; cursor↔claude parity preserved).
- **README frozen at v7.9.2 (MEDIUM).** Added a "What's New in v8.0" section documenting the spec-authoring takeover + the migration path to `/spec-light`/`-heavy`/`-audit-only`; refreshed the hero/footer version and the tests badge.

### Added
- **Packaging guard** `tests/packaging/no-pack-cruft.test.cjs` — asserts the real `npm pack` output contains no `.pipeline/`, `*.lock`, or editor/OS cruft, so the v8.0.1 leak can never recur silently.
- **`paperclip` test category** in `scripts/run-tests.cjs` — the 13 Paperclip flow-mirror suites (the handoff-stall engine) are now part of the default `npm test` release gate (previously they passed only when invoked manually).

### Notes
- The 4 local `npm test` failures remain environment-induced (the repo `.env` carries live Langfuse keys + `LANGFUSE_ENABLED=true`, loaded with priority by `lib/langfuse-client.cjs`; F9 additionally needs `CLAUDE_PLUGIN_ROOT`). They are excluded from the tarball (`.env` is gitignored and not in `files[]`) and never reach consumers. Honest correction to the v8.0.1 notes: the real failing set is 4 (not 6–7); `v7.4.2/F2` and `v7.13.0/F07` pass.

## [8.0.1] - 2026-06-15 — Paperclip layer: reflect v8.0.0 + fix handoff stalls (PATCH)

Additive update to the `references/paperclip/` integration layer. ZERO changes to the plugin runtime, agents, skills, commands, hooks, or `lib/` outside the Paperclip subtree.

### Changed
- Reflect the v8.0.0 spec-authoring feature into the Paperclip layer: register `spec-controller`, `brainstorm-step-01c-ideation`, `spec-adversarial-critic` in the catalog + provisioner roster (47 → 50, all count references reconciled); split the Spec flow into AUTHORING (spec-controller → ideation → forced interrogator → Kiro lifecycle → spec-adversarial-critic over the documents → contract seal) vs legacy PROCESSING; use the canonical telemetry vocabulary (`IDEATION_PROPOSED/ACCEPTED/REJECTED/SKIPPED`, `DESIGN_INTERROGATOR_FORCED`, `SPEC_REVIEW_FINDINGS`, `SPEC_SEALED`, `SPEC_AMENDED`) — no invented names, no hash-signing (seal stores `phase=sealed` + `sealed_spec` pointer).
- Fix the flow-mirror handoff stalls (root cause per the A0-CALIBRACAO audit of 54 real runs: cargos left the next step implicit): harden the engine against the structural root causes (prevIssueId guard, roster-completeness validation, pre-flight + best-effort compensating delete on partial fan-in, dry-run markers, molde-integrity guarantee, classify→template guard) and enforce the "Montagem Progressiva / Handoff Discipline" contract in PAPERCLIP-AXIOMS + the SPEC workflow.

### Verified
- Flow-mirror suite 13/13 files green (353 tests). Adversarially reviewed; 4 findings fixed.
- **Provisional:** live end-to-end validation pending (Paperclip VPS API was unreachable); the live per-step handoff still depends on cargos following the discipline. A deterministic pre-built-spine remediation is the fallback if a real run stalls.

## [8.0.0] - 2026-06-15 — Spec-authoring workflow take-over (MAJOR)

`/pipeline-orchestrator:spec` changes meaning: it now **authors a new specification from scratch** and seals it as a contract, instead of pre-classifying and implementing an existing spec. This is a breaking entry-point semantic change → MAJOR.

### Added
- **`agents/core/spec-controller.md`** — N1 orchestrator for the spec-authoring workflow: brainstorm clarification → proactive ideation → forced (proportional) design-interrogation → Kiro lifecycle (init/requirements/validate-gap/design/validate-design/tasks) → bounded adversarial-review loop over the spec documents → SEAL. Stops at the sealed spec (no implementation handoff). Handles `--amend <run_id>`.
- **`agents/brainstorm/step-01c-ideation.md`** — new global brainstorm step that PROACTIVELY proposes improvement/feature ideas the user did not raise, across product / architecture / code-quality / UX / risk dimensions (evidence-grounded, opt-in, auto-skips for SIMPLES).
- **`agents/executor/type-specific/spec-adversarial-critic.md`** — reviews spec DOCUMENTS (own inline 13-axis schema; read-only). Reused by the spec-controller loop and by the new `/pipeline-orchestrator:spec-review` command (runs outside the locked spec-light/heavy/audit-only sequences).
- **`references/run-orchestration-substrate.md`** — SSOT for the run-dir/manifest/audit machinery shared by spec-controller and brainstorm-controller; documents the spec.json sealed lifecycle and the `notes.options` ownership convention (`controller_type`).
- **Amendment flow** (`--amend`): reopen a sealed spec, delta-scoped clarification + ideation, re-review, re-seal with `spec_version` increment.
- **8 new telemetry events** — `IDEATION_PROPOSED` (AUDIT/TRIGGERED), `IDEATION_ACCEPTED` (SOFT/APPROVED +0.03), `IDEATION_REJECTED` (SOFT/REJECTED), `IDEATION_SKIPPED` (SOFT/SKIPPED), `DESIGN_INTERROGATOR_FORCED` (AUDIT/DISPATCHED), `SPEC_REVIEW_FINDINGS` (AUDIT/TRIGGERED|NOT_TRIGGERED), `SPEC_SEALED` (AUDIT/CONFIRMED), `SPEC_AMENDED` (AUDIT/CONFIRMED). Gate Registry header **35 → 43**.

### Changed
- `skills/spec/SKILL.md` repurposed to the authoring workflow (thin dispatch of spec-controller). Legacy spec PROCESSING preserved under `/pipeline-orchestrator:spec-light` / `-heavy` / `-audit-only` and `/pipeline --type=Spec`.
- `agents/brainstorm/step-01-explore.md` hardened: every decision-class gap escalates to the user; only pure factual lookups are self-resolved.
- `agents/core/brainstorm-controller.md` gains the global ideation step 1c (fractional 1b→1c numbering preserved; resume back-compat) and a `controller_type` guard in its terminal check.

### Preserved (Iron Law)
- **"Mandatory Gates by Complexity" table UNCHANGED** (SIMPLES 6 / MEDIA 11 / COMPLEXA 17 / Spec +6); F1 untouched. The 8 new events are AUDIT/SOFT and are NOT mandatory.
- Reused-without-modifying surfaces unchanged: the Kiro lifecycle skills, `adversarial-architecture-critic`, the `design-interrogator` body, and the spec-light/heavy/audit-only pipelines.
- `autoDiscover: true` covers the new agents/skills/commands — no manifest registration needed. **`.codex` parity gap (recorded, not fixed):** there is no `.codex` command manifest in this repo (`.codex/` holds only hooks + artifacts), so autoDiscover covers Codex too; nothing to register there.

### Verification
- Adversarial review of the built code across 3 independent lenses + 2 correction loops; 0 open CRITICAL/HIGH. New regression suite under `tests/regression/v8.0.0/`. Version lockstep + F7 at 8.0.0.

## [7.14.1] - 2026-06-14 — Gate-decision SSOT shipped / schema-drift fix (PATCH)

Ships the "Fase 1 do contract-enforcement" fix that had already been merged to
`main` on 2026-06-14 (commit `4420907`) but was never released — the marketplace
`ref` and the lockstep version surfaces still pointed at v7.14.0, so users
installing via marketplace/npm received the version WITHOUT the fix. This release
bumps the lockstep and ships it.

An audit-heavy run of the pipeline against its own repo (2026-06-14) verified the
fix landed on the CORRECT base (git parent of the fix commit = the v7.14.0 release
commit `b6d383e`), integrates cleanly, and introduced ZERO regressions. It also
flagged that the audit/plan docs committed alongside the fix carry stale premises
(they label the repo "7.8.0" and call three existing files "non-existent"); those
docs are corrected in this same release. Report:
`.pipeline/docs/Pre-Heavy-action/2026-06-14-contract-enforcement-base-audit/`.

### Fixed (already in `main` since `4420907`, now released)
- Schema drift: `agents/core/final-validator.md`, `agents/core/pipeline-controller.md`,
  `commands/pipeline.md`, and `references/audit-trail.md` demanded "exactly these 8
  keys" and looked for a `decision: RESOLVED` value the writer never emits. Since
  v7.1.0 the writer emits 13 keys/line (8 base + 5 correlation), so the plugin was
  flagging its own audit trail as anomalous and the MANDATORY/HARD gate validation
  matched nothing. Prose is now aligned to the real writer (canonical 8-value
  decision vocabulary; 13-key conformant subset; legacy <13-key lines tolerated).

### Added
- `lib/contracts/gate-decision.cjs` — SSOT for the gate-decisions.jsonl schema:
  `CANONICAL_DECISIONS` (8), `CANONICAL_HARDNESS` (5), `BASE_GATE_DECISION_KEYS` (8),
  `CORRELATION_KEYS` (5), `ALLOWED_GATE_DECISION_KEYS` (13), `SCHEMA_VERSION` ('1',
  unchanged), plus `isCanonicalDecision`/`isCanonicalHardness`. Plain CommonJS +
  `// @ts-check` (no build step, no devDependency). Consumed by
  `gate-decision-writer.cjs`, `jsonl-sanitizer.cjs`, and `fidelity-reporter.cjs`,
  which now share one Set object — making writer/reader drift structurally
  impossible.
- `tests/regression/v7.9.0/F-gate-decision-contract.test.cjs` — 10 checks (8/5/13
  contract; `RESOLVED` rejected with TypeError; correlation fields written and
  preserved by the sanitizer; structural identity writer/sanitizer/contract; prose
  free of `RESOLVED | APPROVED` and "exactly these keys"). 10/10.

### Changed (release hygiene)
- Lockstep bumped 7.14.0 → 7.14.1 across the F7 surfaces (plugin.json,
  marketplace.json version+ref, package.json, CLAUDE.md canonical line,
  CHANGELOG, `lib/index.cjs`, README badge) + `.cursor-plugin/plugin.json`.
- Corrected the stale premises in
  `docs/audits/2026-06-14-typescript-contract-enforcement/` (wrong version label
  7.8.0 → 7.14.0; "non-existent" files that exist since 7.10–7.14; test count
  59/61 → 114/118) so a future executor of Phases 2–6 does not act on false facts.

### Notes
- Suite: 114 passed / 4 failed / 118 total. The 4 failures are pre-existing and
  environmental (3 Langfuse observability tests + 1 known-flaky concurrent-write),
  unrelated to this change. Build exit 0.
- Iron Law: the underlying fix modified `agents/`/`lib/`/`commands/`/`references/`
  — a conscious, minimal break justified by the self-auditing bug, acknowledged in
  commit `4420907`. No new gate; 35-gate Registry + Mandatory table untouched.

## [7.14.0] - 2026-06-12 — Deterministic STEP 1.7 brainstorm enforcement (MINOR)

Closes the critical finding of the 2026-06-12 classification-flow audit: STEP 1.7
(mandatory brainstorm for MEDIA/COMPLEXA/Spec) was prompt-only — 4 `STEP_1_7_ROUTING`
events in 245 runs, including 1 violation with an out-of-vocabulary value. Same
hardening pattern as PLAN_MODE_BYPASS (v7.9.4 → v7.11.0): verifiable state +
deterministic warn-first hook lock + closeout accrual. Dogfooded end-to-end: the
implementation run itself proved BOTH paths (correct flow logged
`dispatch-brainstorm` on first attempt at Phase 0; deliberate bypass produced a live
`BRAINSTORM_BYPASS` warn and a deny under enforcement).

### Added
- `lib/step-1-7-routing.cjs` — SSOT for the STEP 1.7 routing contract: frozen 4-branch
  vocabulary (`load-existing | dispatch-brainstorm | no-prep-override | simples-bypass`),
  D1 canonical mapping (branch identity in `detail`; the 8-value gate-decision vocabulary
  untouched), `appendStep17Routing` (delegates to the gate-decision-writer; sanitized
  `phase`/`decided_by`; allowlisted `prep_run_id` with JSON-encoded interpolation),
  `buildStep17StateBlock` (sentinel-state `step_1_7` block — stores the RAW branch;
  consumers validate against `BRANCH_VALUES`, not `CANONICAL_DECISIONS`), and
  `recordNoPrepOverride` (audited opt-out trail at `.pipeline/state/no-prep-overrides.jsonl`
  with forensic `prompt` field, path containment, dir auto-create, exclusive lock).
- `references/step-1-7-enforcement.json` — machine-readable roster of Phase-2 spawn
  targets (agents + skill prefixes) consumed by the dispatch-guard, with an embedded
  FAIL-CLOSED fallback in the hook (empty/poisoned registry falls through to the
  fallback; `skill_prefixes` filtered 1..32 chars).
- `.claude/hooks/dispatch-guard.cjs` — new `handleBrainstormDispatch` detector mirroring
  the Plan Mode detector: on dispatch of a Phase-2 target while
  `orchestrator_decision` is MEDIA/COMPLEXA or type Spec AND `sentinel-state.step_1_7`
  is absent/invalid → AUDIT event `BRAINSTORM_BYPASS` in protocol-events.jsonl + stderr
  warn; `PIPELINE_BRAINSTORM_ENFORCEMENT=deny` blocks the spawn with a corrective
  message. Warn fails OPEN on unreadable state (never crashes a session); deny fails
  CLOSED. Per-leaf+run dedup marker (one event per agent per run), namespace guards on
  both Agent and Skill paths, length caps, printable-ASCII sanitization of
  state-derived strings in the deny payload, and two-tier HMAC verification via the
  existing sentinel-state-signer (unsigned tolerated in warn; invalid signature →
  `BRAINSTORM_STATE_UNSIGNED` breadcrumb + block treated as absent; strict+deny
  fail-closed). `planModeAppendEvent` renamed `appendProtocolEvent` (shared).
- `tests/regression/v7.14.0/` — F33 (13 behavioral child-process scenarios: warn/deny/
  happy/SIMPLES-exempt/fail-open/fail-closed/fallback/cache-poisoning/Skill-path/dedup),
  F34 (7 scenarios pinned to the live `BRANCH_TO_CANONICAL` export), F35 (6 scenarios:
  legal escape paths `--no-prep` + SIMPLES). TDD RED → GREEN.

### Changed
- `agents/core/pipeline-controller.md` STEP 1.7 — state-write-before-spawn contract
  (D3): the controller writes `sentinel-state.step_1_7` immediately after the routing
  decision, BEFORE any Phase 1.5/2 spawn; prose now documents the real
  no-prep-overrides entry schema.
- `lib/codex-operational-runtime.cjs` — STEP_1_7_ROUTING write site delegates to
  `appendStep17Routing` (no inline schema duplication); caller-supplied
  `pipelineDocPath` gets resolve + containment; `brainstormConcluded` initialized
  `false` unconditionally (was substring-regex on LLM text).
- `agents/core/final-validator.md` — new Step 1b-brainstorm mirroring
  ADVERSARIAL_EVIDENCE_MISSING: a MEDIA/COMPLEXA/Spec run with no `STEP_1_7_ROUTING`
  entry emits AUDIT event `BRAINSTORM_EVIDENCE_MISSING` to protocol-events.jsonl —
  deliberately NO verdict downgrade (warning-only by design). NOT a new gate.
- `lib/fidelity-reporter.cjs` — pushes a warning into `warnings[]` when a qualifying
  run lacks `STEP_1_7_ROUTING`; binary fidelity score untouched.

### Security
- 27 adversarial findings closed across 6 per-batch zero-context reviews (5 fix loops)
  + 3-reviewer final pass (1 authorized rework): log-injection hardening (allowlist +
  JSON-encoded interpolation), path containment on two writers, registry cache
  poisoning guard, skill-namespace guard, event dedup, length caps, deny-payload
  sanitization, HMAC state verification in the hook.

### Notes
- Iron Law preserved: 35-gate registry, Mandatory table, Inline Invariants and the
  8-value decision vocabulary untouched; `BRAINSTORM_*` are AUDIT events, not gates.
- No `.codex/hooks/dispatch-guard.cjs` mirror exists (only langfuse/stop hooks are
  mirrored); Codex parity lives in `lib/codex-operational-runtime.cjs`.
- v7.15 backlog (documented in the run docs): dynamic require in the branch fallback,
  `handleInput` extensibility for a 3rd detector, TTL constant rename, integration-test
  regex robustness.

## [7.13.0] - 2026-06-12 — Claude Code loop hardening (MINOR)

Closes the 13 audit findings (R1–R13) in `docs/specs/2026-06-12-cloudcode-loop-hardening/`
across 7 batches (B0–B6), each delivered with ATDD+TDD and zero-context adversarial
review (fix loop max 3). Dogfooded through the pipeline-orchestrator itself.

### Security
- **Hook manifest packaging (R3, severe):** `hooks/hooks.json` — the canonical manifest
  that registers the 11 security hooks — is now in `package.json` `files[]`. The package
  previously shipped the hook SCRIPTS but not the MANIFEST, so a tarball/npm install ran
  with the security hooks INACTIVE. Real packaging smoke test via `npm pack`.
- **Sentinel state integrity (R4, severe, warn-first):** `lib/sentinel-state-signer.cjs`
  now uses recursive canonicalization (detects nested-field tampering the old shallow
  `JSON.stringify(rest, topKeys.sort())` silently dropped), length-guarded
  `timingSafeEqual` (no hook crash), and a version-agnostic HMAC key path with a legacy
  5.3.0 fallback. `sentinel-hook.cjs` verifies the signature — WARN + AUDIT event by
  default, DENY under `PIPELINE_HMAC_STRICT=true` (fail-closed covers missing / unparseable
  / tampered active state).
- **Session-lock coverage (R6, severe):** `references/entry-points.json` +
  `lib/entry-points.cjs` (SSOT) replace the duplicated regex in `session-lock-hook` and
  `force-pipeline-agents` that missed `user-story` / `ux-sim` / `spec` and every
  `-light`/`-heavy` variant — those started a pipeline with NO edit lock. Complete embedded
  fallback if the registry is corrupt (never fail-open).

### Added
- `lib/exclusive-lock.cjs` (R8): O_EXCL lock with stale-orphan recovery by age +
  future-clock-skew guard + `Atomics.wait` parking, shared by gate-decisions /
  protocol-events / run-log. `safeAppendJsonl` now actually locks (the "exclusive lock"
  comments became true); protocol-events leaves raw append.
- `scripts/watchdog-cloudcode-hardening.cjs` (R11/R12): release watchdog W1–W12,
  fail-closed, with an explicit test-baseline allow-list (no substring false-PASS).
- Test runner (R9): `scripts/run-tests.cjs` discovers `tests/unit` / `tests/packaging` /
  `tests/watchdog` (previously orphan) with a per-test timeout and a category gate
  (empty = skip, never fail). New categories `tests/packaging/`, `tests/watchdog/`.
- 10 new test files: `tests/regression/v7.13.0/F01,F03–F09` + `tests/packaging/` +
  `tests/watchdog/`.

### Changed
- **Version source of truth (R2):** `lib/index.cjs` (was 6.1.0) and the README badge now
  track the canonical version; F7 covers both new surfaces.
- **Controller tool truthfulness (R5):** `agents/core/pipeline-controller.md` frontmatter
  drops `Bash` + `Task` (the prompt already said it lacks them); new frontmatter↔prompt
  consistency scanner (F03).
- **Gate-decision vocabulary (R7):** `FORCE_VARIANT_OVERRIDDEN` and STATE_FILE_INIT_FAIL's
  `PASS` → canonical `TRIGGERED` (override/outcome semantics move to `detail`); new
  context-aware vocabulary scanner (F08).
- **Adversarial-evidence requirement (R11):** `agents/core/final-validator.md` no longer
  tolerates a silent `adversarial: SKIP` at MEDIA/COMPLEXA — emits an AUDIT
  `ADVERSARIAL_EVIDENCE_MISSING` event to protocol-events.jsonl and downgrades GO→CONDITIONAL.
  NOT a new gate (35-gate registry + Inline Invariants untouched, per the v7.9.4
  PLAN_MODE_BYPASS pattern).

### Fixed
- **Audit semantics (R10):** `lib/run-log.cjs` no longer coerces unknown
  `total_gates_expected` / `duration_seconds` / `total_gates_triggered` from `null` to a
  misleading `0` (unknown coverage ≠ zero coverage); completes the v7.9.1 D4 fix.
  `references/fidelity-report-schema.md` distinguishes gate COVERAGE from QUALITY outcome.

### Notes
- Iron Law preserved: the 35-gate registry and the 23-row Mandatory Gates table are
  untouched. `.codex` mirrors (stop-hook, langfuse-hook) stay byte-identical.
- 6 zero-context adversarial review cycles surfaced and closed HIGH/CRITICAL findings
  (sentinel strict bypass via corrupt state, registry fail-open, watchdog false-PASS).

## [7.12.0] - 2026-06-11 — skill-dispatch wiring for all variants (MINOR)

Completes the variant work begun in v7.11.0: the four families that still ran
Phase 2 inline (`audit-*`, `feature-*`, `user-story-*`, `ux-sim-*`) are now
dispatched to their prescriptive skills by the controller, alongside the
already-dispatched `bugfix-*` and `spec-*`. Only `DIRETO` (SIMPLES, no skill
folder) still runs inline.

### Added
- **Type-level thin shortcuts** `skills/user-story/` and `skills/ux-sim/`
  (mirroring the existing `audit`/`bugfix`/`feature` shortcuts): pre-fix the
  type and route `--light`/`--heavy` directly to the prescriptive skills.
- NEW tests F31 (dispatch wiring) + F32 (user-story/ux-sim step-chain integrity).

### Changed
- `agents/core/pipeline-controller.md` Phase 2 dispatch rule maps all eight
  light/heavy variants of audit/feature/user-story/ux-sim to `Skill(...)`. The
  "state update before spawn" contract is generalized to ANY skill-backed
  variant (no enumeration to drift). Documented that the central `/pipeline`
  `--light/--heavy` flag covers Bug Fix only; other types force depth via their
  thin shortcuts.
- The four B5 prescriptive skills' "How execution flows" notes updated from the
  v7.11.0 inline claim to the v7.12.0 skill-dispatch reality.

### Notes
- **AUDIT-012 reversal:** v7.11.0 reconciled the audit-heavy/light.md
  doc-vs-controller contradiction by making the DOCS say "inline" (matching the
  then-current controller). v7.12.0 resolves it the other direction — the
  controller now DOES skill-dispatch audit, and the docs say so. The end state
  (doc and controller agree on skill-dispatch) is the complete fix; v7.11.0 was
  the interim consistent state. F24-S7 now asserts doc==controller rather than a
  fixed inline/skill verdict.
- Iron Law preserved: `references/gates.md` registry + 35-gate Mandatory table
  untouched; no agent files beyond the controller changed.

## [7.11.0] - 2026-06-11 — enforcement-audit remediation (MINOR)

Closes the 17 findings of the 2026-06-11 enforcement + variant-coverage audit
(`docs/audits/2026-06-11-enforcement-variants-audit/`). Five batches, each with
TDD where code changed, two independent adversarial review passes, and a
completeness watchdog (18/18 findings dispositioned). Suite: zero new failures
vs the pre-work baseline; 6 new regression files F24–F30 (75 scenarios).

### Added
- **Visible Progress Protocol (AUDIT-018):** the controller MUST maintain a live
  `TaskCreate`/`TaskUpdate` checkbox list per phase/batch — pipeline progress is
  now visible in the terminal, not only in prose blocks. Pinned by F24.
- **Deterministic Plan Mode enforcement (AUDIT-001/002/006):** new machine-readable
  roster `references/plan-mode-mandatory-agents.json` (SSOT the hook + F20 read);
  `dispatch-guard.cjs` now detects Plan Mode bypass in CODE (per-agent session-scoped
  pending files, column-0 anchored `PLAN_MODE_RESULTS` check, FQN/namespace match),
  writing `PLAN_MODE_DISPATCH_PENDING`/`PLAN_MODE_BYPASS` to protocol-events.jsonl.
  Warn-first; deny under `PIPELINE_PLAN_MODE_ENFORCEMENT=deny`. Behavioral test F29.
- **Deterministic discovery pointer (AUDIT-005):** `<cwd>/.pipeline/active-run.json`
  (controller-written, containment-guarded, session-scoped) closes the cwd-mtime
  ambiguity behind live false-denies. sentinel-hook Priority 1.5 + stop-hook
  Priority 0. Behavioral tests F27 (sentinel deny path, AUDIT-009) + F28.
- **User Story skills** `user-story-light` / `user-story-heavy` — 1:1 port of the
  Pulsar playbooks (10 steps each). **UX Simulation skills** `ux-sim-light` /
  `ux-sim-heavy` — synthesized, report-only. Closes the variant layer-3 gap
  (AUDIT-014): all 5 task types now 4/4. Variant-aware sentinel enforcement via
  `getVariantSkill` (AUDIT-007). Matrix pinned by F30.

### Changed
- **Gate-count SSOT sync (AUDIT-008):** the two stale inline gate lists
  (`commands/pipeline.md`, `pipeline-controller.md`) updated from 22/27 to the
  authoritative 35; F24 pins all three against each other.
- **Telemetry correlation (AUDIT-003/004/010):** Langfuse spans carry a non-null
  `run_id` (folder-basename fallback) + relative `pipeline_doc_path`;
  `ensureFidelityReport` is now keep-max (no more frozen undercount);
  `timestamp_start` derives from the sentinel `pipeline_id` with a clock-skew
  guard. Behavioral test F25. New correlation fields in the state template.
- **Routing docs (AUDIT-012/013):** `audit-heavy/light.md` corrected to state inline
  routing; Feature variant canonicalized to `feature-light`/`feature-heavy`
  (legacy `implement-*` kept as deprecated aliases). F20 extended to all 10
  mandatory agents (AUDIT-015a).

### Notes
- **AUDIT-011** (foreign `chat-derek` traces) documented as historical pollution
  (zero since the v7.9.3 F14 isolation fix) — no key rotation needed.
- **AUDIT-016** (anti-deadlock ACCEPT) retained as deliberate design, now observable
  by code. **AUDIT-017** informational, no action.
- Iron Law preserved: `references/gates.md` registry + the 35-gate Mandatory table
  untouched; PLAN_MODE_BYPASS stays `event:` (not a registered gate). Codex hook
  mirrors byte-identical.

## [7.10.1] - 2026-06-09 — parallel_eligible default contract (PATCH)

### Bug Fix

- **plan-architect Rule 5 (analysis-incomplete default):** When overlap analysis between tasks in a batch cannot be completed (e.g., `CHANGE_CONTRACT` absent, `allowed_files` contains wildcards/globs, or file paths are dynamically generated), `parallel_eligible` MUST be set to `false` with `overlap_reason` prefixed `"analysis_incomplete:"` followed by the specific cause. Previously, the field was simply absent, causing undefined behavior in executor-controller's parallel dispatch decision.
- **executor-controller explicit guard for absent parallel_eligible:** Added third explicit clause: when `parallel_eligible` is absent or undefined within a batch entry, the controller now falls through to serial dispatch and emits `WARN: parallel_eligible absent in batch <N> — defaulting to serial dispatch` to the pipeline trace. This converts implicit JS falsy behavior into an explicit, observable contract.

### Tests

- **F22-S10:** Verifies plan-architect has Rule 5 covering analysis failure case with `analysis_incomplete:` prefix guidance.
- **F22-S11:** Verifies executor-controller has explicit guard for absent/undefined `parallel_eligible` with WARN trace message.
- F22 total scenarios: 9 → 11 (all PASS).

### Dogfood Evidence

- Pipeline run (Bug Fix / SIMPLES / bugfix-light) validated Plan Mode protocol: 3/3 mandatory agents (plan-architect, bugfix-diagnostic-agent, bugfix-root-cause-analyzer) emitted `PLAN_MODE_REQUEST` on first attempt.

### Iron Law

- ZERO changes to `references/gates.md`, hooks, or `lib/`. 35-gate Registry and 23-row Mandatory Gates untouched.

## [7.10.0] - 2026-06-09 — Plan Mode generalized + parallel dispatch (MINOR)

Generalizes mandatory Plan Mode from 1 agent (plan-architect) to 10 agents and introduces
parallel task dispatch for MEDIA batches with disjoint file scopes. Adversarial review
with 3 independent zero-context reviewers produced 6 fixes. 74 new regression test
scenarios across 4 new test files.

### Added
- **Plan Mode mandatory in 10 agents** — 7 research-heavy agents (`step-01-explore`,
  `audit-intake`, `audit-domain-analyzer`, `bugfix-diagnostic-agent`,
  `bugfix-root-cause-analyzer`, `feature-vertical-slice-planner`,
  `design-interrogator`) + 2 implementer agents (`executor-implementer-task`,
  `feature-implementer`) now emit `PLAN_MODE_REQUEST v1` as Step 0/0b before any
  deep codebase research, delegating reads to the parent in read-only isolation.
- **PLAN_MODE_MANDATORY_AGENTS table** in `pipeline-controller.md` — formal registry
  of all 10 agents subject to Plan Mode enforcement.
- **PLAN_MODE_BYPASS enforcement generalized** — any agent in the mandatory table
  returning without a REQUEST/RESULTS cycle triggers AUDIT event + single re-dispatch;
  second bypass accepted (no deadlock). Extends the v7.9.4 plan-architect-only
  enforcement to all 10 agents.
- **Parallel dispatch for MEDIA batches** — `plan-architect.md` Step 2 now emits
  `parallel_eligible: true|false` per batch after checking `CHANGE_CONTRACT`
  file-scope overlap across tasks. `executor-controller.md` gains `1-PARALLEL`
  dispatch mode: when `parallel_eligible: true`, emits N `DISPATCH_REQUEST` blocks
  in a single response for concurrent implementer execution.
- **Per-task checkpoint attribution** — `checkpoint-validator.md` gains conditional
  `per_task_status` field (only when `parallel_execution: true`) enabling per-task
  failure attribution without re-executing passed tasks.
- **Parallel tasks row** in `references/complexity-matrix.md` Proportional Behavior
  table (SIMPLES: N/A, MEDIA: "Parallel if file-scope disjoint", COMPLEXA: N/A).
- **4 new regression test files** in `tests/regression/v7.10.0/`:
  F20 plan-mode-mandatory-agents (45 scenarios),
  F21 plan-mode-bypass-enforcement (14 scenarios),
  F22 parallel-eligible-contract (9 scenarios),
  F23 checkpoint-parallel-fields (6 scenarios).

### Fixed (adversarial review, 6 findings)
- **ADV-001 (HIGH):** `IMPLEMENTATION_RESULT` added to substantive output list in
  pipeline-controller bypass detection — feature-implementer returns this, not
  `IMPLEMENTER_RESULT`, so bypass detection was silently failing for it.
- **ADV-002 (HIGH):** Removed misleading enforcement delegation to executor-controller
  — pipeline-controller is the single enforcement point per Achado #7's dispatch model.
  Added informational Plan Mode note to executor-controller.
- **COR-001/COR-002 (HIGH):** Step 0 micro-gate reads exempted from Plan Mode
  precondition — micro-gate performs bounded Read/Glob for existence and gap detection
  BEFORE Step 0b Plan Mode Request; precondition changed to "beyond the micro-gate scope."
- **COR-003/COR-004 (MEDIUM):** CONTEXT LOADING STRATEGY sections in both implementer
  agents clarified as delegation definitions (WHAT to read, not WHEN) — actual reading
  delegated to parent via PLAN_MODE_REQUEST.
- **ADV-006 (MEDIUM):** `per_task_status` moved to commented-out conditional block in
  checkpoint-validator YAML template to avoid ambiguity with `parallel_execution: false`.
- **COR-005 (LOW):** feature-implementer Step 1 clarified — VSA_PLAN comes from INPUT
  (dispatch context), codebase excerpts from PLAN_MODE_RESULTS payload.

### Changed
- `tests/regression/v7.2.0/F5_documentation_truth.cjs` baseline range 280-330 → 325-375
  (plan-architect grew from 314 to 349 lines with Plan Mode additions).

## [7.9.4] - 2026-06-06 — Plan Mode contract fix (PATCH)

Fixes the Plan Mode that never fired: 21+ real runs (2026-05-04 → 2026-06-05) produced
ZERO `PLAN_MODE_REQUEST` blocks because `agents/quality/plan-architect.md` contradicted
itself — the canonical "ACHADO #7 RUNTIME PROTOCOL" top section mandated emit-and-wait,
while the PROCESS body (Steps 0/3/4 + Tools footer) instructed calling
`EnterPlanMode`/`ExitPlanMode`/`AskUserQuestion` directly — tools the harness strips from
every subagent. Agents silently fell back to inline planning (failure mode B5-001), and
no enforcement layer noticed. Shipped via a full dogfooded pipeline run
(Bug Fix / MEDIA / bugfix-light, 3 batches, TDD 14 scenarios RED→GREEN, per-batch
adversarial reviews, final adversarial team of 3 zero-context reviewers, 1 authorized
rework pass, Pa de Cal GO @ confidence 0.94). The run itself reproduced the bug live
(22nd consecutive bypass, preserved as evidence in its protocol-events.jsonl).

### Fixed
- **plan-architect.md body/top contradiction** (`agents/quality/plan-architect.md`):
  Step 0 now emits `=== PLAN_MODE_REQUEST v1 ===` + `STATUS: AWAITING_PLAN_MODE_RESULTS`
  and STOPS (defers to the Achado #7 top section as canonical); Step 3 emits a
  `GATE_REQUEST v1` block instead of calling AskUserQuestion; Step 4 defers plan-mode
  exit to the parent session; the INTEGRATION footer "Tools required" lists only
  Read/Grep/Glob + the protocol blocks. 4 stale header claims (frontmatter description,
  intro, OBSERVABILITY banner, RULES #1 framing) aligned to the delegated model — with
  the Rule-1 label prefix "Read-only in Plan Mode" preserved verbatim to honor the
  pinned D7-S7 contract from v6.1.0 (regression caught mid-run by direct controller
  verification and reconciled: label prefix restored + parenthetical clarifier).
- **Enforcement blind spot** (`agents/core/pipeline-controller.md`): new
  `PLAN_MODE_BYPASS` enforcement paragraph after the Phase 1.5 dispatch note — when a
  plan-architect return contains an IMPLEMENTATION_PLAN but the dispatch cycle had no
  `PLAN_MODE_REQUEST`/`PLAN_MODE_RESULTS`, the controller logs an AUDIT event to
  `protocol-events.jsonl` (NOT gate-decisions.jsonl) and re-dispatches ONCE with the
  protocol obligation restated; a second bypass is accepted (no hard block — legacy
  sessions without a parent handler must not deadlock) with the violation surfaced in
  the phase doc and final report. Explicitly NOT a new registered gate: the 35-gate
  Registry and the Inline Invariants list are untouched.

### Added
- `tests/regression/v7.9.4/F18-plan-mode-contract.test.cjs` — 8 scenarios pinning the
  plan-architect contract (stripped-tool instructions absent from the PROCESS body;
  PLAN_MODE_REQUEST/GATE_REQUEST present; Achado #7 + USER INTERACTION PROTOCOL
  sections preserved; explanatory-vs-instructive EnterPlanMode mentions distinguished).
  Section extractor is code-fence-aware (a fenced `## IMPLEMENTATION PLAN` heading no
  longer truncates the scanned body — hole found by the final adversarial review and
  proven closed by mutation test).
- `tests/regression/v7.9.4/F19-controller-inline-plan-check.test.cjs` — 6 scenarios
  pinning the controller enforcement (PLAN_MODE_BYPASS present, wired to
  protocol-events.jsonl, AUDIT hardness, re-dispatch rule, Inline Invariants list and
  Phase 1.5 note intact).

### Notes
- Suite: 62/67 — identical failure set to the pre-run baseline (5 known
  Langfuse/env-dependent failures; none read the modified files; proven via git-stash
  A/B arbitration). Build green.
- Behavioral proof (the plan-mode UI actually appearing) is inherently a next-run
  verification; this release carries the static contract proof (F18+F19) plus the live
  dogfood evidence of the old behavior.
- Follow-ups registered in the run's final-validator doc: dedupe the inlined
  GATE_REQUEST example vs `references/gate-request-protocol.md` (SSOT), harden F19
  S2/S3 proximity assertions, key bypass detection off `pending_blocks` instead of
  prose; pre-existing drifts surfaced: `references/sentinel-integration.md` L54
  expected_next semantics vs hook runtime, controller "22-gate" stale mention,
  PLAN_MODE_RESULT singular/plural in the protocol reference.
- Iron Law preserved: `references/gates.md`, hooks, `lib/` untouched. Mirrors not
  involved (no hook changes).

## [7.9.3] - 2026-06-05 — Telemetry recording fixes + Langfuse project isolation (PATCH)

Three telemetry recording bugs fixed via a dogfooded pipeline run (Bug Fix / MEDIA /
bugfix-light, 3 batches, TDD RED→GREEN, per-batch reviews, Pa de Cal GO), plus the
in-flight Langfuse project-isolation work (F14) shipped in the same window.

### Fixed
- **Run-log duplication** (`.claude/hooks/stop-hook.cjs` + codex mirror): new exported
  pure guard `shouldAppendRunLogEntry(candidate, existingEntries, sentinel)` consulted in
  `handleStop` before `appendRunLog`. Compares only the 8 material fields (`type`,
  `complexity`, `variant`, `total_gates_triggered`, `total_gates_expected`,
  `fidelity_score`, `final_decision`, `pipeline_doc_path`) against the most-recent
  same-run entry; timestamps/duration excluded by design. Materially identical → skip
  with stderr breadcrumb; first entry or material change → append; any guard error →
  fall through to append (soft-fail). Kills the one-entry-per-session-teardown pile-up
  (a single May 31 run had accumulated 30 near-identical lines). Tests: F15 (7
  scenarios) in `tests/regression/v7.9.3/`.
- **fidelity_score always null** (`.claude/hooks/stop-hook.cjs` + mirror): new exported
  `ensureFidelityReport(runFolder, repoRoot, sentinel)` runs in `handleStop` BEFORE
  `buildRunLogEntry` — generates `fidelity-report.json` idempotently (skip if report
  exists; skip silently if `gate-decisions.jsonl` absent; lazy-require of
  `lib/fidelity-reporter.cjs` via plugin root; total soft-fail). New shared helper
  `readClassification(sentinel)` extracted from the D2 cascade (byte-equivalent
  precedence `orchestrator_decision.* > classification_* > session.*`). Run-log entries
  now carry a numeric `fidelity_score`. Tests: F16 (6 scenarios).
- **Langfuse traces with empty metadata / "unknown" spans / fragmented runs**
  (`.claude/hooks/langfuse-hook.cjs` + mirror, `lib/langfuse-carrier.cjs`): (1) new
  `readSentinelData()` discovery with `PIPELINE_DOC_PATH` > `PIPELINE_RUN_ID` match >
  cwd-mtime precedence (SEC-2 containment preserved; `readSentinelPhase` is now a thin
  wrapper); (2) new `buildTraceMetadata(sentinel)` enriches trace AND span metadata with
  `run_id`/`type`/`complexity`/`phase`/`pipeline_doc_path`/`plugin_version` — explicit
  field copy routed through the sanitizer; (3) new `resolveSpanName(payload)` replaces
  the `'unknown'` span-name fallback with readable names (subagent_type > truncated
  description > tool name) + a `SPAN_NAME_FALLBACK` audit breadcrumb; (4) carrier
  `_resolveKey` gains a stable doc-path-derived key tier (`doc-<sha256-12>`) between
  sessionId and ppid, with `CARRIER_DOCPATH_FALLBACK` audit — agents of the same run
  now share one trace even when `PIPELINE_RUN_ID`/`CLAUDE_SESSION_ID` are absent (kills
  cross-session trace fragmentation). `_resolveKey` is now exported for test coverage.
  Tests: F17 (8 scenarios incl. no-secret-leak and mirror parity).

### Added
- **Langfuse project isolation (F14, in-flight work landed this release)**:
  `lib/langfuse-client.cjs` resolves credentials from the plugin's own `.env` before
  the process environment, pinning plugin traces to the `pipeline-orchestrator`
  Langfuse project even when the host session carries other-project keys; emits
  `LANGFUSE_PROJECT_ISOLATION_VIOLATION` audit when a foreign key is detected.
  Tests: F14 (4 scenarios) in `tests/regression/v7.9.3/`.

### Invariants
- Codex mirrors byte-identical (sha256-verified pairs: stop-hook, langfuse-hook).
- Iron Law preserved: `references/gates.md` untouched (23-row Mandatory table + 35-row
  Registry intact, F1 green); no new dependencies; no test weakening; hooks keep the
  exit-0 soft-fail contract.
- Suite: all run targets green (F13 15/15, F15 7/7, F16 6/6, F17 8/8, F12 7/7, F5
  10/10, carriers 9/9 + 6/6). Remaining suite reds are the pre-existing in-flight
  baseline (F8-S6, F9 ×4, F10-S8, F2-vendoring, F2-score-writer-S3a), proven unrelated
  via git-stash A/B arbitration recorded in the run's audit trail.
- Audit trail: `.pipeline/docs/Pre-Medium-action/2026-06-05-fix-telemetry-3bugs/`.

## [7.9.2] - 2026-06-02 — Documentation refresh (PATCH, docs-only)

Pure documentation pass. Brings the user-facing and reference docs up to the
features actually shipped through v7.9.1. ZERO changes to runtime code; Iron Law
preserved (Mandatory Gates table and gate Registry untouched).

### Changed

- **README + diagrams version refresh.** README and `docs/diagrams/` updated from the stale v7.4.0 / v6.0.0 numbers to v7.9.2, including the license correction (MIT → PolyForm Shield 1.0.0) in the diagrams.
- **Paperclip layer documented end-to-end.** Integration layer (v7.6.0) + company provisioner (v7.8.0) + flow-mirror (v7.9.0) now fully documented, covering the issue-tree mirror, the 8 `paperclip-*` slash commands, the `--on=paperclip` flag, and a new `references/paperclip/PAPERCLIP-FLOW-MIRROR.md`.
- **Audit-trail run-log section updated to the v7.9.1 model** — `buildRunLogEntry` now derives `total_gates_expected` / `fidelity_score` / `final_decision` (replacing the prior hardcoded-`null` description).
- **Gate decision vocabulary aligned** to the 8 canonical values (BLOCKED, DISPATCHED, SKIPPED, APPROVED, CONFIRMED, REJECTED, TRIGGERED, NOT_TRIGGERED).

### Fixed

- **Count drift in docs corrected:** gate registry header `22 → 35`, Mandatory Gates table `22 → 23`, test suite count `61`.

### Notes

- Docs-only: ZERO changes to `agents/`, `skills/`, `references/` logic, `commands/`, `hooks/`, `lib/`, or `tests/` (other than the F7 version pin and the F8 prose-count assertion bumped 22→23 to match the corrected `implementation-discipline.md`). Iron Law preserved.
- Canonical version-sync regression (F7) rolled forward to `7.9.2` (PREV `7.9.1`).

## [7.9.1] - 2026-06-02 — Telemetry run-log aggregator bugfix (PATCH)

### Fixed
- `buildRunLogEntry` (`.claude/hooks/stop-hook.cjs` + `.codex/hooks/stop-hook.cjs` mirror) had 4 confirmed defects in the run-log summary it writes on every session end:
  - **D2 — classification from the wrong field.** Read from `sentinel.classification_post_orchestrator` / `.classification` instead of the source of truth `sentinel.orchestrator_decision`, so `type`/`complexity`/`variant` came out `null` almost every run. Now reads `orchestrator_decision` (`.type` / `.task_type` / `.complexity` / `.pipeline_variant`) with the legacy fields preserved as fallback.
  - **D4 — duration since midnight.** A date-only `created_at` (`2026-06-01`, no time) made `Date.parse` resolve to midnight UTC, inflating `duration_seconds` to hours. A date-only timestamp now yields `duration_seconds: null` (unavailable) instead of a misleading number.
  - **D1 — fields hardcoded null.** `total_gates_expected` and `fidelity_score` were literal `null`. `total_gates_expected` is now derived from `MANDATORY_GATES_BY_COMPLEXITY` (lazy-required from `lib/fidelity-reporter.cjs` via channel-agnostic resolution, soft-fail to `null`; MEDIA = 11, +SPEC when `type === 'Spec'`); `fidelity_score` is read from the persisted `fidelity-report.json` in the run folder (`null` when absent).
  - **D3 — premature UNKNOWN.** `final_decision` fell to the literal `'UNKNOWN'` even when derivable. It now cascades `session.status` → `sentinel.final_decision` → the last `CLOSEOUT_CONFIRM` in `gate-decisions.jsonl` (mapped via DECISION_MAP) before `'UNKNOWN'`.

### Notes
- TDD: new `tests/regression/v7.9.0/F13-runlog-entry-defects.test.cjs` (15 scenarios) proven RED (7 fail / 8 pass) → GREEN (15/15). Full suite 61/61 GREEN, `build ok` exit 0.
- `.codex/hooks/stop-hook.cjs` mirror is byte-identical (sha256 `24f7275b…0f3acc` on both files).
- **Scope (Option A):** locked to the 2 hooks + 1 new test. `lib/run-log.cjs::normalizeEntry` intentionally NOT changed — it still coerces `null → 0` for `total_gates_expected`/`duration_seconds` in the written file (an honest neutral default; `buildRunLogEntry` returns the correct `null`, asserted by F13). Iron Law preserved: ZERO changes to `agents/`/`skills/`/`references/`/`commands/`/`lib/`. 22-row Mandatory Gates table and gate Registry untouched.
- Built dogfood through the plugin's own pipeline (Bug Fix / MEDIA / bugfix-light): orchestrator → sentinel ORCHESTRATOR_VALIDATION → plan-architect → TDD RED → executor → zero-context 3-lens review (PASS) → Pa de Cal GO (confidence 0.85). Canonical version-sync regression (F7) rolled forward to `7.9.1`.

## [7.9.0] - 2026-06-01

### Added — Paperclip flow-mirror (árvore de tarefas + 8 comandos slash por fluxo)
- `references/paperclip/spec/lib/tree-template.cjs` — moldes declarativos dos 14 fluxos (bugfix/feature/user-story/audit/ux/spec light+heavy + hotfix + review-only).
- `references/paperclip/spec/lib/tree-factory.cjs` — `nextStep`/`nodeSpec`/`nodeSpecFanIn`/`expandSlices` (loop de conserto com contador interno + fatias dinâmicas).
- `references/paperclip/spec/lib/tree-factory-io.cjs` + `grow-tree.cjs` — braço I/O com transport injetável + guard dry-run/`--confirm` (não cria na VPS sem confirmação).
- `references/paperclip/spec/lib/classify-bridge.cjs` — classificação local tipo+complexidade para o despacho.
- Régua `mirror-fidelity-dictionary.cjs`: `CLARIFICATION_DONE → INFO_GATE_BLOCKED` (teto SIMPLES 0.80 → 1.0) + modo `REVIEW_ONLY`.
- 8 comandos slash `commands/paperclip-{bugfix,feature,user-story,audit,ux,spec,hotfix,review}.md` + `paperclip-overview.md` — classificam local, montam a árvore em dry-run e só criam após confirmação explícita.
- Flag `--on=paperclip` documentada em `commands/pipeline.md`.

### Notes
- Construído com DDD+ATDD+BDD+TDD + revisão adversarial em loop por etapa (72 achados corrigidos). Suíte mirror-fidelity 63 → 309 GREEN.
- Aditivo: ZERO mudanças que quebrem fluxos existentes do Claude Code; `paperclip-*` é canal paralelo de despacho. Iron Law respeitada.

## [7.8.0] - 2026-05-26 — Paperclip Company Provisioner (MINOR)

### Added

- Added `references/paperclip/scripts/provision-pipeline-company.cjs`: an ID-agnostic Node provisioner that stands up a Paperclip company with the full 47-cargo pipeline-orchestrator roster and the 11 custom skills, then attaches the right skills per cargo by category. Agents are created with heartbeat OFF — inert until an issue is assigned, so provisioning never triggers autonomous execution.
- The provisioner resolves the target company by name (creating it if absent), captures agent IDs at runtime for org-chart wiring (all cargos report to `pipeline-controller`), and computes all plugin/skill/workflow-spec paths from `__dirname` — no hardcoded UUIDs or machine-specific paths, so it runs against any Paperclip instance.
- Wired the provisioner into the `/pipeline-orchestrator:setup-paperclip` command as the programmatic provisioning step (previously prose/manual-only).

### Notes

- Skill→category and workflow-spec→category mappings follow `references/paperclip/PLAN-46-AGENTS-UPDATE.md` §2/§3. No agent receives `canCreateAgents` (cargos coordinate via issues, never by hiring each other).
- Iron Law respected: additive script + command-doc edit only; ZERO changes to existing `agents/`, `skills/`, `references/` originals, or `lib/`. Gate registry and mandatory-gates table untouched.
- Canonical version-sync regression (F7) rolled forward to `7.8.0`.

## [7.7.0] - 2026-05-25 — OpenCode Adaptation Marketplace Release (MINOR)

### Added

- Added `opencode-adaptation/` to the marketplace release so OpenCode users can install the adaptation harness, commands, agents, skills, contract tests, and specs from the same tagged repository source.
- Added OpenCode commands for audit, UX, and SPEC light/heavy flows, matching the hardened workflow coverage already validated by the adaptation test suite.

### Changed

- Hardened OpenCode workflow contracts for feature, audit, UX, SPEC, final validation, and closeout so they require physical evidence artifacts instead of boolean-only proof.
- Included the OpenCode adaptation in package release files for distribution parity.

### Test suite impact

- OpenCode adaptation suite: `54 passed / 0 failed / 54 total`.
- Canonical version-sync regression rolled forward to `7.7.0`.

### Release coordination

- Marketplace.json bumped to `version: 7.7.0` and `source.ref: v7.7.0`.
- Global OpenCode config on this machine updated with audit/UX/SPEC light and heavy commands.

## [7.6.1] - 2026-05-24 — Release Hygiene Closure (PATCH)

**Doc drift closure** detectado durante a publicação npm da v7.6.0. ZERO mudanças de runtime — apenas três correções que restauram a invariante de cinco-arquivos-em-lockstep.

### Fixed

- `CLAUDE.md` Source-of-Truth Layer Map: linha canônica de versão atualizada de `7.5.0` → `7.6.1` com descrição atualizada da release. Estava defasada desde v7.6.0 shipped 2026-05-22.
- `.cursor-plugin/plugin.json`: description re-sincronizada com `.claude-plugin/plugin.json` description. Estava defasada em duas minors (parou no v7.4.1).
- `tests/regression/v7.1.0/F7_version_sync.cjs`: constante `VERSION` bumpada `7.6.0` → `7.6.1`; `PREV_VERSION` bumpada `7.5.0` → `7.6.0`. Estava forçando o test a verificar versões antigas dos cinco arquivos.

### Added

- Nova entrada na tabela de versões em `CLAUDE.md`: `v2.8` documentando este bump.

### Test suite impact

- Antes: 55/3 (3 falhas: F1 cursor parity, F7 version sync, F2 langfuse vendoring)
- Depois: 58/1 (única falha remanescente é F2 langfuse vendoring, pre-existente desde v7.4.2 baseline, conhecida e aceita)

### Iron Law

Preservada 100%. ZERO mudanças em `agents/`, `skills/`, `references/`, `commands/`, `hooks/`, `lib/`. 23-row Mandatory Gates table e 35-row Registry untouched.

### Release coordination

- Marketplace.json bumpado pra `version: 7.6.1` + `source.ref: v7.6.1` neste mesmo commit
- NPM publish da v7.6.1 acontece na mesma janela
- GitHub Release v7.6.1 criado no mesmo commit
- Cache local em `C:\.claude\plugins\cache\FX-studio-AI\pipeline-orchestrator\7.6.1\` populado via marketplace reload nesta mesma sessão

### Note on parallel work

Nesta mesma sessão (2026-05-24), foi draftada uma spec independente para um novo projeto Paperclip-nativo chamado `pipeline-orchestrator-paperclip` (PIP). Esse projeto vive em pasta totalmente separada (`D:/Pipeline Orchestrator Claude/paperclip-native-spec/`), não compartilha código com este plugin, não modifica este plugin de forma alguma, e NÃO faz parte deste release nem deste produto. O plugin Claude Code original (este) permanece intocado e independente conforme regra de ouro estabelecida.

## [7.6.0] - 2026-05-22 — Paperclip Integration Layer + User Score Collection (MINOR)

**Two-feature release** combining the previously-shipped User Score Collection foundation with the new Paperclip integration layer.

### Added — Paperclip Integration Layer (NEW in 7.6.0)

References under `references/paperclip/` enable the plugin to run inside [Paperclip](https://paperclip.ing) (open-source agent orchestration platform) via the `claude_local` adapter with effective parity to Claude Code standalone. End-to-end validation: `PARITY_VERDICT=PASS_WITH_NOTES` (pilot report `references/paperclip/pilot-information-gate.md`).

- **`references/paperclip/PAPERCLIP-AXIOMS.md`** — contrato inquebravel + 4 axiomas (ambiguidade → canonico, adversarial → sempre, TDD/ATDD/BDD/DDD → mandatorios, closeout → auto) + hierarquia de fontes de decisao (workflow → projeto → engineering-principles → escalation) + canal de comunicacao (comments + status + Approver, NUNCA AskUserQuestion).
- **6 workflow specs prompt-native** (`PAPERCLIP-{BUGFIX,FEATURE,AUDIT,UX,SPEC,ADVERSARIAL}-WORKFLOW.md`) — cada um especifica ordem rigorosa de cargos, decisoes pre-aprovadas por gate, criterios binarios de aceitacao, anti-padroes proibidos.
- **`references/paperclip/skills/`** — 11 skills custom em formato Paperclip oficial (YAML frontmatter + corpo MD): `engineering-principles` (canonica universal — SOLID/KISS/DRY/YAGNI/SSOT/Clean Architecture) + 10 wrappers `pipeline-orchestrator-{contracts,iron-laws,classification,tdd,spec-protocol,adversarial,bugfix-method,vsa,ux-method,audit-method}`.
- **`references/paperclip/paperclip-kb.md`** — KB operacional Paperclip (modelo conceitual, heartbeat 9 steps, skills system, PARA memory, identity files AGENTS.md/HEARTBEAT.md/SOUL.md/TOOLS.md, adapter config `codex_local` + `claude_local` com todos os campos, API endpoints essenciais, CLI commands, scoped wake, permissoes).
- **`references/paperclip/paperclip-catalog.md`** — 46 agentes do plugin mapeados com 8 campos cada (name, category, description, when_to_use, tools, role_one_line, emits_protocol, paperclip_role_suggestion).
- **`references/paperclip/paperclip-adaptation-spec.md`** — traducao do Achado #7 protocol (GATE_REQUEST/DISPATCH_REQUEST/AskUserQuestion modal) para o modelo Paperclip+Codex (comments + status + Approver assincrono).
- **`references/paperclip/ZONING.md`** — regra de separacao entre 4 zonas (repo canonical D: / workspace local `.pipeline/` / Paperclip install `~/.paperclip/` / agent state files), source-of-truth, sync commands, anti-padroes, auditoria de drift.
- **`references/paperclip/PLAN-46-AGENTS-UPDATE.md`** — procedimento de migracao em 11 fases / 7 batches por categoria, loop adversarial integrado (trio paralelo zero-context apos cada batch), rollback plan via snapshot pre-flight, definicao de done com 8 criterios binarios.
- **`references/paperclip/pilot-information-gate.md`** — relatorio de validacao end-to-end PARITY_VERDICT=PASS_WITH_NOTES. information-gate rodando no Paperclip via claude_local + sonnet 4.6 (fallback de opus 4.7) leu agent.md original do plugin, confirmou GATE_REQUEST v1 schema (linhas 32-48), listou 22 SKILL.md detectadas, leu 4 references auxiliares (gates.md, complexity-matrix.md, audit-trail.md, gate-request-protocol.md), e emitiu YAML PARITY_VERDICT estruturado.
- **`references/paperclip/install-junctions.bat`** — script Windows que cria 11 junctions em `~/.paperclip/instances/default/skills/` apontando para o canonical em `references/paperclip/skills/` (zero arquivos fisicos em C: alem do necessario Paperclip).
- **`commands/setup-paperclip.md`** — novo slash command `/pipeline-orchestrator:setup-paperclip` que orquestra deteccao + install + configuracao end-to-end em 6 passos (pre-requisitos, install Paperclip via npx, junctions de skills, criar empresas + cargos via API, piloto de paridade, validacao cross-empresa).
- **`docs/PAPERCLIP-INTEGRATION.md`** — doc de visao geral (por que integrar, arquitetura, setup rapido, estrutura canonical, modos `claude_local` vs `codex_local`, gaps conhecidos, quando usar standalone vs Paperclip).

### Iron Law respected

ZERO mudancas em `agents/`, `skills/` existentes (a nova `setup-paperclip` em `commands/` eh additive), `references/` originais (paperclip/ eh subdir adicional sob references/), ou `lib/`. 23-row Mandatory Gates by Complexity table e 35-row Gate Registry untouched. Backward compat 100%.

### Known gaps (P1, non-blocking)

| Gap | Symptom | Workaround |
|---|---|---|
| Opus 4.7 1M not recognized by Paperclip adapter | Automatic fallback to sonnet 4.6 | Acceptable — agent.md frontmatter already specifies sonnet |
| `SessionStart:resume` hook fails in Paperclip subprocess (no conversation context) | 8s warning, doesn't block agent | Convert SessionStart prompt-type hooks to command-type, or ignore |
| `.claude/hooks/*.cjs` don't execute in Paperclip claude_local mode | Sentinel/dispatch-guard validation skipped | Paperclip orchestrates heartbeat lifecycle natively |

---

## [Unreleased] — 7.6.0 candidate — User Score Collection (MINOR)

Adds a 4-axis user-grade collection step at the end of every pipeline run, attached to the Langfuse trace via SDK `client.score()`. Foundation for the future LLM-as-judge phase: each run becomes a labeled dataset point where a human grade sits next to the trace it grades. **Opt-in:** silent no-op when `LANGFUSE_ENABLED` is not `"true"`/`"1"`, so disabled users see zero behavior change.

### Added

- **`lib/execution-summary.cjs`** — produces 4 plain-Portuguese summaries (plan / execution / review / result) by reading `gate-decisions.jsonl` + `sentinel-state.json` from the run's PIPELINE_DOC_PATH. Each summary is 1-2 sentences, no file paths, no jargon — they get embedded into AskUserQuestion prompts so the user grades informed by trace data rather than memory. Graceful neutral fallback on missing files.
- **`lib/score-writer.cjs`** — wraps `langfuse-client.cjs` + `langfuse-carrier.cjs` to emit per-axis Langfuse Scores (`user.plan`, `user.execution`, `user.review`, `user.result`) tied to the current trace. Validates 1-5 integer range, rejects unknown axes, accepts `null` per axis to mean "not applicable". Fire-and-forget: SDK failures logged via existing `langfuse-errors.jsonl` channel, never propagated. Silent no-op when Langfuse disabled, no creds, or no trace carrier present.
- **`agents/core/final-validator.md` Step 3.5** — new `USER SCORE COLLECTION` block inserted between the Pa de Cal decision and CLOSEOUT OPTIONS. Spec for the agent: invoke `summarize()`, ask 4 sequential `AskUserQuestion` calls (one per axis, summary embedded in the question body, 1-5 scale plus "não se aplica"), persist via `writeScores()`, surface a one-line confirmation. Skip block entirely when `LANGFUSE_ENABLED` is off. Failure-tolerant: never blocks the pipeline on score collection.
- **YAML output extension** (`final-validator.md`): new `user_scores` block on `PA_DE_CAL` with the 4 per-axis values, `written_to_langfuse` boolean, and `skip_reason` enum.
- **Regression tests** (`tests/regression/v7.6.0/`):
  - `F1-execution-summary.test.cjs` — 14 assertions across module load, neutral fallback, full happy path (gates + state present), audit-style run (no execution / no review axis), malformed JSONL tolerance.
  - `F2-score-writer.test.cjs` — 17 assertions across validation (range / type / unknown axis / float rejection), Langfuse-disabled skip, no-creds skip, no-carrier skip, mock-SDK happy path (correct names, traceId binding, comment forwarding, null axis skipped).

### Rationale

This is the **first foundation step** toward turning the plugin into a product. Two future phases depend on this corpus existing: (1) LLM-as-judge that scores runs automatically on the same 4 axes and calibrates against the user's grades, and (2) Langfuse Datasets + Experiments to prove that prompt changes do not regress on historical runs. Without a labeled grade per run, neither is possible. Cost to adopt: one minute of grading at the end of each pipeline; benefit: every run becomes training signal.

### Compatibility

- **Disabled users:** zero change. Step 3.5 detects `LANGFUSE_ENABLED` early and returns before any UI.
- **Enabled users:** four extra AskUserQuestion prompts at end of pipeline; abort-on-X already supported by the harness.
- **No breaking schema changes:** `PA_DE_CAL.user_scores` is additive; consumers that ignore the key continue to work.

### Adversarial review fixes (applied 2026-05-22)

Five findings from the v7.6.0 adversarial review have been resolved in-batch:

- **SEC-3 (file-size cap):** `lib/execution-summary.cjs` now `statSync`s before reading. Files exceeding `MAX_FILE_BYTES` (10 MB) return empty result instead of being loaded into memory. Defends against synchronous-readFileSync OOM on a runaway `gate-decisions.jsonl`.
- **SEC-4 (sanitizer bypass):** `lib/score-writer.cjs` now routes the `comment` field through `langfuse-sanitizer.cjs::sanitizeSpanPayload` before sending to `client.score()`. Aligns with the 3-layer protection (length cap + path redaction + secret redaction) every other Langfuse payload in the codebase uses.
- **QUAL-1 (dead export):** `_internals` namespace removed from `execution-summary.cjs`. It was exported "for unit tests" but no test consumed it.
- **QUAL-2 (magic number):** `500` literal in `score-writer.cjs` extracted to named constant `COMMENT_MAX_CHARS` with rationale comment.
- **QUAL-3 (unreachable branch):** `triggered` variable in `buildReviewSummary` removed. The "no blocking findings" message now fires whenever `blocked.length === 0`, which is the intent the dead branch obscured.
- **QUAL-4 (weak test):** F1-S5b/S5c assertions tightened. Previous `OR 'execucao'` clause masked regression to neutral fallback because the fallback string contained that substring.

Findings deferred (defense-in-depth for future productization, low risk in personal-use deployment): SEC-1 path-prefix validation, SEC-2 TOCTOU elimination via try/open, SEC-6 allowlist of JSONL field values, ARCH-1/2 shared JSONL reader with CRLF handling.

---

## [7.5.0] - 2026-05-22 — Concurrent-safe tracing (MINOR)

**Closes 5 findings from the `tracing-concurrent-execution-id` spec** (A, B-trace, B-span, C, E). Two pipeline runs that share the same working directory now coexist without cross-writing each other's trace data, and the Langfuse observation scope is governed by an explicit env-var contract instead of a silent code-level filter. Spec: `.kiro/specs/tracing-concurrent-execution-id/` (requirements + design + tasks T1-T7). All five findings ship behind backward-compat fallbacks; users who never set `PIPELINE_RUN_ID` or `PIPELINE_TRACING_SCOPE` see v7.4.0 behavior bit-for-bit.

### Added

- **Collision-resistant run identifier (Finding A — `lib/run-directory.cjs`):** `RunDirectory.allocate` now stamps every run with a `${ordinal}-${uniqueId}-${slug}` id (`uniqueId` = `Date.now().toString(36)` + `crypto.randomBytes(6).toString('hex')`) and publishes it on `process.env.PIPELINE_RUN_ID` before returning. The primary `mkdirSync` switched from `{recursive: true}` to `{recursive: false}` and now retries up to six times with a fresh `uniqueId` on `EEXIST`, mirroring the `openSync('wx')` retry loop in `lib/run-log.cjs`. AUDIT event `RUN_DIR_COLLISION_RETRY` emitted on each retry. New `generateUniqueId()` export.
- **Run-keyed Langfuse carriers (Findings B-trace + B-span — `lib/langfuse-carrier.cjs`):** signatures `getTracePath(runId, ppidFallback)` and `getSpanPath(runId, ppidFallback)` replace the old single-arg PPID form. When `runId` is present, the carrier file lives at `/tmp/langfuse-{trace,span}-<runId>.json`; when absent, it falls back to PPID with a one-shot AUDIT `CARRIER_PPID_FALLBACK` so the degradation is observable. Wrapper helpers (`readTraceCarrier`, `writeTraceCarrier`, `cleanupTracePath`, `cleanupSpanPath`) updated to the same two-arg signature. `readTraceCarrierForCurrentProcess()` tries `PIPELINE_RUN_ID` first, then `process.pid` / `process.ppid` for legacy / cross-session callers. `.claude/hooks/langfuse-hook.cjs` updated end-to-end to pass `(process.env.PIPELINE_RUN_ID || null, resolvePpid())` at every call site; `.codex/hooks/langfuse-hook.cjs` mirror kept byte-identical per Iron Law.
- **State discovery by runId (Finding C — `.claude/hooks/sentinel-hook.cjs` + `.claude/hooks/stop-hook.cjs`):** `discoverStatePath` and `findActiveRunFolder` now (1) honor the explicit `PIPELINE_DOC_PATH` override (sentinel only), (2) match by `PIPELINE_RUN_ID` against the `run_id` field of every candidate `sentinel-state.json`, (3) fall back to mtime-newest with AUDIT events `DISCOVERY_RUN_ID_NO_MATCH` and `DISCOVERY_MTIME_FALLBACK`. `lib/codex-operational-runtime.cjs` writers now stamp the `run_id` field into both the init and finalize state files. Sentinel-hook also gains `module.exports` + `require.main === module` guard so the discovery internals are unit-testable.
- **Tracing scope policy (Finding E — `.claude/hooks/langfuse-hook.cjs`):** new `PIPELINE_TRACING_SCOPE` env-var accepts `agent-only` (default, v7.4.0 parity), `agent-plus-skill`, or `full`. Pure function `shouldTrace(toolName, scope)` exported for unit-level testing. Unknown values fall through to the `agent-only` safe-default and emit AUDIT `TRACING_SCOPE_UNKNOWN`; opt-in scopes emit a one-shot `TRACING_SCOPE_EXPANDED` breadcrumb so operators can confirm the env-var was honored. The silent `if (toolName !== 'Agent') return;` filter at the hook entry-point is replaced by `if (!shouldTrace(toolName, scope)) return;`.
- **References documentation:** `references/audit-trail.md` gains a "Concurrency Invariants" section (I-1 .. I-4), a "Tracing Scope Policy" section, and an AUDIT events catalog (6 new events). `references/sentinel-integration.md` gains a "State Discovery Contract" section formalizing the `PIPELINE_DOC_PATH > PIPELINE_RUN_ID > mtime` precedence and the requirement that all writers stamp `run_id` on `sentinel-state.json`.
- **Regression tests** (`tests/regression/v7.5.0/`):
  - `F1-run-directory-allocate-race.test.cjs` — 4 concurrent children + serial baseline + static exclusive-mkdir check (11 assertions).
  - `F2-trace-carrier-runid.test.cjs` — runId precedence + PPID fallback + AUDIT payload schema (9 assertions).
  - `F3-span-carrier-runid.test.cjs` — span-side mirror of F2 (6 assertions).
  - `F4-discovery-by-runid.test.cjs` — sentinel + stop hooks, runId-match wins over mtime, AUDIT on fallback (8 assertions).
  - `F5-tracing-scope-policy.test.cjs` — 5 sub-scenarios across the scope matrix + AUDIT on unknown value (10 assertions).

### Changed

- **runId format (BREAKING for internal consumers, `external_consumers: none` per spec.json):** moved from `${ordinal}-${slug}` to `${ordinal}-${uniqueId}-${slug}`. `tests/unit/run-directory.test.js` updated to assert against the new format; `tests/unit/domain-integration.test.js` regex updated to allow `uniqueId` in the middle position. `resolveSlugCollision` removed from `RunDirectory.allocate` (no longer needed — `uniqueId` guarantees uniqueness).
- `lib/codex-operational-runtime.cjs` `initialize*` and `finalizeArtifacts` writers add `run_id` (from `process.env.PIPELINE_RUN_ID`) to every `sentinel-state.json` they produce.
- `.claude/hooks/sentinel-hook.cjs` exports `{ discoverStatePath, readStateRunId, listSentinelStates }` and only auto-runs the stdin handler under `require.main === module`.

### Backward compatibility

- Default `PIPELINE_TRACING_SCOPE` (unset OR `agent-only`) produces zero behavior change vs v7.4.0.
- Carrier API: single-arg PPID callers still work — `getTracePath(ppid)` treats the value as `runId` and produces a working path, with no AUDIT emission. Callers that pass `(null, ppid)` get the fallback path + dedupe-once AUDIT breadcrumb.
- State discovery: when `PIPELINE_RUN_ID` is absent (legacy / cross-session / cleanup-orphan), both hooks fall back to the v7.4.0 mtime-newest selection, emitting `DISCOVERY_MTIME_FALLBACK` so the path is auditable.
- AUDIT events deduped per process per (event, key) so repeated lookups in a single hook session emit at most one breadcrumb each — no stderr flooding.

### Test posture

- Pre-modification baseline: 38 passed / 8 failed / 46 total (5 pre-existing failures + 3 v7.5.0 placeholder fails because the test files existed without their lib counterparts).
- Post-modification: **43 passed / 5 failed / 48 total.** The 5 remaining failures are 100% pre-existing (`v6.1.0/B4_cross_cutting_docs.cjs` B4-S9, `v7.1.0/F7_version_sync.cjs` 3 assertions chained to the still-stale 7.4.0 expectation, `v7.3.0/F10-langfuse-sanitizer.test.cjs` 1 assertion, `v7.3.0/F9-langfuse-span-lifecycle.test.cjs` 4 assertions tied to absent `CLAUDE_PLUGIN_ROOT` in the test harness, `v7.4.0/F1_skill_governance.cjs` S4 cursor parity). Zero regression introduced.
- Pre-existing Windows-only CRLF snapshot mismatch in `tests/snapshot/run-dir-tree.test.js` remains untouched (outside spec scope).

### Spec & roadmap

- Source: `.kiro/specs/tracing-concurrent-execution-id/` — requirements (EARS), design (R-1 Pattern-aligned), tasks (T1-T7) all present in the working tree (per CLAUDE.md the `.kiro/` directory stays untracked).
- Diff budget honored: 6 files modified (run-directory.cjs, langfuse-carrier.cjs, langfuse-hook.cjs × 2 mirrors, sentinel-hook.cjs, stop-hook.cjs × 2 mirrors, codex-operational-runtime.cjs) + 5 new test files + 2 reference doc appends + version-sync.
- Adversarial gate `adversarial_gate_mandatory: true` (audit-trail + observability domain) — per-task self-review confirmed each task before advancing.

---

## [7.4.2] - 2026-05-22 — Langfuse SDK vendored (PATCH, bugfix)

**Patch release — fixes the production-blocking `Cannot find module 'langfuse'` thrown by every marketplace-cache install of v7.4.0/v7.4.1.** The previous releases declared `langfuse` as a regular dependency but never shipped the SDK inside the marketplace tarball; cache clones from the GitHub source were left without `node_modules/langfuse/`, so the very first `require('langfuse')` from the Stop hook crashed and the Langfuse dashboard stayed empty.

### Fixed

- **Vendored Langfuse SDK into the git tree.** The three runtime packages — `langfuse@3.38.4`, `langfuse-core@3.38.20`, and `mustache@4.2.0` — are now committed under `node_modules/` and shipped with the package. `.gitignore` and `.npmignore` carry matching four-line negation blocks (`node_modules/*` + three `!node_modules/<pkg>/` lines) so the vendor subtrees are tracked while the rest of `node_modules/` stays ignored. `package.json` declares `bundledDependencies: ["langfuse", "langfuse-core", "mustache"]` and lists the three vendor paths in `files[]`, guaranteeing they land in the npm tarball and the marketplace cache.
- **`marketplace.json` version sync.** Bumped from `7.4.0` to `7.4.2` and `source.ref` retargeted to `v7.4.2`, closing the pre-existing drift between marketplace (`7.4.0`) and `plugin.json`/`package.json` (`7.4.1`) caught during the v7.4.2 audit.

### Added

- **SessionStart observability warning.** `.claude/hooks/cleanup-orphan-sentinel-state-hook.cjs` gains a new `checkLangfuseSdkThrows(pluginRoot)` helper that scans `.pipeline/langfuse-errors.jsonl` for `error_type === "sdk_throw"` entries newer than 24 hours; when at least one is found, the hook emits a single visible stderr message naming the log path and creates a per-day marker (`.pipeline/langfuse-sdk-warned-<YYYY-MM-DD>.marker`) to suppress repeated warnings for the rest of the UTC day. Soft-fail by design: any I/O error in the helper is swallowed and the SessionStart archive logic is never blocked.
- **Regression tests `tests/regression/v7.4.2/`** — `F1-langfuse-bundle-present.test.cjs` asserts the three vendored `package.json` files declare the exact pinned versions, that the langfuse entry point exists, that `package.json[dependencies][langfuse]` matches `node_modules/langfuse/package.json.version`, and that `bundledDependencies` lists exactly the three packages; `F2-require-resolves-without-global.test.cjs` spawns a child Node process from `os.tmpdir()` with `NODE_PATH` and `NPM_CONFIG_PREFIX` removed to prove that `require('langfuse')` resolves the vendored copy (version 3.38.4) without any global fallback.

### Documented risk

- **Vendored deps are NOT scanned by Dependabot.** Once these three packages live in `node_modules/` and are committed, GitHub's default dependency graph and Dependabot alerts stop covering them — they look like first-party source files. A future CVE on langfuse/langfuse-core/mustache requires a **manual bump-and-republish workflow**: update the vendored copies, re-pin in `package.json`, re-run `tests/regression/v7.4.2/F1`, retag, repackage, republish. Maintainers should add a quarterly reminder to diff `npm view langfuse version` against `node_modules/langfuse/package.json` until a CI gate (Dependabot vendor scan or scheduled action) is wired.

### Backward compatibility

All changes additive. No agent, skill, reference, command, or hook logic changes beyond the additive `checkLangfuseSdkThrows` helper. The 22-row Mandatory Gates by Complexity table and the 27-row Gate Registry are untouched. Existing installs auto-pick up the vendored SDK on the next `/plugin update`; manual installs from source continue to work without `npm install` since the vendor lives inside the cache.

---

## [7.4.1] - 2026-05-22 — Langfuse flush fix (PATCH, bugfix only)

**Patch release — critical bugfix on the v7.3.0/v7.4.0 Langfuse hook.** Without this fix, traces queued by the hook were never delivered to Langfuse Cloud because the Node process exited before the SDK's background flush worker could send the buffered events.

### Fixed

- **`.claude/hooks/langfuse-hook.cjs` + `.codex/hooks/langfuse-hook.cjs` (mirrored)** — `main()` is now `async` and the `finally` block awaits a bounded `shutdownAsync()` (or `flushAsync()` fallback) with a 2-second timeout. Previously the hook called `client.trace().span()` (synchronous enqueue) and then `process.exit(0)` immediately, killing the buffered events before the SDK's HTTP worker fired. **Result: every queued event was lost.** Now the buffered events are flushed before exit; `flush_timeout` diagnostics fire to `.pipeline/langfuse-errors.jsonl` on timeout but never block the hook chain.
- **Iron Law preserved** — `.codex/hooks/langfuse-hook.cjs` re-mirrored byte-identical to `.claude/hooks/langfuse-hook.cjs`.

### Why this was missed in v7.3.0/v7.4.0

The v7.3.0 spec documented `flush_timeout` as a known error type but the hook never actually called any flush method. The contract documented behavior; the implementation skipped it. The smoke tests in v7.3.0 exercised the carrier-file lifecycle and `process.exit(0)` exit code, but never asserted that events landed on the server — the test stopped at the SDK queue boundary. Fixed retroactively under v7.4.1 + a manual end-to-end smoke test against `https://us.cloud.langfuse.com`.

### Verified

- Manual hook invocation (Pre+Post in same parent shell) → `flush_timeout` not raised, traces visible in dashboard within seconds.
- Disabled fast-path (no credentials) still exits in <100ms (NFR-4 preserved — no SDK init when env vars absent).
- 45/45 regression suites remain GREEN.

### Backward compatibility

All changes additive. Pipelines that never set `LANGFUSE_PUBLIC_KEY` continue the disabled fast-path (no SDK init, no flush attempt, exits in <100ms). For installs that already had v7.4.0 with credentials configured, this is a hot-fix — bump the install via `/plugin update pipeline-orchestrator@FX-studio-AI` and any subsequent pipeline run will start landing on Langfuse.

---

## [7.4.0] - 2026-05-21 — Langfuse observability + skills-patterns adoption (MINOR)

**Minor release — additive doc/metadata + observability opt-in. No behavioral changes to gates, agents, or hooks. Backward compatibility preserved.** Bundles two independently-merged work streams under a single bump because v7.3.0 (Langfuse observability) was committed (`8a18dd1`) but never bumped in `plugin.json` / `package.json` / `marketplace.json` — this release closes that lockstep gap and ships the skills-patterns adoption together.

### What changed

- **Langfuse Cloud observability — opt-in (rolled forward from commit `8a18dd1`, originally targeted for v7.3.0).** New `langfuse@3.38.4` runtime dependency in `package.json` enables tracing of pipeline runs to Langfuse Cloud when `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` env vars are present. Telemetry is fully opt-in: absent credentials short-circuit the SDK call (no-op), preserving the offline-first guarantee. No gate, agent, hook, or test surface changes — pure observability layer addition.
- **Skills-patterns adoption from `langfuse/skills` repo — `references/skill-governance.md` SSOT.** New 400-line governance document codifying the patterns observed in langfuse/skills (versioning protocol, lockstep across Claude+Cursor manifests, progressive disclosure principle, external-pattern tracking, audit history). Crossreferenced from `CLAUDE.md` (new "Skill governance" section between "Ponteiros futuros" and "Versão deste arquivo" table).
- **`.cursor-plugin/plugin.json` parity mirror.** First-class Cursor IDE manifest mirroring the Claude `.claude-plugin/plugin.json` schema (name, version, description, author, license, keywords). Locked-step versioning: bumping one MUST bump the other (enforced by `tests/regression/v7.1.0/F1` updated to 5/5 cross-manifest invariant).
- **F1 + F7 regression tests updated.** `F1` invariants extend to validate the Cursor manifest's existence + schema parity. `F7_version_sync.cjs` rolled from 7.2.0 → 7.4.0 expectation. Suite stays at 41/41 GREEN with the two pre-tester updates (Batch 1).

### Files changed

- `references/skill-governance.md` — NEW (Batch 1, ~400 lines, governance SSOT).
- `.cursor-plugin/plugin.json` — NEW (Batch 1, parity mirror).
- `CLAUDE.md` — new "Skill governance" section + "Atualmente" bumped to 7.4.0 + v2.5 row in version table (Batch 2, append-only).
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `package.json` — version bumped 7.2.0 → 7.4.0; marketplace.json `source.ref` bumped to `v7.4.0` (Batch 2).
- `CHANGELOG.md` — this section (Batch 2).
- `tests/regression/v7.1.0/F1_*`, `tests/regression/v7.1.0/F7_version_sync.cjs` — updated by pre-tester to expect 7.4.0 and Cursor manifest parity (Phase 2 step 2b, not in either Batch 1 or Batch 2).

### Backward compatibility

All changes additive. Pipelines that never set `LANGFUSE_PUBLIC_KEY` continue exactly as before (no SDK calls fire). The Cursor manifest is a parallel surface — Claude consumers ignore it entirely. The skill-governance reference is pure documentation; no agent or hook reads it at runtime.

### Why MINOR and not two separate releases

The Langfuse layer was committed as `feat: v7.3.0 — Langfuse Cloud observability` (`8a18dd1`) but the version-surface lockstep bump never happened — the commit was effectively a no-op for marketplace/NPM consumers. Rolling it forward under v7.4.0 (together with the skills-patterns adoption) closes the version drift without inventing a phantom v7.3.0 NPM publish. Both streams are additive and independently safe; the grouping is purely release-hygiene.

## [7.2.0] - 2026-05-21 — Phase 0 hardening (MINOR)

**Minor release — runtime hardening, no breaking changes, backward compatibility preserved.** Four patches landed across four separate commits in the `phase0-hardening` branch, each scaffolded with ATDD/BDD/DDD per scenario, TDD red→green per file, and adversarial review per batch (22 findings total: 3 CRITICAL fixed, 12 HIGH fixed, 5 MEDIUM fixed).

### What changed

- **STATE_FILE_INIT_FAIL gate (CIRCUIT_BREAKER) — Patch 2.** Hard precondition on the controller's initial `{PIPELINE_DOC_PATH}/sentinel-state.json` write. Healthy init emits a PASS entry to `gate-decisions.jsonl` (preserving fidelity score). Write failure or post-write verify failure (signature mismatch / empty / truncated) emits BLOCKED and aborts the pipeline BEFORE any Agent spawn — no subagent fires without the state file, so the sentinel cannot be tricked into a PASS verdict over missing state. Mandatory across SIMPLES/MEDIA/COMPLEXA (every pipeline run creates a state file regardless of complexity). DDD: IO raises in `lib/sentinel-state-signer.cjs`; the controller translates raises into gates — the signer stays IO-only.
- **PROTOCOL_HANDSHAKE_TIMEOUT gate (HARD) — Patch 3.** Two-layer timeout detection for stale GATE_REQUEST / DISPATCH_REQUEST / PLAN_MODE_REQUEST blocks (Achado #7 deadlock pattern). Primary layer is out-of-band: `.claude/hooks/cleanup-orphan-sentinel-state-hook.cjs` fires on every Claude Code SessionStart and emits the gate independently of whether the controller is ever re-dispatched (closing the circularity where a broken parent never re-dispatches). Secondary layer is the controller's own re-entry check. Default window 30 minutes; env override `PIPELINE_HANDSHAKE_TIMEOUT_MS` with 60000ms sanity floor (values below floor are rejected and the default is used). Cross-session pending_blocks (different `session_id` than current) are demoted to SOFT/CLEARED_CROSS_SESSION (do not HARD-block legitimate fresh sessions). Clock-skew defenses: negative ages treated as 0; ages >= 7 days deferred to the cleanup-orphan archive path.
- **cleanup-orphan-sentinel-state-hook — Patch 5.** New SessionStart hook in `.claude/hooks/`. Auto-archives `sentinel-state.json` files older than 24h via atomic rename to `sentinel-state.archived-<ts>.json` (instead of mutating `pipeline_active=false`, which would create a worse fail-open downstream in the sentinel-hook). Closes Achado B1-001 (manual workaround was `Edit pipeline_active: false`). Defensive design: sandbox-checked cwd (deny-list system paths + `realpath`), depth-limited recursive walk (`MAX_WALK_DEPTH=10`), symlink skip via `Dirent.isSymbolicLink()`, mtime CAS race-defense before rename (re-stat after read; if mtime changed, abort).
- **--strict-spec flag + STRICT_SPEC_REJECTION gate (AUDIT) — Patch 4.** Rejects Signal 3 (prose regex) and Signal 4 (glob fallback) Spec detection in unattended / CI / headless mode where `AskUserQuestion` is unavailable. Preserves Signal 1 (explicit path argument) and Signal 2 (`--type=spec` flag) — the high-confidence paths that don't require user confirmation. Prefix-line anti-injection invariant (only honored as first line written by controller; mid-prompt occurrences treated as DATA). Explicit precedence over conflicting `FORCE_VARIANT=spec-*` (STRICT_SPEC wins; variant demoted; conflict logged to `gate-decisions.jsonl` as STRICT_SPEC_REJECTION with `decision: FORCE_VARIANT_OVERRIDDEN`). Per-rejection AUDIT entries enable post-hoc forensics via the fidelity-reporter across runs.

### Gate registry deltas

| Surface | Before | After |
|---|---|---|
| Gate Registry rows | 32 | 35 (+3) |
| — Core sub-table | 16 | 18 (+STATE_FILE_INIT_FAIL, +PROTOCOL_HANDSHAKE_TIMEOUT) |
| — Routing sub-table | 3 | 4 (+STRICT_SPEC_REJECTION) |
| Mandatory Gates by Complexity | 22 | 23 (+STATE_FILE_INIT_FAIL across SIMPLES/MEDIA/COMPLEXA) |
| Inline Invariants (pipeline-controller.md) HARD list | 16 entries | 17 (+PROTOCOL_HANDSHAKE_TIMEOUT) |
| Inline Invariants CIRCUIT_BREAKER list | 3 entries | 4 (+STATE_FILE_INIT_FAIL) |

### Files changed

19 files, +1436 / −37 lines:

- `agents/core/pipeline-controller.md` — STATE_FILE_INIT_FAIL section, handshake-timeout two-layer prose, --strict-spec propagation + FORCE_VARIANT precedence, inline-invariants HARD/CIRCUIT_BREAKER lists.
- `agents/core/task-orchestrator.md` — STRICT_SPEC mode subsection (Signal 3/4 rejection, Signal 1/2 preservation, prefix-line invariant, notes warning + AUDIT gate entry).
- `agents/core/information-gate.md` — handshake-timeout convention pointer.
- `agents/core/sentinel.md` — mechanical-hook-vs-agent-mode clarification.
- `references/gates.md` — three new gate rows; Mandatory Gates table row count 22→23.
- `references/gate-request-protocol.md` — Handshake timeout section (two-layer detection, sanity floor, recovery prose).
- `lib/fidelity-reporter.cjs` — STATE_FILE_INIT_FAIL in MANDATORY_GATES_BY_COMPLEXITY for all three buckets.
- `.claude/hooks/cleanup-orphan-sentinel-state-hook.cjs` — NEW, ~400 lines. Includes `cleanupOrphan`, `checkHandshakeTimeouts`, `findStateFiles`, `isCwdSandboxOk`, `resolveHandshakeWindowMs`, `handleSessionStart`.
- `.claude/hooks/__tests__/cleanup-orphan-sentinel-state-hook.test.cjs` — NEW, 27 tests (18 cleanup + 9 handshake-timeout behavioral).
- `hooks/hooks.json` — cleanup-orphan-sentinel-state-hook wired into SessionStart.
- `tests/integration/state-file-init-precondition.test.js` — NEW, 9 tests.
- `tests/integration/protocol-handshake-timeout.test.js` — NEW, 7 prose-contract tests.
- `tests/integration/strict-spec-flag.test.js` — NEW, 14 prose-contract tests including 6 adversarial follow-ups.
- `tests/regression/v6.1.0/D7`, `v6.1.0/F1`, `v6.2.0/gates_registry_count_invariant`, `v6.3.0/F14`, `v7.2.0/F1`, `v7.2.0/F2` — row-count baselines bumped to 23 / 35.
- `tests/regression/v7.1.0/F7_version_sync.cjs` — updated for v7.2.0 release.
- `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — version bump + description.

### Test suite

- Before: 41 PASS / 4 FAIL (pre-existing F7 version-sync mismatch on 7.1.1).
- After: **45 PASS / 1 FAIL** (only F7 remains, now updated to assert 7.2.0 — passes after this release).

### Backward compatibility

All changes additive. Pipelines that never trigger STATE_FILE_INIT_FAIL or PROTOCOL_HANDSHAKE_TIMEOUT (the happy path) emit PASS entries and continue exactly as before. Loose-mode Spec detection (Signal 3/4 with AskUserQuestion) remains the default — `--strict-spec` is opt-in. Existing `sentinel-state.json` files without `session_id` or `pending_blocks` fields are handled defensively (missing fields treated as no-pending / cross-session-safe).

### Adversarial review summary

Findings addressed per batch (full review reports in commit messages):

- Batch 1 (STATE_FILE_INIT_FAIL): CRITICAL #1 partial-write → post-write verify; HIGH #3 fidelity haircut → PASS entry on happy path; HIGH #4 fallback visibility → documented; MEDIUM #5 cardinality test → row-identity assertion added; LOW #7 DDD → test asserts signer has no gate-emission code.
- Batch 2 (cleanup-orphan): HIGH ADV-1 race → mtime CAS; HIGH ADV-2 silent fail-open → rename instead of mutate; MEDIUM ADV-3 path traversal → sandbox check; MEDIUM ADV-4 DoS → depth limit + symlink skip; LOW ADV-6 LIVE not logged → always-emit summary.
- Batch 3 (PROTOCOL_HANDSHAKE_TIMEOUT): CRITICAL ADV-B3-01 circularity → out-of-band hook; HIGH ADV-B3-02 batch-2 archive suppression → ordering + MAX_AGE defer; HIGH ADV-B3-03 env-var no floor → 60000ms floor; HIGH ADV-B3-04 cross-session block → session_id matching; HIGH ADV-B3-05 prose-only tests → 9 behavioral tests; MEDIUM ADV-B3-06 clock skew → negative-age guard; MEDIUM ADV-B3-07 write-timing → contract documented.
- Batch 4 (--strict-spec): HIGH ADV-B4-01 FORCE_VARIANT collision → precedence rule; HIGH ADV-B4-02 silent misroute → guidance in notes warning; HIGH ADV-B4-03 prompt injection → prefix-line invariant; HIGH ADV-B4-04 prose-only → accepted as inherent limit; MEDIUM ADV-B4-05 audit gap → STRICT_SPEC_REJECTION AUDIT gate.

### Patch 1 (silent-success post-spawn verification)

REJECTED by user (telemetry source — OBZ MEDIUM 2026-03-24 — is 2 months old; valid concern that the bug pattern may no longer occur). Tracked as follow-up to revisit with fresh telemetry.

---

## [7.1.1] - 2026-05-21 — Pipeline overview diagram enrichment (PATCH, docs only)

**Patch release — documentation only.** Enriches `docs/diagrams/pipeline-overview.html` with end-to-end workflow visibility plus a Thariq-style interactive layer, so a reader can both see how each pipeline variant flows and capture their own decision inside the artifact (no chat round-trip required).

### Added

**New section "Fluxos detalhados ponta a ponta"** covering seven workflows end-to-end, each with plain-language Portuguese narrative + inline SVG step diagram + concrete example card + approval-points card:

- Bug fix (light 8 steps / heavy 11 steps)
- Audit (light / heavy — same 9-step shape, heavy adds dedicated domain analyst in steps 2-4)
- UX simulation (light 9 steps / heavy 15 steps)
- Plan mode (Phase 1.5 deep-dive)
- Brainstorm (10-step pre-pipeline preparation)
- Hotfix (6-step emergency, reduces scope not safety)
- Review-only (3 parallel critical reviewers, report-only)

Twelve inline SVG step diagrams (one per variant) with color-coded boxes: dark gray = main agent inline, cyan = delegated subagent, amber border = approval gate, red = critical go/no-go gate.

**Thariq-style interactive layer (satisfies html-artifacts SKILL Invariant 3):**

- Sticky top toolbar with 7 clickable TOC pills (jump to each flow anchor) — turns the long page into a navigable workspace.
- 3 filter pills (Todos / Apenas leves / Apenas pesados) — dim/hide variants you don't want to see now.
- Per-flow "Revisado" checkbox (16px, green accent) with `localStorage` persistence keyed by flow id.
- Per-flow "Copiar resumo" button copies a structured block to clipboard (title + variants + deep-link); shows "Copiado ✓" feedback for 1.2s.
- "Marcar todos revisados" and "Limpar estado" action buttons (latter with confirm dialog).
- Live counter badge `Revisados: N/7` updates as you toggle.
- TOC pills show ✓ prefix and turn green when flow is marked reviewed (visual scroll-spy of progress).
- `<details>/<summary>` collapsibles around each flow's exemplo+aprovação cards (open by default, click to fold).
- Final response form with 11 radio options (10 flow variants + "Outro / ainda decidindo"), a free-text notes textarea, and three actions: Salvar resposta (persists to localStorage), Copiar minha resposta (builds structured markdown block: choice + notes + origin + date), Limpar (resets both choice and notes).
- "Resposta salva" banner shows back the saved choice + truncated notes after save, with restore on reopen.

### Changed

- `docs/diagrams/pipeline-overview.html`: 380 → 1498 lines (+1118 lines net). Existing four-phase overview + complexity routing + execution modes sections preserved unchanged; new content added between "Execution modes" and "Related diagrams".

### Invariants preserved

- **22-row Mandatory Gates by Complexity** in `commands/pipeline.md` — untouched.
- **27-row Gate Registry** in `references/gates.md` — untouched.
- **Roster of 20 agents** in `references/team-registry.md` — untouched.
- **All runtime code paths** in `agents/`, `skills/`, `hooks/`, `lib/`, `commands/`, `references/`, `tests/` — zero changes.

### Not changed

- No agent definitions, no skill definitions, no hook code, no library code, no command files, no reference SSOTs, no test files. This release ships nothing executable that wasn't already in v7.1.0.

### Upgrade path

Drop-in replacement for v7.1.0. No migration, no behavior change, no test impact. Marketplace consumers receive the updated documentation when they next refresh the cache against the new `v7.1.1` ref.

---

## [7.1.0] - 2026-05-19 — Telemetry hygiene (MINOR)

**Minor release.** Repairs four telemetry-layer defects surfaced by a self-hosted diagnosis of `.pipeline/docs/` across 20 historical runs. New SSOT writer for `gate-decisions.jsonl`, canonical 8-value decision vocabulary with runtime rejection, auto-correlation envelope, widened `fidelity-reporter` enums with warning surfacing, and a Stop event hook so `run-log.jsonl` no longer loses 19 of 20 runs.

### Why this matters

Pre-v7.1.0 telemetry had four corrosive defects: (1) chaotic `decision` vocabulary (40+ distinct success values like `PASS`, `COMPLETE`, `GO`, `FIXED`, `RESOLVED` — cross-run aggregation impossible); (2) `fidelity-reporter.cjs` silently masked ~55% of real-world events as `(invalid)` with no operator signal; (3) every gate-decision event was missing the correlation envelope (`run_id`, `plugin_version`, `schema_version`, `type`, `complexity`) so analytics required folder-path joins; (4) `run-log.jsonl` aggregate had 1 line for 20 completed runs because no hook fired `appendRunLog` on session end. v7.1.0 fixes all four with defense-in-depth (runtime throw + diff-discipline-reviewer static check) so the drift cannot return silently.

### What's new

- **`lib/gate-decision-writer.cjs` (NEW)** — Hard SSOT writer for every `gate-decisions.jsonl` event.
  - Canonical 8-value decision vocabulary: `BLOCKED`, `DISPATCHED`, `SKIPPED`, `APPROVED`, `CONFIRMED`, `REJECTED`, `TRIGGERED`, `NOT_TRIGGERED` (3 buckets: runtime-emitted, user-gate-resolved, pipeline-outcome).
  - 5 canonical hardness classes: `MANDATORY`, `HARD`, `CIRCUIT_BREAKER`, `SOFT`, `AUDIT`.
  - Throws `TypeError` on unknown decision/hardness values at write time (defense-in-depth).
  - Auto-injects `run_id` (from `PIPELINE_DOC_PATH` basename), `plugin_version` (cached from `plugin.json` at module load), `schema_version` (`'1'`), `type`, `complexity` into every event.
  - Exports: `appendGateDecision`, `buildCtx`, `CANONICAL_DECISIONS`, `CANONICAL_HARDNESS`, `SCHEMA_VERSION`, `PLUGIN_VERSION`.
- **`.claude/hooks/stop-hook.cjs` (NEW)** — Stop event hook with full SOFT-fail wrapper.
  - Discovers the most recently updated pipeline run folder beneath `.pipeline/docs/`.
  - Reads `sentinel-state.json` + `session.json` to assemble the 12 `REQUIRED_FIELDS` for `appendRunLog`.
  - Calls `lib/run-log.cjs::appendRunLog` so every session end (including crashes/aborts) writes one summary line.
  - Never exits non-zero; all errors swallowed to stderr.
- **`.claude/settings.json` (NEW)** — Registers `stop-hook.cjs` as a `Stop` event hook.
- **`lib/fidelity-reporter.cjs` (modified)**
  - `VALID_HARDNESS` adds `AUDIT` (was missing since v6.2.0 when the hardness class was introduced).
  - `VALID_DECISION` widens from 6 to all 8 canonical values.
  - `validateHardness(v, warnings, gate)` and `validateDecision(v, warnings, gate)` now push to a caller-supplied warnings array when an unknown value is encountered (was silently nullified — invisible to operators).
- **`lib/codex-operational-runtime.cjs` (modified)** — 8 direct `appendJsonl(gate-decisions.jsonl)` call sites converted to use the new SSOT writer via a local `logGateDecision` wrapper. A `normalizeResponseToDecision` helper maps free-text user responses (`approve`, `reject`, `confirm`, `skip`, `dispatch`, `trigger`, `yes`, `no`) to canonical values; unknown responses collapse to `BLOCKED` (safe halt). `initializeArtifacts` accepts `type` + `complexity` and persists them on `session.options` so the correlation envelope is available at every write site.
- **`lib/jsonl-sanitizer.cjs` (modified)** — `ALLOWED_GATE_DECISION_KEYS` extended with the 5 correlation fields (`run_id`, `plugin_version`, `schema_version`, `type`, `complexity`) so the writer can persist the envelope.
- **`agents/quality/diff-discipline-reviewer.md` (modified)** — New Step 4b SSOT-Bypass Check static rule flagging any direct `fs.appendFile`/`fs.appendFileSync`/`fs.writeFile`/local `appendJsonl` write into `gate-decisions.jsonl` outside `lib/gate-decision-writer.cjs`. Also flags hard-coded legacy decision strings (`PASS`/`COMPLETE`/`GO`/`AUTO_APPROVED`/`FIXED`/`RESOLVED`) as `legacy_decision_string`.
- **Agent prose updates (4 files)** — `agents/core/finishing-branch.md`, `agents/core/pipeline-controller.md`, `agents/executor/spec-closer.md`, `agents/brainstorm/step-01b-alternatives.md` now reference the canonical vocabulary and `gate-decision-writer.cjs`.
- **7 regression tests in `tests/regression/v7.1.0/` (F1-F7)** — Canonical writer (F1), writer migration (F2), agent prose vocab probe (F3), fidelity-reporter widening + warnings (F4), Stop hook structure (F5), settings.json registration (F6), version sync across 4 manifests (F7).

### What does NOT change

- The 22-row Mandatory Gates by Complexity table in `references/gates.md` is untouched (Inline Invariant preserved).
- The 27-row Gate Registry is untouched.
- `lib/run-log.cjs` itself unchanged — its `appendRunLog` contract is stable; the Stop hook is a new consumer.
- All v6.3.0 Implementation Discipline Layer mechanics (CHANGE_CONTRACT, SCOPE LOCK CHECK, diff-discipline-reviewer) intact.
- Historical events in 20 archived run folders untouched — they remain tolerated as `(invalid)` in fidelity reports (no retroactive migration).

### Deferred to v7.2.0

- Finding #3: gate rename for clarity (`CHECKPOINT_FAIL` is misused for success events; `PLAN_REJECTED` is logged with `decision: NOT_TRIGGERED` when plan was approved). Requires Inline Invariant negotiation.
- Finding #5: timestamp format normalization (2 historical runs used Unix epoch ms; 1 used ISO 8601 without Z suffix). Cosmetic.

### Distribution

Both channels (Claude Code marketplace + NPM `@fx-studio-ai` scope restricted) ship v7.1.0. Marketplace `source.ref` bumped to `v7.1.0`. Settings.json hook registration requires running `/reload-plugins` after install to pick up the Stop event hook in an existing session.

---

## [7.0.0] - 2026-05-19 — License update: PolyForm Shield 1.0.0 (MAJOR, license-only)

**Major release. Code identical to v6.3.0. License change only.**

Pipeline Orchestrator v7.0.0 is licensed under the
[PolyForm Shield License 1.0.0](https://polyformproject.org/licenses/shield/1.0.0).
This is a license-only major version bump per SemVer convention for
license changes. No code, agents, gates, hooks, or behavior have
changed from v6.3.0.

### Why

As Pipeline Orchestrator matured into a substantial governance layer
with 20 production agents, 32 registered gates, glass-box audit trail,
and dogfood-validated discipline mechanics, the project moved to a
source-available license with explicit noncompete protection. The
Shield license preserves the spirit of open source — read, fork,
modify, run freely — while reserving the **commercial competition
vector** via its Noncompete clause.

This is the same pattern adopted by HashiCorp (BSL), Sentry (BSL),
MariaDB (BSL), Elastic (Elastic License 2.0), MongoDB (SSPL), and
MinIO. The 2018-2024 cohort of commercially operated open-source
projects has consolidated around source-available licenses with
anti-competition carve-outs.

### What changes

- **LICENSE file:** PolyForm Shield 1.0.0 official text.
- **NOTICE.md:** new file documenting attribution requirements,
  authorship misrepresentation prohibition, trademark notice, public
  proof of authorship (git/NPM/GitHub Releases/marketplace), and
  enforcement policy.
- **package.json:**
  - `version`: `6.3.0` → `7.0.0`
  - `license`: `"SEE LICENSE IN LICENSE"` (NPM convention for custom
    licenses)
- **plugin.json:**
  - `version`: `6.3.0` → `7.0.0`
  - `license`: `"PolyForm-Shield-1.0.0"`
- **marketplace.json:** version and `source.ref` bumped to `v7.0.0`.
- **CLAUDE.md:** canonical version line + lineage row updated.
- **README.md:** License + Authorship & Attribution sections updated
  to reflect the Shield license; install instructions unchanged.
- **assets/diagrams/hero-banner.svg:** version badge bumped to
  `v7.0.0`.
- **.github/FUNDING.yml:** new file enabling GitHub Sponsors button
  on the repository.

### What does NOT change

- All agent definitions, gate registry, hooks, references, and tests
  are byte-identical to v6.3.0.
- The 22-row Mandatory Gates by Complexity invariant is preserved.
- The 32-row Gate Registry is preserved.
- The discipline layer added in v6.3.0 (CHANGE_CONTRACT, SCOPE LOCK
  CHECK, diff-discipline-reviewer, scope-lock-hook) operates
  identically.
- The 31-suite regression test pass is unchanged.

### Trademark reservation

The names **"Pipeline Orchestrator"** and **"FX Studio AI"** are
trademarks of FX Studio AI. The Shield license grants code rights but
does not grant trademark rights. Forks must use a different name to
avoid trademark confusion, consistent with how Linux (trademark held
by Linux Foundation) and Mozilla (Firefox trademark separate from
codebase) handle the same separation.

### Distribution channels

Both channels (Claude Code marketplace + NPM `@fx-studio-ai` scope)
ship v7.0.0 under Shield. Marketplace remains the public default;
NPM remains restricted-access via granular token. No infrastructure
changes.

### For contributors

Pull requests against v7.0.0+ branches implicitly accept Shield terms
for the submitted code.

---

## [6.3.0] - 2026-05-19 — Implementation Discipline Layer (MINOR)

**Minor release.** Adds a discipline layer that constrains every code-changing batch to a declared `CHANGE_CONTRACT` — scope, diff budget, forbidden change types, test integrity. Enforced structurally by agents reading a new SSOT, NOT by adding a new gate row. Backward compatible (legacy plans without `CHANGE_CONTRACT` skip the discipline reviewer cleanly).

### Why this matters

Prior to v6.3.0, the pipeline had strong checkpoints for **correctness** (TDD, adversarial review, sanity check) but weak signals for **discipline**:
1. **Scope creep.** An implementer could touch any file the agent had permission for, including drive-by cleanup that bloated diffs.
2. **Over-engineering.** Premature abstraction, "framework lite" patterns, and speculative parameterization slipped past adversarial and architecture review because those agents focused on *correctness* and *patterns*, not *minimality*.
3. **Silent dependency drift.** A new `import` of a previously unused package would pass review if the code worked — even when adding a new dependency was not in scope.
4. **Test weakening.** Tests that started failing could be "fixed" by loosening assertions instead of fixing the code.

v6.3.0 closes all four by introducing a per-batch `CHANGE_CONTRACT` that every plan must declare and every implementer/reviewer must respect.

### Added

- **`references/implementation-discipline.md` (NEW)** — SSOT for the discipline layer. 11 sections covering severity definitions (PASS / NEEDS_REDUCTION / REJECTED with hardness mapping), scope control rules, minimal-diff discipline heuristics, SOLID/KISS/DRY/YAGNI application, dependency/config/contract/migration restrictions, test integrity rules, evidence requirements, bootstrap & self-applying behavior, interaction with the 22-Gate Mandatory Table, interaction with ADVERSARIAL_BLOCK (max=3) vs. new max=5.
- **`CHANGE_CONTRACT` block in `IMPLEMENTATION_PLAN`** (new Rule 11 in `agents/quality/plan-architect.md`) — 6 required fields: `allowed_files`, `allowed_new_files`, `forbidden_files`, `forbidden_change_types` (7 canonical types), `diff_budget` (with 4 sub-fields), `escalation_required_if`. Plus `bootstrap.active` flag for one-time relaxation. Defaults are fail-closed (0/false) — every plan MUST customize them.
- **`## SCOPE LOCK CHECK` in `agents/executor/executor-implementer-task.md`** — fires before every Write/Edit (Read remains free). 5 checks against the active `CHANGE_CONTRACT`. On violation: returns `status: QUESTIONS` with `question.context: scope_lock_violation`, routed to the user via the parent. Includes 9-item anti-pattern list (no drive-by cleanup, no unrequested refactor, no new dependency injection, no CI/build config edits, no `package.json`/lockfile edits, no `.env*` edits, no migration/schema files, no public contract drift, no test weakening to fit implementation).
- **`agents/quality/diff-discipline-reviewer.md` (NEW agent — agent roster grows 19 → 20)** — third parallel reviewer in `review-orchestrator`, alongside `adversarial-batch` and `architecture-reviewer`. Tools: Read, Grep, Glob ONLY (no Bash, no Edit, no Write — static-only inspection). Emits `DIFF_DISCIPLINE_REVIEW:` YAML with verdict, scope findings, minimal_diff findings, dependency/config/contract findings, test integrity findings, evidence. `REJECTED` is HARD with `max_fix_attempts=5`. `NEEDS_REDUCTION` is SOFT (user-acknowledged, no fix loop).
- **3-way parallel reviewer wiring in `agents/quality/review-orchestrator.md`** — Step 1 table updated for SIMPLES (with CHANGE_CONTRACT) / MEDIA / COMPLEXA; new `DIFF_DISCIPLINE_INPUT:` block in Step 2; Step 3 REVIEW_CONSOLIDATED gains `diff_discipline:` field, `combined_findings.source: diff_discipline` enum value, and `fix_loop_counters:` sub-block with `adversarial_block_attempts` (max=3) and `diff_discipline_attempts` (max=5) tracked independently.
- **5 new check rows in `agents/quality/architecture-reviewer.md`**:
  - Step 3 Abstraction Reuse: *abstraction without second real use case*, *new file where local change was enough*
  - Step 4 Structural Integrity: *unnecessary architecture layer*, *unrelated refactor*, *public contract drift*
  - (Pre-existing: *duplicated helper/type/constant*, *semantic duplication* — already captured by older rows)
- **7 regression tests in `tests/regression/v6.3.0/` (F8-F14)** — static-asserts following the v6.1.0 pattern:
  - F8: `implementation-discipline.md` exists with required sections
  - F9: `plan-architect.md` contains `CHANGE_CONTRACT:` with all 6 fields + 5 canonical forbidden_files + 7 canonical forbidden_change_types
  - F10: `executor-implementer-task.md` contains `## SCOPE LOCK CHECK` heading positioned correctly with violation protocol and Bootstrap exception
  - F11: `diff-discipline-reviewer.md` exists with `tools: Read, Grep, Glob` exactly + `DIFF_DISCIPLINE_REVIEW:` schema + `max_fix_attempts=5`
  - F12: `review-orchestrator.md` Step 1 mentions diff-discipline-reviewer + Step 2 `DIFF_DISCIPLINE_INPUT:` + Step 3 `diff_discipline:` + `fix_loop_counters:` with `diff_discipline_attempts:`
  - F13: `architecture-reviewer.md` contains 7 discipline checks regex-matchable
  - F14: `references/gates.md` Gate Registry has exactly 32 rows (current count post-v6.2.0) AND Mandatory Gates by Complexity table has exactly 22 rows — defense-in-depth invariant guard

### Invariants preserved

- **22-row Mandatory Gates by Complexity table** in `references/gates.md` — UNCHANGED. Pinned by `tests/regression/v6.1.0/F1_gates_mandatory_section.cjs` (untouched in this release).
- **32-row Gate Registry** (full table) in `references/gates.md` — UNCHANGED. Pinned by new `F14_gates_md_unchanged_count.cjs` as belt-and-suspenders.
- **No new gate row added.** The discipline layer is enforced structurally by agents reading the new SSOT + the per-plan `CHANGE_CONTRACT`. `NEEDS_REDUCTION` logs under existing `ADVERSARIAL_GATE` (SOFT); `REJECTED` triggers an internal fix loop that piggybacks on existing return-to-executor-fix machinery.
- **`ADVERSARIAL_BLOCK` row in `references/gates.md`** — UNCHANGED. `max=3` retained. The new `max=5` is a property of the new agent's internal fix loop, NOT a modification of `ADVERSARIAL_BLOCK`.

### Bootstrap exception (one-time, v6.3.0 only)

This release created the enforcement machinery (`implementation-discipline.md`, `CHANGE_CONTRACT` schema, `SCOPE LOCK CHECK` section, `diff-discipline-reviewer` agent). The plan for v6.3.0 itself was the first plan to declare `CHANGE_CONTRACT`. Tasks T1-T3 ran WITHOUT runtime `SCOPE LOCK CHECK` enforcement because the mechanism did not yet exist in code at that point. The plan declared `CHANGE_CONTRACT.bootstrap.active: true` for audit transparency. From T4 onward, enforcement is fully active. Future plans (v6.4.0+) inherit a fully-enforced pipeline; setting `bootstrap.active: true` on a non-bootstrap plan is itself a `forbidden_change_type` and will be rejected. The bootstrap event is logged once to `gate-decisions.jsonl` as `event: "BOOTSTRAP_EXEMPTION_USED"` with hardness `AUDIT`.

### Test suite

- 19 → **26** regression suites GREEN (+7 new tests F8-F14).
- All v6.0.0/v6.1.0/v6.2.0 tests untouched; F1 22-row assertion preserved exactly.
- Zero regressions in hook syntax suite (sentinel-hook, dispatch-guard, edit-guard, force-pipeline-agents, session-cleanup, session-lock, skill-frontmatter-parser).
- Approx. +1,250 lines added across SSOT (233), new agent (229), updated agents (~165), tests (~720), CHANGELOG + plugin/marketplace metadata.

### Backward compatibility

- Plans emitted before v6.3.0 (no `CHANGE_CONTRACT` field) are accepted. `diff-discipline-reviewer` emits a SKIP result documented in `REVIEW_CONSOLIDATED.diff_discipline.status: "SKIPPED"`. v6.4.0 will promote missing `CHANGE_CONTRACT` from SKIP to HARD on MEDIA/COMPLEXA plans.
- SIMPLES tasks remain exempt from the multi-batch adversarial loop. The discipline layer (`SCOPE LOCK CHECK` + diff-discipline reviewer) still runs in SIMPLES when a `CHANGE_CONTRACT` is present, but without multi-batch iteration.

### Files touched

- New: `references/implementation-discipline.md`, `agents/quality/diff-discipline-reviewer.md`, `tests/regression/v6.3.0/F8_*.cjs` … `F14_*.cjs`
- Modified: `agents/quality/plan-architect.md`, `agents/executor/executor-implementer-task.md`, `agents/quality/architecture-reviewer.md`, `agents/quality/review-orchestrator.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `CHANGELOG.md`
- Untouched (by design — in `CHANGE_CONTRACT.forbidden_files`): `references/gates.md`, `tests/regression/v6.0.0/**`, `tests/regression/v6.1.0/**`, `tests/regression/v6.2.0/**`, `commands/pipeline.md`, `package.json`, lockfiles, `.env*`, `.github/workflows/*`

---

## [6.2.0] - 2026-05-18 — Clarification Overhaul + Alternatives Brainstorming (MINOR)

**Minor release.** The most important step of the pipeline — pre-execution clarification — was rebuilt from a fixed-template question list into an evidence-driven dynamic agent. New step proposes alternative approaches. Drift fix on the complexity matrix. Backward compatible.

### Why this matters

The legacy `step-01-explore.md` asked 7 fixed questions (Goal / Audience / Boundary / Risk / Constraint / Reference / Done check) regardless of what the prompt or project state already revealed. Three failure modes:

1. **Generic asks** — "What's the biggest risk?" with no domain context. The user had to invent the project framing the agent should have read.
2. **Hidden gaps** — domain-specific risks (PII, streaming, idempotency, timeout) never surfaced because no lens existed for them.
3. **Theatre questions** — categories that the prompt already answered still got asked, burning turns.

v6.2 fixes this by inverting the contract: the agent MUST read project context BEFORE asking anything, then asks only for *residual* gaps, with evidence citations (file:line) in every option.

### Added

- **`agents/brainstorm/step-01-explore.md` (rewritten)** — 4-phase dynamic agent:
  - **Phase A (Context analysis, mandatory)** — read CLAUDE.md, pipeline.local.md, `probable_files` from intake, git state. Detect SSOT collisions. Flag domains (auth/payment/PII/migration/concurrency).
  - **Phase B (Gap inventory)** — 11 lenses (Intent / Scope / Acceptance / Domain risk / Non-functional / Integration / Migration / Failure surface / Test strategy / Pattern alignment / Stakeholders) + domain extensions unlocked by Phase A flags. Each lens marked ANSWERED (with rationale) or generates 0..N gaps. No fixed count.
  - **Phase C (Ask)** — one `=== GATE_REQUEST v1 ===` per gap, recommendation grounded in cited evidence, no generic template questions.
  - **Phase D (Record + telemetry)** — writes `02-explore.md` and emits JSONL events.
- **`agents/brainstorm/step-01b-alternatives.md` (NEW)** — proposes 2-4 alternative approaches across Minimal / Pattern-aligned / Aggressive / Contrarian axes after clarification completes. Auto-skip when prompt is mechanical + zero open lenses + ≤2 files + SIMPLES. User chooses via GATE_REQUEST; implicit plan is always an option.
- **5 new gate types** in `references/gates.md`:
  - `CLARIFICATION_GAPS_DETECTED` (AUDIT)
  - `CLARIFICATION_RESOLVED` (HARD)
  - `CLARIFICATION_SKIPPED` (SOFT)
  - `ALTERNATIVES_PROPOSED` (AUDIT)
  - `ALTERNATIVE_CHOSEN` (SOFT) + `ALTERNATIVES_SKIPPED` (SOFT) + `STEP_01_GAP_LEAKED` (SOFT)
- **New AUDIT hardness level** — informational telemetry events that never block, never apply confidence penalty, never count toward fidelity scoring. Used so observability events have a first-class gate row instead of masquerading as SOFT/COMPLETED entries.
- **`docs/audits/2026-05-18-clarification-overhaul-dogfood/`** — dogfood evidence: README, comparison-legacy-vs-v62.md, telemetry-delta.md, full pipeline-runs/ scenario against IFRS 16 `backend/app/routers/contracts.py:232`. 14 telemetry events; 4 anti-invention blockers (streaming / PII-LGPD / result cap / timeout) surfaced that the legacy template would have left for downstream invention.

### Changed

- **`references/complexity-matrix.md`** — drift fix: `Has spec` column for MEDIA changed from `Optional` to `Required (auto-dispatch)`, matching `pipeline-controller.md:281` runtime behavior. Added "Spec Mandate (v6.2+)" subsection explaining `--no-prep` escape hatch and audit trail.
- **`agents/core/brainstorm-controller.md`** — STEP C table grows from 9 to 10 entries (inserts `1b` between `01-explore` and `02-spec-init`). Numbering note explains backward-compat semantics.
- **`commands/brainstorm.md`** — description rewritten to reflect new flow; documents the 4 phases of clarification; adds `--skip-alternatives` flag.
- **Gate registry** count: 22 → 27.

### Backward compatibility

- Legacy `pipeline-runs/` created pre-2026-05-18 lack `notes.options.alternatives_done` — controller treats missing field as `"auto-skipped"`, resume succeeds without error.
- Mandatory Gates by Complexity table in `references/gates.md` UNCHANGED — F1 regression test passes by construction (new gates are in a separate section, not in the Mandatory table).
- AUDIT-hardness events are explicitly excluded from `fidelity-reporter.cjs` math, no scoring regression.

### Telemetry delta vs v6.1 baseline

Measured against `D:/IFRS-16-po-eval/C1-brainstorm-handoff/.pipeline/docs/Pre-Medium-action/2026-05-10-audit-f04/gate-decisions.jsonl`:

- Brainstorm-phase JSONL events: 0 → 14
- Distinct gate types in registry: 22 → 27
- Hardness levels: 4 → 5 (+AUDIT)
- Average evidence-citations per question: ~0.1 → 1.0 (mandatory by contract)
- Pre-question file reads: 0 → 4 (Phase A required)
- Anti-invention blockers surfaced at brainstorm phase: 0-1 → 4 (dogfood scenario)

### Cost/value

Brainstorm token spend rises ~3× (legacy ~2.6k → v6.2 ~8.2k). Each invention prevented at the brainstorm phase typically costs 10-50× to fix once it surfaces at adversarial review or in production. Net economics strongly positive on MEDIA and COMPLEXA work.

### Known gaps / forward dependencies

- `--skip-alternatives` flag wired in command but explicit persistence in `brainstorm-controller` STEP A.1 deferred to v6.3 (currently honored via auto-skip rule when conditions match).
- Regression test for Phase A reading discipline (assert step-01-explore reads at least the `probable_files` set) — recommended but not yet added.

## [6.1.0] - 2026-05-15 — ATDD/BDD/DDD Workflow Contracts (MINOR)

**Minor release.** Adds three lightweight workflow contracts on top of the v6.0.0 hardening base, all SOFT-enforced and proportional to complexity. Producer-side wiring only — downstream consumers tracked as forward dependencies for v6.2.

### Added

- **D5 (ATDD)**: non-spec Given/When/Then normalization in quality-gate-router (Step 1b, MEDIA/COMPLEXA only, EARS And/But continuations allowed; SIMPLES/Spec exempt). Field `non_spec_atdd.applied` set when `scenario_count > 0`.
- **D6 (BDD)**: Gherkin artifact emission per slice in feature-vertical-slice-planner (Step 3b, flat naming `.pipeline/artifacts/bdd/SLICE-NN.feature`). Adds `bdd_artifact` field to slice planning output.
- **D7 (DDD)**: Bounded Contexts section in plan-architect (lightweight 3-column COMPLEXA-only contract, SOFT enforcement via `BOUNDED_CONTEXT_MISSING` event in `protocol-events.jsonl` using the canonical schema). MEDIA/SIMPLES exempt.
- **4 new regression tests** in `tests/regression/v6.1.0/`:
  - `D5_atdd_quality_gate_router.cjs` (10 scenarios — Given/When/Then normalization + EARS And/But)
  - `D6_bdd_gherkin_output_contract.cjs` (8 scenarios — flat naming + bdd_artifact field shape)
  - `D7_ddd_bounded_contexts_contract.cjs` (9 scenarios — 3-column contract + SOFT event emission)
  - `B4_cross_cutting_docs.cjs` (10 scenarios — CHANGELOG/CLAUDE.md/plugin.json wiring + regression guards)

### Forward dependencies / known limitations

- `bdd_artifact` field is producer-only — no downstream consumer wired (v6.2 target).
- `gherkin_content` per slice + executor-controller persist routine missing (v6.2 target).
- `SLICE-NN` zero-pad capped at 2 digits; behavior undocumented at >=100 slices.
- Batch 1 MINORs deferred: regex tightness in D5-S2/S5 assertions; `bdd_artifact` has no consumer (A2_R1 noted above); `non_spec_atdd.applied` is redundant with `scenario_count > 0`; ARCH naming consistency (`non_spec_atdd` vs `spec_context_scenarios`).

## [6.0.0] - 2026-05-15 — Comprehensive Audit + Hardening (MAJOR)

**Major release.** First full external audit cycle (over the IFRS 16 reference project) plus three hardening waves (Fase D / Fase H / Fase I). All 12 CRITICAL findings resolved, audit surface coverage went from 30% to 95%, three new security mitigation libraries shipped, regression suite expanded to 39 tests, full visual documentation overhaul.

### Why this is a major version bump

- Behavioral contract change: **16 subagents now declare the Achado #7 RUNTIME PROTOCOL section explicitly** (was: 2 of 19 in v5.2.0). Subagents that previously fell back to prose questions when their input was ambiguous now MUST emit structured `GATE_REQUEST v1` / `PLAN_MODE_REQUEST v1` blocks. Consumers that parsed prose output need to migrate to the structured payloads.
- Constant rename: `STALE_THRESHOLD_MS` and `STALE_HEARTBEAT_MS` renamed to canonical `STALE_SPAWN_THRESHOLD_MS` / `STALE_HEARTBEAT_THRESHOLD_MS`. Old names preserved as deprecated aliases through v6.0.x; removal scheduled for v6.1.0.
- New SSOT documents: `references/stale-thresholds.md`, `docs/audits/2026-05-15-ifrs16-deep-audit/`, `docs/diagrams/`.

### Added

- **`lib/sentinel-state-signer.cjs`** (I4) — HMAC-SHA256 integrity signature for `sentinel-state.json`. Mitigates audit finding H1-002 (sentinel-hook fail-open admitted by design). Auto-generated 32-byte key at `~/.claude/plugins/cache/.../v6.0.0/.hmac-key` (chmod 600). Strict and migration modes. Uses `crypto.timingSafeEqual` against timing attacks.
- **`lib/jsonl-sanitizer.cjs`** (I5) — Safe append API for `gate-decisions.jsonl` and `protocol-events.jsonl`. Mitigates audit findings B1-005 and H6-001 (JSONL injection demonstrated breaking parse). Allowlist of 8 / 15 keys, strict `JSON.stringify`, 200-char truncation per Inline Invariant 2, round-trip validation before write, drops unknown keys silently.
- **`lib/pipeline-local-parser.cjs`** (I6) — Strict parser for `.claude/pipeline.local.md`. Mitigates audit finding H6-002 (RCE potential via shell metacharacters in `build_command`). Parses only YAML frontmatter, whitelists 5 keys, shell-injection guard, path-traversal guard. Validated against real adversarial POC during Fase I.
- **`references/stale-thresholds.md`** (I7) — SSOT canonical for the three distinct "stale" concepts: STALE_SPAWN (5 min, sentinel-hook) / STALE_HEARTBEAT (10 min, session-lock + edit-guard) / STALE_CONTEXT (24 h, gate registry). Includes decision tree for diagnosing which concept fired.
- **`docs/diagrams/`** — Visual documentation overhaul. Standalone HTML files renderable in any browser: pipeline overview, Achado #7 protocol, gate hierarchy, audit history timeline.
- **`docs/audits/2026-05-15-ifrs16-deep-audit/`** — 9 archived reports from the comprehensive audit (canonical contract, decision table, FINAL_CONSOLIDATED_REPORT, PANEL_FINAL, FASE_H_FINDINGS, FASE_H_ADDENDUM, FASE_H_FINAL, FASE_I_FINAL, COMPARISON_v5.2_vs_v5.3, INDEX).

### Fixed — 12 CRITICAL audit findings (100%)

- **B1-001** (D9) — Orphan sentinel state cross-session contamination. Added ORPHAN_CLEANUP mode + 24h TTL contract in `agents/core/sentinel.md`.
- **B1-004** (D2) — `information-gate` falling back to prose when gap requires user decision. Added ACHADO #7 RUNTIME PROTOCOL section to `agents/core/information-gate.md`.
- **B5-001** (D2) — `plan-architect` writing plan inline instead of emitting `PLAN_MODE_REQUEST v1`. Added ACHADO #7 RUNTIME PROTOCOL section to `agents/quality/plan-architect.md`.
- **F3-1** (D2-follow-up, panel adversarial finding) — Schema drift in worked examples (`multiSelect` camelCase, `(Recomendado)` suffix instead of `recommended: true` field, missing `expected_deliverables`). Corrected examples in 16 subagents.
- **F3-3** (D2-extension, panel adversarial finding) — 14 sibling subagents shared the same protocol-fallback bug. Applied same ACHADO #7 section to `design-interrogator`, `pre-tester`, `executor-fix`, `executor-implementer-task`, `spec-closer`, `feature-implementer`, `bugfix-diagnostic-agent`, `bugfix-root-cause-analyzer`, `bugfix-regression-tester`, `ux-simulator`, `ux-accessibility-auditor`, `ux-qa-validator`, `architecture-reviewer`, `sanity-checker`.
- **H1-NEW-001 / H1-NEW-002 / H1-NEW-003** (D2-extension-v2, second-pass audit) — `sanity-checker`, `checkpoint-validator`, and `bugfix-regression-tester` still fell back to prose despite D2-extension append. Added explicit ACHADO #7 PROSE-FALLBACK GUARD note at the **top** of each spec (LLMs prioritize top-of-file). Empirically validated in runtime re-test.
- **H1-002** (I4) — sentinel-hook fail-open by design. Mitigated by HMAC signature library.
- **H6-001** (I5) — JSONL injection (POC demonstrated parse break with quotes). Mitigated by sanitizer library.
- **H6-002** (I6) — `pipeline.local.md` accepted shell injection (`build_command: "echo PWNED && rm -rf /"` would execute). Mitigated by sandbox parser library, validated against the real POC.

### Fixed — HIGH findings

- **H1-001** — `dispatch-guard.cjs` table `AGENT_LEAF_TO_FQN` was missing `brainstorm-controller`, `step-00-intake`, `step-01-explore`. The hook's own test suite was failing. Added the 3 entries; suite went from 6/7 to 13/13 PASS.
- **H1-003** (I7) — STALE_THRESHOLD drift across hooks (5 min) vs registry (24 h). Created SSOT `references/stale-thresholds.md`, renamed constants to canonical names, added cross-references in `references/gates.md`, `commands/pipeline.md`, `agents/core/sentinel.md`.

### Tests

- **39 regression tests** total in `tests/regression/v6.0.0/`:
  - `D2_test_subagent_protocol.cjs` — 16 tests (1 per subagent) validating Achado #7 section + schema rules + placeholder leak detection
  - `D9_test_orphan_cleanup_spec.cjs` — 1 test
  - `I4_I5_I6_lib_test.cjs` — 14 tests covering signer + sanitizer + parser
  - `I7_stale_thresholds_consistency.cjs` — 8 tests covering SSOT + canonical names + cross-refs
- **Hook test suite** — 7/7 PASS (was 6/7 in v5.2.0; dispatch-guard now green).
- Two BDD Gherkin feature files documenting expected runtime behavior.
- Audit coverage milestone: **22/22 gate registry entries exercised in runtime** (was 5/22 in v5.2.0).

### Runtime evidence (Fase G)

After applying D2, re-dispatched `information-gate` with the original B1-004 scenario. Subagent now emits `GATE_REQUEST v1` block with `multi_select: false`, `recommended: true` field, AWAITING_GATE_RESPONSES status. Re-dispatched `plan-architect` with B5-001 scenario; subagent emits `PLAN_MODE_REQUEST v1` with concrete `plan_id`, `expected_deliverables`, `research_scope`, and explicitly states *"plan will NOT be emitted inline"*.

### Breaking changes

1. **Subagent output format** — Subagents that previously emitted prose questions now emit structured YAML blocks. Consumers parsing tool results must look for `=== GATE_REQUEST v1 ===` / `=== PLAN_MODE_REQUEST v1 ===` / `=== DISPATCH_REQUEST v1 ===` blocks.
2. **Constant rename** — `STALE_THRESHOLD_MS` → `STALE_SPAWN_THRESHOLD_MS` (sentinel-hook), `STALE_HEARTBEAT_MS` → `STALE_HEARTBEAT_THRESHOLD_MS` (edit-guard-hook). Old names exported as deprecated aliases through v6.0.x; removal scheduled for v6.1.0.
3. Worked-example schema in 16 subagents now uses `multi_select` (snake_case) and `recommended: true` field. Consumers generating these blocks programmatically must update to the canonical shape.

### Migration

No code changes required for normal users invoking `/pipeline-orchestrator:pipeline` or `/pipeline-orchestrator:brainstorm`. The plugin behaves as before; the changes harden the runtime contract.

External tools that **parse subagent output** must migrate from prose-style A/B questions to structured YAML blocks. See `references/gate-request-protocol.md` for the canonical schema.

External tools that **import hook constants** should switch from `STALE_THRESHOLD_MS` / `STALE_HEARTBEAT_MS` to the canonical `STALE_*_THRESHOLD_MS` names.

### Audit artifacts

Full audit trail in `docs/audits/2026-05-15-ifrs16-deep-audit/`:
- `INDEX.md` — reading order + summary
- `_canonical_contract.md` — audit ground truth
- `FINAL_CONSOLIDATED_REPORT.md` — phase B+D matrix
- `PANEL_FINAL.md` — 3-persona consolidation (Anthropic Senior Auditor + Claude Code Engineer + Redteam)
- `FASE_H_FINDINGS.md`, `FASE_H_ADDENDUM.md`, `FASE_H_FINAL.md` — second-pass deep audit
- `FASE_I_FINAL.md` — residual coverage + 3 security libraries
- `COMPARISON_v5.2_vs_v5.3.md` — pre/post comparison with runtime evidence

## [5.2.0] - 2026-05-08 — Achados 1-7 reconciliation + GATE_REQUEST/DISPATCH_REQUEST protocol (PROMOTED FROM rc.2)

**Minor release.** Promoted from v5.2.0-rc.2 with identical content. User authorized direct promotion for distribution to all marketplace consumers — `/plugins update` (default mode) on any client now receives this version automatically. The 5 follow-ups deferred to v5.2 final (A.4 state persistence, A.5 orphan-lock auto-cleanup, A.6 runtime test framework, A.13 dispatch_id retry collision, A.14 exec-window protocol migration) are **acknowledged known limitations**, not blockers — they degrade gracefully in current usage.

See [5.2.0-rc.2] and [5.2.0-rc.1] sections below for the substantive changes (Achados 1-7, GATE_REQUEST protocol, 5 SKILLs adoption, brainstorm step agents, 9 pipeline-controller dispatch sites). Suite: 294 PASS / 10 FAIL (pre-existing Windows CRLF) / 1 SKIPPED. Zero regressions.

## [5.2.0-rc.2] - 2026-05-07 — Achado #7 protocol adoption expanded

**RC follow-up to v5.2.0-rc.1.** Closes the 3 protocol-coverage lacunas identified in the post-rc.1 adversarial verification: (1) the 5 public SKILL entry-points (`/audit`, `/bugfix`, `/feature`, `/spec`, `/pipeline`) now include the GATE_REQUEST handler instructions for the parent main LLM (previously only `commands/pipeline.md` and `commands/brainstorm.md` had them); (2) brainstorm-controller now declares DISPATCH_REQUEST adoption for `agents/brainstorm/step-00-intake.md` and `agents/brainstorm/step-01-explore.md` with concrete examples (previously these Agent dispatches would silently fail per Achado #7); (3) pipeline-controller now includes 10 concrete DISPATCH_REQUEST examples covering all 9 sub-agent dispatch sites (Phase 0a/0b/0c, 1.5, 2c/2e, 3a/3b/3c) plus sentinel checkpoints (previously only Phase 0a had a concrete example, the other 8 sites relied on the abstract "Achado #9 reminder" rule). +4 contract regression tests. One v5.2.0-rc.1 test regression also fixed: a `verify-completion-pre-pa-de-cal.test.js` indexOf-based ordering check broke when a new DISPATCH_REQUEST example for Phase 3b mentioned "final-validator (Pa de Cal)" earlier in the file; resolved by renaming the example description to "Pa-de-Cal verdict" to avoid the substring collision.

## [5.2.0-rc.1] - 2026-05-07 — Achados 1-7 reconciliation + GATE_REQUEST protocol

**Patch-equivalent: pure documentation drift fixes + new contract tests + architectural disclosure.** No behavioral code changes (the Phase 1.5 trigger expansion to `type == Spec` is documented in spec but not yet wired into a runtime classifier — see Achado 7 caveat).

### Fixed (Achados 1, 2, 3, 6)

- **Achado 1 — Phase 1.5 trigger drift between agent file and slash-command spec.** `agents/core/pipeline-controller.md` lines 533-536 reconciled with `commands/pipeline.md` Phase 1.5 detail. Both surfaces now declare the v4.17.0+ rule `(complexity in {MEDIA, COMPLEXA} OR type == Spec) AND --no-plan NOT in args`. Each surface cross-references `tests/fixtures/phase-1-5-trigger.canonical.txt` as SSOT.
- **Achado 2 — Internal contradiction inside `commands/pipeline.md`.** Table-of-Contents bullet (line ~23) and ASCII overview box (line ~197) updated to the new auto-behavior wording. They no longer claim "(COMPLEXA or --plan)" while the body says otherwise.
- **Achado 3 — Orphan TRACE Plan-mode override block.** Block at `agents/core/pipeline-controller.md` lines ~972-979 expanded to enumerate the `type == Spec` rows (SIMPLES Spec + --no-plan honored; MEDIA/COMPLEXA Spec + --no-plan falls through to complexity row). Aligned with §4.6 of `references/trace-schema/v1.md`.
- **Achado 6 — Phase 1.5 trigger silent on `type == Spec`.** Trigger string in both authoritative surfaces now explicitly includes `OR type == Spec`. Coverage matrix in agent file Phase 1.5 details all four (complexity × type=Spec) cells.

### Added (Achados 4, 5)

- **Achado 4 — Brainstorm-to-pipeline plan flag propagation.** `agents/core/brainstorm-controller.md` STEP A.1 now persists `plan_flag` (`"plan"` | `"no-plan"` | `null`) in `manifest.notes.options`. STEP E "Run pipeline now" branch reads the persisted value at handoff and appends the matching CLI flag to the pipeline-controller spawn args. Original CLI flag intent now propagates end-to-end across the brainstorm-handoff boundary.
- **Achado 5 — STEP 1.7 classification consistency guard.** `agents/core/pipeline-controller.md` STEP 1.7 now specifies that on `PREP_RUN_ID` resume, the controller re-classifies and compares `reclassified.complexity` against `manifest.complexity`. On mismatch: log a `classification_discrepancy` event to TRACE.md (`manifest`, `reclassified`, `action: trust_manifest`) and continue using the manifest value. Never halts, never prompts.

### Disclosed + Root cause confirmed (Achado 7 — architectural finding, fix path chosen, implementation deferred)

- **Achado 7 — Subagent runtime tool-inventory limitation. ROOT CAUSE CONFIRMED 2026-05-07T23:50Z** via empirical probe (general-purpose subagent dispatched specifically to test reachability of each suspected tool). Confirmed: `AskUserQuestion`, `Agent`, and `EnterPlanMode` are stripped from the subagent's tool manifest at the runtime level by Claude Code's harness — not denied, not deferred-but-resolvable, simply absent. `Skill`, `Task*` family, `WebFetch`, `WebSearch` all confirmed reachable inside subagents. Mitigation path chosen: **M-2 (Skill dispatch) + M-1 partial (hoisted gates pattern)**. Subagents that previously did `Agent(subagent_type: ...)` will use `Skill(skill: ...)` (Skill is available); user-decision gates that previously did AskUserQuestion will emit a `GATE_REQUEST` block to the parent context. Implementation deferred to v5.2 (~25-40h estimated). See `docs/findings/achado-7-subagent-runtime.md` for the empirical evidence table, the implementation outline, and the remaining open questions.

### Tests

- `tests/fixtures/phase-1-5-trigger.canonical.txt` — single source of truth for the Phase 1.5 trigger string.
- `tests/contracts/phase-1-5-trigger-string.test.cjs` — 8 tests asserting all 5 surfaces reference the canonical fixture and include `type == Spec`. **Catches drift on every CI run.**
- `tests/brainstorm-controller-flag-propagation.test.cjs` — 5 tests covering plan_flag persistence, propagation, and the null/empty case.
- `tests/pipeline-controller-step-1-7-guard.test.cjs` — 6 tests covering the guard subsection, the `classification_discrepancy` event, the `trust_manifest` action, the no-halt/no-prompt invariant, and recursion-bound preservation.
- Suite delta: 166/0/1 → **185/0/1** (+19 tests across 3 new files; zero regressions).

### Migration

- `docs/MIGRATION-v5.0-to-v5.1.md` extended with a new "Phase 1.5 trigger reconciliation" section documenting v4.16.0 vs v4.17.0+ vs current behavior, with one before/after example for `--no-plan` on COMPLEXA.

### Known limitations

- The Phase 1.5 expansion to `type == Spec` is wired into `agents/core/task-orchestrator.md` (post-Achado-6 follow-up: the type enum on lines 33, 188, 243 now includes `Spec`, and the pre-classified-type list at Step 1a accepts it). Runtime classifier behavior for type=Spec activates Phase 1.5 plan-mode at any complexity per the canonical fixture.
- `pre-approvals.yaml` (workaround for Achado 7 in resume executions) is documented in `pipeline-runs/001-fix-6-contract-drift-findings/supplement-achado-7.md` as a temporary pattern. It will be superseded by the v5.2 GATE_REQUEST formalism once Achado 7 is implemented.
- The empirical probe artifact (subagent reachability table) lives in the v5.2 milestone planning notes only — not promoted to a regression test until v5.2 lands the architectural fix.

## [5.1.0] - 2026-05-06

**Minor release — Brainstorm-pipeline + Kiro skill clone.** v5.1.0 makes spec-first development the default. The plugin now owns the full spec lifecycle (8 cloned skills) and `/pipeline` will not run a non-trivial task until a spec exists in a per-run directory. Implemented in 6 batches over a single session, all TDD-driven; the suite grew from 166 to ~260+ green tests with zero regressions.

### Added

- **`/pipeline-orchestrator:brainstorm` command (NEW)** — Mandatory front-end. Allocates a fresh `pipeline-runs/<NNN>-<slug>/`, walks the user through `spec-init` → `spec-requirements` → `spec-design` → `spec-tasks` → `validate-design` → `validate-gap`, then prompts for handoff (proceed to `/pipeline` / save / abort) via `AskUserQuestion`.
- **Per-run directory `pipeline-runs/<NNN>-<slug>/` (NEW)** — Canonical working tree for one brainstorm + implementation cycle. Five fixed subfolders: `00-brainstorm/`, `01-spec/`, `02-validations/`, `03-execution/`, `attachments/`, plus a root `manifest.yaml` (schema_version 1) tracking run_id, status, phase, type, complexity, brainstorm_completed, spec_lifecycle_completed, handoff_decision, linked_pipeline_doc_path.
- **8 cloned spec-lifecycle skills (NEW under `skills/`)** — `spec-init`, `spec-requirements`, `spec-design`, `spec-tasks`, `validate-design`, `validate-gap`, `review`, `verify-completion`. Cloned from the Kiro skill collection via `lib/kiro-skill-cloner.cjs`, with paths rewritten from `.kiro/specs/<feature>/` → `pipeline-runs/<run_id>/01-spec/` at clone time.
- **Domain core libs (NEW under `lib/`)** — `run-directory.cjs` (`RunDirectory.allocate()` with atomic NNN allocation, slug collision resolution, slugify with stop-word filter), `run-manifest.cjs` (`RunManifest` class with schema_version 1 + YAML serialization), `path-rewriter.cjs` (rewrite engine for the cloner), `kiro-skill-cloner.cjs` (orchestrates skill clone + frontmatter preservation).
- **STEP 1.7 routing in `commands/pipeline.md`** — Pre-execution branch deciding load-existing / dispatch-brainstorm / no-prep-override / simples-bypass. Logged via gate `STEP_1_7_ROUTING`. Recursion guarded by `STEP_1_7_RECURSION_GUARD` (CIRCUIT_BREAKER, halts at depth ≥3).
- **Pa de Cal pre-validation** — `pipeline-controller` now plugs the cloned `verify-completion` skill before `final-validator`. New HARD gate `STOP_BEFORE_PA_DE_CAL` halts the pipeline with NO-GO and writes `04-final-report.md` if verify-completion fails.
- **Per-batch review skill** — `executor-controller` now plugs the cloned `review` skill into the per-task adversarial step, replacing the prior inline review prompt.
- **3 new gates in `references/gates.md`** — `STEP_1_7_ROUTING` (HARD informational), `STEP_1_7_RECURSION_GUARD` (CIRCUIT_BREAKER), `STOP_BEFORE_PA_DE_CAL` (HARD). Registry grows 22 → 25.
- **Snapshot test suite (NEW under `tests/snapshot/`)** — `run-dir-tree.test.js` locks the freshly-allocated run-dir layout against `golden/run-dir-empty.txt`. `cloned-skills-frontmatter.test.js` locks the YAML frontmatter of all 8 cloned skills against `golden/cloned-skills-frontmatter.txt` to catch silent drift.
- **`docs/migration-v5.0-to-v5.1.md` (NEW)** — Migration guide for v5.0 users with existing `.kiro/specs/<feature>/` content. Documents two paths (continue with brainstorm — recommended; or lift existing spec into a manually-allocated run-dir) and the breaking-change disclosure.
- **`docs/examples/brainstorm-feature.md` (NEW)** — End-to-end walkthrough of brainstorm + handoff workflow.

### Changed

- **`hooks/edit-guard-hook.cjs`** — Whitelist extended to allow Edit/Write to `pipeline-runs/**` alongside `.pipeline/**` when a session lock is active. Existing `.pipeline/` whitelist preserved; arbitrary paths still blocked.
- **`tests/integration/trace-writer.test.js`** — Wave-8 gate-count lock bumped 22 → 25; regex widened to `^\| [A-Z_0-9]{4,} \|` (the new `STEP_1_7_*` names contain digits).
- **`references/glossary.md`** — Added Brainstorm Pipeline section (8 new terms: Brainstorm, Per-Run Directory, Run ID, Cloned Skills, Handoff, STEP 1.7 Routing, STOP_BEFORE_PA_DE_CAL).
- **`README.md`** — Added "What's New in v5.1" section after v5.0 with feature table, migration pointer, and quickstart example.
- **`.claude-plugin/plugin.json`** — version 5.0.0 → 5.1.0.
- **`.claude-plugin/marketplace.json`** — pipeline-orchestrator ref v5.0.0 → v5.1.0.

### Breaking changes (per SemVer disclosure)

The 3 spec-lifecycle workflows (`spec-light`, `spec-heavy`, `spec-audit-only`) no longer read from `.kiro/specs/<feature>/`. They now read from `pipeline-runs/<run_id>/01-spec/`. Existing `.kiro/specs/` content is preserved on disk (no auto-deletion) but is no longer consumed. The decision to ship under v5.1.0 (rather than v6.0.0) is justified in `docs/migration-v5.0-to-v5.1.md` — the breakage manifests only when invoking the spec workflows, the failure mode is graceful (file-not-found, not data corruption), and a clean migration path exists.

### Suite at v5.1.0

- ~260+ unit + integration + snapshot tests, all green.
- Zero regressions vs v5.0.0 baseline (166 PASS / 0 FAIL / 1 SKIPPED).
- New coverage areas: domain core (Batch 1), skill cloner (Batch 2), brainstorm front-end (Batch 3), pipeline-controller routing (Batch 4), executor integration (Batch 5), edit-guard whitelist + snapshot golden files (Batch 6).

### Deferred to v5.2

- F6 (test fidelity for brainstorm dispatch — currently uses a doc-presence check, not a live skill spawn) per `notes/batch-6-todos.md`.

## [5.0.0] - 2026-05-06

**Major release — first v5.0 stable.** Promoted from `v5.0.0-rc.1` (commit `d643e80`) to `v5.0.0` after user authorization on the same day; the feedback window between rc.1 and 5.0.0 was waived. Content is identical to rc.1.

### What v5.0.0 means

All 7 v5.0 DoD criteria from `designs/pipeline-orchestrator-v5-consolidated.md` §8 are DONE:

1. **5 commands in `/help`** — DONE since v4.7.0 (6th `/spec` since v4.12.0).
2. **TRACE.md in user repo by default** — DONE in v4.17.0 (Wave 8-spec).
3. **TRACE.md attachable to PR via standalone validator** — DONE in v4.17.0 (Wave 8-spec).
4. **Compat suite green for 5 canonical scenarios** — DONE since v4.10.0 (5 PASS / 1 SKIPPED at v5.0.0).
5. **v5.1 milestone published** — DONE post-v4.17.0 via [milestone #1 — v5.1 Pipeline Declarativo (Slice 5)](https://github.com/fernandoxavier02/Pipeline-Orchestrator/milestone/1) with 3 placeholder issues (#16, #17, #18).
6. **Plan-mode auto-triggers on MEDIA/COMPLEXA** — DONE in v4.17.0 (Wave 8-spec).
7. **`pipeline-controller` declares spawn tools explicitly** — DONE since 2026-05-03.

### Suite at v5.0.0

- Unit + integration: 166 PASS / 0 FAIL / 1 SKIPPED.
- Compat mock: 5 PASS / 0 FAIL / 1 SKIPPED.
- Hooks syntax: 8 / 8 OK.
- Zero regressions vs v4.16.0 baseline (149 PASS).

### Changed

- **`.claude-plugin/plugin.json`** — version 4.17.0 → 5.0.0.
- **`.claude-plugin/marketplace.json`** — pipeline-orchestrator entry version 4.17.0 → 5.0.0; ref v4.17.0 → v5.0.0.
- **`tests/unit/spec-entry-point-and-pipelines.test.js:231`** — pin bumped 4.17.0 → 5.0.0.
- **`docs/v5-readiness-report.md`** — final-shipping snapshot; 7/7 DONE confirmed.
- **`CLAUDE.md`** — lineage row v5.0.0 added.

### Open items deferred to v5.0.1 / v5.1

Documented in `docs/v5-readiness-report.md` §4 — none block v5.0.0 itself:

- `sentinel-hook.cjs` cwd-discovery brittleness when CC launched outside the repo root (Wave 8-spec dogfood finding).
- Pipeline-controller `## Your tools` section text update after Step 3b-post introduces cross-tree TRACE write (non-blocking polish).
- JS regex `\Z` gotcha pattern flagged for retro / code-review.
- 11 outstanding deferred debts (10 Wave 3 MEDIUM → v4.13.1; ARCH-WAVE6-1 → v4.14.1).

## [4.17.0] - 2026-05-06

**Minor release WAVE 8-SPEC — TRACE.md + PLAN-MODE AUTO-TRIGGER**. Last technical block before `v5.0.0-rc.1`. Closes 3 v5.0 DoD criteria (#2, #3, #6) in a single wave. Self-hosted dogfood: this release was developed by running `/pipeline-orchestrator:pipeline` on its own canonical repo; the dogfood revealed and documented `sentinel-hook` cwd-discovery brittleness as a v5.0-rc.1 follow-up.

### Added

- **`references/trace-schema/v1.md` (NEW)** — Authoritative SSOT for the TRACE.md artifact. Declares `schema_version: 1`, canonical field order (mirroring `designs/pipeline-orchestrator-v5-consolidated.md` §13), the four required H2 sections (Classification, Pipeline Definition, Execution Log, Final Verdict), the optional Plan Mode override section (§4.6, used when `--no-plan` is passed), the `<run-id>` format `{YYYYMMDD-HHMMSS}-{6char-random}-{slug}`, and the `pipeline-orchestrator.persist_runs: 'private'` opt-out path (`~/.claude/data/pipeline-orchestrator/runs/...`). Closes DoD #2.
- **`scripts/validate-trace.cjs` (NEW)** — Standalone TRACE.md validator. Pure Node, zero external deps. `node scripts/validate-trace.cjs <path>` exits 0 (valid against schema_version=1) or 1 (invalid + diagnostic diff on stderr listing missing/malformed fields and out-of-order sections). Usage on no-args / nonexistent file exits 2 with usage line. Module-exports `{ validate, parseHeaderFields, findSectionPositions }` for unit tests. Closes DoD #3.
- **`tests/integration/trace-writer.test.js` (NEW)** — 7 contract tests covering: schema doc existence + `schema_version: 1` declaration, presence of all canonical header fields, presence of the four required H2 sections, dispatch_mode invariant (#6) documentation, pipeline-controller wires TRACE.md emission in Phase 3 closure between final-validator and finishing-branch, persist_runs opt-out documented, and Iron Law check that `references/gates.md` registry remains at 22 gate rows.
- **`tests/unit/validate-trace.test.js` (NEW)** — 5 unit tests for the validator: happy-path fixture exits 0; corrupt-frontmatter exits 1; corrupt fixture stderr lists at least one issue; no-args exits non-zero with usage; nonexistent file exits non-zero with clear error.
- **`tests/unit/plan-mode-trigger.test.js` (NEW)** — 5 unit tests for the new Phase 1.5 auto-trigger contract: trigger condition mentions both MEDIA and COMPLEXA, modes table documents `--no-plan`, COMPLEXA + `--no-plan` documented as override-blocked, TRACE schema declares the three Plan Mode override fields (`plan_mode_skipped`, `plan_override_attempted`, `justification`), design §8 corrected.
- **`tests/fixtures/trace/happy-path.md` (NEW)** — Reference TRACE.md that conforms to schema_version=1; consumed by validator unit tests and the integration test.
- **`tests/fixtures/trace/corrupt-frontmatter.md` (NEW)** — Intentionally malformed TRACE.md (wrong `trace_schema_version: 99`, missing fields, missing sections); consumed by validator failure-path tests.
- **`commands/pipeline.md` modes table — new `--no-plan` row** — Documents the bypass flag and explicitly notes that COMPLEXA ignores it (override blocked).

### Changed

- **`agents/core/pipeline-controller.md` Phase 3 closure — new Step 3b-post (TRACE.md emitter)** — After `final-validator` returns its GO/CONDITIONAL/NO-GO verdict and BEFORE `finishing-branch`, the controller now reads `gate-decisions.jsonl`, `confidence-score.yaml`, the per-phase agent docs, and `references/pipelines/<variant>.md`, then emits a single consolidated `TRACE.md` to `<repo-root>/.pipeline-orchestrator/runs/<run-id>/TRACE.md` (default) or `~/.claude/data/pipeline-orchestrator/runs/<run-id>/TRACE.md` (when `pipeline-orchestrator.persist_runs: 'private'` is set). The controller opens an `edit-guard` exec-window before the cross-tree Write per the F-001 cooperative-authorization pattern, then closes it. Verification step re-reads the path to confirm `trace_schema_version: 1` is present before continuing to finishing-branch.
- **`commands/pipeline.md` Phase 1.5 trigger condition** — Extended from `complexity == COMPLEXA` to `complexity ∈ {MEDIA, COMPLEXA} AND --no-plan ausente`. The block now includes a 3×3 truth table covering SIMPLES / MEDIA / COMPLEXA against (no flag / `--no-plan` / `--plan`).
- **`designs/pipeline-orchestrator-v5-consolidated.md` §8 Critério #6 prose** — Corrected to remove the contradiction flagged in `docs/v5-readiness-report.md` §1 (which said "verify in design before implementing"). The corrected text now states explicitly that COMPLEXA always runs plan-architect; `--no-plan` is accepted by the parser but ignored at COMPLEXA, with the flag and justification logged in TRACE.md for audit. Rationale is preserved: COMPLEXA tasks are scope-driven and bypassing planning at this level historically correlates with regressions.
- **`tests/unit/spec-entry-point-and-pipelines.test.js:231`** — Pin bumped from `4.16.0` to `4.17.0` (release-admin chore, not a content invariant).
- **`docs/v5-readiness-report.md`** — Regenerated. Criteria #2 / #3 / #6 advance from PARTIAL/PENDING to DONE. §4 recommended path collapses from "Wave 8 + tag rc.1" to "tag rc.1".

### v5.0 DoD progress (this wave + the post-tag administrative milestone close 4 of 7 criteria)

- DoD #2 (TRACE.md by default) → DONE in this release.
- DoD #3 (TRACE.md attachable to PR via standalone validator) → DONE in this release.
- DoD #6 (plan-mode auto-triggers on MEDIA/COMPLEXA + `--no-plan` bypass) → DONE in this release.
- DoD #5 (v5.1 milestone published) → DONE post-tag via [milestone #1 — v5.1 Pipeline Declarativo (Slice 5)](https://github.com/fernandoxavier02/Pipeline-Orchestrator/milestone/1) (target Q3 2026, due 2026-09-30) with 3 placeholder issues: [#16 YAML grammar prototype](https://github.com/fernandoxavier02/Pipeline-Orchestrator/issues/16), [#17 dispatch table design](https://github.com/fernandoxavier02/Pipeline-Orchestrator/issues/17), [#18 interpreter spike](https://github.com/fernandoxavier02/Pipeline-Orchestrator/issues/18).

DoD #1, #4, #7 were already DONE pre-wave. **All 7 criteria DONE; v5.0.0-rc.1 unblocked.**

### Behavior Changes

- **MEDIA tasks now trigger plan-architect by default** (additive, opt-out via `--no-plan`). Pre-v4.17.0, only COMPLEXA triggered plan-architect; MEDIA was a SKIP. To preserve v4.16.0 behavior on a MEDIA task, pass `--no-plan` explicitly — the user will be asked for a justification that lands in `TRACE.md`.
- **Default behavior preserved EXACTLY** for SIMPLES (no plan, ever) and COMPLEXA (always plan; `--no-plan` is logged but does not bypass). The change is scoped to the MEDIA × no-flag cell of the truth table.

### Iron Laws Respected

- Gate registry untouched at 22 entries in `references/gates.md`.
- Sentinel checkpoints (5 mandatory, defined in `references/sentinel-integration.md`) untouched.
- Agent dispatch namespace untouched (no agents added, removed, or renamed).
- v5.0.0 NOT bumped; this remains a v4.x release.
- 11 outstanding deferred debts (10 Wave 3 MEDIUM → v4.13.1; ARCH-WAVE6-1 → v4.14.1) UNTOUCHED.
- TRACE.md path is `.pipeline-orchestrator/runs/` (in user repo), explicitly NOT `.pipeline/`.

### Self-hosted dogfood findings

- `sentinel-hook.cjs` discovers `sentinel-state.json` via `process.cwd()/.pipeline/docs/`. When Claude Code is launched from a parent directory rather than the plugin repo root, no candidate path resolves and non-bootstrap sub-agent spawns are blocked. Mitigation in v4.17.0 development: pivot to controller-direct edits (preserving TDD discipline). Long-term fix: `v5.0.0-rc.1` will add a `CLAUDE_PROJECT_ROOT` env-var fallback and/or marker-file discovery.
- `commands/pipeline.md` regex audit-test had a `\Z` anchor that JavaScript regex silently treats as literal `Z`. Bug found because Phase 3 closure UX text contains "ZERO context"; fixed to use explicit slice + H2 boundary search. Same gotcha may appear in other audit-style tests; flagged for retro.

## [4.16.0] - 2026-05-06

**Minor release WAVE 8-PRE / ISSUE #11 — REAL-MODE COMPAT RUNNER**. Closes Issue #11 by reimplementing `tests/compat/runner.cjs::executeReal()` from stub to working real-mode CI harness, using the `PreToolUse` hook contract that became available in Claude Code v2.1.85+ (`permissionDecision: "allow"` + `updatedInput.answers` to satisfy `AskUserQuestion` in headless mode). The previously documented `--ci-auto-confirm` workaround in `designs/slice-0/SPIKE-CI-HARNESS.md` is no longer needed; SPIKE status updated 🟠 PARTIAL PASS → 🟢 PASS. **Iron Law respected**: only `tests/compat/`, `tests/unit/`, `.github/workflows/`, `designs/`, `CHANGELOG.md`, `.claude-plugin/plugin.json` modified. ZERO changes to `agents/`, `skills/`, `references/`, `commands/`, `hooks/` (the plugin core remains untouched, including the v4 controller architecture and the 22-gate registry). Suite stays GREEN: 129 unit + 8 NEW unit (compat-runner-real) + 12 integration + 5 PASS / 1 SKIPPED compat + 8 hooks syntax (exit 0). Real-mode runner is opt-in via `vars.CLAUDE_CLI_AVAILABLE=true` + `secrets.ANTHROPIC_API_KEY` — default PR gate stays mock-mode (zero API spend, deterministic).

### Added

- **`tests/compat/auto-answer-hook.cjs` (NEW)** — generic PreToolUse auto-answer hook for compat regression. Reads `PreToolUse` payload from stdin; for each `AskUserQuestion` question, picks `options[0].label` as default (the "Recomendado" convention from `CLAUDE.md` regra mestra) or applies a header-keyed override from `tests/compat/v4-baseline/answers-overrides.json`. Emits the official `permissionDecision: "allow"` + `updatedInput.questions` echo + `updatedInput.answers` map shape required by Claude Code v2.1.85+ (verified against `code.claude.com/docs/en/hooks` "PreToolUse decision control" 2026-05-06). Defensive fall-throughs: non-AskUserQuestion tools → `{ continue: true }` no-op; empty stdin → `{ continue: true }`; multiSelect=true → comma-separated labels (validated against options before commit); empty options array → null answer with stderr warning; override label not in options → fallback to default + stderr warning. Module-exported (buildResponse, pickAnswer, loadOverrides) for unit tests; only auto-runs when invoked directly.
- **`tests/compat/v4-baseline/answers-overrides.json` (NEW)** — JSON map `{ "<header>": "<label>" }` for overriding the default first-option-pick on specific gates. Initially contains only a `_doc` key (stripped at runtime by the hook) describing two example overrides for future fixtures (`Adversarial: "Skip"` for ux-fixture, `Closeout: "Keep uncommitted"` for hotfix). bugfix-fixture (the only real-mode smoke scenario in CI as of v4.16.0) needs no overrides.
- **`tests/unit/compat-runner-real.test.js` (NEW, 9 tests)** — node:test suite. 8 hook tests run ALWAYS (no claude CLI required): default first-option pick; multi-question payload; valid override replaces default; invalid-label override falls back + warns; multiSelect comma-join; non-AskUserQuestion pass-through; empty options → null answer + warns; empty stdin → continue:true. 1 real-mode runner test runs only when `claude --version` succeeds (otherwise `it.skip()`); it invokes `runner.cjs --scenario=bugfix-fixture` and logs the result for inspection. Real-mode test does NOT hard-assert exit 0 because LLM determinism is a known risk (Issue #11 §Risks) — it asserts only that exit ≠ 2 (config error). CI gate is the workflow itself, not this test.

### Changed

- **`tests/compat/runner.cjs`** — `executeReal()` reimplemented (lines 213-227 of v4.15.0 stub replaced with full implementation, ~150 lines net add). Spawns `claude -p "<input.md>" --settings <tmp> --output-format stream-json --include-partial-messages --permission-mode bypassPermissions --allowedTools "Read Glob Grep Write Edit AskUserQuestion Task"` via `spawnSync` with 90s timeout + SIGKILL. Tmp settings.json created via `fs.mkdtempSync(os.tmpdir())` wires our hook under matcher `AskUserQuestion`. Stream-json parser extracts: `system/init` events (agent roster), `assistant` events with `tool_use` blocks named `Task` (sub-agent spawns) and `Write|Edit` blocks under PIPELINE_DOC_PATH (artifact tracking), and `result` events (verdict + classification regex scan). Best-effort gate recovery from latest `.pipeline/docs/Pre-*-action/<session>/gate-decisions.jsonl` post-run (stream-json text scan can't reliably reconstruct gate hardness/decision tuples). Cleanup: tmp settings deleted in `finally`; PIPELINE_DOC_PATH preserved for forensics. New module exports (`parseStreamJson`, `writeTmpSettings`, `executeReal`, `recoverGatesFromArtifact`) for unit tests.
- **`.github/workflows/compat-regression.yml`** — split into 2 jobs. `compat-regression-mock` (always runs, 6min timeout, gate of PR — same as v4.15.0). NEW `compat-regression-real` (opt-in via `if: vars.CLAUDE_CLI_AVAILABLE == 'true'`, 8min timeout, depends on `compat-regression-mock` PASS). Real job installs `@anthropic-ai/claude-code` globally, uses `secrets.ANTHROPIC_API_KEY`, runs `--scenario=bugfix-fixture` on PR triggers (~$0.50-1, ~60-90s) or `--all` on `workflow_dispatch` (~$3-5, ~5-10min). Failure comments document the 3 most likely causes (pipeline drift / hook protocol drift / LLM flake). Real-mode artifacts uploaded as `compat-results-real-${{ github.run_id }}` separate from mock artifacts.
- **`designs/slice-0/SPIKE-CI-HARNESS.md`** — status header changed from 🟠 PARTIAL PASS to 🟢 PASS. Added 2026-05-06 adendum explaining: (a) Anthropic v2.1.85 added the auto-answer-via-hook capability, (b) we adopt this without `--ci-auto-confirm` (which never landed and is no longer needed), (c) hybrid path (mock PR gate + real opt-in smoke + release dispatch full) realized. §2.1, §2.2, §2.3, §3.1, §3.2, §5 (DoD checklist), and §6 (verdict) all updated to reflect realized state. Historical content (§1, §3.3 smoke manual, §4 nightly drift detection backlog) preserved.
- **`.claude-plugin/plugin.json`** — version `4.15.0` → `4.16.0`; description prepended with the v4.16.0 summary line.

### Backward Compatibility

- 100% additive at the plugin runtime layer. Mock-mode PR gate behavior is unchanged: same `runner.cjs --all --mock` command, same 5/5 PASS / 1 SKIPPED outcome, same exit codes. Real-mode is opt-in via repo variable + secret — without those, the new `compat-regression-real` job is skipped silently (CI green).
- Hook script is test infrastructure under `tests/compat/`, NOT part of plugin distribution. Production users of the plugin never load this hook (it is invoked only by `runner.cjs` when writing tmp settings). Plugin behavior in real `claude` sessions is identical pre/post v4.16.0.
- No frontmatter, no agent contract, no SKILL.md sequence, no gate registry entry, and no JSONL schema is changed.
- Pre-existing test counts grow: 129 unit + 8 NEW unit (`compat-runner-real.test.js` hook tests) + 1 conditional unit (real-mode runner test, skipped when CLI absent) = 137 unit nominal / 138 max. Integration unchanged at 12. Compat unchanged at 5 PASS / 1 SKIPPED.

### Constraints respected (cirurgical scope)

- **`agents/`**: untouched.
- **`skills/`**: untouched.
- **`references/`**: untouched.
- **`commands/`**: untouched.
- **`hooks/`** (plugin core, `.claude/hooks/`, `tests/compat/auto-answer-hook.cjs` is NOT plugin core): untouched.
- Modified surfaces: `tests/compat/auto-answer-hook.cjs` (NEW), `tests/compat/v4-baseline/answers-overrides.json` (NEW), `tests/compat/runner.cjs` (modify), `tests/unit/compat-runner-real.test.js` (NEW), `.github/workflows/compat-regression.yml` (modify), `designs/slice-0/SPIKE-CI-HARNESS.md` (modify), `CHANGELOG.md` (this section), `.claude-plugin/plugin.json` (version bump).

### v5.0 DoD progress (Issue #11 was the last 5%)

`docs/v5-readiness-report.md` §2 listed Issue #11 as the gating step before Wave 8 (TRACE.md + plan-mode auto-trigger). With Issue #11 closed, DoD criterion #5 ("5 baselines compat reais running in CI") moves from PARTIAL to **PARTIAL+** — 1 of 5 fixtures (bugfix-fixture) is wired for real-mode CI under opt-in toggle. Graduating the other 4 (audit, feature, hotfix, ux) from REAL-mock-only to REAL-mock+real-CI is a follow-up backlog item (each requires a real-mode capture session against the live LLM to confirm the v4.10.0 baselines still match — cheap, ~$3-5 total). Wave 8 (TRACE.md + plan-mode auto-trigger) is now the next gate to v5.0.0-rc.1.

### Pipeline-driven (dogfood)

v4.16.0 was scoped via `/pipeline-orchestrator:pipeline` itself (Feature, MEDIA, `implement-light` variant, 3 batches: A hook+overrides, B runner+workflow, C tests+spike+release). Phase 0 hit `INFO_GATE_BLOCKED` (HARD) at the start because the PreToolUse + AskUserQuestion contract was not in local docs; main LLM resolved via WebFetch from `code.claude.com/docs/en/hooks` and re-dispatched the controller. Phase 1.5 plan was generated inline (controller, not plan-architect N2 — escopo bem definido pós-resolução de gap). Phase 2 batches each opened a 60-min exec-window for tests/compat/ + tests/unit/ + .github/ writes; per-batch adversarial gate SKIPPED (domain = test-infra, no auth/crypto/data-model/payment touched). Phase 3 sanity: 8 hook unit tests PASS by construction (asserted shape against confirmed schema); mock-mode regression suite untouched (still 5/5 PASS); real-mode runner test skipped in this dogfood session because we did NOT execute `claude -p` from inside the controller (would require nested CLI which is out of scope). Final adversarial gate offered and DECLINED (test-infra domain, opt-out per regra mestra). Final-validator: GO (all build/test invariants preserved; new code is additive; SPIKE downgraded from PARTIAL to PASS). Closeout: keep uncommitted (Iron Law allows; user can git diff before commit/push).

### Known debt — unaffected by this release

- **`v4.13.1`** — 10 MEDIUM findings from Wave 3. Not blocking v5.0; not affected by `v4.16.0`.
- **`v4.14.1`** — `ARCH-WAVE6-1` test-helper duplication. Not blocking v5.0; not affected by `v4.16.0`.

### v5.0 dependency forwarded

Wave 8 (TRACE.md schema + writer + validator + plan-mode auto-trigger + `--no-plan` bypass) remains the next blocker between current main and `v5.0.0-rc.1`. See `docs/v5-readiness-report.md` §4.

---

## [4.15.0] - 2026-05-06

**Minor release WAVE 7-SPEC — V4-TO-V5 MIGRATION DOC + V5 READINESS REPORT**. Pure documentation release that consolidates the v4.0 → v4.14 lineage into a single migration guide and produces an explicit, third-party-verifiable readiness report against the 7-criterion Definition of Done for v5.0 (`designs/pipeline-orchestrator-v5-consolidated.md` §8). No agent / skill / reference / command / hook / test surface is touched. Suite stays GREEN at the v4.14.0 levels: 129 unit + 12 integration + 5 PASS / 1 SKIPPED compat + 8 hooks syntax (exit 0). **Iron Law respected**: ZERO changes to `agents/`, `skills/`, `references/`, `commands/`, `hooks/`, or `tests/`.

### Added

- **`docs/MIGRATION-v4-to-v5.md` (NEW, ~250 lines, 10 sections)** — consolidated migration guide spanning the full v4 lineage. §1 motivation; §2 lineage table v4.0 → v4.14 (one line per release); §3 13 accumulated breaking changes since v3 → v4 (still relevant in v5 prep); §4 upgrade procedure (standard, cold-start, custom paths, no settings change); §5 FQDN mapping for the 4 namespace corrections from `4.9.0` (old `pipeline-orchestrator:quality:adversarial-*` → new `pipeline-orchestrator:executor:type-specific:adversarial-*`); §6 DoD v5.0 status (3 DONE, 2 PARTIAL, 2 OPEN); §7 compatibility matrix for FX Studio / Pulsar / custom forks; §8 what v5.0 will and will NOT change; §9 rollback; §10 forward-deferred items.
- **`docs/v5-readiness-report.md` (NEW, ~150 lines, 6 sections + TL;DR)** — short readiness snapshot anchored at `v4.15.0`. §1 the 7-criterion table with verification methods + status + evidence; §2 gap analysis with concrete close-out steps for the 4 non-DONE criteria; §3 explicit list of items NOT blocking v5.0 (so contributors don't waste time on them); §4 recommended path to v5.0 in 3 sequential steps (Issue #11 → Wave 8 (TRACE.md + plan-mode auto-trigger) → tag v5.0.0-rc.1 → v5.0.0); §5 risk register; §6 expiry conditions for the report itself.

### Changed

- **`.claude-plugin/plugin.json`** — version `4.14.0` → `4.15.0`; description prepended with the v4.15.0 summary line.
- **`README.md`** — index linkage to the new `docs/MIGRATION-v4-to-v5.md` added where the file already references `docs/MIGRATION-v3-to-v4.md` (the v4 Breaking Changes section).

### Backward Compatibility

- 100% additive. No existing file is renamed, removed, or restructured. The two new docs cross-reference each other and the existing `docs/MIGRATION-v3-to-v4.md`; no other markdown file gains or loses a link.
- Pre-existing test counts preserved as upper-bound guarantees: 129 unit + 12 integration + 5 PASS / 1 SKIPPED compat + 8 hooks syntax (none of those surfaces is touched). Suite still exits 0.
- No frontmatter, no agent contract, no SKILL.md sequence, no gate registry entry, and no JSONL schema is changed.

### Constraints respected (cirurgical scope)

- **`agents/`**: untouched.
- **`skills/`**: untouched.
- **`references/`**: untouched.
- **`commands/`**: untouched.
- **`hooks/`**: untouched.
- **`tests/`**: untouched.
- Modified surfaces: only new files under `docs/`, plus version + description bump in `.claude-plugin/plugin.json`, plus 1 link addition in `README.md`, plus this `CHANGELOG.md` section.

### Pipeline-driven (dogfood)

Wave 7-spec was scoped via `/pipeline-orchestrator:pipeline` itself with `PRE_CLASSIFIED_TYPE=Feature` + `complexity=MEDIA` (docs-only Feature variant). 4-batch plan: A (`docs/MIGRATION-v4-to-v5.md`), B (`docs/v5-readiness-report.md`), C (`CHANGELOG.md` + `plugin.json`), D (`README.md` link + closure sanity). Per-batch adversarial gate was SKIPPED (docs-only, no auth/crypto/data-model/payment touched). Final adversarial gate was offered and DECLINED (matches the v4.14.0 dogfood pattern documented in its CHANGELOG note). Sanity at close: no test surface touched (suite GREEN by construction); markdown link sanity check via Grep — no broken references.

### Known debt — unaffected by this release

The two patches queued before v5.0 are unchanged:

- **`v4.13.1`** — 10 MEDIUM findings from Wave 3 (Compat Baselines) review, scope: hook hardening + test isolation. Not blocking v5.0; not blocking by `v4.15.0`.
- **`v4.14.1`** — `ARCH-WAVE6-1` test-helper duplication (`shouldEscalate(attempt, batchChanged)` between Wave 5 and Wave 6 test files). Cleanup plan: extract to `tests/_helpers/adversarial-loop-rule.cjs`. Not blocking v5.0; not blocking by `v4.15.0`.

### v5.0 dependency forwarded

`v4.15.0` documents — but does not resolve — the 2 OPEN and 2 PARTIAL DoD criteria. Resolution path is Issue #11 (admin: open v5.1 milestone) followed by Wave 8 (TRACE.md schema + writer + validator + plan-mode auto-trigger + `--no-plan` bypass). Both are described in detail in `docs/v5-readiness-report.md` §2 and §4.

---

## [4.14.0] - 2026-05-06

**Minor release WAVE 6-SPEC — INTEGRATION TESTS + COMPAT FIXTURE + BAD-VARIANT FIXTURES**. Pure additive release that hardens the Wave 1–5 spec lifecycle stack (4 agents + 3 skill trees + 6 gates + mode_used persistence) with three layers of net: (a) an 8-scenario integration test suite covering the spec-format-gate → spec-content-reviewer → spec-post-impl-validator → spec-closer chain, gate hardness/recovery assertions, and ADVERSARIAL_LOOP_CHECKPOINT counter-reset semantics; (b) a TEMPLATE compat regression fixture (`spec-fixture`) staking out the spec-heavy observable contract for a future dogfooding session to populate with a real baseline; (c) three bad-variant spec fixtures under `tests/fixtures/specs/` (broken JSON, missing traceability, missing artifact) documenting the negative gate decisions spec-format-gate is contracted to emit. **Iron Law respected**: ZERO changes to `agents/`, `skills/`, `references/`, `commands/`, or `hooks/` — only `tests/`, `CHANGELOG.md`, `.claude-plugin/plugin.json` modified. Suite stays GREEN: 129 unit + 12 integration + 5 PASS / 1 SKIPPED compat (exit 0).

### Added

- **`tests/integration/spec-workflow-e2e.test.js` (NEW, 8 scenarios)** — integration test suite that asserts the observable contract of the spec-heavy pipeline chain by parsing live SSOT files (no JS imports of agent contracts, since agents are pure markdown). Covers: `SPEC_FORMAT_GATE_FAIL` is HARD in `references/gates.md` registry; `SPEC_CONTENT_REVIEW_NOGO` is HARD with precondition `format_gate_status ∈ {GO, GO-WARN}`; `SPEC_POST_IMPL_FAIL` is HARD when score < 75%; `spec-closer.md` mode_used mapping (`spec-heavy → full`, `spec-light → slim`, `spec-audit-only → audit`); `ADVERSARIAL_LOOP_CHECKPOINT` counter resets on `batch_changed=true` (per-batch escalation rule from v4.13.0 reused as a pure function). Suite total: 4 → 12 integration tests GREEN.
- **`tests/compat/v4-baseline/scenarios/spec-fixture/` (NEW, 2 files)** — TEMPLATE compat fixture for the spec-heavy full lifecycle. `input.md` describes a hypothetical `checkout-redesign` Kiro spec scenario (4 components, 12 ACs, 2 contracts, 1 data model → COMPLEXA + spec-heavy). `expected.yaml` documents the expected observable contract (5 spec-* gates + 8 cross-cutting gates, 21 agents per `references/pipelines/spec-heavy.md`, 17 artifacts including `spec.json` with `mode_used=full`, `verdict: GO`). `baseline_method` starts with "TEMPLATE" → runner.cjs lines 320-329 SKIP the scenario until a future dogfooding session captures a real baseline. No `mock-output.json` (TEMPLATE scenarios never reach `executeMock()`).
- **`tests/fixtures/specs/auth-flow-bad-yaml/` (NEW, 5 files)** — bad-variant fixture for `SPEC_FORMAT_GATE_FAIL` HARD with critical-artifact rule. requirements.md / design.md / tasks.md copied verbatim from `auth-flow-good/`. `spec.json` is **intentionally unparseable JSON** (unquoted key + missing closing brace) to force NO-GO via the spec-format-gate's invalid-JSON critical-artifact rule. `expected.yaml` documents `expected_gate: SPEC_FORMAT_GATE_FAIL`, `expected_hardness: HARD`, `expected_decision: NO-GO`.
- **`tests/fixtures/specs/auth-flow-no-traceability/` (NEW, 5 files)** — bad-variant fixture for `SPEC_FORMAT_GATE_FAIL` HARD via score ≤17 (NO-GO threshold). requirements.md / tasks.md / spec.json valid; design.md **intentionally stripped** of `Traces to:` references, Glossary section, component responsibilities, data model, and contracts sections — ≥8 of the 25 spec-format-gate checks expected to fail. `expected.yaml` documents the expected gate decision and the structural-completeness checks that fail.
- **`tests/fixtures/specs/auth-flow-missing-artifact/` (NEW, 4 files)** — bad-variant fixture for `SPEC_ARTIFACT_MISSING` MANDATORY (registry name verified against `references/gates.md` line 45). requirements.md / design.md / spec.json copied verbatim from `auth-flow-good/`; **tasks.md intentionally absent** — its absence triggers the MANDATORY gate that forces NO-GO before format scoring runs. `expected.yaml` documents `expected_gate: SPEC_ARTIFACT_MISSING`, `expected_hardness: MANDATORY`, `expected_decision: NO-GO`.

### Changed

- **`tests/unit/compat-baselines.test.js`** — line 107 regex relaxed from `/SKIPPED:\s+0/` to `/SKIPPED:\s+[01]/` with explanatory comment. The v4.10.0 test hard-coded "SKIPPED: 0" because the 5 fixtures had all graduated to REAL; adding the v4.14.0 spec-fixture in TEMPLATE state would otherwise break it. The test's stated invariant ("runner exits 0 naturally") still holds. The 5 v4.10.0 fixtures remain REAL (covered by the FIXTURES constant assertions in the same file). When a future PR graduates spec-fixture to REAL, this regex should be tightened back to `/SKIPPED:\s+0/`.
- **`.claude-plugin/plugin.json`** — version `4.13.0` → `4.14.0`; description prepended with v4.14.0 summary.

### Backward Compatibility

- All changes additive. No existing fixture, agent, skill, reference, command, or hook is modified. The 1-line edit to `tests/unit/compat-baselines.test.js` only relaxes one regex assertion (0 → 0 or 1) and is documented inline as v4.14.0-specific.
- Pre-existing test counts preserved as upper-bound guarantees: 129 unit (Batch A added the integration suite, not unit tests) + 5 hooks syntax + 8 hooks unit (tracked separately in some matrices) all unchanged.
- Integration suite: 4 (Wave 1 regression) → 12 tests (4 + 8 new spec-workflow-e2e scenarios).
- Compat suite: 5 PASS preserved + 1 new SKIPPED (spec-fixture TEMPLATE). Runner exits 0 naturally (SKIPPED with ≥1 PASS does not trigger exit 1, per runner.cjs lines 406-416).

### Constraints respected (cirurgical scope)

- **`agents/`**: untouched.
- **`skills/`**: untouched.
- **`references/`**: untouched. (Gate names cross-checked via `Grep` only — read-only verification.)
- **`commands/`**: untouched.
- **`hooks/`**: untouched.
- Modified surfaces: only new files under `tests/integration/`, `tests/compat/v4-baseline/scenarios/spec-fixture/`, `tests/fixtures/specs/auth-flow-{bad-yaml,no-traceability,missing-artifact}/`, plus 1 surgical edit in `tests/unit/compat-baselines.test.js` and version + description bump in `.claude-plugin/plugin.json` and this `CHANGELOG.md` section.

### Pipeline-driven (dogfood, degraded-mode)

Wave 6-spec was scoped via `/pipeline-orchestrator:pipeline` itself (COMPLEXA, `implement-heavy` variant, 4 batches: A integration tests, B compat fixture, C bad-variant fixtures, D release closure). Per-batch adversarial gate was SKIPPED by user choice (final-only cadence agreed at gate plan); checkpoint-validator ran after each batch. **Degraded-mode caveat**: this session ran with hooks not registered (controller used absolute paths and wrote sentinel/gate state defensively). Batch C's checkpoint surfaced one regression (`tests/unit/compat-baselines.test.js` line 107 hard-coded `SKIPPED: 0`) — fixed surgically with 1 regex relax inside the allowed `tests/unit/` surface, re-validated GREEN. Suite at close: 129 unit + 12 integration + 5 PASS / 1 SKIPPED compat, all exit 0.

### Known debt — deferred to v4.14.1

- **ARCH-WAVE6-1 (final adversarial finding, IMPORTANT, deferred):** `shouldEscalate(attempt, batchChanged)` helper is now duplicated between `tests/integration/spec-workflow-e2e.test.js` (Wave 6) and `tests/unit/spec-gates-and-mode-persistence.test.js` line 172 (Wave 5). Both copies encode the same per-batch escalation rule from `references/gates.md`. No JS-level single home — drift risk if the rule changes. Cleanup plan: extract to `tests/_helpers/adversarial-loop-rule.cjs`, both tests import. Tracked as patch v4.14.1.

---

## [4.13.0] - 2026-05-05

**Minor release WAVE 5-SPEC — GATES INVARIANTS & MODE PERSISTENCE**. Closes the ARCH-1 drift identified in the v4.11.0 adversarial review: the 6 spec gates that `pipeline-controller.md` declared via Inline Invariants were not in the `references/gates.md` Registry, leaving SSOT incoherent. This release reconciles both surfaces, extends the Inline Invariants list from 15 to 21 gate names (full registry now 22 entries), adds a Spec row to the Pipeline Routing Matrix in `references/complexity-matrix.md`, declares the optional `mode_used` field (`slim` | `full` | `audit`) in `references/spec-context-schema.md`, and wires `spec-closer.md` to write that field to `spec.json` based on `pipeline_variant`. **Backward compatible**: all changes additive; pre-v4.13.0 specs lack `mode_used` and that absence triggers no gate.

### Added

- **6 spec gates in `references/gates.md`** Registry: `SPEC_ARTIFACT_MISSING` (MANDATORY), `SPEC_FORMAT_GATE_FAIL`, `SPEC_CONTENT_REVIEW_NOGO`, `SPEC_AC_TRACEABILITY_GAP`, `SPEC_POST_IMPL_FAIL` (HARD), `ADVERSARIAL_LOOP_CHECKPOINT` (SOFT-with-escalation, per-batch counter scope). Registry table grew from 16 to 22 entries.
- **Inline Invariants in `commands/pipeline.md`** updated to include the 6 new gates: list grew from 15 to 21 names; full registry prose updated to "22-gate table".
- **Pipeline Routing Matrix in `references/complexity-matrix.md`**: new row for `type=Spec` mapping to `spec-light` (MEDIA) and `spec-heavy` (COMPLEXA), with note clarifying `spec-audit-only` is phase-triggered (tasks 100% complete + `spec.json.phase != "closed"`).
- **`mode_used` field in `spec.json`** declared in `references/spec-context-schema.md` (optional; values: `slim` | `full` | `audit`; written by spec-closer at closure time).
- **`agents/executor/spec-closer.md`** writes `mode_used` to `spec.json` based on `pipeline_variant` (`spec-light` → `slim`, `spec-heavy` → `full`, `spec-audit-only` → `audit`). Throws `ERR_UNKNOWN_VARIANT` on unknown variants in v4.13.0+ closes (defensive).
- **`tests/unit/spec-gates-and-mode-persistence.test.js` (NEW, 16 tests)** — covers: gate hardness/recovery lookup against the 22-gate registry; per-batch escalation rule for `ADVERSARIAL_LOOP_CHECKPOINT` (every-3 cadence; counter resets on `batch_changed=true`); inline-invariants subset baseline (every v4.12.0 gate preserved in v4.13.0; the 6 new gates are absent in v4.12.0); variant → mode mapping (3 happy + 2 defensive). Suite total: 113 → 129 GREEN.

### Changed

- **ARCH-1 drift closed**: `pipeline-controller.md` Inline Invariants and `references/gates.md` Registry are now in sync for spec gates. The drift was originally surfaced in the v4.11.0 adversarial review as a SSOT incoherence (Inline Invariants listed 6 spec gates the Registry table did not document).
- **CONSENSUS-1 drift closed (final adversarial)**: `commands/pipeline.md` inline gate list extended from 21 → 22 to include `COMPLEXITY_GATE` (SOFT). The gate was always present in `references/gates.md` but had been omitted from the inline list per a pre-existing convention; that convention is now retired so inline (22) equals registry (22). `tests/unit/spec-gates-and-mode-persistence.test.js` Scenario 3b updated from `=== 21` to `=== 22`; v4.12.0 baseline frozen at 15. Suite stays at 129/129 GREEN.
- **CONSENSUS-2 contract gap closed (final adversarial)**: `agents/executor/spec-closer.md` INPUTS block now declares `pipeline_variant` (required for v4.13.0+ closes), with cross-reference to the MODE PERSISTENCE section that consumes it. Closes the gap where MODE PERSISTENCE referenced an INPUT field the contract did not declare.

### Backward Compatibility

- All changes additive. Specs created before v4.13.0 lack the `mode_used` field — that absence is **expected** and triggers no gate. No migration required.
- Pre-existing 113 unit tests + 5 compat baselines unchanged. Suite total: 129 GREEN.
- Non-spec pipeline behavior unchanged (the new Spec routing row only activates when `type=Spec`).

### Constraints respected (cirurgical scope)

- Only `agents/executor/spec-closer.md` modified in `agents/`. All other agent files untouched.
- `skills/`, `references/pipelines/`, `references/audit-trail.md`, and `skills/spec/SKILL.md` untouched.
- Documentation surfaces touched: `references/gates.md`, `commands/pipeline.md`, `references/complexity-matrix.md`, `references/spec-context-schema.md`, `CHANGELOG.md`, `CLAUDE.md`, `.claude-plugin/plugin.json`.

### Pipeline-driven (dogfood)

Wave 5-spec was scoped via `/pipeline-orchestrator:pipeline` itself. COMPLEXA, `implement-heavy` variant, 5 batches (A: gates registry; B: Inline Invariants list; C: complexity-matrix routing row; D: spec-closer mode_used wiring; E: release admin). Batches A–C CLEAN no fix loops. Batch D fix loop applied (1 round) per adversarial review. 16/16 new tests + 113/113 pre-existing tests GREEN at sanity.

---

## [4.12.0] - 2026-05-05

**Minor release WAVE 4-SPEC — `/spec` THIN ENTRY-POINT + 3 PIPELINE COMPOSITION REFS**. Adds the manual-only `skills/spec/SKILL.md` entry-point so users who already know their input is a Kiro spec can short-circuit type-detection (mirrors the v4.3.0+ pattern set by `skills/bugfix`, `skills/audit`, `skills/feature`). Three new pipeline composition reflexes (`references/pipelines/spec-light.md`, `spec-heavy.md`, `spec-audit-only.md`) document team composition + step-by-step flow with 1:1 fidelity to their backing SKILL.md `sequence_lock` — drift is caught by a new cross-ref test. **Purely additive — zero behavior change for `/pipeline-orchestrator:pipeline` or any existing entry-point.**

### Added

- **`skills/spec/SKILL.md`** — thin manual-only entry-point with `disable-model-invocation: true`. Inspects `$ARGUMENTS` for `--light` / `--heavy` / `--audit-only` flags; with a flag, dispatches `Skill(skill: "pipeline-orchestrator:spec-{variant}")` directly. Without a flag, delegates to `pipeline-controller` prefixed with `PRE_CLASSIFIED_TYPE=Spec\n\n`, letting the Wave 3-spec 4-signal classifier pick the variant.
- **`references/pipelines/spec-light.md`** — team composition + 6-step flow matching `skills/spec-light/SKILL.md` `sequence: [1..6]` with 4 `**[GATE]**` markers matching `gates_at: [1,2,3,4]`.
- **`references/pipelines/spec-heavy.md`** — team composition + 9-step flow matching `skills/spec-heavy/SKILL.md` `sequence: [1..9]` with 5 `**[GATE]**` markers matching `gates_at: [1,2,3,4,5]`.
- **`references/pipelines/spec-audit-only.md`** — team composition + 5-step flow matching `skills/spec-audit-only/SKILL.md` `sequence: [1..5]` with 3 `**[GATE]**` markers matching `gates_at: [1,2,3]`. Documents the read-only Iron Law (no production writes outside spec artifacts).
- **`tests/unit/spec-entry-point-and-pipelines.test.js` (NEW, 10 tests)** — happy path (skills/spec/SKILL.md frontmatter + flag-routing prose); 6 cross-ref tests (per variant: step count = SKILL.md sequence length; gate count = SKILL.md gates_at length); edge test (each pipeline ref points to its matching backing skill); regression test (skills/bugfix, skills/audit, skills/feature, commands/pipeline.md still exist); version test (plugin.json bumped to 4.12.0). Suite 103 → 113 GREEN.

### Changed

- **`.claude-plugin/plugin.json`** — version `4.11.0` → `4.12.0`; description updated with v4.12.0 entry.
- **`CLAUDE.md`** — version lineage extended with `v4.11.0 → v4.12.0 (Wave 4-spec — /spec thin entry-point + 3 pipeline composition refs)`.

### Backward Compatibility

`/pipeline-orchestrator:pipeline` (full classifier) is unchanged. Existing entry-points (`skills/bugfix`, `skills/audit`, `skills/feature`) and their backing variant skills are untouched. The 3 `skills/spec-{light,heavy,audit-only}/` skill trees from Wave 2 are not modified — the new pipeline composition refs read them as SSOT.

### Constraints respected (cirurgical scope)

- No changes to `agents/`
- No changes to `skills/spec-light/`, `skills/spec-heavy/`, `skills/spec-audit-only/`
- No changes to `references/gates.md`
- No changes to `commands/pipeline.md`
- TDD: 1 happy + 1 edge + 1 regression (plus 6 cross-ref + 1 version = 10 total)
- Compat regression preserved (5/5 PASS unchanged)

### Pipeline-driven (dogfood)

Wave 4-spec was scoped via `/pipeline-orchestrator:pipeline` itself (Phase 0 task-orchestrator surfaced GAP-1 about `commands/spec.md` vs `skills/spec/SKILL.md` path; user resolved in favor of canonical `skills/` path). MEDIA complexity, feature-light variant. 0 fix loops, 0 adversarial findings, 113/113 unit + 5/5 compat green at sanity.

---

## [4.11.0] - 2026-05-05

**Minor release WAVE 3-SPEC — SPEC CLASSIFIER ROUTING**. Wires `type=Spec` as a first-class 6th task type into the 4 core pipeline agents (task-orchestrator + pipeline-controller + sentinel + quality-gate-router) so the 3 spec skill trees from Wave 2 (`spec-light`, `spec-heavy`, `spec-audit-only`) become reachable from the main `/pipeline` entry-point. Backward compat MANDATORY: non-spec pipelines route identically to v4.10.0 (regression tests catch drift).

### Added

- **`agents/core/task-orchestrator.md`** — 6th task type `Spec` added to CLASSIFICATION TABLE; new section "TYPE=SPEC DETECTION (4-signal pipeline, v4.11.0+)" documenting Signal 1 (explicit path), Signal 2 (`--type=spec` flag), Signal 3 (prose regex `/valida.*spec|implementa.*spec|fech[ae].*spec/i` with AskUserQuestion confirmation), Signal 4 (glob fallback with picker). `<spec_path>` resolution: read `pipeline.local.md` `spec_path` field (default `.kiro/specs/`, fallbacks `specs/` → `docs/specs/`).
- **`spec_context` block in ORCHESTRATOR_DECISION YAML** — emitted when `type=Spec` with fields: `feature_name`, `spec_path`, `artifacts.{requirements,design,tasks,spec_json}`, `variant`, `acceptance_criteria`. Schema: `references/spec-context-schema.md`.
- **`agents/core/pipeline-controller.md`** — spec dispatch block in Phase 2 mirroring bugfix pattern; when `pipeline_variant.startsWith("spec-")`, invoke `Skill(skill: "pipeline-orchestrator:<variant>")` passing `spec_context` through untouched. Routing discriminator is the variant string (not type field). State update before spawn (v4.8.0 hook contract): `current_skill` + `current_step` populated in sentinel-state.json before Agent dispatch.
- **`agents/core/sentinel.md`** — 5 spec pipeline checkpoints (`SPEC_DISCOVERY_CHECK`, `SPEC_FORMAT_PASSED`, `SPEC_CONTENT_REVIEW_DONE`, `LOOP_STATE_CONSISTENT (post_phase_2_to_3_spec)`, `SPEC_GRADE_CALCULABLE`) all guarded on `pipeline_variant.startsWith("spec-")` (D5). Phase_2_to_3 + spec variant uses spec override that validates tasks.md `[x]` completion.
- **`agents/quality/quality-gate-router.md`** — Step 1a SPEC MODE branch: when `spec_context.acceptance_criteria` is non-empty, generate 1 GIVEN/WHEN/THEN scenario per AC (traceable to `AC#1`, `AC#2`, ...). EARS form preserved verbatim; bullet form best-effort normalized with warning `"AC#N normalized from non-EARS source"`. Empty/null guard prevents fabrication.
- **`spec_context_scenarios` sub-field in QUALITY_GATE_APPROVED output** — records spec_mode flag, acs_covered list, bullet_normalized ids, normalization warnings.
- **`tests/unit/spec-classifier-detection.test.js` (NEW, 9 tests)** — guards 4-signal detection, D1 fallback, D2 collapse, ERR_SPEC_PATH_NOT_FOUND defensive throw, regression non-spec prose, PROSE_REGEX semantics.
- **`tests/unit/spec-routing-dispatch.test.js` (NEW, 5 tests)** — guards spec-* skill dispatch, audit-light/bugfix-light pass-through unchanged, variant-discriminates-not-type rule.
- **`tests/unit/spec-sentinel-checkpoints.test.js` (NEW, 5 tests)** — guards spec-only checkpoint activation, non-spec guard skip, phase_2_to_3 spec override, SSOT freeze.
- **`tests/unit/spec-ac-scenario-generation.test.js` (NEW, 5 tests)** — guards EARS preservation, bullet normalization with warning, empty/null/undefined defensive returns.

### Changed

- **`pipeline_variant` enum extended** — adds `spec-light`, `spec-heavy`, `spec-audit-only` (task-orchestrator ORCHESTRATOR_DECISION + pipeline-controller dispatch).
- **`FORCE_VARIANT` valid values extended** — adds `spec-light`, `spec-heavy`, `spec-audit-only` (D3 override pattern, parallel to existing light/heavy/feature-light/feature-heavy).
- **`pipeline-controller` Inline Invariants gate list** — adds 6 new spec gates: `SPEC_ARTIFACT_MISSING` (MANDATORY); `SPEC_FORMAT_GATE_FAIL`, `SPEC_CONTENT_REVIEW_NOGO`, `SPEC_AC_TRACEABILITY_GAP`, `SPEC_POST_IMPL_FAIL` (HARD); `ADVERSARIAL_LOOP_CHECKPOINT` (SOFT).
- **`agents/quality/quality-gate-router.md` TEST MINIMUMS table** — adds Spec row: "1 per AC (minimum) + 2 regression + 2 edge cases".
- **`references/audit-trail.md`** — appends new section "Verdict vs Gate Decision Vocabulary" disambiguating `final-validator` GO/CONDITIONAL/NO-GO (terminal verdict) from gate decisions PASS/FAIL/SKIPPED/RESOLVED/APPROVED/BLOCKED/STOPPED/RESET. Cross-reference table per producer. Note: `spec-closer.spec_grade` is COSMETIC, never replaces final-validator verdict.
- **`.claude-plugin/plugin.json`** — version 4.10.0 → 4.11.0; description prepended with Wave 3-spec summary.

### Notes

- **Backward compat invariant.** Non-spec pipelines (bugfix-*, implement-*, user-story-*, audit-*, ux-sim-*, DIRETO) route EXACTLY as v4.10.0. The dispatch block, sentinel checkpoints, and quality-gate-router branch all guard on `pipeline_variant.startsWith("spec-")` or `acceptance_criteria` non-empty respectively. Regression tests #3 (Bug Fix), #7 (audit-light pass-through), #8 (bugfix-light pass-through) catch drift.
- **Constraint compliance.** Wave 3-spec touches ONLY: 4 core agents (task-orchestrator + pipeline-controller + sentinel + quality-gate-router), 1 reference doc (audit-trail.md), 1 plugin config (plugin.json), 2 doc files (CHANGELOG.md + CLAUDE.md), and 4 new test files. ZERO changes to Wave 1 spec lifecycle agents (spec-format-gate, spec-content-reviewer, spec-post-impl-validator, spec-closer). ZERO changes to Wave 2 spec skill trees (skills/spec-light, skills/spec-heavy, skills/spec-audit-only). ZERO changes to commands/pipeline.md (Wave 5-spec scope).
- **Smoke fixture.** `.kiro/specs/test-spec-routing/` created as a working-state smoke test input (gitignored per CLAUDE.md invariant #4). Contains 4 stub files (requirements.md, design.md, tasks.md, spec.json) for manual E2E validation of Signal 1 path detection routing to spec-heavy.
- **Test count.** 24 new tests across 4 files, all GREEN. Total cumulative suite count: previous + 24.

---

## [4.10.0] - 2026-05-05

**Minor release WAVE 3 — COMPAT BASELINES**. Graduates the 5 compat regression fixtures (audit / bugfix / feature / hotfix / ux) from TEMPLATE → REAL baselines, removing the `--allow-templates-skipped` flag from the CI workflow. The Compat Regression Suite is now a genuine net rather than a placeholder — any change to the observable contract (classification, gates, agents, artifacts, verdict) of one of the 5 canonical scenarios fails CI with explicit diff.

### Added

- **`tests/compat/v4-baseline/scenarios/<name>/mock-output.json` × 5 (NEW)** — JSON fixtures mirroring each `expected.yaml`'s 5 observable fields. Used by `runner --mock` to validate parser + comparator + internal consistency without invoking the (still stubbed) real-mode CLI path.
- **`tests/unit/compat-baselines.test.js` (NEW, 6 tests)** — guards Wave 3 invariants:
  - All 5 fixtures have `baseline_method` starting with `"REAL"` (no fixture silently regresses to TEMPLATE).
  - All 5 mock-output.json files declare the 5 required observable fields with valid types.
  - `runner --all --mock` exits 0 naturally (no fallback flag needed).
  - Each fixture passes individually via `--scenario=<name>`.
  - `hotfix-fixture` preserves HOTFIX-specific contract markers (mode=hotfix, severity=Critical, HOTFIX_LOG.md present, FINAL_ADVERSARIAL_GATE.decision=SKIPPED, adversarial-architecture-critic + adversarial-quality-reviewer absent, adversarial-security-scanner present).
  - Report-only fixtures (audit, ux) omit TDD agents (quality-gate-router, pre-tester) and TDD_APPROVAL gate.

### Changed

- **`tests/compat/v4-baseline/scenarios/<name>/expected.yaml` × 5** — `baseline_method` rewritten from `"TEMPLATE — ..."` to `"REAL — captured 2026-05-05 ..."`. `baseline_version` bumped 4.5.0 → 4.10.0. `baseline_captured_at` populated with ISO-8601 timestamp. Two spec divergences corrected during dogfooding cross-reference: (a) `audit-fixture` FINAL_ADVERSARIAL_GATE.decision changed from PASS to SKIPPED (per `references/pipelines/audit-light.md` Phase 3 Note: report-only pipelines skip final-adversarial-orchestrator); (b) `feature-fixture` removed `feature-integration-validator` from agents_invoked (per `references/pipelines/implement-light.md:107`: SKIPPED in Light, handled inline by checkpoint-validator). Each expected.yaml now includes `confidence-score.yaml` in artifacts_produced (was missing previously).
- **`.github/workflows/compat-regression.yml`** — drops the v4.9.2 `--allow-templates-skipped` flag from the mock-mode invocation. Mock mode now relies entirely on REAL baselines for green CI; `0 PASS + N SKIPPED` reverts to the strict exit-1 semantics (which would surface a regression where someone re-introduces a TEMPLATE fixture without proper validation). Real-mode probe (gated by repo var `CLAUDE_CLI_AVAILABLE`) is unchanged but documented as a stub pending Slice 4-extended (see `designs/slice-0/SPIKE-CI-HARNESS.md`).
- **`tests/unit/compat-runner.test.js`** — removed 2 obsolete tests (v4.9.2 happy-paths that depended on TEMPLATE state which no longer exists). Retained 1 validation-guard test ensuring `--allow-templates-skipped` without `--mock` still exits 2 (defensive even though no fixture currently triggers the flag's other path). Net suite count: 76 → 80 (-2 + 6).
- **`.claude-plugin/plugin.json`** — version 4.9.2 → 4.10.0; description extended with Wave 3 summary.

### Notes

- **`tests/compat/runner.cjs` UNCHANGED** — Wave 3 honored Constraint #2 ("don't modify the runner"). The `--allow-templates-skipped` flag remains in code as a documented historical fallback. If a future contributor introduces a new fixture as TEMPLATE, the flag is still wired and testable; the v4.9.2 NIT-A path-guard semantics (rejection without `--mock`) is preserved.
- **Real-mode wiring deferred.** During Wave 3 it was confirmed that `executeReal()` in `runner.cjs` is a stub that throws unconditionally after the CLI probe. Per `designs/slice-0/SPIKE-CI-HARNESS.md` (2026-04-30), real-mode E2E with `claude --headless` is architecturally bottlenecked by `AskUserQuestion` (≥4 mandatory gates have no headless answer path). Resolving requires upstream `--ci-auto-confirm` in Claude Code or a wrapper. Tracking item: Slice 4-extended.
- **Method declaration honesty.** Each `baseline_method` field explicitly states the capture method: cross-reference of `input.md` against `commands/pipeline.md` + `references/pipelines/<variant>.md` + agent contracts at `agents/**/*.md`. The fixtures are not E2E captures (which are blocked); they are spec-anchored static contracts that future PRs must keep in sync. `mock-output.json` is the matching fixture.
- **HOTFIX fixture special invariants** captured: mode=hotfix, HOTFIX_LOG.md mandatory, 2-checklist adversarial scope (security only), FINAL_ADVERSARIAL_GATE skipped under emergency time pressure. Test `hotfix-fixture preserves HOTFIX-specific contract markers` is the regression net for these.
- **Iron Law respected.** Wave 3 only touches: 5 expected.yaml + 5 new mock-output.json + 1 unit test rewrite + 1 new test file + workflow yaml + plugin.json + CHANGELOG. Zero changes to `runner.cjs`, zero changes to `skills/`, zero changes to `agents/`, zero new agents.

---

## [4.8.0] - 2026-05-03

**Minor release HOOK ENFORCEMENT** — resolve consolidated.md §17.4 #8 ("hooks NÃO enforce SKILL.md frontmatter"). Os campos declarativos `sequence_lock`, `gates_at`, `sentinel_checkpoints`, e `agent_type` (per step) eram apenas documentação legível por humanos até v4.7.0 — drift teoricamente possível. Esta release implementa enforcement real via hooks Node, com roll-out 2-fases time-based para evitar quebras durante a janela de migração.

### Added

- **`.claude/hooks/skill-frontmatter-parser.cjs` (NEW)** — módulo compartilhado consumido pelos 3 hooks. Expõe: `parseYaml`, `parseFrontmatter`, `readSkillFrontmatter(skillName, repoRoot)`, `getCurrentSkill(state)`, `getEnforcementMode(today)` (warn vs deny baseado em data + override `PIPELINE_ENFORCEMENT={warn,deny}`), `logEnforcementDecision(repoRoot, decision)` (append-only em `gate-decisions.jsonl` com `gate: "ENFORCEMENT_WARN"|"ENFORCEMENT_DENY"`, `hardness: "AUDIT"`). YAML parser inline reutilizado de `tests/compat/runner.cjs`. ~210 linhas.
- **`.claude/hooks/__tests__/skill-frontmatter-parser.test.cjs` (NEW)** — 32 assertions cobrindo parser (valid/missing/malformed/non-string), readSkillFrontmatter (good/notfound/no-contract/invalid-name), getCurrentSkill (valid/missing variants), getEnforcementMode (before/after/boundary/override).
- **`.claude/hooks/__tests__/fixtures/skills/{feature-light-good,feature-light-bad-yaml,feature-light-no-contract}/SKILL.md` (NEW)** — fixtures sintéticos para testes dos 3 hooks.
- **`.claude/hooks/__tests__/force-pipeline-agents.test.cjs` (NEW)** — 13 assertions cobrindo enforcement de `gates_at` em UserPromptSubmit (5 cenários: no-skill / not-at-gate / no-evidence-warn / with-evidence / deny-mode).

### Changed

- **`.claude/hooks/sentinel-hook.cjs`** — adicionado `enforceSkillContract(state)` que valida `sentinel_checkpoints`. Quando `current_skill` + `current_step` populados em sentinel-state.json e step está em `sentinel_checkpoints`, verifica que `expected_next` está set. Modos: warn (logga em gate-decisions.jsonl + stderr) / deny (emite `permissionDecision: deny`). 9 novos testes (83/83 passing).
- **`.claude/hooks/dispatch-guard.cjs`** — agora também processa Agent calls (matcher `Skill|Agent` em hooks.json). Quando skill em flight, lê `skills/<name>/steps/0N-*.md` frontmatter e valida que `agent_type` declarado match com `subagent_type` da Agent call. Mismatch → warn/deny conforme modo. 4 novos cenários BDD (13/13 passing).
- **`.claude/hooks/force-pipeline-agents.cjs`** — adicionado `applyGateEnforcement()` chamado em UserPromptSubmit. Quando current step está em `gates_at`, verifica `gate-decisions.jsonl` por evidência de AskUserQuestion logado. Missing → warn/deny systemMessage (não bloqueia o prompt — UserPromptSubmit não pode deny — mas surface ao operador). 13 novos test assertions.
- **`hooks/hooks.json`** — matcher `Skill` → `Skill|Agent` para dispatch-guard; SessionStart prompt menciona v4.8.0.
- **`agents/core/pipeline-controller.md`** — adicionada subsection "State fields for skill enforcement (v4.8.0+)" documentando contrato: controller deve popular `current_skill` + `current_step` em sentinel-state.json antes de spawn Agent. Backward compat: hooks skipam quando ausentes.
- **`.claude-plugin/plugin.json`** — version 4.7.0 → 4.8.0; description estendida.

### Notes

- **Roll-out 2-fases:** Warn mode até **2026-05-17** (logga `ENFORCEMENT_WARN` em gate-decisions.jsonl com hardness AUDIT, não bloqueia). Deny mode auto-promove após (bloqueia via permissionDecision). 14 dias de janela permite operadores observarem warns + ajustarem state file pattern antes de blocking.
- **Override:** Set env var `PIPELINE_ENFORCEMENT=warn` ou `=deny` para forçar modo (útil em testing/CI).
- **Backward compat preservada:** Hooks skipam enforcement silently quando state não tem `current_skill` ou quando SKILL.md não declara o campo (sentinel_checkpoints / gates_at). Flows não-skill (`/pipeline` direto sem backing skill) continuam funcionando como antes.
- **Hardness AUDIT:** Entries de enforcement usam `hardness: "AUDIT"` para distinguir dos gates SOFT/HARD/MANDATORY/CIRCUIT_BREAKER existentes em gate-decisions.jsonl. Permite filtragem em queries.
- **Iron Law respected:** Apenas hooks JS + tests do plugin foram modificados. Consumer projects (e.g. `/pipeline-orchestrator:feature` invocação real) NÃO foram tocados.
- **Resolve §17.4 #8** do consolidated.md (hooks-not-enforce-frontmatter). Issue agora fechada.

---

## [4.7.0] - 2026-05-03

**Patch+minor release POLINDO Slice 3b** (sucessor de v4.6.1). Audit pós-correção identificou 11 findings — a v4.6.1 corrigiu a estrutura de pastas mas deixou os skills funcionalmente incompletos (frontmatter mínimo, tests placeholder, sem thin entry-point). Esta release fecha todos os 11 findings em batch único, mantendo Iron Law de "1:1 fidelity Pulsar nos prompts" (texto dos bodies intocado — apenas frontmatter contract foi adicionado).

### Added

- **`skills/feature/SKILL.md` CRIADO** — thin entry-point com `--light`/`--heavy` flag handling (espelha pattern de `skills/audit/SKILL.md` e `skills/bugfix/SKILL.md`). Permite `/pipeline-orchestrator:feature [task]` → auto-classify, `--light` → routing direto, `--heavy` → routing direto.
- **`references/feature-user-story-guidelines.md` CRIADO** — merged Pulsar TESTS_USER_STORY_LIGHT.md + TESTS_USER_STORY_HEAVY.md em 1 doc consumido pelo usuário antes de invocar feature-{light,heavy}. Conteúdo OLD dos tests files foi movido para cá.

### Changed

- **26 step files (`skills/feature-{light,heavy}/steps/*.md`)** — duplo frontmatter (`step_number/step_name/source` + `description/allowed-tools`) MERGED em single block + execution contract adicionado: `description`, `execution_mode` (inline|subagent), `agent_type` (FQN ou ""), `expected_inputs` (chained `from_step_NN`), `expected_outputs` (typed structure), `expected_next` (NN+1 ou "complete"), `gate_required` (bool), `gate_name` (4 gates: acceptance-matrix-approval, architecture-choice, plan-approval, tdd-tests-approval), `allowed_tools` (herdado de Pulsar + AskUserQuestion para gates). Bodies dos prompts INTOCADOS (1:1 fidelity Pulsar preservada).
- **`skills/feature-light/SKILL.md` + `skills/feature-heavy/SKILL.md`** — frontmatter mínimo expandido para contrato declarativo completo: `sequence: [1..13]`, `sequence_lock: true`, `gates_at: [3, 7, 9, 10]`, `sentinel_checkpoints: [pre_3, pre_10, pre_13]`, `stop_rule_max_failures: 2`, `disable-model-invocation: true`, `argument-hint`, `allowed-tools` ampliado. Body do SKILL.md adicionado: "Quando usar" + "Sequência canônica" + "Ownership por step" (5 agentes mapeados) + "Gates" (4 mandatory) + "Sentinel checkpoints" (3) + "Execution rules" (8 herdados de Slice 1.5 §21.3).
- **`skills/feature-{light,heavy}/tests/tests-feature-{light,heavy}.md`** — REESCRITOS de placeholder Pulsar TESTS_USER_STORY (diretrizes de tradução de user story, irrelevantes para o skill workflow) para tests reais do skill: smoke test scenarios + per-step contract assertions + frontmatter validation + gate assertions + sentinel assertions + STOP rule + anti-tests. Modelo: `skills/audit-heavy/tests/tests-audit-heavy.md`.
- **`references/pipelines/implement-{heavy,light}.md`** — deprecated headers corrigidos (v4.6.0 erroneamente apontavam para `references/pipelines/feature.md` que foi deletado em v4.6.1). Agora apontam corretamente para `skills/feature-{heavy,light}/SKILL.md` ou `skills/feature/SKILL.md` com flag.
- **`AGENTS.md`** header — `Total agents: 38` (errado, herdado de D1/D2 sem reality-check) → `19 agents (auditado 2026-05-03)` + nota explicando origem do drift.
- **`docs/superpowers/specs/2026-05-03-feature-pulsar-import-mapping.md`** + **`docs/superpowers/plans/2026-05-03-feature-pulsar-import-slice-3b.md`** — adicionado correction header explicando que docs foram escritos para v4.6.0 (single skill) mas implementação foi REVERTIDA em v4.6.1 e POLIDA em v4.7.0; usuário deve ler como histórico de design, não como spec canônica.
- `.claude-plugin/plugin.json` — version 4.6.1 → 4.7.0; description estendida com Slice 3b polish.
- `hooks/hooks.json` — SessionStart prompt menciona v4.7.0 + `/pipeline-orchestrator:feature` (thin shortcut).
- `CLAUDE.md` — lineage estendida + entry v1.5.
- `designs/pipeline-orchestrator-v5-consolidated.md` §12.2 status table (Slice 3b row v4.6.1 → v4.7.0 com nota "frontmatter contract completo + tests reais + thin entry-point") + §23 estendido com nota v4.7.0 polish + DoD checkboxes atualizados.

### Notes

- **1:1 fidelity Pulsar preservada:** Iron Law dos prompts INTOCADOS continua valendo. Nenhum texto de body de step foi alterado — apenas o frontmatter (que é metadata de contrato, não conteúdo do prompt) foi expandido.
- **Hooks ainda ADVISORY** (vide §17.4 #8). v4.7.0 não muda enforcement runtime — só completa a documentação declarativa que o controller deve respeitar.
- **Lição capturada:** entrega "estrutura correta + frontmatter mínimo" (v4.6.1) não é equivalente a "skill funcional pronto para uso". Próximas portabilidades de fonte canônica devem incluir frontmatter contract completo + thin entry-point + tests reais como parte do scope inicial, não como polish posterior.

## [4.6.1] - 2026-05-03

**Patch release CORRIGINDO Slice 3b**: a v4.6.0 inicial unificou Heavy + Light em **uma única skill `feature` com mode flag**, supostamente para reduzir contagem de arquivos. Decisão revertida: a fonte canônica Pulsar (`D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\`) tem **2 pastas separadas** (`Heavy/` + `Ligth/`), e o port deve espelhar isso 1:1 — mesmo padrão de Slice 1.5 (bugfix) e Slice 3a (audit).

### Changed

- **`skills/feature/` REMOVIDO** (era a unificação errada; 15 arquivos deletados)
- **`skills/feature-light/` CRIADO** — 13 step files espelhando Pulsar `Ligth/LIGHT_NN_*.md` 1:1 + SKILL.md + tests
- **`skills/feature-heavy/` CRIADO** — 13 step files espelhando Pulsar `Heavy/HEAVY_NN_*.md` 1:1 + SKILL.md + tests
- `references/pipelines/feature.md` REMOVIDO; substituído por `feature-light.md` + `feature-heavy.md` (a serem criados via futuro touch quando precisarem)
- `commands/pipeline.md` — `--variant=feature` + `--mode` REMOVIDOS; entry-points são `/pipeline-orchestrator:feature-light` e `/pipeline-orchestrator:feature-heavy` (igual bugfix/audit)
- `agents/core/task-orchestrator.md` — `FORCE_VARIANT=feature` + `FORCE_MODE` REMOVIDOS; aceita `FORCE_VARIANT=feature-light` ou `feature-heavy` (igual bugfix-light/bugfix-heavy)
- `.claude-plugin/plugin.json` — version 4.6.0 → 4.6.1
- `hooks/hooks.json` — SessionStart prompt menciona `/pipeline-orchestrator:feature-light` e `/pipeline-orchestrator:feature-heavy`
- `CLAUDE.md` + `AGENTS.md` — versão + 2 roster entries (separadas)
- `designs/pipeline-orchestrator-v5-consolidated.md` §23 — reescrita explicando reversão; §17.3 #12 estendida com lição

### Notes

- **Lição capturada:** quando há fonte canônica com estrutura definida (2 pastas), port DEVE espelhar 1:1. Otimizações de file count via "padrões novos" (mode flag) que divergem da fonte = drift documental e re-trabalho. Decisão tomada via AskUserQuestion na sessão de bugfix-heavy 2026-05-03 com opção "Recomendado" — o "Recomendado" foi minha (assistant) preferência por compactação, não validade neutra. Próximas portabilidades devem espelhar 1:1 sem reinterpretar a estrutura da fonte.
- **Userstory + ux ports:** quando portados (Slice 3c/3d futuro), DEVEM espelhar igualmente a estrutura de pastas Pulsar.

## [4.6.0] - 2026-05-03

> **DEPRECATED — vide [4.6.1]:** esta release foi corrigida em [4.6.1] que reverteu a unificação. Mantida no histórico para rastreabilidade.

Minor release implementing **Slice 3b**: imports the prescriptive 13-step Pulsar `Implement_new_feature` workflow (`D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\`) as a Claude Code skill. **Pattern novo:** single skill `feature` com mode flag (`heavy|light`) controlando verbosidade de prompt — primeira vez que um port usa essa estrutura (vs 2 skills separadas em Slice 1.5/3a). Design: `designs/pipeline-orchestrator-v5-consolidated.md` §23 + spec mapping `docs/superpowers/specs/2026-05-03-feature-pulsar-import-mapping.md`.

### Added

- `skills/feature/SKILL.md` — manifest com mode flag (heavy default, --mode=light override), sequence_lock, gates_at: [3, 7, 9, 10], sentinel_checkpoints: [pre_3, pre_10, pre_13]
- `skills/feature/steps/01..13-*.md` — 13 step files mode-aware (Heavy + Light prompts em seções separadas)
- `skills/feature/tests/tests-feature.md` — diretrizes user story (absorve TESTS_USER_STORY_{HEAVY,LIGHT}.md do Pulsar)
- `references/pipelines/feature.md` — reference single (substitui implement-*)
- 4 AskUserQuestion gates obrigatórios (steps 3 acceptance-matrix, 7 architecture-choice, 9 plan-approval com conditional skip, 10 tdd-tests-approval)

### Changed

- `agents/core/task-orchestrator.md` — aceita `FORCE_VARIANT=feature` + `FORCE_MODE={light,heavy}`
- `commands/pipeline.md` — adicionado `--variant=feature` + `--mode=light|heavy` na tabela de modes
- `references/pipelines/implement-{heavy,light}.md` — DEPRECATED como redirects para `feature.md`
- `.claude-plugin/plugin.json` — version 4.5.0 → 4.6.0
- `hooks/hooks.json` — SessionStart prompt menciona `/pipeline-orchestrator:feature`
- `CLAUDE.md` + `AGENTS.md` — versão + roster entry

### Reused (no new agents)

- `feature-vertical-slice-planner` (steps 3, 7, 9 — re-spawned 3x com TASK_CONTEXT diferente)
- `feature-implementer` (step 11)
- `feature-integration-validator` (step 12)
- `pre-tester` (step 10 — parametrized via `expected_inputs.pre_tester_artifacts`)
- `quality-gate-router` (step 10 — Phase 2 do pipeline)

### Notes

- **Hooks são ADVISORY:** campos do SKILL.md frontmatter (`sequence_lock`, `gates_at`, etc) são declarativos; controller respeita o contrato mas hooks NÃO parseiam SKILL.md (ver consolidated §17.4 #8)
- **Step 9 conditional skip:** se Phase 1.5 plan-architect rodou (filesystem check em `PIPELINE_DOC_PATH/05-plan-architect.md`), skill pula step 9 e usa output do plan-architect
- **TDD step 10 parametrizado:** Pulsar source usava paths Firebase-específicos (`functions/src/__tests__/`); skill recebe paths via `expected_inputs.pre_tester_artifacts` do agente `pre-tester`
- **Step 11 SEM gate skill-level:** executor-controller (Phase 2) já tem adversarial gate antes de Edits; double gate seria DRY violation
- **Pre-check absorvido por Phase 0:** `HEAVY_A_CHECK_ANTES_DE_NOVA_FEATURE.md` do Pulsar não vira step da skill — `information-gate` + `design-interrogator` da Phase 0 cobrem
- **Userstory + ux ports:** ainda pendentes (futuros v4.7.0 / v4.8.0 — sub-slices Slice 3c/3d)
- **v5.0 final:** continua bloqueado por Slice 4 verde (per consolidated §12.8.3)

## [4.5.0] - 2026-05-02

Minor release implementing **Slice 3a**: imports the prescriptive 9-step Heavy and 9-step Light audit workflows from Pulsar (`D:\Projeto Pulsar\.claude\commands\Prompts\Audtiroria\`) as Claude Code skills. Audit pipelines are **REPORT-ONLY** by Iron Law — no production file modification at any step. Design: `designs/pipeline-orchestrator-v5-consolidated.md` §22.

### Added

- `skills/audit/SKILL.md` — thin entry-point skill with `--light`/`--heavy` variant flag handling; auto-classify fallback delegates to `pipeline-controller` with `PRE_CLASSIFIED_TYPE=Audit`
- `skills/audit-light/` — 9-step prescriptive workflow for SIMPLES/MEDIA audits (`SKILL.md` + 9 `steps/0X-*.md` + `tests/tests-audit-light.md`)
- `skills/audit-heavy/` — 9-step prescriptive workflow for COMPLEXA audits (`SKILL.md` + 9 `steps/0X-*.md` + `tests/tests-audit-heavy.md`)
- `references/glossary/audit.md` — domain glossary for the audit bounded context (finding, severity, surface area, threat model, intake, risk matrix, evidence tag, Pa de Cal, light_mode, escalation)
- 9-step canonical sequence per tier:
  - Step 1 — Intake + Spec + Inventory (`AuditIntake` / `AuditSnapshot`) — gate (scope approval)
  - Step 2 — Architecture + Boundaries + Dependencies (`DependencyImpactAudit` / `ArchitectureAudit`)
  - Step 3 — Domain + SSOT + Decisions (`DecisionSSOTAudit` / `DomainSSOTAudit`)
  - Step 4 — Contracts + APIs + Endpoints + Validations (`ContractGovernanceAudit` / `ContractAudit`)
  - Step 5 — Data + Migrations + Integrity + Security (`DataGovernanceAudit` / `DataAudit`)
  - Step 6 — Frontend + State + A11y + PWA (`FrontendDeepAudit` / `FrontendAudit`)
  - Step 7 — Backend + Errors + Auth + Observability (`BackendDeepAudit` / `BackendAudit`)
  - Step 8 — Governance + Tests + CI/CD + Documentation (`DeliveryGovernanceAudit` / `QualityOpsAudit`)
  - Step 9 — Pa de Cal + Risk Matrix (`AuditMasterSeal` / `AuditFinalSeal`) — gate (GO/CONDITIONAL/NO-GO; Light has 4th option ESCALATE-TO-HEAVY)
- 8 enforcement rules baked into skill+step frontmatter (`sequence_lock`, `execution_mode` lock, `agent_type` whitelist, output schema, AskUserQuestion gates at steps 1+9, STOP RULE, audit log, sentinel checkpoints `pre_1`/`pre_5`/`pre_9` for Heavy and `pre_1`/`pre_9` for Light)
- 9th invariant unique to audit: **Read-only enforcement** (`report_only: true` in manifest, `production_writes_allowed: false` in every step) — `edit-guard-hook.cjs` blocks any Edit/Write originating from audit-* steps or agents
- Light-tier escalation triggers (Critical severity / ≥30% `[HYPOTHESIS]` tags / cascade across 3+ areas / regulatory keyword) surface ESCALATE-TO-HEAVY as recommended option at step 9

### Changed

- `skills/audit/SKILL.md`: detects `--light`/`--heavy` flags + delegates to backing skill
- `references/pipelines/audit-heavy.md` and `audit-light.md`: header pointer "As of v4.5.0 (Slice 3a)" routes prescriptive procedure to the new skill while preserving team-composition reference
- `designs/pipeline-orchestrator-v5-consolidated.md`: §0 metadata bumped to v4.5.0; §12.2 sequência marca Slice 3a 🟢; §22 net-new design rationale + DoD
- `.claude-plugin/plugin.json` + `marketplace.json`: version 4.4.1 → 4.5.0
- `hooks/hooks.json`: SessionStart prompt mentions `/audit`, `/audit-light`, `/audit-heavy`

### Notes

- **No new agents required.** The 4 audit agents (`audit-intake`, `audit-domain-analyzer`, `audit-compliance-checker`, `audit-risk-matrix-generator`) already existed since before Slice 1; this slice wraps them with prescriptive step procedure + frontmatter contract.
- **No new hooks required.** Existing hooks (`dispatch-guard`, `sentinel-hook`, `edit-guard-hook`, `force-pipeline-agents`) cover the new skills via declarative contract.
- **Report-only.** Audit findings are advisory; remediation requires a downstream `/pipeline-orchestrator:bugfix [finding-AUDIT-NNN]` or `/feature` invocation.
- **Slice 3 (resto) — `/feature`, `/userstory`, `/ux`** remains pending; the same template is now battle-proven in two slices (1.5 + 3a) and is reusable.

## [4.4.0] - 2026-05-01

Minor release implementing **Slice 1.5**: imports the prescriptive 11-step Heavy and 8-step Light bugfix workflows from Pulsar (`D:\Projeto Pulsar\.claude\commands\Prompts\Bug_fix\`) as Claude Code skills, closing 6 audit gaps identified in v4.3.1 review. Design: `designs/pipeline-orchestrator-v5-consolidated.md` §21.

### Added

- `skills/bugfix-light/` — 8-step prescriptive workflow for SIMPLES/MEDIA bugs (`SKILL.md` + 8 `steps/0X-*.md` + `tests/`)
- `skills/bugfix-heavy/` — 11-step prescriptive workflow for COMPLEXA bugs (`SKILL.md` + 11 `steps/0X-*.md` + `tests/`)
- 6 audit gaps closed:
  - Heavy 3 (Domain Truth Model — invariants/property/transactional)
  - Heavy 9 (UX Journey post-fix E2E)
  - Heavy 11 (Final Validation distinct from Pa de Cal)
  - Light 3 (invariants BEFORE change)
  - Light 5 (RED→regression promotion)
  - Light 6 (Persistence Quick Check)
- 8 enforcement rules baked into skill+step frontmatter (`sequence_lock`, `execution_mode` lock, `agent_type` whitelist, output schema, AskUserQuestion gates, STOP RULE, audit log, sentinel checkpoints)

### Changed

- `skills/bugfix/SKILL.md`: detects `--light`/`--heavy` flags + delegates to backing skill
- `agents/core/pipeline-controller.md`: variant override + skill dispatch after Phase 1
- `agents/core/task-orchestrator.md` Step 1a: `force_variant` parallel to `force_type`
- `commands/pipeline.md`: `--light`/`--heavy` rows in Modes table
- `references/pipelines/bugfix-{light,heavy}.md`: pointer-header note to new skills
- `.claude-plugin/plugin.json`, `marketplace.json`, `hooks/hooks.json`: bumped to 4.4.0

### Backward compat

- `/pipeline-orchestrator:bugfix [task]` (no flag) keeps auto-classify behavior
- `/pipeline-orchestrator:pipeline [task]` keeps existing flags (`--simples`/`--media`/`--complexa`)
- 3 type-specific bugfix-* agents (`bugfix-diagnostic-agent`, `bugfix-root-cause-analyzer`, `bugfix-regression-tester`) remain invocable in `pipeline-orchestrator:executor:type-specific:` namespace

## [4.3.1] - 2026-05-01

Patch release driven by adversarial review of v4.3.0 skill migration.
Two reviewers (`plugin-dev:skill-reviewer` + `plugin-dev:plugin-validator`)
returned READY-TO-SHIP / PASS verdicts with 1 MEDIUM and 1 WARNING for
polish. Both addressed here.

### Changed

- **`skills/bugfix/SKILL.md`** — removed the "Why this is a skill (not a
  command)" section (lines 38-46 in v4.3.0). The reviewer flagged it as
  design-decision/changelog content that belongs in CHANGELOG.md, not in
  execution guidance. SKILL.md should tell Claude what to do, not why
  the file structure was chosen. CHANGELOG.md [4.3.0] entry retains the
  full rationale.
- **`skills/pipeline/SKILL.md`** — added `disable-model-invocation: true`
  + `allowed-tools: Task` + `argument-hint: [task description]` to match
  the bugfix skill's manual-only posture. Same justification: every
  pipeline run has side effects (TDD-RED tests, code edits, commits) and
  must be consciously triggered. Previously v4.x relied on hook-level
  filtering; v4.3.1 makes it declarative, consistent across both skills.

### Notes

- Both changes are user-invisible. Same `/pipeline-orchestrator:pipeline`
  and `/pipeline-orchestrator:bugfix` UX.
- `commands/pipeline.md` deliberately kept (NOT deleted) — it serves as
  the inline-invariants reference. The plugin-validator suggested
  consolidating to skill-only in v4.4.0 alongside Slice 3. Decision:
  keep both for now; revisit when the 4 remaining entry-points
  (`/feature`, `/userstory`, `/audit`, `/ux`) are designed.

## [4.3.0] - 2026-05-01

Minor release migrating `/bugfix` from the legacy `commands/` flat-file format
to the idiomatic `skills/<name>/SKILL.md` directory format with
`disable-model-invocation: true`. Driven by re-reading the official Claude Code
documentation: *"Files in `.claude/commands/` still work and support the same
frontmatter. Skills are recommended since they support additional features like
supporting files."* — and the plugin structure table in
[/en/plugins](https://code.claude.com/docs/en/plugins) explicitly states
*"Use `skills/` for new plugins"*.

The user-facing invocation (`/pipeline-orchestrator:bugfix [task]`) is
**identical**. Only the file structure changed.

### Changed

- **Migrated** `commands/bugfix.md` → `skills/bugfix/SKILL.md`. The new
  SKILL.md adds:
  - `disable-model-invocation: true` — Claude can never auto-invoke the
    skill. Manual `/pipeline-orchestrator:bugfix` only. Same effect as the
    previous command but enforced declaratively in frontmatter rather than
    relying on hook-level filtering.
  - `argument-hint: [bug description with repro details]` — autocomplete
    hint when typing the slash command.
  - `allowed-tools: Task` — narrowest possible tool set; the skill only
    spawns the `pipeline-controller` agent and does nothing else.
- Deleted `commands/bugfix.md` (skill replaces it; no behavior change for
  the user).

### Why a skill (not a command)

Per the official docs, custom commands have been merged into skills in 2026.
A `commands/<name>.md` flat file and a `skills/<name>/SKILL.md` directory both
produce the same `/<name>` invocation. Skills are the recommended format for
new plugins because they:

1. Support a directory layout with supporting files (templates, examples,
   scripts) that can be loaded only when the skill runs — keeps SKILL.md focused
   on essentials. The 4 entry-points planned for Slice 3 (`/feature`,
   `/userstory`, `/audit`, `/ux`) will benefit from this when they need
   type-specific scaffolds.
2. Expose `disable-model-invocation: true` declaratively, removing the need
   for the hook-level "is this skill auto-invocable?" filter that v4.2 added.
3. Are listed alongside built-in skills like `/debug`, `/simplify`, `/loop`
   in `/help` output, matching the discovery experience of bundled skills.

The previous v4.2.x decision to ship `/bugfix` as a command was based on a
misreading of the doc — corrected here.

### Notes for downstream consumers

- `commands/` directory still contains `pipeline.md`. The full classifier
  remains a command for now (it has special inline-invariants behavior and
  is the v4 architectural anchor). It may migrate in a future release if
  there's a clear benefit; no plan to do so urgently.
- Plugin structure now shows both `commands/` (1 entry) and `skills/`
  (2 entries) coexisting — fully supported by the official Claude Code
  loader.

### Marketplace

- `.claude-plugin/marketplace.json`: pipeline-orchestrator pinned to
  `v4.3.0` with description summarizing the migration.

## [4.2.1] - 2026-04-30

Patch release closing 2 security findings identified by adversarial review of
v4.2.0. Both issues were bypass-class — they would let an attacker (or a
mistyping user) sidestep the v4 session-lock protection contract.

### Fixed

- **SEC-1 — Uppercase entry-point bypass (MEDIUM).** `session-lock-hook.cjs`
  `PIPELINE_REGEX` was case-sensitive while `force-pipeline-agents.cjs`
  `isPipelineSkill` was case-insensitive. A user typing `/BUGFIX algo` would
  receive `PIPELINE_SKILL_MESSAGE` but the session lock would NOT be created —
  pipeline ran without edit-guard, allowing direct edits during the "pipeline
  session". Fix: added `/i` flag to `PIPELINE_REGEX`.
- **SEC-2 — Namespace collision with foreign plugins (MEDIUM).**
  `force-pipeline-agents.cjs` `SKILL_PATTERNS` matched bare `/bugfix`,
  `/feature`, `/userstory`, `/audit`, `/ux` without requiring the
  `pipeline-orchestrator:` namespace. Foreign marketplace plugins with a
  same-named command (especially `/audit`, `/ux`) would be silently classified
  as pipeline-orchestrator skills, injecting `PIPELINE_SKILL_MESSAGE` into
  unrelated sessions. Fix: split `SKILL_PATTERNS` row 1 into a dedicated
  namespaced pattern; `isPipelineSkill` no longer matches the bare aliases.

### Hardened (proactive)

- **SEC-3 mitigation (LOW maintenance risk).** Added explicit comment block
  above `isPipelineSkill` documenting that case-insensitivity is enforced
  ONLY via the `/i` flag at that site. Future maintainers removing `/i`
  thinking `toLowerCase()` in `isSkillCommand` already canonicalizes would
  re-open SEC-1 partially. Comment prevents the regression.

### Tests

- Smoke validation 10/10 unit cases: `/PIPELINE-ORCHESTRATOR:BUGFIX foo`
  now creates a lock; bare `/audit`, `/feature`, `/ux` no longer hijacked;
  legacy `/pipeline` preserved; non-pipeline skills (`/commit`, `/test`)
  still receive `SKILL_MESSAGE` correctly.

### Open / deferred

- **ARCH-2 (HIGH) — Trust boundary on PRE_CLASSIFIED_TYPE prefix.**
  User invoking the full `/pipeline-orchestrator:pipeline` could manually
  inject `PRE_CLASSIFIED_TYPE=...` in their prompt to forge type. Decision:
  defer to Slice 3 when the 4 remaining entry-points ship. At that point
  the contract will be re-evaluated holistically, possibly moving from
  string prefix to a separate Agent-call metadata field.

## [4.2.0] - 2026-04-30

Minor release adding **thin entry-point commands** that skip type-classification
by pre-fixing `task_type`. Same pipeline-controller, same gates, same session
lock + edit-guard contract — the new commands are shortcuts, not bypasses.

### Added

- `commands/bugfix.md` — `/pipeline-orchestrator:bugfix [task]` shortcut for
  Bug Fix tasks. Delegates to `pipeline-controller` with prompt prefix
  `PRE_CLASSIFIED_TYPE=Bug Fix`. (Slice 1 of v5 roadmap.)
- `pipeline-controller.md` Step 1: documents `PRE_CLASSIFIED_TYPE=<Type>`
  prefix and lists invariants that still apply (information-gate,
  design-interrogator, all gates, sentinel checkpoints).
- `task-orchestrator.md` Step 1a: accepts the prefix, sets `type` directly,
  still computes complexity, pipeline_variant, ssot_status. Mirrors the
  existing `--simples/--media/--complexa` flag pattern but for type.

### Changed

- `session-lock-hook.cjs` `PIPELINE_REGEX` now matches all entry-points
  (`pipeline|bugfix|feature|userstory|audit|ux`). Without this patch, the
  new `/bugfix` would have bypassed the v4 protection contract — main-LLM
  could edit files directly during a `/bugfix` session. **Critical fix
  identified by adversarial review of the slice plan.**
- `force-pipeline-agents.cjs` `SKILL_PATTERNS` and `isPipelineSkill` regex
  recognize all entry-points. Cosmetic but keeps UX consistent.
- `hooks/hooks.json` SessionStart prompt advertises all 6 entry-points.
- `plugin.json` and `marketplace.json` bumped to 4.2.0.

### Forward-compat note

The regex and prefix vocabulary already accommodate the remaining 4
entry-points (`/feature`, `/userstory`, `/audit`, `/ux`), which arrive in
subsequent slices (v5 Slice 3). Adding them is now purely additive — same
pattern as `commands/bugfix.md`.

## [4.1.3] - 2026-04-29

Patch release fixing a class of bugs where the `edit-guard-hook` would refuse
to honor a freshly-written exec-window because the controller LLM authoring
the JSON had a stale internal clock and wrote `opened_at` in the wrong year.
The hook compared `expires_at` (also LLM-fabricated) against the real
`Date.now()` and treated the window as expired, forcing the user to manually
refresh the exec-window or delete the session lock to make progress.

### Fixed

- `edit-guard-hook.cjs` `getActiveExecWindow` now derives `opened_at` from
  `fs.statSync(path).mtimeMs` (filesystem authoritative). The JSON
  `opened_at`/`expires_at` fields are accepted for backward-compat with
  legacy windows but are IGNORED for liveness/expiration decisions. The
  effective TTL is taken from a new `ttl_minutes` field (preferred), or
  back-derived from legacy `expires_at - opened_at`, or defaults to 5.
- Pairing check in `getActiveExecWindow` accepts a match against either the
  filesystem mtime OR `JSON.opened_at`. This covers the common case where a
  controller LLM writes the same stale-clock timestamp into BOTH the
  exec-window and the audit-log entry — they pair against each other even
  though both disagree with the wall clock. Defense-in-depth (forging only
  one of the two) remains intact.

### Changed

- `agents/core/pipeline-controller.md` exec-window protocol section: the
  canonical schema written by controllers is now `{ session_id, ttl_minutes,
  purpose, spawning_agent }`. `opened_at`/`expires_at` are deprecated for
  controller-authored windows (still emitted by `openExecWindow` helper for
  backward-compat).
- `openExecWindow` helper now writes `ttl_minutes` alongside the legacy
  timestamp fields.

### Tests

- 4 new tests covering: LLM-fabricated past `opened_at` (1 year stale), LLM-
  fabricated future `opened_at` (1 year ahead), minimal-schema window (just
  `ttl_minutes`), and `ttl_minutes > MAX_TTL_MINUTES` rejection. Existing 53
  tests continue to pass — total: 57/57.

## [4.1.2] - 2026-04-28

Cosmetic-only release that catches up the user-visible version strings to
reflect the 4.1.1 fix. No behavioral changes, no test additions.

### Changed

- `hooks/hooks.json` `SessionStart` banner: `v4.1.0 loaded` → `v4.1.2 loaded`
  and includes a one-liner about the 4.1.1 stale-lock self-heal so users
  who upgrade can see the relevant change at a glance.
- `README.md` shields.io version badge: `version-4.1.0` → `version-4.1.2`.

### Marketplace

- `.claude-plugin/marketplace.json`: pipeline-orchestrator pinned to `v4.1.2`.

## [4.1.1] - 2026-04-27

Patch release fixing a long-standing failure mode where a session lock could
be orphaned across Claude Code crashes/force-quits and continue blocking
direct `Edit`/`Write` outside `.pipeline/` for up to 2 hours (the lock TTL).
The Stop-hook cleanup path is keyed on `lock.session_id === sessionId`, so
locks belonging to a crashed session were never reclaimed by subsequent
sessions and the only escape hatches were waiting out the 2h TTL or
manually deleting the `.lock` file.

### Fixed

- **Orphan-lock self-heal (HIGH).** Session locks now carry a `last_seen_at`
  heartbeat field. On every `UserPromptSubmit`, `session-lock-hook.cjs`
  refreshes the heartbeat for the calling session's own lock and marks any
  foreign lock whose `last_seen_at` is older than `STALE_THRESHOLD_MS`
  (10 minutes) as `status: "completed"` with `completed_reason: "stale_heartbeat"`.
  Crashed-session locks are reclaimed within ~10 minutes of the next prompt
  in any Claude Code session sharing the same `.pipeline/sessions/`, instead
  of surviving the full 2h TTL.

### Added

- **Defense-in-depth in `edit-guard-hook.cjs`.** `getActiveLock()` now skips
  active locks whose `last_seen_at` is older than `STALE_HEARTBEAT_MS`
  (10 minutes), even when the GC pass has not yet run. Exposed as
  `STALE_HEARTBEAT_MS` in the module exports.
- **`refreshHeartbeatAndGC(baseDir, currentSessionId)`** in
  `session-lock-hook.cjs`. Pure helper that scans `sessions/`, refreshes
  the calling session's lock and reaps stale foreign locks. Returns
  `{ refreshed, stale_marked }`. Never creates the sessions directory —
  that remains the responsibility of `createLock()` under a real pipeline
  invocation.

### Backwards compatibility

- Locks created before 4.1.1 (no `last_seen_at` field) are treated as
  "fresh" by both `refreshHeartbeatAndGC` and `getActiveLock`. The legacy
  `expires_at` + Stop-hook contract continues to govern them so an upgrade
  cannot silently invalidate a pipeline that was already in flight.
- No public API or schema removed. The lock JSON gained `last_seen_at` and
  optionally `completed_reason`; both are additive.

### Tests

- `.claude/hooks/__tests__/session-lock-hook.test.cjs`: +12 tests covering
  heartbeat presence on `createLock`, sessions-dir-not-created invariant,
  own-session refresh, foreign-stale GC, fresh-foreign no-op, legacy
  no-`last_seen_at` no-op, completed-lock no-op, malformed-JSON tolerance,
  and the two `handleUserPromptSubmit` call sites that now run heartbeat/GC
  even on non-pipeline prompts.
- `.claude/hooks/__tests__/edit-guard-hook.test.cjs`: +3 tests pinning
  the `STALE_HEARTBEAT_MS` skip behavior and the legacy-lock fallback.
- Suite total: 89 tests (was 74) across `session-lock-hook` + `edit-guard-hook`.

### Files changed

- `.claude/hooks/session-lock-hook.cjs` (+98 / -10)
- `.claude/hooks/edit-guard-hook.cjs` (+13 / -1)
- `.claude/hooks/__tests__/session-lock-hook.test.cjs` (+198 / -1)
- `.claude/hooks/__tests__/edit-guard-hook.test.cjs` (+67 / 0)

### Marketplace

- `.claude-plugin/marketplace.json`: pipeline-orchestrator pinned to `v4.1.1`.

## [4.1.0] - 2026-04-26

Promotes `4.1.0-rc.1` to stable. Includes the cold-start fix and version-drift
reconciliation merged in #3 — the pipeline-controller (v4 entry point) is now
in `BOOTSTRAP_AGENTS`, so `/pipeline-orchestrator:pipeline` works in any cwd
without prior `.pipeline/docs/Pre-*-action/`. No other behavioral changes
since `4.1.0-rc.1`.

### Fixed (from #3)

- **Cold-start break (HIGH):** `.claude/hooks/sentinel-hook.cjs` `BOOTSTRAP_AGENTS`
  whitelist now includes `pipeline-controller`. Previously the v4 entry point
  was blocked on cold start because the whitelist still only contained the v3
  entry point (`task-orchestrator`), contradicting `skills/pipeline/SKILL.md`.
- **Sentinel deny-message:** updated to point to the v4 invocation path
  (`/pipeline-orchestrator:pipeline`), not direct `task-orchestrator` spawn.
- **Version drift:**
  - `README.md` badge `version-3.8.0` → `version-4.1.0`.
  - `hooks/hooks.json` SessionStart prompt `v4.0.0-draft.1` → `v4.1.0`.
  - `agents/core/pipeline-controller.md` exec-window protocol header
    `(v4.0.0-draft.2)` → `(v4.1+)`.
  - `agents/core/pipeline-controller.md` security-limitations docstring
    `30-minute TTL` → `5-minute default TTL (60-minute hard cap)` to match
    the actual `MAX_TTL_MINUTES` constant introduced in v4.1.

### Added (from #3)

- Regression test `[6b]` in `.claude/hooks/__tests__/sentinel-hook.test.cjs`
  asserting cold-start dispatch of `pipeline-controller` is permitted.
  Sentinel-hook test count: 71 → 73.

### Marketplace

- `marketplace.json` pipeline-orchestrator entry: `version` and `ref` both
  bumped from `v4.1.0-rc.1` → `v4.1.0` (supply-chain pin updated).

### Discovery context

The cold-start bug existed since v4.0.0-rc.1 (when the controller was
introduced) but was masked because integration tests ran in a directory with
prior pipeline state. Found by dogfooding the pipeline against the plugin's
own audit findings.

## [4.1.0-rc.1] - 2026-04-24

### Changed (hardening — resolves 3 known limitations from v4.0.0-rc.1)

- **edit-guard-hook — NI-5**: exports `openExecWindow(dir, sessionId, opts)` and `closeExecWindow(dir, sessionId)` as programmatic helpers. Includes tmp+rename atomic write, error-path cleanup, and controller-prompt references. First explicit lifecycle-test covers the full `open → allow → close → block` sequence.

- **edit-guard-hook — NI-4**: TTL bounded on both write and read paths. Default TTL reduced from 30 min to 5 min. Hard maximum of 60 min enforced by `MAX_TTL_MINUTES` constant; windows claiming longer are rejected on `openExecWindow` (throw) and ignored on `getActiveExecWindow` (silent skip with stderr log). Added `Number.isFinite()` guard against NaN/Infinity, future-timestamp rejection (`opened_at > now + 5s skew`), and legacy-window rejection.

- **edit-guard-hook — NI-3**: pairing check — exec-windows now require a matching `EXEC_WINDOW_OPEN` entry in `gate-decisions.jsonl` with `session_id` match and `timestamp` within ±60 s of the window's `opened_at`. `openExecWindow` and `closeExecWindow` helpers automatically append the audit entries. Stale-OPEN-reuse after CLOSE is blocked: a new window cannot pair with an OPEN already followed by an intermediate CLOSE for the same session. `appendAuditEntry` fails closed if no `Pre-*-action/*/` folder exists (no auto-synthesized fake folders).

### Added

- `.claude/hooks/edit-guard-hook.cjs` exports: `openExecWindow`, `closeExecWindow`, `MAX_TTL_MINUTES` (constant).
- `.claude/hooks/__tests__/edit-guard-hook.test.cjs`: 25 new tests (25 → 50). Breakdown:
  - 4 NI-5 lifecycle tests
  - 4 NI-5 fix-pass tests (lock-required, ttl>0, atomic cleanup, TTL contract)
  - 3 NI-4 MAX_TTL tests
  - 3 NI-4 fix-pass tests (future opened_at, NaN, legacy window)
  - 8 NI-3 pairing tests
  - 3 NI-3 fix-pass tests (stale-OPEN reuse, fail-closed on missing dir)

### Stderr diagnostics

Hooks now emit targeted stderr lines when silently skipping malformed/rejected data (missing opened_at, TTL > 60min, no pairing entry). Aids controller debugging without failing open.

### Known limitations remaining (deferred to v4.2)

- Unbounded growth of `gate-decisions.jsonl` over long project lifespans — no pruning policy yet.
- `buildBlockMessage` does not hint at pairing requirement; controllers using raw `Write` path get generic block message, must check stderr.

## [4.0.0-rc.2] - 2026-04-24

Resolves 2 LOW items from `v4.0.0-rc.1` Known limitations. No behavioral
changes to the pipeline workflow; hardening only.

### Changed (hardening)

- **session-lock-hook / session-cleanup-hook**: lock writes are now atomic via
  `.tmp`+`rename`. Eliminates the millisecond window where a concurrent reader
  could observe a truncated/empty lock file (resolves pre-existing LOW item
  from v4.0.0-rc.1 Known limitations).
- **session-cleanup-hook**: refuses to follow symlinks under
  `.pipeline/sessions/`. Before `readFileSync` / `unlinkSync`, `fs.lstatSync`
  verifies the entry is a regular file; non-regular entries are skipped with a
  stderr log (resolves LOW theoretical hardening item from v4.0.0-rc.1 Known
  limitations).

### Tests

- `session-lock-hook.test.cjs`: 14 → 15 (added `.tmp` leftover contract test).
- `session-cleanup-hook.test.cjs`: 8 → 9 (added symlink rejection test; self-
  skips on platforms without unprivileged symlink support).
- `edit-guard-hook.test.cjs`: 25 (unchanged).

### Remaining known limitations (deferred to v4.1)

NI-3, NI-4, NI-5 — see v4.0.0-rc.1 entry below.

## [4.0.0-rc.1] - 2026-04-24

Promoted from draft.2 — no code changes, docs only.

### Release candidate notes

This RC promotes `4.0.0-draft.2` after the final adversarial review pass. All
IMPORTANT and HIGH findings are closed; 5 LOW/MEDIUM items are deferred to v4.1
and documented under **Known limitations (deferred to v4.1)** in the draft.2
entry below.

### Closed findings summary

- **F-001 (HIGH):** edit-guard now honors exec-window cooperative authorization,
  allowing N2 executor agents to write production code under the controller.
- **F-002 (HIGH):** session-lock Stop hook marks locks as completed; stale locks
  no longer shadow fresh ones; block message no longer suggests `rm` first.
- **F-003 (MEDIUM):** smoke test anchors to plugin root via `BASH_SOURCE`.
- **F-004 (MEDIUM):** tighter `session_id` regex rejects leading `.`/`-`.
- **F-005 (LOW):** renumbered CRITICAL REMINDERS in controller prompt.
- **F-006 (HIGH):** edit-guard now matches `MultiEdit` tool.
- **NI-1 (HIGH):** `plugin.json` version reconciled with CHANGELOG (draft.2).
- **NI-2 (HIGH):** session-cleanup Stop hook now deletes exec-window files,
  covering crash/forgotten-close cases.

### Deferred items

See the `[4.0.0-draft.2]` Known limitations section for NI-3, NI-4, NI-5, and
the two LOW pre-existing items (non-atomic `.lock` writes, cleanup symlink
trust).

## [4.0.0-draft.2] - 2026-04-24

### Changed (breaking for scripts that bypassed via MultiEdit)

- **edit-guard-hook**: now also matches `MultiEdit` tool (F-006 fix).
- **edit-guard-hook**: introduces **exec-window cooperative authorization** (F-001 fix) — when `.pipeline/sessions/{session_id}.exec-window` exists, is non-expired, and its `session_id` matches the active lock, Edit/Write OUTSIDE `.pipeline/` is allowed. This enables N2 executor agents (e.g. `executor-implementer-task`, `executor-fix`, `feature-implementer`) to write production code when spawned by `pipeline-controller`. See the controller prompt for the open/close protocol.

### Security (additive)

- **session-lock**: added Stop hook that marks locks as `status: completed` automatically (F-002).
- **session-lock**: `getActiveLock` now sorts by `created_at` DESC so stale locks don't shadow fresh ones (F-002).
- **session-lock**: tighter `session_id` regex — no leading `.` or `-` (F-004).
- **block message**: rewritten to discourage `rm` as first recourse; now surfaces `/pipeline-orchestrator:pipeline continue` and the Stop-hook auto-cleanup before manual deletion (F-002).
- **exec-window is COOPERATIVE, not cryptographic.** A compromised main LLM could create this file itself. Mitigations: 30-min TTL, human-readable content visible in `git diff`, `gate-decisions.jsonl` audit trail for every open/close. v4 relies on user diff review for integrity, not hook-level enforcement of exec-window creation.

### Documentation

- Renumbered controller prompt CRITICAL REMINDERS section (F-005).
- Smoke test anchors to plugin root via `BASH_SOURCE` so it passes from any cwd (F-003).
- `docs/MIGRATION-v3-to-v4.md` gains a "Known cooperative limitation" section.

### Known limitations (deferred to v4.1)

1. **Exec-window pairing check (NI-3, MEDIUM):** The edit-guard does not verify
   that an `EXEC_WINDOW_OPEN` audit entry exists in `gate-decisions.jsonl`
   before trusting an exec-window file. Trade-off: cooperative model,
   documented in MIGRATION. Future work: require matching audit entry for
   non-cryptographic pairing.
2. **Exec-window TTL of 30 min (NI-4, LOW):** The TTL is not linked to the
   spawning N2 agent's actual lifetime. A short task (30s) leaves a 30-min
   authorization window if the controller forgets to close it. Stop hook now
   cleans it (d9503d8) so crash cases are handled. Future work: per-batch TTL
   configuration.
3. **Controller exec-window protocol is prompt-only (NI-5, LOW):** The
   `pipeline-controller` agent prompt documents the open-before-spawn /
   close-after-return contract, but no automated test verifies that a
   controller instance actually follows it. Future work: BDD scenario that
   asserts exec-window lifecycle.
4. **Non-atomic `.lock` writes (LOW, pre-existing) — RESOLVED in v4.0.0-rc.2:**
   `session-lock-hook.cjs` and `session-cleanup-hook.cjs` now write to a
   pid-suffixed `.tmp` sibling then `fs.renameSync` to the final path. rename
   is atomic on the same filesystem, so concurrent readers can no longer
   observe a truncated/empty lock.
5. **Cleanup loop trusts symlinks (LOW, theoretical) — RESOLVED in v4.0.0-rc.2:**
   `session-cleanup-hook.cjs` now calls `fs.lstatSync` before any read/unlink
   and skips non-regular-file entries with a stderr log. Misplaced symlinks
   under `.pipeline/sessions/` can no longer redirect I/O outside the
   sessions directory.

## [4.0.0-draft.1] - 2026-04-23

### BREAKING

- **Orchestration moved from SKILL.md to `pipeline-controller` agent.** Main LLM no longer orchestrates; it spawns the controller and waits for the final PIPELINE COMPLETE block.
- **Main LLM loses Edit/Write permissions during pipeline sessions.** New `edit-guard-hook` blocks direct file edits outside `.pipeline/` when a session lock is active. Intentional — eliminates the bypass observed in v3.8 where main LLM rationalized "this task is too small for pipeline" and edited directly.
- **SKILL.md shrunk from ~900 lines to ~30 lines.** Full workflow spec moved to `agents/core/pipeline-controller.md`. v3 SKILL preserved as `skills/pipeline/SKILL.v3-reference.md`.

### Added

- `agents/core/pipeline-controller.md` — N1 orchestrator agent, isolated context, tools: Read/Write(.pipeline/**)/Agent/AskUserQuestion
- `.claude/hooks/session-lock-hook.cjs` — UserPromptSubmit hook; creates `.pipeline/sessions/{id}.lock` on `/pipeline` invocation
- `.claude/hooks/edit-guard-hook.cjs` — PreToolUse(Edit|Write) hook; blocks edits outside `.pipeline/` when lock active
- `tests/test_pipeline_controller.md` — BDD scenarios for manual validation
- `.claude/hooks/__tests__/session-lock-hook.test.cjs` — 14 unit tests (TDD + adversarial fix pass)
- `.claude/hooks/__tests__/edit-guard-hook.test.cjs` — 15 unit tests (TDD + adversarial fix pass)
- `.claude/hooks/__tests__/smoke-hooks.sh` — 3 stdin-driven smoke tests for hooks integration
- `.claude/hooks/dispatch-guard.cjs` updated to register `pipeline-controller` FQN

### Unchanged

- All 37 N2 agents (task-orchestrator, information-gate, executor-controller, review-orchestrator, final-validator, etc.)
- All `references/*.md` (gates, audit-trail, confidence, complexity-matrix, sentinel-integration)
- Legacy hooks: `force-pipeline-agents.cjs`, `completion-checklist.cjs`, `sentinel-hook.cjs`, `dispatch-guard.cjs`

### Migration from v3.x

See `docs/MIGRATION-v3-to-v4.md` for upgrade path and rollback instructions.

## [3.8.0] - 2026-04-17

### Added
- **Inline `AskUserQuestion` examples in `commands/pipeline.md`** for all 4 user-decision touchpoints (Phase 1 proposal, TDD scenario approval, per-batch adversarial gate, final adversarial gate). Each example shows the complete structured call with options, `(Recomendado)` labels where applicable, and descriptions explaining trade-offs. Eliminates the prior pattern of "Ask via AskUserQuestion." as a bare reference without shape guidance.
- **USER INTERACTION PROTOCOL blocks added to 11 edge-case agents** (v3.7.0 covered 5 user-facing agents; v3.8.0 extends to agents that may ask in edge cases): `executor-controller`, `executor-implementer-task`, `executor-fix`, `feature-implementer`, `bugfix-diagnostic-agent`, `bugfix-root-cause-analyzer`, `bugfix-regression-tester`, `pre-tester`, `ux-simulator`, `ux-accessibility-auditor`, `ux-qa-validator`. Total coverage: **16 agents** with explicit protocol blocks.

### Fixed
- **Protocol coverage gap from v3.7.0 audit.** v3.7.0 mandated `AskUserQuestion` + recommendation-first globally, but only 5 agents had the detailed block in their spec. Edge-case agents (e.g. executor-implementer-task raising a micro-gate gap, or bugfix-root-cause-analyzer needing evidence-confirmation input) could fall back to prose under LLM improvisation. v3.8.0 closes this gap with targeted blocks in each agent's spec, tailored to its specific interaction mode.

### Notes
- No breaking changes. MINOR bump because the new inline examples and per-agent blocks extend the public contract surface of the controller spec.
- The 12 "pure output" agents (revisores, classificador, zero-context scanners, coordinators) were deliberately not updated — they return structured YAML to the controller and never prompt the user directly. Adding the block there would be misleading bloat. They remain as-is.
- Agent coverage inventory: `information-gate`, `design-interrogator`, `plan-architect`, `quality-gate-router`, `finishing-branch` (v3.7.0) + `executor-controller`, `executor-implementer-task`, `executor-fix`, `feature-implementer`, `bugfix-*` (3), `pre-tester`, `ux-*` (3) (v3.8.0) = 16 agents with USER INTERACTION PROTOCOL blocks.

## [3.7.0] - 2026-04-17

### Added
- **`USER INTERACTION PROTOCOL`** section near the top of `commands/pipeline.md` (right after AGENT DISPATCH PROTOCOL). Mandates that every user decision point in the pipeline use the `AskUserQuestion` tool to render arrow-key selectable options — NEVER free-form prose. For technical questions (multiple viable approaches with trade-offs), the first option must be the agent's recommendation labeled `(Recomendado)` with reasoning in the option description. For confirmation questions (binary yes/no), the recommendation is optional.
- **Agent-level USER INTERACTION PROTOCOL blocks** added to the 5 user-facing agents:
  - `information-gate` — technical vs factual gaps, both via `AskUserQuestion`
  - `design-interrogator` — always recommendation-first (every question is technical by design)
  - `plan-architect` — approve/adjust/reject with plan as recommendation
  - `quality-gate-router` — one `AskUserQuestion` per test scenario, approve as recommendation
  - `finishing-branch` — closeout options (commit/push/keep/discard) with context-dependent recommendation; double-confirm for destructive actions
- Glossary entry **`User Interaction Protocol (v3.7.0+)`** codifying the contract.

### Fixed
- **Prose-prompt anti-pattern** eliminated. Prior versions documented `Ask via AskUserQuestion` but did not explicitly forbid the text-answer alternative. In observed usage, agents occasionally rendered prompts like `"Qual opção prefere? (A / B / C)"` in markdown output and waited for a typed response — which is error-prone and breaks deterministic gate handling. v3.7.0 makes the prohibition explicit with an anti-pattern table.

### Notes
- No breaking changes. All existing `AskUserQuestion` usages continue to work. MINOR bump because the protocol section is a new public contract surface.
- The `(Recomendado)` suffix is Portuguese to match the existing localization convention (options are user-visible in the terminal).

## [3.6.0] - 2026-04-17

### Added
- **`.claude/hooks/dispatch-guard.cjs`** — new `PreToolUse:Skill` hook that intercepts LLM controllers invoking `Skill(<agent-leaf>)` when they meant `Agent(subagent_type: "pipeline-orchestrator:...:<agent-leaf>")`. Denies the call and returns a corrective message with the correct fully-qualified `subagent_type`. Prevents the Phase 0a stall where `Skill(task-orchestrator)` produced `Unknown skill: task-orchestrator` with no guidance on how to fix it.
- **`.claude/hooks/__tests__/dispatch-guard.test.cjs`** — BDD scenario suite (Given/When/Then format) with 7 scenarios and 20+ assertions covering: task-orchestrator deflection, all four folder classes (core, executor, type-specific, quality), legitimate third-party skills pass, plugin-namespaced skills pass, type-confusion guards, non-Skill tools ignored, corrective-message actionability.
- **`AGENT DISPATCH PROTOCOL`** section at the top of `commands/pipeline.md` — makes the dispatch contract visible before any flow instructions. Documents the correct `Agent(subagent_type: "pipeline-orchestrator:<folder>:<leaf>")` pattern with a table of common agent mappings, plus the three known wrong invocations (`Skill`, `SlashCommand`, missing prefix).
- **`hooks.json` PreToolUse:Skill matcher** wired to `dispatch-guard.cjs`.

### Fixed
- **Definitive fix for "Skill(task-orchestrator) → Unknown skill"** LLM-controller confusion observed in production use. Prior versions relied on agent-description prose like *"I'll use the task-orchestrator"* which LLMs occasionally interpreted as a Skill tool call. v3.6.0 addresses this with: (a) runtime hook that denies with actionable corrective message, (b) explicit AGENT DISPATCH PROTOCOL section at the top of the controller spec, (c) BDD test coverage proving the deflection works for all four agent folder classes.

### Notes
- No breaking changes. All existing Agent-tool invocations continue to work identically.
- MINOR bump 3.5.0 → 3.6.0: adds a new runtime hook capability + public protocol section. The AGENT_LEAF_TO_FQN table in `dispatch-guard.cjs` is the source of truth for the 37 agent mappings; adding/removing/moving an agent requires updating this table plus its regression-test entries.
- BDD format validation: each scenario reads as a behavioral specification. Assertions map 1:1 to Given/When/Then prose. No hidden steps.

## [3.5.0] - 2026-04-17

### Added
- **`references/audit-trail.md`** — extracted Phase Transition Summary block template + Gate Decision Log JSONL format (with 8 parse/sanitization rules) from `references/gates.md`. Definitions and operational mechanics now evolve independently. Resolves NAME-1 from v3.4.0 self-test.
- **Table of Contents** in `commands/pipeline.md` — 4-section orientation block with line anchors and reference-file mapping. Resolves QUAL-1 from v3.4.0 self-test.
- **Frontmatter exception doc** on `adversarial-review-coordinator.md` — documents why this `adversarial-*` agent is context-aware (dispatches zero-context children). Resolves ARCH-2 from v3.4.0 self-test per the glossary Agent Naming Convention.
- **`ref: v3.5.0`** field in `marketplace.json` source for pipeline-orchestrator — explicit git-tag pin for supply-chain safety. Partial resolution of SEC-B1-01 (other two plugins in the marketplace deferred).
- **Hook regression tests** expanded 54 → 73 assertions: corrupted-state WARN (RISK-2), `discoverStatePath()` happy path (TEST-1), suffix-match alias branch (TEST-2), extended type-confusion vectors (boolean, object with toString, nested array — SEC-B3-02 codification).

### Fixed
- **RISK-2**: `sentinel-hook.cjs` now emits `SENTINEL WARN` to stderr when the state file exists but cannot be parsed (partial write, concurrent-write race, corruption). Previously was silent fail-open. Still exits 0 for backwards compat.
- **SEC-1 (v3.5 round 2 self-fix)**: parse-error stderr WARN now uses `path.basename()` and the error `name` (e.g. `ParseError`) instead of the absolute path and full error message — avoids leaking secrets that could sit mid-rotation in a partial state file.
- **Test hygiene (QUAL-1 / SEC-3 v3.5)**: test 17 (`discoverStatePath` happy path) replaced a 50 ms busy-wait CPU spin with `fs.utimesSync` to set deterministic mtimes. Eliminates Windows NTFS mtime-granularity flake.
- **Test cleanup (QUAL-2 v3.5)**: `tempDir()` factory now registers a `process.on('exit')` handler that removes all `sentinel-hook-test-*` directories at the end of the run. Stops accumulating OS temp-dir debt across CI runs.
- **QUAL-1 / QUAL-2 (pipeline.md cleanup)**: CRITICAL REMINDERS consolidated from 25 items to 13 by grouping related invariants into 6 concern categories (Infrastructure, Process, Control flow, Review, Evidence, Sentinel). No invariant dropped.
- **CLAR-1 HOTFIX table contradiction**: the `User confirm` row for HOTFIX previously read `Auto-proceed` while the prose required a single emergency confirmation question. Row now reads `1 emergency-confirmation question only`.
- **DEAD-1**: HOTFIX row in the Phase 3b-pre recommendation table clarified with a note explaining that HOTFIX already reduces per-batch adversarial to 2 checklists.
- **ARCH-1 (v3.5 self-fix)**: "Controller-only writes" rule de-duplicated. Previously appeared in `gates.md`, `audit-trail.md`, AND `commands/pipeline.md`. Removed from `gates.md` (a definitions file should not host operational mechanics).
- **Controller self-label**: `PIPELINE CONTROLLER v3.4` → `v3.5` aligned with manifest version.
- **hooks.json SessionStart prompt**: `Pipeline Orchestrator v3.4.0 loaded` → `v3.5.0 loaded`.

### Changed
- **Doc structure:** `references/gates.md` is now definitions-only (Hardness Taxonomy + Gate Registry, 49 lines). Operational audit mechanics live in the new `references/audit-trail.md`. All Grep redirects in `commands/pipeline.md` updated to point at the correct file.
- **Inline Invariants scope (v3.4.0 SEC-1 extension):** now covers `references/audit-trail.md` alongside `references/gates.md` and `references/confidence.md`.
- `pipeline.md` grew from 909 to 938 lines net (+ToC, -consolidated reminders) but is materially more navigable.

### Notes
- No breaking changes. All existing `subagent_type` paths continue to work. Existing `gate-decisions.jsonl` format unchanged — the file moved between reference docs, not its schema.
- Version bump 3.4.0 → 3.5.0 (MINOR): adds new public reference file `references/audit-trail.md` consumed via Grep, plus documentation and test-coverage improvements. Backwards compatible.
- 15 deferred findings from v3.4.0 self-test addressed: 2 HIGH fixed (SEC-B1-01 partial, TEST-1), 6 MEDIUM fixed (RISK-2, QUAL-1, QUAL-2, CLAR-1, NAME-1, ARCH-2), 4 LOW fixed (DEAD-1, SEC-B3-02 codification, SEC-B3-03 review, partial others). Remaining LOW deferred to future releases.

## [3.4.0] - 2026-04-17

### Added
- **Inline Invariants block in `commands/pipeline.md`**: authoritative list of gate names + hardness that overrides any Grep-loaded content from `references/`. Closes SEC-1 from the v3.3.0 self-test (extraction refactor created an untrusted Grep-loaded surface).
- **`references/gates.md`**: SSOT for the Gate Hardness Taxonomy, the full 15-gate Registry, the Phase Transition Summary template, and the Gate Decision Log JSONL format with its 8 parse/sanitization rules. Extracted from `commands/pipeline.md`.
- **`references/confidence.md`**: SSOT for the confidence score calculation, scoring rules, per-phase update contract, and persistence format. Extracted from `commands/pipeline.md`.
- Glossary entries: `Zero-Context Agent`, `Agent Naming Convention` (adversarial-* ⇒ zero-context; executor-* ⇒ context-aware), and `Residual Risk: LLM Prompt Injection` (defense-in-depth rationale).
- `sentinel-hook.cjs` trust-assumption header comment documenting what the hook protects against and what is out-of-scope (expects controller to provide integrity tokens, file locking, etc.).
- Hook regression tests expanded 31 → 54 assertions: near-miss stdin inputs, type-confusion guards, string/number `schema_version` normalization, `AGENTS` constant block, `runHook` `opts.cwd` isolation.

### Fixed
- **SEC-3**: `sentinel-hook.cjs` now emits `SENTINEL WARN` to stderr on unknown `schema_version` instead of silently allowing. Backwards compatible (still exits 0). Operators now detect version mismatches and state-file corruption.
- **SEC-B3-01 (v3.4.0 self-fix)**: `schema_version` as JSON string (`"1"` vs `1`) no longer bypasses the version check. Normalized via `Number()`.
- **Type-confusion guard**: non-string `subagent_type` (numeric, array, object, null) no longer crashes the hook with `.startsWith()` on a non-string.
- **ARCH-002 (v3.3.0 self-test)**: `commands/pipeline.md` controller self-label `PIPELINE CONTROLLER v3.1` → `v3.3` → `v3.3`/v3.4 chain resolved; label now follows the manifest version.
- **ARCH-003 (v3.3.0 self-test)**: duplicate `Mode:` line in the `final-adversarial-orchestrator` OBSERVABILITY banner removed.
- **RISK-003 (v3.3.0 self-test)**: contradiction between the intensity table and Rule 3 in `final-adversarial-orchestrator.md` resolved — Rule 3 now tracks the table.
- **QUAL-2 (v3.3.0 self-test)**: `Step 2f` label (which lived inside Phase 3) renamed to `Step 3-pre`.
- **ARCH-2 (v3.4.0 self-fix)**: `Step 3b-post` renamed to `Step 3b-pre` because it runs BEFORE `Step 3b` (final-validator).
- **ARCH-1 / QUAL-1 (v3.4.0 self-fix)**: duplicated inline Gate Registry table in `pipeline.md` removed; the extracted SSOT in `references/gates.md` is now the single authoritative source.
- **ARCH-2 (v3.4.0 self-fix)**: dangling "Step 1c" cross-reference in `references/confidence.md` replaced with the step-name-independent "pre-decision validation step."
- **Stale threshold log text**: the stale-state warning previously said `threshold: 60s` but the constant was 300s; the text is now derived from the constant.
- **Test hygiene**: `process.chdir()` replaced with `spawnSync({ cwd })` in tests 6/7 — removes a global side effect that could leak across tests. Subagent type paths centralized in a frozen `AGENTS` constant object.

### Changed
- **Marketplace manifest**: `pipeline-orchestrator` source field `"./"` → pinned `{"source": "url", "url": "..."}` matching the other two plugins in the marketplace. Unpinned ref (commit SHA pinning) is deferred — consistent with marketplace convention.
- **Intensity table in `final-adversarial-orchestrator.md`**: headers translated from mixed PT/EN to pure English (`Disponível`/`Recomendação`/`Intensidade` → `Available`/`Recommendation`/`Intensity`).
- **Trust model (SEC-2)**: `sentinel-hook.cjs` header now documents explicit trust assumption on `sentinel-state.json` and the controller-level mitigations that are out-of-hook-scope. No runtime change; documentation-only.

### Notes
- No breaking changes. Existing pipelines and `subagent_type` paths continue to work. The Grep-redirect pattern in `commands/pipeline.md` means LLM controllers running the skill now perform one extra grep per gate/confidence lookup — negligible at these file sizes.
- `commands/pipeline.md` reduced from 999 → 909 lines (-9%). Remaining size largely comes from the 4-phase flow spec, CRITICAL REMINDERS, and output format templates — extracting those would require coordinated test updates and is deferred.
- Version bump 3.3.0 → 3.4.0 (MINOR): adds new public reference files (`references/gates.md`, `references/confidence.md`) consumed by Grep, plus backwards-compatible hook hardening. Nothing existing was renamed or removed in a breaking way.

## [3.3.0] - 2026-04-17

### Added
- **ARCH-003 / ADV-001**: New `adversarial-quality-reviewer` agent (`pipeline-orchestrator:executor:type-specific:adversarial-quality-reviewer`). Context-independent (ZERO prior context) quality-focused reviewer for maintainability, clarity, testability, dead-code detection, and naming. Paired with `adversarial-security-scanner` and `adversarial-architecture-critic` in the `final-adversarial-orchestrator` trio.
- Regression test suite at `.claude/hooks/__tests__/sentinel-hook.test.cjs` — 14 test cases / 31 assertions codifying the public contract of `sentinel-hook.cjs` (bootstrap whitelist, state-file divergence, circuit breaker, stale-state detection, new-agent routing). No external dependencies; runs under vanilla Node.

### Fixed
- **ADV-002**: `final-adversarial-orchestrator` no longer delegates to per-task / per-batch reviewers (`adversarial-batch`, `architecture-reviewer`, `executor-quality-reviewer`) which run WITH context. The three final-review slots now point to the three context-independent adversarial scanners: `adversarial-security-scanner`, `adversarial-architecture-critic`, `adversarial-quality-reviewer`. This eliminates the silent dependency on external-plugin agents (e.g., `code-review:code-reviewer`) that was observed in v3.2.1 when the LLM controller improvised to fill the missing quality slot.
- Architecture diagram in `commands/pipeline.md` updated to name the three final-review agents explicitly.

### Changed
- README Project Structure tree now shows `type-specific/` as 17 domain expert agents (was 16) and documents the four adversarial specialists (coordinator + security + architecture + quality).

### Notes
- No breaking changes. Existing pipelines continue to work. The new agent is only invoked by `final-adversarial-orchestrator`; per-batch review flows are unchanged.
- `sentinel-hook.cjs` source was not modified in this release — the root cause of the v3.2.1 `PreToolUse:Agent` blocked spawns was the spec depending on agents that did not exist, not the hook itself. The hook's narrow scope (intercepting only `pipeline-orchestrator:*` agents) is preserved as intentional.

## [3.2.1] - 2026-04-17

### Fixed
- **ARCH-002**: Corrected ambiguous executor agent count in README Project Structure tree. Line 254 now reads `# 5 + feature-implementer (type-specific/)` instead of `# 6 execution agents`, accurately reflecting that `feature-implementer.md` lives under `executor/type-specific/` for pipeline reuse rather than as a standalone executor.
- **DOC-003**: Aligned README `core/` tree with filesystem — added missing `adversarial-batch` entry (8/8 agents now listed).
- **DOC-004**: Aligned README `quality/` tree with filesystem — removed misplaced `adversarial-batch` (it lives in `core/`), added missing `final-adversarial-orchestrator` (7/7 agents now listed).
- **DOC-005**: Bumped README version badge from `version-3.2.0-blue` to `version-3.2.1-blue` to match the manifest version.

### Documentation
- Added missing release date to the `[3.2.0]` CHANGELOG entry per Keep a Changelog 1.1.0.

## [3.2.0] - 2026-04-16

- Initial public release tracked in this changelog. See git history for prior changes.
