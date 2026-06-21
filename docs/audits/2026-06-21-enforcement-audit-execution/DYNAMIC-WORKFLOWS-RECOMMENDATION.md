# Dynamic Workflows — Read-Only Recommendation

> **Deliverable T8 / REQ-DEFER-DW-SPIKE.** This is a **read-only written recommendation**, not code and **not part of this correction** (`spec/requirements.md:69-71`, `spec/tasks.md:70-71`). It records where bounded autonomous fan-out genuinely helps the pipeline, under hard rules that keep it from eroding the determinism the rest of this work defends. No runtime change is proposed here.

---

## Position in one line

Dynamic Workflows (bounded autonomous fan-out where a stage spawns and joins several agents without a human in the loop) are a **real win for read-heavy, parallelizable, side-effect-free stages** — and a **liability anywhere near a human gate or shared pipeline state**. The recommendation is therefore narrow: use them only inside a **single stage bounded by two human gates**, always with an `Agent` fallback, and never let their internal state touch `sentinel-state.json` without an explicit adapter.

---

## Where bounded fan-out genuinely helps

These five uses are where the pipeline already wants N independent workers and where letting a workflow fan them out (instead of the controller dispatching them one by one) buys real latency and quality:

1. **Three independent reviewers.** The final adversarial stage already runs security, architecture, and quality reviewers with zero shared context. That is the canonical fan-out shape: N readers, no writes, results joined and compared. A workflow that spawns the three and joins their verdicts fits perfectly — they are independent by design.

2. **Audit fan-out.** An audit reads many files across many concerns (domain, compliance, risk). Spreading the read across parallel readers and merging findings is exactly the Phase-0/1 pattern the enforcement audit itself used (`REPORT.md:14`, "5 parallel readers"). It is read-only and embarrassingly parallel.

3. **Cross-check of findings.** Having one set of agents produce findings and an independent set verify them (the adversarial-verification step) is a fan-out/fan-in with a natural join: keep only findings that survive independent confirmation. No shared mutable state is required between the verifiers.

4. **Many-file processing.** When a task is "apply the same read/transform to 200 files," fanning the work across workers and collecting per-file results is the classic case bounded fan-out was built for — provided each unit is independent and the writes (if any) are disjoint.

5. **Adversarial synthesis.** After several reviewers disagree, a synthesis step that reads all their outputs and produces one reconciled verdict benefits from having had the reviewers run in parallel first. The synthesis itself stays a single agent; only the upstream review is fanned out.

The common thread: **independent units, read-dominated, results joined at the end.** That is where autonomous fan-out adds value the sequential `Agent`-by-`Agent` controller path cannot match on latency, without giving up any determinism — because nothing in the fan-out decides a gate.

---

## The hard rules (non-negotiable)

Any adoption MUST satisfy all of these, or it does not ship:

1. **Bounded to ONE stage between two human gates.** A Dynamic Workflow may own exactly one pipeline stage, and that stage must sit **between two human gates** — a human-approved entry and a human-reviewed exit. The workflow must **never control a human-gated step itself** (`requirements.md:70`, seed:870). It fans out, joins, and hands the joined result back to the controller for the next gate. It does not advance the pipeline.

2. **An `Agent` fallback is always preserved.** Every workflow stage must have a working `Agent`-based path that produces the same result sequentially. If the workflow is unavailable, mis-registers, or the harness strips it, the pipeline degrades to the controller dispatching the same agents one by one — never to a dead stage. The fan-out is an optimization, never a dependency.

3. **No mixing of workflow state with pipeline state without an adapter.** A workflow's internal state (its own task graph, intermediate results, retries) must **not** be written into `sentinel-state.json`, `gate-decisions.jsonl`, or the run-dir directly. If a workflow result needs to enter pipeline state, it passes through an **explicit adapter** that validates and normalizes it into the canonical signed shape (the same way any agent result is parsed before it is trusted). Untranslated workflow state in the signed file would be exactly the kind of un-validated, agent-trusted input the enforcement layer exists to refuse.

4. **It is a separate recommendation, not this correction.** Adopting any of the above is a **future, independently-reviewed change**. It is explicitly out of scope for the current enforcement-determinism work and must not be bundled into it (`requirements.md:71`).

---

## Why the rules, briefly

The whole enforcement effort rests on one idea: **no guarantee may depend on an agent telling the truth, and no gate may be decided by un-validated input.** Dynamic Workflows are fine where they only read and join (rules permit), and dangerous where they could decide a gate or smuggle un-adapted state into the signed file (rules forbid). Bounding them to one stage between two human gates, with an Agent fallback and a state adapter, keeps the speed-up while leaving every determinism property of the pipeline intact.

---

## Recommendation

**Adopt later, narrowly, behind a spike.** When a future iteration has a live `--plugin-dir` session to evaluate runtime behavior, prototype Dynamic Workflows on **one** of the five uses above — the three-independent-reviewers stage is the safest first target because it is already read-only, already fan-out shaped, and already sits between two human gates. Gate the prototype on the four hard rules, keep the `Agent` fallback green, and review it as its own change. Until then, the sequential controller path remains the shipped, deterministic default.
