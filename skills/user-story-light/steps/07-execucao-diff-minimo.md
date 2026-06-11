---
step_number: 7
step_name: "execucao-diff-minimo"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:feature-implementer"
production_writes_allowed: true
expected_inputs:
  - ActionPlan: from_step_5
  - tests_created: from_step_6
  - red_phase_confirmed: from_step_6
expected_outputs:
  - implementation_narrative: string
  - ImplementationReport: object
  - tests_green: boolean
expected_next: 8
gate_required: false
allowed_tools: [Task, Read, Edit, Write, Bash, Grep, Glob]
---

# Step 07 — Execução com diff mínimo (implementação sob regras)

> **Ported 1:1 from Pulsar** `LIGHT_07_Execucao_Diff_Minimo.md`. The gate header, non-invention rule, and prompt body below are preserved verbatim.

## ⛔ GATE: Não executar sem LIGHT_06 (TDD)

**Verificar antes de prosseguir:**
- [ ] Existe artefato de LIGHT_06 (testes criados)?
- [ ] Testes de AC FALHAM (RED) antes da implementação?

**Se não houver artefato de LIGHT_06 → PARAR e executar LIGHT_06_TEST_PRE_IMPL primeiro.**

---

## ⛔ REGRA DE NÃO-INVENÇÃO (OBRIGATÓRIA)

> **Referência:** `.claude/rules/41-no-invention.md`

**PARAR e perguntar** se faltar informação sobre valores, comportamento ou regras.
**NUNCA assumir** valores de cobrança, créditos, paths ou security rules.

---

```text
Agora você pode implementar, mas sob regras rígidas de segurança.

Regras:
- não refatore "por limpeza",
- não altere estilo global da interface,
- não mude contratos de API sem compatibilidade retroativa,
- crie a menor mudança possível (diff mínimo),
- mantenha atomicidade (mudanças pequenas e reversíveis),
- ⛔ NÃO ASSUMA VALORES - pergunte se faltar informação.

Entregue:
1) Um texto fluido explicando exatamente o que você alterou e por quê, referenciando arquivos e pontos do fluxo.
2) Um JSON chamado ImplementationReport com: files_changed, rationale, contract_changes (se houver), tests_run, and “risk_notes”.
```

## Next

→ `steps/08-avaliacao-adversarial.md`.
