---
step_number: 12
step_name: "testing-validation"
source: "Pulsar/LIGHT_12_11_TESTING_VALIDATION.md"
description: "Light 11: Testes, validacao e checks de sanidade"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:feature-integration-validator"
expected_inputs:
  - code_diff: from_step_11
  - test_files: from_step_10
expected_outputs:
  - test_results: object
  - sanity_report: object
expected_next: 13
gate_required: false
allowed_tools: [Read, Grep, Glob, Bash]
---

# Feature Pipeline (Light) - Testes, validacao e checks de sanidade

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

## Testes (OBRIGATÓRIO)
Execute toda a suíte relevante (unitário, integração e E2E, quando existir) conforme `TESTS_IMPLEMENT_LIGHT.md`. Se algo falhar, **pare** e corrija antes de avançar.

### Como reportar os testes (para aprovação de quem não é dev)
Explique o resultado como um checklist simples:
- “Teste 1 (fluxo principal): passou/failed — isso garante que…”
- “Teste 2 (erro/sem internet): passou/failed — isso garante que…”
- “Teste 3 (não duplicar): passou/failed — isso garante que…”
Evite jargão; foque em **o que o usuário ganha** e **o que foi confirmado**.

Tarefa:
1) Entregue uma analise objetiva para "Testes, validacao e checks de sanidade".
2) Diga se itens como regras de negocio, fonte da verdade, persistencia, idempotencia e atomicidade se aplicam ou nao aqui, e por que.
3) Liste o proximo passo mais eficiente e barato para reduzir incerteza.

Formato da resposta:
- Achados principais
- Aplica / Nao aplica (dominio/dados/repeticao)
- Proximo passo recomendado

---

**Próximo step:** 13
