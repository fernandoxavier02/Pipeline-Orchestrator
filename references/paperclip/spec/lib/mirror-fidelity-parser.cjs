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
//
// Nota sobre REVIEW-ONLY (G-RO2, _modos.md §2.6): o pipeline-controller não emite
// ORCHESTRATOR_DECISION nesse modo, portanto parseComplexity retorna null. Execuções
// review-only ficam com complexity=null → indeterminate=true (excluídas da régua por design).
// Ver mirror-fidelity-dictionary.cjs §REVIEW-ONLY para a justificativa da decisão.
function parseComplexity(comments) {
  for (const c of comments || []) {
    const body = (c && c.body) || '';
    const opening = openingBlock(body);
    if (opening !== 'ORCHESTRATOR_DECISION') continue;
    const m = COMPLEXITY.exec(body);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

module.exports = { parseBlocks, parseComplexity, BLOCK_HEADER };
