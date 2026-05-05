---
step_number: 07
step_name: "security-review"
description: "Spec Heavy: Security review — 8 axes, red-team adversarial perspective"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:adversarial-security-scanner"
expected_inputs:
  - tasks_completed: from_step_04
  - spec_context: from_spec_context_yaml
expected_outputs:
  - security_report: object
  - threat_model: object
  - security_score: number
expected_next: 8
gate_required: false
allowed_tools: [Read, Grep, Glob, Bash]
---

# Spec Lifecycle (Heavy) — Step 07: Security Review (8 eixos red-team)

> **Position in pipeline:** Step 7 — terceiro dos 3 audits independentes pos-implementation. Foco em superficie de ataque, vulnerabilidades, threat model.
> **Goal:** Auditar a implementacao contra 8 eixos de seguranca com perspectiva adversarial (red-team), produzir threat model simplificado e score de seguranca 0-10 com recomendacoes priorizadas.

---

## Quando usar

Use apos a Implementation (step 04) ter terminado. Roda em paralelo com steps 05 (post-impl-validation) e 06 (architecture-audit). Sem gate proprio — sera consumido pelo step 08 (confidence dashboard) e pelo step 09 (closure).

## Paralelismo

Steps 05, 06 e 07 sao independentes — todos auditam o mesmo codigo imutavel e nao se modificam mutuamente. O orchestrator e ENCORAJADO a dispatcha-los em paralelo (single-message com 3 Agent calls). `expected_next: 8` no frontmatter mantem ordem sequencial por seguranca de schema, mas paralelo e o caminho recomendado.

## Regras

- Perspectiva adversarial: pense como atacante, nao como defensor confiante.
- Cada finding carrega tag de evidencia: `[VERIFICADO]` (vulnerabilidade confirmada via leitura), `[HIPOTESE]` (suspeita por padrao), `[DESIGN]` (limitacao explicita do design — pode ou nao ser bug).
- Cada finding tem `arquivo:linha` quando aplicavel.
- Cross-check com requisitos LGPD / GDPR / PCI-DSS quando spec_context.business_rules mencionar dados sensiveis.

---

## Inputs

- `tasks_completed` (do step 04) — arquivos modificados pela implementacao.
- `spec_context` — feature, scope, business_rules, domains_touched.
- Acesso ao codigo do repo (read-only) e a arquivos de configuracao.

---

## Os 8 eixos

### Eixo 1 — Authentication

Fluxos de login, geracao/validacao de tokens, sessoes. Findings: tokens sem expiracao, refresh sem rotacao, sessao sem invalidacao no logout, hash de senha fraco.

### Eixo 2 — Authorization

RBAC, permissoes, prevencao de privilege escalation. Findings: endpoints sem checagem de role, IDOR (referencias diretas inseguras), elevacao via parametros confiaveis.

### Eixo 3 — Input validation

Sanitizacao, escape, prevencao de injection (SQL, NoSQL, command, XSS, path-traversal). Findings: queries concatenadas, ausencia de validacao de tipo, exec/eval sobre input.

### Eixo 4 — Sensitive data exposure

Encryption at rest, in transit, PII handling, retention. Findings: dados sensiveis em logs, sem encryption em DB, headers expostos, LGPD/GDPR violations.

### Eixo 5 — Configuration

Secrets management, CORS, security headers, defaults seguros. Findings: secrets em codigo/git, CORS `*`, headers `X-Content-Type-Options` / `Strict-Transport-Security` / `Content-Security-Policy` ausentes.

### Eixo 6 — Dependencies

Vulnerabilidades conhecidas em libs, supply-chain risks, lockfile drift. Findings: libs com CVEs publicos, versoes nao pinadas, dependencias diretas de fonte nao confiavel.

### Eixo 7 — Business logic

Race conditions, TOCTOU, bypass de regras de negocio via reordenacao de chamadas. Findings: operacoes nao-atomicas, double-spend, replay attack possivel, validacao apenas no client.

### Eixo 8 — API & rate limiting

Rate limiting, lockout policies, error responses que vazam informacao, endpoints sensiveis sem auth. Findings: brute-force possivel em login, mensagens de erro distinguem "user not found" de "wrong password", debug endpoints em prod.

---

## Threat model simplificado

Para cada feature, emitir um mini threat model:

```yaml
threat_model:
  actors:
    - external_attacker (unauth, internet)
    - authenticated_user (regular role)
    - privileged_user (admin role)
    - insider (engineer with prod access)
  surfaces:
    - public API endpoints: [list]
    - internal API endpoints: [list]
    - data stores accessed: [list]
    - integrations: [list]
  vectors:
    - vector_id: short description
    - relevant axes: [1, 3]
    - severity: BLOCKER | HIGH | MEDIUM | LOW
```

---

## Severidade dos findings

| Severidade | Criterio |
|---|---|
| BLOCKER | Vulnerabilidade explorable sem condicao especial; bloqueia release. |
| HIGH | Vulnerabilidade explorable com condicao razoavel (ex: usuario autenticado mal-intencionado). |
| MEDIUM | Defesa em profundidade ausente; exige condicao improvavel ou cadeia de outras falhas. |
| LOW | Hardening recomendado; nao bloqueia. |

---

## Score de seguranca (0-10)

```
Score = 10 - (3 * BLOCKERs + 1.5 * HIGHs + 0.5 * MEDIUMs + 0.1 * LOWs)
floor at 0
```

| Score | Veredicto |
|---|---|
| ≥ 9.0 | **PASS** |
| 7.5 - 8.9 | **PASS_WITH_WARNINGS** |
| < 7.5 | **FAIL** (correcoes obrigatorias) |

Qualquer BLOCKER forca FAIL independente do score numerico.

---

## Formato de resposta obrigatorio

```markdown
## SECURITY REVIEW (HEAVY) — [feature-name]

### Threat model
- Actors: [external, authenticated, privileged, insider]
- Surfaces: [/api/payment, /api/admin, postgres:payments, stripe webhook]
- Vectors:
  - V1: external_attacker forja token JWT (eixo 1) — HIGH
  - V2: authenticated_user via IDOR le pagamentos de outro user (eixo 2) — BLOCKER

### Eixo 1 — Authentication
- [VERIFICADO] JWT sem expiracao em src/auth.ts:55 (HIGH)

### Eixo 2 — Authorization
- [VERIFICADO] GET /api/payment/:id nao verifica owner em src/payment_route.ts:30 (BLOCKER — IDOR)

### Eixo 3 — Input validation
- PASS

### Eixo 4 — Sensitive data exposure
- [VERIFICADO] CPF logado em src/audit.ts:88 sem mascaramento (HIGH — LGPD)

### Eixo 5 — Configuration
- [VERIFICADO] CORS Allow-Origin: * em src/server.ts:12 (MEDIUM)

### Eixo 6 — Dependencies
- PASS (lockfile checado, 0 CVEs critical/high)

### Eixo 7 — Business logic
- [HIPOTESE] Race condition possivel em createOrder em src/order.ts:120 — investigar (MEDIUM)

### Eixo 8 — API & rate limiting
- [VERIFICADO] /api/login sem rate limit (HIGH — brute force possivel)

### Sumario por severidade
- BLOCKERs: 1
- HIGHs: 3
- MEDIUMs: 2
- LOWs: 0

### Score: 4.5 / 10
### Veredicto: FAIL

### Recomendacoes priorizadas
1. [BLOCKER] Adicionar verificacao de owner em GET /api/payment/:id (eixo 2)
2. [HIGH] Adicionar exp claim ao JWT + rotacao (eixo 1)
3. [HIGH] Mascarar CPF em logs (eixo 4)
4. [HIGH] Rate limit em /api/login (eixo 8)
```

---

## Sem gate AskUserQuestion proprio

Step 07 nao emite gate proprio — findings sao consumidos pelo step 08 e pelo step 09. BLOCKERs detectados aqui forcam o step 09 (spec-closer) a emitir status `NOT READY` no relatorio executivo.

---

**Proximo step:** 08 (sequencial); pode ter rodado em paralelo com 05 e 06
