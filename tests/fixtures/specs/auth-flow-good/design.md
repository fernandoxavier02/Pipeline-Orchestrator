# Design — auth-flow

Technical design for the `auth-flow` feature. Each component traces back to one or more requirements in `requirements.md`.

## Architecture overview

The feature is structured as three cooperating components behind a thin HTTP layer. The HTTP layer parses the request, delegates to `AuthService`, and serializes the response. Cross-cutting concerns (audit logging, rate limiting) sit beside `AuthService` rather than inside it, so policy can change without touching the credential check.

## Components

### AuthService

**Responsibility:** validate credentials, orchestrate token issuance, and apply rate-limit policy.
**Traces to:** Requirement 1 (AC 1, 2, 3), Requirement 2 (AC 3).
**Collaborators:** `JwtSigner`, `SessionStore`, `AuditLogger`.
**Key methods:**
- `login(email: string, password: string, clientIp: string) -> LoginResult`
- `verifyToken(jwt: string) -> VerifyResult`

### JwtSigner

**Responsibility:** produce and validate HS256-signed JWTs with the standard claim set.
**Traces to:** Requirement 2 (AC 1, 2, 3).
**Collaborators:** none (pure cryptographic boundary).
**Key methods:**
- `sign(claims: Claims) -> string`
- `verify(token: string) -> Claims | TokenError`

### SessionStore

**Responsibility:** track active sessions and enforce idle timeout.
**Traces to:** Requirement 3 (AC 1).
**Collaborators:** scheduled sweeper (out of scope of this fixture).
**Key methods:**
- `register(userId: string, jwt: string, issuedAt: number) -> void`
- `touch(jwt: string) -> void`
- `expireIdle(nowSeconds: number) -> string[]` (returns expired JWT ids)

### AuditLogger

**Responsibility:** append immutable records of every authentication event.
**Traces to:** Requirement 3 (AC 2, 3).
**Collaborators:** persistent log sink (file or stdout in this fixture).
**Key methods:**
- `record(event: AuditEvent) -> void`

## Contracts

### `POST /auth/login`

**Request body:**
```json
{ "email": "string", "password": "string" }
```

**Response 200:**
```json
{ "token": "string (JWT)", "expires_at": "number (unix seconds)" }
```

**Errors:**
- `401 invalid_credentials` — unknown email or password mismatch (Req 1.2).
- `429 rate_limited` — 5+ failures in 15min for the same email (Req 1.3). Includes `retry_after_seconds`.
- `400 bad_request` — malformed JSON or missing fields.

### `GET /auth/verify` (internal)

**Request header:** `Authorization: Bearer <jwt>`
**Response 200:** `{ "sub": "string", "exp": number }`
**Errors:** `401 token_expired` (Req 2.3), `401 invalid_signature`.

## Data model

### `User` (existing, referenced)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (UUID) | primary key |
| `email` | string | unique, lowercased |
| `password_hash` | string | bcrypt cost 12 |
| `created_at` | timestamp | UTC |

### `AuditEvent` (new)

| Field | Type | Notes |
|-------|------|-------|
| `timestamp_iso8601` | string | UTC ISO-8601 with milliseconds |
| `email_hash` | string | SHA-256 hex of lowercased email |
| `outcome` | enum | `"success"` or `"failure"` |
| `client_ip` | string | from `X-Forwarded-For` or socket peer |

### `Session` (new, in-memory or Redis)

| Field | Type | Notes |
|-------|------|-------|
| `jwt_id` | string | the `jti` claim |
| `user_id` | string | foreign key to User |
| `issued_at` | number | unix seconds |
| `last_seen` | number | unix seconds, updated on every authenticated request |

## Decisions and trade-offs

- **HS256 over RS256:** symmetric signing keeps the fixture self-contained. Production should consider RS256 if multiple services need to verify without sharing the secret.
- **In-memory rate-limit counter:** acceptable for single-process fixture; a real deployment needs a shared store (Redis with TTL).
- **No refresh tokens:** out of scope for the auth-flow fixture; tokens expire and the user re-logs in.

## Risks and mitigations

- **Risk:** JWT secret leakage via misconfigured logs. **Mitigation:** AuditLogger SHALL NOT serialize the full token; only `email_hash` and outcome are persisted (Req 3.3).
- **Risk:** Rate-limit bypass via IP rotation. **Mitigation:** track failures by `email_hash` (per Req 1.3), not by client IP, so bot networks rotating IPs hit the same counter.
- **Risk:** Replay of expired tokens against unsynchronized clocks. **Mitigation:** verify `exp` against monotonic system time and reject tokens with `iat` more than 5 minutes in the future.
