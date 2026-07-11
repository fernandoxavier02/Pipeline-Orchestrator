#!/usr/bin/env node
// Contrapressão do loop next-action-contract: roda a suíte oficial do plugin e
// falha SOMENTE quando aparece falha NOVA em relação ao baseline registrado no
// intake (2026-07-08). Falhas pré-existentes (Langfuse/env, score-writer, F4
// v8.8.0 dispatch-pending fail-closed, v8.21.0 F1-F3 RED congelados da fatia
// S2) NÃO derrubam o loop; qualquer suíte fora dessa lista derrubando = regressão.
// Copiado (lógica intacta) de loops/hook-unblock/check_no_new_failures.cjs —
// mesmo problema, mesma solução, reaproveitada em vez de recriada.
// ponytail: comparação por rótulo de suíte, não por caso individual — o
// run-tests.cjs só expõe rótulo por arquivo; granularidade maior exigiria
// parsear cada framework interno.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const baselinePath = path.join(__dirname, 'baseline_failures.txt');
const baseline = new Set(
  fs.readFileSync(baselinePath, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
);

const res = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'run-tests.cjs')], {
  cwd: repoRoot,
  encoding: 'utf8',
  timeout: 15 * 60 * 1000,
  maxBuffer: 64 * 1024 * 1024,
});

const out = (res.stdout || '') + (res.stderr || '');
const failing = new Set();
for (const line of out.split(/\r?\n/)) {
  // Linhas por suíte têm exatamente 2 espaços de indentação; saída interna dos
  // testes vem com 4+ e não casa.
  const m = /^ {2}\[(FAIL|TIMEOUT)\] (.+)$/.exec(line);
  if (m) failing.add(m[2].trim());
}

if (res.status === null) {
  console.log('REGRESSAO: a suite nao terminou (timeout do wrapper)');
  process.exit(1);
}
if (!/Summary: \d+ passed/.test(out)) {
  console.log('REGRESSAO: saida da suite sem linha Summary — execucao invalida');
  process.exit(1);
}

const news = [...failing].filter((l) => !baseline.has(l));
const cured = [...baseline].filter((l) => !failing.has(l));
console.log(
  `suite: ${failing.size} falhas (baseline ${baseline.size}); novas: ${news.length}; curadas: ${cured.length}`
);
if (news.length) {
  console.log('FALHAS NOVAS (regressao — a volta deve ser desfeita):');
  for (const l of news) console.log('  - ' + l);
  process.exit(1);
}
process.exit(0);
