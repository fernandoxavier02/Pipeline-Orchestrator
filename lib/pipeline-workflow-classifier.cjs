#!/usr/bin/env node
'use strict';

// =============================================================================
// pipeline-workflow-classifier.cjs — v8.7.0
// =============================================================================
// DETERMINISTIC workflow detection from the user's /pipeline prompt.
//
// ROOT CAUSE this addresses (audit 2026-06-18): when the user invokes
// `/pipeline-orchestrator:pipeline <prompt>`, NOTHING in code decided which
// workflow to run — it depended on the LLM reading the spec and choosing. This
// module makes the choice in CODE: pure, side-effect-free, same input → same
// output. The UserPromptSubmit wiring (separate step) calls this, writes the
// arm-pending marker, and tells the agent exactly which workflow is armed.
//
// Mirrors STEP 1 of agents/core/pipeline-controller.md (the mode/type table) but
// as executable logic instead of prose. Precedence: explicit mode flags >
// type/complexity/variant flags > keyword heuristic. NEVER throws.
// =============================================================================

const MODES = new Set(['FULL', 'DIAGNOSTIC', 'CONTINUE', 'HOTFIX', 'REVIEW-ONLY', 'PAPERCLIP']);
const TYPES = new Set(['Bug Fix', 'Feature', 'User Story', 'Audit', 'UX Simulation', 'Spec']);

function mk(mode, type, variant, complexity, source) {
  return { mode, type, variant, complexity, source };
}

// Detects whether a prompt is a pipeline entry-point invocation at all.
function isPipelineInvocation(rawPrompt) {
  const low = String(rawPrompt || '').trim().toLowerCase();
  return /^\/pipeline-orchestrator:(pipeline|bugfix|feature|userstory|user-story|audit|ux|ux-sim|spec)\b/.test(low)
    || /^\/pipeline\b/.test(low);
}

function classifyWorkflow(rawPrompt) {
  const p = String(rawPrompt || '');
  const low = p.toLowerCase();
  const has = (re) => re.test(low);

  // ---- 1. Explicit MODE flags (highest precedence) -------------------------
  if (has(/--on=paperclip\b/)) return mk('PAPERCLIP', null, null, null, 'flag:--on=paperclip');
  if (has(/--hotfix\b/)) return mk('HOTFIX', 'Bug Fix', 'bugfix-heavy', 'COMPLEXA', 'flag:--hotfix');
  if (has(/\breview-only\b/) && isPipelineInvocation(p)) return mk('REVIEW-ONLY', null, null, null, 'flag:review-only');
  if (has(/\bdiagnostic\b/) && isPipelineInvocation(p)) return mk('DIAGNOSTIC', null, null, null, 'flag:diagnostic');
  if (has(/\bcontinue\b/) && isPipelineInvocation(p)) return mk('CONTINUE', null, null, null, 'flag:continue');

  // ---- 2. Complexity / variant overrides -----------------------------------
  let complexity = null;
  if (has(/--complexa\b/)) complexity = 'COMPLEXA';
  else if (has(/--media\b/)) complexity = 'MEDIA';
  else if (has(/--simples\b/)) complexity = 'SIMPLES';

  let variant = null;
  const vm = low.match(/--variant=([a-z][a-z0-9-]*)/);
  if (vm) variant = vm[1];
  else if (has(/--heavy\b/)) variant = 'heavy';
  else if (has(/--light\b/)) variant = 'light';

  // ---- 3. TYPE: flag first, then keyword heuristic -------------------------
  let type = null;
  let source = 'heuristic:unclassified';

  // Explicit TYPE flags win over the keyword heuristic (so "--bugfix ... specs"
  // is a Bug Fix, not a Spec — the live mis-classification of 2026-06-18).
  if (has(/--type=spec\b/)) { type = 'Spec'; source = 'flag:--type=spec'; }
  else if (has(/--bug[\s-]?fix\b/)) { type = 'Bug Fix'; source = 'flag:--bugfix'; }
  else if (has(/--feature\b/)) { type = 'Feature'; source = 'flag:--feature'; }
  else if (has(/--audit\w*\b/)) { type = 'Audit'; source = 'flag:--audit'; }
  else if (has(/--user[\s-]?story\b/)) { type = 'User Story'; source = 'flag:--userstory'; }
  else if (has(/--ux(?:-?sim)?\b/)) { type = 'UX Simulation'; source = 'flag:--ux'; }
  else if (has(/\bspec\b/)) { type = 'Spec'; source = 'kw:spec'; }
  else if (has(/\b(audit\w*|revis\w*|review\w*|analis\w*|an[aá]lis\w*|investig\w*|diagnostic\w*|causa[\s-]?raiz|root[\s-]?cause)\b/)) {
    type = 'Audit'; source = 'kw:audit';
  } else if (has(/\b(bug|erro|error|fix|corrig\w*|consert\w*|quebr\w*|broken|crash|falha|n[aã]o funciona|not working|doesn'?t work)\b/)) {
    type = 'Bug Fix'; source = 'kw:bugfix';
  } else if (has(/\b(ux|usabilidade|acessibilidade|wcag|user journey|persona)\b/)) {
    type = 'UX Simulation'; source = 'kw:ux';
  } else if (has(/\b(user[\s-]?story|hist[oó]ria de usu[aá]rio|as an? user)\b/)) {
    type = 'User Story'; source = 'kw:userstory';
  } else if (has(/\b(feature|funcionalidade|implement\w*|criar|crie|adicion\w*|\badd\b|desenvolv\w*|nova|novo)\b/)) {
    type = 'Feature'; source = 'kw:feature';
  }

  return mk('FULL', type, variant, complexity, source);
}

module.exports = { classifyWorkflow, isPipelineInvocation, MODES, TYPES };

if (require.main === module) {
  const arg = process.argv.slice(2).join(' ');
  process.stdout.write(JSON.stringify(classifyWorkflow(arg), null, 2) + '\n');
}
