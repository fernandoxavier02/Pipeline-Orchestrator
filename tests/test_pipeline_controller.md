# Pipeline Controller — BDD Scenarios

Cenários de comportamento esperado para `pipeline-controller` agent. Validação é manual (agent é LLM, não unit-testável). Engineer pode rodar cada cenário via `/pipeline-orchestrator:pipeline <input>` e verificar assertions via `Read` em `.pipeline/docs/`.

## Feature: Phase 0 orchestration

### Scenario: Controller spawna task-orchestrator em Phase 0a

Given /pipeline-orchestrator:pipeline implement foo é invocado
  And session-lock-hook criou .pipeline/sessions/{id}.lock
When controller é spawnado
Then controller DEVE criar .pipeline/docs/Pre-*-action/{slug}/sentinel-state.json
  And sentinel-state.json DEVE conter expected_next: "task-orchestrator"
  And controller DEVE spawnar Agent(pipeline-orchestrator:core:task-orchestrator)

**Validation:** ls .pipeline/docs/Pre-*-action/*/sentinel-state.json && grep task-orchestrator sentinel-state.json

### Scenario: Sentinel checkpoint #1 após task-orchestrator

Given controller recebeu CLASSIFICATION do task-orchestrator
When controller prepara Phase 0b
Then controller DEVE atualizar sentinel-state.json com a CLASSIFICATION completa
  And DEVE setar expected_next: "information-gate" (se não-DIRETO) ou "exit" (se DIRETO)
  And DEVE spawnar Agent(pipeline-orchestrator:core:sentinel, mode: ORCHESTRATOR_VALIDATION)

## Feature: Disk offload de outputs N2

### Scenario: Controller lê apenas manifest, não o output completo

Given task-orchestrator retorna CLASSIFICATION de 500 linhas
When controller recebe o retorno
Then controller DEVE salvar o output completo em .pipeline/artifacts/00-task-orchestrator.json
  And DEVE ler APENAS o manifest (summary estruturado < 1KB) para decisões subsequentes
  And NÃO DEVE manter o output completo em seu contexto

**Validation:** wc -c .pipeline/artifacts/*.json; verificar que contexto do controller não contém texto > 1KB por agent.

## Feature: User gates via AskUserQuestion

### Scenario: Phase 1 proposal confirmation

Given controller completou Phase 0
When controller inicia Phase 1
Then DEVE emitir PIPELINE PROPOSAL box
  And DEVE invocar AskUserQuestion com 3 options: Yes, Adjust, No
  And DEVE aguardar resposta antes de prosseguir

### Scenario: Per-batch adversarial gate (complexity MEDIA/COMPLEXA)

Given batch {N} completou checkpoint-validator com PASS
  And complexity == MEDIA ou COMPLEXA
When controller transita para adversarial gate
Then DEVE invocar AskUserQuestion: "Proceed with adversarial review for Batch {N}?"
  And DEVE aguardar resposta
  And se Skip + domain in [auth, crypto, data-model, payment] → DEVE recusar skip

## Feature: Context exhaustion recovery

### Scenario: Controller hits 85% context → emite checkpoint

Given controller está em Phase 2c batch 3/5
When contexto atinge 85% de uso
Then controller DEVE escrever .pipeline/state/controller-checkpoint.json
  And DEVE retornar PIPELINE PAUSED block para main LLM
  And /pipeline-orchestrator:pipeline continue DEVE retomar de Phase 2c batch 3

**Validation:** simular context heavy com muitos N2 spawns; verificar checkpoint criado.

## Feature: Bypass attempt rejection

### Scenario: Main LLM tenta Edit durante sessão pipeline

Given /pipeline-orchestrator:pipeline está ativo
  And edit-guard-hook está registrado
When main LLM tenta Edit(file_path="src/foo.py", ...)
Then edit-guard-hook DEVE retornar decision: block
  And mensagem DEVE conter "pipeline-controller" e "delete .pipeline/sessions/*.lock"

**Validation:** já coberto em `.claude/hooks/__tests__/edit-guard-hook.test.cjs` (unit test).

---

## Execução dos scenarios

1. Para cada scenario, executar `/pipeline-orchestrator:pipeline <scenario input>` no Claude Code
2. Após conclusão, rodar `Validation` commands
3. Marcar PASS/FAIL em `tests/manual-validation-log.md` (criar se não existe)
4. Consolidar resultados antes de publicar v4.0.0-rc
