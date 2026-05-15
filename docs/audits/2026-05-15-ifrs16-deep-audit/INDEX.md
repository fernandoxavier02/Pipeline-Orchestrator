# Auditoria 2026-05-15 — Pipeline Orchestrator v5.2.0 sobre projeto IFRS 16

**Auditor:** Claude Opus 4.7 (sessão pai inline, parent handler do protocolo Achado #7)
**Projeto-alvo:** IFRS 16 (FastAPI + React) em `D:\IFRS 16 (do replit para o Cursor)\`
**Branch base:** `test/po-evaluation-v5.2.0` (+ 8 worktrees por cenário)
**Plugin versão sob teste:** v5.2.0
**Branch de fixes:** `fix/v5.3.0-spawn-real-batches-bdd` (4 commits)

## Como ler estes documentos

### 1. Comece pelos contratos canônicos
- **`_canonical_contract.md`** — gabarito de auditoria: 22 gates, 45 agentes, 9 dispatch sites, 4 GATE_REQUEST sites do pipeline-controller. Síntese de 8 arquivos canônicos do plugin.
- **`_decision_table.md`** — política unificada de resposta aos gates durante os 7 cenários (consistência cross-cenário).

### 2. Fase B+D (auditoria original — 7 cenários + 3 correções + panel)
- **`FINAL_CONSOLIDATED_REPORT.md`** — matriz 7×N gates, 7×45 dispatch, Pareto de violações, veredicto por modo
- **`COMPARISON_v5.2_vs_v5.3.md`** — análise prospectiva + Fase G runtime evidence pós-fix
- **`PANEL_FINAL.md`** — consolidação 3 personas (Auditor Anthropic Senior + Engenheiro Claude Code + Redteam)

### 3. Fase H (segunda fase — cobertura ampliada para 80%)
- **`FASE_H_FINDINGS.md`** — auditoria de hooks (8/8 lidos, 1 test FAIL), gates restantes, anti-injection POCs
- **`FASE_H_ADDENDUM.md`** — addendum com runtime dispatches adicionais (Phase 3, fix loop, brainstorm step 0, skills variantes)
- **`FASE_H_FINAL.md`** — consolidação Fase H + retração de 1 falso positivo

## Cobertura total atingida

| Aspecto | Inicial | Pós-B+D | Pós-H |
|---------|---------|---------|-------|
| Subagents dispatchados runtime | — | 12/26 | **26/26** |
| Hooks lidos/testados | 0/8 | 0/8 | **8/8** (1 fix aplicado) |
| Gates do registry de 22 runtime | — | 5/22 | **12/22** |
| Phase 3 runtime | — | 0/3 | **3/3** |
| Brainstorm steps runtime | — | 1/9 | 2/9 + 7/9 contract |
| Cobertura efetiva total | 0% | 30% | **80%** |

## Achados CRITICAL (11 totais, 8 fixados)

| ID | Achado | Status |
|----|--------|--------|
| B1-001 | Orphan sentinel state cross-session | ✅ Spec fix (D9) |
| B1-004 | information-gate prosa fallback | ✅ FIXED (D2) |
| B5-001 | plan-architect inline fallback | ✅ FIXED (D2) |
| F3-1 | Schema drift no worked example D2 | ✅ FIXED (D2-follow-up) |
| F3-3 | 14 subagents irmãos sem fix | ✅ FIXED (D2-extension) |
| H1-002 | sentinel-hook fail-open admitido | ❌ OPEN |
| H1-003 | STALE_THRESHOLD drift (5min/10min/24h) | ❌ OPEN |
| H6-001 | JSONL detail sem sanitização (POC) | ❌ OPEN |
| H1-NEW-001 | sanity-checker prosa fallback | ✅ FIXED (D2-extension-v2) |
| H1-NEW-002 | checkpoint-validator prosa fallback | ✅ FIXED (D2-extension-v2) |
| H1-NEW-003 | bugfix-regression-tester prosa fallback | ✅ FIXED (D2-extension-v2) |

## Achados HIGH (7 totais, 1 fixado)

| ID | Achado | Status |
|----|--------|--------|
| B1-002 | pipeline-controller não dispatchable | OPEN (decisão de design) |
| B1-005 | Sistêmico JSONL sem sanitização | OPEN |
| B1-006 | Gates heterogêneos (registry vs protocol) | OPEN |
| B1-007 | Parent acumula 3 responsabilidades | OPEN |
| H1-001 | dispatch-guard tabela incompleta | ✅ **FIXED nesta sessão** |
| H6-002 | pipeline.local.md sem parser estrito | OPEN |

## Achado retraído (transparência)

- ~~H8-NEW-001~~ — validate-trace.cjs exit code. **Falso positivo do auditor** (teste com pipe `| head` mascarou exit code do node; runtime isolado retorna exit 1 corretamente).

## Commits aplicados (branch `fix/v5.3.0-spawn-real-batches-bdd`)

```
7fb479f fix(v5.3.0): D2-extension-v2 + dispatch-guard table completion (Fase H findings)
5619bbf fix(v5.3.0): D2-extension (14 siblings) + D9 (orphan cleanup spec) + runtime evidence
5c46851 fix(v5.3.0): D2-follow-up — schema-correct worked examples (panel F3-1) + backlog expansion (F3-3)
aef7943 fix(v5.3.0): D2 — information-gate + plan-architect emit structured Achado #7 blocks [TDD/ATDD/BDD]
```

## Suite de regressão v5.3.0 criada

`tests/regression/v5.3.0/`:
- `D2_test_subagent_protocol.cjs` — 16/16 PASS (validates 16 subagents, schema-shape, kind-aware, placeholder leak)
- `D2_subagent_protocol_compliance.feature` — Gherkin BDD
- `D9_test_orphan_cleanup_spec.cjs` — PASS
- `eval_C4_diagnostic.feature` — Gherkin para cenário C4

## Backlog pendente

Documentado em `../../../notes/v5.3.0-audit-backlog.md`:
- D1 runtime validator (hook PreToolUse)
- D9-extension (lock file + auto-cleanup)
- D11 sanitização JSONL via parser dedicado
- D12 gate registry unificação
- D13 parent SRP
- D14 schema versioning sentinel-state
- D15 allowlist gate-id (segurança)
- D16 --hotfix variant contract

## Próximas auditorias necessárias (~20% gap residual)

- Modo CONTINUE (resume de pipeline)
- 10 gates ainda não disparados runtime (PLAN_REJECTED, CHECKPOINT_FAIL, ADVERSARIAL_BLOCK, STOP_RULE, STEP_1_7_RECURSION_GUARD, STALE_CONTEXT, SPEC_CONTENT_REVIEW_NOGO, SPEC_AC_TRACEABILITY_GAP, SPEC_POST_IMPL_FAIL, ADVERSARIAL_GATE_MANDATORY)
- 6 skills variantes não exercitadas (bugfix-heavy, feature-light, spec-heavy, spec-audit-only, audit-heavy, ux-sim-heavy)
- Testes runtime/behavioral em vez de text-pattern (F3-2, F3-6, F1-validity)
