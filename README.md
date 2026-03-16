<p align="center">
  <img src="docs/assets/fx-studio-ai-logo.png" alt="FX Studio AI" width="400">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-Plugin-7C3AED?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTEyIDJMNiA3djEwbDYgNSA2LTVWN3oiLz48L3N2Zz4=" alt="Claude Code Plugin">
  <img src="https://img.shields.io/badge/version-2.0.0-blue?style=for-the-badge" alt="Version 2.0.0">
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT License">
  <img src="https://img.shields.io/badge/agents-14-orange?style=for-the-badge" alt="14 Agents">
  <img src="https://img.shields.io/badge/dependencies-zero-black?style=for-the-badge" alt="Zero Dependencies">
</p>

<h1 align="center">Pipeline Orchestrator</h1>

<p align="center">
  <strong>One command. Fourteen agents. Zero guesswork.</strong>
  <br><br>
  You type <code>/pipeline fix the auth bug</code>.<br>
  Fourteen specialized agents classify it, write tests first,<br>
  implement the fix, review it for security holes,<br>
  and hand you a Go/No-Go decision with evidence.<br><br>
  <em>You stay in control. The pipeline does the heavy lifting.</em>
</p>

<p align="center">
  <a href="#30-second-demo">See it in action</a> &nbsp;&bull;&nbsp;
  <a href="#install-in-10-seconds">Install</a> &nbsp;&bull;&nbsp;
  <a href="#how-it-works">How it works</a> &nbsp;&bull;&nbsp;
  <a href="#the-14-agents">Meet the agents</a> &nbsp;&bull;&nbsp;
  <a href="docs/adapter-guide.md">Adapter Guide</a>
</p>

---

## The Problem

You ask Claude to fix a bug. It dives straight into code. No tests. No security check. No validation that the fix didn't break something else. You review the diff, squint at it, and think *"I guess that looks right?"*

Now multiply that by every feature, every bug, every refactor.

**That's not engineering. That's hoping.**

---

## The Solution

Pipeline Orchestrator turns every request into a structured, evidence-based workflow:

```
You:     /pipeline fix the login bug that causes double redirect on mobile
```

```
╔══════════════════════════════════════════════════════════╗
║  PIPELINE PROPOSAL                                       ║
╠══════════════════════════════════════════════════════════╣
║  Type:        Bug Fix                                     ║
║  Complexity:  MEDIA (3 files, auth domain)                ║
║  Pipeline:    bugfix-light                                ║
║  Info-Gate:   CLEAR                                       ║
║  TDD:         1 regression + 1 edge case                  ║
║  Batch size:  2-3 tasks                                   ║
╚══════════════════════════════════════════════════════════╝

Confirm this pipeline? (yes / no / adjust)
```

You say **yes**. The pipeline:

1. Writes tests **before** code (TDD — always)
2. Implements the minimal fix
3. Checks it follows your project's patterns
4. Validates the build passes
5. Reviews it for security vulnerabilities
6. Presents a **Go/No-Go** decision with actual command output as proof

Every claim backed by evidence. Every step auditable. Every fix tested before it ships.

---

## 30-Second Demo

<table>
<tr>
<td width="50%" valign="top">

### Simple bug fix
```
> /pipeline fix typo in error message

Phase 0: Bug Fix / SIMPLES → DIRETO
Phase 2: 1 task → done
Phase 3: Build passes → GO

(A) Commit  (B) Push+PR  (C) Keep  (D) Discard
```
**Total overhead: ~30 seconds of classification.**<br>
Then it just fixes the typo and validates.

</td>
<td width="50%" valign="top">

### Complex feature
```
> /pipeline redesign the authentication flow

Phase 0: Feature / COMPLEXA → implement-heavy
  Info-gate: "Which OAuth providers?"
  Info-gate: "Session timeout policy?"
Phase 1: Confirmed
Phase 2: 6 tasks, 6 batches (1 per batch)
  TDD: 12 tests written first
  Architecture review: pattern conformance
  Adversarial: 7 security checklists
Phase 3: GO

(A) Commit  (B) Push+PR  (C) Keep  (D) Discard
```
**Full governance. Same single command.**

</td>
</tr>
</table>

---

## Install in 30 Seconds

**Step 1 — Clone the plugin:**

```bash
git clone https://github.com/fernandoxavier02/Pipeline-Orchestrator.git ~/.claude/plugins/pipeline-orchestrator
```

**Step 2 — Register the marketplace and enable the plugin:**

Add this to your `~/.claude/settings.json` (create the file if it doesn't exist):

```jsonc
{
  "extraKnownMarketplaces": {
    "FX-studio-AI": {
      "source": {
        "source": "directory",
        "path": "~/.claude/plugins/pipeline-orchestrator"
      }
    }
  },
  "enabledPlugins": {
    "pipeline-orchestrator@FX-studio-AI": true
  }
}
```

> If you already have `enabledPlugins` or other fields, merge the entries — don't replace the whole file.

**Step 3 — Restart Claude Code.** Type `/pipeline` to verify it loaded.

**That's it.** No API keys. No runtime dependencies. Pure markdown — the pipeline auto-detects your build commands from `package.json`, `Makefile`, `Cargo.toml`, or `pyproject.toml`.

---

## How It Works

```
                        /pipeline [your request]
                              │
                 ┌────────────┴────────────┐
                 │   PHASE 0: TRIAGE        │
                 │                          │
                 │  task-orchestrator        │  classifies type + complexity
                 │  information-gate         │  catches what you forgot to mention
                 └────────────┬────────────┘
                              │
                 ┌────────────┴────────────┐
                 │   PHASE 1: PROPOSAL      │
                 │                          │
                 │  "Bug Fix / MEDIA /      │
                 │   bugfix-light"          │
                 │                          │
                 │  Confirm? (yes/no)       │  you decide, always
                 └────────────┬────────────┘
                              │
                 ┌────────────┴────────────┐
                 │   PHASE 2: EXECUTION     │
                 │                          │
                 │  ┌─ TDD ────────────┐    │
                 │  │ quality-gate  ●──│──> │  you approve test scenarios
                 │  │ pre-tester    ●  │    │  tests written (RED)
                 │  └──────────────────┘    │
                 │                          │
                 │  ┌─ Per Batch ───────┐   │
                 │  │ micro-gate     ●  │   │  verify before coding
                 │  │ implementer    ●  │   │  write code (GREEN)
                 │  │ arch-review    ●  │   │  pattern conformance
                 │  │ checkpoint     ●  │   │  build + test proof
                 │  │ adversarial    ●  │   │  security review
                 │  │ fix loop    (≤3)  │   │  auto-fix or escalate
                 │  └──────────────────┘   │
                 └────────────┬────────────┘
                              │
                 ┌────────────┴────────────┐
                 │   PHASE 3: CLOSURE       │
                 │                          │
                 │  sanity-checker           │  final build + test proof
                 │  final-validator          │  Go / Conditional / No-Go
                 │  finishing-branch         │  commit, PR, keep, or discard
                 └──────────────────────────┘
```

### Proportional Rigor

The pipeline doesn't treat a typo fix like a database migration. Rigor scales automatically:

| | SIMPLES | MEDIA | COMPLEXA |
|:---|:---:|:---:|:---:|
| **Files** | 1-2 | 3-5 | 6+ |
| **Batch size** | all at once | 2-3 per batch | 1 per batch |
| **TDD** | 1 test | 3 tests | full suite |
| **Architecture review** | skip | check patterns | deep analysis |
| **Adversarial** | optional | 3 checklists | all 7 checklists |
| **Regression tracking** | skip | per-checkpoint | cumulative |

---

## The 14 Agents

Every agent has one job. No agent guesses. If information is missing, the pipeline **stops and asks**.

<table>
<tr>
<td width="33%" valign="top">

### Core (7)

| Agent | Role |
|:------|:-----|
| **task-orchestrator** | Classifies type + complexity |
| **information-gate** | Catches knowledge gaps |
| **adversarial-batch** | Per-batch security review |
| **checkpoint-validator** | Build + test proof |
| **sanity-checker** | Final validation |
| **final-validator** | Go/No-Go decision |
| **finishing-branch** | Git + rollback |

</td>
<td width="33%" valign="top">

### Executor (4)

| Agent | Role |
|:------|:-----|
| **executor-controller** | Orchestrates batches |
| **executor-implementer** | Writes code (1 task) |
| **executor-spec-reviewer** | Verifies spec match |
| **executor-quality-reviewer** | SOLID / KISS / DRY |

</td>
<td width="33%" valign="top">

### Quality (3)

| Agent | Role |
|:------|:-----|
| **quality-gate-router** | Designs test scenarios |
| **pre-tester** | Writes tests (RED) |
| **architecture-reviewer** | Pattern conformance |

</td>
</tr>
</table>

---

## What Makes It Different

### It asks before it guesses

Most AI coding tools dive straight into implementation. This one **stops** when information is missing:

```
Info-gate: "Where should session tokens be stored?
            (a) httpOnly cookie  (b) localStorage  (c) sessionStorage"

You: (a)

Info-gate: CLEAR — no remaining gaps.
```

No invented defaults. No "reasonable assumptions." If it doesn't know, it asks.

### Tests come first — always

```
quality-gate → "Should redirect to /dashboard after login"    ← you approve
pre-tester   → writes test that FAILS (RED)                   ← proof it doesn't work yet
implementer  → writes minimum code to PASS (GREEN)            ← now it works
checkpoint   → "npm test: 14 passed, 0 failed" (actual output) ← proof
```

### It can't loop forever

```
Finding detected → fix attempt 1 → still broken
                 → fix attempt 2 → still broken
                 → fix attempt 3 (different approach) → still broken
                 → STOP. Here are 2 alternatives. You decide.
```

Three attempts. Then it stops and asks for help. No infinite retry loops.

### Every claim has evidence

The pipeline never says *"should work"* or *"probably fixed."* Every assertion includes:

```
Command:  npm run build
Exit:     0
Output:   ✓ Compiled successfully in 4.2s
Verdict:  Build PASSES
```

Actual command. Actual output. Actual interpretation.

### Architecture doesn't drift

The **architecture-reviewer** agent checks every batch against your project's patterns:

- Does the new code use your error contract or reinvent one?
- Does it follow your naming conventions?
- Does it duplicate logic that already exists somewhere?
- Does it respect your layer boundaries?

Code that compiles and passes tests but **doesn't fit your codebase** gets flagged.

---

## Pipeline Variants

5 task types. 3 complexity levels. 10 pipeline variants. Automatically selected.

| Type | SIMPLES | MEDIA | COMPLEXA |
|:-----|:-------:|:-----:|:--------:|
| **Bug Fix** | direct | `bugfix-light` | `bugfix-heavy` |
| **Feature** | direct | `implement-light` | `implement-heavy` |
| **User Story** | direct | `user-story-light` | `user-story-heavy` |
| **Audit** | direct | `audit-light` | `audit-heavy` |
| **UX Simulation** | direct | `ux-sim-light` | `ux-sim-heavy` |

---

## Execution Modes

```bash
# The default — full pipeline from classification to Go/No-Go
/pipeline fix the login bug that causes double redirect

# Just classify — see what the pipeline would do, then stop
/pipeline diagnostic add dark mode to settings

# Resume from where you left off
/pipeline continue

# Override complexity when you know better
/pipeline --complexa redesign the entire auth module

# Production on fire? Emergency mode with streamlined gates
/pipeline --hotfix users can't login since last deploy
```

---

## 7 Adversarial Checklists

Loaded proportionally — SIMPLES skips, MEDIA gets 3, COMPLEXA gets all 7:

| Checklist | What it catches |
|:----------|:----------------|
| **auth** | Missing auth checks, session fixation, token leaks |
| **input-validation** | Unsanitized input, type confusion, boundary violations |
| **error-handling** | Swallowed errors, leaked stack traces, missing fallbacks |
| **injection** | SQL injection, XSS, command injection, template injection |
| **data-integrity** | Duplicate sources of truth, unsafe migrations, lost writes |
| **crypto** | Hardcoded secrets, weak hashing, missing TLS |
| **business-logic** | Race conditions, privilege escalation, state bypass |

---

## Configuration

**Zero config required.** The pipeline auto-detects everything from your project structure.

Want to customize? Create `.claude/pipeline.local.md`:

```yaml
---
doc_path: ".pipeline/docs"
build_command: "npm run build"
test_command: "npm test"
patterns_file: "PATTERNS.md"
spec_path: "specs/"
---
```

<details>
<summary><strong>Examples for other stacks</strong></summary>

**Python**
```yaml
---
build_command: "python -m py_compile main.py"
test_command: "pytest"
---
```

**Rust**
```yaml
---
build_command: "cargo build"
test_command: "cargo test"
---
```

**Go**
```yaml
---
build_command: "go build ./..."
test_command: "go test ./..."
---
```

</details>

---

## Architecture

```
pipeline-orchestrator/
│
├── skills/pipeline/SKILL.md          # Entry point (~80 lines)
├── commands/pipeline.md              # The brain — orchestration logic
│
├── agents/
│   ├── core/                         # 7 agents: triage → closure
│   ├── executor/                     # 4 agents: batched implementation
│   └── quality/                      # 3 agents: TDD + architecture
│
├── references/
│   ├── pipelines/                    # 10 variant definitions
│   ├── checklists/                   # 7 security checklists
│   ├── gates/                        # Defense-in-depth gate specs
│   └── glossary.md                   # Term definitions
│
├── hooks/hooks.json                  # Session startup hook
└── .claude-plugin/plugin.json        # Plugin manifest
```

**Progressive disclosure** — Claude Code loads only `SKILL.md` initially (~80 lines). Agents and references load on-demand as the pipeline progresses. Your context window stays clean.

---

## Safety Guarantees

| Guarantee | How |
|:----------|:----|
| **Never guesses** | Information-gate blocks until gaps are resolved |
| **Never loops forever** | Fix loop capped at 3 attempts, then escalates |
| **Never claims without proof** | Every "passes" includes the actual command output |
| **Never skips tests** | TDD is mandatory — RED before GREEN, always |
| **Never ignores your patterns** | Architecture reviewer checks conformance per batch |
| **Never runs away** | You confirm the proposal before execution starts |
| **Never hides problems** | Adversarial reviewer thinks like an attacker |
| **Stops when stuck** | 2 consecutive build failures = pipeline stops + escalates |

---

## How It Compares

| | Manual review | CI/CD only | **Pipeline Orchestrator** |
|:-|:---:|:---:|:---:|
| Auto-classifies tasks | | | Yes |
| Asks before guessing | | | Yes |
| TDD enforced | Sometimes | Config-dependent | Always |
| Security review | Manual | Static analysis | 7 contextual checklists |
| Architecture conformance | Code review | Linters | Semantic pattern check |
| Proportional rigor | | Same for all | Scales with complexity |
| Bounded fix loops | | Retry forever | Max 3, then escalate |
| Evidence-based claims | | Logs exist | Every claim needs proof |
| Works with any project | | Per-project setup | Auto-detects |
| Production hotfix mode | | | Streamlined gates |

---

## Full Walkthroughs

- [Simple Bug Fix](docs/examples/simple-bugfix.md) — typo fix, 30 seconds, minimal overhead
- [Medium Feature](docs/examples/medium-feature.md) — dark mode toggle, TDD, 2 batches, adversarial review
- [Complex Audit](docs/examples/complex-audit.md) — auth module, 7 checklists, full governance

---

## Portability

The **orchestration logic** is model-agnostic. The **integration layer** is Claude Code-specific:

| Portable (the ideas) | Claude Code-specific (the glue) |
|:---|:---|
| Classification matrix (5 types x 3 levels) | `.claude-plugin/plugin.json` manifest |
| Defense-in-depth gates (macro + micro) | Agent dispatch via `Task` tool |
| Adaptive batch execution with TDD | `SKILL.md` / `commands/*.md` format |
| Per-batch adversarial review with fix cap | `model: sonnet/opus/haiku` hints |
| Proportionality + non-invention | `hooks.json` session hooks |

Everything is pure markdown. Porting to Cursor, Windsurf, Codex, or other AI coding tools means adapting the integration layer. The pipeline logic stays the same.

See the [Adapter Guide](docs/adapter-guide.md) for migration details.

---

## Requirements

- [Claude Code](https://claude.ai/code) CLI
- That's it. Zero runtime dependencies. Pure markdown.

---

## Contributing

1. Fork this repo
2. Create a feature branch
3. Make your changes
4. Run `/pipeline` on your own changes (yes, it pipelines itself)
5. Submit a PR

---

## License

[MIT](LICENSE) — use it, fork it, adapt it, ship it.

---

<p align="center">
  <sub>Built with obsessive attention to <strong>when AI should stop and ask</strong>.</sub>
  <br>
  <sub>by <strong>FX Studio AI</strong></sub>
</p>
