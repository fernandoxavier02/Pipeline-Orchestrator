---
step_number: 04
step_name: "domain-rules"
source: "Pulsar/LIGHT_04_04_DOMAIN_RULES.md"
description: "Light 04: Dominio e regras de negocio"
execution_mode: inline
agent_type: ""
expected_inputs:
  - acceptance_matrix: from_step_03
  - terrain_map: from_step_02
expected_outputs:
  - domain_rules: list
  - ambiguities: list
  - rule_tests_outline: object
expected_next: 5
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Feature Pipeline (Light) - Dominio e regras de negocio (aplicabilidade explicita)

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
Para cada regra de negócio identificada, escreva **testes unitários falhando** que definem o comportamento desejado, incluindo casos de fronteira, conforme `TESTS_IMPLEMENT_LIGHT.md`.

### Como explicar os testes (para aprovação de quem não é dev)
Explique as regras como promessas simples do produto, por exemplo:
- “O app nunca deve aceitar valor negativo.”
- “O app não pode criar itens duplicados.”
E diga quais testes garantem cada promessa.

Tarefa:
1) Entregue uma analise objetiva para "Dominio e regras de negocio (aplicabilidade explicita)".
2) Diga se itens como regras de negocio, fonte da verdade, persistencia, idempotencia e atomicidade se aplicam ou nao aqui, e por que.
3) Liste o proximo passo mais eficiente e barato para reduzir incerteza.

Formato da resposta:
- Achados principais
- Aplica / Nao aplica (dominio/dados/repeticao)
- Proximo passo recomendado

---

**Próximo step:** 05
