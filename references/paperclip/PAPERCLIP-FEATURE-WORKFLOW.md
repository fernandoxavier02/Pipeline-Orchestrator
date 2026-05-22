# PAPERCLIP-FEATURE-WORKFLOW
## Workflow inquebravel para Feature/User Story no modelo Paperclip+Codex

**Versao:** 1.0 — 2026-05-22
**Espelha:** pipeline-orchestrator original tipos "Feature" e "User Story" (variants: feature-light, feature-heavy, implement-heavy)
**Aplicar quando:** cliente pediu nova capacidade end-to-end com criterios de aceitacao
**Precedencia:** este documento vence em conflito com qualquer skill especifica. Em conflito com `PAPERCLIP-AXIOMS.md`, os axiomas vencem.

---

## 1. Quando este workflow se aplica

Sinais para o task-orchestrator selecionar este workflow:

| Sinal | Peso |
|---|---|
| Issue tem "como [persona]" implicito ou explicito | forte |
| Issue lista criterios de aceitacao novos | forte |
| Issue contem palavras: "implementar", "criar", "adicionar [funcionalidade]", "permitir que" | forte |
| Issue eh acompanhada de spec/wireframe/mockup | forte |
| Nao tem stack trace nem repro de bug | medio (excludente de Bug Fix) |

User Story = subset menor de Feature (1-3 slices). Mesmo workflow, escopo menor.

---

## 2. Cargos envolvidos (ordem rigorosa)

```
1. task-orchestrator
2. information-gate
3. design-interrogator         (COMPLEXA ou se houver ambiguidade de design)
4. plan-architect              (sempre — Axioma 1 reforca proteger casos complexos)
5. quality-gate-router         (gera cenarios BDD em linguagem natural)
6. pre-tester                  (cenarios → testes que falham)
7. feature-vertical-slice-planner
8. feature-implementer         (loop por slice — 1 slice por batch)
9. executor-spec-reviewer      (per task)
10. executor-quality-reviewer  (per task)
11. checkpoint-validator       (per batch)
12. review-orchestrator        (adversarial trio paralelo — Axioma 2)
13. executor-fix               (se findings)
14. feature-integration-validator (cross-slice consistency)
15. sanity-checker
16. final-adversarial-orchestrator
17. final-validator
18. spec-closer
```

---

## 3. Fluxo passo-a-passo

### 3.1 task-orchestrator
- Classifica tipo=Feature, complexity (SIMPLES/MEDIA/COMPLEXA)
- Determina pipeline_variant (light/heavy/implement)
- Dispatch para information-gate

### 3.2 information-gate
BLOCKERS:
- [ ] Pelo menos 1 criterio de aceitacao explicito?
- [ ] Persona identificavel?
- [ ] Sem ambiguidade tecnica grave?

Faltando algum: ESCALATION_REQUEST com proposta concreta de criterios derivados do contexto.

### 3.3 design-interrogator (condicional)
Dispara automaticamente se:
- complexity=COMPLEXA
- OU issue toca arquitetura existente (touched files include src/architecture/, /core/, /domain/)
- OU criterio de aceitacao contem decisao de design ambigua (ex: "deve ser performatico" — quanto?)

**Decisao pre-aprovada — perguntas "quanto/qual":**

Termos vagos viram defaults da spec:
| Vago | Default ate Board override |
|---|---|
| "performatico" | p95 < 200ms em endpoint, response time linear ate 100x baseline |
| "escalavel" | sem regressao de performance ate 10x carga atual |
| "robusto" | error handling em fronteira, log estruturado, no panic |
| "intuitivo" | persona-tipica completa happy path em <3 cliques |

Se contexto exige decisao real (nao adequa a default), ESCALATION_REQUEST.

### 3.4 plan-architect
Skill obrigatoria carregada. Roda em Plan Mode (read-only, conforme adapted).

Saida: `### CHANGE_CONTRACT v1` (formato skill contracts) com:
- scope.files_in / files_out
- prohibited / required
- tests_required

**Decisao pre-aprovada — quando plano abre alternativas:**
- Consultar engineering-principles. KISS prevalece.
- Diff minimo (IL6).
- Sem dependencia nova (YAGNI) salvo claramente justificado pela funcionalidade.

### 3.5 quality-gate-router → pre-tester (Axioma 3 — TDD)

quality-gate-router gera cenarios BDD em portugues claro:
```gherkin
Given um usuario logado com role=editor
When ele submete um post novo com 5000 caracteres
Then o post eh salvo com status="published"
And aparece na home em <2s
```

**TDD/ATDD/BDD/DDD mandatorios (Axioma 3).**

pre-tester converte em codigo de teste (RED phase).

**Decisao pre-aprovada — cenarios:**
- Gerados DIRETAMENTE dos criterios de aceitacao da issue
- Se criterio nao gera teste claro: documentar como gap + criar ESCALATION_REQUEST se afeta escopo
- NUNCA inventar cenarios "que parecem bons" sem base nos criterios

### 3.6 feature-vertical-slice-planner

Skill obrigatoria: `pipeline-orchestrator-vsa`.

Saida: `### VSA_PLAN v1` com slices ordenados (S1 = happy path simples, S2 = edge cases, ...).

**Decisao pre-aprovada — slicing:**
- Slice 1 sempre eh happy path mais simples (ship-ready)
- Variantes/edge cases viram slice 2+
- Cada slice E2E (UI → service → DB) — nunca slice horizontal

### 3.7 feature-implementer (loop por slice)

Para cada slice (1 por batch em COMPLEXA, 2-3 em MEDIA, todos em SIMPLES):

1. Carregar slice.gherkin
2. TDD por slice:
   - RED (teste E2E falha)
   - GREEN (minimo nas N camadas pra passar)
   - REFACTOR (so dentro do slice — KISS)
3. Postar `### TDD_GREEN v1` por slice

**Decisao pre-aprovada — duplicacao entre slices:**
- 1a vez (slice 1 + slice 2 com codigo parecido): NAO refatorar (rule of three)
- 2a vez (slice 3 com mesmo padrao): refatorar pra funcao/classe compartilhada
- Refatoracao acontece DENTRO do slice atual, nao antes (KISS + YAGNI)

### 3.8 executor-spec-reviewer + executor-quality-reviewer (per task)

Confirmar criterio de aceitacao do slice atual cumprido. Confirmar SOLID/KISS/DRY/YAGNI.

### 3.9 checkpoint-validator

`### CHECKPOINT_RESULT v1`. Build + test + (se MEDIA/COMPLEXA) integration test.

### 3.10 review-orchestrator + adversarial trio (Axioma 2)

Per batch obrigatorio.

### 3.11 feature-integration-validator (post all slices)

Quando TODOS slices fechados, validar:
- Cross-slice consistency (interface slice 1 = interface slice 2?)
- E2E journey full
- Acceptance criteria coverage
- Layer integration

`### INTEGRATION_VALIDATION v1`.

### 3.12 → 3.14 sanity-checker → final-adversarial → final-validator

Mesma logica do Bug Fix workflow.

### 3.15 spec-closer

Status=done. Resumo executivo: slices entregues, cobertura de criterios, files modificados.

---

## 4. Decisoes Pre-Aprovadas — Tabela Mestre

| Cenario | Decisao automatica |
|---|---|
| Sem criterio de aceitacao explicito | ESCALATION_REQUEST com proposta de criterios derivados |
| Decisao de design ambigua ("performatico") | Aplicar defaults da Sec. 3.3 |
| Plano abre 2 alternativas tecnicas equivalentes | KISS — escolher mais simples |
| Codigo duplicado entre slice 1 e 2 | NAO refatorar (rule of three) |
| Codigo duplicado entre slice 1, 2 e 3 | Refatorar (DRY) |
| Slice >200 linhas em >5 arquivos | RESLICE_REQUEST (slice grande demais) |
| Mudanca abre breaking change em API publica | ESCALATION_REQUEST |
| Feature exige dependencia npm/pypi nova | ESCALATION_REQUEST com justificativa |
| Adversarial encontra finding critical | Fix loop max 3, depois ESCALATION |
| Feature toca producao deploy | priority=high, label="prod-change", adversarial security obrigatorio |
| feature-integration-validator detecta inconsistencia cross-slice | Sub-issue corretiva, nao closeout |

---

## 5. Definicao de Done

- [ ] Todos slices implementados e cada um com TDD verde?
- [ ] feature-integration-validator PASS?
- [ ] Acceptance criteria 100% cobertos?
- [ ] Adversarial trio rodou e sem critical pendente?
- [ ] CHANGE_CONTRACT respeitado (sem drift)?
- [ ] Sanity + final-adversarial + PA_DE_CAL GO|CONDITIONAL?
- [ ] Cross-slice consistency validada?
- [ ] Daily notes atualizado?

---

## 6. Anti-padroes proibidos especificos de Feature

❌ Slicing horizontal ("primeiro toda UI") — IL VSA.
❌ Slice 1 cobrindo edge cases — slice 1 eh happy path.
❌ Implementar slice 2 com slice 1 em review — risco de retrabalho.
❌ Mockar camadas em testes E2E do slice.
❌ Pre-otimizar (compartilhar codigo entre slices antes de ver duplicacao real).
❌ Adicionar parametros "configuraveis" sem requisito explicito (YAGNI).
❌ Esquecer feature-integration-validator (cross-slice eh onde bugs aparecem).
