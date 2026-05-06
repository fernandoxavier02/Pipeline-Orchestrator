# SPIKE-CI-HARNESS.md — BDD §12.3.1 (Cenário #4)

**Data:** 2026-04-30 (revisado 2026-05-06)
**Cenário:** GitHub Action invocando `claude --headless` para rodar `/pipeline-orchestrator:pipeline test-task` sem TTY
**Status:** 🟢 **PASS — real-mode wired via PreToolUse auto-answer hook (Claude Code v2.1.85+ contract); resolved 2026-05-06 in v4.16.0**

---

## ADENDUM 2026-05-06 (v4.16.0 — Issue #11 resolution)

🟢 **Mudança de status: 🟠 PARTIAL PASS → 🟢 PASS.** O bloqueador documentado abaixo (§2.1) foi superado por uma mudança upstream em Claude Code v2.1.85, sem precisar do `--ci-auto-confirm` que esta SPIKE recomendava como fallback hipotético.

**O que mudou em Claude Code:** A partir de v2.1.85, hooks `PreToolUse` ganham capacidade de satisfazer `AskUserQuestion` em modo headless (`-p`). O hook retorna:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "questions": [<echo original>],
      "answers": { "<question.text>": "<chosen option.label>" }
    }
  }
}
```

Isso satisfaz a question sem prompt visível ao "usuário" (que não existe em CI). Fonte oficial: `code.claude.com/docs/en/hooks` (PreToolUse decision control). CLI local em uso: v2.1.118.

**Como aplicamos isso no compat runner:**

1. **`tests/compat/auto-answer-hook.cjs`** (NEW) — script de hook genérico. Para cada question recebida via stdin, escolhe `options[0].label` como default ("Recomendado" por convenção CLAUDE.md) ou aplica override por `question.header` se houver entry em `tests/compat/v4-baseline/answers-overrides.json`. Multi-select usa labels comma-separated.
2. **`tests/compat/runner.cjs::executeReal()`** (REIMPLEMENTED) — antes era stub. Agora spawna `claude -p "<input.md>" --settings <tmp-settings.json> --output-format stream-json --include-partial-messages --permission-mode bypassPermissions --allowedTools "Read Glob Grep Write Edit AskUserQuestion Task"`. O `tmp-settings.json` registra o hook acima sob o matcher `AskUserQuestion`. 90s hard timeout; cleanup do tmp settings após cada cenário.
3. **`.github/workflows/compat-regression.yml`** (SPLIT EM 2 JOBS) — branch mock (sempre, gate de PR) + branch real condicional `if: vars.CLAUDE_CLI_AVAILABLE == 'true'` rodando só `bugfix-fixture` em PRs (smoke ~$0.50-1) e `--all` apenas em `workflow_dispatch` manual (~$3-5).

**Caminho híbrido (opção C da seção §2.3 abaixo) finalmente realizado:**
- **Em PR:** mock (B3 evolved — fixtures REAL desde v4.10.0) — rápido, determinístico, gate de merge.
- **Em PR opt-in (CLAUDE_CLI_AVAILABLE=true):** real-mode smoke — pinga 1 cenário contra LLM real, captura drift de hook contract.
- **Em release (workflow_dispatch):** real-mode `--all` — valida E2E completo antes de tag.

**Riscos residuais documentados (Issue #11 §Risks):**
1. **LLM não-determinismo** — observable contract bate; raciocínio/prosa não. Tolerância: 1 retry manual.
2. **Custo** — só `bugfix-fixture` em PR (~$0.50-1); `--all` só em workflow_dispatch.
3. **Latência** — 60-120s/cenário; budget de 8min cobre comfortably.
4. **Hook contract drift upstream** — se Anthropic mudar schema, mock-mode ainda passa mas real-mode falha. Mitigação: nightly job (futuro) que roda smoke + comenta no Issue se drift detectado.

**O que esta SPIKE NÃO resolveu (e continua aberto):**
- A B3 de mocks ainda é o gate primário em PRs — confiamos nos fixtures REAL capturados em v4.10.0, não em re-execução LLM toda vez.
- A B1/B2 (refactor da controller logic em módulos JS testáveis) continua backlog — não é necessária agora que real-mode roda direto.

---

## 1. Contexto (§12.7 do consolidado, Slice 4 DoD)

Slice 4 (Compat Regression Suite) precisa de uma forma de rodar pipelines em CI e capturar output para snapshot, garantindo que `/pipeline-orchestrator:pipeline` produza output equivalente ao baseline em N cenários canônicos.

Caminhos possíveis:
- **A.** `claude --headless` direto
- **B.** vitest com mocks dos agentes (testa controller logic em isolamento)
- **C.** Híbrido (mocks como gate de PR, claude headless como gate de release)

---

## 2. Avaliação de cada caminho

### 2.1 `claude --headless` (caminho A) — DESBLOQUEADO em v2.1.85

Claude Code CLI suporta:
- `claude -p "prompt"` (print mode, headless)
- `--output-format=json` ou `--output-format=stream-json`
- `--allowedTools` / `--disallowedTools`
- `--permission-mode bypassPermissions` (auto-approve tool calls)
- **NOVO 2.1.85+:** `PreToolUse` hooks com `permissionDecision: "allow"` + `updatedInput.answers` resolvem `AskUserQuestion` em headless.

🟢 **Bloqueador histórico (resolvido 2026-05-06):** `AskUserQuestion` em modo headless **agora pode ser respondido** via PreToolUse hook que devolve `updatedInput.answers`. Antes de v2.1.85 isso não existia — a pergunta ficava pendurada (timeout) ou o harness não tinha como cumprir.

🟢 **Veredicto A (revisado):** funciona out-of-box para E2E do `/pipeline-orchestrator:pipeline`. Implementação em v4.16.0 (Issue #11) — ver adendum acima.

### 2.2 Vitest com mocks (caminho B) — implementado como B3 evoluído

🟢 **Status atual do CC plugin:** test runner via `node:test` (não vitest — escolha feita em v4.9.x para zero-deps). 5 fixtures REAL capturados em v4.10.0 (Wave 3 — Compat Baselines). Mock-mode é o gate primário de PR.

Padrão atual (`tests/compat/runner.cjs`):

```bash
# Mock (sempre, em PR):
node tests/compat/runner.cjs --all --mock

# Real (opt-in, smoke em PR ou full em release):
node tests/compat/runner.cjs --scenario=bugfix-fixture
node tests/compat/runner.cjs --all   # workflow_dispatch only
```

🟢 **Veredicto B (revisado):** funciona. v4.16.0 adiciona a camada real ao lado, sem remover o mock.

### 2.3 Híbrido (caminho C) — REALIZADO em v4.16.0

Combina:
- **Em PR (CI):** vitest com mocks (caminho B3) — rápido, determinístico, bloqueia merge se quebrar.
- **Em PR opt-in:** real-mode smoke (1 cenário) quando `vars.CLAUDE_CLI_AVAILABLE == 'true'`.
- **Em release tag:** real-mode `--all` via workflow_dispatch — valida E2E real antes de tag.

🟢 **Veredicto C (realizado):** caminho recomendado, agora implementado.

---

## 3. Decisão recomendada para Slice 4 v5.0 — HISTÓRICA (referência)

🟢 **Caminho B3 (mocks unitários + smoke manual):** [estrutura abaixo realizada em v4.10.0 + v4.16.0]

### 3.1 Estrutura proposta vs realizada

| Proposta original (2026-04-30) | Realizado (2026-05-06) |
|---|---|
| `package.json` NOVO | NÃO criado — usamos `node:test` (zero-deps) |
| `tests/compat/gate-registry.test.ts` | `tests/unit/compat-baselines.test.js` (cobre observable contract) |
| `tests/compat/yaml-parse.test.ts` | parser inline em `tests/compat/runner.cjs` |
| `tests/compat/snapshots/` | `tests/compat/v4-baseline/scenarios/<name>/expected.yaml` + `mock-output.json` |
| `tests/e2e-smoke/full-pipeline-real-claude.md` | `tests/unit/compat-runner-real.test.js` + workflow real-branch |
| `.github/workflows/compat.yml` | `.github/workflows/compat-regression.yml` (2 jobs: mock + real) |

### 3.2 GitHub Action atual

Ver `.github/workflows/compat-regression.yml`. Dois jobs:
- `compat-regression-mock` — sempre roda; gate de PR.
- `compat-regression-real` — `if: vars.CLAUDE_CLI_AVAILABLE == 'true'`; smoke em PR (`--scenario=bugfix-fixture`), `--all` em `workflow_dispatch`.

### 3.3 Smoke manual (pre-release)

Ainda recomendado antes de cada `v5.0.0-rc.N`, mesmo com real-mode em CI:

```
/pipeline-orchestrator:pipeline "fix typo in README"
```

Verificar gates corretos + final decision GO. Documentar em `docs/release-checklist.md` (ainda a criar).

---

## 4. Caminho complementar (futuro): nightly drift detection

Backlog v4.17.x+: GitHub Action cron diário que roda `--all` real-mode contra `bugfix-fixture` (ou todos os 5) e abre Issue automaticamente se hook contract drift detectado (mock passa, real falha). Não bloqueia v5.0.

---

## 5. DoD do Slice 4 (calibrado v4.16.0)

- [x] `tests/compat/runner.cjs` com mock + real modes
- [x] `tests/compat/v4-baseline/scenarios/` com 5 fixtures REAL (graduados em v4.10.0)
- [x] `tests/compat/v4-baseline/scenarios/spec-fixture/` TEMPLATE (graduação futura)
- [x] `.github/workflows/compat-regression.yml` rodando em PR (mock sempre + real opt-in)
- [x] `tests/compat/auto-answer-hook.cjs` para satisfazer AskUserQuestion em headless
- [x] `tests/compat/v4-baseline/answers-overrides.json` para overrides por header
- [x] `tests/unit/compat-runner-real.test.js` com 8 cenários hook + 1 cenário runner real
- [ ] `docs/release-checklist.md` documenta smoke manual (pendente, v4.17.x+)
- [ ] Nightly drift-detection job (pendente, v4.17.x+)

**Estimativa real:** ~1 dia (Issue #11 v4.16.0) para o último 5% — o trabalho pesado já estava feito em v4.10.0.

---

## 6. Veredicto

🟢 **PASS.** O cenário BDD pediu "claude --headless funciona ou design alternativo via mocks". Resposta atual: **AMBOS funcionam** — mocks em B3 (gate de PR) + claude --headless via auto-answer-hook (smoke + release gate). O bloqueador histórico de `AskUserQuestion` foi resolvido upstream em Claude Code v2.1.85; aplicamos a solução em v4.16.0 sem precisar do hipotético `--ci-auto-confirm`.

✅ **Histórico de gates:**
- 2026-04-30: 🟠 PARTIAL PASS — mocks viáveis, headless bloqueado.
- 2026-05-06: 🟢 PASS — headless desbloqueado por v2.1.85; opção C (híbrido) realizada.
