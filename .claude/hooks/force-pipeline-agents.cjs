#!/usr/bin/env node
/**
 * Hook: force-pipeline-agents v1.0
 *
 * BLOQUEIA respostas que não usam Task tool para requests de implementação.
 *
 * Este hook é executado em UserPromptSubmit e:
 * 1. Detecta se é request de implementação (não conversacional, não skill)
 * 2. Injeta instrução OBRIGATÓRIA de usar Task tool
 * 3. O hook de resposta (se houver) pode verificar se Task foi chamado
 *
 * Mantém o sistema de agentes funcionando de forma DETERMINÍSTICA.
 */

const fs = require('fs');
const path = require('path');
const enforcement = require('./skill-frontmatter-parser.cjs');

// ============================================================
// CONFIGURAÇÃO
// ============================================================

// Padrões de SKILLS - usa skill, não precisa de orchestrator externo
// v4.2: thin entry-points to pipeline-controller registered via fully-qualified
// `pipeline-orchestrator:<name>` form ONLY (SEC-2 fix v4.2.1). The previous
// version accepted bare `/bugfix`, `/feature`, etc. without the namespace prefix,
// which collided with same-named commands from other plugins in the marketplace.
const SKILL_PATTERNS = [
  /^\/(context|commit|code-review|fix|verify|deploy|qa|test|pipeline)/i,
  /^\/pipeline-orchestrator:(pipeline|bugfix|feature|userstory|audit|ux)\b/i,
  /^\/kiro:/i,
  /^\/prompts:/i,
  /^\/vertical/i,
];

// Padrões de IMPLEMENTAÇÃO - OBRIGATÓRIO usar Task tool
const IMPLEMENTATION_PATTERNS = [
  // Verbos de ação
  /\b(fix|corrig|arrum|consert|resolv)/i,
  /\b(implement|criar|crie|adicion|add|desenvolv)/i,
  /\b(alter|modific|mud|atualiz|updat)/i,
  /\b(remov|delet|exclu|apag)/i,
  /\b(refator|refactor|reescrev|rewrite)/i,
  /\b(configur|setup|instal)/i,
  /\b(migr|convert|transform)/i,

  // Indicadores de bug/erro
  /\b(bug|erro|error|fail|falha|quebr|broken|crash)/i,
  /\b(não funciona|nao funciona|not working|doesn't work)/i,

  // Indicadores de urgência
  /\b(urgente|urgent|hotfix|produção|production|crítico|critical)/i,

  // Indicadores de feature
  /\b(feature|funcionalidade|novo|nova|new)/i,
  /\b(botão|button|tela|screen|página|page|componente|component)/i,
];

// ============================================================
// FUNÇÕES
// ============================================================

function isTrivialChat(prompt) {
  const trimmed = prompt.trim();

  // Muito curto = provavelmente conversacional
  if (!trimmed) return true;

  // Verifica padrões de skip
  const trivialChatPatterns = [
    /^(oi|ola|hey|hi|hello)$/i,
    /^(obrigado|valeu)$/i,
    /^(ok|entendi|certo|sim|nao)$/i,
    /^(bom dia|boa tarde|boa noite|tudo bem|beleza)$/i,
  ];

  for (const pattern of trivialChatPatterns) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

function isSkillCommand(prompt) {
  const trimmed = prompt.trim().toLowerCase();

  for (const pattern of SKILL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

function isImplementationRequest(prompt) {
  const trimmed = prompt.trim();

  for (const pattern of IMPLEMENTATION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

function isPipelineWorthy(prompt) {
  const trimmed = (prompt || '').trim();

  if (!trimmed) return false;
  if (isImplementationRequest(trimmed)) return true;

  // Requests longas geralmente pedem analise/execucao mais disciplinada
  if (trimmed.length >= 140) return true;

  const pipelineWorthyPatterns = [
    /\b(analise|analisar|auditar|auditoria|revisar|verificar|investigar|diagnostic|causa raiz|root cause)\b/i,
    /\b(pipeline|agentes|orquestrador|orchestrator|classifier|executor|observabilidade|logs|tracing|correlation|runlog)\b/i,
    /\b(nao esta funcionando|nao funciona|precario|nao cumprem)\b/i,
    /\b(\.\w{1,4})\b.*\b(fix|bug|erro|alter|criar|remov|refator)/i,
  ];

  for (const pattern of pipelineWorthyPatterns) {
    if (pattern.test(trimmed)) return true;
  }

  return false;
}

// ============================================================
// MENSAGENS
// ============================================================

const ENFORCEMENT_MESSAGE = `
⛔ PIPELINE DE AGENTES OBRIGATÓRIO ⛔

Esta solicitação requer o pipeline de agentes. Você DEVE:

1. **USAR** a skill /pipeline — ela orquestra todo o fluxo automaticamente
   - Ou chamar o Agent tool com subagent_type="task-orchestrator"

2. **AGUARDAR** o orchestrator classificar e emitir ORCHESTRATOR_DECISION

3. O pipeline segue automaticamente:
   - task-orchestrator → information-gate → quality-gate-router → pre-tester
   - executor-controller → review-orchestrator → sanity-checker → final-validator

4. **SE trivial indicado**, pode executar direto após o ORCHESTRATOR_DECISION

⚠️ NÃO COMECE A IMPLEMENTAR SEM O PIPELINE PRIMEIRO!

Os agentes são fornecidos pelo plugin pipeline-orchestrator (FX-studio-AI).
`.trim();

const SKILL_MESSAGE = `
✅ Skill detectado - executando diretamente.
`.trim();

const PIPELINE_SKILL_MESSAGE = `
✅ Skill /pipeline detectado — executando pipeline completo.

⚠️ FASES OBRIGATÓRIAS — NÃO PULAR NENHUMA:

Phase 0: Spawnar task-orchestrator (classificação) → information-gate (lacunas)
Phase 1: Apresentar PIPELINE PROPOSAL → AskUserQuestion para confirmação
Phase 2: Batch execution com checkpoint-validator → adversarial gate por batch
Phase 3: sanity-checker → final-validator (Pa de Cal) → finishing-branch

REGRAS DE ENFORCEMENT:
- Cada fase DEVE ser executada via Agent tool (subagent spawn), não inline
- Phase transitions DEVEM emitir bloco de resumo
- Gate decisions DEVEM ser logadas em gate-decisions.jsonl
- NÃO classificar como trivial para pular fases — se /pipeline foi invocado, TODAS as fases se aplicam
`.trim();

// ============================================================
// v4.8.0 GATES_AT ENFORCEMENT
// ============================================================
//
// When a backing skill is in flight (sentinel-state.json has current_skill +
// current_step), and current_step is in the SKILL.md frontmatter `gates_at`
// list, this hook checks that gate-decisions.jsonl already records evidence
// of an AskUserQuestion / gate decision for that step. Missing evidence:
// - warn (until 2026-05-17): log ENFORCEMENT_WARN to gate-decisions.jsonl + stderr
// - deny (after 2026-05-17): emit a [ENFORCEMENT_DENY] systemMessage (does NOT
//   block the prompt — UserPromptSubmit cannot deny — but surfaces to operator).

function checkGateLogged() {
  const docPath = (process.env.PIPELINE_DOC_PATH || '').trim();
  if (!docPath) return null;
  const statePath = path.join(docPath, 'sentinel-state.json');
  let state;
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; }
  const ctx = enforcement.getCurrentSkill(state);
  if (!ctx || !ctx.step) return null;
  const repoRoot = process.env.PIPELINE_REPO_ROOT || process.cwd();
  const skillResult = enforcement.readSkillFrontmatter(ctx.skill, repoRoot);
  if (!skillResult.ok || !Array.isArray(skillResult.frontmatter.gates_at)) return null;
  if (!skillResult.frontmatter.gates_at.includes(ctx.step)) return null; // Not at gate
  // Look for gate evidence in gate-decisions.jsonl
  const logPath = path.join(docPath, 'gate-decisions.jsonl');
  let logText = '';
  try { logText = fs.readFileSync(logPath, 'utf8'); } catch { /* ok if missing */ }
  // Heuristic: any line that mentions this step number, or a gate/askuser keyword.
  const stepRegex = new RegExp(`(askuser|"gate"\\s*:|"step"\\s*:\\s*${ctx.step}\\b|step.{0,8}${ctx.step})`, 'i');
  if (stepRegex.test(logText)) return null; // Evidence found
  return {
    violation: `gate at step ${ctx.step} of skill ${ctx.skill} required but no gate decision logged`,
    hint: 'Controller must invoke AskUserQuestion and log decision before proceeding past this step',
    pipeline_doc_path: state.pipeline_doc_path || docPath,
    skill: ctx.skill,
    step: ctx.step,
  };
}

function applyGateEnforcement() {
  let violation;
  try { violation = checkGateLogged(); } catch { return null; }
  if (!violation) return null;
  const mode = enforcement.getEnforcementMode();
  enforcement.logEnforcementDecision(violation.pipeline_doc_path, {
    mode, hook: 'force-pipeline-agents', skill: violation.skill, step: violation.step,
    violation: violation.violation, detail: violation.hint, pipeline_doc_path: violation.pipeline_doc_path,
  });
  process.stderr.write(`[ENFORCEMENT_${mode === 'deny' ? 'DENY' : 'WARN'}] force-pipeline-agents: ${violation.violation}\n`);
  return mode === 'deny' ? `[ENFORCEMENT_DENY] ${violation.violation}. ${violation.hint}` : null;
}

// ============================================================
// MAIN
// ============================================================

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const raw = (input || '').trim();

    let prompt = '';
    if (raw) {
      try {
        const data = JSON.parse(raw);
        prompt =
          data.prompt ||
          data.arguments ||
          data.input ||
          data.text ||
          data.message ||
          '';
      } catch {
        prompt = raw;
      }
    }

    // Fallback: alguns runners passam texto via argv (sem leitura de arquivo por seguranca).
    if (!prompt) {
      const argvInput = process.argv.slice(2).join(' ').trim();
      if (argvInput) {
        prompt = argvInput;
      }
    }

    // 0. v4.8.0 gates_at enforcement (runs before all routing — independent advisory).
    // Returns a deny message string if mode=deny + gate violated; surfaces via systemMessage.
    // Never blocks the prompt itself; UserPromptSubmit cannot deny.
    const gateDenyMsg = applyGateEnforcement();

    // 1. Se é conversacional/meta → passa direto
    if (isTrivialChat(prompt)) {
      console.log(JSON.stringify(gateDenyMsg
        ? { continue: true, systemMessage: gateDenyMsg }
        : { continue: true }));
      return;
    }

    // 2. Se é skill → passa direto (skill tem seu próprio fluxo)
    if (isSkillCommand(prompt)) {
      // v4.2: thin entry-points (bugfix/feature/userstory/audit/ux) trigger same PIPELINE_SKILL_MESSAGE
      // v4.2.1 (SEC-2 fix): bare /bugfix, /feature, /audit, etc. NO LONGER match here —
      // they could belong to other plugins. We require the fully-qualified
      // `pipeline-orchestrator:` namespace OR the legacy bare `/pipeline` alias.
      //
      // CONVENTION: case-insensitivity is enforced ONLY via the /i flag below.
      // isSkillCommand() lowercases the prompt before SKILL_PATTERNS testing — that
      // lowercased form does NOT propagate here; this regex receives the raw
      // prompt.trim() and relies on /i alone. Removing /i here re-opens SEC-1
      // (uppercase invocations would create a session lock but skip phase
      // enforcement). Do NOT remove /i without updating this comment + tests.
      const isPipelineSkill = /^\/(pipeline-orchestrator:(pipeline|bugfix|feature|userstory|audit|ux)|pipeline)\b/i.test(prompt.trim());
      console.log(JSON.stringify({
        continue: true,
        systemMessage: isPipelineSkill ? PIPELINE_SKILL_MESSAGE : SKILL_MESSAGE
      }));
      return;
    }

    // 3. Se é request de implementação → FORÇA usar Task tool
    if (isPipelineWorthy(prompt)) {
      console.log(JSON.stringify({
        continue: true,
        systemMessage: ENFORCEMENT_MESSAGE
      }));
      return;
    }

    // 4. Caso não identificado → passa mas sugere orchestrator
    console.log(JSON.stringify({
      continue: true,
      systemMessage: "💡 Considere usar o Task tool com task-orchestrator para classificar esta solicitação."
    }));

  } catch (e) {
    // Em caso de erro, não bloqueia
    console.log(JSON.stringify({ continue: true }));
  }
});
