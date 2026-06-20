#!/usr/bin/env node
'use strict';

// =============================================================================
// domain-scanner.cjs — deterministic sensitive-domain detector (PURE)
// =============================================================================
// Audit item A4. The prose rule "if the batch touches auth/crypto/payment/
// data-model, the adversarial review is MANDATORY and cannot be skipped" had
// ZERO code reading which files changed. This is the code half: given the list
// of changed file paths, return the sensitive domains touched (by path/name
// pattern). The batch-review gate consumes this: when the set is non-empty and
// reviews lag, it refuses the `warn` escape — sensitive batches CANNOT skip.
//
// PURE + deterministic. Never throws. Pattern-based (path/filename heuristic) —
// the recorded fact is the changed-file list (from `git diff --name-only`), not
// an agent's opinion about what it touched.
//
// ponytail: name/path heuristic, not semantic taint analysis. A file that
// touches auth logic but isn't named for it is missed. Upgrade path: add a
// content-grep tier. Named ceiling; the path heuristic catches the common case
// and is fully deterministic.
// =============================================================================

// Domain → path/filename pattern. Conservative: matches a path SEGMENT or a
// filename token so `src/auth/login.ts` and `payment_service.py` both hit, but
// an incidental substring inside an unrelated word is less likely.
// The trailing `s?` BEFORE the boundary catches the conventional plural directory
// names (`sessions/`, `payments/`, `credentials/`, `charges/`, `tokens/`, …) that a
// bare boundary would let evade the mandatory review (adversarial HIGH fix). It
// stays anchored: `authors/` / `tokenizer` / `signage` still MISS (the char after
// the optional `s` must be a separator or end-of-string). Irregular plurals
// (`entities`, `repositories`, `identities`) are enumerated explicitly.
const PATTERNS = {
  auth: /(^|[\/\\_.-])(auth|authn|authz|login|logout|session|oauth|openid|saml|sso|jwt|token|password|passwd|credential|permission|identity|identities|rbac)s?([\/\\_.-]|$)/i,
  crypto: /(^|[\/\\_.-])(crypto|cipher|encrypt|decrypt|hmac|signature|signer|sign|keypair|privatekey|secret|tls|ssl|x509)s?([\/\\_.-]|$)/i,
  payment: /(^|[\/\\_.-])(payment|billing|charge|invoice|stripe|checkout|refund|payout|subscription|wallet|ledger)s?([\/\\_.-]|$)/i,
  'data-model': /(^|[\/\\_.-])(migration|schema|entity|entities|datamodel|repository|repositories|prisma)s?([\/\\_.-]|$)|\.sql$/i,
};

// Returns a sorted array of sensitive domains touched by the given paths.
function scanDomains(paths) {
  const out = new Set();
  if (!Array.isArray(paths)) return [];
  for (const p of paths) {
    if (typeof p !== 'string' || !p) continue;
    for (const dom of Object.keys(PATTERNS)) {
      if (PATTERNS[dom].test(p)) out.add(dom);
    }
  }
  return [...out].sort();
}

module.exports = { scanDomains, PATTERNS };
