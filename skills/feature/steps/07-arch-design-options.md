---
step_number: 7
step_name: "arch-design-options"
execution_mode: subagent
agent_type: "feature-vertical-slice-planner"
expected_inputs:
  - domain: from_step_4
  - ssot: from_step_5
  - schema: from_step_6
expected_outputs:
  - options: [{ approach, pros, cons, recommended: bool }]
  - chosen_approach: { name, rationale }
expected_next: 8
gate_required: true
gate_name: "architecture-choice"
allowed_tools: [Read, Grep, Glob, AskUserQuestion]
---

# Step 07 — Architecture Design Options (GATE)

> **Posição no Pipeline:** Passo 7 — Segundo gate. Apresentar 2-3 opções com trade-offs e travar escolha com user.
> **Objetivo:** Não pular para implementação sem comparar abordagens; definir `chosen_approach` que vira input dos Steps 08 e 09.

## Heavy mode prompt

Você é o `feature-vertical-slice-planner`. Faça análise profunda focada em "Opções de design arquitetural", mantendo governança e impacto mínimo.

**Contexto:**
- Domain rules (Step 04), SSOT (Step 05), schema (Step 06).
- Restrições: preservar arquitetura existente; mudanças mínimas; SOLID/KISS/DRY/YAGNI.

**Tarefas obrigatórias:**
1. Gerar 2-3 abordagens distintas para implementar a feature (não 2 variações da mesma — abordagens estruturalmente diferentes).
2. Para cada: descrição arquitetural, prós, contras, complexidade, risco, custo de manutenção.
3. Marcar 1 como **recomendada**, justificando vs alternativas.
4. Avaliar impacto em: testabilidade, performance, segurança, observabilidade, evolução futura.
5. Mapear quais módulos/arquivos cada opção tocaria (estimativa).
6. Identificar dependências externas novas que cada opção introduziria.

**Regras:**
- Não implementar.
- Declare "EVIDÊNCIA" (padrões existentes no repo) vs "ASSUNÇÃO".
- Não inventar 3ª opção só pra ter 3 — se 2 cobrem o espaço, usar 2.

**Formato da resposta:**
- Resumo de cada opção (3-5 linhas)
- Tabela `Opção | Prós | Contras | Complexidade | Risco`
- Recomendação + justificativa
- Trade-off chave
- Perguntas para o gate

## Light mode prompt

**Contexto:**
- Domain + SSOT + schema curto (Steps 04-06).

**Tarefa:**
1. Apresentar 2 opções rápidas (A e B), 1-2 frases cada.
2. Recomendar uma + justificar em 1 frase.
3. Listar trade-off chave entre elas.

**Sinal de migração para Heavy:** se aparecer 3ª opção viável ou trade-off arriscado (performance, security, escalabilidade) → migre.

**Formato:**
- Opção A (1-2 linhas)
- Opção B (1-2 linhas)
- Recomendação + trade-off chave
- Próximo passo (gate)

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/07-feature-arch-options.md`:

- `options`: lista estruturada
- `recommended`: nome + razão curta
- `chosen_approach`: preenchido após gate

## GATE: architecture-choice

Após apresentar 2-3 opções com trade-offs, controller invoca AskUserQuestion:

```yaml
AskUserQuestion(
  questions: [{
    question: "Qual abordagem implementar?",
    header: "Architecture",
    multiSelect: false,
    options: [
      { label: "<Opção A — Recomendada por <razão>>", description: "Prós: ... Contras: ..." },
      { label: "<Opção B>", description: "Prós: ... Contras: ..." },
      { label: "<Opção C>", description: "Prós: ... Contras: ..." }
    ]
  }]
)
```

A escolha define o `chosen_approach` que vira input do Step 08 (Risk Controls) e Step 09 (Implementation Plan).

**Próximo:** Step 08 — Risk Controls.
