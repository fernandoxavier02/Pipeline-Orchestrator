---
step_number: 1
step_name: "intent-scope"
execution_mode: inline
agent_type: ""
expected_inputs:
  - feature_description: from_user_argument
  - user_story: from_user_argument
  - dod_criteria: from_user_argument
expected_outputs:
  - intent_doc: { business_objective, user_story, dod, scope_in, scope_out, restrictions }
  - tech_findings: { evidence_vs_assumption, domain_applies, ssot_required, idempotency_required, atomicity_required }
  - recommended_next: "step-2-terrain-recon"
expected_next: 2
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Step 01 — Intent + Value + Scope

> **Posição no Pipeline:** Passo 1 — Início. Define escopo antes de qualquer recon ou implementação.
> **Objetivo:** Estabelecer intenção, valor de negócio e limites claros de escopo.

## Heavy mode prompt

Você é meu arquiteto/engenheiro sênior. Faça uma análise profunda focada em "Intenção, valor e limites de escopo", mantendo governança e impacto mínimo.

**Contexto da feature:**
- Objetivo de negócio: [extraído do argumento]
- User story principal: [extraído]
- Critérios de aceite (DoD): [3-8 itens — extraídos]
- Escopo (entra): [extraído]
- Fora de escopo: [extraído]
- Restrições: preservar arquitetura; preservar estilo/UI; mudanças mínimas; evitar alterações desnecessárias.

**Tarefas obrigatórias:**
1. Análise "Intenção, valor e limites de escopo" em detalhe, apontando decisões técnicas e riscos.
2. Declare explicitamente se regras de negócio se aplicam; se sim, liste-as e marque ambiguidades.
3. Defina a fonte da verdade do estado envolvido (se houver) e como evitar estados divergentes (UI vs backend vs cache).
4. Avalie persistência (se houver): entidades, chaves, invariantes, e risco de registros órfãos/incompletos.
5. Avalie execução repetida: double click, retries, jobs duplicados. Se relevante, exija idempotência.
6. Avalie multi-etapas: se falhar no meio, há estado intermediário? Se relevante, exija atomicidade (transação/flags/compensação).
7. Entregue recomendações proporcionais ao risco (mínimo necessário, sem overengineering).

**Regras:**
- Não implemente código nesta etapa.
- Não proponha refatoração ampla como pré-requisito.
- Declare "EVIDÊNCIA" (do repo) vs "ASSUNÇÃO" (inferida).
- Se faltar informação, diga exatamente como confirmar.

**Formato da resposta (obrigatório):**
- Resumo executivo
- Achados técnicos (com EVIDÊNCIA vs ASSUNÇÃO)
- Domínio/fonte da verdade/persistência (se aplicável)
- Idempotência/atomicidade/concorrência (se aplicável)
- Perguntas mínimas para fechar lacunas
- Próximo passo recomendado

## Light mode prompt

**Contexto da feature:**
- Feature/melhoria: [extraído]
- Valor para usuário/negócio: [extraído]
- Onde imagino que entra: [extraído]
- Restrições: mudanças mínimas; preservar padrões; evitar refatoração ampla; manter estilo/UI.

**Tarefa:**
1. Entregue uma análise objetiva para "Intenção, valor e limites de escopo".
2. Diga se itens como regras de negócio, fonte da verdade, persistência, idempotência e atomicidade se aplicam ou não aqui, e por quê.
3. Liste o próximo passo mais eficiente e barato para reduzir incerteza.

**Sinal de migração para Heavy:** se persistência sensível, regras de negócio complexas, integração crítica, concorrência ou grande impacto em UX/contratos surgir, sinalize e recomende migrar para Heavy.

**Formato:**
- Achados principais
- Aplica / Não aplica (domínio/dados/repetição)
- Próximo passo recomendado

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/01-feature-intent-scope.md` com:

- `intent_doc`: parágrafo curto com objetivo + user story + DoD
- `tech_findings`: lista marcada [EVIDÊNCIA] ou [ASSUNÇÃO]
- `domain_applies`: bool + justificativa
- `next_step_recommendation`: prosa curta

**Próximo:** Step 02 — Terrain Recon.
