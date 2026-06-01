'use strict';
// Parser dos comentários: detecta cabeçalhos de bloco "### NOME vN" e a complexidade.
const BLOCK_HEADER = /^###\s+([A-Z0-9_]+)\s+v\d+/;
const COMPLEXITY = /complexity:\s*(SIMPLES|MEDIA|COMPLEXA)/i;

// Nome do bloco que ABRE o comentário (cabeçalho na primeira linha não-vazia), ou null.
function openingBlock(body) {
  const text = body || '';
  const firstNonEmpty = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  if (!firstNonEmpty) return null;
  const m = BLOCK_HEADER.exec(firstNonEmpty);
  return m ? m[1] : null;
}

// Um comentário contribui com UM bloco apenas se o cabeçalho ### NOME vN for a
// PRIMEIRA linha não-vazia (R-CRIT-2): os blocos reais ABREM o comentário. Um
// cabeçalho citado no meio da prosa é falso positivo e não conta.
function parseBlocks(comments) {
  const found = new Set();
  for (const c of comments || []) {
    const name = openingBlock((c && c.body) || '');
    if (name) found.add(name);
  }
  return [...found];
}

// Complexidade lida APENAS de dentro do bloco ORCHESTRATOR_DECISION (R-CRIT-1): um
// comentário humano citando "complexity: SIMPLES" não pode envenenar o resultado.
// Se não houver comentário aberto por ORCHESTRATOR_DECISION, retorna null.
function parseComplexity(comments) {
  for (const c of comments || []) {
    const body = (c && c.body) || '';
    if (openingBlock(body) !== 'ORCHESTRATOR_DECISION') continue;
    const m = COMPLEXITY.exec(body);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

module.exports = { parseBlocks, parseComplexity, BLOCK_HEADER };
