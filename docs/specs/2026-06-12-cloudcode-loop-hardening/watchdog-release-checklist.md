# Watchdog and Release Checklist: Claude Code Loop Hardening

Status: DRAFT
Runtime target: Claude Code by Anthropic

This checklist defines the final gate. The implementing agent must not publish the marketplace update or claim completion until these checks pass.

## 1. Required inputs

The watchdog must know:

- Expected version.
- Release branch.
- Release commit SHA.
- Release tag, if created.
- Marketplace source ref.
- Local drive D repo path, if applicable.
- Global Claude Code plugin path or official install/update command evidence.
- Task group evidence directory.

Recommended environment variables:

```text
PIPELINE_EXPECTED_VERSION=<semver>
PIPELINE_RELEASE_REF=<tag-or-commit>
PIPELINE_ORCHESTRATOR_D_REPO=<path-to-drive-D-clone>
PIPELINE_GLOBAL_CLAUDE_PLUGIN_PATH=<optional-global-plugin-path>
```

The script must not require these variables if it can safely detect values from the repo and Claude Code installation. It must fail with clear instructions if detection is ambiguous.

## 2. Watchdog checks

### W1. Version sync

Pass conditions:

- `package.json` version equals expected version.
- `.claude-plugin/plugin.json` version equals expected version.
- `.claude-plugin/marketplace.json` plugin version equals expected version.
- README visible version equals expected version if README has a visible version.
- `lib/index.cjs` exported version equals expected version.
- Hook banners do not report older versions.

Fail conditions:

- Any stale version exists in runtime surfaces.
- Marketplace says one version and package says another.

### W2. Claude Code hook manifest integrity

Pass conditions:

- Canonical Claude Code hook manifest is identified.
- Every hook command path exists.
- Every hook file is included in package distribution.
- Security hooks are not absent from the install manifest.

Required security hooks:

- Sentinel hook for `PreToolUse:Agent`.
- Dispatch guard for `PreToolUse:Skill|Agent`.
- Edit guard and scope lock for `PreToolUse:Edit|Write|MultiEdit|NotebookEdit`.
- Session lock on `UserPromptSubmit`.
- Stop hook on `Stop`.

Fail conditions:

- `.claude/settings.json` and another manifest disagree with no generator or test.
- Only Stop hook is installed while security hooks exist only in a non-shipped manifest.

### W3. Sentinel HMAC enforcement

Pass conditions:

- Signed state verifies.
- Tampered state fails.
- Nested tampering fails.
- Unsigned active state fails in strict mode.
- Invalid signature length does not crash verification.
- HMAC key path does not hardcode obsolete plugin version.

Fail conditions:

- `sentinel-hook` trusts unsigned or invalid active state under strict mode.
- Tampering with `expected_next` or `pipeline_active` is not detected.

### W4. Controller permission truthfulness

Pass conditions:

- No agent says a tool is unavailable while frontmatter grants it.
- `pipeline-controller` does not have `Bash` unless prompt and design explicitly allow it.
- Progress tool names are actual Claude Code tools or are corrected.

Fail conditions:

- Frontmatter grants shell or write capability that prompt denies.

### W5. Session lock entry point coverage

Pass conditions:

- Every supported `/pipeline-orchestrator:*` command that can start protected work creates or refreshes a lock.
- Thin skills and light/heavy variants are covered.
- Hyphenated aliases are covered.
- Case-insensitive invocations are covered.

Fail conditions:

- A code-changing entry point can start without lock protection.

### W6. Gate decision vocabulary

Pass conditions:

- Static scanner finds only canonical decisions in first-party prompt examples.
- Runtime writer rejects invalid decisions.
- Any special semantics are in `detail` or protocol events.

Fail conditions:

- A prompt instructs `decision: FORCE_VARIANT_OVERRIDDEN` or any other non-canonical decision.

### W7. JSONL writer safety

Pass conditions:

- Newline injection cannot corrupt JSONL.
- Concurrent appends remain parseable.
- Stale lock recovery is tested.
- Protocol event writes use safe writer in Claude Code runtime paths.

Fail conditions:

- Raw append remains in Claude Code audit paths for untrusted or concurrent events.
- Comments claim locks that code does not implement.

### W8. Test suite completeness

Pass conditions:

- `npm test` runs unit, regression, hook, compatibility, packaging and watchdog tests, or clearly documented required categories.
- Per-test timeout exists.
- A missing category is detected.

Fail conditions:

- `tests/unit` or `tests/compat` exists but is skipped by default without explicit reason.
- A hung test can block indefinitely.

### W9. Audit semantics

Pass conditions:

- Gate coverage is not misrepresented as quality success.
- Unknown duration or expected gate counts are not silently coerced to zero unless documented.
- Reports distinguish final decision from coverage metrics.

Fail conditions:

- A NO-GO run can appear as high-quality success because all gates were triggered.

### W10. Adversarial loop evidence

Pass conditions:

- Each task group has adversarial review evidence.
- No unresolved high or critical findings remain.
- Any third failed loop has an alternative approach artifact.

Fail conditions:

- A group changed code with no adversarial review.
- A group exceeded three loops without changing approach.

### W11. Marketplace release integrity

Pass conditions:

- Marketplace plugin entry version equals expected version.
- Marketplace `source.ref` points to release tag or immutable commit.
- The release ref exists on GitHub.
- Package includes marketplace and hook files.

Fail conditions:

- Marketplace users would receive a stale ref.
- Marketplace ref points to missing tag or wrong commit.

### W12. Drive D and global Claude Code availability

Pass conditions:

- Drive D repo path is detected or explicitly provided.
- Its Git remote matches `fernandoxavier02/Pipeline-Orchestrator`.
- It is checked out at the release ref.
- Global Claude Code plugin is updated or installed.
- Verification is performed from outside the implementation repo.
- The reported plugin version equals expected version.

Fail conditions:

- Global sync target is ambiguous.
- Verification only occurs inside the repo.
- Claude Code cannot see the plugin from a different project.

## 3. Suggested watchdog output

JSON output:

```json
{
  "schema_version": 1,
  "target_runtime": "Claude Code",
  "expected_version": "x.y.z",
  "release_ref": "vx.y.z",
  "status": "PASS",
  "checks": [
    {
      "id": "W1",
      "name": "Version sync",
      "status": "PASS",
      "evidence": []
    }
  ],
  "release_blockers": [],
  "generated_at": "ISO-8601"
}
```

Markdown output:

```text
# Claude Code Hardening Watchdog

Status: PASS or FAIL
Expected version: x.y.z
Release ref: vx.y.z

## Checks
- W1 Version sync: PASS
- W2 Hook manifest integrity: PASS
...

## Release blockers
- none
```

## 4. Release checklist

The implementing agent must run this in order.

1. Confirm target runtime is Claude Code.
2. Confirm branch contains all task group changes.
3. Run all ATDD, TDD, DDD and BDD tests for every group.
4. Run adversarial review loop for each group.
5. Ensure all review findings are closed or alternative approach is documented.
6. Run full `npm test`.
7. Run packaging smoke tests.
8. Run watchdog.
9. If watchdog fails, stop and report `RELEASE_BLOCKED`.
10. If watchdog passes, update version and marketplace ref.
11. Commit final release metadata.
12. Push to GitHub.
13. Open or update PR.
14. Merge after review.
15. Create release tag.
16. Push release tag.
17. Verify `.claude-plugin/marketplace.json` on default branch points to release ref.
18. Verify marketplace install or update resolves the new version.
19. Sync drive D repo to release ref.
20. Refresh global Claude Code plugin installation.
21. From a different project directory, verify the plugin is available and reports expected version.
22. Write final release evidence.

## 5. Release blocker rules

The release must stop if any of these occur:

- Any test category fails.
- Watchdog fails.
- HMAC sentinel verification fails.
- Hook manifest does not include active security hooks.
- A code-changing entry point bypasses session lock.
- Marketplace metadata points to stale ref.
- Global Claude Code availability cannot be verified.
- Any critical or high adversarial finding remains unresolved.

## 6. Safe local sync rules

When syncing the drive D repo or global Claude Code installation:

- Verify the repo remote before checkout.
- Prefer fetch plus checkout of release ref.
- Do not delete local directories without backup.
- If using filesystem copy to global Claude Code plugin directory, write backup first.
- Record before and after version.
- Verify from outside the repo.

## 7. Final success statement

The final response from the implementing agent must include:

```text
CLAUDE_CODE_LOOP_HARDENING_COMPLETE
version: <version>
release_ref: <tag-or-commit>
github_status: published
marketplace_status: updated
drive_d_repo_status: synced
global_claude_code_status: available
tests: pass
watchdog: pass
adversarial_reviews: clean
```

If any field cannot be proven, the agent must not print the complete statement. It must print:

```text
RELEASE_BLOCKED
missing_evidence:
  - <item>
```
