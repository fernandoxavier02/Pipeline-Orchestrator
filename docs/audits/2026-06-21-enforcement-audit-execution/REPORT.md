# Enforcement Determinism Audit — Execution Report (2026-06-21)

> **VERDICT (line 1):** The Pipeline-Orchestrator enforcement layer is **fundamentally sound**; the audit found **specific, well-scoped gaps** and this run **fixed the four highest-impact, locally-provable ones** (DoD #6, #12, #17, #2) with RED→GREEN tests, an adversarial review loop that converged at **0 CRITICAL / 0 HIGH**, and a combined end-to-end execution test. Three deeper items (DoD #8 consume-once, #14 Stop-block, #9/#10 parent-child) are **documented residuals** — shipping them now would be either dormant or deadlock-risky and needs a live `--plugin-dir` session to confirm. **No deterministic guarantee is claimed where it would depend on the agent telling the truth.**

- **Claude Code version tested:** `2.1.185` (`claude --version`).
- **Scope:** Claude Code artifact only (`claude-code/Pipeline-Orchestrator`). No Codex/Cursor/Gemini/Copilot/OpenCode/Paperclip/Agent-SDK/MCP touched. Node + CommonJS + `.cjs` preserved. No commit/push/tag/publish/version-bump.

---

## 1. Method

Three stages, the fan-out/parallel ones run as deterministic multi-agent **workflows**:

1. **Phase 0/1 — authority map + 32-item Definition-of-Done gap audit** (5 parallel readers over every hook/lib/agent/config → independent adversarial verification of each consequential finding → synthesis). 38 findings, 12 independently verified.
2. **Implementation** — three cohesive batches, each TDD RED→GREEN with a co-update of any pre-existing test that encoded the old behavior.
3. **Adversarial review loop** — 5 independent zero-context reviewers per the batch set → fix to convergence → 3-reviewer final **integration** review.

Authority sources: the **observed local runtime** (`claude --version/--help`, hooks executed as real processes), the harness facts embedded in the task spec (re-confirmed locally where possible), and the repo's own code/tests. Markdown/docs were treated as **intent**, never as proof. The official `code.claude.com/docs` pages were **not** fetched live in this run (no network fetch was performed); harness behaviors that the docs assert but I could not execute locally are flagged as residuals to confirm on a live session — see §8.

---

## 2. Root cause (one sentence)

Step completion was inferred from *"an Agent of leaf X returned"* — the `PostToolUse:Agent` stamp keyed only off `subagent_type` and **never read the agent's actual result** — so a no-op / errored / still-launching agent could satisfy the ordering prerequisite the next phase's gate reads, and human-gate decisions were recorded by controller **prose** rather than from the real `AskUserQuestion` result.

---

## 3. Phase-0 probe results (literal)

| Probe | Result |
|---|---|
| `claude --version` | `2.1.185 (Claude Code)` |
| `claude plugin validate . --strict` | `✔ Validation passed` (before and after changes) |
| Baseline `npm test` (no env) | `172 passed / 7 failed / 179` — 7 failures all Langfuse/vendoring env |
| Baseline `npm test` (`CLAUDE_PLUGIN_ROOT` set) | `173 passed / 6 failed / 179` (Langfuse count is env/order-flaky, 5–7) |
| Hook same-event parallelism | **Confirmed by code, not assumed:** `hooks/hooks.json` registers 8 `PreToolUse:Agent` hooks; 7 are independent **read-only deny-gates**, and the *only* authoritative writer is the single `PostToolUse:Agent` stamp (which funnels all writes through `lib/exclusive-lock.cjs` + HMAC re-sign). So there is **no order dependency among parallel hooks** (DoD #1) and **one writer per critical event** (DoD #2) — except the dev-only duplicate Stop registration this run removed. |
| `SubagentStop` / `SubagentStart` registered? | **None** (grep empty). The architecture is `PostToolUse:Agent` STAMP + `PreToolUse:Agent` GATE, not a Stop-event commit point. |
| Anthropic API key present? | **No** (only third-party LLM keys). The live `claude --plugin-dir -p` run that spawns real subagents **cannot execute here** — see §8 manual script. |
| Working tree line endings | **Mixed**: `.cjs` hooks are LF, agent `.md` files are CRLF. New code is CRLF-safe (`split(/\r?\n/)`). The ~588-file `git status` churn is pre-existing CRLF↔LF only (`git diff --ignore-cr-at-eol` is empty) — **not touched**. |

---

## 4. 32-item Definition-of-Done scorecard (post-fix)

| # | DoD item | Status | Note |
|---|---|---|---|
| 1 | no parallel-hook order dependency | **satisfied** | read-only deny-gates; single writer |
| 2 | one writer per critical event | **fixed** | removed dev-only duplicate Stop registration (B3) |
| 3 | dispatch correlated by tool_use_id | partial (design) | STAMP/GATE design has no per-call correlation surface; residual |
| 4 | SubagentStart not authority | satisfied | no SubagentStart hook exists |
| 5 | SubagentStop blocks bad completion | n/a (arch) | tracked as #6 (stamp-on-return) |
| 6 | no step stamped just because Agent returned | **FIXED** | `step-ledger-stamp` now requires a usable result (B4) |
| 7 | missing mandatory evidence blocks | partial | producer-side fail-open by design (progressive activation) |
| 8 | stale result doesn't unlock new step | partial | verdict files are fixed-name; **dormant** (no producers) — residual B5 |
| 9 | leaf agents cannot spawn | partial | only 3 orchestrators declare `Agent`; 37 no-`tools` agents inherit it — residual B7 |
| 10 | parent-child validated in code | partial | name uniqueness locked; full check needs a producer — residual B7 |
| 11 | subagents don't depend on AskUserQuestion/Plan | **locked** | allowlist contract test; live confirmation residual |
| 12 | human gates from real tool result | **FIXED** | new `PostToolUse:AskUserQuestion` recorder (B1) |
| 13 | green close mandatory (code-changing) | partial | opt-in `PIPELINE_REQUIRE_GREEN_CLOSE` (anti-deadlock) |
| 14 | normal Stop blocks incomplete run | violated→residual | Stop hooks are soft by design; default-on block is deadlock-risky — residual B6 |
| 15 | interruption/StopFailure recoverable | satisfied | crash-safe, idempotent stop-hook |
| 16 | cleanup not parallel with Stop decision | partial | latent (no Stop hook decides today); coupled to B6 |
| 17 | no unsupported config as enforcement | **FIXED** | removed `subagent_permissions`/`max_depth`/`max_parallel_agents` (B2) |
| 18 | `plugin validate --strict` passes | **satisfied** | passes with all changes |
| 19 | `--plugin-dir` registers skills/agents/hooks | unverified | needs live session (no API key) — §8 |
| 20 | unit/hooks/regression/build/E2E pass | **satisfied** | 179/184; 5 failures pre-existing Langfuse env |
| 21 | no other-harness changes | satisfied | only `.claude/`, `hooks/`, `tests/` touched |
| 22 | no publish/commit/bump | satisfied | none performed |
| 23–32 | process (batches/ATDD/TDD/review/convergence) | satisfied | see §5–§7 |

---

## 4b. Coverage by spec Phase — explicit FEITO / PARCIAL / NÃO FEITO

This run was a **gap-driven subset**, not a literal execution of the spec's 17-phase ideal architecture. The audit (Phase 0/1) covered **100%** of the surface; **implementation** was scoped to what was broken AND safe to fix under the spec's own "menor diff / não reescrever a arquitetura" rule. The existing v8.9.0 design (STAMP→GATE on HMAC state) is a *different but valid* realization of the same guarantees, so the spec's manifest/dispatch/result-block/SubagentStop phases were **deliberately not built** — they would be a large rewrite the audit found unnecessary.

| Fase | Spec intent | Status | Why / what shipped |
|---|---|---|---|
| 0 — Baseline & probes | run baseline, prove hook parallelism | **FEITO** (live `--plugin-dir` PARCIAL — no API key) | version, validate, npm test, parallelism proven by code |
| 1 — Authority map & races | map every hook, find races | **FEITO** | 5-reader workflow; found dup-Stop + cleanup-vs-decision race |
| 2 — Remove unsupported contracts | strip settings/frontmatter the harness ignores | **FEITO** | removed `subagent_permissions` trio + dup Stop; frontmatter locked; permissionMode/hooks/mcpServers already 0 |
| 3 — Single executable workflow manifest | one `workflow-manifest.cjs` SSOT | **NÃO FEITO** | existing `step-ledger` map (~9 spine agents) kept; building a new consolidated manifest is an architectural rewrite — documented |
| 4 — One authoritative writer per event | composite single-writer hooks | **PARCIAL** | confirmed PostToolUse:Agent already single-writer; removed the dup Stop writer; did NOT merge the Stop fan-out into one composite hook (coupled to B6) |
| 5 — Dispatch contract (tool_use_id) | Pre-side dispatch record by tool_use_id | **NÃO FEITO** | DoD#3 residual — no Pre-side dispatch writer; payload carries no spawning-agent identity; documented |
| 6 — SubagentStart limited role | telemetry only | **FEITO (by absence)** | no SubagentStart hook exists; nothing uses it as authority |
| 7 — Strict result contract (`PIPELINE_AGENT_RESULT_V1`) | a parsed JSON result block | **NÃO FEITO** | added a result-PRESENCE check (B4) instead; the strict JSON-block contract is a larger design — documented |
| 8 — SubagentStop as commit point | a SubagentStop validator hook | **NÃO FEITO (equivalent risk addressed elsewhere)** | no SubagentStop hook; the "Agent-returned ≠ done" risk (#6) was fixed in the PostToolUse stamp instead |
| 9 — Machine-produced evidence | deterministic collectors | **PARCIAL** | existing checkpoint/domain evidence kept; no new collectors added |
| 10 — Human gates in main agent | full active-gate state machine | **PARCIAL** | B1 records the real answer (DoD#12); did NOT build the PreToolUse:AskUserQuestion validation / active_user_gate machine |
| 11 — Eliminate global verdict files | per-dispatch result store | **NÃO FEITO** | B5 consume-once deferred — dormant (no producers write verdict files today) |
| 12 — Fail-closed without deadlock | exceptions in manifest, arm hardening | **PARCIAL** | existing arm gate kept; green-close stays opt-in (changing defaults risks deadlock) |
| 13 — Stop gate & honest recovery | single Stop gate that blocks incomplete | **PARCIAL** | single Stop registration FIXED; the Stop-time block is deferred (B6, deadlock-risky) |
| 14 — Plugin runtime & distribution | packaging + move CLAUDE.md rules | **PARCIAL** | `npm pack`/`validate` verified (new hook ships, settings doesn't); did NOT relocate CLAUDE.md rules; live `--plugin-dir` not run |
| 15 — Dynamic Workflows spike | read-only evaluation | **NÃO FEITO** | out of the safe-scope priority this run |
| 16 — Tests (A–K matrix) | full test matrix incl. live E2E | **PARCIAL** | A/B pure+hook-as-process ✓, G human-gate ✓, combined E2E ✓; the live runtime E2E (I) NOT run (no API key) |
| 17 — Adversarial review | 3 independent final reviews | **FEITO** | 5 per-batch reviewers (converged) + 3 final integration reviewers (clean) |

**Bottom line:** of the 18 phases (0–17) — **5 FEITO** (0, 1, 2, 6, 17), **7 PARCIAL** (4, 9, 10, 12, 13, 14, 16), **6 NÃO FEITO** (3, 5, 7, 8, 11, 15). The NÃO-FEITO set is the spec's "ideal rewrite" architecture (single manifest, tool_use_id dispatch contract, strict result block, SubagentStop commit, per-dispatch result store, dynamic-workflows spike), intentionally not built per the minimal-diff rule; each is documented for a future, live-confirmed iteration.

---

## 5. Batches shipped (RED→GREEN, minimal diff)

**Batch SETTINGS (DoD #17 + #2)** — `.claude/settings.json` reduced to `$schema` + an honest note: removed the Claude-Code-ignored `subagent_permissions`/`max_depth`/`max_parallel_agents` trio (zero code references — confirmed false enforcement) and the duplicate `Stop` registration (canonical single registration stays in the shipped `hooks/hooks.json`). Co-updated `tests/regression/v7.1.0/F6_settings_json.cjs` (it asserted the now-removed block). New `tests/contracts/settings-enforcement-hygiene.test.cjs`. RED proven (3/3 fail before) → GREEN.

**Batch STAMP (DoD #6 — the core "agents skip steps" bug)** — `.claude/hooks/step-ledger-stamp.cjs` gained pure `hasUsableResult(toolResponse)` + `stampRequiresResult()`; the generic governed-step stamp now declines when the agent returned no usable result (absent / `is_error` / `error` / `interrupted` / `async_launched` / negative `status` / empty string). Default-on; `PIPELINE_STAMP_REQUIRE_RESULT=off` restores legacy. Verdict-file branches and fix-loop/batch-review counters are untouched (they fire on return by design). Co-updated `tests/regression/v8.7.0/F7_step_ledger_stamp_live.cjs` (its fixtures sent no `tool_response` and asserted a stamp — that *was* the bug). New `.claude/hooks/__tests__/step-ledger-stamp-requires-result.test.cjs` (pure + hook-as-process). RED proven (7/9 fail) → GREEN (10/10).

**Batch HUMAN-GATE (DoD #12)** — new additive `.claude/hooks/human-gate-record.cjs` (`PostToolUse:AskUserQuestion`) records the real user answer (from `tool_response`, correlated by `tool_use_id`) into `{run-dir}/gate-decisions.jsonl` via the canonical `lib/gate-decision-writer.cjs`. A `PostToolUse` observer cannot block → zero deadlock risk. Registered in `hooks/hooks.json`. New `.claude/hooks/__tests__/human-gate-record.test.cjs`. RED proven → GREEN (6/6, mutation-verified).

**Batch FRONTMATTER (DoD #9/#10/#11)** — new drift-lock `tests/contracts/agent-frontmatter-contract.test.cjs`: enforces unique agent names (= the `agent_type` hooks see), the `Agent`-tool allowlist (only the 3 orchestrators), the `AskUserQuestion` allowlist, and zero harness-ignored keys (`permissionMode`/`hooks`/`mcpServers`). No agent prose changed (a blind removal would risk the working clarification/gate flow). Mutation-verified (granting `Agent` to a leaf agent fails the test).

**Combined E2E** — `.claude/hooks/__tests__/e2e-enforcement-chain.test.cjs` composes the real stamp process with the real `decideAgentSpawn` gate lib: a no-op agent does not stamp **and** the gate then denies the next phase (DoD #6); a real result advances and the gate allows; an `AskUserQuestion` turn is recorded as an auditable `HUMAN_GATE` (DoD #12).

---

## 6. Adversarial review — findings & convergence

**Per-batch review (5 independent zero-context lenses):** first cut = **0 CRITICAL, 0 HIGH**, 1 MEDIUM, 3 LOW, 5 INFO — all closed in one fix cycle (well within the 3-cycle cap):

- **TEST-1 (MEDIUM):** the human-gate test pinned the `tool_use_id` but not the *answer text* (a mutant dropping the answer survived). → Added an answer-text assertion + a second-answer case; **mutation-proven** (dropping the answer now fails 2 tests).
- **SEC-1 / ARCH-1 (LOW):** the "can never deadlock" comment overstated safety. → Corrected to the true invariant (declining blocks the next governed spawn under deny mode, recovered by re-dispatch or `PIPELINE_STAMP_REQUIRE_RESULT=off`). Behavior intentionally kept strict — a false-negative *blocks* (safe), a false-positive *lets skipping happen* (the user's actual complaint).
- **CONC-1 (LOW):** empty-string false-negative. → Documented as intentional (empty result = no visible work); added a regression locking benign envelopes (`{status:'completed', content:[...]}`) as **usable** so the classifier can't be over-tightened later.
- **SEC-2 / HG-1 / ARCH-2 (INFO):** `HUMAN_GATE` decision is `CONFIRMED` regardless of approve/reject. → Added a CONTRACT comment + test note that `HUMAN_GATE` must never be used as an enforcement gate that branches on the decision value (it is AUDIT-class observation only; deriving APPROVED/REJECTED is deferred to a confirmed runtime answer shape).

**`BATCH_CONVERGENCE_VERDICT = APPROVED`** for SETTINGS, STAMP, HUMAN-GATE, FRONTMATTER (derived from: 0 open CRITICAL/HIGH, every finding addressed with a test, suite green).

**Final integration review (3 lenses — security, concurrency, harness):** **all three returned `clean`, 0 CRITICAL / 0 HIGH.** One INFO note (INFO-1): the Langfuse pre-existing failure **count is environment-flaky (5–7)** depending on whether `CLAUDE_PLUGIN_ROOT` is set and the vendored SDK bundle is present; the reviewer's run saw 7 (the extra two being `v7.3.0/F9` + `v7.3.0/F10`, same Langfuse family), none importing any changed file, and independently re-confirmed the 5 new test files pass for real (`e2e-enforcement-chain 3/3`, `human-gate-record 6/6`, `step-ledger-stamp-requires-result 10/10`, `settings-enforcement-hygiene 3/3`, `agent-frontmatter-contract 6/6`). Doc-accuracy fix applied below. **`FINAL_INTEGRATION_VERDICT = APPROVED`** — the composition introduced no defect.

---

## 7. Commands executed (literal)

```
claude --version                         -> 2.1.185 (Claude Code)
claude plugin validate . --strict        -> ✔ Validation passed
npm test (baseline, no env)              -> 172 passed / 7 failed / 179   (all 7 Langfuse env)
npm test (final, CLAUDE_PLUGIN_ROOT set) -> 177-179 passed / 5-7 failed / 184   (failing count is Langfuse-env-flaky across runs; +5 new test files, all green; observed 179/5, 178/6, 177/7)
npm pack --dry-run                       -> ships .claude/hooks/human-gate-record.cjs + hooks/hooks.json + step-ledger-stamp.cjs; .claude/settings.json NOT shipped (dev-only)
node <each new/edited test>              -> GREEN (per §5)
```

**Pre-existing failures (NOT introduced here) — count is env-flaky 5–7** depending on `CLAUDE_PLUGIN_ROOT` and whether the vendored SDK bundle is present. The full Langfuse/vendoring family: `v7.3.0/F8-langfuse-disabled-noop`, `v7.3.0/F9-langfuse-span-lifecycle`, `v7.3.0/F10-langfuse-sanitizer`, `v7.4.2/F1-langfuse-bundle-present` (vendored `node_modules/mustache` absent in this checkout), `v7.4.2/F2-require-resolves-without-global`, `v7.6.0/F2-score-writer`, `v7.9.3/F14-langfuse-project-isolation`. **None import any enforcement-layer file changed by this run.**

---

## 8. Harness limitations & residual risks (honest)

- **No live `--plugin-dir` E2E here** (no Anthropic API key). DoD #19 (runtime hook/agent/skill registration) and the full interactive subagent E2E are **unverified** locally. `plugin validate --strict`, `npm pack`, and hook-as-process tests are the local substitutes. **Manual script** to run on an authenticated machine:
  ```
  cd claude-code/Pipeline-Orchestrator
  claude --plugin-dir . --debug hooks -p "/pipeline-orchestrator:pipeline fix a trivial bug"
  # observe: hooks register; spawn a governed agent that returns nothing -> next phase denied;
  #          answer an AskUserQuestion -> a HUMAN_GATE line appears in the run's gate-decisions.jsonl
  /reload-plugins ; /hooks ; /agents ; /doctor
  ```
- **DoD #6 is a best-effort heuristic.** `hasUsableResult` cannot perfectly distinguish a real no-op from success; the exact error/interrupt `tool_response` shape Claude Code emits should be confirmed live before tightening `NEGATIVE_STATUS`. Strict-by-default is the correct bias for "don't let agents skip"; the `=off` escape is the operator recovery.
- **DoD #11 (subagents + AskUserQuestion).** Whether the controllers (which run as subagents) can actually invoke `AskUserQuestion` in 2.1.185 is asserted by the docs but **not proven locally**; the plugin demonstrably ships with controllers doing so, so the contract test *locks the set* rather than removing it. Confirm on a live session.
- **Residual batches (designed, not shipped — would be dormant or deadlock-risky):**
  - **B5 (DoD #8 consume-once verdict files):** no producer writes verdict files today; shipping an unlink now is dormant and risks the live domain/batch-review reads. Ship with adversarial review of read/unlink ordering once producers exist.
  - **B6 (DoD #14 Stop-time block):** a default-on Stop block risks teardown deadlock and re-opens the cleanup-vs-decision race (DoD #16, `session-cleanup` runs parallel in the Stop fan-out). Ship only opt-in/default-off *after* moving cleanup out of the parallel Stop group.
  - **B7 (DoD #9/#10 parent-child / leaf-spawn):** needs a controller-stamped `allowed_children` surface that does not exist; the `PreToolUse` payload carries no authenticated spawning-agent identity. The frontmatter contract closes the explicit-grant half; the inherited-tools half (37 no-`tools` agents) needs either per-agent tool lists or that producer.

---

## 9. Steps for a future publication (out of scope this run)

A future release requires a version bump (`.claude-plugin/plugin.json` is explicit) across the lockstep surfaces, a CHANGELOG entry, and the standard marketplace/npm publish — none performed here.
