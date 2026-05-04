---
step_number: 01
step_name: "intent-scope"
source: "Pulsar/HEAVY_01_01_INTENT_SCOPE.md"
description: "Heavy 01: Intencao, valor e limites de escopo"
execution_mode: inline
agent_type: ""
expected_inputs:
  - feature_request: from_user
  - business_value: from_user
  - user_story: from_user
  - acceptance_criteria: from_user
expected_outputs:
  - intent_doc: object
  - scope_boundaries: object
  - applicability_assessment: object
  - evidence_vs_assumption: list
expected_next: 2
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Feature Pipeline (Heavy) - Intencao, valor e limites de escopo

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

Voce e meu arquiteto/engenheiro senior. Faca uma analise profunda focada em "Intencao, valor e limites de escopo", mantendo governanca e impacto minimo.

Contexto da feature:
- Objetivo de negocio: [ ]
- User story principal: [ ]
- Criterios de aceite (DoD): [3-8 itens]
- Escopo (entra): [ ]
- Fora de escopo: [ ]
- Restricoes: preservar arquitetura; preservar estilo/UI; mudancas minimas; evitar alteracoes desnecessarias.

Tarefas obrigatorias:
1) Analise "Intencao, valor e limites de escopo" em detalhe, apontando decisoes tecnicas e riscos.
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

**Próximo step:** 02
