'use strict';
// CLI: node measure-fidelity.cjs <companyId> [> relatorio.md]
const { collectExecutions } = require('./mirror-fidelity-collector.cjs');
const { parseBlocks, parseComplexity } = require('./mirror-fidelity-parser.cjs');
const { scoreExecution } = require('./mirror-fidelity-score.cjs');
const { buildReport } = require('./mirror-fidelity-report.cjs');

async function main() {
  const companyId = process.argv[2];
  if (!companyId) { console.error('uso: node measure-fidelity.cjs <companyId>'); process.exit(2); }
  const execs = await collectExecutions({ companyId });
  const rows = execs.map((e) => {
    const blocks = parseBlocks(e.comments);
    const complexity = parseComplexity(e.comments);
    const s = scoreExecution({ blocks, complexity });
    return { identifier: e.identifier, complexity, ...s };
  });
  process.stdout.write(buildReport(rows) + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
