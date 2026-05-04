---
step_number: 04
step_name: "domain-rules"
source: "Pulsar/HEAVY_04_04_DOMAIN_RULES.md"
description: "Heavy 04: Dominio e regras de negocio"
execution_mode: inline
agent_type: ""
expected_inputs:
  - acceptance_matrix: from_step_03
  - terrain_map: from_step_02
expected_outputs:
  - domain_rules: list
  - ambiguities: list
  - rule_tests_outline: object
  - property_tests_plan: list
expected_next: 5
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Feature Pipeline (Heavy) - Dominio e regras de negocio (aplicabilidade explicita)

## Quando usar
Use quando a feature/melhoria tem impacto relevante (dominio, dados, integracoes, multiplos fluxos, contratos, jobs, mobile),
ou quando voce quer maxima previsibilidade antes de implementar.

## Regras
- Nao implemente codigo nesta etapa.
- Nao proponha refatoracao ampla como pre-requisito.
- Declare "EVIDENCIA" (do repo) vs "ASSUNCAO" (inferida).
- Se faltar informacao, diga exatamente como confirmar.

---

## Prompt

Voce e meu arquiteto/engenheiro senior. Faca uma analise profunda focada em "Dominio e regras de negocio (aplicabilidade explicita)", mantendo governanca e impacto minimo.

Contexto da feature:
- Objetivo de negocio: [ ]
- User story principal: [ ]
- Criterios de aceite (DoD): [3-8 itens]
- Escopo (entra): [ ]
- Fora de escopo: [ ]
- Restricoes: preservar arquitetura; preservar estilo/UI; mudancas minimas; evitar alteracoes desnecessarias.

Tarefas obrigatorias:
1) Analise "Dominio e regras de negocio (aplicabilidade explicita)" em detalhe, apontando decisoes tecnicas e riscos.
2) Declare explicitamente se regras de negocio se aplicam; se sim, liste-as e marque ambiguidades.
3) Defina a fonte da verdade do estado envolvido (se houver) e como evitar estados divergentes (UI vs backend vs cache).
4) Avalie persistencia (se houver): entidades, chaves, invariantes, e risco de registros orfaos/incompletos.
5) Avalie execucao repetida: double click, retries, jobs duplicados. Se relevante, exija idempotencia.
6) Avalie multi-etapas: se falhar no meio, ha estado intermediario? Se relevante, exija atomicidade (transacao/flags/compensacao).
7) Entregue recomendacoes proporcionais ao risco (minimo necessario, sem overengineering).

Formato da resposta (obrigatorio):
- Resumo executivo
- Achados tecnicos (com EVIDENCIA vs ASSUNCAO)
- Dominio/fonte da verdade/persistencia (se aplicavel)
- Idempotencia/atomicidade/concorrencia (se aplicavel)
- Perguntas minimas para fechar lacunas
- Proximo passo recomendado

---

**Próximo step:** 05
