# Observability · Langfuse

> Full observability setup and behavior. Moved from the README front page — the [README](../README.md) keeps the summary; this document keeps the detail.

Pipeline Orchestrator ships with first-class [Langfuse](https://langfuse.com) integration — the open-source LLM observability platform. It is **opt-in and offline-first**: with no credentials, the hook short-circuits in under 100 ms and makes zero network calls.

**Activate with two environment variables:**

```bash
export LANGFUSE_ENABLED=true
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_HOST=https://us.cloud.langfuse.com   # or your self-hosted URL
# optional:
export LANGFUSE_SAMPLE_RATE=1.0   # 0.0 disables tracing; 1.0 traces every run
export PIPELINE_TRACING_SCOPE=full   # agent-only (default) | agent-plus-skill | full
```

**What you see.** Each pipeline run becomes a single Langfuse **trace**; each subagent dispatch becomes a **span** carrying structured metadata — `run_id`, `task_type`, `complexity`, `phase`, `agent_name`, and `plugin_version`. Every gate decision, `GATE_REQUEST`, and adversarial finding lands as a scored event, so you can slice performance by agent, by phase, or by gate hardness.

**One run, one trace.** Earlier versions fragmented a single run across N traces when subagents forked processes. Since v7.5.0 the Langfuse carrier is keyed by `runId` (with graceful PPID/mtime fallback), and since v7.9.3 spans are resolved by phase + agent so you stop seeing `unknown`. The `langfuse-hook.cjs` also enforces project isolation via the plugin `.env`, so traces land in the right Langfuse project.

**On-disk mirror.** The same data is written to `gate-decisions.jsonl` and the run-log under `.pipeline-orchestrator/runs/<run-id>/`. The on-disk copy is your compliance artifact; the Langfuse dashboard is your trend view across runs.

**Bundled, not boilerplate.** `langfuse` 3.x is a `bundledDependencies` entry in `package.json`, so an npm install carries the SDK — no extra network step in air-gapped teams.
