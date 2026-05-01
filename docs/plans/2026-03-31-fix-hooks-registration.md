# Fix Plugin Hooks Registration & Generalization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 3 new enforcement hooks functional by registering them in hooks.json, fixing the broken Codex hook, and removing project-specific hardcoded paths so the plugin works in any project.

**Architecture:** Plugin hooks are discovered via `hooks/hooks.json`. The `.claude/hooks/*.cjs` files exist but aren't referenced. The `.codex/hooks/force-pipeline-agents.cjs` crashes on a missing `require()`. Both enforcement hooks have project-specific paths (`OBZ/bpo-pricing-platform/`) that break generality.

**Tech Stack:** Node.js CJS scripts, Claude Code plugin hooks system

---

### Task 1: Register Claude hooks in hooks.json

**Files:**
- Modify: `hooks/hooks.json`

This is the critical fix — without it, the two `.claude/hooks/*.cjs` files are dead code.

- [ ] **Step 1: Verify current hooks.json only has SessionStart**

Run: `cat hooks/hooks.json`
Expected: Only a `SessionStart` entry with a prompt hook.

- [ ] **Step 2: Add UserPromptSubmit and Stop hook entries**

Replace the entire `hooks/hooks.json` with:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Pipeline Orchestrator v3.0.2 loaded. Try: /pipeline [task] for full execution, /pipeline diagnostic [task] to preview without executing, /pipeline --grill [task] for design interrogation. Config: create .claude/pipeline.local.md to set build/test commands (optional — auto-detection available)."
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/.claude/hooks/force-pipeline-agents.cjs\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/.claude/hooks/completion-checklist.cjs\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Validate JSON syntax**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add hooks/hooks.json
git commit -m "fix(hooks): register enforcement hooks in hooks.json

UserPromptSubmit → force-pipeline-agents.cjs (pipeline enforcement)
Stop → completion-checklist.cjs (completion verification)"
```

---

### Task 2: Fix Codex hook — remove broken require, make self-contained

**Files:**
- Modify: `.codex/hooks/force-pipeline-agents.cjs`

The hook calls `require("./orchestrator-gate-engine")` which doesn't exist. It needs the same self-contained stdin parsing and enforcement logic as the Claude version.

- [ ] **Step 1: Verify the hook crashes**

Run: `echo '{}' | node .codex/hooks/force-pipeline-agents.cjs`
Expected: `Error: Cannot find module './orchestrator-gate-engine'`

- [ ] **Step 2: Rewrite the hook as self-contained**

Replace `.codex/hooks/force-pipeline-agents.cjs` with:

```js
#!/usr/bin/env node
/**
 * Hook: force-pipeline-agents (Codex variant)
 *
 * Detects implementation requests and injects pipeline enforcement.
 * Self-contained — no external dependencies.
 */

const PIPELINE_SKILL_MESSAGE = [
  "Skill /pipeline detected - executing full pipeline.",
  "",
  "MANDATORY PHASES - DO NOT SKIP:",
  "Phase 0: Spawn task-orchestrator (classification) -> information-gate (gaps)",
  "Phase 1: Present PIPELINE PROPOSAL -> AskUserQuestion for confirmation",
  "Phase 2: Batch execution with checkpoint-validator -> adversarial gate per batch",
  "Phase 3: sanity-checker -> final-validator (Pa de Cal) -> finishing-branch",
  "",
  "ENFORCEMENT RULES:",
  "- Each phase MUST be executed via Agent tool (subagent spawn), not inline",
  "- Phase transitions MUST emit summary blocks",
  "- Gate decisions MUST be logged to gate-decisions.jsonl",
  "- Do NOT classify as trivial to skip phases - if /pipeline was invoked, ALL phases apply",
].join("\n");

const ENFORCEMENT_MESSAGE = [
  "This request requires the agent pipeline. You MUST:",
  "",
  "1. Use the /pipeline skill — it orchestrates the full flow automatically",
  "   - Or call Agent tool with subagent_type=\"task-orchestrator\"",
  "2. Wait for the orchestrator to classify and emit ORCHESTRATOR_DECISION",
  "3. Do NOT start implementing without the pipeline first.",
].join("\n");

const SKIP_PATTERNS = [
  /^(oi|ola|hey|hi|hello|obrigado|valeu|ok|entendi|certo|sim|nao|nada)$/i,
  /^(bom dia|boa tarde|boa noite|tudo bem|beleza)$/i,
  /^(o que|como|quando|onde|por que|porque|qual|quais|quem)\s/i,
  /\?$/,
  /^(explique|explica|me conta|descreve|o que eh|what is)/i,
  /^(liste|listar|mostre|mostrar|exiba|exibir|ver)\s/i,
];

const SKILL_PATTERNS = [
  /^\/(context|commit|code-review|fix|verify|deploy|qa|test|pipeline)/i,
  /^\/kiro:/i,
  /^\/prompts:/i,
  /^\/vertical/i,
];

const PIPELINE_WORTHY = [
  /\b(fix|corrig|arrum|consert|resolv)/i,
  /\b(implement|criar|crie|adicion|add|desenvolv)/i,
  /\b(alter|modific|mud|atualiz|updat)/i,
  /\b(remov|delet|exclu|apag)/i,
  /\b(refator|refactor|reescrev|rewrite)/i,
  /\b(configur|setup|instal)/i,
  /\b(migr|convert|transform)/i,
  /\b(bug|erro|error|fail|falha|quebr|broken|crash)/i,
  /\b(nao funciona|not working|doesn't work)/i,
  /\b(urgente|urgent|hotfix|producao|production|critico|critical)/i,
  /\b(feature|funcionalidade|novo|nova|new)/i,
  /\b(botao|button|tela|screen|pagina|page|componente|component)/i,
  /\b(analise|analisar|auditar|auditoria|revisar|verificar|investigar|diagnostic|causa raiz|root cause)\b/i,
  /\b(pipeline|agentes|orquestrador|orchestrator)\b/i,
];

function parsePrompt(raw) {
  if (!raw) return "";
  try {
    const data = JSON.parse(raw);
    return data.prompt || data.arguments || data.input || data.text || data.message || "";
  } catch {
    return raw;
  }
}

function isTrivial(prompt) {
  const trimmed = (prompt || "").trim();
  if (!trimmed) return true;
  return SKIP_PATTERNS.some((p) => p.test(trimmed));
}

function isSkill(prompt) {
  const trimmed = (prompt || "").trim();
  return SKILL_PATTERNS.some((p) => p.test(trimmed));
}

function isPipelineWorthy(prompt) {
  const trimmed = (prompt || "").trim();
  if (!trimmed) return false;
  if (trimmed.length >= 140) return true;
  return PIPELINE_WORTHY.some((p) => p.test(trimmed));
}

async function main() {
  let raw = "";
  await new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (buf += chunk));
    process.stdin.on("end", () => { raw = (buf || "").trim(); resolve(); });
  });

  let prompt = parsePrompt(raw).trim();
  if (!prompt) {
    const argvInput = process.argv.slice(2).join(" ").trim();
    if (argvInput) prompt = argvInput;
  }

  if (isTrivial(prompt)) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  if (isSkill(prompt)) {
    const isPipeline = /^\/(pipeline-orchestrator:pipeline|pipeline)\b/i.test(prompt.trim());
    if (isPipeline) {
      console.log(JSON.stringify({ continue: true, systemMessage: PIPELINE_SKILL_MESSAGE }));
    } else {
      console.log(JSON.stringify({ continue: true }));
    }
    return;
  }

  if (isPipelineWorthy(prompt)) {
    console.log(JSON.stringify({ continue: true, systemMessage: ENFORCEMENT_MESSAGE }));
    return;
  }

  console.log(JSON.stringify({ continue: true }));
}

main().catch(() => {
  console.log(JSON.stringify({ continue: true }));
});
```

- [ ] **Step 3: Verify the hook runs without errors**

Run: `echo '{}' | node .codex/hooks/force-pipeline-agents.cjs`
Expected: `{"continue":true}`

Run: `echo '{"prompt":"fix the login bug"}' | node .codex/hooks/force-pipeline-agents.cjs`
Expected: JSON with `systemMessage` containing enforcement text

- [ ] **Step 4: Commit**

```bash
git add .codex/hooks/force-pipeline-agents.cjs
git commit -m "fix(hooks): make Codex hook self-contained, remove broken require

Removed dependency on non-existent ./orchestrator-gate-engine module.
Internalized parsePrompt and enforcement logic matching the Claude variant."
```

---

### Task 3: Generalize Claude force-pipeline-agents.cjs — remove project-specific patterns

**Files:**
- Modify: `.claude/hooks/force-pipeline-agents.cjs`

Lines 114-115 contain project-specific patterns that make the hook assume a specific project structure.

- [ ] **Step 1: Identify project-specific patterns**

In `isPipelineWorthy()` function (lines 110-116), these patterns are project-specific:
- Line 114: `/\b(\.py|\.html|\.jinja|\.jinja2|\.css|\.js|\.md|\.json|\.sql)\b/i` — `.jinja`/`.jinja2` are niche; the generic file extensions are OK
- Line 115: `/\b(OBZ\/bpo-pricing-platform\/|migrations\/|app\/models\.py)\b/i` — entirely project-specific

- [ ] **Step 2: Replace project-specific patterns with generic ones**

Replace lines 110-116 of `.claude/hooks/force-pipeline-agents.cjs`:

```js
  const pipelineWorthyPatterns = [
    /\b(analise|analisar|auditar|auditoria|revisar|verificar|investigar|diagnostic|causa raiz|root cause)\b/i,
    /\b(pipeline|agentes|orquestrador|orchestrator|classifier|executor|observabilidade|logs|tracing|correlation|runlog)\b/i,
    /\b(nao esta funcionando|nao funciona|precario|nao cumprem)\b/i,
    /\b(\.py|\.html|\.jinja|\.jinja2|\.css|\.js|\.md|\.json|\.sql)\b/i,
    /\b(OBZ\/bpo-pricing-platform\/|migrations\/|app\/models\.py)\b/i,
  ];
```

With:

```js
  const pipelineWorthyPatterns = [
    /\b(analise|analisar|auditar|auditoria|revisar|verificar|investigar|diagnostic|causa raiz|root cause)\b/i,
    /\b(pipeline|agentes|orquestrador|orchestrator|classifier|executor|observabilidade|logs|tracing|correlation|runlog)\b/i,
    /\b(nao esta funcionando|nao funciona|precario|nao cumprem)\b/i,
    /\b(\.\w{1,4})\b.*\b(fix|bug|erro|alter|criar|remov|refator)/i,
  ];
```

This replaces two project-specific patterns with one generic pattern that detects file extensions mentioned alongside action verbs — a better heuristic for "talking about code changes."

- [ ] **Step 3: Verify the hook still works**

Run: `echo '{"prompt":"fix the login bug"}' | node .claude/hooks/force-pipeline-agents.cjs`
Expected: JSON with `systemMessage` containing enforcement text (matches `IMPLEMENTATION_PATTERNS`)

Run: `echo '{"prompt":"oi"}' | node .claude/hooks/force-pipeline-agents.cjs`
Expected: `{"continue":true}` (trivial chat, passes through)

Run: `echo '{"prompt":"analise o sistema de autenticacao"}' | node .claude/hooks/force-pipeline-agents.cjs`
Expected: JSON with `systemMessage` (matches `pipelineWorthyPatterns`)

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/force-pipeline-agents.cjs
git commit -m "fix(hooks): remove project-specific paths from enforcement hook

Replaced OBZ/bpo-pricing-platform and .jinja patterns with generic
file-extension+action-verb heuristic for cross-project compatibility."
```

---

### Task 4: Generalize completion-checklist.cjs — remove hardcoded project paths

**Files:**
- Modify: `.claude/hooks/completion-checklist.cjs`

Lines 73-74 hardcode `python -m compileall OBZ/bpo-pricing-platform/app` and `python -m unittest discover OBZ/bpo-pricing-platform/tests`. These must be generic.

- [ ] **Step 1: Replace hardcoded build/test commands with generic placeholders**

Replace lines 72-76 of `.claude/hooks/completion-checklist.cjs`:

```js
      '### Qualidade (.claude/rules/20-quality.md + 37-impl-flow.md)',
      '- [ ] Validacao executada? `python -m compileall OBZ/bpo-pricing-platform/app`',
      '- [ ] Testes executados (se existirem)? `python -m unittest discover OBZ/bpo-pricing-platform/tests`',
      '- [ ] Testes passaram? TDD RED->GREEN se implementou codigo',
      '- [ ] Sem regressoes? Suite de regressao do CHECKPOINT passa',
```

With:

```js
      '### Qualidade (.claude/rules/20-quality.md + 37-impl-flow.md)',
      '- [ ] Build/validacao executada? (use o comando de build do projeto)',
      '- [ ] Testes executados (se existirem)? (use o comando de test do projeto)',
      '- [ ] Testes passaram? TDD RED->GREEN se implementou codigo',
      '- [ ] Sem regressoes? Suite de regressao do CHECKPOINT passa',
```

- [ ] **Step 2: Update header comment to reflect generic scope**

Replace lines 1-15 of `.claude/hooks/completion-checklist.cjs`:

```js
#!/usr/bin/env node
/**
 * Hook: completion-checklist.cjs
 * Event: Stop
 *
 * When the agent attempts to stop, verifies that minimum requirements
 * were met according to pipeline orchestrator rules:
 *   - ORCHESTRATOR_DECISION emitted
 *   - Build/tests passed
 *   - Pipeline phases completed (if /pipeline was invoked)
 *
 * Generic — works with any project. Project-specific commands should
 * be configured in .claude/pipeline.local.md
 */
```

- [ ] **Step 3: Verify the hook runs without errors**

Run: `echo '{}' | node .claude/hooks/completion-checklist.cjs`
Expected: JSON with `additionalContext` containing the checklist (no `OBZ` references)

Run: `echo '{}' | node .claude/hooks/completion-checklist.cjs | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log(r.additionalContext.includes('OBZ')?'FAIL: still has OBZ':'PASS: no project-specific refs')})"`
Expected: `PASS: no project-specific refs`

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/completion-checklist.cjs
git commit -m "fix(hooks): generalize completion checklist for any project

Removed hardcoded OBZ/bpo-pricing-platform paths. Build/test commands
now defer to project configuration instead of assuming Python/OBZ."
```

---

### Task 5: Integration test — verify all hooks load

- [ ] **Step 1: Test all three hooks end-to-end**

Run: `echo '{"prompt":"implement new auth system"}' | node .claude/hooks/force-pipeline-agents.cjs`
Expected: JSON with enforcement systemMessage

Run: `echo '{"prompt":"/pipeline fix bug"}' | node .claude/hooks/force-pipeline-agents.cjs`
Expected: JSON with pipeline skill systemMessage

Run: `echo '{}' | node .claude/hooks/completion-checklist.cjs`
Expected: JSON with additionalContext checklist

Run: `echo '{"prompt":"fix the broken deploy"}' | node .codex/hooks/force-pipeline-agents.cjs`
Expected: JSON with enforcement systemMessage

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('hooks.json: valid')"`
Expected: `hooks.json: valid`

- [ ] **Step 2: Push to remote**

```bash
git push origin main
```

- [ ] **Step 3: Update local plugin and reload**

The plugin is installed at the same directory, so changes are already live.
User should run: `/reload-plugins` and verify 0 errors.
