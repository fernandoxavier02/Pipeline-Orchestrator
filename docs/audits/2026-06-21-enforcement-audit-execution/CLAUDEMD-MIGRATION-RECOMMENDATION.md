# CLAUDE.md Critical-Rules Migration — Read-Only Recommendation

> **Deliverable T9 / REQ-DEFER-CLAUDEMD-MIGRATE (GAP-05a, FASE 14).** This is a **recommendation doc, not the migration** (`spec/tasks.md:73-74`, `spec/requirements.md:148`). It identifies which **critical enforcement rules live ONLY in the repo-root `CLAUDE.md`** — and therefore are **not loaded as runtime context by the installed plugin** (Part A confirms root `CLAUDE.md` is a dev-doc, not plugin runtime law: `requirements.md:30`) — and recommends where each should move in a future hardening iteration. **Objective blocker for doing it now:** re-homing rules is exactly the broad rewrite NFR-MINIMAL-DIFF forbids this iteration, and the genuinely enforcement-bearing rules already live in hooks/contracts. No code changes here.

---

## Method (how "lives only in CLAUDE.md" was decided)

For each candidate rule in `CLAUDE.md`, I grepped the rest of the repo (code, skills, agents, hooks, configs) for an equivalent enforcement. A rule is flagged **ONLY-IN-CLAUDE.md** when the grep finds it nowhere else as an executable check — only as prose in the dev-doc. Rules that already have a hook, contract test, `.gitignore`/`.npmignore` entry, or agent-frontmatter lock are **already-homed** and are listed separately so the recommendation is honest about what does NOT need to move.

---

## Already-homed rules (NO migration needed — recorded for honesty)

These read like CLAUDE.md policy but are already enforced in runtime/CI surfaces, so they are explicitly **out** of the migration:

- **"Edits via Agent during pipeline; never edit inline"** — already code-enforced by `force-pipeline-agents.cjs`, `dispatch-pending-gate.cjs`, and `scope-lock-hook.cjs` (the pipeline blocks inline production writes once armed). Already-homed.
- **".pipeline/ and .kiro/ are working-state — never commit"** — already enforced by `.gitignore` and `.npmignore` (and the `no-pack-cruft` packaging test). Already-homed.
- **"Codex mirror must follow .claude changes"** — partially already-homed: only `langfuse-hook.cjs` and `stop-hook.cjs` have `.codex` mirrors, and byte-identity is asserted by regression tests (e.g. `tests/regression/v8.4.0`). The CLAUDE.md prose overstates the scope ("force-pipeline-agents must mirror") — there is no `.codex/force-pipeline-agents.cjs`; that line is **stale dev-doc**, not an unhomed rule.
- **Canonical version / lineage** — the version SSOT is `.claude-plugin/plugin.json` and is locked by the `F7_version_sync` test. The CLAUDE.md lineage table is documentation, not enforcement.

---

## Critical rules that live ONLY in CLAUDE.md (migration candidates)

Each row: the rule, why it matters, and its recommended target home.

### 1. Communication-style contract ("voice test" — the whole top section)

**Rule:** responses must pass the *voice test* — verdict on the first line; no file paths, URLs, commit hashes, version tags, bracketed identifiers, unexplained acronyms, or raw gate-names in the narrative (those go in a trailing command block); bullets/tables only for real comparison; aggressive brevity (2-3 short paragraphs); pt-BR plain language. The doc itself calls this *gate de qualidade* — a quality gate.

**Evidence it is ONLY here:** grep for the voice-test phrasing (`teste do ouvido`, `modo de voz`, `voz alta`, `caminho de arquivo`) returns **only `CLAUDE.md`**. No agent frontmatter, no skill, no hook references it. The installed plugin never sees it.

**Why it matters:** this is the single most user-visible behavioral contract in the project, and right now it is invisible to every agent the plugin actually runs. An installed-plugin run gets none of it.

**Recommended home:** the **output-facing agents' frontmatter / system-prompt** — specifically the agents that produce user-facing prose (`pipeline-controller`, `final-validator`, `spec-closer`, `finishing-branch`). Lift the voice-test rules into a shared **reference** (e.g. a `references/communication-style.md` SSOT) and have those agents include it the way they already include protocol references. A lightweight **validator** (post-response lint that flags raw paths/hashes in narrative) is a possible second layer, but the frontmatter/reference home is the minimal, correct first step.

### 2. Cache is runtime read-only; all edits originate in the canonical repo (REGRA #1 / #2)

**Rule:** every change is born in the canonical repo; the marketplace cache path is **runtime read-only — never edit there**.

**Evidence it is ONLY here:** this appears only as CLAUDE.md prose (REGRA #1/#2). No hook or test prevents an edit landing in the cache directory.

**Why it matters:** editing the cache instead of canonical silently diverges the shipped plugin from source — exactly the kind of drift the project's history (the pre-2026-04-30 marketplace-without-git episode, documented right below the rule) already paid for once.

**Recommended home:** a **hook/validator**. A `PreToolUse:Edit|Write` guard that **denies writes whose resolved path is inside a marketplace-cache directory** (deny-list on the known cache root) turns this from prose into a fail-closed check. This fits the existing `edit-guard-hook.cjs` pattern, which already path-gates writes.

### 3. Designs are preserved history — never delete during syncs (REGRA, Política de edits)

**Rule:** `designs/`, `designs/legacy/`, `designs/slice-0/` are v5 design history and must be **preserved even during syncs**.

**Evidence it is ONLY here:** grep for the preservation rule outside CLAUDE.md finds only design files themselves and unrelated docs — no executable guard.

**Why it matters:** a sync or cleanup that drops `designs/legacy/` would erase the only record of the design lineage; nothing currently stops it.

**Recommended home:** a **packaging/CI validator** (and/or `.gitignore`-adjacent protection). A small test in the existing `tests/packaging/` family that asserts the `designs/` tree is present and non-empty would make the preservation rule machine-checked at release time.

### 4. Skill-governance preconditions (version-bump / lockstep gate)

**Rule:** consult `references/skill-governance.md` **before** bumping a skill version or refactoring skill content (lockstep between Claude/Cursor manifests, progressive-disclosure pattern).

**Evidence:** the *reference* `references/skill-governance.md` exists, but the **obligation to consult it before a bump** lives only as a CLAUDE.md sentence — there is no gate that fires on a skill-version change.

**Why it matters:** the manifests drift (the CLAUDE.md lineage itself records repeated "description lagging two minors" hygiene fixes). The rule is real; its enforcement is absent.

**Recommended home:** a **validator/test**. A lockstep test that fails when a skill's version changes without the Claude+Cursor manifests staying in sync would home this rule the same way `F7_version_sync` already homes the plugin-version SSOT.

---

## Summary table

| # | Rule (ONLY in CLAUDE.md) | Recommended home | Class |
|---|---|---|---|
| 1 | Voice-test communication contract | output-facing **agent frontmatter** + shared **reference** (+ optional response lint validator) | agent / reference / validator |
| 2 | Cache read-only; edits originate in canonical repo | **hook** (`edit-guard`-style cache-path deny) | hook |
| 3 | Preserve `designs/` history during syncs | **packaging/CI validator** | validator |
| 4 | Consult skill-governance before version bump | **lockstep test/validator** | validator |

---

## Recommendation

**Defer the migration; do it as its own minimal-diff iteration, one rule at a time.** The highest-value move is **#1 (voice test)** — it is the most user-visible rule and the one most completely invisible to the installed plugin today; home it first into a shared reference plus the output-facing agents' frontmatter. **#2 (cache read-only)** is the highest-value *enforcement* move because it is fail-closeable as a hook in the existing `edit-guard` style. **#3 and #4** are lighter packaging/lockstep validators that can ride along. None of these should be bundled into the current enforcement-determinism correction — each is a separate, independently-reviewed change, consistent with NFR-MINIMAL-DIFF. Until then, these rules remain dev-doc guidance that the installed plugin does not enforce, which is the gap this recommendation names honestly.

---

## RUN 002 — newly buildable-DEFER items (follow-ups, each with its now-buildable path)
- **Stop default-on flip** (REQ-DEFER-STOP-DEFAULT-ON): the recovery `additionalContext` ships; the flip needs a terminal-`completed` producer + live confirmation of the additionalContext key.
- **DoD#7 evidence-block consumer**: the machine-evidence ledger (run 002) now exists; wiring a consumer that blocks on missing mandatory evidence via `evidenceRequired()` is the next layer.
- **Parent-child authenticated identity**: still blocked — PreToolUse:Agent carries no spawning-agent identity; best-effort correlation ships.
