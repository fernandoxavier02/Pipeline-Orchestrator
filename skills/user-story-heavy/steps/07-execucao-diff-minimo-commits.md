---
step_number: 7
step_name: "execucao-diff-minimo-commits"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:feature-implementer"
production_writes_allowed: true
expected_inputs:
  - ActionPlan: from_step_5
  - GovernancePlan: from_step_5
  - tests_created: from_step_6
  - red_phase_confirmed: from_step_6
expected_outputs:
  - implementation_narrative: string
  - ImplementationReport: object
  - atomic_commits: list
  - tests_green: boolean
expected_next: 8
gate_required: false
allowed_tools: [Task, Read, Edit, Write, Bash, Grep, Glob]
---

# Step 07 — Execução com diff mínimo e commits atômicos

> **Ported 1:1 from Pulsar** `HEAVY_07_Execucao_Diff_Minimo_Commits.md`. The gate header, non-invention rule, and prompt body below are preserved verbatim.

## ⛔ GATE: Não executar sem HEAVY_06 (TDD)

**Verificar antes de prosseguir:**
- [ ] Existe artefato de HEAVY_06 (testes criados, documentados em Pre-action)?
- [ ] Testes de AC FALHAM (RED) antes da implementação?

**Se não houver artefato de HEAVY_06 → PARAR e executar HEAVY_06_TEST_PRE_IMPL primeiro.**

---

## ⛔ REGRA DE NÃO-INVENÇÃO (OBRIGATÓRIA)

> **Referência:** `.claude/rules/41-no-invention.md`

**ANTES de implementar:** Verificar se TODOS os valores e comportamentos estão explícitos.
**SE faltar informação → PARAR e perguntar** (especialmente cobrança, créditos, paths, security).

---

```text
Implemente seguindo o plano escolhido, com diff mínimo e commits atômicos (um objetivo por commit).

Regras:
- Não refatore por estética.
- Não altere UI existente fora do necessário.
- Não quebre contratos: se mudar, mantenha compatibilidade retroativa.
- Prefira arquivos novos e integração por ponto único.
- ⛔ NÃO ASSUMA VALORES - pergunte se faltar informação.

Ao final, gere:
- ImplementationReport (JSON)
- um resumo narrativo baseado no diff (arquivos tocados, por quê, e riscos residuais).
```

## Next

→ `steps/08-revisao-adversarial-auditoria.md`.
