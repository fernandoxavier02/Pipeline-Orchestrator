# Install

> All installation channels and verification steps. The [README](../README.md) keeps the one-command quick start; this document keeps every channel.

The plugin ships through two channels. **Use the marketplace for normal installs** — it is public and needs no auth. NPM is restricted (private scope) for internal/team installs.

## Channel A — Marketplace (recommended, public)

```bash
# Once: register the FX-Studio-AI marketplace
/plugin marketplace add fernandoxavier02/Pipeline-Orchestrator

# Then: install the plugin
/plugin install pipeline-orchestrator@FX-studio-AI
```

Updates: `/plugin update pipeline-orchestrator@FX-studio-AI`.

## Channel B — NPM (restricted scope, team installs)

Published as `@fx-studio-ai/pipeline-orchestrator` (`access: restricted` — private by design; the marketplace remains the public channel).

```bash
echo "@fx-studio-ai:registry=https://registry.npmjs.org/" >> ~/.npmrc
echo "//registry.npmjs.org/:_authToken=YOUR_NPM_TOKEN" >> ~/.npmrc
npm install @fx-studio-ai/pipeline-orchestrator
```

The token needs **Bypass 2FA: enabled** on the `@fx-studio-ai` scope.

## Verify it is live

```
/pipeline-orchestrator:pipeline --diagnostic "add a hello-world endpoint"
```

If active, you will see classification (SIMPLES/MEDIA/COMPLEXA), variant selection, and `INFORMATION_GATE: CLEAR` — without any code being written.

## Turn on observability (optional)

See [OBSERVABILITY.md](OBSERVABILITY.md) for the full env-var set. Minimal: `LANGFUSE_ENABLED=true` plus your public/secret keys and host.

## FX Studio AI Suite

This repository hosts the **FX-Studio-AI** marketplace. Install once to access multiple plugins:

- **pipeline-orchestrator** (this plugin) — execution governance
- **skill-advisor** — intelligent toolchain orchestrator (recommends skills/plugins/MCPs)
- *more in the marketplace*

```bash
/plugin marketplace add fernandoxavier02/Pipeline-Orchestrator
/plugin list
```
