# Missing Pipeline Workflows Roadmap

A design roadmap for the pipeline-orchestrator plugin (v8.7.0). It documents proposed new workflows; it implements none of them. The deliverable is the spec itself.

## What this is, in plain language

The plugin already has guided workflows for fixing bugs, building features, auditing code, checking user experience, and writing specs. It is missing guided workflows for four other common jobs: tidying up code without changing what it does (Refactor), making slow code fast and proving it (Performance), upgrading libraries or moving data safely (Migration), and shipping a release everywhere at once (Release). This roadmap describes how each of those would work, and decides that four smaller jobs (test backfill, research spikes, incident postmortems, and documentation) are better added as options on commands that already exist rather than as brand-new commands.

The guiding rule throughout is "make it simple but make it work": every proposed new command has to earn its place against a cheaper option, and the roadmap refuses to add machinery nobody needs yet. The plugin's safety system (its gate tables) is left untouched here — the roadmap only describes the additions a future builder would make, with an exact recipe for making them safely.

## The four documents

- **requirements.md** — what the roadmap must contain, as numbered requirements with acceptance criteria.
- **design.md** — the interface contract per workflow: command shape, light/heavy variants, the one signature safety check each adds, the agent-reuse table, the shared behavioral-evidence concept, the Channel Parity Checklist, and the Paperclip mirror blocks.
- **research.md** — the read-only survey of the existing plugin surfaces a new workflow plugs into, and why no gap analysis was possible (these workflows do not exist yet).
- **tasks.md** — future per-workflow implementation skeletons, one slice per workflow, in the recommended build order.

## Recommended build order

Refactor and Release first (Refactor adds zero new agents; Release removes a recurring manual-shipping mistake), then Performance, then Migration last because it carries the most risk and the most new safety machinery. Each workflow is a small additive release.

## Status

This spec is authored under the spec-authoring workflow and is sealed as a contract once the adversarial review converges. Sealing does not start implementation. To implement any slice later, run the pipeline command over this spec directory.
