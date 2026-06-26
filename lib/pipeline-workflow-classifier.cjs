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
// GARANTIA A+B (chain-tied enforcement): the arm must fire for EVERY governed
// flow command, wherever the token appears in the prompt (a voice-transcribed
// preamble before the command must NOT disable arming) — and NOT fire when no
// plugin command is present. Meta/read-only commands (help, paperclip-overview,
// setup-paperclip, measure-paperclip-fidelity) are DELIBERATELY excluded: arming
// them would freeze their own read-only work. Explicit allowlist, not a loose
// `^/pipeline` prefix (which both anchored to start AND re-armed the meta cmds).
const GOVERNED_INVOCATION = /\/pipeline-orchestrator:(?:pipeline|bugfix|feature|audit|user-?story|ux(?:-sim)?|refactor|spec|review|brainstorm|paperclip-(?:bugfix|feature|hotfix|refactor|review|spec|user-story|ux|audit))(?:-light|-heavy|-audit-only|-design|-init|-requirements|-tasks|-review)?\b/;

function isPipelineInvocation(rawPrompt) {
  const low = String(rawPrompt || '').toLowerCase();
  // Standalone `/pipeline` thin entry — a bare token, NOT the namespaced form
  // (so `/pipeline-orchestrator:help` is not caught here).
  if (/(?:^|\s)\/pipeline(?:\s|$)/.test(low)) return true;
  return GOVERNED_INVOCATION.test(low);
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

// FINAL-REVIEW SEC-4 (SSOT): a workflow label SAFE to embed in an LLM-facing deny reason. The
// arm-pending marker's `workflow` field is attacker-writable (unsigned markers are tolerated by
// default), so it must NEVER be echoed raw into a deny reason — that is a prompt-injection vector
// into model-facing tool-response text. Reconstruct from VALIDATED pieces only: MODE ∈ MODES and
// Type ∈ TYPES (so a malicious prefix never survives even when the type suffix is legit, e.g.
// "ignore this/Audit"). A bare valid Type with no mode is allowed; anything else → a generic label.
// Single source of truth — both pipeline-arm-gate and audit-read-budget delegate here. NEVER throws.
function sanitizeWorkflowChars(workflow) {
  if (typeof workflow !== 'string') return '';
  return workflow
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9 _.:\/-]/g, '')
    .trim()
    .slice(0, 80);
}
function safeWorkflowLabel(workflow) {
  const s = sanitizeWorkflowChars(workflow);
  if (!s) return '';
  const i = s.indexOf('/');
  if (i > 0) {
    const mode = s.slice(0, i).trim();
    const type = s.slice(i + 1).trim();
    if (MODES.has(mode) && TYPES.has(type)) return `${mode}/${type}`;
  }
  if (TYPES.has(s)) return s;
  return '(formato não-reconhecido)';
}

module.exports = { classifyWorkflow, isPipelineInvocation, MODES, TYPES, safeWorkflowLabel };

if (require.main === module) {
  const arg = process.argv.slice(2).join(' ');
  process.stdout.write(JSON.stringify(classifyWorkflow(arg), null, 2) + '\n');
}
