'use strict';
/**
 * paperclip-execution-state.cjs — Store de estado de pipeline da Fase A (reforjo).
 *
 * Primeiro código JavaScript da Fase A (Onda A2, task T-A2-02).
 *
 * SUBSTRATO: comentários estruturados da issue (pivô aprovado pós-spike T-A2-01).
 * O campo `issue.executionState` do Paperclip é uma coluna declarada mas NÃO-gravável
 * pela API loopback na versão 2026.517.0 — ver .pipeline/docs/spikes/T-A2-01-report.md
 * e DL-003/DL-004/DL-006 (revisados) em A2-design.md.
 *
 * Cada gate_decision vira um comentário com body `PIPELINE_STATE <json>`.
 * O metadado do pipeline vira um comentário `PIPELINE_STATE_INIT <json>`.
 * A hash chain (DL-006, SHA-256) encadeia as decisões via `previous_hash`.
 * A API do Paperclip devolve comentários newest-first, então a ordem é
 * reconstruída seguindo `previous_hash` a partir de GENESIS — nunca por timestamp.
 *
 * Zero dependências externas (só `node:crypto`/`node:http`), conforme DL-006.
 */

const crypto = require('node:crypto');
const http = require('node:http');

const GENESIS = 'GENESIS';
const COMMENT_PREFIX = 'PIPELINE_STATE ';
const INIT_PREFIX = 'PIPELINE_STATE_INIT ';
const SCHEMA_VERSION = 'fase-a-v1.0';
const DEFAULT_TOLERANCE_SECONDS = 60;
const REQUIRED_FIELDS = ['gate_name', 'hardness', 'decision', 'evidence', 'decided_by'];

// ---- Helpers puros (testáveis sem rede) ----

/** JSON.stringify com chaves em ordem lexicográfica, sem whitespace (DL-006). */
function sortedStringify(obj) {
  const keys = Object.keys(obj).sort();
  return JSON.stringify(Object.fromEntries(keys.map((k) => [k, obj[k]])));
}

/** Extrai apenas os campos que entram no hash (DL-006). */
function coreFields(gd) {
  return {
    gate_name: gd.gate_name,
    hardness: gd.hardness,
    decision: gd.decision,
    evidence: gd.evidence,
    timestamp: gd.timestamp,
    decided_by: gd.decided_by,
  };
}

/** Hash SHA-256 de uma gate_decision encadeada ao predecessor (DL-006). */
function computeGateHash(gd, previousHash) {
  const input = sortedStringify(coreFields(gd)) + previousHash;
  return 'sha256:' + crypto.createHash('sha256').update(input).digest('hex');
}

/** Regra local de clock-skew: rejeita timestamp além de `toleranceSec` no futuro. */
function isClockSkewAcceptable(timestamp, nowMs, toleranceSec = DEFAULT_TOLERANCE_SECONDS) {
  const skewSeconds = (Date.parse(timestamp) - nowMs) / 1000;
  return skewSeconds <= toleranceSec;
}

/**
 * Reordena entradas seguindo `previous_hash` a partir de GENESIS.
 * Entradas inalcançáveis (órfãs) ficam de fora — `verifyChain` usa isso pra detectar elo partido.
 */
function orderChain(entries) {
  const byPrev = new Map();
  for (const e of entries) byPrev.set(e.previous_hash, e);
  const ordered = [];
  const seen = new Set();
  let cur = byPrev.get(GENESIS);
  while (cur && !seen.has(cur.hash)) {
    ordered.push(cur);
    seen.add(cur.hash);
    cur = byPrev.get(cur.hash);
  }
  return ordered;
}

/**
 * Verifica integridade: ordena, confere que toda entry recalcula o próprio hash
 * e que os elos `previous_hash` ligam de GENESIS ao head, sem órfãs.
 */
function verifyChain(entries) {
  const ordered = orderChain(entries);
  if (ordered.length !== entries.length) {
    return { valid: false, length: ordered.length, brokenAt: ordered.length, reason: 'elo partido ou entry órfã' };
  }
  let prev = GENESIS;
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i];
    if (e.previous_hash !== prev) {
      return { valid: false, length: ordered.length, brokenAt: i, reason: 'previous_hash não liga' };
    }
    if (computeGateHash(e, e.previous_hash) !== e.hash) {
      return { valid: false, length: ordered.length, brokenAt: i, reason: 'hash recalculado diverge (adulteração)' };
    }
    prev = e.hash;
  }
  return { valid: true, length: ordered.length };
}

// ---- Transport HTTP default (Paperclip loopback) ----

function httpTransport({ baseUrl = 'http://127.0.0.1:3100' } = {}) {
  const u = new URL(baseUrl);
  function request(method, path, body) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = http.request(
        {
          host: u.hostname,
          port: u.port || 80,
          path,
          method,
          headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        },
        (res) => {
          let buf = '';
          res.on('data', (c) => (buf += c));
          res.on('end', () => {
            if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode} em ${method} ${path}: ${buf.slice(0, 200)}`));
            try {
              resolve(buf ? JSON.parse(buf) : null);
            } catch {
              resolve(buf);
            }
          });
        },
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }
  return {
    getComments: (issueId) => request('GET', `/api/issues/${issueId}/comments`),
    postComment: (issueId, body) => request('POST', `/api/issues/${issueId}/comments`, { body }),
  };
}

// ---- Parsing dos comentários ----

function parseComments(comments) {
  const init = [];
  const gates = [];
  for (const c of comments || []) {
    const body = c && typeof c.body === 'string' ? c.body : '';
    if (body.startsWith(INIT_PREFIX)) {
      try { init.push(JSON.parse(body.slice(INIT_PREFIX.length))); } catch { /* ignora corrompido */ }
    } else if (body.startsWith(COMMENT_PREFIX)) {
      try { gates.push(JSON.parse(body.slice(COMMENT_PREFIX.length))); } catch { /* ignora corrompido */ }
    }
  }
  return { init: init[0] || null, gates };
}

// ---- Factory pública ----

/**
 * @param {object} cfg
 * @param {string} cfg.companyId
 * @param {object} [cfg.transport] — { getComments(issueId), postComment(issueId, body) }. Default: HTTP loopback.
 * @param {string} [cfg.baseUrl]
 * @param {() => number} [cfg.now] — relógio injetável (ms). Default: Date.now.
 * @param {number} [cfg.clockSkewToleranceSeconds]
 */
function createExecutionState(cfg = {}) {
  const transport = cfg.transport || httpTransport({ baseUrl: cfg.baseUrl });
  const now = cfg.now || (() => Date.now());
  const tolerance = cfg.clockSkewToleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;

  async function initState(issueId, variant) {
    const { init } = parseComments(await transport.getComments(issueId));
    if (init) return init; // idempotente: não duplica
    const ts = new Date(now()).toISOString();
    const payload = {
      schema_version: SCHEMA_VERSION,
      pipeline: {
        pipeline_id: `${ts}_${variant}`,
        variant,
        current_phase: 'execution',
        gate_registry_version: 'canonical-v7.6.1',
        batch_state: { current_batch: 1, total_batches_estimated: null, last_batch_result: null },
      },
    };
    await transport.postComment(issueId, INIT_PREFIX + JSON.stringify(payload));
    return payload;
  }

  async function writeGateDecision(issueId, gd) {
    for (const f of REQUIRED_FIELDS) {
      if (gd == null || gd[f] === undefined || gd[f] === null || gd[f] === '') {
        throw new Error(`gate_decision: campo obrigatório faltando: ${f}`);
      }
    }
    const timestamp = gd.timestamp || new Date(now()).toISOString();
    if (!isClockSkewAcceptable(timestamp, now(), tolerance)) {
      throw new Error(`clock-skew: timestamp ${timestamp} está além de ${tolerance}s no futuro — entry rejeitada`);
    }
    const { gates } = parseComments(await transport.getComments(issueId));
    const ordered = orderChain(gates);
    const head = ordered.length ? ordered[ordered.length - 1].hash : GENESIS;
    const entry = { ...gd, timestamp, previous_hash: head };
    entry.hash = computeGateHash(entry, head);
    await transport.postComment(issueId, COMMENT_PREFIX + JSON.stringify(entry));
    return entry;
  }

  async function readState(issueId) {
    const { init, gates } = parseComments(await transport.getComments(issueId));
    const ordered = orderChain(gates);
    const head = ordered.length ? ordered[ordered.length - 1].hash : null;
    const pipeline = init ? { ...init.pipeline } : {};
    pipeline.gate_decisions = ordered;
    pipeline.hash_chain_head = head
      ? { value: head, previous_hash: ordered[ordered.length - 1].previous_hash }
      : null;
    return {
      schema_version: init ? init.schema_version : SCHEMA_VERSION,
      exists: Boolean(init || ordered.length),
      pipeline,
    };
  }

  async function verifyHashChain(issueId) {
    const { gates } = parseComments(await transport.getComments(issueId));
    return verifyChain(gates);
  }

  return { initState, writeGateDecision, readState, verifyHashChain };
}

module.exports = {
  createExecutionState,
  httpTransport,
  computeGateHash,
  orderChain,
  verifyChain,
  isClockSkewAcceptable,
  sortedStringify,
  coreFields,
  GENESIS,
  COMMENT_PREFIX,
  INIT_PREFIX,
  SCHEMA_VERSION,
};
