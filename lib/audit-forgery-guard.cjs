#!/usr/bin/env node
'use strict';

// =============================================================================
// audit-forgery-guard.cjs — pure decision core for the write-time anti-fabrication
// guard over gate-decisions.jsonl and sentinel-state.json.
// =============================================================================
// WHY THIS EXISTS (user report 2026-07-10):
//   The HMAC signer proves a state body has not changed AFTER it was signed. The
//   PostToolUse autosign then signs whatever an authorized agent just wrote. So a
//   forged entry — backdated, fake decided_by:user, an unfounded final_decision:GO
//   — gets laundered into a VALID signature. Integrity != veracity. Today the
//   forgery is only caught reactively, after it is written and accepted.
//
//   This module inspects the INCOMING write content against the run's own trail
//   and flags three forgery signatures BEFORE the write lands. It is pure: all I/O
//   (reading the run dir, emitting the deny + AUDIT event, reading the env escape)
//   lives in the thin hook .claude/hooks/audit-fabrication-gate.cjs.
//
// SCOPE (honest ceiling): this closes forgery-by-WRITE, the reported vector. It
// does NOT close the deeper class — an agent that simply deletes its own
// coordination state — which only PIPELINE_HMAC_STRICT plugin-wide fully closes
// (a documented, deliberately-deferred posture change). Case 3's "protocol file
// absent → block the entry" narrows even that: a delete-then-forge of a
// decided_by:user line is caught, though a delete-everything is not.
// =============================================================================

const BACKFILL_MARKER = 'BACKFILLED'; // literal, case-sensitive: the marker is a deliberate act
const DEFAULT_BACKFILL_THRESHOLD_MS = 300000; // 5 min — absorbs clock skew; a real append is ~now
const TARGET_FILENAMES = new Set(['gate-decisions.jsonl', 'sentinel-state.json']);
// v8.27.0 (Fatia S8 / Requirement 9 — UserGateSignature): the HMAC envelope field
// on a signed user-gate protocol-event. Kept in sync with lib/sentinel-state-signer.cjs.
const SIGNATURE_FIELD = '__signature';

// --- JSONL parsing ----------------------------------------------------------

function parseEntries(text) {
  const out = [];
  if (typeof text !== 'string' || !text) return out;
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw) continue;
    let obj = null;
    try { obj = JSON.parse(raw); } catch { obj = null; }
    out.push({ raw, obj });
  }
  return out;
}

// Candidate entries = lines in the incoming write NOT already present verbatim on
// disk. This is the key false-positive defense: a full rewrite that preserves the
// (legitimately old) history passes, while an injected or MUTATED line — which by
// definition differs from every existing line — becomes a candidate.
function newEntries(incomingText, existingText) {
  const existing = new Set(parseEntries(existingText).map((e) => e.raw));
  return parseEntries(incomingText).filter((e) => !existing.has(e.raw));
}

// --- id extraction (case 3 cross-trace) -------------------------------------

function extractIds(detail) {
  const ids = new Set();
  if (typeof detail !== 'string' || !detail) return [];
  const re = /(?:tool_use_id|protocol_event|event_id|dispatch_id|id|ref)\s*[=:]\s*["']?([A-Za-z0-9_\-]{4,})/gi;
  let m;
  while ((m = re.exec(detail))) ids.add(m[1]);
  for (const t of detail.match(/\btoolu_[A-Za-z0-9]+/g) || []) ids.add(t);
  for (const t of detail.match(/\bpe_[A-Za-z0-9]+/g) || []) ids.add(t);
  return [...ids];
}

// Corroboration anchors for a decided_by:user claim: ids that belong to a genuine
// USER-INTERACTION protocol event (the Achado #7 GATE_REQUEST/GATE_RESPONSES
// handshake), NOT any id that merely appears somewhere in the file. A forger who
// references, say, a real DISPATCH_RESULT id must no longer pass — only a real
// user-gate event corroborates a user decision.
//
// v8.27.0 (Fatia S8 / Requirement 9 — UserGateSignature): the residual C3 ceiling
// (a forger who ALSO fabricates the user-gate protocol event) is closed by an HMAC
// signature. When a verifier is supplied (opts.verify — the hook builds it from
// lib/sentinel-state-signer.cjs), a user-gate event corroborates ONLY if it
// verifies. The verifier itself bakes in the two-tier posture (via verifyState):
// signed+valid → true; signed+invalid → false (always — a bad signature is
// affirmative tampering evidence); unsigned → true unless PIPELINE_HMAC_STRICT.
// With NO verifier the guard stays legacy-tolerant (migration posture): any
// user-gate id corroborates, exactly as before this slice.
const USER_GATE_EVENT_RE = /GATE|USER|HUMAN|ASK|DECISION|RESPONSE/i;
function eventKind(obj) {
  if (!obj || typeof obj !== 'object') return '';
  if (typeof obj.event === 'string') return obj.event;
  if (typeof obj.type === 'string') return obj.type;
  return '';
}
function collectProtocolIds(text, opts = {}) {
  const verify = typeof opts.verify === 'function' ? opts.verify : null;
  const ids = new Set();
  for (const { obj } of parseEntries(text)) {
    if (!obj || typeof obj !== 'object') continue; // only structured events, never raw prose
    const kind = eventKind(obj);
    if (!USER_GATE_EVENT_RE.test(kind)) continue;  // only user-interaction events anchor a user decision
    // v8.27.0: with a verifier active, an unsigned or invalidly-signed user-gate
    // event contributes NO corroborating ids (it does not back a decided_by:user).
    if (verify && !verify(obj)) continue;
    for (const k of ['id', 'tool_use_id', 'dispatch_id', 'event_id', 'gate_request_id', 'response_id', 'request_id']) {
      if (typeof obj[k] === 'string' && obj[k]) ids.add(obj[k]);
    }
    // Nested id tokens on the SAME user-gate event still corroborate.
    for (const t of JSON.stringify(obj).match(/\b(?:toolu|pe)_[A-Za-z0-9]+/g) || []) ids.add(t);
  }
  return ids;
}

// v8.27.0 (Requirement 9.5): under PIPELINE_HMAC_STRICT, an unsigned or
// invalidly-signed user-gate event is no longer tolerated EVEN OUTSIDE the
// corroboration path. This detector flags any such event so the guard hardens
// beyond the C3 corroboration check. Only meaningful when a verifier is active;
// callers gate this on (verify && strict). Scope stays restricted to user-gate
// events (the USER_GATE_EVENT_RE match) — Requirement 9.6.
function detectUnsignedUserGateEvents(text, verify) {
  const findings = [];
  if (typeof verify !== 'function') return findings;
  for (const { obj } of parseEntries(text)) {
    if (!obj || typeof obj !== 'object') continue;
    const kind = eventKind(obj);
    if (!USER_GATE_EVENT_RE.test(kind)) continue;
    if (verify(obj)) continue; // signed + valid → tolerated even in strict
    const hasSig = obj[SIGNATURE_FIELD] != null;
    findings.push({
      case: 'unsigned_user_gate_event',
      severity: 'high',
      detail: `user-gate event ${kind || '?'} ${hasSig ? 'has an invalid signature' : 'is unsigned'} — not tolerated under PIPELINE_HMAC_STRICT`,
    });
  }
  return findings;
}

function loggedGateNames(text) {
  const set = new Set();
  for (const { obj } of parseEntries(text)) {
    if (obj && typeof obj === 'object' && typeof obj.gate === 'string') set.add(obj.gate);
  }
  return set;
}

// --- case detectors ---------------------------------------------------------

// C1: a NEW gate-decisions entry backdated beyond the threshold with no BACKFILLED
// marker in its detail.
function detectBackdated(candidates, nowMs, thresholdMs) {
  const findings = [];
  for (const { obj } of candidates) {
    if (!obj || typeof obj !== 'object') continue;
    // Accept a numeric epoch-ms timestamp too — a bare number defeats a string-only
    // Date.parse (which coerces to NaN), so an epoch-backdated entry would slip.
    const ts = typeof obj.timestamp === 'number' ? obj.timestamp : Date.parse(obj.timestamp);
    if (!Number.isFinite(ts)) continue;            // truly unparseable → cannot prove backdating
    if (ts >= nowMs - thresholdMs) continue;        // fresh enough
    const detail = typeof obj.detail === 'string' ? obj.detail : '';
    if (detail.includes(BACKFILL_MARKER)) continue; // explicit, sanctioned backfill
    findings.push({
      case: 'backdated',
      severity: 'high',
      detail: `gate=${obj.gate || '?'} timestamp ${obj.timestamp} is ~${Math.round((nowMs - ts) / 1000)}s before write with no BACKFILLED marker`,
    });
  }
  return findings;
}

// C3: a NEW gate-decisions entry claiming decided_by:user without a corroborating
// protocol-event id. Approved posture: protocol file ABSENT → the entry is NOT
// corroborated → block it (fail-open is general, but a user-decision claim must be
// backed).
function detectFakeUserDecision(candidates, ctx) {
  const findings = [];
  const protocolPresent = !!(ctx && ctx.protocolPresent);
  const protocolIds = (ctx && ctx.protocolIds) || new Set();
  for (const { obj } of candidates) {
    if (!obj || typeof obj !== 'object') continue;
    // Normalize: "User"/"USER"/"user " downstream still reads as a user decision,
    // so they must not slip past a strict === 'user' compare.
    if (String(obj.decided_by == null ? '' : obj.decided_by).trim().toLowerCase() !== 'user') continue;
    const ids = extractIds(typeof obj.detail === 'string' ? obj.detail : '');
    const corroborated = protocolPresent && ids.some((id) => protocolIds.has(id));
    if (!corroborated) {
      findings.push({
        case: 'fake_user_decision',
        severity: 'high',
        detail: `gate=${obj.gate || '?'} decided_by:user without a matching protocol-event (${ids.length ? 'id ' + ids.join(',') + ' not found' : 'no id in detail'})`,
      });
    }
  }
  return findings;
}

// Detect a terminal promotion in an incoming sentinel-state write. Full JSON
// (Write) is parsed; an Edit fragment falls back to a regex scan of the incoming
// text. ponytail: regex fallback is a known ceiling — an Edit that splits the
// promotion across old_string/new_string could evade, but the Write path (the
// normal Bash-less controller write) is exact.
function detectPromotion(incomingContent) {
  let go = false, completed = false;
  let obj = null;
  try { obj = JSON.parse(incomingContent); } catch { obj = null; }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    if (typeof obj.final_decision === 'string' && obj.final_decision.trim().toUpperCase() === 'GO') go = true;
    // truthy set {true, "true"} — a string "true" still reads completed downstream.
    if (obj.completed === true || (typeof obj.completed === 'string' && obj.completed.trim().toLowerCase() === 'true')) completed = true;
    if (typeof obj.terminal_state === 'string' && obj.terminal_state.trim().toLowerCase() === 'completed') completed = true;
  } else {
    const t = String(incomingContent || '');
    if (/"final_decision"\s*:\s*"\s*GO\s*"/i.test(t)) go = true;
    if (/"completed"\s*:\s*true\b/i.test(t)) completed = true;
    if (/"terminal_state"\s*:\s*"\s*completed\s*"/i.test(t)) completed = true;
  }
  return { go, completed, any: go || completed };
}

// C2: a promotion with no corroborating closure chain. GO is the Pa-de-Cal verdict
// and is written AFTER the final-adversarial gate but BEFORE closeout, so GO needs
// only FINAL_ADVERSARIAL_GATE logged — requiring CLOSEOUT_CONFIRM there would
// false-positive a healthy run. A completed/terminal claim means the run is fully
// closed, so it needs the full chain.
function detectUnfoundedPromotion(ctx) {
  const promotion = ctx && ctx.promotion;
  if (!promotion || !promotion.any) return [];
  const loggedGates = (ctx && ctx.loggedGates) || new Set();
  const required = promotion.completed
    ? ['FINAL_ADVERSARIAL_GATE', 'CLOSEOUT_CONFIRM']
    : ['FINAL_ADVERSARIAL_GATE'];
  const missing = required.filter((g) => !loggedGates.has(g));
  if (!missing.length) return [];
  return [{
    case: 'unfounded_promotion',
    severity: 'high',
    detail: `${promotion.completed ? 'completed/terminal' : 'final_decision:GO'} written without closure evidence (missing: ${missing.join(', ')})`,
  }];
}

// --- top-level --------------------------------------------------------------

function analyze(input) {
  const findings = [];
  if (!input || typeof input !== 'object') return { findings };
  // Case-insensitive: a case-insensitive FS (win32/macOS) resolves Gate-Decisions.JSONL
  // to the same physical file, so the target match must not be case-sensitive.
  const filename = typeof input.filename === 'string' ? input.filename.toLowerCase() : '';
  if (!TARGET_FILENAMES.has(filename)) return { findings };
  const incomingContent = input.incomingContent;
  if (typeof incomingContent !== 'string') return { findings };

  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const thresholdMs = Number.isFinite(input.thresholdMs) && input.thresholdMs >= 0
    ? input.thresholdMs : DEFAULT_BACKFILL_THRESHOLD_MS;

  if (filename === 'gate-decisions.jsonl') {
    const candidates = newEntries(incomingContent, input.existingContent || '');
    findings.push(...detectBackdated(candidates, nowMs, thresholdMs));
    // v8.27.0 (Requirement 9): a user-gate signature verifier hardens C3. It is
    // OPTIONAL — absent → legacy migration posture (any user-gate id corroborates).
    const verify = typeof input.verifyUserGateEvent === 'function' ? input.verifyUserGateEvent : null;
    const strict = input.hmacStrict != null
      ? !!input.hmacStrict
      : (process.env.PIPELINE_HMAC_STRICT === 'true');
    const protocolIds = collectProtocolIds(input.protocolText || '', { verify });
    findings.push(...detectFakeUserDecision(candidates, { protocolPresent: !!input.protocolPresent, protocolIds }));
    if (verify && strict) {
      findings.push(...detectUnsignedUserGateEvents(input.protocolText || '', verify));
    }
  } else if (filename === 'sentinel-state.json') {
    const promotion = detectPromotion(incomingContent);
    if (promotion.any) {
      const loggedGates = loggedGateNames(input.gateDecisionsText || '');
      findings.push(...detectUnfoundedPromotion({ promotion, loggedGates }));
    }
  }
  return { findings };
}

module.exports = {
  analyze,
  parseEntries,
  newEntries,
  extractIds,
  collectProtocolIds,
  detectUnsignedUserGateEvents,
  eventKind,
  loggedGateNames,
  detectBackdated,
  detectFakeUserDecision,
  detectPromotion,
  detectUnfoundedPromotion,
  BACKFILL_MARKER,
  DEFAULT_BACKFILL_THRESHOLD_MS,
  TARGET_FILENAMES,
  SIGNATURE_FIELD,
};
