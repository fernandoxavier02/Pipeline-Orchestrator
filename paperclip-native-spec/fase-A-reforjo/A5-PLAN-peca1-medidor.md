# Peça 1 — Medidor de Fidelidade — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um medidor read-only que lê as execuções reais do Paperclip, traduz os blocos que os cargos já emitem em portões canônicos, e calcula a nota de fidelidade por execução e agregada.

**Architecture:** Cinco módulos CommonJS em `references/paperclip/spec/lib/`. Lógica pura (dicionário, portões esperados, parser, cálculo) separada do I/O (coletor via API loopback) e da apresentação (relatório). Um CLI orquestra. A skill-invólucro (`measure-paperclip-fidelity`) é criada por último.

**Tech Stack:** Node 24 (`node:test`, `node:assert`, `node:crypto`), zero dependências externas. API loopback do Paperclip via SSH (`hostinger-vps`). Substrato de leitura: comentários das issues (campo `executionState` está morto — ver A0).

---

## Diretrizes de execução (do piloto, 2026-06-01)

1. **Skills de criação de skills:** ao criar a SKILL.md do invólucro (Grupo C), usar `skill-creator` (ou `customaize-agent:create-skill` / `superpowers:writing-skills`).
2. **Skills do Paperclip:** ao implementar a coleta (Grupo B), usar `operating-paperclip` como fonte de verdade da API; consultar as cargo-side `paperclip-*` quando precisar do contrato dos blocos.
3. **Revisão adversarial após cada GRUPO de sprints:** ao fim dos Grupos A, B e C, despachar revisores adversariais independentes (zero contexto da implementação — security + architecture + quality) e corrigir CRITICAL/HIGH antes de avançar. Espelha o loop adversarial do pipeline canônico.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `references/paperclip/spec/lib/mirror-fidelity-dictionary.cjs` | Dados puros: dicionário bloco→portão + conjuntos de portões esperados por complexidade |
| `references/paperclip/spec/lib/mirror-fidelity-parser.cjs` | Extrai blocos (`### NOME vN`) e a complexidade de uma lista de comentários |
| `references/paperclip/spec/lib/mirror-fidelity-score.cjs` | Cálculo puro da nota a partir de blocos detectados + complexidade |
| `references/paperclip/spec/lib/mirror-fidelity-collector.cjs` | I/O read-only: lê issues + comentários via API loopback |
| `references/paperclip/spec/lib/mirror-fidelity-report.cjs` | Formata o relatório markdown (por execução + agregado + portões mais ausentes) |
| `references/paperclip/spec/lib/measure-fidelity.cjs` | CLI: orquestra coletor → parser → score → report |
| `references/paperclip/spec/lib/*.test.cjs` | Testes `node --test` ao lado de cada módulo puro |
| `skills/measure-paperclip-fidelity/SKILL.md` | Invólucro (Grupo C, via skill-creator) |

Comando de teste do grupo: `node --test references/paperclip/spec/lib/mirror-fidelity-*.test.cjs`

---

## GRUPO A — Núcleo puro (dicionário, portões esperados, parser, nota)

### Task 1: Dicionário bloco→portão + portões esperados

**Files:**
- Create: `references/paperclip/spec/lib/mirror-fidelity-dictionary.cjs`
- Test: `references/paperclip/spec/lib/mirror-fidelity-dictionary.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { BLOCK_TO_GATE, EXPECTED_GATES, gateForBlock, expectedGates } = require('./mirror-fidelity-dictionary.cjs');

test('mapeia bloco observado para portão canônico', () => {
  assert.strictEqual(gateForBlock('TDD_GREEN'), 'TDD_APPROVAL');
  assert.strictEqual(gateForBlock('ADVERSARIAL_CONSOLIDATED'), 'ADVERSARIAL_GATE');
  assert.strictEqual(gateForBlock('PA_DE_CAL'), 'FINAL_ADVERSARIAL_GATE');
  assert.strictEqual(gateForBlock('BLOCO_DESCONHECIDO'), null);
});

test('conjunto de portões esperados por complexidade', () => {
  assert.strictEqual(expectedGates('SIMPLES').length, 5);
  assert.strictEqual(expectedGates('COMPLEXA').length, 16);
  assert.ok(expectedGates('COMPLEXA').includes('ADVERSARIAL_GATE_MANDATORY'));
  assert.deepStrictEqual(expectedGates('XPTO'), []); // complexidade desconhecida → vazio
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test references/paperclip/spec/lib/mirror-fidelity-dictionary.test.cjs`
Expected: FAIL — "Cannot find module './mirror-fidelity-dictionary.cjs'"

- [ ] **Step 3: Write minimal implementation**

```js
'use strict';
// Dicionário de tradução bloco→portão (v0). Fonte: blocos observados nas 54 execuções
// reais (A5 §4) + conjuntos de portões esperados da spec (A4-validation §2, gates.md).

// Blocos que os cargos JÁ emitem → portão canônico equivalente.
const BLOCK_TO_GATE = {
  ORCHESTRATOR_DECISION: 'COMPLEXITY_GATE',
  TDD_GREEN: 'TDD_APPROVAL',
  ADVERSARIAL_CONSOLIDATED: 'ADVERSARIAL_GATE',
  PA_DE_CAL: 'FINAL_ADVERSARIAL_GATE',
  SLICE_CLOSEOUT: 'CLOSEOUT_CONFIRM',
  HANDOFF_STATUS: 'CLOSEOUT_CONFIRM',
  DISPATCH_REQUEST: 'DISPATCH',
};

// Conjuntos mandatórios por complexidade (A4-validation §2 + canônico).
const SIMPLES = ['INFO_GATE_BLOCKED', 'TDD_APPROVAL', 'CHECKPOINT_FAIL', 'COMPLEXITY_GATE', 'CLOSEOUT_CONFIRM'];
const MEDIA = SIMPLES.concat(['PLAN_REJECTED', 'MICRO_GATE_GAP', 'ADVERSARIAL_GATE', 'ADVERSARIAL_BLOCK', 'STOP_RULE']);
const COMPLEXA = MEDIA.concat([
  'STATE_FILE_INIT_FAIL', 'FINAL_ADVERSARIAL_GATE', 'FINAL_ADVERSARIAL_REWORK',
  'FIX_LOOP_EXHAUSTED', 'ADVERSARIAL_GATE_MANDATORY', 'SSOT_CONFLICT',
]);
const EXPECTED_GATES = { SIMPLES, MEDIA, COMPLEXA };

function gateForBlock(name) {
  return Object.prototype.hasOwnProperty.call(BLOCK_TO_GATE, name) ? BLOCK_TO_GATE[name] : null;
}
function expectedGates(complexity) {
  return EXPECTED_GATES[complexity] ? EXPECTED_GATES[complexity].slice() : [];
}

module.exports = { BLOCK_TO_GATE, EXPECTED_GATES, gateForBlock, expectedGates };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test references/paperclip/spec/lib/mirror-fidelity-dictionary.test.cjs`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add references/paperclip/spec/lib/mirror-fidelity-dictionary.cjs references/paperclip/spec/lib/mirror-fidelity-dictionary.test.cjs
git commit -m "feat(mirror): dicionário bloco→portão + portões esperados por complexidade"
```

### Task 2: Parser de blocos e complexidade

**Files:**
- Create: `references/paperclip/spec/lib/mirror-fidelity-parser.cjs`
- Test: `references/paperclip/spec/lib/mirror-fidelity-parser.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseBlocks, parseComplexity } = require('./mirror-fidelity-parser.cjs');

const comments = [
  { body: '### ORCHESTRATOR_DECISION v1\n```yaml\ntask_type: Feature\ncomplexity: COMPLEXA\n```' },
  { body: '### TDD_GREEN v1\nissue: PIP-44' },
  { body: 'texto solto sem bloco' },
  { body: '### PA_DE_CAL v1\nverdict: GO' },
];

test('extrai nomes de bloco (### NOME vN), deduplicado', () => {
  assert.deepStrictEqual(parseBlocks(comments).sort(), ['ORCHESTRATOR_DECISION', 'PA_DE_CAL', 'TDD_GREEN']);
});

test('extrai complexidade do bloco ORCHESTRATOR_DECISION', () => {
  assert.strictEqual(parseComplexity(comments), 'COMPLEXA');
});

test('complexidade ausente → null', () => {
  assert.strictEqual(parseComplexity([{ body: 'nada aqui' }]), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test references/paperclip/spec/lib/mirror-fidelity-parser.test.cjs`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test references/paperclip/spec/lib/mirror-fidelity-parser.test.cjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add references/paperclip/spec/lib/mirror-fidelity-parser.cjs references/paperclip/spec/lib/mirror-fidelity-parser.test.cjs
git commit -m "feat(mirror): parser de blocos e complexidade dos comentários"
```

### Task 3: Calculadora da nota de fidelidade

**Files:**
- Create: `references/paperclip/spec/lib/mirror-fidelity-score.cjs`
- Test: `references/paperclip/spec/lib/mirror-fidelity-score.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { scoreExecution } = require('./mirror-fidelity-score.cjs');

test('nota = emitidos∩esperados / esperados, com faltantes listados', () => {
  // blocos detectados: TDD_GREEN→TDD_APPROVAL, PA_DE_CAL→FINAL_ADVERSARIAL_GATE, ORCHESTRATOR_DECISION→COMPLEXITY_GATE
  const r = scoreExecution({ blocks: ['TDD_GREEN', 'PA_DE_CAL', 'ORCHESTRATOR_DECISION'], complexity: 'SIMPLES' });
  // esperados SIMPLES (5): INFO_GATE_BLOCKED, TDD_APPROVAL, CHECKPOINT_FAIL, COMPLEXITY_GATE, CLOSEOUT_CONFIRM
  // emitidos que são esperados: TDD_APPROVAL, COMPLEXITY_GATE = 2/5
  assert.strictEqual(r.score, 0.4);
  assert.deepStrictEqual(r.missing.sort(), ['CHECKPOINT_FAIL', 'CLOSEOUT_CONFIRM', 'INFO_GATE_BLOCKED']);
});

test('complexidade desconhecida → score null (indeterminado, não 0)', () => {
  const r = scoreExecution({ blocks: ['TDD_GREEN'], complexity: null });
  assert.strictEqual(r.score, null);
  assert.strictEqual(r.indeterminate, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test references/paperclip/spec/lib/mirror-fidelity-score.test.cjs`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Write minimal implementation**

```js
'use strict';
const { gateForBlock, expectedGates } = require('./mirror-fidelity-dictionary.cjs');

// Calcula a nota de UMA execução. complexity null → indeterminado (R1 do A5: não assumir).
function scoreExecution({ blocks, complexity }) {
  const expected = expectedGates(complexity);
  if (!complexity || expected.length === 0) {
    return { score: null, indeterminate: true, emitted: [], missing: [], expected };
  }
  const emitted = new Set();
  for (const b of blocks || []) {
    const g = gateForBlock(b);
    if (g) emitted.add(g);
  }
  const expectedSet = new Set(expected);
  const hit = [...emitted].filter((g) => expectedSet.has(g));
  const missing = expected.filter((g) => !emitted.has(g));
  const score = Math.round((hit.length / expected.length) * 100) / 100;
  return { score, indeterminate: false, emitted: [...emitted], hit, missing, expected };
}

module.exports = { scoreExecution };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test references/paperclip/spec/lib/mirror-fidelity-score.test.cjs`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add references/paperclip/spec/lib/mirror-fidelity-score.cjs references/paperclip/spec/lib/mirror-fidelity-score.test.cjs
git commit -m "feat(mirror): calculadora da nota de fidelidade por execução"
```

### Gate de grupo A — Revisão adversarial

- [ ] **Step A1:** Rodar a suíte do grupo: `node --test references/paperclip/spec/lib/mirror-fidelity-*.test.cjs` — esperado: todos PASS.
- [ ] **Step A2:** Despachar revisão adversarial independente (zero contexto da implementação) sobre os 3 módulos puros — eixos: correção do dicionário vs evidência das execuções, falsos positivos/negativos no parser (regex), e tratamento de indeterminado no score. Usar 3 revisores paralelos (security/architecture/quality) ou a skill de adversarial review.
- [ ] **Step A3:** Corrigir findings CRITICAL/HIGH e re-rodar a suíte. Só então avançar para o Grupo B.

---

## GRUPO B — Coleta (I/O) e relatório

> **Skill obrigatória:** usar `operating-paperclip` como fonte de verdade da API durante este grupo. Todas as chamadas são READ-ONLY (`GET`), nenhuma escrita no Paperclip.

### Task 4: Coletor read-only via API loopback

**Files:**
- Create: `references/paperclip/spec/lib/mirror-fidelity-collector.cjs`
- Test: `references/paperclip/spec/lib/mirror-fidelity-collector.test.cjs`

- [ ] **Step 1: Write the failing test** (com transport injetável, sem rede real)

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { collectExecutions } = require('./mirror-fidelity-collector.cjs');

function fakeTransport() {
  return {
    async listIssues() { return [{ id: 'i1', identifier: 'PIP-1', title: '[FEATURE] x' }]; },
    async getComments(id) {
      assert.strictEqual(id, 'i1');
      return [{ body: '### ORCHESTRATOR_DECISION v1\ncomplexity: COMPLEXA' }, { body: '### PA_DE_CAL v1\nverdict: GO' }];
    },
  };
}

test('coleta issues + comentários e devolve estrutura por execução', async () => {
  const out = await collectExecutions({ companyId: 'co', transport: fakeTransport() });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].identifier, 'PIP-1');
  assert.strictEqual(out[0].comments.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test references/paperclip/spec/lib/mirror-fidelity-collector.test.cjs`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Write minimal implementation** (transport default = SSH→curl loopback; injetável para teste)

```js
'use strict';
const { execFile } = require('node:child_process');

// Transport default: SSH para a VPS + curl loopback (read-only). Substituível em teste.
function sshTransport({ host = 'hostinger-vps', base = 'http://127.0.0.1:3100/api' } = {}) {
  function curl(path) {
    return new Promise((resolve, reject) => {
      execFile('ssh', [host, `curl -s ${base}${path}`], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(err);
        try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
      });
    });
  }
  return {
    async listIssues(companyId) { return curl(`/companies/${companyId}/issues`); },
    async getComments(issueId) { return curl(`/issues/${issueId}/comments`); },
  };
}

async function collectExecutions({ companyId, transport }) {
  const t = transport || sshTransport();
  const issues = await t.listIssues(companyId);
  const arr = Array.isArray(issues) ? issues : (issues.issues || issues.data || []);
  const out = [];
  for (const it of arr) {
    const comments = await t.getComments(it.id);
    out.push({ id: it.id, identifier: it.identifier, title: it.title, comments: Array.isArray(comments) ? comments : [] });
  }
  return out;
}

module.exports = { collectExecutions, sshTransport };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test references/paperclip/spec/lib/mirror-fidelity-collector.test.cjs`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add references/paperclip/spec/lib/mirror-fidelity-collector.cjs references/paperclip/spec/lib/mirror-fidelity-collector.test.cjs
git commit -m "feat(mirror): coletor read-only via API loopback (transport injetável)"
```

### Task 5: Relatório markdown

**Files:**
- Create: `references/paperclip/spec/lib/mirror-fidelity-report.cjs`
- Test: `references/paperclip/spec/lib/mirror-fidelity-report.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildReport } = require('./mirror-fidelity-report.cjs');

test('agrega nota média (ignorando indeterminados) e ranqueia portões mais ausentes', () => {
  const rows = [
    { identifier: 'PIP-1', complexity: 'SIMPLES', score: 0.4, missing: ['INFO_GATE_BLOCKED', 'CHECKPOINT_FAIL'], indeterminate: false },
    { identifier: 'PIP-2', complexity: 'SIMPLES', score: 0.6, missing: ['INFO_GATE_BLOCKED'], indeterminate: false },
    { identifier: 'PIP-3', complexity: null, score: null, missing: [], indeterminate: true },
  ];
  const md = buildReport(rows);
  assert.match(md, /Nota média: 0\.50/);          // (0.4+0.6)/2
  assert.match(md, /INFO_GATE_BLOCKED.*2/);        // portão mais ausente
  assert.match(md, /indeterminad/i);               // PIP-3 reportado, não contado
});
```

- [ ] **Step 2: Run test to verify it fails** → módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes** → PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add references/paperclip/spec/lib/mirror-fidelity-report.cjs references/paperclip/spec/lib/mirror-fidelity-report.test.cjs
git commit -m "feat(mirror): relatório markdown agregado + ranking de portões ausentes"
```

### Task 6: CLI orquestrador

**Files:**
- Create: `references/paperclip/spec/lib/measure-fidelity.cjs`

- [ ] **Step 1: Implementar o CLI** (sem teste unitário — é glue I/O; validado no Grupo C contra dados reais)

```js
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
```

- [ ] **Step 2: Smoke local** (sem rede, deve exigir companyId)

Run: `node references/paperclip/spec/lib/measure-fidelity.cjs`
Expected: imprime "uso:" e sai com código 2.

- [ ] **Step 3: Commit**

```bash
git add references/paperclip/spec/lib/measure-fidelity.cjs
git commit -m "feat(mirror): CLI orquestrador do medidor de fidelidade"
```

### Gate de grupo B — Revisão adversarial

- [ ] **Step B1:** Suíte verde: `node --test references/paperclip/spec/lib/mirror-fidelity-*.test.cjs`.
- [ ] **Step B2:** Revisão adversarial (zero contexto) sobre coletor + relatório — eixos: confirmar READ-ONLY (nenhum POST/PATCH), robustez do parse de JSON da API, tratamento de comentários newest-first, e segurança do `execFile` (sem injeção via companyId). Usar `operating-paperclip` para validar os contratos de endpoint.
- [ ] **Step B3:** Corrigir CRITICAL/HIGH, re-rodar, avançar.

---

## GRUPO C — Invólucro skill + baseline real

> **Skill obrigatória:** usar `skill-creator` (ou `superpowers:writing-skills`) para criar a SKILL.md.

### Task 7: Criar a skill-invólucro `measure-paperclip-fidelity`

**Files:**
- Create: `skills/measure-paperclip-fidelity/SKILL.md`

- [ ] **Step 1:** Invocar `skill-creator` para gerar o esqueleto da skill, com: nome `measure-paperclip-fidelity`, descrição com gatilhos ("medir fidelidade do Paperclip", "nota de paridade", "fidelity baseline"), e corpo que instrui: (a) confirmar a empresa-alvo, (b) rodar o CLI via `operating-paperclip`, (c) salvar o relatório, (d) NUNCA escrever no Paperclip.
- [ ] **Step 2:** Validar o frontmatter (name/description) e o disparo conforme as regras de skill do projeto.
- [ ] **Step 3: Commit**

```bash
git add skills/measure-paperclip-fidelity/SKILL.md
git commit -m "feat(mirror): skill-invólucro measure-paperclip-fidelity (via skill-creator)"
```

### Task 8: Rodar o baseline sobre as 54 execuções reais

**Files:**
- Create: `paperclip-native-spec/fase-A-reforjo/baseline-fidelidade-2026-06-01.md` (saída)

- [ ] **Step 1:** Rodar o CLI contra a empresa Pipeline Orchestrator (`019c6f31-41ed-497a-93ba-cb4eff651a7c`), salvando o relatório.

Run: `node references/paperclip/spec/lib/measure-fidelity.cjs 019c6f31-41ed-497a-93ba-cb4eff651a7c > "D:/Pipeline Orchestrator Claude/paperclip-native-spec/fase-A-reforjo/baseline-fidelidade-2026-06-01.md"`
Expected: relatório com nota média + ranking de portões ausentes sobre ~54 execuções.

- [ ] **Step 2:** Validar o dicionário (A5 §4): conferir que cada bloco observado mapeou para um portão e que as ausências (info-gate, aprovações) batem com a hipótese. Anotar correções de dicionário, se houver, e reabrir Task 1.
- [ ] **Step 3:** Atualizar A5 §4 e A0 substituindo a estimativa ~0.70 pela nota medida.
- [ ] **Step 4: Commit**

```bash
git add references/paperclip/spec/lib/mirror-fidelity-dictionary.cjs "D:/Pipeline Orchestrator Claude/paperclip-native-spec/fase-A-reforjo/baseline-fidelidade-2026-06-01.md"
git commit -m "feat(mirror): baseline de fidelidade medido sobre 54 execuções reais"
```

### Gate de grupo C — Revisão adversarial final

- [ ] **Step C1:** Revisão adversarial do conjunto completo + do baseline — eixos: o número medido é defensável? O dicionário tem viés que infla/deprime a nota? A skill respeita read-only? Cross-check da nota por amostragem manual de 2-3 execuções.
- [ ] **Step C2:** Corrigir findings, re-rodar baseline se o dicionário mudou.
- [ ] **Step C3:** Entregar: medidor + skill + baseline real. Fim da Peça 1.

---

## Self-Review (preenchido)

- **Cobertura da spec (A5):** Peça 1 §3 (medidor) → Grupos A-C. Dicionário §4 → Task 1 + validação Task 8. Critério de sucesso §8 → Task 8. R1 (indeterminado) → Task 3 + score null. R2 (variância) → relatório por execução (Task 5). ✅
- **Placeholders:** nenhum step de código sem código real; tasks de skill/baseline têm comandos concretos. ✅
- **Consistência de tipos:** `scoreExecution` retorna `{score, indeterminate, emitted, missing, expected}`, consumido igual em report e CLI; `collectExecutions` retorna `{id, identifier, title, comments}`, consumido no CLI. ✅
- **Escopo:** só a Peça 1 (medir primeiro, decisão D3). Peças 2-5 ficam para planos seguintes. ✅
