---
step_number: 9
step_name: "implementation-plan"
execution_mode: subagent
agent_type: "feature-vertical-slice-planner"
expected_inputs:
  - risk_register: from_step_8
  - chosen_approach: from_step_7
expected_outputs:
  - implementation_plan: { tasks: [...], dod_per_task: [...], risks: [...] }
expected_next: 10
gate_required: true
gate_name: "plan-approval"
allowed_tools: [Read, Grep, Glob, AskUserQuestion]
---

# Step 09 — Implementation Plan (GATE + CONDITIONAL SKIP)

> **Posição no Pipeline:** Passo 9 — Terceiro gate. Pode ser SKIPPED se Phase 1.5 plan-architect já rodou.
> **Objetivo:** Decompor a abordagem escolhida em tasks com DoD por task, ordem, e mapeamento de riscos.

## Conditional skip — Phase 1.5 plan-architect detection

**ANTES de qualquer prompt execution:** controller verifica filesystem:

```bash
ls "$PIPELINE_DOC_PATH/05-plan-architect.md" 2>/dev/null
```

Se arquivo existe AND foi gerado nesta run (timestamp dentro da janela de execução):
1. Marcar step 9 como `skipped_inherited_from: phase_1.5` em `gate-decisions.jsonl`
2. Carregar plan-architect output como `implementation_plan` para step 10
3. Pular gate `plan-approval` (Phase 1.5 já teve user approval)
4. Avançar direto para step 10

Se arquivo NÃO existe:
- Executar normalmente (Heavy mode prompt OU Light mode prompt + gate)

Lógica vive na PROSA deste step file (procedural — controller respeita ANTES de spawnar agent).

## Heavy mode prompt

Você é o `feature-vertical-slice-planner`. Faça análise profunda focada em "Plano de implementação em incrementos", mantendo governança e impacto mínimo.

**Contexto:**
- `chosen_approach` (Step 07), `risk_register` (Step 08), schema (Step 06), domain rules (Step 04).
- Restrições: preservar arquitetura; mudanças mínimas; aditivas preferencialmente.

**Tarefas obrigatórias:**
1. Decompor a abordagem escolhida em tasks pequenas e ordenadas (cada task = 1 vertical slice ou 1 layer).
2. Para cada task: descrição, arquivos prováveis tocados, DoD verificável, dependência de outras tasks.
3. Mapear cada risco do `risk_register` a uma ou mais tasks que o mitigam.
4. Identificar tasks de pure-domain (testáveis com property tests) vs tasks de I/O (precisam integration tests).
5. Estimar incrementos vs big-bang: o plan permite ship parcial? Onde feature flags ajudam?
6. Definir ordem que mantém o sistema sempre buildable + testável (sem deixar buracos no meio).
7. Listar tasks fora do escopo desta entrega (parking lot).

**Regras:**
- Não implementar código.
- Declare "EVIDÊNCIA" vs "ASSUNÇÃO".
- DoD por task tem que ser verificável (não "funciona bem" — "teste X passa").

**Formato da resposta:**
- Tabela `task_id | descrição | arquivos | DoD | dependências | risco mitigado`
- Ordem recomendada + justificativa
- Estratégia de incremento (feature flag, branch, ship parcial)
- Parking lot (fora de escopo)
- Lacunas para o gate

## Light mode prompt

**Contexto:**
- `chosen_approach` + `risk_register` curtos (Steps 07-08).

**Tarefa:**
1. 3-7 tasks ordenadas, cada uma 1 linha + DoD verificável.
2. Marcar dependências óbvias.
3. Onde feature flag se aplica (se aplicar).

**Sinal de migração para Heavy:** se tasks > 7, ou múltiplas dependências cruzadas, ou ship parcial complexo → migre.

**Formato:**
- Tasks (lista 3-7) com DoD
- Dependências
- Feature flag? sim/não
- Próximo passo (gate)

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/09-feature-implementation-plan.md`:

- `implementation_plan.tasks`: lista
- `implementation_plan.dod_per_task`: por task
- `implementation_plan.risks_mapped`: por task

## GATE: plan-approval (skip se conditional skip acima ativou)

```yaml
AskUserQuestion(
  questions: [{
    question: "Aprovar implementation plan antes de TDD pre-impl?",
    header: "Plan",
    multiSelect: false,
    options: [
      { label: "Aprovar (Recomendado)", description: "Plan fixa blueprint. Prosseguir para TDD RED tests." },
      { label: "Revisar plan", description: "Modificar tasks, ordem, ou DoD por task." },
      { label: "Voltar para Step 07", description: "Architecture choice precisa revisão." }
    ]
  }]
)
```

BLOQUEAR step 10 até user aprovar.

**Próximo:** Step 10 — TDD Pre-Impl (GATE: tdd-tests-approval).
