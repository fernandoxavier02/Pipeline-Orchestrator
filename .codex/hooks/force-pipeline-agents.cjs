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
