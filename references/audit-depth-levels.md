# Audit Depth Levels (R-3)

**SSOT:** Este arquivo.
**Origem:** Slice 0 R-3 (`designs/pipeline-orchestrator-v5-consolidated.md` §12.3.3).
**Aplicável a:** `audit-light` e `audit-heavy` pipelines (`references/pipelines/audit-light.md`, `audit-heavy.md`).

---

## Problema que esta doc resolve

Spec V5 menciona "1 nível de profundidade" para audit-light vs "níveis 1+2+3" para audit-heavy, mas não define o que cada nível inclui concretamente. Sem isso, audits ficam inconsistentes — auditor decide ad hoc.

Esta doc define os 3 níveis canônicos por domínio, com checklist mínimo verificável.

---

## Níveis canônicos

### Nível 1 — Cobertura básica (presença e tipo)

**Pergunta:** *"Existe? E é da forma certa?"*

Verifica que o sistema tem o componente esperado e que a forma macro está correta. Sem entrar em config detalhada nem edge case.

### Nível 2 — Configuração detalhada

**Pergunta:** *"Está configurado de forma segura/correta?"*

Inspeciona valores de config, defaults, tradeoffs. Mapeia configurações reais contra spec/PRD.

### Nível 3 — Threat model + edge cases

**Pergunta:** *"Como isso pode falhar ou ser explorado?"*

Análise adversarial. Race conditions, attack surface, modos de falha não documentados.

---

## Mapeamento por domínio

### Domain: `auth`

| Nível | Checklist | Exemplo |
|---|---|---|
| **1** | Existe sistema de auth? Tipo (session/JWT/OAuth)? Surface area (rotas protegidas)? | "App usa JWT, rotas /api/* protegidas via authMiddleware, login em /auth/login" |
| **2** | Algoritmo JWT (HS256 vs RS256)? Expiry curto (≤24h)? Refresh token? Storage (cookie httpOnly vs localStorage)? CORS config? | "JWT HS256, secret env, expiry 1h, refresh /auth/refresh, cookie httpOnly+secure+sameSite=strict, CORS allowlist 3 origins" |
| **3** | Token replay? CSRF (se cookie)? Timing attacks? Brute force mitigation? Logout invalida server-side? MFA? | "Replay: nonce ausente — risk medium. CSRF: protegido por sameSite. Brute force: rate limit 5/min via redis. Logout: blacklist redis TTL=expiry" |

### Domain: `data-model`

| Nível | Checklist |
|---|---|
| **1** | Quais entidades? Relações principais? Onde armazena? |
| **2** | Constraints (FK, unique, not null)? Migrations versionadas? Indexes? Soft vs hard delete? |
| **3** | Race conditions (read-modify-write sem lock)? GDPR/PII? Backup+restore testado? Schema drift? |

### Domain: `crypto`

| Nível | Checklist |
|---|---|
| **1** | Onde se usa crypto? Algoritmo? Biblioteca? |
| **2** | Key length (≥256 AES, ≥2048 RSA)? IV/nonce único? Key rotation? HSM ou env? |
| **3** | Side-channel (timing, padding oracle)? Downgrade attacks? Replay? Forward secrecy? |

### Domain: `payment`

| Nível | Checklist |
|---|---|
| **1** | Provider? PCI scope? Onde dispara cobrança? |
| **2** | Idempotency key? Webhook signature? Retry strategy? Reconciliation? |
| **3** | Double-charge prevention? Fraud detection? Refund + race? Auditoria financeira? |

### Domain: `error-handling`

| Nível | Checklist |
|---|---|
| **1** | Exceptions capturadas no boundary? Logs estruturados? Status codes corretos? |
| **2** | 4xx vs 5xx distinction? Mensagens não vazam stack trace? Retry em chamadas externas? |
| **3** | Cascading failures (circuit breaker)? Bulkheading? Timeout em I/O? Graceful degradation? |

### Domain: `input-validation`

| Nível | Checklist |
|---|---|
| **1** | Validação no boundary? Schema declarado (Zod/Joi)? |
| **2** | Coverage: todos endpoints? Type coercion explícito? Size limits? |
| **3** | Injection (SQL, NoSQL, command, LDAP)? Mass assignment? Prototype pollution? DoS via input size? |

### Domain: `business-logic`

| Nível | Checklist |
|---|---|
| **1** | Regras centralizadas em domain layer? Não duplicadas em UI/API? |
| **2** | Invariantes documentadas? Transações atômicas? Idempotência? |
| **3** | Race conditions concorrentes? Consistência eventual vs forte? Compensating transactions? |

---

## Mapeamento Pipeline → Níveis

| Pipeline | Domínios cobertos | Nível por domínio |
|---|---|---|
| `audit-light` | Domínios em `domains_touched` do classifier | **Nível 1 apenas** |
| `audit-heavy` | Domínios em `domains_touched` | **Níveis 1 + 2 + 3** |

**Exemplo concreto (R-3 do consolidado):**

> **Cenário:** `audit-light` com `domain=auth`.
> **Resultado:** Auditor roda APENAS Nível 1 — verifica presença, tipo, surface area. NÃO entra em config detalhada (Nível 2) nem threat model (Nível 3).
> **Output:** "Sistema usa JWT, rotas /api/* protegidas, login em /auth/login. Para audit completo, invocar `audit-heavy`."

> **Cenário:** `audit-heavy` com `domain=auth`.
> **Resultado:** Auditor roda Níveis 1 + 2 + 3. Output completo com findings de config e threat model.

---

## Convenção de output

Cada finding deve incluir:
- `domain`: string (do mapping)
- `level`: 1 | 2 | 3
- `severity`: Critical | High | Medium | Low | Info
- `evidence`: `file:line` ou path
- `recommendation`: 1-2 frases acionáveis

Exemplo:
```yaml
- domain: auth
  level: 2
  severity: Medium
  evidence: src/auth/jwt.ts:14 (algorithm: 'HS256', secret: process.env.JWT_SECRET)
  recommendation: "Migrar para RS256 para suportar rotação de keys sem invalidar tokens existentes."
```

---

## Quando subir/descer de nível

- **Light → Heavy:** se findings Nível 1 sugerem problemas estruturais, promover para audit-heavy daquele domínio.
- **Heavy → Light:** raro. Só se usuário pedir resumo executivo após heavy.
- **Skip de nível:** **proibido.** Não é válido fazer "Nível 3 sem Nível 1" — perde-se contexto base.

---

V1.0 — 2026-04-30 — versão inicial (R-3 do Slice 0).
