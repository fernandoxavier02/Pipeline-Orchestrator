'use strict';
function buildReport(rows) {
  const scored = rows.filter((r) => !r.indeterminate && typeof r.score === 'number');
  const indet = rows.filter((r) => r.indeterminate);
  const avg = scored.length ? Math.round((scored.reduce((s, r) => s + r.score, 0) / scored.length) * 100) / 100 : 0;
  const missCount = {};
  for (const r of scored) for (const g of r.missing) missCount[g] = (missCount[g] || 0) + 1;
  const ranked = Object.entries(missCount).sort((a, b) => b[1] - a[1]);
  const lines = [];
  lines.push('# Relatório de Fidelidade — Paperclip', '');
  lines.push(`**Nota média: ${avg.toFixed(2)}** (sobre ${scored.length} execuções; ${indet.length} indeterminadas)`, '');
  lines.push('## Portões mais ausentes (onde a fidelidade vaza)', '');
  for (const [g, n] of ranked) lines.push(`- ${g}: ${n}`);
  lines.push('', '## Por execução', '');
  for (const r of rows) {
    lines.push(r.indeterminate
      ? `- ${r.identifier}: indeterminada (complexidade não detectada)`
      : `- ${r.identifier} [${r.complexity}]: ${r.score.toFixed(2)} — faltam: ${r.missing.join(', ') || '—'}`);
  }
  return lines.join('\n');
}
module.exports = { buildReport };
