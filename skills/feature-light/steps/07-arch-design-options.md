---
step_number: 07
step_name: "arch-design-options"
source: "Pulsar/LIGHT_07_07_ARCH_DESIGN_OPTIONS.md"
description: "Light 07: Opcoes de design e trade-offs"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner"
expected_inputs:
  - data_model: from_step_06
  - ssot_mapping: from_step_05
  - acceptance_matrix: from_step_03
expected_outputs:
  - design_options: list
  - chosen_architecture: object
  - trade_offs: object
  - askuserquestion_response: string
  - gate_decision: "approved | revise | abort"
expected_next: 8
gate_required: true
gate_name: "architecture-choice"
allowed_tools: [Read, Grep, Glob, AskUserQuestion]
---

# Feature Pipeline (Light) - Opcoes de design/arquitetura e trade-offs

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
1) Entregue uma analise objetiva para "Opcoes de design/arquitetura e trade-offs".
2) Diga se itens como regras de negocio, fonte da verdade, persistencia, idempotencia e atomicidade se aplicam ou nao aqui, e por que.
3) Liste o proximo passo mais eficiente e barato para reduzir incerteza.

Formato da resposta:
- Achados principais
- Aplica / Nao aplica (dominio/dados/repeticao)
- Proximo passo recomendado

---

**Próximo step:** 08
