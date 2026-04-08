# Example: Complex Audit

A complete walkthrough of a complex security audit through the pipeline, showing single-task batches, full adversarial review with all 7 checklists, severity-classified findings, and final report generation.

---

## User Input

```
/pipeline audit the authentication module for security vulnerabilities
```

---

## Phase 0: Automatic Triage

The **task-orchestrator** classifies the request.

### Classification Result

```
+==================================================================+
|  TASK-ORCHESTRATOR v2 - PROPOSAL READY                            |
|  Type: Audit                                                      |
|  Complexity: COMPLEXA                                             |
|  Pipeline: audit-heavy                                            |
|  Info-Gate: 2 GAPS DETECTED                                       |
|  Status: RESOLVING GAPS                                           |
+==================================================================+
```

**Why COMPLEXA?** Audits inherently touch many files, require deep analysis across the entire authentication surface, and produce findings that may have security implications. The pipeline automatically escalates audits of security-sensitive modules to COMPLEXA.

### Information Gate

The information-gate detects two gaps:

```
+==================================================================+
|  INFORMATION-GATE                                                  |
|  Gaps detected: 2                                                  |
|  Status: ASKING (1 question at a time)                            |
+==================================================================+
```

**Question 1:**
```
What is the scope of the audit?
  A) Authentication only (login, logout, token management)
  B) Authentication + Authorization (access control, roles, permissions)
  C) Full auth surface (A + B + session management + OAuth flows)
```

**User:** `C, full auth surface`

**Question 2:**
```
Is there a known baseline or previous audit to compare against?
  A) Yes (provide path or reference)
  B) No, this is the first audit
```

**User:** `B, first audit`

```
+==================================================================+
|  INFORMATION-GATE - COMPLETE                                       |
|  Gaps detected: 2                                                  |
|  Gaps resolved: 2                                                  |
|  Status: RESOLVED                                                  |
+==================================================================+
```

---

## Phase 1: Proposal

```
PIPELINE PROPOSAL:

  Type:       Audit
  Complexity: COMPLEXA
  Pipeline:   audit-heavy
  Batch size: 1 task per batch (maximum control)
  Adversarial: COMPLETE (all 7 checklists)
  Sanity:     build + tests + regression

  Audit tasks:
    1. Map authentication surface (endpoints, flows, entry points)
    2. Analyze token management (creation, validation, expiration, refresh)
    3. Review session handling (storage, invalidation, fixation)
    4. Inspect OAuth/SSO integration (state param, redirect validation)
    5. Check authorization enforcement (RBAC, resource ownership)
    6. Assess credential handling (storage, transmission, rotation)
    7. Consolidate findings into audit report

  NOTE: Audit pipelines do NOT implement fixes.
  Output is a findings report with severity classifications.

  Confirm? (yes / no / adjust)
```

**User:** `yes`

---

## Phase 2: Execution

For COMPLEXA audits, each task runs in its own batch with full adversarial review after each. The audit pipeline does not write code -- it reads, analyzes, and reports.

### Batch 1: Task 1 -- Map Authentication Surface

The executor analyzes the codebase to build a complete map:

```
Authentication Surface Map:
  Endpoints: 12 (8 protected, 3 public, 1 unclear)
  Auth flows: login (email+password), login (OAuth/Google), signup, password-reset
  Token types: JWT access token, refresh token (httpOnly cookie)
  Session store: server-side (database-backed)
  Entry points: web app, mobile API, admin panel
```

**Adversarial (Batch 1) -- COMPLETE intensity, all 7 checklists:**

```
Findings from surface mapping:
  1. [HIGH] 1 endpoint with unclear protection status
     Checklist: auth
     Details: /api/user/export has no visible auth middleware
```

### Batch 2: Task 2 -- Token Management

```
Token Analysis:
  Access token: JWT, signed with RS256, 15-min expiry
  Refresh token: opaque, stored in httpOnly cookie, 7-day expiry
  Rotation: refresh tokens are single-use (rotated on each refresh)
```

**Adversarial (Batch 2):**

```
Findings:
  2. [MEDIUM] Token expiration not validated on every request
     Checklist: auth
     Details: Middleware caches decoded token; a revoked token
     may remain valid until cache expires (up to 60 seconds)
```

### Batch 3: Task 3 -- Session Handling

```
Session Analysis:
  Storage: database with session ID in signed cookie
  Invalidation: logout deletes server record
  Concurrent sessions: unlimited (no cap)
```

**Adversarial (Batch 3):**

```
Findings:
  3. [LOW] No limit on concurrent sessions per user
     Checklist: auth
     Details: A compromised account could maintain unlimited
     active sessions without triggering alerts
```

### Batch 4: Task 4 -- OAuth/SSO

```
OAuth Analysis:
  Provider: Google (OpenID Connect)
  State parameter: present, validated
  Redirect URI: validated against allowlist
  PKCE: not implemented (recommended for public clients)
```

**Adversarial (Batch 4):**

```
Findings:
  4. [MEDIUM] PKCE not implemented for OAuth flow
     Checklist: auth
     Details: Public clients (SPA, mobile) should use PKCE
     to prevent authorization code interception
```

### Batch 5: Task 5 -- Authorization Enforcement

```
Authorization Analysis:
  Model: role-based (admin, user, guest)
  Enforcement: middleware on API routes
  Resource ownership: checked via user ID in most queries
```

**Adversarial (Batch 5):**

```
Findings:
  5. [HIGH] 2 admin endpoints missing role check
     Checklist: auth
     Details: /api/admin/users/bulk-delete and /api/admin/config
     only check authentication, not admin role

  6. [MEDIUM] Resource ownership check missing on 1 endpoint
     Checklist: data-integrity
     Details: /api/user/:id/export does not verify the
     requesting user matches the :id parameter
```

### Batch 6: Task 6 -- Credential Handling

```
Credential Analysis:
  Password hashing: bcrypt (cost factor 12)
  Transmission: HTTPS only (HSTS enabled)
  Storage: hashed, no plaintext
  Rotation: no forced rotation policy
```

**Adversarial (Batch 6):**

```
Findings:
  7. [LOW] No rate limiting on password reset endpoint
     Checklist: input-validation
     Details: /api/auth/reset-password can be called
     without throttling, enabling enumeration
```

### Batch 7: Task 7 -- Consolidate Report

The executor compiles all findings into a structured audit report.

---

## Phase 3: Closure

### Sanity Check

```
+==================================================================+
|  SANITY-CHECKER                                                    |
|  Build: PASS (no code changes -- audit only)                      |
|  Tests: PASS (no test changes)                                    |
|  Scope: PASS (read-only analysis, 0 files modified)              |
+==================================================================+
```

### Final Validator

```
+==================================================================+
|  FINAL-VALIDATOR                                                   |
|  Decision: GO (Report Complete)                                    |
|  Findings: 7 total                                                |
|    HIGH:   2 (admin role bypass, unprotected endpoint)            |
|    MEDIUM: 3 (token cache, PKCE, ownership check)                |
|    LOW:    2 (concurrent sessions, rate limiting)                 |
+==================================================================+
```

### Audit Report Summary

The final report is saved to the configured `doc_path`:

```
SECURITY AUDIT REPORT: Authentication Module

Date: [timestamp]
Scope: Full auth surface (authn + authz + sessions + OAuth)
Baseline: First audit (no prior reference)

FINDINGS BY SEVERITY:

  HIGH (2):
    F-1: Unprotected endpoint /api/user/export
    F-5: Admin endpoints missing role check (2 endpoints)

  MEDIUM (3):
    F-2: Token validation cache allows 60s window after revocation
    F-4: PKCE not implemented for OAuth public clients
    F-6: Resource ownership bypass on /api/user/:id/export

  LOW (2):
    F-3: No concurrent session limit
    F-7: No rate limiting on password reset

RECOMMENDED PRIORITY:
  1. Fix F-1 and F-5 immediately (HIGH, authorization bypass)
  2. Fix F-6 in next sprint (MEDIUM, data exposure risk)
  3. Implement F-2 and F-4 (MEDIUM, defense-in-depth)
  4. Address F-3 and F-7 in backlog (LOW, hardening)
```

### Closeout

Since this is an audit (no code changes), the pipeline skips commit/PR options and presents:

```
Audit complete. Report saved to: [doc_path]/[timestamp]/audit-report.md

Next steps:
  1. Review findings with your team
  2. Create tasks/tickets for each finding by priority
  3. Run /pipeline fix [finding] to address individual issues
```

---

## Summary

| Phase | Duration | Key Events |
|-------|----------|------------|
| Triage | ~10s | Classified as Audit/COMPLEXA |
| Information Gate | ~1 min | 2 gaps (scope + baseline) |
| Proposal | User confirmation | 7 audit tasks, 1-per-batch |
| Batches 1-6 | ~8-12 min | Deep analysis, 7 findings across 6 batches |
| Batch 7 | ~1 min | Report consolidation |
| Closure | ~10s | GO, report saved |

**Total pipeline time:** About 10-15 minutes for a thorough security audit.

**Key takeaway:** The COMPLEXA classification ensures every batch gets a full adversarial review with all 7 checklists. Running 1 task per batch gives maximum granularity -- each area of the auth surface is analyzed and reviewed independently before moving to the next. The output is actionable findings, not code changes, respecting the audit pipeline's read-only nature.
