---
step_number: 2
step_name: "reproducao-reduzir-ambiguidade"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner"
production_writes_allowed: false
expected_inputs:
  - IntakeNLP: from_step_1
  - initial_hypotheses: from_step_1
expected_outputs:
  - repro_narrative: string
  - ReproPlan: object
expected_next: 3
gate_required: false
allowed_tools: [Task, Read, Grep, Glob]
---

# Step 02 — Reproduzir e reduzir ambiguidade (provar que existe problema)

> **Ported 1:1 from Pulsar** `LIGHT_02_Reproducao_Reduzir_Ambiguidade.md`. The prompt body below is preserved verbatim.

```text
Agora quero que você transforme o relato em um roteiro de reprodução simples, que um usuário leigo consiga executar, e em paralelo um roteiro “técnico leve” para o pseudo-dev verificar.

Você ainda NÃO vai corrigir nada. Você vai focar em reduzir dúvida e criar evidência.

Entregue:
1) Um texto fluido com um “roteiro de teste” em linguagem simples: passos numerados dentro do texto, com variações (ex.: com internet boa e ruim, com cache limpo e sem limpar, logado vs deslogado, usuário novo vs antigo).
2) Um JSON chamado ReproPlan com: repro_steps, variations, expected_signals, failure_signals, and “fast_checks”.

Inclua uma orientação explícita para distinguir sintoma de causa.
Exemplo: “ficou carregando” é sintoma; a causa pode ser rede, cache, contrato de dados, regra de negócio ou permissão.
```

## Next

→ `steps/03-causa-raiz-confirmacao.md`.
