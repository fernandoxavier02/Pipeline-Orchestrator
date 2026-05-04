---
step_number: 08
step_name: "risk-controls"
source: "Pulsar/LIGHT_08_08_RISK_CONTROLS.md"
description: "Light 08: Riscos e controles (idempotencia, atomicidade)"
execution_mode: inline
agent_type: ""
expected_inputs:
  - chosen_architecture: from_step_07
  - data_model: from_step_06
expected_outputs:
  - risk_register: list
  - controls_plan: object
expected_next: 9
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Feature Pipeline (Light) - Riscos e controles: idempotencia/atomicidade/concorrrencia (se aplicavel)

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

## Testes (OBRIGATÓRIO quando houver riscos)
Defina testes de **invariantes/propriedades** que mitigam riscos (ex.: não duplicar, valores não negativos, limites), conforme `TESTS_IMPLEMENT_LIGHT.md`.

### Como explicar os testes (para aprovação de quem não é dev)
Explique como garantias para o usuário:
- “Mesmo se eu clicar duas vezes, o app não cria duas vezes.”
- “Mesmo com internet lenta, o app não fica em estado confuso.”

Tarefa:
1) Entregue uma analise objetiva para "Riscos e controles: idempotencia/atomicidade/concorrrencia (se aplicavel)".
2) Diga se itens como regras de negocio, fonte da verdade, persistencia, idempotencia e atomicidade se aplicam ou nao aqui, e por que.
3) Liste o proximo passo mais eficiente e barato para reduzir incerteza.

Formato da resposta:
- Achados principais
- Aplica / Nao aplica (dominio/dados/repeticao)
- Proximo passo recomendado

---

**Próximo step:** 09
