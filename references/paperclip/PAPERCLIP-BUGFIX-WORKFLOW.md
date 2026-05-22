# PAPERCLIP-BUGFIX-WORKFLOW
## Workflow inquebravel para Bug Fix no modelo Paperclip+Codex

**Versao:** 1.0 — 2026-05-22
**Espelha:** pipeline-orchestrator original tipo "Bug Fix" (variant: bugfix-light ou bugfix-heavy)
**Aplicar quando:** issue tem sinais de bug (stack trace, repro steps, regressao, "esta dando erro em prod")
**Precedencia:** este documento vence em conflito com qualquer skill especifica. Em conflito com `PAPERCLIP-AXIOMS.md`, os axiomas vencem.

---

## 1. Quando este workflow se aplica

Sinais que disparam selecao deste workflow (avaliados por `task-orchestrator` no inicio):

| Sinal | Peso |
|---|---|
| Issue tem stack trace ou error message | forte |
| Issue contem palavras: bug, error, broken, crash, regression, "stopped working" | forte |
| Issue tem repro steps explicitos | forte |
| Issue contem "produccao", "prod", "users affected" | escala severidade |
| Issue eh marcada com priority=critical/high pelo Board | escala severidade |

Se 2+ sinais fortes, classificar como Bug Fix. Caso contrario, **NAO** aplicar este workflow.

---

## 2. Cargos envolvidos (ordem rigorosa)

```
1. task-orchestrator        (classifica + dispatch)
2. information-gate         (gaps minimos do bug)
3. bugfix-diagnostic-agent  (terrain + hypotheses)
4. bugfix-root-cause-analyzer (confirma root cause)
5. executor-fix             (aplica fix com TDD)
6. bugfix-regression-tester (regressao + suite + adjacent)
7. review-orchestrator      (adversarial obrigatorio — Axioma 2)
8. sanity-checker           (build/test/regression)
9. final-adversarial-orchestrator (3 reviewers zero-context)
10. final-validator         (PA_DE_CAL = GO/CONDITIONAL/NO_GO)
11. spec-closer             (close out + reports)
```

**Sem excecao na ordem.** Cargos N+1 NAO comecam ate N estar `done`.

---

## 3. Fluxo passo-a-passo

### 3.1 task-orchestrator (entry point)

**Entrada:** issue nova, ainda sem classificacao.

**Acao:**
1. Aplicar regras de Sec. 1 acima. Se classifica como Bug Fix, prosseguir.
2. Determinar complexity:
   - SIMPLES: <50 linhas mudadas estimadas, 1 arquivo, sem migration, sem deploy
   - MEDIA: 50-200 linhas, 2-5 arquivos
   - COMPLEXA: >200 linhas, multi-modulo, prod-affecting, ou auth/payment/data
3. Postar `### ORCHESTRATOR_DECISION v1` (formato da skill `pipeline-orchestrator-classification`)
4. Criar sub-issue assignee=`information-gate`, parent=issue atual

**Decisao pre-aprovada — escala automatica:**

| Condicao | Acao |
|---|---|
| Issue contem "production" + "down" | complexity=COMPLEXA, priority=critical, marcar com label "incident" |
| Issue contem "users affected" | adicionar adversarial-security-scanner obrigatorio (mesmo se nao tocou auth) |
| Issue tem >7 dias aberta sem progresso | escalar via `### ESCALATION_REQUEST v1` ao Board (issue stuck) |

### 3.2 information-gate

**Entrada:** ORCHESTRATOR_DECISION + issue body.

**Acao:**
1. Checar BLOCKERS (sem isso, nao tem como fazer fix):
   - [ ] Repro steps existem na issue OU em comments anteriores?
   - [ ] Stack trace existe OU descricao do sintoma observavel?
   - [ ] Ambiente de reproducao identificavel (prod, staging, local)?
2. Se algum BLOCKER falta:
   - Marcar status=`paused` (Axioma 5 — nao bloqueia)
   - Criar approval issue ao Board: `### ESCALATION_REQUEST v1` com gap especifico
   - **NAO inventar** repro steps — esperar Board
3. Se todos BLOCKERS OK: postar `### INFORMATION_GATE v1 status=CLEAR` e dispatch para bugfix-diagnostic-agent.

**Decisao pre-aprovada — clarification questions:**

NUNCA postar pergunta tipo "voce poderia clarificar X?" como GATE_REQUEST. Em vez disso:
- Se o gap eh recuperavel via codigo/logs/contexto → o cargo proximo (diagnostic-agent) faz o trabalho
- Se o gap eh REAL (so o usuario sabe), criar ESCALATION_REQUEST com **opcoes pre-formuladas** baseadas na sua melhor inferencia.

### 3.3 bugfix-diagnostic-agent

**Skill obrigatoria:** `pipeline-orchestrator-bugfix-method` secao 1.

**Entrada:** issue + repro steps + stack trace.

**Acao (proibido escrever codigo):**
1. Mapear terreno (arquitetura afetada, fluxo end-to-end, pontos de medida)
2. Gerar 3-7 hipoteses ranqueadas por plausibilidade
3. Para cada: evidence_for, evidence_against, test_to_confirm
4. Postar `### DIAGNOSTIC_REPORT v1`

**Decisao pre-aprovada — quando hipoteses estao empatadas em plausibilidade:**

Tradicionalmente postaria GATE_REQUEST. **No Paperclip:**
- Se top 2 hipoteses tem plausibilidade ≤0.10 de diferenca **E** ambas tem custo de teste similar: testar AMBAS em paralelo (a primeira a confirmar vence).
- Se uma hipotese tem custo de teste MUITO maior: testar a barata primeiro.
- Se ambas tem custo alto: ESCALATION_REQUEST (raro) com proposta de testar opcao A primeiro.

### 3.4 bugfix-root-cause-analyzer

**Skill obrigatoria:** `pipeline-orchestrator-bugfix-method` secao 2.

**Entrada:** DIAGNOSTIC_REPORT.

**Acao (proibido escrever codigo):**
1. Confirmar top hipoteses sistematicamente
2. Coletar evidence chain (empirical + code_inspection + spec_divergence)
3. Verificar SSOT do dominio afetado (skill `engineering-principles` secao 6)
4. Postar `### ROOT_CAUSE_RESULT v1` com fix_guidance
5. Dispatch para executor-fix

**Decisao pre-aprovada — quando fix_guidance abre alternativas:**

Tradicionalmente GATE_REQUEST. **No Paperclip:**
- Consultar `engineering-principles` (KISS prevalece, escolher mais simples)
- Se ambas sao equivalentes em complexidade: escolher a que afeta MENOS arquivos (diff minimo, IL6)
- Se a escolha afeta arquitetura: ESCALATION_REQUEST com opcoes pre-formuladas

### 3.5 executor-fix

**Skill obrigatoria:** `pipeline-orchestrator-tdd` + `pipeline-orchestrator-iron-laws`.

**Entrada:** ROOT_CAUSE_RESULT.

**Acao:**
1. Carregar fix_guidance
2. Aplicar TDD:
   - RED: o test_to_confirm da fase diagnostic + repro virou teste falho — **ele eh o RED**
   - GREEN: implementar fix
   - REFACTOR: nao aplicar (diff minimo IL6 em bug fix)
3. Postar `### TDD_GREEN v1`
4. Dispatch para bugfix-regression-tester

**Decisao pre-aprovada — qual abordagem de fix:**

Sempre a abordagem que:
- Modifica menos arquivos (IL6)
- Nao introduz dependencia nova (YAGNI)
- Respeita SSOT (engineering-principles 6)
- Tem rollback facil

### 3.6 bugfix-regression-tester

**Skill obrigatoria:** `pipeline-orchestrator-bugfix-method` secao 4.

**Acao:**
1. Verificacao tripla: symptom resolution + suite completa + adjacent breakage
2. Criar regression test permanente em `tests/regression/test_{{issue-id}}_{{short-desc}}.py`
3. Postar `### REGRESSION_RESULT v1`
4. Status muda para ready_for_review (NAO done — adversarial ainda)

### 3.7 review-orchestrator + adversarial trio (Axioma 2)

**Adversarial roda SEMPRE em todo batch.** Sem opt-out.

Dispatch em paralelo 3 cargos (zero-context):
- `adversarial-security-scanner`
- `adversarial-architecture-critic`
- `adversarial-quality-reviewer`

Cada um carrega skill `pipeline-orchestrator-adversarial`. Cada um produz finding YAML.

**Decisao pre-aprovada — fix loop:**
- Findings critical: max 3 tentativas de fix (sub-issues `executor-fix`)
- Apos 3a falha: ESCALATION_REQUEST com proposta de mudar abordagem
- Findings high: tentar fix 1 vez; se nao resolve, marcar como "accepted with risk" + criar issue separada de followup
- Findings medium/low: documentar, NAO fixar nesta issue, criar followup

### 3.8 sanity-checker

**Skill obrigatoria:** built-in (executar build + test + regression).

**Acao:**
- COMPLEXA: build + tests + regression suite completa
- MEDIA: build + tests
- SIMPLES: build only (mas axioma 3 obriga test minimo de regressao do bug)

Stop Rule: 2 falhas consecutivas no mesmo check → ESCALATION_REQUEST.

### 3.9 final-adversarial-orchestrator

**Roda SEMPRE** (Axioma 2). Sem opt-out por Board.

Dispatch 3 reviewers zero-context sobre **TODO o diff acumulado** (nao so batch atual).

### 3.10 final-validator (Pa de Cal)

Veredicto binario:
- GO: todos os checks PASS, nenhum critical do adversarial
- CONDITIONAL: passou checks tecnicos, mas tem findings high pendentes (criar issues de followup)
- NO_GO: algum check fail OU critical do adversarial

Postar `### PA_DE_CAL v1` (formato skill contracts).

### 3.11 spec-closer

Apos PA_DE_CAL = GO ou CONDITIONAL:
- Status do parent issue → done (Axioma 4)
- Postar resumo executivo com timeline + arquivos tocados + testes adicionados
- Atualizar daily notes do agente

---

## 4. Decisoes Pre-Aprovadas — Tabela Mestre

| Cenario | Decisao automatica |
|---|---|
| 2 hipoteses empatadas, custo similar | Testar AMBAS em paralelo |
| Fix com 2 abordagens equivalentes | Escolher a com diff menor |
| Adversarial finding critical (1a vez) | Dispatch executor-fix imediato, ate 3 tentativas |
| Adversarial finding high | 1 tentativa de fix, senao followup issue |
| Adversarial finding medium/low | Documentar, criar followup |
| Build/test falha 1x | Retry (pode ser flake) |
| Build/test falha 2x | ESCALATION_REQUEST |
| Issue parent sem repro steps | ESCALATION_REQUEST imediato |
| Issue toca producao | priority=critical, label="incident", adversarial-security obrigatorio |
| Fix exige mudar contrato publico de API | ESCALATION_REQUEST (breaking change precisa Board) |
| Fix exige migration de DB | ESCALATION_REQUEST (data integrity precisa Board) |
| Issue >7 dias stuck | ESCALATION_REQUEST |
| Stop rule disparou | ESCALATION_REQUEST com alternativas |

---

## 5. Definicao de Done (criterios binarios — todos devem ser SIM)

- [ ] Symptom resolution: repro command original FALHA antes, PASSA depois? (output literal nos comments)
- [ ] Regression test criado em `tests/regression/test_{id}_{desc}.py`?
- [ ] Suite completa PASS (build + tests)?
- [ ] Adversarial trio rodou e nao tem critical pendente?
- [ ] Final-validator emitiu PA_DE_CAL = GO ou CONDITIONAL?
- [ ] Root cause documentado em comment estruturado?
- [ ] Cadeia de evidencia auditavel (file:line citado a cada decisao)?
- [ ] Daily notes do agente atualizado?

Se algum NAO, status fica `in_review` ate resolver. NUNCA marcar `done` com criterio falso.

---

## 6. Anti-padroes proibidos especificos de Bug Fix

❌ **Pular diagnostic agent "porque ja sei o bug"** — viola IL5 (evidence-based), viola contrato inquebravel (toda decisao tem que ter regra).

❌ **Aplicar fix sem confirmar root cause** — chute. Vai fixar sintoma, root cause volta.

❌ **Esquecer regression test** — Axioma 3 mandatorio.

❌ **Refatorar adjacente "ja que estou aqui"** — IL6.

❌ **Marcar done sem rodar adversarial** — Axioma 2.

❌ **Improvisar quando ha 2 hipoteses empatadas** — usar regra da Sec. 3.3 (testar paralelo) ou ESCALATION_REQUEST.

❌ **Postar "tudo certo, fix funcionou"** sem output literal — IL5.

❌ **Tentar fix loop > 3 vezes** — escalar.

---

## 7. Anexos

### 7.1 Template de regression test (Python/pytest)

```python
# tests/regression/test_{ISSUE_ID}_{short_desc}.py

import pytest

# Regression test for {ISSUE_ID} — root cause: {1-line summary}
# Original bug: {sintoma observavel}
# Fix applied in commit/comment: {ref}

def test_{descricao_curta}_regression():
    """
    Given: {pre-condicao}
    When:  {acao}
    Then:  {resultado esperado}
    """
    # arrange
    ...
    # act
    result = ...
    # assert
    assert result == expected
```

### 7.2 Diagrama de fluxo (referencia visual)

```
issue (Bug Fix sinais detectados)
  ↓
task-orchestrator → ORCHESTRATOR_DECISION
  ↓
information-gate → INFORMATION_GATE.status=CLEAR
  ↓
bugfix-diagnostic-agent → DIAGNOSTIC_REPORT
  ↓
bugfix-root-cause-analyzer → ROOT_CAUSE_RESULT
  ↓
executor-fix → TDD_GREEN
  ↓
bugfix-regression-tester → REGRESSION_RESULT
  ↓
review-orchestrator (adversarial trio paralelo)
  ↓
sanity-checker
  ↓
final-adversarial-orchestrator (final trio)
  ↓
final-validator → PA_DE_CAL (GO|CONDITIONAL|NO_GO)
  ↓
spec-closer → status=done + reports
```
