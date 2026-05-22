---
name: pipeline-orchestrator-audit-method
description: Metodo de auditoria de codebase em 4 fases — Intake (inventory), Domain Analyzer (arquitetura + SSOT), Compliance Checker (integrity + security), Risk Matrix (priorizacao + backlog). Usado pelos cargos audit-*.
when_to_use: Pipeline tipo Audit. Carregada por audit-intake, audit-domain-analyzer, audit-compliance-checker, audit-risk-matrix-generator.
---

# pipeline-orchestrator-audit-method

Audit pipeline e SEMPRE read-only. Produz relatorios com tags de evidencia: `VERIFIED`, `HYPOTHESIS`, `DESIGN`.

## 1. Fase 1 — Intake (`audit-intake`)

Inventario tecnico do repo. NAO julga, so cataloga.

### 1.1 Stack identification

```yaml
languages:
  python: {files: 142, lines: 18403, top_files: [...]}
  typescript: {files: 67, lines: 5234, top_files: [...]}
  yaml/json: {files: 23, role: config}
frameworks:
  - name: FastAPI
    version: "0.104.1"
    evidence: "pyproject.toml:42"
  - name: SQLAlchemy
    version: "2.0.23"
build_tools: ["poetry", "pnpm"]
package_managers: ["pypi", "npm"]
```

### 1.2 Repo mapping

```yaml
top_level_dirs:
  - path: src/api/
    role: "HTTP layer (FastAPI routers)"
    files_count: 45
  - path: src/service/
    role: "Business logic"
    files_count: 78
  - path: tests/
    role: "Tests (pytest)"
    coverage_command: "pytest --cov=src"
```

### 1.3 Entry points

```yaml
entry_points:
  - type: cli
    file: src/cli/main.py
    command: "python -m src.cli"
  - type: http_server
    file: src/api/app.py
    command: "uvicorn src.api.app:app"
  - type: worker
    file: src/worker/main.py
    command: "celery -A src.worker worker"
```

### 1.4 Hotspots (heuristica)

```yaml
hotspots:
  - file: src/service/billing.py
    lines: 1843
    why: "size, churn, complexidade ciclomatica > 20"
  - file: src/api/auth.py
    lines: 412
    why: "auth-critical + recente churn"
```

### 1.5 Saida fase 1

```markdown
### AUDIT_INTAKE v1

```yaml
stack_summary: {...}
repo_map: {...}
entry_points: {...}
hotspots: {...}
evidence_classification_ready: true
```
```

Dispatch → audit-domain-analyzer.

## 2. Fase 2 — Domain Analyzer (`audit-domain-analyzer`)

Analise arquitetural profunda. Mapeia modelo de dominio + SSOT + business rules.

### 2.1 Architecture analysis

```yaml
architecture_pattern: "Layered (Controller → Service → Repository)"
layer_violations:
  - description: "src/api/checkout.py:88 importa direto src/db/order.py (pula service)"
    severity: medium
deviation_from_design:
  - {{coisas que o codigo faz diferente do documentado, se houver design.md}}
```

### 2.2 Domain model mapping

```yaml
entities:
  - name: Order
    file: src/models/order.py
    fields: [id, customer_id, total, status, ...]
    invariants: ["total = sum(items.price * items.qty)"]
relationships:
  - "Order -> Customer (N:1)"
  - "Order -> LineItem (1:N)"
```

### 2.3 SSOT verification

Para cada conceito-chave, identificar **o** lugar canonico:

```yaml
ssots:
  - concept: "Order total calculation"
    canonical: "src/service/order_calc.py:total()"
    duplicates: []  # idealmente vazio
    drift_risk: low
  - concept: "User permissions check"
    canonical: "src/service/auth.py:has_permission()"
    duplicates: ["src/api/middleware.py:check_perm (RESEMBLES)"]
    drift_risk: HIGH
```

### 2.4 Business rules extraction

```yaml
rules:
  - id: BR-001
    statement: "Order cannot be > $10,000 without manager approval"
    location: src/service/order.py:142
    evidence_tag: VERIFIED
  - id: BR-002
    statement: "Returns within 30 days, no fee"
    location: docs/policy.md  # only in docs, not in code
    evidence_tag: DESIGN  # documented but unimplemented
```

### 2.5 Saida fase 2

```markdown
### DOMAIN_ANALYSIS v1

```yaml
architecture: {...}
domain_model: {...}
ssots: {...}
business_rules: {...}
```
```

## 3. Fase 3 — Compliance Checker (`audit-compliance-checker`)

Auditoria de qualidade transversal: data integrity, security patterns, governance, test coverage.

### 3.1 Data integrity

```yaml
data_integrity_issues:
  - file: src/db/migrations/0042_user.sql
    issue: "Adiciona NOT NULL em coluna de 50M rows sem backfill explicito — vai travar"
    severity: HIGH
    tag: VERIFIED
```

### 3.2 Security patterns

```yaml
security:
  auth_checks: "Sempre server-side (src/middleware/auth.py:guard)"
  secret_handling: "ENV vars only; .env.example sem secrets"
  sql_injection_resistance: "SQLAlchemy parametrized queries throughout"
  vulnerabilities_observed:
    - file: src/api/upload.py:23
      issue: "path traversal — usuario controla `filename` sem sanitizar"
      severity: HIGH
      tag: VERIFIED
```

### 3.3 Governance

```yaml
governance:
  code_review_required: "GitHub branch protection: 1 approver"
  ci_passes_blocking: true
  pr_template_used: false  # falta
  changelog_maintained: true
  semantic_versioning: true
```

### 3.4 Test coverage

```yaml
test_coverage:
  overall: 67%
  critical_paths_coverage:
    src/service/billing.py: 81%
    src/api/auth.py: 92%
    src/service/checkout.py: 34%  # GAP
  test_strength:
    weak_assertions: 12  # testes que so checam "not None" sem validar conteudo
```

### 3.5 Saida fase 3

```markdown
### COMPLIANCE_REPORT v1

```yaml
data_integrity: {...}
security: {...}
governance: {...}
test_coverage: {...}
critical_findings: [F1, F5]  # tudo HIGH ou CRITICAL
```
```

## 4. Fase 4 — Risk Matrix (`audit-risk-matrix-generator`)

Consolida todos os findings das 3 fases anteriores e produz risk matrix + backlog priorizado.

### 4.1 Consolidate findings

```yaml
findings_all:
  - id: F1
    source: audit-domain-analyzer
    description: "Drift SSOT: permission check duplicado"
    severity: HIGH
    evidence_tag: VERIFIED
    file_evidence: "src/service/auth.py:142, src/api/middleware.py:88"
  # ... todos os findings
```

### 4.2 Risk matrix (probability x impact)

```yaml
risk_matrix:
  critical_high:  # immediate action
    - F1: "Permission drift will leak to user privilege escalation"
  high_medium:  # next sprint
    - F5: "Migration sem backfill vai causar downtime"
  medium_low:
    - F12: "Test coverage gap em checkout"
  low_low:
    - F20: "Cosmetic - pr template ausente"
```

### 4.3 Priority backlog

```yaml
backlog:
  - rank: 1
    finding: F1
    estimated_effort: medium
    business_value: high (prevent breach)
    recommended_owner: cto
  - rank: 2
    finding: F5
    estimated_effort: high
    business_value: high (prevent downtime)
    recommended_owner: cto + plano-architect
  # ...
```

### 4.4 Recommendations executive

```yaml
recommendations:
  immediate:
    - "Resolver F1 e F5 antes de proximo deploy"
  next_quarter:
    - "Aumentar test coverage de critical paths pra >80%"
    - "Implementar pr template + linting de specs"
  strategic:
    - "Consolidar SSOTs para reduzir drift risk"
```

### 4.5 Saida fase 4

```markdown
### AUDIT_REPORT v1

```yaml
total_findings: 47
by_severity: {critical: 2, high: 8, medium: 18, low: 19}
by_evidence_tag: {VERIFIED: 31, HYPOTHESIS: 11, DESIGN: 5}
risk_matrix: {...}
backlog: {...}
recommendations: {...}
verdict: NEEDS_ATTENTION  # CLEAN | NEEDS_ATTENTION | HIGH_RISK
```
```

## 5. Anti-padroes

❌ Findings sem `evidence_tag` (VERIFIED vs HYPOTHESIS vs DESIGN) — Board nao sabe o que confiar
❌ Findings sem `file:line` (Iron Law 5) — relatorio inacionavel
❌ "Eu acho que..." — auditoria eh evidence-based, nao opinion-based
❌ Inventar severity sem rubric (use a calibracao do `pipeline-orchestrator-adversarial`)
❌ Read-only violado (edit, write, run scripts destrutivos) — auditoria perde isencia
