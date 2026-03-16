# Adversarial Checklist: Data Integrity

## What to Check

- [ ] Write operations are atomic or use transactions where needed
- [ ] Concurrent updates handled (optimistic locking, merge semantics)
- [ ] Data validation before persistence (not just at input layer)
- [ ] Referential integrity maintained (foreign keys, references valid)
- [ ] Cascading deletes handled correctly (or prevented)
- [ ] Schema migrations are backwards-compatible (additive preferred)
- [ ] Backup/recovery strategy exists for critical data
- [ ] Data retention rules implemented (if applicable)
- [ ] Timestamps use consistent timezone/format
- [ ] Numeric precision preserved (no floating point for money)

## How to Check

```bash
# Find write operations
grep -rn "setDoc\|updateDoc\|addDoc\|deleteDoc\|set(\|update(\|delete(" --include="*.ts" .

# Find transaction usage
grep -rn "runTransaction\|batch\|transaction" --include="*.ts" .

# Find merge semantics
grep -rn "merge:\s*true" --include="*.ts" .

# Find deletion operations
grep -rn "delete\|remove\|destroy\|drop" --include="*.ts" .

# Find money/currency handling
grep -rn "price\|amount\|cost\|credit\|debit\|balance" --include="*.ts" .
```

## Common Vulnerabilities

| Vulnerability | Example | Impact |
|---------------|---------|--------|
| Race condition | Two concurrent writes, last wins silently | Data loss |
| Missing transaction | Multi-document update without atomicity | Inconsistent state |
| Cascade delete | Deleting parent leaves orphan children | Data corruption |
| Float for money | `price = 0.1 + 0.2` (= 0.30000000000000004) | Financial discrepancy |
| No validation at write | Frontend validates, backend doesn't | Invalid data persisted |

## Severity Classification

- **Critical:** Race condition on financial data, missing transaction on multi-step operation
- **Important:** No validation at persistence layer, cascade delete risk, orphan references
- **Minor:** Inconsistent timestamp formats, redundant validation

## Example Findings

```yaml
FINDING:
  id: "DATA-1"
  severity: "Critical"
  checklist: "data-integrity"
  file: "functions/src/credits/debitCredits.ts:22"
  description: "Credit debit reads balance and writes new value without transaction"
  impact: "Concurrent requests could double-spend credits"
  recommendation: "Wrap read-modify-write in runTransaction"
  evidence: "grep -n 'getDoc.*setDoc' shows non-atomic read-write pattern"
```
