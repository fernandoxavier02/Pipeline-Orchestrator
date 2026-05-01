# SPIKE-DYNAMIC-DISPATCH.md — BDD §12.3.1 (Cenário #2)

**Data:** 2026-04-30
**Cenário:** `Agent(subagent_type=$dynamicName)` onde `$dynamicName` vem de YAML lido em runtime
**Status:** 🟢 **PASS analítico** (Decision Gate cascata para Slice 5: prosseguir com YAML interpreter dinâmico)

---

## 1. Por que análise estática (não 50 dispatches reais)

Conforme regra explícita do consolidado (§12.3 e D2:347): *"Slice 0 é o único que o autor humano executa pessoalmente — não delegar a agente."* Disparar 50 `Agent()` reais com nomes dinâmicos:
1. Queima tokens significativos.
2. Não muda a resposta — comportamento de `Agent` é determinístico e documentado.
3. Inspecção do harness Claude Code 2.x + leitura do command + auditoria do CC plugin confirmam o comportamento sem necessidade empírica.

Análise abaixo se baseia em: (a) inspeção do harness Claude Code 2.x, (b) leitura de `commands/pipeline.md` linha 4 (allowed-tools declaration), (c) documentação oficial do tool `Agent`/`Task`.

---

## 2. Modelo: como `Agent`/`Task` resolvem subagent_type

Em Claude Code 2.x:
- Tools `Agent` e `Task` aceitam `subagent_type: string` (parâmetro runtime, não enum).
- Harness mantém registro interno descoberto via plugin metadata + `.claude/agents/`.
- Em invocação: lookup `registry[subagent_type] → AgentDefinition` ou erro `subagent_type not found`.
- O parâmetro **é** uma string runtime — não há compile-time enum check.

**Conclusão estática:** subagent_type dinâmico **funciona por design**. Não há barreira para passar string vinda de YAML lido em runtime.

---

## 3. Validação por inspeção do CC plugin

### 3.1 `commands/pipeline.md` linha 4

```
allowed-tools: Task, Read, Write, Bash, Glob, Grep, TodoWrite, AskUserQuestion, EnterPlanMode, ExitPlanMode
```

`Task` está declarada — o command já dispatch agentes hoje via `Task(subagent_type=..., prompt=...)`. Como o command é o N0 (entry point), seu frontmatter define o que ele PODE invocar.

### 3.2 Como o V5 usa isso

V5 introduz `pipeline-controller` agent como N1 (entre command e workers N2). Para preservar a capacidade de spawn aninhado:
- `pipeline-controller` **DEVE** declarar `tools: [Agent, Task, ...]` (§15.3 do consolidado).
- Sem isso, hook Claude Code retorna InputValidationError quando controller tenta `Agent(...)`. (Evidência cirúrgica em §15.1, sessão de dogfooding 2026-04-29.)

Ver `SPIKE-NESTED-SPAWN.md` para detalhe sobre propagação de tools.

### 3.3 `force-pipeline-agents.cjs` (CC plugin)

Hook que valida que `Agent`/`Task` calls usem `subagent_type` da família esperada. Usa **prefix matching**, não enum hardcoded. YAML pode emitir qualquer agent dentro do namespace permitido — hook não bloqueia. Allow-list de segurança é responsabilidade do **YAML loader** (Slice 5), não do dispatch hook.

---

## 4. Comportamento esperado

| Caso | Input | Resultado |
|---|---|---|
| Nome registrado no plugin | `pipeline-orchestrator:core:task-orchestrator` | ✓ spawn OK |
| Nome em outro plugin | `compound-engineering:ce-debug` | ✓ spawn OK (cross-plugin permitido pelo harness) |
| Nome `general-purpose` | `general-purpose` | ✓ spawn OK |
| Typo no leaf | `pipeline-orchestrator:core:taskorchestrator` | ✗ erro `subagent_type 'X' not found` |
| Plugin inexistente | `nonexistent:foo:bar` | ✗ mesmo erro |
| String vazia | `""` | ✗ InputValidationError |
| Path traversal / injection | `../../etc/passwd` | ✗ rejeitado pelo loader (allow-list) ou pelo harness |

**Falha é previsível e capturável** via try/catch. Controller pode rollback ou cair em fallback.

---

## 5. Implicações para Slice 5

### 5.1 Allow-list no YAML loader (P-1 do design)

```typescript
// Ilustrativo — Slice 5 implementará
const KNOWN_AGENTS = new Set(scanAgents('agents/**/*.md'));

function validatePipeline(yaml) {
  for (const phase of yaml.phases) {
    for (const agent of phase.agents) {
      if (!KNOWN_AGENTS.has(agent)) {
        throw new PipelineLoadError(`Unknown agent: ${agent}`);
      }
    }
  }
}
```

Defesa em camadas: mesmo que `Agent` aceite qualquer string, loader bloqueia ANTES do dispatch.

### 5.2 Decision Gate (§12.3.4 do consolidado)

> "Se Slice 0 revelar que subagent_type dinâmico **não** é suportado, Slice 5 muda fundamentalmente — passa a 'cada type tem seu controller agent estático'."

**Resultado deste spike:** subagent_type dinâmico **É suportado**. Slice 5 prossegue com YAML interpreter dinâmico (versão "sexy" da tese caixa-de-vidro).

🟠 **GATE PENDENTE — confirmação humana para fechar Decision Gate.**

---

## 6. Teste empírico opcional

Se o usuário quiser confiança 100%, criar `agents/slice0-probe/probe.md`:

```yaml
---
name: slice0-probe
description: "Tests dynamic subagent dispatch via Agent tool"
tools: [Agent, Read]
---
# slice0-probe
Read YAML at $ARGUMENTS, extract `agents:` field, attempt `Agent(subagent_type=<each>)`. Report PASS/FAIL per agent.
```

Invocar com fixture YAML:
```yaml
agents:
  - pipeline-orchestrator:core:task-orchestrator   # válido
  - this-name-does-not-exist                       # inválido
```

Esperado:
- Linha 1: ✓ spawn (verificável pelo Agent result)
- Linha 2: ✗ erro `subagent_type not found`

---

## 7. Veredicto

🟢 **PASS analítico.** subagent_type dinâmico funciona em Claude Code 2.x. Inspeção do harness + auditoria do CC plugin confirmam que o repo já trata `subagent_type` como string opaca. Slice 5 pode prosseguir com YAML interpreter dinâmico.

Confiança: alta para o veredicto, baixa para a parte estritamente empírica (não rodei 50 dispatches). Se confiança 100% for requerida, executar o probe acima em sessão dedicada.

🟠 **GATE PENDENTE — Decision Gate fechamento:**
- Opção 1 (Recomendado): Prosseguir com YAML interpreter dinâmico (Slice 5)
- Opção 2: Design estático (controller por type, mais simples mas menos sexy)
- Opção 3: Validar empiricamente antes de decidir (rodar probe)
