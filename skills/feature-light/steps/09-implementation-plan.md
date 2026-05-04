---
step_number: 09
step_name: "implementation-plan"
source: "Pulsar/LIGHT_09_09_IMPLEMENTATION_PLAN.md"
description: "Light 09: Plano de implementacao em incrementos"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner"
expected_inputs:
  - chosen_architecture: from_step_07
  - risk_register: from_step_08
  - acceptance_matrix: from_step_03
expected_outputs:
  - implementation_plan: object
  - increments: list
  - askuserquestion_response: string
  - gate_decision: "approved | revise | abort"
expected_next: 10
gate_required: true
gate_name: "plan-approval"
allowed_tools: [Read, Grep, Glob, AskUserQuestion]
---

# Feature Pipeline (Light) - Plano de implementacao em incrementos

## Quando usar
Use quando a feature/melhoria e pequena a media, com risco controlado, e voce quer velocidade com disciplina.

## Regra
Nao implemente codigo nesta etapa (a menos que eu peça explicitamente). Se durante a analise surgirem persistencia sensivel,
regras de negocio complexas, integracao critica, concorrencia ou grande impacto em UX/contratos, sinalize e recomende migrar para o Heavy.

---

## Prompt

Contexto da feature:
- Feature/melhoria: [descreva em 2-5 linhas]
- Valor para o usuario/negocio: [1-2 linhas]
- Onde imagino que entra: [tela/rota/service/job]
- Restricoes: mudancas minimas; preservar padroes; evitar refatoracao ampla; manter estilo/UI.

Tarefa:
1) Entregue uma analise objetiva para "Plano de implementacao em incrementos".
2) Diga se itens como regras de negocio, fonte da verdade, persistencia, idempotencia e atomicidade se aplicam ou nao aqui, e por que.
3) Liste o proximo passo mais eficiente e barato para reduzir incerteza.

Formato da resposta:
- Achados principais
- Aplica / Nao aplica (dominio/dados/repeticao)
- Proximo passo recomendado

---

**Próximo step:** 10
