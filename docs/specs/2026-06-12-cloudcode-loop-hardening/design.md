# Design: Claude Code Loop Hardening

Status: DRAFT
Runtime target: Claude Code by Anthropic
Primary execution mode: Claude Code Go mode

## 1. Design intent

The design turns the audit findings into a Claude Code native remediation architecture. The plugin must remain a Claude Code plugin first. It may keep compatibility with other runtimes, but the corrected contract is verified through Claude Code installation, Claude Code hooks and Claude Code slash commands.

This is not just a patch list. It is a loop-engineered remediation system: every change group has a defined input, tests, implementation step, adversarial review, bounded fix loop and watchdog verification.

## 2. Target architecture

```text
Claude Code user command
  -> Claude Code plugin marketplace entry
  -> Claude Code skill or command manifest
  -> session lock hook
  -> pipeline-controller or thin skill
  -> sentinel state writer with HMAC
  -> Claude Code Agent dispatch
  -> hook enforcement before Agent, Edit, Write and Stop
  -> JSONL audit writer with lock
  -> tests and watchdog
  -> GitHub release and marketplace ref update
  -> global Claude Code installation refresh
```

The product surfaces are:

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- Claude Code hook manifest or generated manifest
- `.claude/hooks/*.cjs`
- `commands/*.md`
- `skills/*/SKILL.md`
- `agents/**/*.md`
- `lib/*.cjs`
- `scripts/*.cjs`
- `tests/**`

## 3. Runtime source of truth

Claude Code is the source of truth for:

- tool names
- agent frontmatter
- hook event names
- marketplace packaging layout
- global plugin availability
- slash command behavior

Codex is not a runtime source of truth for this remediation. If `lib/codex-operational-runtime.cjs` or Codex mirror files use shared libraries, they may be updated only as consumers of shared fixes. The implementation must not drift into a Codex migration.

## 4. Version source of truth design

Create one canonical version module or file. Recommended options:

Option A, preferred:

```text
VERSION
scripts/sync-version.cjs
```

`VERSION` contains only the semantic version, for example `7.13.0`.

`scripts/sync-version.cjs` updates these files:

- `package.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- README badge or version text
- `lib/index.cjs`
- hook banners
- any tests with pinned version constants

Option B:

Use `package.json.version` as source of truth and generate all other version surfaces from it.

Required design rule:

No file may hand-maintain a different version string after this remediation.

## 5. Hook manifest design

The current state appears to have at least two hook registration surfaces. The design must select one canonical source and make all others generated or verified.

Recommended structure:

```text
.claude-plugin/hooks.json           canonical Claude Code hook manifest if supported
.claude/settings.json               generated compatibility copy if required
hooks/hooks.json                    deprecated compatibility copy or removed after migration
scripts/validate-hook-manifest.cjs  packaging and path validator
```

If Claude Code requires `.claude/settings.json`, then `.claude/settings.json` is canonical and `hooks/hooks.json` must be generated or removed. If Claude Code requires `hooks/hooks.json`, then `hooks/hooks.json` is canonical and it must be included in `package.json.files`.

The implementation must verify the actual Claude Code install behavior instead of guessing.

Minimum active hooks for a protected Claude Code run:

- `SessionStart`: cleanup orphan sentinel state if applicable.
- `UserPromptSubmit`: force pipeline agent behavior and session lock heartbeat.
- `PreToolUse:Agent`: sentinel hook, dispatch guard and optional Langfuse tracing hook.
- `PreToolUse:Edit|Write|MultiEdit|NotebookEdit`: edit guard and scope lock hook.
- `PostToolUse:Agent`: Langfuse tracing hook where enabled.
- `Stop`: completion checklist, session cleanup and stop hook run-log writer.

## 6. Sentinel integrity design

### 6.1 State model

Active `sentinel-state.json` must include at least:

```json
{
  "schema_version": 1,
  "pipeline_active": true,
  "run_id": "...",
  "pipeline_doc_path": "...",
  "current_phase": "...",
  "expected_next": "...",
  "created_at": "...",
  "updated_at": "...",
  "__signature": {
    "algorithm": "hmac-sha256",
    "schema_version": 1,
    "value": "..."
  }
}
```

### 6.2 Canonicalization

The signer must use recursive stable canonicalization:

- Sort object keys recursively.
- Preserve arrays in order.
- Exclude only the `__signature` field.
- Serialize primitives deterministically.
- Reject unsupported values such as functions, `undefined` and circular structures.

The current shallow key sort pattern must not be used for security decisions.

### 6.3 Verification behavior

For active protected pipeline operations:

- Valid signature: allow normal sentinel checks.
- Missing signature in strict mode: deny.
- Missing signature in migration mode: warn and allow only if explicitly configured.
- Invalid signature: deny.
- Unparseable state: deny for active protected operations.
- Unknown schema: deny unless compatibility mode is explicitly configured.

### 6.4 Key storage

The signer must not hardcode an obsolete plugin version into the key path. Preferred order:

1. `PIPELINE_HMAC_SECRET` for CI and tests.
2. Claude Code plugin cache path derived from actual plugin root and current plugin version.
3. User-scoped config path under Claude Code home, with permissions locked where supported.

If key persistence fails, active protected operations must not silently downgrade to advisory protection.

## 7. Permission and tool design

Agent frontmatter is an enforcement surface. Prompt text is not enough.

Rules:

- If an agent says it cannot use a tool, the tool must not appear in frontmatter.
- If an agent needs shell access, its prompt must declare when and why shell access is permitted.
- `pipeline-controller` should not have `Bash` unless a design section proves shell use is required and hook-controlled.
- Mutating tools must be paired with edit guard and scope lock protections.

Tool-name validation must scan frontmatter and prompt claims.

## 8. Session lock design

Session locks protect Claude Code users from direct edits during active pipeline sessions.

The entry point registry should be generated from skill manifests or a single source such as:

```js
const PIPELINE_ENTRYPOINTS = [
  'pipeline',
  'bugfix',
  'bugfix-light',
  'bugfix-heavy',
  'feature',
  'feature-light',
  'feature-heavy',
  'user-story',
  'userstory',
  'user-story-light',
  'user-story-heavy',
  'audit',
  'audit-light',
  'audit-heavy',
  'ux',
  'ux-sim',
  'ux-sim-light',
  'ux-sim-heavy',
  'spec',
  'spec-light',
  'spec-heavy',
  'hotfix',
  'review'
];
```

The final list must be generated from actual installed commands and skills where possible. The list above is illustrative and must be reconciled against the repo.

## 9. Gate decision design

Canonical decision set remains narrow:

```text
BLOCKED
DISPATCHED
SKIPPED
APPROVED
CONFIRMED
REJECTED
TRIGGERED
NOT_TRIGGERED
```

Rules:

- `decision` is categorical and machine-validated.
- Specific narratives go in `detail` or protocol events.
- Example: `STRICT_SPEC_REJECTION` with variant override should use `decision: TRIGGERED` and `detail: FORCE_VARIANT_OVERRIDDEN spec-heavy -> bugfix-light`.
- No prompt, doc or test fixture may instruct the model to write a non-canonical decision.

## 10. JSONL writer design

Create or promote a single safe writer for JSONL files.

Recommended module:

```text
lib/jsonl-writer.cjs
```

Responsibilities:

- Validate file target is inside an allowed root when root is provided.
- Sanitize free-text fields.
- Serialize using `JSON.stringify`.
- Round-trip parse before writing.
- Acquire an exclusive lock with bounded retry.
- Detect and recover stale lock files.
- Append exactly one newline-terminated JSON object.
- Return structured result.

Consumers:

- `gate-decision-writer.cjs`
- protocol event writers
- run-log writer, or a wrapper around run-log writer
- watchdog artifacts where JSONL is used

Compatibility design:

Existing exported names may remain, but they should delegate to the new writer.

## 11. Test design

Test categories:

```text
tests/unit/**
tests/regression/**
tests/compat/**
.claude/hooks/__tests__/**
tests/packaging/**
tests/watchdog/**
```

`scripts/run-tests.cjs` must discover and run all required categories by default.

Minimum runner features:

- Per-test timeout.
- Category filter flags.
- Clear output.
- Failure summary.
- Exit nonzero on any required category failure.

Suggested flags:

```text
--unit
--regression
--hooks
--compat
--packaging
--watchdog
--all
```

Default `npm test` should run `--all`.

## 12. Watchdog design

The watchdog is the final verification layer that checks whether the implementation followed the spec.

Recommended script:

```text
scripts/watchdog-cloudcode-hardening.cjs
```

Inputs:

- repo root
- expected version
- optional release ref
- optional global Claude Code plugin path

Checks:

1. Version sync.
2. Hook manifest references all shipped files.
3. HMAC signer tests pass.
4. Sentinel hook rejects tampered signed state in strict mode.
5. Session lock covers all entry points.
6. Gate decision vocabulary scan passes.
7. JSONL concurrency smoke test passes.
8. `npm test` or category tests pass.
9. Marketplace metadata points to expected ref.
10. Local global Claude Code plugin availability is verified from outside the repo.
11. Adversarial review evidence exists for each task group.
12. No task group exceeded three loops without an alternative approach note.

Output:

```text
.pipeline/watchdog/cloudcode-hardening-watchdog.json
.pipeline/watchdog/cloudcode-hardening-watchdog.md
```

The watchdog must fail closed: missing evidence is failure, not warning.

## 13. Release and marketplace design

Release sequence:

1. Ensure working tree is clean except intended changes.
2. Run all tests.
3. Run watchdog.
4. Update version source of truth.
5. Regenerate versioned surfaces.
6. Update `.claude-plugin/marketplace.json` so the plugin source ref points to the release tag or immutable commit.
7. Commit changes.
8. Push branch.
9. Open or update PR.
10. After merge, tag release.
11. Push tag.
12. Verify marketplace file on default branch points to the tag.
13. Verify fresh Claude Code install or update resolves to the new version.

Marketplace rule:

- Do not point marketplace users to a moving branch for a production release unless the marketplace intentionally tracks `main`.
- Prefer immutable tags such as `v7.13.0`.

## 14. Drive D repository and global Claude Code sync design

The user has a separate repository on drive D that must reflect the final plugin and make it available globally to Claude Code on the machine.

Do not hardcode one path unless already configured. Detect in this order:

1. Environment variable `PIPELINE_ORCHESTRATOR_D_REPO`.
2. Current repo if it is already on drive D.
3. Known clone paths under `D:\` whose Git remote matches `fernandoxavier02/Pipeline-Orchestrator`.
4. If multiple candidates exist, stop and report candidates.

Sync rules:

- Fetch and checkout the release ref in the drive D repo.
- Do not use destructive clean unless explicitly approved or backed up.
- Verify `git remote -v` matches the expected repo.
- Verify version after checkout.

Global Claude Code availability rules:

- Prefer the official Claude Code plugin install/update mechanism if available.
- If a filesystem sync is required, back up the prior global plugin directory first.
- Verify from a directory outside the repo that the plugin command or plugin listing shows the new version.
- Record proof in watchdog output.

## 15. Adversarial loop design

Each task group uses this loop:

```text
implement group
  -> run group tests
  -> adversarial review attempt 1
      clean -> proceed
      findings -> implement fix
  -> run group tests
  -> adversarial review attempt 2
      clean -> proceed
      findings -> implement fix
  -> run group tests
  -> adversarial review attempt 3
      clean -> proceed
      findings -> stop current approach, write alternative approach, implement new approach
  -> run group tests
  -> adversarial review on new approach
```

Review evidence file:

```text
.pipeline/reviews/<group-id>/adversarial-review-attempt-<n>.md
```

Required fields:

- group id
- reviewer identity
- diff scope
- test evidence
- findings by severity
- recommendation
- whether a new approach is required

The reviewer must not receive the implementer's rationale unless explicitly needed. It should inspect outcomes, diff and contracts.
