'use strict';
// ============================================================
// classify-bridge.cjs — G5 Classificador: Bridge de Classificação
//
// AVISO OBRIGATÓRIO — FONTE DE VERDADE (I8):
// ============================================================
// A FONTE DE VERDADE para classificação de tarefas é o agente
// task-orchestrator Phase 0, definido em:
//   agents/core/task-orchestrator.md
//
// Este módulo é uma HEURÍSTICA DE ATALHO para o caminho de
// despacho do piloto (dispatch path / G6). Ele:
//   (a) aceita overrides explícitos (type e/ou complexity) para
//       quando o piloto já sabe a resposta certa, e
//   (b) aplica matching de palavras-chave linear (sem NLP, sem
//       pesos, sem subagente) como estimativa rápida quando não
//       há override.
//
// Se a heurística errar, o piloto deve usar override para
// corrigir antes do despacho. Isso é esperado e documentado
// (Lacuna L3 da spec G5).
//
// Este módulo NÃO:
//   - Chama a rede ou a API do Paperclip
//   - Lê arquivos do projeto
//   - Invoca o task-orchestrator
//   - Cria issues
//   - Chama AskUserQuestion
//   - Implementa as decisões D3–D8 (Approval_Router, hash chain, etc.)
// ============================================================

// ─── CONJUNTOS CANÔNICOS (I1, I2) ────────────────────────────

/** @type {ReadonlyArray<string>} Tipos canônicos fechados — I1 */
const VALID_TYPES = Object.freeze([
  'Bug Fix',
  'Feature',
  'User Story',
  'Audit',
  'UX Simulation',
  'Spec',
]);

/** @type {ReadonlyArray<string>} Complexidades canônicas fechadas — I2 */
const VALID_COMPLEXITIES = Object.freeze(['SIMPLES', 'MEDIA', 'COMPLEXA']);

// ─── PRIORIDADE DO TIEBREAKER (decrescente) ──────────────────
// Urgency > Error > Creation > Analysis > Simulation > Spec
// Reflete a tabela de tiebreaker do task-orchestrator.md.
const TYPE_PRIORITY = {
  'Bug Fix': 5,
  'Feature': 4,
  'User Story': 3,
  'Audit': 2,
  'UX Simulation': 1,
  'Spec': 0,
};

// ─── TABELA DE PALAVRAS-CHAVE DE TIPO ────────────────────────
// Fonte: CLASSIFICATION TABLE em agents/core/task-orchestrator.md
// Mais palavras em português foram adicionadas conforme AC9–AC14.
//
// Matching: keywords de uma única palavra usam word-boundary (\b) para evitar
// falsos positivos (ex.: "check" dentro de "checkout", "fix" dentro de "prefix").
// Frases multi-palavra usam substring simples (já são específicas por natureza).
const TYPE_KEYWORDS = [
  // Maior prioridade primeiro (Bug Fix = tiebreaker 5)
  {
    type: 'Bug Fix',
    // Inclui formas flexionadas comuns (plural, gerúndio, passado) para cobrir
    // descrições reais de bugs: "errors out", "reported bugs", "crashing", etc.
    // O \b dos dois lados ainda aplica — cada forma é uma palavra completa.
    keywords: [
      'fix', 'fixes', 'fixed', 'fixing',
      'bug', 'bugs', 'buggy',
      'erro', 'error', 'errors',
      'broken',
      'crash', 'crashes', 'crashing', 'crashed',
      'not working',
    ],
  },
  {
    type: 'Feature',
    keywords: ['add', 'create', 'implement', 'new', 'build', 'feature', 'adicionar', 'criar'],
  },
  {
    type: 'User Story',
    keywords: ['as a user', 'user story', 'i want to', 'como usuário', 'eu quero', 'when i'],
  },
  {
    type: 'Audit',
    keywords: ['review', 'analyze', 'check', 'audit', 'assess', 'auditar', 'analisar'],
  },
  {
    type: 'UX Simulation',
    keywords: ['simulate', 'user journey', 'test ux', 'walkthrough', 'simular', 'jornada'],
  },
  // NOTE: 'Spec' is intentionally absent from prose heuristics.
  // Canonical task-orchestrator Phase 0 requires an explicit signal to reach type=Spec:
  //   Signal 1 (path arg with requirements.md+design.md+tasks.md),
  //   Signal 2 (--type=spec flag), or
  //   Signal 3 (prose regex /valida.*spec|implementa.*spec|fech[ae].*spec/
  //             + real feature dir + AskUserQuestion confirmation).
  // A bare keyword like "spec" or "specification" satisfies none of these signals.
  // The pilot must use override.type='Spec' when it has verified the explicit signal.
  // Tiebreaker entry kept in TYPE_PRIORITY at priority 0 so it never wins over other types.
];

/**
 * Verifica se desc contém o keyword.
 * Palavras simples (sem espaço): usa \b word-boundary para evitar falsos positivos
 * (ex.: "check" não bate em "checkout"; "fix" não bate em "prefix").
 * Frases multi-palavra: usa includes() diretamente.
 *
 * @param {string} lower Descrição em lower-case
 * @param {string} kw Keyword a testar
 * @returns {boolean}
 */
function keywordMatches(lower, kw) {
  const kwLower = kw.toLowerCase();
  if (kwLower.includes(' ')) {
    // Frase multi-palavra: substring matching é suficientemente específico
    return lower.includes(kwLower);
  }
  // Palavra simples: word-boundary para evitar correspondências parciais
  // Usamos \b dos dois lados; funcionam para ASCII e caracteres latinos simples.
  try {
    return new RegExp(`\\b${kwLower}\\b`, 'i').test(lower);
  } catch (_) {
    // Fallback seguro caso o keyword tenha caracteres especiais de regex
    return lower.includes(kwLower);
  }
}

// ─── SINAIS DE COMPLEXIDADE (referencias/complexity-matrix.md) ─
// Elevation rules do complexity-matrix.md §Automatic Elevation Rules.

/** Sinais que elevam para mínimo COMPLEXA */
const COMPLEXA_SIGNALS = ['production', 'urgent'];
// NOTE: 'prod' foi removido — é substring de palavras comuns (product, reproduce,
// productivity, byproduct). 'production' (com \b em signalMatches) é suficiente.

/** Sinais que elevam para mínimo MEDIA */
const MEDIA_SIGNALS = ['authentication', 'auth', 'security', 'autenticação', 'autenticacao', 'data model', 'schema', 'modelo de dados'];
// NOTE: 'authentication' adicionado para cobrir a forma por extenso;
// 'auth' mantido mas agora recebe \b matching em signalMatches() —
// não bate mais em 'author', 'authorize-as-noun', etc.

/** Sinais de escopo grande que elevam para COMPLEXA */
const LARGE_SCOPE_SIGNALS = ['6 files', 'multiple domains', 'large', 'extensive', '6 arquivos', 'múltiplos domínios'];

/**
 * Verifica se desc contém o sinal de complexidade.
 * Mesma estratégia de keywordMatches: sinais de uma palavra usam \b word-boundary
 * (evita 'auth' dentro de 'author', 'prod' dentro de 'product', etc.).
 * Frases multi-palavra usam includes() diretamente.
 *
 * @param {string} lower Descrição em lower-case
 * @param {string} sig Sinal a testar
 * @returns {boolean}
 */
function signalMatches(lower, sig) {
  const sigLower = sig.toLowerCase();
  if (sigLower.includes(' ')) {
    return lower.includes(sigLower);
  }
  try {
    return new RegExp(`\\b${sigLower}\\b`, 'i').test(lower);
  } catch (_) {
    return lower.includes(sigLower);
  }
}

// ─── FUNÇÕES PURAS INTERNAS ───────────────────────────────────

/**
 * TypeHeuristic — detecta o tipo mais provável por keyword matching.
 * Aplica tiebreaker por prioridade (Bug Fix > Feature > User Story > Audit > UX Simulation > Spec).
 * Retorna o tipo vencedor e notas sobre o raciocínio.
 *
 * @param {string} desc Descrição normalizada (lower-case)
 * @returns {{ type: string, notes: string[] }}
 */
function inferType(desc) {
  const lower = desc.toLowerCase();
  const matches = [];

  for (const { type, keywords } of TYPE_KEYWORDS) {
    const hit = keywords.find((kw) => keywordMatches(lower, kw));
    if (hit) {
      matches.push({ type, priority: TYPE_PRIORITY[type], keyword: hit });
    }
  }

  if (matches.length === 0) {
    return {
      type: 'Feature',
      notes: ['type heuristic: no keyword matched — fallback to Feature (safe default)'],
    };
  }

  // Tiebreaker: maior prioridade vence
  matches.sort((a, b) => b.priority - a.priority);
  const winner = matches[0];
  const notes = [];
  if (matches.length > 1) {
    notes.push(
      `type heuristic: tiebreaker applied — "${winner.keyword}" (${winner.type}, priority ${winner.priority}) beat ${matches.length - 1} other signal(s)`,
    );
  }
  return { type: winner.type, notes };
}

/**
 * ComplexityHeuristic — detecta a complexidade por sinais de elevação e escopo.
 * Retorna a complexidade e notas sobre as regras aplicadas.
 *
 * @param {string} desc Descrição normalizada (lower-case)
 * @returns {{ complexity: string, notes: string[] }}
 */
function inferComplexity(desc) {
  const lower = desc.toLowerCase();
  const notes = [];
  let level = 'SIMPLES'; // ponto de partida

  // Sinais de escopo grande → COMPLEXA
  for (const sig of LARGE_SCOPE_SIGNALS) {
    if (signalMatches(lower, sig)) {
      level = 'COMPLEXA';
      notes.push(`complexity heuristic: large-scope signal "${sig}" → elevated to COMPLEXA`);
      break;
    }
  }

  // Sinais de COMPLEXA por produção/urgência (Elevation Rule 5 do matrix)
  for (const sig of COMPLEXA_SIGNALS) {
    if (signalMatches(lower, sig)) {
      level = 'COMPLEXA';
      notes.push(`complexity heuristic: production/urgent signal "${sig}" → elevated to COMPLEXA (elevation rule: production incident)`);
      break;
    }
  }

  // Sinais de mínimo MEDIA (Elevation Rules 1+2 do matrix)
  for (const sig of MEDIA_SIGNALS) {
    if (signalMatches(lower, sig)) {
      if (level === 'SIMPLES') {
        level = 'MEDIA';
      }
      notes.push(`complexity heuristic: auth/security/data-model signal "${sig}" → elevated to minimum MEDIA`);
      break;
    }
  }

  return { complexity: level, notes };
}

// ─── VALIDAÇÃO ────────────────────────────────────────────────

function validateType(value) {
  if (!VALID_TYPES.includes(value)) {
    throw new Error(
      `classify-bridge: invalid type "${value}". Must be one of: ${VALID_TYPES.join(', ')}`,
    );
  }
}

function validateComplexity(value) {
  if (!VALID_COMPLEXITIES.includes(value)) {
    throw new Error(
      `classify-bridge: invalid complexity "${value}". Must be one of: ${VALID_COMPLEXITIES.join(', ')}`,
    );
  }
}

// ─── FUNÇÃO PRINCIPAL ─────────────────────────────────────────

/**
 * classify(description, override?) → ClassifyResult
 *
 * Produz a decisão {type, complexity} para o despacho ao Paperclip.
 *
 * Comportamento:
 *   - Se override.type E override.complexity fornecidos → usa override total; source='override'
 *   - Se apenas um dos campos do override for fornecido → preenche o outro via heurística; source='heuristic'
 *   - Se nenhum override → aplica ambas as heurísticas; source='heuristic'
 *
 * Invariantes:
 *   I1: type deve pertencer a VALID_TYPES
 *   I2: complexity deve pertencer a VALID_COMPLEXITIES
 *   I3: override.type, quando presente, deve ser válido (erro antes da heurística)
 *   I4: override.complexity, quando presente, deve ser válido (erro antes da heurística)
 *   I7: função pura — sem rede, sem I/O, sem estado mutável
 *   I9: description deve ser string não-vazia
 *
 * @param {string} description Descrição da tarefa (não vazia)
 * @param {{ type?: string, complexity?: string }} [override={}] Override opcional
 * @returns {{ type: string, complexity: string, source: 'override'|'heuristic', notes: string[] }}
 */
function classify(description, override) {
  // I9 — validar description
  if (description === null || description === undefined || typeof description !== 'string' || description.trim() === '') {
    throw new Error(
      'classify-bridge: description must be a non-empty string (received: ' +
        (description === null ? 'null' : description === undefined ? 'undefined' : JSON.stringify(description)) +
        ')',
    );
  }

  // Normalizar override
  const ov = override !== null && override !== undefined && typeof override === 'object' ? override : {};

  // I3 — validar override.type (antes de qualquer heurística)
  if (ov.type !== undefined) {
    validateType(ov.type);
  }

  // I4 — validar override.complexity (antes de qualquer heurística)
  if (ov.complexity !== undefined) {
    validateComplexity(ov.complexity);
  }

  // I5 — Override total: ambos fornecidos → bypass heurística
  if (ov.type !== undefined && ov.complexity !== undefined) {
    return {
      type: ov.type,
      complexity: ov.complexity,
      source: 'override',
      notes: [`override accepted: type="${ov.type}", complexity="${ov.complexity}"`],
    };
  }

  // I6 — Override parcial ou sem override → heurística para o campo faltante
  const notes = [];

  let finalType;
  if (ov.type !== undefined) {
    // tipo fornecido via override, não rodar heurística de tipo
    finalType = ov.type;
    notes.push(`type: override accepted ("${ov.type}")`);
  } else {
    const typeResult = inferType(description);
    finalType = typeResult.type;
    notes.push(...typeResult.notes);
  }

  let finalComplexity;
  if (ov.complexity !== undefined) {
    // complexidade fornecida via override, não rodar heurística de complexidade
    finalComplexity = ov.complexity;
    notes.push(`complexity: override accepted ("${ov.complexity}")`);
  } else {
    const complexityResult = inferComplexity(description);
    finalComplexity = complexityResult.complexity;
    notes.push(...complexityResult.notes);
  }

  return {
    type: finalType,
    complexity: finalComplexity,
    source: 'heuristic',
    notes,
  };
}

// ─── EXPORTS (CommonJS, espelhando padrão dos módulos existentes) ─
module.exports = { classify, VALID_TYPES, VALID_COMPLEXITIES };
