# Adversarial Checklist: Authentication & Authorization

## What to Check

### Authentication
- [ ] All protected endpoints require authentication
- [ ] Token validation is server-side (never trust client-only checks)
- [ ] Session management uses secure defaults (httpOnly, secure, sameSite)
- [ ] Password/credential handling follows secure practices
- [ ] OAuth/SSO flows validate state parameter
- [ ] Token expiration is enforced
- [ ] Refresh token rotation is implemented (if applicable)

### Authorization
- [ ] Role-based or attribute-based access control in place
- [ ] Authorization checks happen on EVERY request (not just UI hiding)
- [ ] Resource ownership verified (user can only access their own data)
- [ ] Admin/elevated operations require explicit role check
- [ ] API endpoints enforce same permissions as UI

## How to Check

```bash
# Find unprotected endpoints
grep -rn "onCall\|onRequest\|export.*handler" --include="*.ts" [functions-dir]
# Then verify each has auth check

# Find auth checks
grep -rn "auth\|currentUser\|uid\|token\|verify" --include="*.ts" [src-dir]

# Find authorization patterns
grep -rn "role\|admin\|permission\|isAuthorized" --include="*.ts" .

# Find client-side auth gates (should have server-side equivalents)
grep -rn "isAuthenticated\|isLoggedIn\|currentUser" --include="*.tsx" [pages-dir]
```

## Common Vulnerabilities

| Vulnerability | Example | Impact |
|---------------|---------|--------|
| Missing auth check | Endpoint serves data without verifying user | Data exposure |
| Client-only auth | UI hides button but API has no check | Unauthorized access |
| Broken ownership | User A can access User B's resources | Data breach |
| Token leakage | Token in URL params or logs | Session hijacking |
| Missing expiration | Tokens never expire | Persistent unauthorized access |

## Severity Classification

- **Critical:** Missing auth on data-modifying endpoint, broken ownership check
- **Important:** Missing auth on read endpoint, client-only auth gate
- **Minor:** Token expiration too long, missing secure cookie flags

## Example Findings

```yaml
FINDING:
  id: "AUTH-1"
  severity: "Critical"
  checklist: "auth"
  file: "functions/src/api/getUserData.ts:15"
  description: "Endpoint returns user data without verifying caller identity"
  impact: "Any authenticated user can read any other user's data"
  recommendation: "Add ownership check: verify request.auth.uid matches requested userId"
  evidence: "grep -n 'getUserData' functions/src/api/getUserData.ts shows no auth check"
```
