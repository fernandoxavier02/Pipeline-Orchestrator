# Adversarial Checklist: Injection

## What to Check

- [ ] SQL/NoSQL queries use parameterized queries (never string concatenation)
- [ ] Command execution uses safe APIs (no shell interpolation)
- [ ] HTML output is escaped/sanitized (XSS prevention)
- [ ] File paths are validated and sandboxed (no path traversal)
- [ ] Template rendering escapes user input
- [ ] Regular expressions don't use untrusted input (ReDoS prevention)
- [ ] JSON/XML parsing handles malformed input safely
- [ ] URL construction validates/sanitizes components
- [ ] Header injection prevented (CRLF in HTTP headers)
- [ ] Log injection prevented (newlines in log entries)

## How to Check

```bash
# Find string interpolation in queries
grep -rn "query.*\`\|query.*\${\|query.*+\s*\w" --include="*.ts" .

# Find command execution
grep -rn "exec(\|spawn(\|system(\|eval(" --include="*.ts" .

# Find innerHTML or dangerouslySetInnerHTML
grep -rn "innerHTML\|dangerouslySetInnerHTML\|v-html" --include="*.ts" --include="*.tsx" .

# Find path construction from user input
grep -rn "path\.join.*req\|path\.resolve.*req\|__dirname.*\+" --include="*.ts" .

# Find dynamic regex construction
grep -rn "new RegExp(" --include="*.ts" .
```

## Common Vulnerabilities

| Vulnerability | Example | Impact |
|---------------|---------|--------|
| SQL injection | `query("SELECT * FROM users WHERE id=" + id)` | Data breach, data loss |
| XSS | `innerHTML = userInput` | Session hijacking, phishing |
| Command injection | `exec("convert " + filename)` | Remote code execution |
| Path traversal | `readFile("/uploads/" + userPath)` | Arbitrary file read |
| ReDoS | `new RegExp(userInput)` | Denial of service |

## Severity Classification

- **Critical:** SQL/command injection, stored XSS, arbitrary file access
- **Important:** Reflected XSS, unvalidated redirects, log injection
- **Minor:** Theoretical ReDoS, over-permissive URL validation

## Example Findings

```yaml
FINDING:
  id: "INJECT-1"
  severity: "Critical"
  checklist: "injection"
  file: "functions/src/api/search.ts:34"
  description: "Search query built via string concatenation with user input"
  impact: "NoSQL injection could expose or modify arbitrary data"
  recommendation: "Use parameterized query or sanitize input with allowlist"
  evidence: "grep -n 'where.*+' functions/src/api/search.ts shows concatenation at line 34"
```
