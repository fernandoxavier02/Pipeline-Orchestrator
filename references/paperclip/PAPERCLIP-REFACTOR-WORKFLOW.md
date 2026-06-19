# PAPERCLIP-REFACTOR-WORKFLOW
## Workflow inquebravel para Refactor no modelo Paperclip+Codex

**Versao:** 1.0 — 2026-06-19
**Espelha:** pipeline-orchestrator original tipo "Refactor" (variant: refactor-light ou refactor-heavy)
**Aplicar quando:** issue pede reorganizar/limpar codigo sem mudar o comportamento visivel (renomear, extrair, mover, separar)
**Precedencia:** este documento vence em conflito com qualquer skill especifica. Em conflito com `PAPERCLIP-AXIOMS.md`, os axiomas vencem.
**Delta de cargos:** ZERO cargos novos. O Refactor reusa os cargos existentes — nenhum agente novo no roster de 50.

---

## 1. Quando este workflow se aplica

Sinais que disparam selecao deste workflow (avaliados por `task-orchestrator` no inicio):

| Sinal | Peso |
|---|---|
| Issue contem palavras: refactor, refatorar, reorganizar, renomear, extrair, mover, "limpar codigo", "deixar mais legivel" | forte |
| Issue diz explicitamente que o comportamento NAO deve mudar ("sem mudar o que faz", "behavior-preserving") | forte |
| Issue aponta um modulo bagunçado / dificil de manter, mas que funciona | forte |
| Issue cruza varios modulos / pacotes | escala para heavy |
| Issue pede revisao critica final do resultado | escala para heavy |

Se 2+ sinais fortes, classificar como Refactor. Se a issue pede mudar comportamento, adicionar feature, ou consertar bug, **NAO** aplicar este workflow (rotear para Feature / Bug Fix).

---

## 2. Cargos envolvidos (ordem rigorosa)

```
1. task-orchestrator        (classifica + dispatch)
2. information-gate         (gaps minimos: qual a superficie publica?)
3. plan-architect           (CHANGE_CONTRACT: o que pode/nao pode mexer + assinatura)
4. pre-tester               (modo characterization — testes da superficie publica MUST PASS = snapshot ANTES)
5. executor-implementer-task (aplica restruturacao com diff minimo dentro do contrato)
6. pre-tester               (characterization rerun — snapshot DEPOIS; veredito IDENTICAL)
7. review-orchestrator      (adversarial obrigatorio em heavy — Axioma 2)
8. sanity-checker           (build/test/regression)
9. final-adversarial-orchestrator (3 reviewers zero-context — heavy)
10. final-validator         (PA_DE_CAL = GO/CONDITIONAL/NO_GO)
11. spec-closer             (close out + reports)
```

**Sem excecao na ordem.** Cargos N+1 NAO comecam ate N estar `done`. O passo 3 (CHANGE_CONTRACT assinado) eh a trava REFACTOR_SCOPE_LOCK — nenhum arquivo eh tocado antes dela.

---

## 3. Fluxo passo-a-passo

### 3.1 task-orchestrator (entry point)

**Entrada:** issue nova, ainda sem classificacao.

**Acao:**
1. Aplicar regras de Sec. 1 acima. Se classifica como Refactor, prosseguir.
2. Determinar complexity:
   - SIMPLES/MEDIA: 1 modulo, ate ~2 arquivos, blast radius contido → `refactor.light`
   - COMPLEXA: cruza modulos, muitos callers, invariantes sutis → `refactor.heavy`
3. Postar `### ORCHESTRATOR_DECISION v1`
4. Criar sub-issue assignee=`information-gate`, parent=issue atual

**Decisao pre-aprovada — escala automatica:**

| Condicao | Acao |
|---|---|
| Restruturacao cruza modulos/pacotes | complexity=COMPLEXA → refactor.heavy |
| Issue pede mudar comportamento publico | rotear para Feature/Bug Fix (nao eh refactor) |
| Issue toca auth/payment/data path | manter snapshot de comportamento sensivel a coupling |

### 3.2 information-gate

**Acao:**
1. Checar BLOCKERS:
   - [ ] A superficie PUBLICA do alvo eh identificavel (nomes exportados, assinaturas, codigos de erro, formato de saida, efeitos)?
   - [ ] O comportamento publico eh exercivel por teste (da pra tirar um snapshot)?
2. Se algum BLOCKER falta: status=`paused`, `### ESCALATION_REQUEST v1` com o gap. **NAO inventar** a superficie publica.
3. Se OK: postar `### INFORMATION_GATE v1 status=CLEAR` e dispatch para plan-architect.

### 3.3 plan-architect — CHANGE_CONTRACT (trava REFACTOR_SCOPE_LOCK)

**Acao (proibido escrever codigo do produto):**
1. Montar o `IMPLEMENTATION_PLAN.CHANGE_CONTRACT` (reusado como esta): coluna **permitido** (renomear, extrair, inline, mover, restruturar dado interno) + coluna **proibido** (nova superficie publica de API, mudar codigo de erro, mudar formato de saida, mudar efeito colateral) + `allowed_files` + flag `signed_off`.
2. Se qualquer passo proposto cai na coluna proibida → ABORTAR (nao eh refactor).
3. Postar `### CHANGE_CONTRACT v1 signed_off=true`. Esta assinatura eh a trava REFACTOR_SCOPE_LOCK — **antes dela, nenhum arquivo eh tocado**.

### 3.4 pre-tester (modo characterization — snapshot ANTES)

**Acao:**
1. Escrever testes que capturam o comportamento PUBLICO atual e que **PASSAM** contra o codigo como esta hoje (o inverso de um teste RED). Ligados SO a superficie publica dos `allowed_files`; testes internos de cobertura ficam de fora.
2. Rodar e confirmar verde. Postar `### CHARACTERIZATION_CONFIRMED v1` com o `before_snapshot`.

### 3.5 executor-implementer-task (restruturacao com diff minimo)

**Acao:**
1. Aplicar os passos de restruturacao DENTRO do `allowed_files` do contrato. Diff minimo (IL6). Nada de melhoria adjacente.
2. Nao mudar assinatura publica, codigo de erro, formato de saida ou efeito colateral.
3. Postar `### TDD_GREEN v1` (no Refactor, "green" = a suite continua passando, nao um RED virou green).

### 3.6 pre-tester (characterization rerun — snapshot DEPOIS)

**Acao:**
1. Re-rodar EXATAMENTE os mesmos testes do passo 3.4 contra o codigo restruturado.
2. Comparar `after_snapshot` com `before_snapshot` SO na superficie publica.
3. Veredito: **IDENTICAL** (segue) ou **DIVERGED** (parar — voltar ao executor-implementer-task; NUNCA enfraquecer o teste pra caber no novo comportamento).

### 3.7 review-orchestrator + adversarial trio (Axioma 2 — heavy)

**Adversarial roda SEMPRE em refactor.heavy.** Dispatch em paralelo 3 cargos zero-context (security-scanner, architecture-critic, quality-reviewer) sobre o diff. Eles procuram o que o snapshot nao ve: check de auth movido, vazamento de coupling entre modulos, violacao de camada, codigo morto deixado por um inline. Fix loop max 3; apos 3a falha, ESCALATION_REQUEST.

### 3.8 sanity-checker

- COMPLEXA: build + tests + regression
- MEDIA: build + tests
- SIMPLES: build (mas a suite de characterization sempre roda)

Stop Rule: 2 falhas consecutivas → ESCALATION_REQUEST.

### 3.9 final-adversarial-orchestrator (heavy)

Roda em refactor.heavy. 3 reviewers zero-context sobre todo o diff acumulado.

### 3.10 final-validator (Pa de Cal)

Veredito binario:
- GO: IDENTICAL confirmado, escopo respeitado, sem critical do adversarial
- CONDITIONAL: tecnico passou, mas tem high pendente (followup)
- NO_GO: DIVERGED, violacao de escopo, ou critical do adversarial

Postar `### PA_DE_CAL v1`.

### 3.11 spec-closer

Apos PA_DE_CAL = GO ou CONDITIONAL: status do parent → done; resumo com arquivos tocados + os dois snapshots (antes/depois) + o veredito IDENTICAL como prova de preservacao de comportamento.

---

## 4. Decisoes Pre-Aprovadas — Tabela Mestre

| Cenario | Decisao automatica |
|---|---|
| Restruturacao cruza modulos | refactor.heavy (adversarial obrigatorio) |
| Plano propoe mudar superficie publica | ABORTAR — rotear para Feature/Bug Fix |
| Snapshot DEPOIS = DIVERGED | Voltar ao executor-implementer-task; NAO editar o teste |
| Snapshot DEPOIS = DIVERGED 2x seguidas | Stop Rule → ESCALATION_REQUEST |
| Adversarial finding critical (1a vez) | Dispatch executor-implementer-task imediato, ate 3 tentativas |
| Adversarial finding high | 1 tentativa de fix, senao followup issue |
| Fix exige tocar arquivo fora do contrato (executor-implementer-task) | ESCALATION_REQUEST (mudar o contrato precisa nova assinatura) |
| Build/test falha 2x | ESCALATION_REQUEST |

---

## 5. Definicao de Done (criterios binarios — todos devem ser SIM)

- [ ] CHANGE_CONTRACT assinado ANTES do primeiro toque em arquivo (trava REFACTOR_SCOPE_LOCK)?
- [ ] Snapshot de characterization ANTES (superficie publica) passou verde?
- [ ] Diff dentro do `allowed_files`, sem mudanca de superficie publica?
- [ ] Snapshot DEPOIS = IDENTICAL ao snapshot ANTES (superficie publica)?
- [ ] Adversarial trio rodou (heavy) e nao tem critical pendente?
- [ ] Final-validator emitiu PA_DE_CAL = GO ou CONDITIONAL?
- [ ] Cadeia de evidencia auditavel (file:line + os dois snapshots)?

Se algum NAO, status fica `in_review` ate resolver. NUNCA marcar `done` com criterio falso.

---

## 6. Anti-padroes proibidos especificos de Refactor

❌ **Tocar arquivo antes do CHANGE_CONTRACT assinado** — viola a trava REFACTOR_SCOPE_LOCK.

❌ **Mudar comportamento publico "ja que estou aqui"** — isso eh Feature/Bug Fix, nao Refactor; viola o contrato.

❌ **Editar o teste de characterization pra caber no novo comportamento** quando deu DIVERGED — mascara a quebra (test_weakened_to_fit_implementation).

❌ **Ligar o check IDENTICAL a testes internos de cobertura** — um refactor pode mover/renomear teste interno; so a superficie publica entra na comparacao.

❌ **Refatorar adjacente fora do escopo "ja que estou aqui"** — IL6, diff minimo.

❌ **Marcar done sem rodar adversarial em heavy** — Axioma 2.

---

## 7. Diagrama de fluxo (referencia visual)

```
issue (Refactor sinais detectados)
  ↓
task-orchestrator → ORCHESTRATOR_DECISION (light/heavy)
  ↓
information-gate → INFORMATION_GATE.status=CLEAR
  ↓
plan-architect → CHANGE_CONTRACT (signed) == trava REFACTOR_SCOPE_LOCK
  ↓
pre-tester (characterization) → before_snapshot (MUST PASS)
  ↓
executor-implementer-task → diff minimo dentro do contrato
  ↓
pre-tester (characterization rerun) → after_snapshot → IDENTICAL?
  ↓ (heavy)
review-orchestrator (adversarial trio paralelo)
  ↓
sanity-checker
  ↓ (heavy)
final-adversarial-orchestrator (final trio)
  ↓
final-validator → PA_DE_CAL (GO|CONDITIONAL|NO_GO)
  ↓
spec-closer → status=done + reports (com os dois snapshots)
```
