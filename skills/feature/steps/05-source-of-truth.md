---
step_number: 5
step_name: "source-of-truth"
execution_mode: inline
agent_type: ""
expected_inputs:
  - domain_rules: from_step_4
expected_outputs:
  - ssot_mapping: { state: source, sync_strategy, divergence_risks, mitigations }
expected_next: 6
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Step 05 — Source of Truth

> **Posição no Pipeline:** Passo 5 — Após regras de domínio. Define onde mora a verdade de cada estado e como evitar divergência.
> **Objetivo:** Mapear SSOT (Single Source of Truth) por estado relevante; definir estratégia de sincronização UI ↔ backend ↔ cache.

## Heavy mode prompt

Você é meu arquiteto/engenheiro sênior. Faça análise profunda focada em "Source of Truth e invariantes de sincronização", mantendo governança e impacto mínimo.

**Contexto:**
- Domain rules (Step 04), em especial `rules_needing_ssot`.
- Restrições: preservar arquitetura; mudanças mínimas.

**Tarefas obrigatórias:**
1. Para cada estado relevante na feature, identificar a fonte da verdade (backend, banco, cache, derivado de outro).
2. Mapear cópias/réplicas existentes (UI state, cache local, indexes, etc).
3. Definir estratégia de sincronização: pull, push, event-driven, optimistic, pessimistic.
4. Listar riscos de divergência (UI mostra X, backend tem Y) + mitigações concretas (refresh, versioning, ETag, last-write-wins).
5. Avaliar concorrência: 2 clientes editando ao mesmo tempo — quem ganha? Como detectar conflito?
6. Identificar invariantes globais que dependem da SSOT (ex.: "saldo nunca negativo" precisa SSOT no backend, não no client).

**Regras:**
- Não implementar código.
- Declare "EVIDÊNCIA" (existing patterns no repo) vs "ASSUNÇÃO".
- Se SSOT não estiver clara, exija definição antes de prosseguir.

**Formato da resposta:**
- Tabela `estado | SSOT | cópias | sync strategy | risco de divergência | mitigação`
- Riscos de concorrência + estratégia
- Invariantes globais dependentes de SSOT
- Perguntas para fechar lacunas

## Light mode prompt

**Contexto:**
- Domain rules curto do Step 04.

**Tarefa:**
1. Para cada estado da feature: SSOT em 1 frase.
2. Mencionar 1 cópia/cache se houver, e como evitar divergência.
3. Concorrência: relevante? Se não, justificar.

**Sinal de migração para Heavy:** múltiplos estados com SSOT distribuída, concorrência crítica, ou invariantes globais sensíveis → migre.

**Formato:**
- SSOT por estado (lista curta)
- Estratégia de sync (1 linha por estado)
- Próximo passo

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/05-feature-source-of-truth.md`:

- `ssot_mapping`: tabela como acima
- `concurrency_strategy`: prosa curta
- `global_invariants`: lista

**Próximo:** Step 06 — Data Model + Persistence.
