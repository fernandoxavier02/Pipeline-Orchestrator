# Adversarial Checklist: Cryptography & Secrets

## What to Check

- [ ] No hardcoded secrets, API keys, or passwords in source code
- [ ] Secrets loaded from environment variables or secret manager
- [ ] Strong hashing algorithms used (bcrypt/scrypt/argon2, NOT md5/sha1)
- [ ] Encryption uses standard libraries (not custom crypto)
- [ ] HTTPS enforced for all external communication
- [ ] API keys have minimum necessary permissions (least privilege)
- [ ] Secrets are NOT logged or included in error messages
- [ ] Key rotation strategy exists
- [ ] .env files are gitignored
- [ ] Sensitive data encrypted at rest (if stored locally)

## How to Check

```bash
# Find hardcoded secrets (common patterns)
grep -rn "api[_-]key\|apiKey\|secret\|password\|token" --include="*.ts" --include="*.tsx" . | grep -v "node_modules\|\.env\|\.gitignore\|test"

# Find .env in git
git ls-files | grep -i "\.env"

# Check .gitignore for env files
grep -n "\.env" .gitignore

# Find weak hashing
grep -rn "md5\|sha1\|createHash" --include="*.ts" .

# Find custom crypto
grep -rn "encrypt\|decrypt\|cipher\|crypto\." --include="*.ts" .

# Find secrets in config files
grep -rn "key.*=.*['\"].\{20,\}['\"]" --include="*.ts" --include="*.json" .
```

## Common Vulnerabilities

| Vulnerability | Example | Impact |
|---------------|---------|--------|
| Hardcoded secret | `const API_KEY = "sk-abc123..."` | Credential exposure on leak |
| Weak hashing | `md5(password)` | Rainbow table attack |
| Secret in logs | `console.log("Auth token:", token)` | Credential in log storage |
| .env in git | `.env` committed to repository | All secrets exposed |
| Custom crypto | Hand-rolled encryption | Easily broken |

## Severity Classification

- **Critical:** Hardcoded production secrets, .env committed, secrets in logs
- **Important:** Weak hashing, overly permissive API keys, no key rotation
- **Minor:** Secrets in test fixtures (if clearly test-only), theoretical key strength

## Example Findings

```yaml
FINDING:
  id: "CRYPTO-1"
  severity: "Critical"
  checklist: "crypto"
  file: "src/config/api.ts:5"
  description: "API key hardcoded in source file"
  impact: "Key exposed in version control, accessible to anyone with repo access"
  recommendation: "Move to environment variable or secrets manager (e.g., secrets: ['API_KEY'] in Cloud Functions)"
  evidence: "grep -n 'apiKey' src/config/api.ts shows hardcoded value at line 5"
```
