# Design: hotfix-fixture + Capture Protocol

**Date:** 2026-05-03
**Author:** pipeline-controller (lean-inline) + dono do plugin via brainstorming
**Status:** Approved — pending implementation
**Scope:** Slice 4 (compat regression) — fechar lacuna parcial entre 4 fixtures atuais e 5 prescritos pelo Critério 3 do §12.8.3.

---

## Context

Sessão anterior (2026-05-03 02:00–02:05 UTC) entregou 4 fixtures estruturais (`bugfix-fixture`, `feature-fixture`, `audit-fixture`, `ux-fixture`), todos marcados `baseline_method: TEMPLATE`. Faltam:

1. Quinto fixture (`hotfix-fixture`) — variação de bugfix em modo emergência, conforme HOTFIX Mode descrito em `commands/pipeline.md`.
2. Captura de baselines reais — adiada por decisão do dono ("deixa isso que vemos no decorrer das execuções reais"). Em vez de capturar agora, registrar **protocolo executável** para quando execuções reais acontecerem, evitando que o fluxo precise ser redescoberto.

Wall-clock measurement (Critério 4) também adiado — depende dos baselines reais existirem.

## Goals

- `hotfix-fixture` existe com `input.md` realista e `expected.yaml` template diferenciado de bugfix-fixture nos campos que HOTFIX Mode altera.
- `tests/compat/README.md` ganha seção de protocolo de captura — 5 passos por fixture, validação após cada captura, validação final dos 5.
- Smoke test do runner pós-criação confirma 5 fixtures detectados, todos SKIPPED, exit 1 com warning "NO REAL VALIDATION" (CI continua bloqueando merge corretamente).

## Non-Goals

- Capturar baselines reais agora.
- Implementar `scripts/capture-baseline.cjs` (script semi-automático com `claude --headless`) — adiado até dor justificar.
- Medir wall-clock — depende de baselines reais.
- Modificar runner.cjs — interface atual já trata fixtures novos sem mudança.

## Design

### Componente 1: `tests/compat/v4-baseline/scenarios/hotfix-fixture/`

Dois arquivos.

**`input.md`** — cenário realista de incidente de produção. Inclui sinais que o classifier deve reconhecer como severidade Critical sem flag manual:

- Palavra explícita "URGENTE"
- Indicador temporal ("90 minutos para market open")
- Impacto absoluto ("todos os usuários ativos")
- Localização cirúrgica do bug ("`auth/session.js:42`")
- Justificativa de bypass ("sem tempo para slice plan completo")

**`expected.yaml`** — adaptado de bugfix-fixture com diferenças HOTFIX (per `commands/pipeline.md` HOTFIX Mode table):

| Campo | bugfix-fixture | hotfix-fixture |
|---|---|---|
| `classification.complexity` | MEDIA | **COMPLEXA forçado** |
| `classification.mode` (novo) | n/a | **`hotfix`** |
| `gates_triggered` | INFO_GATE_BLOCKED, TDD_APPROVAL, ADVERSARIAL_GATE_MANDATORY, CHECKPOINT_FAIL, FINAL_ADVERSARIAL_GATE, CLOSEOUT_CONFIRM | INFO_GATE_BLOCKED (modo BLOCKER only — só perguntas críticas auth+data), TDD_APPROVAL (mínimo: 1 regression test), ADVERSARIAL_GATE_MANDATORY (2 checklists em vez de 7: auth + injection), CLOSEOUT_CONFIRM. **FINAL_ADVERSARIAL_GATE listado como SKIPPED** (per `commands/pipeline.md` "HOTFIX | Offered — typically declined under emergency time pressure"). **+ pseudo-gate `HOTFIX_CONFIRMATION` registrado em `gate-decisions.jsonl`** representando a 1 pergunta emergency-confirmation per spec — não está no Gate Registry formal, é entrada de auditoria |
| `agents_invoked` | task-orchestrator, sentinel, info-gate, qg-router, pre-tester, executor-controller, executor-implementer-task, ..., final-validator (~16 agentes) | Mesmo conjunto **menos** `adversarial-architecture-critic` e `adversarial-quality-reviewer` (apenas `adversarial-security-scanner` invocado per "2 checklists: auth + injection"); **menos** agentes de regression suite |
| `artifacts_produced` | per-phase markdown files | Mesmos **mais** `HOTFIX_LOG.md` (per `commands/pipeline.md` HOTFIX Logging requirement: "who requested, why, which checklists skipped vs run, timestamp"); **menos** os artefatos de adversarial completo |
| `verdict` | GO | GO |

Marcado `baseline_method: "TEMPLATE — inferred from commands/pipeline.md HOTFIX Mode, not yet validated against real run"`.

### Componente 2: Seção "Protocolo de captura de baseline real" no `tests/compat/README.md`

Inserida entre as seções existentes "Modo mock vs real" e "Limitações conhecidas".

**Conteúdo — 5 passos por fixture:**

1. **Abrir sessão CLI Claude limpa** — sem session lock ativo. Fechar sessões pipeline anteriores se houver.
2. **Invocar pipeline** — copiar `input.md`, colar após `/pipeline-orchestrator:pipeline ` (ou comando específico ex: `/pipeline-orchestrator:bugfix`). Aceitar gates conforme prompt — não pular nada (objetivo é caminho default).
3. **Anotar saída observável** — quando `PIPELINE COMPLETE` block aparecer, copiar 4 campos: `Classification`, `Gates Triggered`, `Agents Invoked`, `Files Modified`/`Artifacts`, `FINAL DECISION`.
4. **Popular `expected.yaml`** — substituir `baseline_method: "TEMPLATE — ..."` por `baseline_method: "captured 2026-MM-DD via dogfooding session <session-id>"`. Atualizar `baseline_captured_at`. Substituir os 4 campos pelas observações.
5. **Salvar `mock-output.json` ao lado** — JSON com a mesma estrutura observável (4 campos), serve para CI rodar `--mock` sem claude CLI.

**Validação após cada captura:**

```bash
node tests/compat/runner.cjs --scenario=<fixture-name> --mock
# Esperado: PASS (não SKIPPED, não DIVERGED).
```

**Validação final dos 5:**

```bash
time node tests/compat/runner.cjs --all --mock
# Esperado: 5 PASS, exit 0, total < 5min.
# Anotar o número real para popular Critério 4 em §12.8.3 do design v5 consolidado.
```

**Notas operacionais:**

- Se um fixture diverge durante captura, o pipeline mudou desde 2026-05-03 — investigar diff antes de aceitar como novo baseline.
- Se algum fixture toma > 90s sozinho, registrar em `expected.yaml` campo `observed_duration_seconds` — pode indicar regressão de performance separada.
- Captura é incremental — 1 fixture por dia funciona; não exige sessão única.

### Componente 3: Atualização de status no spec consolidado

Pequenas edições em `designs/pipeline-orchestrator-v5-consolidated.md`:

- §12.8.3 — Critério 3: "5/5 estruturalmente implementados" (era 4/5).
- §12.2 status table — Slice 4: "🟡 (90% estrutural)" (era 80%); detalhe atualizado.
- §17.3 #10 — entry estendida com sessão 3 (este design + implementação).

## Architecture / Data Flow

Sem novos fluxos. Reusa pipeline já estabelecido:

```
input.md (read by runner)
    ↓
runner.cjs (parser + comparator)
    ↓
expected.yaml (parsed, TEMPLATE detected → SKIPPED)
    ↓
results.json (CI artifact)
    ↓
exit 1 + "NO REAL VALIDATION" warning
```

Quando captura real acontecer:

```
input.md → user copia → CLI claude session
    ↓
PIPELINE COMPLETE block (observado)
    ↓
user popula expected.yaml + mock-output.json
    ↓
runner.cjs (parser + comparator) — mock mode lê mock-output.json
    ↓
PASS (se contrato bate)
```

## Error Handling

Reusa runner.cjs existente. Casos cobertos:

- `expected.yaml` ausente → ERROR + exit 2.
- `mock-output.json` ausente em mock mode → ERROR + mensagem instruindo captura.
- Template detectado → SKIPPED (não engana CI).
- Divergência observada → DIVERGED + diff + exit 1.

## Testing

- Smoke test imediato pós-criação: `node tests/compat/runner.cjs --all --mock` deve listar 5 fixtures, 5 SKIPPED, exit 1.
- Validação manual: comparar `hotfix-fixture/expected.yaml` campos diferenciadores contra HOTFIX Mode table em `commands/pipeline.md` linhas 175-200 — devem bater.
- Sem teste automatizado novo (estrutura é dados, não lógica).

## Risks

- **Hotfix expected inferido pode estar errado** — sem captura real, o `expected.yaml` é hipótese baseada em spec. Quando captura real acontecer, provável que precise ajustar (esperado e aceitável — captura é a hora de validar inferências).
- **Protocolo no README pode ficar desatualizado** se UI do `PIPELINE COMPLETE` mudar — mitigação: protocolo aponta para campos específicos do block, não para layout exato.

## Open Questions

Nenhuma — escopo bem delimitado.

## Implementation Plan (referência futura)

Próximo passo: invocar `superpowers:writing-plans` skill para gerar plano de execução com tarefas atômicas. Esperado: 4-6 tarefas pequenas, todas executáveis em uma sessão de ~15min.
