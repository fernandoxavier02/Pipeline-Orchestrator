# PAPERCLIP-SPEC-WORKFLOW
## Workflow inquebravel para producao de Spec (requirements.md + design.md + tasks.md)

**Versao:** 1.0 — 2026-05-22
**Espelha:** pipeline-orchestrator original tipo "Spec" (variants: spec-light, spec-heavy, spec-audit-only)
**Aplicar quando:** Board pede "produzir spec para X", "documentar como funcionar", "design.md pra feature Y"
**Precedencia:** PAPERCLIP-AXIOMS.md vence em conflito.

---

## 1. Quando este workflow se aplica

| Sinal | Peso |
|---|---|
| Issue contem: "cria a spec", "produzir design.md", "documentar como deveria funcionar", "RFC" | forte |
| Issue eh pre-implementacao (vai gerar outras issues depois) | forte |
| Issue nao pede codigo, pede documentos estruturados | confirma |

---

## 2. Cargos envolvidos

```
1. task-orchestrator
2. information-gate
3. brainstorm-controller          (orquestra 10 steps de brainstorm)
   ├── brainstorm-step-00-intake
   ├── brainstorm-step-01-explore
   ├── brainstorm-step-01b-alternatives
   ├── (step 02-07: spec lifecycle handled by spec-* agents below)
   └── brainstorm-step-08-handoff
4. spec-format-gate               (25 deterministic checks)
5. spec-content-reviewer          (slim 6 axes OR full 12 axes)
6. (executor-* implementam quando spec aprovada — outro workflow)
7. spec-post-impl-validator       (apos implementacao, valida fidelidade)
8. spec-closer                    (PA_DE_CAL + 2 reports + spec.json closed)
```

**Adversarial trio:** roda sobre o codigo implementado, nao sobre a spec em si (fase 2 da implementacao, fora deste workflow).

**TDD:** se aplica na implementacao (outro workflow), nao na producao da spec.

---

## 3. Fluxo passo-a-passo

### 3.1 task-orchestrator
Classifica tipo=Spec. Complexity baseada em escopo da spec.

### 3.2 information-gate
BLOCKERS:
- [ ] Objetivo da spec declarado (o que deve cobrir)?
- [ ] Personas/atores identificados?
- [ ] Constraints conhecidos (stack, integracoes, deadline)?

### 3.3 brainstorm-controller (10 steps)

Sequencia rigida (skill `pipeline-orchestrator-spec-protocol` + brainstorm steps):

| Step | Cargo | Saida |
|---|---|---|
| 00-intake | brainstorm-step-00-intake | `00-intake.md` — captura prompt + contexto + arquivos candidatos |
| 01-explore | brainstorm-step-01-explore | `01-explore.md` — 11-lens dynamic exhaustive clarification (NO Paperclip: ESCALATION_REQUEST pra cada gap real) |
| 01b-alternatives | brainstorm-step-01b-alternatives | `01b-alternatives.md` — 2-4 abordagens alternativas |
| 02-spec-init | brainstorm-controller | inicializar `spec.json` com metadata |
| 03-requirements | brainstorm-controller | produzir `requirements.md` em EARS |
| 04-validate-gap | brainstorm-controller | checar gap entre requirements e codebase existente |
| 05-design | brainstorm-controller | produzir `design.md` com arquitetura + ADRs |
| 06-validate-design | brainstorm-controller | review interno do design |
| 07-tasks | brainstorm-controller | produzir `tasks.md` decompondo design em tasks executaveis |
| 08-handoff | brainstorm-controller | finalizar bundle (requirements + design + tasks + spec.json) |

**Decisao pre-aprovada — gap em step 01-explore:**
Tradicionalmente cada gap viraria GATE_REQUEST sincrono. **No Paperclip:**
- Gap recuperavel via codigo/contexto → cargo resolve sozinho
- Gap real (so Board sabe) → ESCALATION_REQUEST com opcoes pre-formuladas, status=paused, pega proxima task
- Em massa (>3 gaps numa rodada): agrupar em UM ESCALATION_REQUEST com tabela de opcoes

### 3.4 spec-format-gate
Skill obrigatoria: `pipeline-orchestrator-spec-protocol` secao 2.

25 checks deterministicos. Veredicto:
- GO (25/25): segue
- GO_WITH_WARN (23-24/25, no critico): segue com warning
- NO_GO (<23/25 ou critico falhando): status=paused + ESCALATION_REQUEST com lista de checks falhados

**Decisao pre-aprovada:** checks 1, 6, 12, 18, 23 sao criticos. Falha em qualquer um → NO_GO automatico.

### 3.5 spec-content-reviewer
Skill obrigatoria: secao 3.

Modo (slim/full) baseado em variant:
- spec-light → slim (6 axes)
- spec-heavy → full (12 axes)

Veredicto:
- GO: overall_score ≥ 0.8 e nenhum axis critical
- WARN: score 0.6-0.8 ou axis warn
- NO_GO: score <0.6 ou axis critical

NO_GO → status=paused + ESCALATION_REQUEST com lista de recommendations.

### 3.6 (intervalo) — Implementacao acontece em outro workflow (Feature/Bug Fix)

Spec eh aprovada e fica em status=approved no spec.json. Implementacao real acontece em outra issue (com workflow correspondente).

### 3.7 spec-post-impl-validator (apos implementacao terminar)

Skill obrigatoria: secao 5.

6 axes weighted (Requirement Coverage 25%, Test Coverage 20%, ...):
- PASS: weighted_score ≥ 0.85
- PASS_WITH_WARNINGS: 0.7-0.85
- FAIL: <0.7 — HARD GATE, status=paused + ESCALATION_REQUEST

### 3.8 spec-closer
Apos PASS:
- `spec.json` → status=closed
- Calcular spec_grade final (A/B/C/D/F)
- Produzir `technical-report.md` + `executive-report.md`
- Postar `### PA_DE_CAL v1` no ticket-mae

---

## 4. Decisoes Pre-Aprovadas — Tabela Mestre

| Cenario | Decisao automatica |
|---|---|
| Step 01-explore detecta gap recuperavel | resolver com Glob/Grep/Read; nao escalar |
| Step 01-explore detecta gap real | ESCALATION_REQUEST com opcoes pre-formuladas |
| Multiplos gaps numa rodada | agrupar em 1 ESCALATION_REQUEST tabular |
| Format gate falha check critico (1,6,12,18,23) | NO_GO + paused |
| Content reviewer score 0.7-0.8 | WARN — segue mas com recomendacoes |
| Conflito entre requirements e codebase ja existente | step 04-validate-gap reporta; brainstorm-controller adapta requirements OU escala |
| Spec exige criar nova interface publica de API | step 05-design ADR explicito; auto-aprovado se segue convencoes do projeto |
| Spec contradiz CLAUDE.md do projeto cliente | ESCALATION_REQUEST |
| Implementacao terminou mas spec-post-impl-validator FAIL | NO_GO hard, criar issue corretiva |

---

## 5. Definicao de Done (Spec)

- [ ] requirements.md em formato EARS, sem TODOs/FIXMEs?
- [ ] design.md com Architecture + Decisions (ADRs) + Contracts?
- [ ] tasks.md com cada task referenciando >= 1 requirement?
- [ ] spec.json em status=closed?
- [ ] Format gate GO (25/25 ou GO_WITH_WARN)?
- [ ] Content reviewer GO ou WARN?
- [ ] Post-impl validator PASS ou PASS_WITH_WARNINGS?
- [ ] spec_grade ≥ C (idealmente A ou B)?
- [ ] 2 reports produzidos?

---

## 6. Anti-padroes proibidos especificos de Spec

❌ Pular format gate "porque eh urgente" — sem 25/25 a base estrutural quebra todo o resto.
❌ Aprovar content review com warnings sem comment justificando.
❌ Marcar spec como closed antes de post-impl validator passar.
❌ Editar requirements.md DURANTE implementacao (se mudou, eh nova versao + re-analise — nao retroativo).
❌ EARS pattern mal-aplicado (ex: requisito que nao se encaixa em When/While/If/Where/Ubiquitous).
❌ ADR sem alternative considered (decisao sem trade-off documentado).
❌ Spec sem traceabilidade entre REQ → design → task → test.
❌ Inventar requirement por inferencia sem citar fonte (Iron Law: evidence-based).
