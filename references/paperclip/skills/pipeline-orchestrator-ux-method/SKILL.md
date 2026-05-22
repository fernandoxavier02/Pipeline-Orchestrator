---
name: pipeline-orchestrator-ux-method
description: Metodo de UX review — persona matrix + jornadas + WCAG 2.1 AA accessibility + consolidacao com matriz de prioridade. Usado pelos cargos ux-*.
when_to_use: Pipeline tipo UX. Carregada por ux-simulator, ux-accessibility-auditor, ux-qa-validator.
---

# pipeline-orchestrator-ux-method

UX pipeline tem 3 cargos paralelos + 1 consolidador. Cada um tem foco distinto e read-only (NAO altera codigo).

## 1. Persona matrix (`ux-simulator`)

### 1.1 Cria a matriz

Antes de simular, definir 3-5 personas representativas:

```yaml
personas:
  - id: P1
    name: "Novato"
    attributes:
      experience: low
      domain_knowledge: zero
      device: mobile
      patience: low
    goals: ["Conseguir resultado X em < 3 cliques"]
  - id: P2
    name: "Power user"
    attributes:
      experience: high
      domain_knowledge: high
      device: desktop
      keyboard_only: true
    goals: ["Executar workflow Y rapidamente via teclado"]
  # ...
```

**Iron Law:** se o Board nao especificou personas, postar GATE_REQUEST pra confirmar matriz antes de simular. NAO inventar persona.

### 1.2 Simular jornadas

Para cada persona x jornada-chave:

```yaml
- persona: P1
  journey: "Cadastrar conta nova"
  steps:
    - action: "Abre site no mobile"
      experience: ok
      friction: 0
    - action: "Clica em 'Cadastrar'"
      experience: friction
      friction_type: "Botao em area menos clicavel; thumb-reach baixo"
      severity: medium
      file_evidence: "src/web/landing.tsx:42 — botao em top-right"
    - action: "Preenche email"
      experience: ok
    - action: "Recebe erro 'senha fraca' mas sem dica de como melhorar"
      experience: friction
      friction_type: "Error sem actionable guidance"
      severity: high
      file_evidence: "src/web/signup-form.tsx:88 — error message generic"
  outcome: completed_with_friction
```

### 1.3 Saida

```markdown
### UX_SIM_REPORT v1

```yaml
personas_simulated: 4
journeys_simulated: 12  # personas x journeys
friction_total: 23
friction_by_severity:
  high: 6
  medium: 10
  low: 7
top_friction_points: [F1, F5, F12]
```
```

## 2. Accessibility audit (`ux-accessibility-auditor`)

WCAG 2.1 nivel AA, em paralelo com ux-simulator (zero context entre eles).

### 2.1 Checks obrigatorios

| Categoria | Check | Tool/metodo |
|---|---|---|
| Keyboard | Todas funcoes via teclado (tab/enter/esc) | Manual tab traversal |
| Focus | Indicador visivel de focus | Inspect, contraste >3:1 |
| Contrast | Texto vs fundo >= 4.5:1 (>3:1 para large) | axe-core, ou calculo manual |
| Touch target | Min 44x44 px ou equivalent | Inspect dimensions |
| Aria | Labels semanticos, roles corretos | axe-core |
| Form labels | Cada input tem `<label>` ou aria-label | Inspect |
| Alt text | Imagens informativas tem alt; decorativas tem alt="" | Inspect |
| Heading hierarchy | h1 -> h2 -> h3 sem skip | Inspect |
| Color reliance | Info nao depende SO de cor | Inspect (filter grayscale) |
| Motion | Respeita prefers-reduced-motion | Inspect CSS |

### 2.2 Findings

```yaml
findings:
  - id: A11Y-001
    wcag: 1.4.3  # contraste minimo
    severity: high
    component: src/web/button.tsx
    line: 25
    issue: "Botao primario tem cor #888 em #fff, contraste 2.8:1 (precisa 4.5:1)"
    recommendation: "Trocar pra #555 ou darker (contraste 7.5:1)"
```

### 2.3 Saida

```markdown
### A11Y_AUDIT_REPORT v1

```yaml
wcag_level: AA
checks_total: 10
checks_failed: [contrast, touch_target]
findings_total: 12
findings_by_severity: {high: 4, medium: 5, low: 3}
remediation_estimate_hours: 6
```
```

## 3. Consolidacao (`ux-qa-validator`)

Apos ux-simulator + ux-accessibility-auditor fecharem, consolida:

### 3.1 Priorizar com matriz Impacto x Esforco

```yaml
findings_consolidated:
  - source: ux-simulator
    id: F1
    impact: high  # personas afetados / criticidade jornada
    effort: medium
  - source: ux-accessibility-auditor
    id: A11Y-001
    impact: high  # WCAG compliance + ampliacao alcance
    effort: low
  # ...

action_matrix:
  do_first: [A11Y-001, F1, A11Y-005]  # high impact, low effort
  do_soon: [F5, F12]  # high impact, medium effort
  do_eventually: [F8, F15]  # medium impact, medium effort
  reconsider: [F20]  # low impact, high effort
```

### 3.2 Saida

```markdown
### UX_QA_REPORT v1

```yaml
total_findings: 35
prioritized: [do_first: 5, do_soon: 12, do_eventually: 13, reconsider: 5]
recommended_release_blocker: [A11Y-001, A11Y-003]  # WCAG nivel AA criticos
recommended_next_sprint: [F1, F5]
verdict: SHIP_WITH_FIXES  # SHIP | SHIP_WITH_FIXES | BLOCK
```
```

## 4. Anti-padroes

❌ Auditor lendo issue description (enviesa o "como deveria funcionar")
❌ Simulator pulando persona que nao "casa com o produto" (cego pra publico real)
❌ Findings sem severity ou priority (impossivel acionar)
❌ Acessibilidade tratada como nice-to-have (compliance legal em muitas jurisdicoes)
❌ "O designer disse que esta OK" — usar essa skill eh independent review, nao gut-check
