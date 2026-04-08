# Adversarial Checklist: Error Handling

## What to Check

- [ ] All async operations wrapped in try/catch
- [ ] Error messages do NOT leak sensitive information (stack traces, DB queries, internal paths)
- [ ] Errors logged with sufficient context for debugging
- [ ] User-facing errors are clear and actionable (not "Internal Server Error")
- [ ] Graceful degradation when dependencies fail
- [ ] Error contract followed consistently (if project has one)
- [ ] No swallowed errors (empty catch blocks)
- [ ] HTTP status codes are appropriate (not all 500s)
- [ ] Retry logic has bounded attempts and backoff
- [ ] Circuit breaker pattern for external dependencies (if applicable)

## How to Check

```bash
# Find try/catch blocks
grep -rn "try\s*{" --include="*.ts" .

# Find empty catch blocks (swallowed errors)
grep -B1 -A1 "catch.*{" --include="*.ts" . | grep -A1 "catch" | grep "}"

# Find error responses
grep -rn "throw\|Error(\|reject\|catch" --include="*.ts" .

# Find potential info leaks in errors
grep -rn "stack\|message.*error\|console\.error\|JSON\.stringify.*err" --include="*.ts" .

# Find unhandled promise rejections
grep -rn "\.then(" --include="*.ts" . | grep -v "\.catch"
```

## Common Vulnerabilities

| Vulnerability | Example | Impact |
|---------------|---------|--------|
| Info leak in error | Stack trace sent to client | Internal architecture exposed |
| Swallowed error | `catch(e) {}` | Silent failure, hard to debug |
| No retry limit | Infinite retry on transient failure | Resource exhaustion |
| Generic errors | "Something went wrong" for everything | Users can't resolve issues |
| Missing logging | Error caught but not logged | Invisible failures |

## Severity Classification

- **Critical:** Sensitive data in error messages (credentials, tokens, queries)
- **Important:** Swallowed errors, missing logging, no graceful degradation
- **Minor:** Inconsistent error format, overly generic messages

## Example Findings

```yaml
FINDING:
  id: "ERROR-1"
  severity: "Important"
  checklist: "error-handling"
  file: "src/services/ApiService.ts:45"
  description: "Empty catch block swallows API errors silently"
  impact: "Users see no feedback when API fails; debugging impossible"
  recommendation: "Log error and show user-friendly message"
  evidence: "grep -n 'catch' src/services/ApiService.ts shows catch(e) {} at line 45"
```
