# Compat Regression Suite (Slice 4)

Garante que `/pipeline-orchestrator:pipeline` continua produzindo o mesmo **contrato observável** em N cenários canônicos. Quebra trava merge.

## Por que existe

Sem este harness, qualquer mudança em `commands/pipeline.md`, em agents core, ou em hooks pode silenciosamente alterar o verdict que usuários veem. Snapshot tests do contrato observável (não da prosa) tornam regressões detectáveis.

Status: 🟡 **PARCIAL** — runner.cjs e CI workflow existem; cenários canônicos estão sendo populados (1 de 5 hoje). Ver `designs/pipeline-orchestrator-v5-consolidated.md` §12.8.3 para os 4 critérios formais de promoção a 🟢.

## Layout

```
tests/compat/
├── README.md                          # este arquivo
├── runner.cjs                         # Node script — roda todos os cenários
└── v4-baseline/
    └── scenarios/
        ├── bugfix-fixture/            # 1 cenário implementado
        │   ├── input.md               # task description fed to /pipeline
        │   └── expected.yaml          # contrato observável esperado (4 campos)
        ├── feature-fixture/           # TODO — capturar baseline
        ├── audit-fixture/             # TODO — capturar baseline
        ├── ux-fixture/                # TODO — capturar baseline
        └── hotfix-fixture/            # TODO — capturar baseline
```

## Contrato observável (4 campos — não prosa)

Cada `expected.yaml` declara 4 campos. Tudo o mais (texto literal de prompts, raciocínio intermediário, ordem de mensagens) é **ignorado** pelo runner. Isso permite refatorar agentes sem quebrar testes.

```yaml
classification:
  type: bugfix | feature | audit | ux | userstory
  complexity: SIMPLES | MEDIA | COMPLEXA
  pipeline_variant: bugfix-light | implement-heavy | etc.

gates_triggered:
  # lista ordenada de gates que dispararam, com hardness
  - { gate: INFO_GATE_BLOCKED, hardness: HARD, decision: PASS }
  - { gate: ADVERSARIAL_GATE, hardness: SOFT, decision: PASS }

agents_invoked:
  # lista ordenada (sem timestamps, sem prompts)
  - task-orchestrator
  - information-gate
  - executor-controller
  - sanity-checker
  - final-validator

artifacts_produced:
  # filenames apenas, sem conteúdo
  - PIPELINE_DOC_PATH/01-task-orchestrator.md
  - PIPELINE_DOC_PATH/gate-decisions.jsonl
  - PIPELINE_DOC_PATH/sentinel-state.json

verdict: GO | CONDITIONAL | NO-GO
```

## Como rodar localmente

```bash
# Todos os cenários
node tests/compat/runner.cjs --all

# Um cenário específico
node tests/compat/runner.cjs --scenario=bugfix-fixture

# Modo verbose (mostra diff completo em DIVERGED)
node tests/compat/runner.cjs --all --verbose

# Modo mock (usado quando claude CLI não está disponível, ex: laptop sem login)
node tests/compat/runner.cjs --all --mock
```

Exit codes:

- `0` — todos os cenários PASS
- `1` — pelo menos um DIVERGED ou ERROR
- `2` — erro de configuração (cenário sem expected.yaml, runner sem node, etc.)

## Como adicionar um cenário novo

1. Escolha um nome curto (`{type}-{caso}`, ex: `bugfix-auth-leak`).
2. Crie a pasta `tests/compat/v4-baseline/scenarios/<nome>/`.
3. Escreva `input.md` com a task description (1 parágrafo, igual o que você digitaria após `/pipeline`).
4. **Capture o baseline contra a versão atual** (não invente):
   ```bash
   # Na CLI claude (sessão real):
   /pipeline-orchestrator:pipeline <conteúdo de input.md>
   # Anote os 4 campos do contrato observável
   ```
5. Escreva `expected.yaml` com o que foi observado.
6. Rode `node tests/compat/runner.cjs --scenario=<nome>` e confirme PASS.
7. Commit + PR.

## Performance budget

- Cada cenário: < 60s (mock mode), < 90s (real mode).
- Suite completa (5 cenários): < 5 min total na CI.
- Workflow CI: timeout 6 min com warning em 5 min.

Se um cenário ultrapassar o budget, o runner reporta WARN mas não falha — é responsabilidade do reviewer decidir se aceita o overhead.

## Quebra de compat

Se um cenário diverge do baseline esperado, o runner imprime diff dos 4 campos e exit 1. CI bloqueia o merge. PR template pede:

- **Justificativa:** mudança intencional ou regressão?
- **Se intencional:** atualizar `expected.yaml` no mesmo PR + adicionar nota no CHANGELOG.
- **Se regressão:** corrigir antes de merge.

## Modo mock vs real

**Real:** invoca `claude --headless` localmente / em CI, captura output, parseia. Fidelidade alta. Custo: depende da configuração CI (Claude Code precisa estar instalado e logado).

**Mock:** runner gera output sintético baseado em fixtures pré-calculadas (`scenarios/<nome>/mock-output.json`). Fidelidade média (testa controller logic, não LLM behavior). Útil quando claude CLI não está disponível na CI ou em ambientes air-gapped.

Slice 0 SPIKE-CI-HARNESS.md decidiu: começar com mock, migrar para real se viável.

## Protocolo de captura de baseline real

Quando você (futuro você) tiver tempo de rodar dogfooding, use este protocolo. 5 passos por fixture, ~10min cada.

### Pré-condições

- Sessão CLI Claude limpa — sem session lock pipeline ativo (ver `.pipeline/sessions/`).
- Plugin instalado na versão que você quer baselinar (idealmente a versão alvo de release, ex: 4.5.0).

### Os 5 passos (por fixture)

1. **Abrir sessão CLI Claude limpa**
   - Fechar sessões pipeline anteriores. Verificar `ls .pipeline/sessions/` — se houver `.lock` files, deixar expirar (10min stale threshold) ou deletar manualmente após confirmar nenhum Claude está rodando.

2. **Invocar o pipeline**
   - Abrir o fixture: `cat tests/compat/v4-baseline/scenarios/<fixture-name>/input.md`
   - Copiar o parágrafo da seção "Task description (fed to /pipeline)"
   - Colar após `/pipeline-orchestrator:pipeline ` (ou usar comando específico, ex: `/pipeline-orchestrator:bugfix` para bugfix-fixture; `/pipeline-orchestrator:audit` para audit-fixture)
   - Aceitar gates conforme prompt — **não pular nada**, o objetivo é o caminho default

3. **Anotar saída observável**
   - Quando o `PIPELINE COMPLETE` block aparecer, copiar destes 4 campos:
     - `Classification:` (type + complexity + variant)
     - `Gates Triggered:` (lista com hardness + decision)
     - `Agents Invoked:` (lista ordenada)
     - `Files Modified` ou `Artifacts Produced:` (basenames)
     - `FINAL DECISION:` (verdict)

4. **Popular `expected.yaml`**
   - Substituir `baseline_method: "TEMPLATE — ..."` por:
     ```yaml
     baseline_method: "captured 2026-MM-DD via dogfooding session <session-id>"
     ```
   - Atualizar `baseline_captured_at` para timestamp ISO 8601 atual.
   - Substituir os 4 campos pelas observações reais.
   - Manter `ignore:` e `must_match:` como estão (são regras do runner, não baseline).

5. **Salvar `mock-output.json` ao lado**
   - Criar `tests/compat/v4-baseline/scenarios/<fixture-name>/mock-output.json`
   - Conteúdo: JSON com mesma estrutura observável (4 campos), serve para CI rodar `--mock` sem claude CLI.
   - Exemplo de estrutura mínima:
     ```json
     {
       "classification": { "type": "...", "complexity": "...", "pipeline_variant": "..." },
       "gates_triggered": [ { "gate": "...", "hardness": "...", "decision": "..." } ],
       "agents_invoked": [ "agent-1", "agent-2" ],
       "artifacts_produced": [ "file1.md", "file2.json" ],
       "verdict": "GO"
     }
     ```

### Validação após cada captura

```bash
node tests/compat/runner.cjs --scenario=<fixture-name> --mock
```

Expected: `PASS` (não SKIPPED, não DIVERGED). Se DIVERGED, `expected.yaml` e `mock-output.json` divergem entre si — corrigir antes de prosseguir.

### Validação final dos 5

```bash
time node tests/compat/runner.cjs --all --mock
```

Expected: `5 PASS, exit 0, total < 5min` (budget). Anotar o número real (`Total: Xs`) para popular Critério 4 em `designs/pipeline-orchestrator-v5-consolidated.md` §12.8.3.

### Notas operacionais

- **Captura é incremental** — 1 fixture por dia funciona; não exige sessão única.
- **Se um fixture diverge durante captura:** o pipeline mudou desde 2026-05-03 — investigar diff antes de aceitar como novo baseline. Pode ser regressão real ou mudança intencional.
- **Se algum fixture toma > 90s:** registrar em `expected.yaml` campo `observed_duration_seconds: <N>` — pode indicar regressão de performance separada do contrato observável.
- **Hotfix-fixture é especial** — tem campo `hotfix_assertions:` que NÃO está em `ignore`. O runner verifica essas asserções sempre. Se mudar comportamento HOTFIX (ex: scope expandir para 7 checklists), a asserção falha mesmo se o resto do contrato bate.

## Limitações conhecidas (2026-05-03)

- **1/5 cenários implementados** (bugfix-fixture). 4 restantes precisam de captura de baseline contra v4.5.0 atual via CLI real — não pode ser feito sem dogfooding.
- **Mock mode não está implementado completo** — runner aceita `--mock` mas pula execução; é stub para teste rápido da estrutura. Implementação real depende de captar fixtures de runs reais e armazenar em `mock-output.json`.
- **Branch protection rule não está configurada** no GitHub. O workflow YAML existe e roda, mas o "merge bloqueado" depende de uma config de repositório que precisa ser feita via UI ou `gh api`.
