# Requirements — auth-flow

This document captures the requirements for the `auth-flow` feature: a minimal authentication subsystem covering login, JWT issuance, session timeout, and audit logging. Acceptance criteria follow the EARS notation (patterns P1-P4).

## Glossary

- **AuthService**: server-side component that authenticates credentials.
- **JwtSigner**: component that produces signed JSON Web Tokens.
- **SessionStore**: in-memory or Redis-backed registry of active sessions.
- **AuditLogger**: append-only log of authentication events.

---

## Requirement 1: User login with credentials

**User Story:** As a registered user, I want to log in with my email and password so that I can access protected resources.

#### Acceptance Criteria

1. WHEN a user submits valid email+password to `POST /auth/login`, THE AuthService SHALL return HTTP 200 with a signed JWT in the response body.
2. WHEN the AuthService receives an unknown email, THE AuthService SHALL return HTTP 401 with body `{"error": "invalid_credentials"}`.
3. IF the password hash check fails 5 consecutive times for the same email within 15 minutes, THEN THE AuthService SHALL return HTTP 429 with body `{"error": "rate_limited", "retry_after_seconds": 900}`.

---

## Requirement 2: JWT issuance and validation

**User Story:** As an API consumer, I want each successful login to produce a verifiable JWT so that subsequent requests can be authenticated statelessly.

#### Acceptance Criteria

1. THE JwtSigner SHALL sign every token using HS256 with the `JWT_SECRET` environment variable as the key.
2. THE JwtSigner SHALL include the claims `sub` (user id), `iat` (issue time, Unix seconds), and `exp` (expiry, `iat` + 3600).
3. WHEN the AuthService receives a request with a JWT whose `exp` is in the past, THEN THE AuthService SHALL reject the request with HTTP 401 and body `{"error": "token_expired"}`.

---

## Requirement 3: Session timeout and audit logging

**User Story:** As a security operator, I want idle sessions to expire automatically and every auth event to be logged so that I can investigate incidents.

#### Acceptance Criteria

1. IF a session in the SessionStore has been idle (no requests) for more than 1800 seconds, THEN THE SessionStore SHALL mark the session as `expired` and remove the JWT from the active set.
2. WHEN a login attempt succeeds or fails, THE AuditLogger SHALL append a record containing `timestamp_iso8601`, `email_hash` (SHA-256 hex), `outcome` (`success` | `failure`), and `client_ip`.
3. THE AuditLogger SHALL NOT store raw passwords or full JWT strings under any circumstances.

---

## EARS pattern coverage summary

| Requirement | AC | Pattern |
|-------------|----|---------|
| 1 | 1 | P1 (event-driven `WHEN…SHALL`) |
| 1 | 2 | P1 (event-driven) |
| 1 | 3 | P2 (conditional `IF…THEN…SHALL`) |
| 2 | 1 | P4 (ubiquitous `THE…SHALL`) |
| 2 | 2 | P4 (ubiquitous) |
| 2 | 3 | P3 (event+then `WHEN…THEN…SHALL`) |
| 3 | 1 | P2 (conditional) |
| 3 | 2 | P1 (event-driven) |
| 3 | 3 | P4 (ubiquitous, negative form) |

Total: 9 ACs. Pattern coverage: P1 x3, P2 x2, P3 x1, P4 x3. All four EARS patterns represented at least once.
