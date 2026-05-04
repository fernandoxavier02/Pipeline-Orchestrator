---
step_number: 06
step_name: "data-model-persistence"
source: "Pulsar/LIGHT_06_06_DATA_MODEL_PERSISTENCE.md"
description: "Light 06: Modelo de dados e persistencia"
execution_mode: inline
agent_type: ""
expected_inputs:
  - ssot_mapping: from_step_05
  - domain_rules: from_step_04
expected_outputs:
  - data_model: object
  - persistence_plan: object
expected_next: 7
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Feature Pipeline (Light) - Modelo de dados e persistencia (se aplicavel)

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

## Testes (OBRIGATÓRIO se houver persistência)
Crie **testes de integração** para verificar gravação/recuperação de dados e constraints simples (por exemplo: campo obrigatório, não duplicar), conforme `TESTS_IMPLEMENT_LIGHT.md`.

### Como explicar os testes (para aprovação de quem não é dev)
Explique em linguagem simples:
- “Se eu salvar X e fechar o app, ao voltar, X continua lá.”
- “Se der erro no meio, o app não pode deixar dados ‘pela metade’.”

Tarefa:
1) Entregue uma analise objetiva para "Modelo de dados e persistencia (se aplicavel)".
2) Diga se itens como regras de negocio, fonte da verdade, persistencia, idempotencia e atomicidade se aplicam ou nao aqui, e por que.
3) Liste o proximo passo mais eficiente e barato para reduzir incerteza.

Formato da resposta:
- Achados principais
- Aplica / Nao aplica (dominio/dados/repeticao)
- Proximo passo recomendado

---

**Próximo step:** 07
