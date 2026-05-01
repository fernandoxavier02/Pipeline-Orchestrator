# SPIKE-CI-HARNESS.md — BDD §12.3.1 (Cenário #4)

**Data:** 2026-04-30
**Cenário:** GitHub Action invocando `claude --headless` para rodar `/pipeline-orchestrator:pipeline test-task` sem TTY
**Status:** 🟠 **PARTIAL PASS — snapshot strategy via vitest mocks (claude headless puro não funciona com `AskUserQuestion`)**

---

## 1. Contexto (§12.7 do consolidado, Slice 4 DoD)

Slice 4 (Compat Regression Suite) precisa de uma forma de rodar pipelines em CI e capturar output para snapshot, garantindo que `/pipeline-orchestrator:pipeline` produza output equivalente ao baseline em N cenários canônicos.

Caminhos possíveis:
- **A.** `claude --headless` direto
- **B.** vitest com mocks dos agentes (testa controller logic em isolamento)
- **C.** Híbrido (mocks como gate de PR, claude headless como gate de release)

---

## 2. Avaliação de cada caminho

### 2.1 `claude --headless` (caminho A)

Claude Code CLI suporta:
- `claude -p "prompt"` (print mode, headless)
- `--output-format=json` ou `--output-format=stream-json`
- `--allowedTools` / `--disallowedTools`
- `--dangerously-skip-permissions` (auto-approve tool calls)

🔴 **Bloqueador crítico:** `AskUserQuestion` em modo headless **não pode ser respondido**. O harness não tem usuário, então:
- A pergunta fica pendurada (timeout) ou
- O harness escolhe a primeira opção como default (não-determinístico, depende de versão).

Em V5 do plugin, `AskUserQuestion` é usado em ≥4 gates obrigatórios:
- Phase 1: confirmação do pipeline
- Phase 2: TDD scenarios approval (`TDD_APPROVAL` HARD)
- Phase 2: adversarial gate (`ADVERSARIAL_GATE`)
- Phase 3: closeout choice

**Sem responder esses gates, pipeline trava.** `--dangerously-skip-permissions` cobre tools, **não** AskUserQuestion (que não é uma "permission" — é uma decisão).

🔴 **Veredicto A:** `claude --headless` não funciona out-of-box para E2E do `/pipeline-orchestrator:pipeline`. Requer feature nova: `--ci-auto-confirm` (auto-resolver AskUserQuestion para primeira opção). Feasible mas é trabalho adicional não orçado em Slice 4.

### 2.2 Vitest com mocks (caminho B)

🟠 **Status atual do CC plugin:** **NÃO tem package.json** nem vitest configurado. Isso é diferente do Codex port (que tem TS/vitest pré-configurados).

Adicionar test runner ao CC plugin é parte do escopo de Slice 4:

```
package.json (NOVO):
{
  "scripts": { "test:compat": "vitest run tests/compat/" },
  "devDependencies": { "vitest": "^3.x", "yaml": "^2.x" }
}
```

Padrão de teste:
```typescript
// tests/compat/v4-baseline/bugfix-light.test.ts
import { runPipeline } from '../helpers/pipeline-runner';
import { mockAgentRunner } from '../helpers/mock-agent-runner';

test('bugfix-light produces v4-baseline snapshot', async () => {
  const result = await runPipeline({
    task: 'fix login bug',
    agentRunner: mockAgentRunner({
      'task-orchestrator': () => ({ type: 'Bug Fix', complexity: 'MEDIA' }),
      'information-gate': () => ({ status: 'CLEAR' }),
      // canned responses
    }),
    confirmHandler: () => 'yes', // bypass AskUserQuestion
  });
  expect(result).toMatchSnapshot();
});
```

🟢 **Veredicto B:** Funciona, é determinístico, é caminho de menor resistência. Custo: ~5-7 dias para configurar test runner + escrever 4-5 cenários iniciais (revisado de 3-5 dias do INVENTORY.md original — overhead de configurar o runner do zero).

**Caveat importante:** Como CC plugin não é TypeScript (é majoritariamente markdown + 2 hooks .cjs), o "controller" sendo testado é o **prompt do `commands/pipeline.md`** (957 linhas). Para testar isso em vitest:
- Opção B1: Refatorar lógica testável para módulos JS/TS isolados (Slice 5 territory).
- Opção B2: Usar Claude Code SDK para invocar `commands/pipeline.md` programaticamente em test runner com mocks de spawn_agent.
- Opção B3: Test indireto — vitest valida que YAML parse, gate registry, hook scripts funcionam; smoke test manual valida o pipeline E2E.

🟠 **Recomendação para Slice 4 v5.0:** Opção B3 (testes unitários do que é testável + smoke manual). Opção B1/B2 ficam para Slice 5+ quando refactor permitir.

### 2.3 Híbrido (caminho C)

Combina:
- **Em PR (CI):** vitest com mocks (caminho B3) — rápido, determinístico, bloqueia merge se quebrar.
- **Em release tag:** smoke manual + claude headless com `--ci-auto-confirm` (futuro) — valida E2E real antes de tag.

🟢 **Veredicto C:** É o caminho recomendado quando v5.1+ trouxer refatoração que permita E2E em CI.

---

## 3. Decisão recomendada para Slice 4 v5.0

🟢 **Caminho B3 (mocks unitários + smoke manual):**

### 3.1 Estrutura proposta

```
package.json                             ← NOVO
tests/
├── compat/
│   ├── gate-registry.test.ts            ← vitest unit
│   ├── yaml-parse.test.ts               ← vitest unit
│   ├── hook-force-pipeline.test.ts      ← test do .cjs
│   └── snapshots/
└── e2e-smoke/
    └── full-pipeline-real-claude.md     ← roteiro manual

.github/workflows/
└── compat.yml                           ← rodar npm test em PR

docs/
└── release-checklist.md                 ← inclui smoke manual
```

### 3.2 GitHub Action

```yaml
name: V4 Compat Regression
on: [pull_request, push]
jobs:
  compat:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run test:compat
      # snapshot diverge → vitest fail → PR bloqueado
```

### 3.3 Smoke manual (pre-release)

Antes de cada `v5.0.0-rc.N` tag, rodar em fixture-repo isolado:
```
/pipeline-orchestrator:pipeline "fix typo in README"
```
- Verificar TRACE.md gerado
- Confirmar gates corretos
- Final decision GO

Documentar em `docs/release-checklist.md`.

---

## 4. Caminho complementar (futuro): claude headless com `--ci-auto-confirm`

Se o time quiser E2E real em CI eventualmente:
1. Adicionar feature `--ci-auto-confirm` ao Claude Code (request upstream ou wrapper local).
2. Rodar via `claude -p "/pipeline-orchestrator:pipeline test-task" --dangerously-skip-permissions --output-format=json`.
3. Capturar JSON, comparar com snapshot.

**Risco:** auto-confirm muda semântica (gates não são decisões reais). Útil para smoke regression, ruim para validação de gate logic. Backlog v5.1+, não bloqueia v5.0.

---

## 5. DoD do Slice 4 (recalibrado)

- [ ] `package.json` adicionado ao CC plugin com vitest + scripts
- [ ] `tests/compat/` com cenários iniciais (gate-registry, yaml-parse, hook scripts)
- [ ] Snapshots committed em `tests/compat/snapshots/`
- [ ] `.github/workflows/compat.yml` rodando em PR
- [ ] `docs/release-checklist.md` documenta smoke manual
- [ ] (futuro v5.1) `--ci-auto-confirm` em backlog

**Estimativa revisada:** 5-7 dias (vs 3-5 dias do plano inicial — overhead de bootstrap do test runner em CC plugin que ainda não tem).

---

## 6. Veredicto

🟠 **PARTIAL PASS.** Cenário BDD pede "claude --headless funciona ou design alternativo via mocks". Resposta: **alternativa via mocks (caminho B3)**, com smoke manual antes de release. claude --headless puro não funciona por causa de `AskUserQuestion`. Caminho híbrido (C) fica para v5.1+ quando refactor permitir testes E2E.

🟠 **GATE PENDENTE — confirmação humano:**
- Opção 1 (Recomendado): Mocks unitários (B3) + smoke manual
- Opção 2: Investir em `--ci-auto-confirm` + claude headless agora (E2E real, mais caro)
- Opção 3: Híbrido (B3 em PR + headless em release tag)
