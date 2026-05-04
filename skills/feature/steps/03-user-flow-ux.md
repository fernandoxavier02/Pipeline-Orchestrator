---
step_number: 3
step_name: "user-flow-ux"
execution_mode: subagent
agent_type: "feature-vertical-slice-planner"
expected_inputs:
  - intent_doc: from_step_1
  - terrain: from_step_2
expected_outputs:
  - acceptance_matrix: { scenarios: [...], priorities: [...] }
  - ui_states_map: { screens: [...], states: [...] }
expected_next: 4
gate_required: true
gate_name: "acceptance-matrix-approval"
allowed_tools: [Read, Grep, Glob, AskUserQuestion]
---

# Step 03 — User Flow + UX (GATE)

> **Posição no Pipeline:** Passo 3 — Primeiro gate. Fixa contrato de cenários antes de qualquer modelagem de domínio.
> **Objetivo:** Traduzir user story em fluxo navegável + matriz de cenários (mobile-first quando aplicável) e travar contrato com user.

## Heavy mode prompt

Você é o `feature-vertical-slice-planner`. Faça análise profunda focada em "Fluxo do usuário e UX (mobile-first quando aplicável)", mantendo governança e impacto mínimo.

**Contexto:**
- Intent doc: [Step 01]
- Terrain map: [Step 02]
- Restrições: preservar arquitetura; preservar estilo/UI; mudanças mínimas.

**Tarefas obrigatórias:**
1. Mapear fluxo do usuário ponta-a-ponta (entrada, decisões, saída).
2. Listar telas/estados envolvidos + transições.
3. Construir matriz de cenários: variações de entrada (válidas/inválidas/limites) × estados do sistema.
4. Priorizar cenários: obrigatórios na primeira entrega vs adiados.
5. Identificar implicações de UX mobile-first (touch targets, offline, latência, gestos).
6. Definir critérios de aceite no formato Dado/Quando/Então para cada cenário priorizado.
7. Apontar regras de negócio implícitas no fluxo + ambiguidades a resolver.

**Regras:**
- Não implemente código.
- Declare "EVIDÊNCIA" (do repo/intent) vs "ASSUNÇÃO" (inferida).
- Se faltar informação, diga exatamente como confirmar antes do gate.

**Formato da resposta:**
- Resumo executivo do fluxo
- Diagrama (ASCII ou prosa estruturada) de telas/estados
- Matriz de cenários com prioridades
- Critérios de aceite (Dado/Quando/Então)
- Implicações UX
- Perguntas mínimas para o gate

## Light mode prompt

**Contexto:**
- Intent doc + terrain do Step 01/02.
- Restrições: mudanças mínimas; preservar UI/UX existente.

**Tarefa:**
1. Fluxo curto: 3-5 passos do usuário.
2. Matriz mínima: 1-2 cenários happy + 1 erro principal.
3. Critérios de aceite simples no formato Dado/Quando/Então (max 5).
4. Como explicar para usuário não-dev: cada cenário em 1 frase ("Quando eu faço X, o app deve mostrar Y") + o que o teste protege.

**Sinal de migração para Heavy:** se surgirem múltiplos fluxos, mobile-specifics complexos, regras implícitas densas → sinalize Heavy.

**Formato:**
- Fluxo (3-5 passos)
- Matriz mínima
- Critérios em Dado/Quando/Então
- Próximo passo

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/03-feature-user-flow-ux.md`:

- `acceptance_matrix`: lista de cenários com prioridade (P0/P1/P2)
- `ui_states_map`: telas/estados/transições
- `acceptance_criteria_gherkin`: lista de Dado/Quando/Então

## GATE: acceptance-matrix-approval

Antes de prosseguir para Step 04, controller DEVE invocar AskUserQuestion:

```yaml
AskUserQuestion(
  questions: [{
    question: "Aprovar matriz de cenários antes de prosseguir para Domain Rules?",
    header: "Acceptance",
    multiSelect: false,
    options: [
      { label: "Aprovar (Recomendado)", description: "Matriz fixa contrato. Prosseguir para Domain Rules." },
      { label: "Ajustar matriz", description: "Modificar cenários/prioridades antes de fixar." },
      { label: "Voltar para Step 02", description: "Terrain ou intent precisam de revisão." }
    ]
  }]
)
```

BLOQUEAR step 4 até user aprovar.

**Próximo:** Step 04 — Domain Rules.
