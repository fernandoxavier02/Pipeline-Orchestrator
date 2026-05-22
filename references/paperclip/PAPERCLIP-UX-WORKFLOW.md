# PAPERCLIP-UX-WORKFLOW
## Workflow inquebravel para UX Simulation/Review no modelo Paperclip+Codex

**Versao:** 1.0 — 2026-05-22
**Espelha:** pipeline-orchestrator original tipo "UX Simulation"
**Aplicar quando:** Board pede revisao de UX/acessibilidade/simulacao de jornada de usuario
**Precedencia:** PAPERCLIP-AXIOMS.md vence em conflito.

---

## 1. Quando este workflow se aplica

| Sinal | Peso |
|---|---|
| Issue contem: "UX", "acessibilidade", "a11y", "simular jornada", "persona" | forte |
| Issue eh sobre frontend / UI / mobile / web | forte |
| Sem pedido de mudanca de codigo, so revisao | confirma read-only |

**Iron Law deste workflow:** READ-ONLY. Nao modifica codigo. Saida = relatorios + recomendacoes priorizadas.

---

## 2. Cargos envolvidos

```
1. task-orchestrator
2. information-gate         (personas definidas? jornadas listadas?)
3. ux-simulator             ─┐
                             ├─ PARALELO (zero-context entre si)
   ux-accessibility-auditor ─┘
4. ux-qa-validator          (consolida + priority matrix + action items)
5. final-validator          (PA_DE_CAL adaptado)
6. spec-closer              (2 relatorios)
```

**Adversarial trio NAO roda** — UX nao toca codigo (excecao explicita ao Axioma 2 declarada aqui).

**TDD/ATDD/BDD/DDD NAO se aplica** — read-only review (excecao explicita ao Axioma 3).

---

## 3. Fluxo passo-a-passo

### 3.1 task-orchestrator
Classifica tipo=UX. Complexity baseada em numero de jornadas x personas.

### 3.2 information-gate
BLOCKERS:
- [ ] Personas declaradas ou inferiveis do produto?
- [ ] Jornadas-chave listadas?
- [ ] Escopo (que telas/fluxos cobrir)?
- [ ] Profundidade (WCAG nivel A, AA, AAA)?

**Decisao pre-aprovada — personas nao declaradas:**
NAO inventar personas livremente. Se produto tem documentacao de personas (CLAUDE.md cliente, design system doc), usar essas. Senao ESCALATION_REQUEST com proposta de 3-5 personas baseadas no produto.

### 3.3 ux-simulator (em paralelo com 3.4)
Skill obrigatoria: `pipeline-orchestrator-ux-method` secao 1.

Saida: `### UX_SIM_REPORT v1` com personas x jornadas + friction_total + friction_by_severity.

### 3.4 ux-accessibility-auditor (em paralelo com 3.3)
Skill obrigatoria: secao 2.

Saida: `### A11Y_AUDIT_REPORT v1` com WCAG checks + findings + remediation_estimate.

**Decisao pre-aprovada — WCAG level:**
- Default: AA (compliance legal em muitas jurisdicoes)
- Se Board pediu AAA explicito: AAA
- Se Board pediu A explicito: A (raro, apenas em prototipos descartaveis)

### 3.5 ux-qa-validator
Skill obrigatoria: secao 3.

Consolida ambos os reports. Saida: `### UX_QA_REPORT v1` com:
- action_matrix (do_first / do_soon / do_eventually / reconsider)
- recommended_release_blocker
- verdict (SHIP / SHIP_WITH_FIXES / BLOCK)

**Decisao pre-aprovada — priorizacao:**
- impact x effort matrix
- WCAG AA criticos sempre sao release_blocker (compliance)
- Persona x criticidade calculado por: numero_de_personas_afetadas / total + criticidade_da_jornada

### 3.6 final-validator
GO / CONDITIONAL / NO_GO conforme:
- GO: dois reports completos, verdict consistente
- CONDITIONAL: gaps documentados (ex: nao testou em IE pq sem ambiente), mas substancia ok
- NO_GO: report incompleto OU findings sem evidence

### 3.7 spec-closer
2 relatorios:
- `ux-technical-report.md` — para designers/devs (findings + recommendations)
- `ux-executive-report.md` — para Board (verdict + top priorities)

---

## 4. Decisoes Pre-Aprovadas — Tabela Mestre

| Cenario | Decisao automatica |
|---|---|
| Personas nao declaradas | ESCALATION_REQUEST com proposta de 3-5 baseadas no produto |
| WCAG level nao especificado | default AA |
| Friction encontrada sem severity clara | aplicar rubric de ux-method (1=critico, 2=alto, 3=medio, 4=baixo) |
| Same finding por ux-simulator E accessibility-auditor | deduplicar no ux-qa-validator, manter uma com merged evidence |
| Auditor pediu acesso a code/files | ok, read-only |
| Detected accessibility violation critical (WCAG A nao atendido) | release_blocker automatico |
| Persona "power user keyboard-only" nao consegue completar jornada | finding severity=high |
| Touch target <44x44px | finding severity=medium (sempre flagar) |
| Contrast <4.5:1 em texto | finding severity=high (WCAG AA) |

---

## 5. Definicao de Done (UX)

- [ ] UX_SIM_REPORT completo (todas personas x jornadas-chave)?
- [ ] A11Y_AUDIT_REPORT completo (WCAG checks aplicados)?
- [ ] UX_QA_REPORT consolidado com priority matrix?
- [ ] Findings com severity + evidence (file ou screenshot reference)?
- [ ] Verdict (SHIP/SHIP_WITH_FIXES/BLOCK) consistente com findings?
- [ ] 2 relatorios produzidos?

---

## 6. Anti-padroes proibidos especificos de UX

❌ Escrever codigo (read-only — Iron Law deste workflow).
❌ Auditor lendo issue description ANTES do code (enviesa — zero-context).
❌ Simulator pulando persona "que nao casa com o produto" (cego pra publico real).
❌ Findings sem severity (impossivel acionar).
❌ Acessibilidade tratada como nice-to-have (compliance legal).
❌ "O designer disse que esta OK" — UX review eh independent, nao gut-check.
❌ Inventar persona porque "fica chato so com as declaradas".
