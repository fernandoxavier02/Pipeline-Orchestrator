'use strict';
function buildReport(rows, { orphanCount } = {}) {
  const scored = rows.filter((r) => !r.indeterminate && typeof r.score === 'number');
  const indet = rows.filter((r) => r.indeterminate);
  const missCount = {};
  for (const r of scored) for (const g of (r.missing || [])) missCount[g] = (missCount[g] || 0) + 1;
  const ranked = Object.entries(missCount).sort((a, b) => b[1] - a[1]);
  const lines = [];
  lines.push('# Relatório de Fidelidade — Paperclip', '');
  // Sem execuções pontuadas → N/A (0.00 pareceria a pior nota real, enganando o leitor).
  if (scored.length === 0) {
    lines.push(`**Nota média: N/A** (sem execuções pontuadas; ${indet.length} indeterminadas)`, '');
  } else {
    const avg = Math.round((scored.reduce((s, r) => s + r.score, 0) / scored.length) * 100) / 100;
    lines.push(`**Nota média: ${avg.toFixed(2)}** (sobre ${scored.length} execuções; ${indet.length} indeterminadas)`, '');
  }
  lines.push('## Portões mais ausentes (onde a fidelidade vaza)', '');
  for (const [g, n] of ranked) lines.push(`- ${g}: ${n}`);
  if (typeof orphanCount === 'number') {
    lines.push(`Execuções órfãs (sem raiz de complexidade): ${orphanCount}`, '');
  }
  lines.push('', '## Por execução', '');
  for (const r of rows) {
    lines.push(r.indeterminate
      ? `- ${r.identifier}: indeterminada (complexidade não detectada)`
      : `- ${r.identifier} [${r.complexity}]: ${r.score.toFixed(2)} — faltam: ${(r.missing || []).join(', ') || '—'}`);
  }
  return lines.join('\n');
}
module.exports = { buildReport };
