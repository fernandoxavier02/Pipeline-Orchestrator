'use strict';
// CLI: node measure-fidelity.cjs <companyId> [> relatorio.md]
const { collectExecutions, assertSafeId } = require('./mirror-fidelity-collector.cjs');
const { scoreTrees } = require('./mirror-fidelity-tree.cjs');
const { buildReport } = require('./mirror-fidelity-report.cjs');

async function main() {
  const companyId = process.argv[2];
  if (!companyId) { console.error('uso: node measure-fidelity.cjs <companyId>'); process.exit(2); }
  assertSafeId(companyId, 'companyId');
  const execs = await collectExecutions({ companyId });
  const result = scoreTrees(execs);
  process.stdout.write(buildReport(result.trees, { orphanCount: result.orphanCount }) + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
