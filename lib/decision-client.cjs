'use strict';
// decision-client — adaptador agnóstico para "decision models" (Jev, Clef, Kev, Liquid e qualquer
// fornecedor que fale o contrato System One: POST {state, model, questions} -> {answers}).
// Zero dependências. Node >= 18 (fetch nativo). Mesmo arquivo serve a skill e os projetos JS/TS.
//
// Uso mínimo:
//   const { decide } = require('./decision-client.cjs');
//   const r = await decide({ state: texto, questions: { urgente: { type: 'noul', instructions: '...' } } });
//   r.answers.urgente.p  // probabilidade 0..1
//
// Config (precedência): variáveis DECISION_MODEL_* > <cwd>/.decision-model.json > ~/.decision-model/config.json
//   - arquivo do projeto só pode trazer: model, timeout_ms, max_state_chars (preset/endereço/chave: só global ou ambiente, e aí a chave vem do ambiente)
//   - chave só por api_key_file (global) ou DECISION_MODEL_API_KEY (ambiente); nunca inline em arquivo
//   - base_url livre só no global/ambiente; com preset, o host precisa bater com a lista do preset

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PRESETS = {
  jev: {
    base_url: 'https://api.typesafe.ai/v1/systemone',
    model: 'jev-latest',
    hosts: ['api.typesafe.ai'],
    api_key_file: path.join(os.homedir(), '.typesafe', 'api-key'),
  },
  clef: {
    base_url: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/cloudflare/clef',
    model: 'clef',
    hosts: ['api.cloudflare.com'],
  },
  'clef-flash': {
    base_url: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/cloudflare/clef-flash',
    model: 'clef-flash',
    hosts: ['api.cloudflare.com'],
  },
};

const PROJECT_ALLOWED = new Set(['model', 'timeout_ms', 'max_state_chars']); // preset/base_url/chave: só global ou ambiente (a chave fica amarrada ao fornecedor do global)
const DEFAULTS = { timeout_ms: 5000, max_state_chars: 4000, retry_base_ms: 300, retries: 3, deadline_ms: 8000 };

function readJson(file) {
  if (!file || !fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadConfig({ cwd = process.cwd(), env = process.env, globalPath } = {}) {
  const gPath = globalPath || env.DECISION_MODEL_CONFIG || path.join(os.homedir(), '.decision-model', 'config.json');
  const g = readJson(gPath);
  if ('api_key' in g) throw new Error('config global: chave inline não é aceita; use api_key_file (' + gPath + ')');

  const pPath = path.join(cwd, '.decision-model.json');
  const p = readJson(pPath);
  for (const k of Object.keys(p)) {
    if (!PROJECT_ALLOWED.has(k)) throw new Error('config do projeto não pode definir "' + k + '" (' + pPath + '); permitido: ' + [...PROJECT_ALLOWED].join(', '));
  }

  const e = {};
  if (env.DECISION_MODEL_PRESET) e.preset = env.DECISION_MODEL_PRESET;
  if (env.DECISION_MODEL_MODEL) e.model = env.DECISION_MODEL_MODEL;
  if (env.DECISION_MODEL_BASE_URL) e.base_url = env.DECISION_MODEL_BASE_URL;
  if (env.DECISION_MODEL_API_KEY_FILE) e.api_key_file = env.DECISION_MODEL_API_KEY_FILE;
  if (env.DECISION_MODEL_ACCOUNT_ID) e.account_id = env.DECISION_MODEL_ACCOUNT_ID;
  if (env.DECISION_MODEL_TIMEOUT_MS) e.timeout_ms = Number(env.DECISION_MODEL_TIMEOUT_MS);
  if (env.DECISION_MODEL_MAX_STATE_CHARS) e.max_state_chars = Number(env.DECISION_MODEL_MAX_STATE_CHARS);
  if (env.DECISION_MODEL_DEADLINE_MS) e.deadline_ms = Number(env.DECISION_MODEL_DEADLINE_MS);
  // destino trocado pelo ambiente só vale com chave também do ambiente: a chave do global pertence ao fornecedor do global
  const envRedirect = (e.base_url && e.base_url !== g.base_url) || (e.preset && e.preset !== g.preset);
  if (envRedirect && !env.DECISION_MODEL_API_KEY) throw new Error('DECISION_MODEL_BASE_URL/PRESET trocam o fornecedor: defina DECISION_MODEL_API_KEY junto (a chave da config global não é reaproveitada)');

  const merged = { ...DEFAULTS, ...g, ...p, ...e };
  if (e.base_url) merged.preset = e.preset || null; // base_url do ambiente é livre (chave também vem do ambiente); preset do global não se aplica
  const preset = merged.preset ? PRESETS[merged.preset] : null;
  if (merged.preset && !preset) throw new Error('preset desconhecido: ' + merged.preset + ' (válidos: ' + Object.keys(PRESETS).join(', ') + ')');

  let base_url = merged.base_url || (preset && preset.base_url);
  if (!base_url) throw new Error('faltou preset ou base_url na config (' + gPath + ')');
  if (base_url.includes('{account_id}')) {
    if (!merged.account_id) throw new Error('preset ' + merged.preset + ' exige account_id (config global ou DECISION_MODEL_ACCOUNT_ID)');
    base_url = base_url.replace('{account_id}', merged.account_id);
  }
  const host = new URL(base_url).host;
  if (preset && !preset.hosts.includes(host)) throw new Error('host ' + host + ' não é permitido para o preset ' + merged.preset + ' (permitidos: ' + preset.hosts.join(', ') + ')');

  let api_key = env.DECISION_MODEL_API_KEY || null;
  const keyFile = merged.api_key_file || (preset && preset.api_key_file);
  if (!api_key && keyFile && fs.existsSync(keyFile)) api_key = fs.readFileSync(keyFile, 'utf8').trim();
  if (!api_key) throw new Error('sem chave de acesso: defina api_key_file na config global ou DECISION_MODEL_API_KEY' + (keyFile ? ' (procurei em ' + keyFile + ')' : ''));

  return {
    provider: 'systemone',
    preset: merged.preset || null,
    base_url,
    host,
    model: merged.model || (preset && preset.model),
    api_key,
    timeout_ms: merged.timeout_ms,
    max_state_chars: merged.max_state_chars,
    retry_base_ms: merged.retry_base_ms,
    retries: merged.retries,
    deadline_ms: merged.deadline_ms,
  };
}

// ---------------------------------------------------------------- limpeza de segredos
// Cópia de limpar() do fiscal (~/.typesafe/fiscal/fiscal-hook.cjs). Na dúvida, apaga: o texto só serve para julgamento.
const GATILHO = '(?:pass(?:word|wd)?|pwd|senha|secret|segredo|token|key|chave|auth|credential|credencial)';
const VALOR = '("[^"]*"|\'[^\']*\'|[^\\s"\';&|,)]+)';
function scrub(txt) {
  return String(txt)
    .replace(/@(['"])[\s\S]*?\r?\n\1@/g, '@$1[BLOCO OMITIDO]$1@')
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\b/g, '<<$2 [BLOCO OMITIDO]')
    .replace(/<<<\s*("[^"]*"|'[^']*'|\S+)/g, '<<< [APAGADO]')
    .replace(/-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g, '[APAGADO]')
    .replace(/(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]{6,}/gi, '$1 [APAGADO]')
    .replace(/(:\/\/[^\/\s:@]+:)[^@\s\/]+@/g, '$1[APAGADO]@')
    .replace(/(:\/\/)[^\/\s:@]{8,}@/g, '$1[APAGADO]@')
    .replace(/(ConvertTo-SecureString\s+)("[^"]*"|'[^']*'|\S+)/gi, '$1[APAGADO]')
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, '[APAGADO]')
    .replace(/\b(gh[pousr]_|github_pat_|glpat-|xox[abprs]-|apikey_|AKIA|AIza|jv_live_)[A-Za-z0-9_-]{8,}/g, '[APAGADO]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, '[APAGADO]')
    .replace(new RegExp('((?<![\\w$:.-])[\\w$:.-]*' + GATILHO + '[\\w-]*["\']?\\s*[:=,]\\s*)' + VALOR, 'gi'), '$1[APAGADO]')
    .replace(new RegExp('((?:^|\\s)--?[\\w-]*' + GATILHO + '[\\w-]*\\s+)' + VALOR, 'gi'), '$1[APAGADO]')
    .replace(new RegExp('(\\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|SENHA|CHAVE)[A-Z0-9_]*\\s+(?:-Value\\s+)?)' + VALOR, 'g'), '$1[APAGADO]')
    .replace(new RegExp('(\\b\\w*(?:secret|passw(?:or)?d|senha)\\w*\\s+)' + VALOR, 'gi'), '$1[APAGADO]')
    .replace(/(\s-u\s+[^\s:]+:)\S+/g, '$1[APAGADO]')
    .replace(/(\b(?:docker\s+login|mysql|mysqldump|mariadb|sshpass|psql)\b[^|;&]*?\s-p)\s*\S+/gi, '$1 [APAGADO]')
    .replace(/\b[A-Fa-f0-9]{40,}\b/g, '[APAGADO]')
    .replace(/[A-Za-z0-9+_=-]{32,}/g, (m) => (/[a-z]/.test(m) && /[A-Z]/.test(m) && /\d/.test(m) ? '[APAGADO]' : m));
}

function truncate(text, max) {
  const s = String(text);
  return s.length > max ? { text: s.slice(0, max), truncated: true } : { text: s, truncated: false };
}

function prepareState(state, max) {
  if (typeof state === 'string') return truncate(scrub(state), max);
  // objeto/array: limpa cada string, depois corta o JSON como um todo
  const clean = JSON.parse(JSON.stringify(state), (k, v) => (typeof v === 'string' ? scrub(v) : v));
  const r = truncate(JSON.stringify(clean), max);
  return r.truncated ? r : { text: clean, truncated: false };
}

// ---------------------------------------------------------------- chamada
function normalize(raw) {
  const answers = {};
  for (const [k, a] of Object.entries(raw.answers || {})) {
    if (!a) continue;
    if (a.type === 'noul' || typeof a.noul === 'number') answers[k] = { type: 'noul', p: a.noul };
    else if (a.type === 'choice' || a.choice !== undefined) answers[k] = { type: 'choice', choice: a.choice, probabilities: a.probabilities || {}, confidence: a.confidence };
    else if (a.type === 'score' || a.score !== undefined) answers[k] = { type: 'score', score: a.score, probabilities: a.probabilities || {}, legend: a.legend, confidence: a.confidence };
    else answers[k] = { type: 'unknown', raw: a };
  }
  return { model: raw.model || null, usage: raw.usage || {}, answers };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function validate(state, questions) {
  if (state === undefined || state === null) throw new Error('state indefinido: monte o state antes de chamar decide');
  if (!questions || typeof questions !== 'object' || !Object.keys(questions).length) throw new Error('questions vazio');
  for (const [k, q] of Object.entries(questions)) {
    if (!q || !['noul', 'choice', 'score'].includes(q.type)) throw new Error('pergunta "' + k + '": type deve ser noul | choice | score');
    if (!q.instructions) throw new Error('pergunta "' + k + '": faltou instructions');
    if (q.type === 'choice' && (!q.criteria || typeof q.criteria !== 'object' || !Object.keys(q.criteria).length)) throw new Error('pergunta "' + k + '" (choice): criteria é obrigatório (mapa opcao -> descricao)');
    if (q.type === 'score' && (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 10)) throw new Error('pergunta "' + k + '" (score): criteria deve ser lista de 2 a 10 níveis');
  }
}

async function decide({ state, questions, config, cwd = process.cwd(), decisionName = null, env = process.env }) {
  const cfg = { ...DEFAULTS, ...(config || loadConfig({ cwd, env })) };
  validate(state, questions);
  const doFetch = cfg.fetch || globalThis.fetch;
  const prepared = prepareState(state, cfg.max_state_chars);
  const body = JSON.stringify({ state: prepared.text, model: cfg.model, questions });
  const t0 = Date.now();
  let lastErr = null;
  let resp = null;
  let retryAfterMs = 0;
  for (let attempt = 0; attempt < cfg.retries; attempt++) {
    if (attempt > 0) {
      const wait = Math.max(retryAfterMs, cfg.retry_base_ms * 2 ** (attempt - 1));
      if (Date.now() - t0 + wait >= cfg.deadline_ms) { lastErr = new Error((lastErr && lastErr.message) + ' (orçamento de tempo ' + cfg.deadline_ms + ' ms esgotado)'); break; }
      await sleep(wait);
    }
    try {
      resp = await doFetch(cfg.base_url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + cfg.api_key, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(cfg.timeout_ms),
      });
    } catch (e) {
      lastErr = e; // rede/timeout: tenta de novo
      continue;
    }
    if (resp.ok) break;
    if (resp.status === 401) throw new Error('HTTP 401: chave de acesso ausente ou inválida para ' + cfg.host);
    if (resp.status === 422) throw new Error('HTTP 422: pedido malformado: ' + (await resp.text()).slice(0, 300));
    if ([429, 529, 502, 503, 504].includes(resp.status)) { lastErr = new Error('HTTP ' + resp.status); retryAfterMs = Number(resp.headers && resp.headers.get && resp.headers.get('retry-after')) * 1000 || 0; resp = null; continue; }
    throw new Error('HTTP ' + resp.status + ' de ' + cfg.host);
  }
  const ms = Date.now() - t0;
  if (!resp) {
    log(cwd, { decision: decisionName, provider: cfg.preset || cfg.host, ms, error: String(lastErr && lastErr.message) });
    throw new Error('decision model indisponível (' + cfg.retries + ' tentativas, teto ' + cfg.deadline_ms + ' ms): ' + (lastErr && lastErr.message));
  }
  const out = normalize(await resp.json());
  const result = { provider: cfg.preset || cfg.host, model: out.model, ms, usage: out.usage, truncated: prepared.truncated, answers: out.answers };
  log(cwd, {
    decision: decisionName, provider: result.provider, model: result.model, ms,
    input_tokens: out.usage.input_tokens, truncated: prepared.truncated,
    answers: Object.fromEntries(Object.entries(out.answers).map(([k, a]) => [k, a.type === 'noul' ? a.p : a.type === 'choice' ? a.choice : a.score])),
  });
  return result;
}

// Só anota se a pasta .decision-model já existir no projeto (nunca cria pasta sozinho). Nunca grava o state.
function log(cwd, line) {
  try {
    const dir = path.join(cwd, '.decision-model');
    if (!fs.existsSync(dir)) return;
    fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...line }) + '\n');
  } catch { /* log nunca derruba a decisão */ }
}

// ---------------------------------------------------------------- bancada (bench)
// decision = { name, questions: { key: { type, instructions, criteria?, inverse?: { instructions, criteria? } } }, min_confidence? }
// samples  = [{ state, expected: { key: bool | 'opcao' | indiceNivel } }]
// baseline = [{ key: valor_previsto_pelo_caminho_antigo }] (opcional, mesma ordem das amostras)
function invertQuestions(questions) {
  const out = {};
  let any = false;
  for (const [k, q] of Object.entries(questions)) {
    if (q.type === 'noul' && q.inverse) { out[k] = { type: 'noul', instructions: q.inverse.instructions, ...(q.inverse.criteria ? { criteria: q.inverse.criteria } : {}) }; any = true; }
    else if (q.type === 'choice') { out[k] = { ...q, criteria: Object.fromEntries(Object.entries(q.criteria).reverse()) }; any = true; }
    // noul sem inverse e score: fora do conjunto invertido (não há inversão segura); nada de troca falsa
  }
  return any ? strip(out) : null;
}
function predicted(a) {
  if (!a) return null;
  if (a.type === 'noul') return a.p >= 0.5;
  if (a.type === 'choice') return a.choice;
  if (a.type === 'score') return Math.round(a.score);
  return null;
}
function predictedInverted(q, a) {
  if (!a) return null;
  if (a.type === 'noul') return (1 - a.p) >= 0.5; // pergunta invertida: "sim" lá = "não" aqui
  return predicted(a);
}
function strip(questions) {
  // remove campos próprios da bancada (inverse) antes de enviar
  return Object.fromEntries(Object.entries(questions).map(([k, q]) => { const { inverse, ...rest } = q; return [k, rest]; }));
}

async function bench({ decision, samples, baseline = null, config, cwd = process.cwd(), onProgress = null }) {
  const qs = strip(decision.questions);
  const inv = invertQuestions(decision.questions);
  const keys = Object.keys(qs);
  const stats = Object.fromEntries(keys.map((k) => [k, { n: 0, correct: 0, flips: 0, flip_n: 0, baseline_correct: 0, errors: [] }]));
  const calib = []; // {p, truth} só para noul
  let ms = 0, tokens = 0, failures = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    let r;
    try { r = await decide({ state: s.state, questions: qs, config, cwd, decisionName: decision.name + ':bench' }); }
    catch (e) { failures++; if (onProgress) onProgress(i, 'x'); continue; }
    ms += r.ms; tokens += (r.usage.input_tokens || 0);
    let ri = null;
    if (inv) { try { ri = await decide({ state: s.state, questions: inv, config, cwd, decisionName: decision.name + ':bench-inv' }); ms += ri.ms; tokens += (ri.usage.input_tokens || 0); } catch { /* conta como sem dado */ } }
    for (const k of keys) {
      const st = stats[k];
      const exp = s.expected ? s.expected[k] : undefined;
      const a = r.answers[k];
      const pred = predicted(a);
      if (exp !== undefined && pred !== null) {
        st.n++;
        if (pred === exp) st.correct++; else st.errors.push({ i, expected: exp, got: a.type === 'noul' ? a.p : pred });
        if (baseline && baseline[i] && baseline[i][k] !== undefined && baseline[i][k] === exp) st.baseline_correct++;
        if (a.type === 'noul') calib.push({ p: a.p, truth: exp === true });
      }
      if (ri && inv && inv[k] && ri.answers[k]) {
        st.flip_n++;
        if (predictedInverted(qs[k], ri.answers[k]) !== pred) st.flips++;
      }
    }
    if (onProgress) onProgress(i, '.');
  }
  const questions = {};
  for (const k of keys) {
    const st = stats[k];
    const q = {
      type: qs[k].type,
      n: st.n,
      accuracy: st.n ? st.correct / st.n : null,
      errors: st.errors,
    };
    if (baseline) q.baseline_accuracy = st.n ? st.baseline_correct / st.n : null;
    if (st.flip_n) {
      const rate = st.flips / st.flip_n;
      if (qs[k].type === 'noul') q.polarity_flips = rate; else if (qs[k].type === 'choice') q.order_flips = rate; else q.repeat_flips = rate;
    }
    questions[k] = q;
  }
  // calibração: 5 faixas com >= 50 pontos, senão 3 faixas informativas
  const informative = calib.length < 50;
  const edges = informative ? [0, 0.3, 0.7, 1.0001] : [0, 0.1, 0.3, 0.7, 0.9, 1.0001];
  const bands = [];
  for (let b = 0; b < edges.length - 1; b++) {
    const pts = calib.filter((c) => c.p >= edges[b] && c.p < edges[b + 1]);
    bands.push({ from: edges[b], to: Math.min(edges[b + 1], 1), n: pts.length, said: pts.length ? pts.reduce((a, c) => a + c.p, 0) / pts.length : null, was: pts.length ? pts.filter((c) => c.truth).length / pts.length : null });
  }
  const ece = calib.length ? bands.reduce((a, b) => a + (b.n ? b.n * Math.abs(b.said - b.was) : 0), 0) / calib.length : null;
  return { n: samples.length, failures, questions, calibration: { informative, bands, error: ece }, ms_total: ms, input_tokens: tokens };
}

module.exports = { PRESETS, loadConfig, scrub, truncate, prepareState, normalize, decide, bench, invertQuestions };
