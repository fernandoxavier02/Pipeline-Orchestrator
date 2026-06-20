#!/usr/bin/env node
'use strict';

// =============================================================================
// dispatch-pending-gate.cjs — OBRIGA o dispatch de subagentes (v8.3.0, AUDIT-001)
// =============================================================================
// PROBLEMA (causa-raiz auditada 2026-06-17): o orquestrador PARENT respondia
// INLINE — fazia o trabalho dos subagentes em vez de despachá-los. A trava de
// dispatch-pending existente (shouldBlockOnPendingDispatch em edit-guard-hook.cjs)
// só barra ESCRITA de arquivo; se o parent apenas continua lendo/raciocinando/
// rodando comandos sem escrever, nada o barra.
//
// ESTE HOOK fecha o buraco. PreToolUse abrangente: enquanto houver um handshake
// (DISPATCH/GATE/PLAN_MODE_REQUEST) PENDENTE + VIVO no sentinel-state, BLOQUEIA
// (deny) qualquer ferramenta de TRABALHO do parent. Só passam:
//   - a RESOLUÇÃO / controle: Agent (delegação — o que queremos!), AskUserQuestion
//     (resolve GATE_REQUEST), EnterPlanMode/ExitPlanMode (resolve PLAN_MODE_REQUEST),
//     Task*/TodoWrite (gestão de progresso, não produção);
//   - isenções à prova de deadlock: exec-window válida (executor legítimo já
//     autorizado), caminho dentro de .pipeline/, e pending EXPIRADO por timeout
//     (recovery — nunca trava pra sempre).
//
// Default = `deny` (OBRIGA). Escape: PIPELINE_DISPATCH_INLINE_ENFORCEMENT=warn
// (registra INLINE_WORK_BLOCKED em protocol-events.jsonl e permite).
//
// A descoberta de estado / pending / exec-window é REUSADA de edit-guard-hook.cjs
// (SSOT). Só a formatação local trivial (pendingId / mensagem) vive aqui.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
const eg = require('./edit-guard-hook.cjs');

// Ferramentas que NUNCA são "trabalho inline": delegação (Agent), resolução de
// gate/plan-mode (AskUserQuestion/EnterPlanMode), controle de fluxo do harness e
// gestão de progresso. Liberadas mesmo com handshake pendente.
// Ferramentas de controle/resolução SEMPRE liberadas (gate/plan-mode são resolvidos
// por AskUserQuestion/EnterPlanMode; Task*/TodoWrite são gestão de progresso, não
// produção). 'Agent' NÃO entra aqui: um spawn de Agent só é liberado quando é a
// RESOLUÇÃO do handshake (ver isResolutionAgent) — senão o parent burlaria a trava
// despachando um agente IRRELEVANTE em vez do alvo do bloco pendente (SEC-1).
const ALWAYS_ALLOW_TOOLS = new Set([
  'AskUserQuestion',  // resolve um GATE_REQUEST
  'EnterPlanMode',    // resolve um PLAN_MODE_REQUEST
  'ExitPlanMode',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskOutput', 'TaskStop',
  'TodoWrite',
  'ScheduleWakeup',
]);

// Marcadores de payload de resolução (re-dispatch do controller carregando o resultado).
const RESOLUTION_MARKERS = ['DISPATCH_RESULTS', 'GATE_RESPONSES', 'PLAN_MODE_RESULTS'];

// Um spawn de Agent é "resolução" (liberado) quando: (a) o prompt carrega um payload de
// resolução, OU (b) despacha exatamente o alvo do bloco pendente. Caso contrário,
// despachar um agente qualquer NÃO resolve o handshake e é bloqueado (fecha o
// "wrong-Agent bypass" — SEC-1).
function isResolutionAgent(payload, pending) {
  if (payload.tool_name !== 'Agent') return false;
  const ti = payload.tool_input || {};
  const prompt = typeof ti.prompt === 'string' ? ti.prompt : '';
  if (RESOLUTION_MARKERS.some((m) => prompt.includes(m))) return true;
  const target = typeof ti.subagent_type === 'string' ? ti.subagent_type : '';
  const dispId = (typeof pending.dispatch_id === 'string' && pending.dispatch_id) || '';
  if (target && dispId) {
    const leaf = target.split(':').pop();
    if (dispId === target || (leaf && (dispId.includes(leaf) || leaf.includes(dispId)))) return true;
  }
  return false;
}

function pendingId(pending) {
  return (typeof pending.gate_id === 'string' && pending.gate_id)
    || (typeof pending.dispatch_id === 'string' && pending.dispatch_id)
    || (typeof pending.plan_id === 'string' && pending.plan_id)
    || '(unknown)';
}

function buildReason(pending, id, tool) {
  return (
    `INLINE_WORK_BLOCKED: há um ${pending.block_type} pendente e não-resolvido (id: ${id}) no sentinel-state. ` +
    `NÃO conduza o trabalho INLINE. Resolva o handshake: despache o subagente alvo via Agent tool, ` +
    `e/ou re-invoque o controller (chamada Agent() NOVA) com DISPATCH_RESULTS / GATE_RESPONSES / PLAN_MODE_RESULTS prependado. ` +
    `A ferramenta '${tool}' fica bloqueada até a resolução. Se o handshake morreu, ele expira por timeout (recovery automático).`
  );
}

function resolveDocDir(state, dir) {
  const env = (process.env.PIPELINE_DOC_PATH || '').trim();
  if (env) return env;
  const p = state && typeof state.pipeline_doc_path === 'string' ? state.pipeline_doc_path : '';
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.resolve(dir, p);
}

// Best-effort: registra o evento de bypass inline (modo warn) em protocol-events.jsonl.
function appendInlineEvent(state, dir, tool, id) {
  try {
    const docDir = resolveDocDir(state, dir);
    if (!docDir) return;
    const entry = {
      event: 'INLINE_WORK_BLOCKED',
      agent: 'parent',
      phase: 'pre-tool',
      detail: String(`inline ${tool} permitido sob PIPELINE_DISPATCH_INLINE_ENFORCEMENT=warn (pending ${id})`).replace(/[\r\n]+/g, ' ').slice(0, 200),
      decided_by: 'dispatch-pending-gate',
      timestamp: new Date().toISOString(),
    };
    fs.appendFileSync(path.join(docDir, 'protocol-events.jsonl'), JSON.stringify(entry) + '\n');
  } catch { /* nunca crashar o hook por causa de telemetria */ }
}

// Decisão pura: { decision: 'allow' | 'block', reason? }.
function decideInlineGate(payload) {
  if (!payload || typeof payload !== 'object') return { decision: 'allow' };
  const dir = payload.cwd;
  if (typeof dir !== 'string' || !dir) return { decision: 'allow' }; // sem contexto de projeto

  let state;
  try { state = eg.findActiveSentinelState(dir); } catch { return { decision: 'allow' }; }
  // Split the two cases (AUDIT-003, D3): a genuinely-ABSENT state is NOT evidence of
  // a pending handshake → fail-OPEN. But an authoritatively-CORRUPT state (unreadable
  // / tampered HMAC) must FAIL CLOSED for a GOVERNED work action — otherwise a one-byte
  // tamper neutralizes the inline-work lock. We cannot read pending_blocks from a
  // corrupt state, so "GOVERNED" here = a substantive work action that is NOT a
  // resolution/control tool, NOT exec-window-authorized, and NOT a .pipeline/ artifact
  // (exactly the carve-outs the live-handshake path already grants). Conservative:
  // only the otherwise-blockable work action fails closed; everything else stays open.
  if (!state) return { decision: 'allow' };
  const tool = typeof payload.tool_name === 'string' ? payload.tool_name : '(unknown)';
  if (state === eg.CORRUPT_SENTINEL) {
    if (ALWAYS_ALLOW_TOOLS.has(tool)) return { decision: 'allow' };
    // A resolution Agent (carries a resolution marker) is always allowed — but with no
    // readable pending block we can only honor the marker-based branch, not the
    // dispatch-id match. RESOLUTION_MARKERS is the safe subset.
    if (payload.tool_name === 'Agent') {
      const ti0 = payload.tool_input || {};
      const prompt0 = typeof ti0.prompt === 'string' ? ti0.prompt : '';
      if (RESOLUTION_MARKERS.some((m) => prompt0.includes(m))) return { decision: 'allow' };
    }
    try {
      const lock = eg.getActiveLock(dir);
      if (lock && eg.getActiveExecWindow(dir, lock.session_id)) return { decision: 'allow' };
    } catch { /* segue */ }
    const fp0 = payload.tool_input && payload.tool_input.file_path;
    if (typeof fp0 === 'string') {
      try { if (eg.isExemptPath(fp0, dir)) return { decision: 'allow' }; } catch { /* */ }
    }
    const enforce0 = String(process.env.PIPELINE_DISPATCH_INLINE_ENFORCEMENT || 'deny').toLowerCase();
    if (enforce0 === 'warn') return { decision: 'allow', warn: true };
    return {
      decision: 'block',
      reason:
        'DISPATCH_PENDING_STATE_CORRUPT: o sentinel-state assinado deste run não passa na ' +
        'verificação de integridade (HMAC), então não dá para provar que NÃO há handshake ' +
        `pendente — a ferramenta de trabalho '${tool}' é BLOQUEADA (fail-closed). Recrie/re-assine ` +
        'o estado pelo controller, ou resolva via Agent de resolução / AskUserQuestion / EnterPlanMode.',
    };
  }

  let pending;
  try { pending = eg.findLivePendingBlock(state, eg.resolveHandshakeTimeoutMs()); } catch { return { decision: 'allow' }; }
  if (!pending) return { decision: 'allow' }; // nenhum handshake vivo → nada a obrigar

  // Há um handshake VIVO. Só resolução/controle + isenções passam.
  if (ALWAYS_ALLOW_TOOLS.has(tool)) return { decision: 'allow' };
  if (isResolutionAgent(payload, pending)) return { decision: 'allow' };

  // Executor legítimo já autorizado por exec-window.
  try {
    const lock = eg.getActiveLock(dir);
    if (lock && eg.getActiveExecWindow(dir, lock.session_id)) return { decision: 'allow' };
  } catch { /* segue para os demais checks */ }

  // Ferramentas com file_path dentro de .pipeline/ são isentas (artefatos do run).
  const fp = payload.tool_input && payload.tool_input.file_path;
  if (typeof fp === 'string') {
    try { if (eg.isExemptPath(fp, dir)) return { decision: 'allow' }; } catch { /* */ }
  }

  // Bloqueio (deny por default; escape explícito = warn).
  const enforce = String(process.env.PIPELINE_DISPATCH_INLINE_ENFORCEMENT || 'deny').toLowerCase();
  const id = pendingId(pending);
  if (enforce === 'warn') {
    appendInlineEvent(state, dir, tool, id);
    return { decision: 'allow', warn: true };
  }
  return { decision: 'block', reason: buildReason(pending, id, tool) };
}

function handlePreToolUse(payload) {
  return decideInlineGate(payload);
}

// CLI entry point (idêntico em forma ao edit-guard-hook).
if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', (chunk) => { stdin += chunk; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(stdin);
      const result = handlePreToolUse(payload);
      if (result.decision === 'block') {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: result.reason },
        }));
      }
      process.exit(0);
    } catch (err) {
      // Falha de parse / erro interno → fail-OPEN (este gate NÃO deve travar o
      // harness inteiro por um payload inesperado; a trava de escrita do
      // edit-guard continua sendo a rede fail-closed para código de produção).
      process.stderr.write(`dispatch-pending-gate error: ${err.message}\n`);
      process.exit(0);
    }
  });
}

module.exports = { decideInlineGate, handlePreToolUse, ALWAYS_ALLOW_TOOLS };
