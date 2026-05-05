---
step_number: 06
step_name: "architecture-audit"
description: "Spec Heavy: Architecture audit — SOLID/DRY/YAGNI/SSOT/code-smells"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic"
expected_inputs:
  - tasks_completed: from_step_04
  - spec_context: from_spec_context_yaml
expected_outputs:
  - arch_audit_report: object
  - findings_by_severity: object
expected_next: 7
gate_required: false
allowed_tools: [Read, Grep, Glob, Bash]
---

# Spec Lifecycle (Heavy) — Step 06: Architecture Audit

> **Position in pipeline:** Step 6 — segundo dos 3 audits independentes pos-implementation (junto com 05 e 07). Foco em principios estruturais do codigo entregue.
> **Goal:** Auditar a implementacao contra principios de design (SOLID, DRY, YAGNI, SSOT) e identificar code smells / riscos de manutencao com findings tagueados por severidade e arquivo:linha.

---

## Quando usar

Use apos a Implementation (step 04) ter terminado e o step 05 (post-impl-validation) ter consolidado o Congruence Score. Sem gate proprio — sera consumido pelo step 08 (confidence dashboard).

## Ordem de execucao

A cadeia `expected_next` e sequencial: 05 → 06 → 07 → 08. Steps 05/06/07 sao auditorias independentes do mesmo codigo imutavel, mas executam em sequencia conforme a cadeia declarada — o frontmatter `expected_next: 7` reflete essa ordem.

## Regras

- Nao implemente codigo nesta etapa — apenas auditoria.
- Cada finding carrega tag de evidencia: `[VERIFICADO]` (linha exata do codigo confirmada), `[HIPOTESE]` (suspeita por padrao mas exige confirmacao), `[DESIGN]` (decisao explicita do design doc; nao e violacao automatica).
- Cada finding tem `arquivo:linha` quando aplicavel.
- Nao sugerir abstracoes que excedem o escopo da spec — YAGNI vai nos dois sentidos.

---

## Inputs

- `tasks_completed` (do step 04) — lista de tasks `[x]` com arquivos modificados.
- `spec_context` — feature, scope, files_affected, business_rules.
- Acesso ao codigo do repo (read-only).

---

## Eixos de auditoria

### SOLID — verificacao por principio

- **SRP (Single Responsibility):** cada classe/modulo tem uma razao para mudar? Findings: classes que misturam parsing + validation + persistence em um so lugar.
- **OCP (Open/Closed):** extensao via abstracao em vez de modificacao? Findings: switch gigante, ifs encadeados por tipo (smell de Strategy nao usada).
- **LSP (Liskov Substitution):** subtipos sao substituiveis sem quebrar comportamento? Findings: subclasses que lancam UnsupportedOperationException.
- **ISP (Interface Segregation):** interfaces focadas? Findings: interfaces "god" com 20+ metodos sem agrupamento.
- **DIP (Dependency Inversion):** modulos de alto nivel dependem de abstracoes? Findings: instanciacao direta de classes concretas em vez de DI.

### DRY (Don't Repeat Yourself)

Listar duplicacao de logica, constantes ou regra de negocio. Tags: `DUPLICATE` (mesmo codigo em 2+ lugares), `LIKELY_DUPLICATE` (estrutura similar; investigar).

### YAGNI (You Aren't Gonna Need It)

Listar codigo especulativo: features nao requisitadas pela spec, parametros opcionais nunca passados, abstracoes para futuro hipotetico.

### SSOT (Single Source of Truth)

Listar conceitos de estado armazenados em mais de um lugar (ex: mesma config em dois arquivos diferentes; mesma constante em codigo + DB).

### Code smells e riscos de manutencao

- **Long functions:** funcoes com >50 linhas ou >5 parametros.
- **Excessive coupling:** modulo que importa de 10+ outros modulos.
- **Cyclomatic complexity:** funcoes com >10 caminhos.
- **Fragility:** padroes que fazem mudancas pequenas exigirem mudancas em muitos arquivos.
- **Rigidity:** padroes que impedem a evolucao natural do dominio.

---

## Severidade dos findings

| Severidade | Criterio |
|---|---|
| BLOCKER | Viola SOLID/DRY/SSOT em ponto critico do dominio; bloqueia release. |
| HIGH | Code smell relevante que afeta manutencao em prazo curto. |
| MEDIUM | Acoplamento ou duplicacao em area secundaria. |
| LOW | Estilistico ou potencial; nao bloqueia. |

---

## Score de arquitetura

```
Score = 100 - (10 * BLOCKERs + 5 * HIGHs + 2 * MEDIUMs + 0.5 * LOWs)
floor at 0
```

| Score | Veredicto |
|---|---|
| ≥ 90 | **PASS** (arquitetura solida) |
| 75-89 | **PASS_WITH_WARNINGS** (correcoes recomendadas) |
| < 75 | **FAIL** (correcoes obrigatorias antes do step 09) |

---

## Formato de resposta obrigatorio

```markdown
## ARCHITECTURE AUDIT (HEAVY) — [feature-name]

### SOLID
- SRP: [VERIFICADO] PaymentService at src/payment.ts:30 mistura parsing + validation + persist (HIGH)
- OCP: [HIPOTESE] switch sobre tipo de pagamento em src/router.ts:12 — Strategy ausente (MEDIUM)
- LSP: PASS
- ISP: PASS
- DIP: [VERIFICADO] DatabaseClient instanciado direto em src/repo.ts:18 sem DI (HIGH)

### DRY
- [VERIFICADO] regra de validacao de email em src/auth.ts:42 e src/profile.ts:67 (DUPLICATE — MEDIUM)

### YAGNI
- [VERIFICADO] parametro `optionsExtended` em src/api.ts:90 declarado mas nunca passado (LOW)

### SSOT
- PASS

### Code smells
- src/order.ts:45 — funcao com 78 linhas e 7 parametros (HIGH)
- src/notify.ts — importa de 12 modulos (MEDIUM)

### Sumario por severidade
- BLOCKERs: 0
- HIGHs: 3
- MEDIUMs: 2
- LOWs: 1

### Score: 80/100
### Veredicto: PASS_WITH_WARNINGS
```

---

## Sem gate AskUserQuestion proprio

Step 06 nao emite gate proprio — findings sao consumidos pelo step 08 (confidence dashboard) e pelo step 09 (closure). O usuario aprova o consolidado em step 08 indireto e em step 09 direto via spec-closer.

---

**Proximo step:** 07 (sequencial)
