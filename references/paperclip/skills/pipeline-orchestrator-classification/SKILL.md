---
name: pipeline-orchestrator-classification
description: Classificacao de tipo de tarefa (Feature, Bug Fix, User Story, Spec, UX, Audit, Adversarial Review) e nivel de complexidade (SIMPLES, MEDIA, COMPLEXA), com regras de roteamento. Usada por task-orchestrator e information-gate.
when_to_use: Inicio de qualquer issue nova. Cargo task-orchestrator usa pra emitir ORCHESTRATOR_DECISION e propor pipeline. Cargo information-gate usa pra ajustar profundidade do gate.
---

# pipeline-orchestrator-classification

Classificacao em duas dimensoes: **tipo da tarefa** + **complexidade**. Combinadas, definem qual pipeline (sub-conjunto dos 47 cargos) eh acionado e em que ordem.

## 1. Tipos de tarefa (7)

| Tipo | Sinal | Pipeline tipico |
|---|---|---|
| **Feature** | Cliente pediu nova capacidade. Tem "como [persona]" implicito | feature-vertical-slice-planner → feature-implementer → feature-integration-validator |
| **Bug Fix** | "Esta quebrado", "stack trace", "regressao", "esta dando erro em prod" | bugfix-diagnostic-agent → bugfix-root-cause-analyzer → executor-implementer-task → bugfix-regression-tester |
| **User Story** | Feature pequena com criterios de aceitacao curtos. Quase Feature mas slice menor | feature-vertical-slice-planner → feature-implementer (mais enxuto) |
| **Spec** | "Cria a spec", "produza design.md", "documente como deveria funcionar" | brainstorm-controller → spec-format-gate → spec-content-reviewer → spec-closer |
| **UX** | "Revise UX", "audita acessibilidade", "simula jornada do usuario" | ux-simulator + ux-accessibility-auditor (paralelos) → ux-qa-validator |
| **Audit** | "Audita", "revisa codigo legado", "mapeia riscos", "due diligence" | audit-intake → audit-domain-analyzer → audit-compliance-checker → audit-risk-matrix-generator |
| **Adversarial Review** | "Tenta quebrar", "red team", "review independente", "ataque" | adversarial-review-coordinator → adversarial-security-scanner + adversarial-architecture-critic + adversarial-quality-reviewer (paralelos) |

### Regra de fallback

Se a issue nao bater claramente em nenhum tipo, **postar GATE_REQUEST** perguntando ao Board qual tipo aplicar. NUNCA chutar.

## 2. Complexidade (3 niveis)

| Nivel | Sinais | Profundidade de gates |
|---|---|---|
| **SIMPLES** | <50 linhas mudadas, sem migration, sem mudanca de contrato publico, sem auth, 1 arquivo afetado | information-gate light + 1 reviewer |
| **MEDIA** | 50-200 linhas, 2-5 arquivos, sem mudanca de schema, com testes | information-gate + plan-architect + review-orchestrator |
| **COMPLEXA** | >200 linhas, multi-modulo, mudanca de schema/migration, auth/security, deploy/CI affected | full pipeline + design-interrogator + adversarial review |

### Modificadores que escalam complexidade

- "Producao": elevar pelo menos pra MEDIA
- "Auth", "payment", "user data": pelo menos COMPLEXA + adversarial
- "Quebrou em prod" (urgente): hotfix path mas SEMPRE com rollback plan

## 3. ORCHESTRATOR_DECISION (saida do task-orchestrator)

Apos classificar, emitir comment:

```markdown
### ORCHESTRATOR_DECISION v1

```yaml
task_type: {{Feature | Bug Fix | User Story | Spec | UX | Audit | Adversarial Review}}
complexity: {{SIMPLES | MEDIA | COMPLEXA}}
classification_signals:
  - "{{sinal especifico encontrado na issue}}"
pipeline_selected: "{{nome curto do pipeline tipico}}"
required_agents:
  - {{agent-1}}
  - {{agent-2}}
optional_agents:
  - {{agent-3}}
gates_enabled:
  - information-gate
  - {{outros}}
estimated_phases: [phase-1-name, phase-2-name, ...]
risk_factors:
  - "{{fator de risco identificado}}"
```
```

## 4. Logica de roteamento condicional

| Condicao | Adicao ao pipeline |
|---|---|
| `task_type == Bug Fix` | Adicionar `bugfix-regression-tester` no fim |
| `complexity == COMPLEXA` | Adicionar `design-interrogator` antes de plan-architect |
| `complexity == COMPLEXA` E producao | Adicionar `final-adversarial-orchestrator` antes de final-validator |
| `task_type == Spec` | Pular fase de execucao de codigo, ir direto pra spec lifecycle |
| Touch em auth/payment | Adicionar `adversarial-security-scanner` mandatorio |
| Touch em schema/migration | Adicionar `architecture-reviewer` mandatorio (revisao de migracao/schema) |

## 5. Quando proceder vs quando bloquear

Apos classificar, voce (task-orchestrator) DEVE postar GATE_REQUEST pro Board confirmar:

```markdown
### GATE_REQUEST v1

**question:** Confirmar classificacao e proximo passo?

**options:**
- **Aprovar e seguir (Recomendado)** — Tipo = X, Complexidade = Y, pipeline = Z. Vou disparar information-gate em seguida.
- **Reclassificar como [outro tipo]** — {{razao alternativa}}
- **Reduzir/aumentar complexidade** — {{justificativa}}
- **Cancelar** — Issue mal-formada, fechar
```

NUNCA siga direto pro pipeline sem essa confirmacao. Sempre.

## 6. Pre-checks rapidos antes de classificar

Antes de postar a decisao, valide:

1. ✓ A issue tem title E description?
2. ✓ A description tem ao menos um criterio de aceitacao explicito?
3. ✓ A issue tem assignee = voce?

Se algum NAO, voce esta sem informacao critica — postar `### INFORMATION_GAP` comment, status=blocked, exit.
