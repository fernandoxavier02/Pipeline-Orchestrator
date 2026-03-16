# Business Logic Security Checklist

Adversarial review checklist for business logic vulnerabilities. These issues are harder to detect than technical flaws because they exploit valid functionality in unintended ways.

## What to Check

### State Machine & Workflow
- [ ] Can steps be skipped or reordered? (e.g., payment before validation)
- [ ] Can completed workflows be re-entered or replayed?
- [ ] Are state transitions validated server-side (not just UI)?
- [ ] Can a user force an invalid state by manipulating requests?

### Authorization Logic
- [ ] Can users access resources belonging to other users?
- [ ] Are role checks enforced at every endpoint (not just UI)?
- [ ] Can privilege escalation occur through parameter manipulation?
- [ ] Are admin-only operations properly gated?

### Race Conditions
- [ ] Can concurrent requests create duplicate resources?
- [ ] Are credit/balance operations atomic?
- [ ] Can time-of-check/time-of-use (TOCTOU) bugs be exploited?
- [ ] Are database operations properly serialized where needed?

### Value Manipulation
- [ ] Can pricing, quantities, or amounts be manipulated client-side?
- [ ] Are discounts/credits validated server-side?
- [ ] Can negative values bypass checks (e.g., negative quantity)?
- [ ] Is the single source of truth for values enforced?

### Bulk Operation Abuse
- [ ] Can rate limits be bypassed through batch endpoints?
- [ ] Are bulk operations properly authorized per-item?
- [ ] Can enumeration attacks extract data through bulk queries?

## How to Check

```bash
# Find state transition logic
grep -rn "status.*=\|state.*=\|transition\|workflow" --include="*.ts" --include="*.js"

# Find authorization checks
grep -rn "isAdmin\|role.*check\|authorize\|permission" --include="*.ts" --include="*.js"

# Find financial/credit operations
grep -rn "credit\|debit\|balance\|price\|amount\|charge" --include="*.ts" --include="*.js"

# Find race condition indicators (missing transactions)
grep -rn "async.*update\|async.*delete\|async.*create" --include="*.ts" --include="*.js"

# Find bulk endpoints
grep -rn "batch\|bulk\|many\|all\b" --include="*.ts" --include="*.js"
```

## Severity Classification

| Severity | Criteria | Example |
|----------|----------|---------|
| CRITICAL | Financial loss or data breach possible | Credit bypass, unauthorized access |
| HIGH | Business rule violation with impact | State machine bypass, privilege escalation |
| MEDIUM | Logic flaw with limited impact | Missing validation, inconsistent state |
| LOW | Minor inconsistency, no direct exploit | Redundant checks, unclear error messages |

## Example Findings

**CRITICAL — Credit Bypass via Race Condition**
```
File: services/CreditService.ts:45
Issue: Balance check and debit are not atomic — concurrent requests can overdraw
Fix: Wrap in database transaction or use atomic decrement
```

**HIGH — Workflow Step Skip**
```
File: handlers/checkout.ts:78
Issue: Payment endpoint doesn't verify cart validation step completed
Fix: Check validation timestamp before processing payment
```
