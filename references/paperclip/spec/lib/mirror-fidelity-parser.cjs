'use strict';
// Parser dos comentários: detecta cabeçalhos de bloco "### NOME vN" e a complexidade.
const BLOCK_HEADER = /^###\s+([A-Z0-9_]+)\s+v\d+/m;
const BLOCK_HEADER_G = /^###\s+([A-Z0-9_]+)\s+v\d+/gm;
const COMPLEXITY = /complexity:\s*(SIMPLES|MEDIA|COMPLEXA)/i;

function parseBlocks(comments) {
  const found = new Set();
  for (const c of comments || []) {
    const body = (c && c.body) || '';
    let m;
    BLOCK_HEADER_G.lastIndex = 0;
    while ((m = BLOCK_HEADER_G.exec(body)) !== null) found.add(m[1]);
  }
  return [...found];
}

function parseComplexity(comments) {
  for (const c of comments || []) {
    const m = COMPLEXITY.exec((c && c.body) || '');
    if (m) return m[1].toUpperCase();
  }
  return null;
}

module.exports = { parseBlocks, parseComplexity, BLOCK_HEADER };
