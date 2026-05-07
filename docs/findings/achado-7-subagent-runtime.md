# Achado #7 — Subagent runtime tool-inventory limitation

**Status:** ROOT CAUSE CONFIRMED 2026-05-07T23:50Z via empirical probe — architectural mitigation chosen (M-2 Skill dispatch + M-1 hoisted gates). Implementation deferred to v5.2.
**Severity:** CRITICAL.
**Discovered:** 2026-05-07 during dogfood test of v5.1.0 (run-id `001-fix-6-contract-drift-findings`).
**Authority:** This document is the canonical home for the finding. The original observation lives in `pipeline-runs/001-fix-6-contract-drift-findings/01-spec/supplement-achado-7.md`; this file extracts the finding into a permanent location for downstream consumers.

---

## TL;DR

Tools declared in an agent's frontmatter `tools:` list are not all reachable at runtime when the agent is dispatched as a subagent. Specifically observed: `AskUserQuestion` and `Agent` are unavailable inside subagents (`pipeline-orchestrator:core:brainstorm-controller`, `pipeline-orchestrator:core:pipeline-controller`). Tools confirmed working: `Read`, `Write`, `Glob`, `Grep`, `Bash`. Tools likely also denied (unverified): `Task`, `EnterPlanMode`, possibly others.

The plugin's v5.1 multi-agent architecture, which assumes `pipeline-controller` can dispatch task-orchestrator, information-gate, plan-architect, executor-controller, and that executor-controller can in turn dispatch implementer/reviewer/etc., **does not work end-to-end** under this constraint. The "37 agents" graph cannot be traversed beyond depth 1.

## How the finding was reproduced

1. **First data point — AskUserQuestion (brainstorm-controller).** Dogfood ran `/pipeline-orchestrator:brainstorm` with `--no-impl`. The brainstorm-controller subagent reached step-01-explore where it should ask the user 7 questions via `AskUserQuestion`. Per the agent body, the tool was declared in frontmatter (`tools: ..., AskUserQuestion, ...`). At runtime the agent fell back to "numbered prose options" and recorded each answer as a working default. See `pipeline-runs/001-.../00-brainstorm/02-explore.md` mode-note section for the in-run disclosure.
2. **Second data point — Agent (pipeline-controller).** Subsequent `/pipeline-orchestrator:bugfix --resume 001-...` dispatched pipeline-controller as a subagent with HALT_AT=phase_1_5_plan_emit. Pipeline-controller reached Phase 1.5 where it should spawn `plan-architect`. Direct quote from its tool result: *"The `Agent` tool is **unavailable** in this subagent runtime — exactly the Achado #7 contract violation this pipeline is fixing. Plan-architect could not be spawned as a subagent."* The controller adapted by synthesizing the IMPLEMENTATION_PLAN from existing artifacts.

Both data points are recorded in `pipeline-runs/001-fix-6-contract-drift-findings/manifest.yaml.notes` and `01-spec/supplement-achado-7.md`.

## Root cause — CONFIRMED 2026-05-07T23:50Z

**Hypothesis (a) confirmed: Claude Code harness limitation on subagent tool inventory.**

Empirical probe dispatched a generic-purpose subagent with the explicit task of attempting each suspected tool and reporting reachability. Results:

| Tool | Probe result | Evidence |
|---|---|---|
| `AskUserQuestion` | DENIED | Not in subagent's deferred-tools manifest; `ToolSearch(select:AskUserQuestion)` returns "No matching deferred tools found" |
| `Agent` | DENIED | Same — not in manifest, ToolSearch yields no schema |
| `EnterPlanMode` | DENIED | Same — not in manifest |
| `Skill` | AVAILABLE | Present in subagent's top-of-prompt tool list with full JSONSchema |
| `Task*` family (Create/List/Get/Stop/Update) | DEFERRED-RESOLVES | Loadable via ToolSearch, invocations succeed |
| `WebFetch`, `WebSearch` | AVAILABLE | Live calls succeeded |

**Conclusion:** `AskUserQuestion`, `Agent`, and `EnterPlanMode` are stripped from the subagent's tool manifest at the runtime level — not denied at call-time, not deferred-but-resolvable, simply absent. The harness pre-filters subagent tool inventories. There is no plugin-side action that resurrects these tools inside a subagent context.

The original three hypotheses are now resolved:

1. **CONFIRMED — Claude Code harness limitation on subagent tool inventory.**
2. **RULED OUT — Trained-prior fallback.** Agents that did invoke ToolSearch saw "no matching tools" — not a training artifact.
3. **RULED OUT — Deferred-tool / ToolSearch issue.** ToolSearch itself works; the tools just aren't in the deferred manifest.

## Architectural mitigation paths

Each path resolves the contract violation but at different cost / blast radius. Choosing requires a Phase F-replacement design exercise.

### M-1 — Flatten the architecture

Refactor pipeline-controller from "subagent that dispatches further subagents" to "blueprint that the main LLM (parent context) executes step-by-step". The "controller" becomes a structured document; orchestration happens in the parent where Agent and AskUserQuestion both work.

- **Pros:** maximally aligned with runtime reality. AskUserQuestion + Agent both available throughout. No need to invent workarounds.
- **Cons:** invasive — every reference to "spawning N1 / N2 / N3 chains" in spec must be rewritten. Loses the narrative of "isolated context per agent" that part of v5.1's marketing relies on.
- **Estimated effort:** 30-60 hours of spec rewriting + test updates.

### M-2 — Skill-based dispatch

Replace `Agent(subagent_type: ...)` calls with `Skill(skill: ...)` calls. Skills run in the parent context (verified: skills surfaced in this conversation work). Many of the 37 "agents" could become skills.

- **Pros:** preserves the multi-step structure. Skills already exist as a parallel concept in v5.1.
- **Cons:** requires re-frontmattering many agents as skills (different invocation contract, different runtime semantics around persistence and isolation). Some agents whose work depends on isolated context would lose that property.
- **Estimated effort:** 20-40 hours.

### M-3 — Synthesis pattern (already adopted ad-hoc by pipeline-controller)

Subagents work from artifacts produced by upstream subagents instead of dispatching peers. Pipeline-controller's adaptive plan synthesis is the prototype.

- **Pros:** zero contract change for already-completed subagents. Lowest invasiveness.
- **Cons:** limited applicability. Works for plan-architect because spec-tasks artifacts exist. Does NOT work for executor-controller because no upstream artifacts exist; executor needs to actually run code.
- **Estimated effort:** 10-15 hours per applicable subagent. Partial coverage only.

### M-4 — Document the constraint (zero-fix path)

Acknowledge that v5.1's multi-agent claim is aspirational; ship documentation describing which dispatches actually work and which require parent-context execution. Update plugin marketing to match.

- **Pros:** zero engineering effort. Honest about reality.
- **Cons:** abandons the marketing claim. Some users may have purchased / installed expecting the multi-agent flow. Backlash risk.
- **Estimated effort:** 4-8 hours of doc updates.

## Recommended path — M-2 (Skill dispatch) + M-1 partial (hoisted gates)

Given the empirical evidence, the architectural fix combines two of the four documented paths:

**M-2 base:** replace `Agent(subagent_type: ...)` calls with `Skill(skill: ...)` for any agent that needs to dispatch peer logic. The probe confirmed `Skill` is available in subagent runtime — this is the only path that preserves the multi-step delegation pattern of v5.1 without requiring AskUserQuestion or nested Agent.

**M-1 partial — hoisted gates pattern:** any user decision (formerly via subagent's AskUserQuestion) becomes a `GATE_REQUEST` block in the subagent's tool result. The parent (main LLM) receives the structured request, invokes `AskUserQuestion` in its own context (where it works), and re-dispatches the subagent (or moves to the next step) carrying the answer. This is the pattern already prototyped in `pipeline-runs/001-fix-6-contract-drift-findings/pre-approvals.yaml` — formalize it as the standard.

**What stays as-is (M-3 synthesis already adopted):** when an upstream subagent's artifacts already contain the information another agent would have produced, synthesize from artifacts instead of dispatching the peer. Pipeline-controller's plan synthesis from spec-tasks output is the canonical example. Keep as fallback when M-2 isn't applicable.

**M-4 (document the constraint) is now superfluous** — the constraint is documented in this file, but the architecture will be fixed in v5.2 rather than abandoned.

## Implementation outline for v5.2 (high-level)

1. Identify all `Agent(subagent_type: ...)` call sites in plugin agent bodies. Most live in `agents/core/pipeline-controller.md`, `agents/core/brainstorm-controller.md`, `agents/executor/executor-controller.md`. Estimated ~25-40 dispatch points across 5-8 agent files.
2. For each call site, classify: (a) can be replaced by Skill dispatch (target M-2), (b) can be replaced by artifact synthesis (M-3 fallback), or (c) is a user-decision gate that must be hoisted (M-1 partial).
3. Standardize a `GATE_REQUEST` schema for hoisted gates: `{type, header, question, options[], context_for_parent}`. Subagents emit this in tool results; parent parses and invokes AskUserQuestion.
4. Migrate hooks (`sentinel-hook`, `dispatch-guard`, `force-pipeline-agents`) to detect Skill calls in addition to Agent calls. Hooks currently key on Agent tool name pattern.
5. Update `references/team-registry.md` to mark each of the 19 agents as "skill-dispatchable" or "parent-only" based on the migration in step 2.
6. Add an integration test that dispatches a subagent and verifies it does NOT attempt AskUserQuestion / Agent / EnterPlanMode (regression guard).

Estimated v5.2 effort: 25-40 hours (matches the M-2 estimate from the original supplement).

## Open questions remaining (smaller scope after probe)

1. **Empirical scope of denial.** Which exact tools are denied to subagents? The list determines feasibility of every mitigation path. Run a systematic probe: dispatch a synthetic subagent that attempts each tool in order and records errors / fallbacks.
2. **ToolSearch from inside subagent.** Does invoking `ToolSearch(query: "select:AskUserQuestion")` from inside a subagent body resolve the deferred tool? If yes, hypothesis 3 partially holds and a 1-line fix per agent (preface with ToolSearch call) would suffice. If no, hypothesis 1 is confirmed.
3. **Skill-vs-Agent semantics for "isolated context".** Do Skills run in a separate context from the parent, or do they share context? This determines whether M-2 preserves the audit-trail integrity that v5.1 sells.
4. **Hook integration.** The `sentinel-hook`, `dispatch-guard`, `force-pipeline-agents` hooks all assume Agent tool calls. Under M-2 (Skill dispatch), what's the migration path for those hooks?
5. **User expectations.** What is the user's tolerance for an architectural change vs. a "we documented the limitation" outcome? This is a product decision, not a technical one.

## Workaround in use (until decided)

The dogfood test itself adopted a working compensation: when AskUserQuestion is needed, the parent (main LLM) collects the answers via outer-context AskUserQuestion and persists them to a `pre-approvals.yaml` file inside the run-dir. The dispatched subagent then reads pre-approvals.yaml at each gate instead of attempting AskUserQuestion. This pattern is documented in `pipeline-runs/001-fix-6-contract-drift-findings/pre-approvals.yaml` and is a temporary measure — it does NOT discharge the contract violation.

## Decision history

- 2026-05-07T21:25Z — Brainstorm-controller falls back silently. AskUserQuestion-only finding (Achado #7 v1).
- 2026-05-07T22:50Z — Pipeline-controller reports Agent tool also unavailable. Scope expanded to systemic (Achado #7 v2).
- 2026-05-07T22:55Z — User decides to stop the resume execution attempt. Real fix shape deferred.
- 2026-05-07T23:30Z — Achados 1-6 fixes applied inline (out-of-pipeline) using outer-context tools. Achado 7 documented in this file. **No agent code changed for Achado 7.**

## What was NOT done in the Achados-1-6 reconciliation

- The brainstorm-controller "silent fallback to numbered prose options" (line 158 of agent file) was NOT replaced with a fail-loud BLOCKED emit. That edit depends on choosing a mitigation path (M-1 vs M-2 vs M-4). Premature replacement would either break the partial workaround (M-3 synthesis) or pre-commit to a path before evidence.
- No `--dry-run` flag was added to brainstorm-controller. Same reasoning.
- No reachability test for AskUserQuestion was added (would require knowing which mitigation path is correct to assert against).

## Suggested next user action

- Allocate 1-2 hours to run the empirical probe (Open Question #1). Output: a definitive "tools denied to subagents" list.
- Based on that list, pick a mitigation path and open a v5.2 milestone. The path likely affects 5-15 agent files plus 3 hooks.
- Do NOT promote this finding to a v5.1.x patch unless one of M-3 / M-4 is the chosen path. M-1 and M-2 require a minor (5.2) bump because they change agent contracts.
