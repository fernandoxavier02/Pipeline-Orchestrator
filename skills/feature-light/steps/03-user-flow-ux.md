---
step_number: 03
step_name: "user-flow-ux"
source: "Pulsar/LIGHT_03_03_USER_FLOW_UX.md"
description: "Light 03: Fluxo do usuario e UX mobile-first"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner"
expected_inputs:
  - intent_doc: from_step_01
  - terrain_map: from_step_02
expected_outputs:
  - user_flow: object
  - acceptance_matrix: object
  - askuserquestion_response: string
  - gate_decision: "approved | revise | abort"
expected_next: 4
gate_required: true
gate_name: "acceptance-matrix-approval"
allowed_tools: [Read, Grep, Glob, AskUserQuestion]
---

# Feature Pipeline (Light) - Fluxo do usuario e UX (mobile-first quando aplicavel)

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

## Testes (OBRIGATÓRIO neste passo)
Antes de qualquer implementação, transforme o fluxo do usuário em **critérios de aceitação** no formato *Dado/Quando/Então* e **crie testes de aceitação** (ou cenários BDD em Markdown/Gherkin) seguindo `TESTS_IMPLEMENT_LIGHT.md`.

### Como explicar os testes (para aprovação de quem não é dev)
Explique cada cenário como se fosse para um usuário final:
- Use frases simples: **“Quando eu faço X, o app deve mostrar Y.”**
- Diga **o que o teste protege** (ex.: “evita que o app mostre informação errada”).
- Evite termos como “mock”, “stub”, “unit test”. Se precisar, descreva como: “vamos simular a internet/servidor para o teste ser confiável”.

Tarefa:
1) Entregue uma analise objetiva para "Fluxo do usuario e UX (mobile-first quando aplicavel)".
2) Diga se itens como regras de negocio, fonte da verdade, persistencia, idempotencia e atomicidade se aplicam ou nao aqui, e por que.
3) Liste o proximo passo mais eficiente e barato para reduzir incerteza.

Formato da resposta:
- Achados principais
- Aplica / Nao aplica (dominio/dados/repeticao)
- Proximo passo recomendado

---

**Próximo step:** 04
