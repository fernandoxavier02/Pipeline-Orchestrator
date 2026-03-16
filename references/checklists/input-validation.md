# Adversarial Checklist: Input Validation

## What to Check

- [ ] All user inputs validated on server side (never trust client validation alone)
- [ ] Type checking enforced (string, number, boolean, array)
- [ ] Size/length limits enforced (max string length, max array size, max file size)
- [ ] Format validation for structured inputs (email, URL, date, phone)
- [ ] Sanitization applied before storage or display
- [ ] Enum/allowlist validation for constrained values
- [ ] Nested object depth limited (prevent prototype pollution)
- [ ] Numeric ranges validated (min/max, no negative where inappropriate)
- [ ] Required fields enforced (no silent null/undefined)
- [ ] Array inputs bounded (prevent unbounded iteration)

## How to Check

```bash
# Find input handling points
grep -rn "request\.data\|req\.body\|req\.query\|req\.params" --include="*.ts" .

# Find validation libraries in use
grep -rn "zod\|joi\|yup\|validator\|sanitize\|validate" --include="*.ts" .

# Find direct user input usage without validation
grep -rn "request\.data\.\w\+" --include="*.ts" [functions-dir]

# Check for type assertions (may skip validation)
grep -rn "as any\|as unknown\|!\.trim\|toString()" --include="*.ts" .
```

## Common Vulnerabilities

| Vulnerability | Example | Impact |
|---------------|---------|--------|
| No server validation | Client-side only validation | Bypass via direct API call |
| Missing type check | Expected string, got object | Type confusion, crash |
| Unbounded input | No max length on text field | Memory exhaustion, DoS |
| Missing sanitization | HTML in user input displayed raw | XSS |
| No enum validation | Free-text where enum expected | Invalid state |

## Severity Classification

- **Critical:** No server-side validation on data-modifying endpoint
- **Important:** Missing size limits, type coercion without checking
- **Minor:** Client validates but server also validates (redundant but safe)

## Example Findings

```yaml
FINDING:
  id: "INPUT-1"
  severity: "Important"
  checklist: "input-validation"
  file: "functions/src/api/createItem.ts:23"
  description: "User-provided 'name' field has no length limit"
  impact: "Attacker could send megabytes of text, causing storage/memory issues"
  recommendation: "Add validation: name.length <= 200"
  evidence: "grep -n 'name' functions/src/api/createItem.ts shows direct usage without length check"
```
