# Walkthrough: Brainstorm + Handoff (v5.1.0)

This example traces a feature from initial idea to production code through the v5.1 brainstorm-first workflow. The user wants to add OAuth login with refresh tokens to a web app.

> **TL;DR** — In v5.1 you cannot run `/pipeline` on a non-trivial task without a spec. `/brainstorm` builds the spec interactively in a new `pipeline-runs/<NNN>-<slug>/` directory, then either chains into `/pipeline` or saves the run for later. The whole conversation, the spec artifacts, the validations, and the eventual implementation reviews all live under one folder per run.

---

## Step 0 — Starting state

```
project-root/
├── .pipeline/                    # v5.0 working state (preserved)
├── .kiro/                        # v5.0 specs (no longer read by /pipeline)
├── src/
└── tests/
```

There is no `pipeline-runs/` yet. The user has installed pipeline-orchestrator v5.1.0 from the marketplace.

---

## Step 1 — Invoke `/brainstorm`

```
/pipeline-orchestrator:brainstorm "add OAuth login with refresh tokens"
```

The plugin:
1. Allocates `pipeline-runs/001-add-oauth-login-with/` (slug: first 5 stop-words-filtered ASCII tokens).
2. Creates the 5 fixed subfolders + an initial `manifest.yaml`:
   ```yaml
   schema_version: 1
   run_id: 001-add-oauth-login-with
   created_at: 2026-05-06T14:30:00Z
   status: ready
   phase: 0
   type: Unknown
   complexity: unknown
   brainstorm_completed: false
   spec_lifecycle_completed: false
   handoff_decision: null
   ```
3. Logs gate `STEP_1_7_ROUTING` with branch `dispatch-brainstorm`.

---

## Step 2 — `spec-init`

The `spec-init` skill (cloned from Kiro) opens an interactive session. Outputs land in `01-spec/spec.json`:

```json
{
  "feature_name": "oauth-login-refresh-tokens",
  "scope": "Add OAuth 2.0 authorization code flow with refresh-token rotation",
  "stakeholders": ["end users", "security team", "ops"],
  "out_of_scope": ["passwordless / magic links", "SSO from third-party IdPs"]
}
```

---

## Step 3 — `spec-requirements`

The `spec-requirements` skill drafts EARS-format ACs in `01-spec/requirements.md`. Excerpt:

```
WHEN a user clicks "Sign in with Google"
THE SYSTEM SHALL redirect to Google's authorization endpoint with PKCE.

WHEN the access token expires
AND a refresh token is present
THE SYSTEM SHALL silently rotate it before the next API call.

IF the refresh token is reused (replay)
THEN THE SYSTEM SHALL revoke the entire refresh chain
AND log the user out.
```

A user gate confirms the requirements before proceeding.

---

## Step 4 — `spec-design`

The `spec-design` skill produces `01-spec/design.md` covering: data model (sessions, refresh_tokens), state diagram for the rotation/revocation flow, threat model (replay, CSRF on the redirect, token theft via XSS), and a sequencing decision (PKCE preferred over implicit flow).

---

## Step 5 — `spec-tasks`

The `spec-tasks` skill breaks the design into a numbered, dependency-ordered task list in `01-spec/tasks.md`:

```
1. Add `oauth_sessions` migration + model.
2. Add `/auth/oauth/start` route (PKCE init).
3. Add `/auth/oauth/callback` route (token exchange).
4. Implement refresh-token rotation middleware.
5. Implement replay detection + chain revocation.
6. Wire frontend "Sign in with Google" button.
7. End-to-end test: full happy path.
8. End-to-end test: replay attack rejected.
```

---

## Step 6 — `validate-design`

The `validate-design` skill cross-checks design.md against requirements.md and writes a report to `02-validations/validate-design.md`. Findings come back **CLEAN** in this run.

---

## Step 7 — `validate-gap`

The `validate-gap` skill checks that every AC in requirements.md has at least one corresponding task in tasks.md. Report: `02-validations/validate-gap.md`. Two ACs (token revocation logging, audit-trail emission) had no task — the skill flags this; the user adds task 5b "emit audit-log entry on chain revocation" and re-runs validate-gap. Now CLEAN.

`manifest.yaml` is updated: `spec_lifecycle_completed: true`.

---

## Step 8 — Handoff gate

The brainstorm controller asks (via `AskUserQuestion`):

> **Handoff** — Spec lifecycle complete. What now?
> - Proceed to /pipeline now (Recommended) — implementation starts immediately on this run-dir
> - Save run-dir; resume later — manifest stays at status=ready, no implementation yet
> - Abort and discard — delete pipeline-runs/001-add-oauth-login-with/

The user picks **Proceed**. Manifest gets:

```yaml
handoff_decision: proceed
linked_pipeline_doc_path: pipeline-runs/001-add-oauth-login-with/03-execution/PIPELINE.md
```

---

## Step 9 — `/pipeline` picks it up

`/pipeline` is invoked (either auto-chained or manually). STEP 1.7 routing logs branch `load-existing` and finds the run-dir. Phase 1 (classify): MEDIA (3-5 files, ~80 lines per task on average). Phase 2 (plan): batches of 2-3 tasks, TDD on. Phase 3 (execute): per-batch implementation + per-task adversarial review using the cloned `review` skill.

Each batch writes its artifacts under `03-execution/batch-NNN/`:

```
03-execution/
├── PIPELINE.md
├── batch-001/
│   ├── implementation.md
│   ├── review-task-1.md         # cloned review skill output
│   ├── review-task-2.md
│   └── checkpoint.md
├── batch-002/
└── ...
```

---

## Step 10 — Pa de Cal pre-validation

Before final-validator runs, `pipeline-controller` dispatches the cloned `verify-completion` skill. It checks: do all tasks have implementations? Do all ACs have at least one passing test? Are there leftover TODOs? Result: **PASS**. Pipeline continues.

(If verify-completion had returned FAIL, the new gate `STOP_BEFORE_PA_DE_CAL` would halt the pipeline, write `04-final-report.md` with NO-GO + the findings, and return.)

---

## Step 11 — Final-validator (Pa de Cal)

`final-validator` runs the standard end-of-pipeline adversarial trio (security, architecture, quality reviewers, all zero-context). Outcome: GO. `04-final-report.md` is written. Manifest:

```yaml
status: complete
phase: 4
```

---

## Final state

```
project-root/
├── .pipeline/                                       # untouched
├── .kiro/                                           # untouched (legacy, unread)
├── pipeline-runs/
│   └── 001-add-oauth-login-with/
│       ├── 00-brainstorm/                           # init/requirements/design/tasks conversation
│       ├── 01-spec/
│       │   ├── spec.json
│       │   ├── requirements.md
│       │   ├── design.md
│       │   └── tasks.md
│       ├── 02-validations/
│       │   ├── validate-design.md
│       │   └── validate-gap.md
│       ├── 03-execution/
│       │   ├── PIPELINE.md
│       │   ├── batch-001/
│       │   ├── batch-002/
│       │   └── batch-003/
│       ├── 04-final-report.md
│       ├── attachments/
│       └── manifest.yaml                            # status: complete
├── src/oauth/...                                    # actual implementation
└── tests/oauth/...                                  # actual tests
```

The entire auditable trail — from "I want to add OAuth" to a Pa de Cal GO — lives in one folder under `pipeline-runs/`. The `manifest.yaml` is the index; future tooling (e.g. `landing-report`) reads the manifest to surface status across runs.

---

## What this replaces

In v5.0 the equivalent flow involved:
- Running `/kiro:spec-*` skills externally to populate `.kiro/specs/oauth-login/`.
- Hoping the user remembered to invoke them in order.
- `/pipeline` reading from `.kiro/specs/<feature>/` with no manifest, no validation gates, no handoff confirmation.

In v5.1 the flow is single-command (`/brainstorm`), self-contained (no external Kiro install), gated (every step is a user-confirmable artifact), and audit-friendly (everything under one numbered run-dir with a manifest).
