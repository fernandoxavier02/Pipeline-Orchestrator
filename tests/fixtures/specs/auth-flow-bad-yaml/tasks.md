# Tasks — auth-flow

Implementation tasks for the `auth-flow` feature, organized as vertical slices. Each task references the requirement(s) it validates and includes an explicit acceptance criterion. Checkboxes start unchecked and are flipped when the corresponding work lands and tests pass.

## Slice A: Login happy path (Req 1, Req 2)

### [ ] Task 1.1: Implement `JwtSigner.sign` and `verify`

**Requirements:** Req 2 (AC 1, 2)
**Acceptance:** Unit tests cover (a) round-trip sign->verify yields the input claims, (b) `verify` rejects a token signed with a different secret, (c) issued tokens contain `sub`, `iat`, `exp` with `exp = iat + 3600`.
**Files in scope:** `src/auth/jwt-signer.ts`, `tests/auth/jwt-signer.test.ts`.

### [ ] Task 1.2: Implement `AuthService.login` happy path

**Requirements:** Req 1 (AC 1)
**Acceptance:** Given a User row whose `password_hash` matches the submitted password, `login` returns a `LoginResult` containing a JWT signed by `JwtSigner`. Test fixture user verified end-to-end via `POST /auth/login` returning HTTP 200.
**Files in scope:** `src/auth/auth-service.ts`, `tests/auth/auth-service.login.test.ts`.

## Slice B: Login failure modes (Req 1, Req 2)

### [ ] Task 2.1: Reject unknown email and wrong password

**Requirements:** Req 1 (AC 2)
**Acceptance:** `login` with an email not in the User table returns HTTP 401 with body `{"error": "invalid_credentials"}`. Same response shape for valid email + wrong password (no email enumeration).
**Files in scope:** `src/auth/auth-service.ts`, `tests/auth/auth-service.failures.test.ts`.

### [ ] Task 2.2: Enforce per-email rate limit (5 fails / 15 min)

**Requirements:** Req 1 (AC 3)
**Acceptance:** After 5 failed attempts for the same email within 15 minutes, the 6th attempt receives HTTP 429 with `retry_after_seconds: 900`. Counter resets after the 15-minute window passes.
**Files in scope:** `src/auth/rate-limiter.ts`, `src/auth/auth-service.ts`, `tests/auth/rate-limiter.test.ts`.

### [ ] Task 2.3: Reject expired tokens on protected routes

**Requirements:** Req 2 (AC 3)
**Acceptance:** A request with a JWT whose `exp` is in the past returns HTTP 401 with body `{"error": "token_expired"}`. Verified via integration test that fast-forwards the system clock past `exp`.
**Files in scope:** `src/auth/auth-middleware.ts`, `tests/auth/auth-middleware.test.ts`.

## Slice C: Session lifecycle and audit (Req 3)

### [ ] Task 3.1: Idle session expiry after 1800s

**Requirements:** Req 3 (AC 1)
**Acceptance:** `SessionStore.expireIdle(now)` returns the list of `jwt_id` values whose `last_seen` is older than 1800 seconds and removes them from the active set. Unit test injects a fake clock.
**Files in scope:** `src/auth/session-store.ts`, `tests/auth/session-store.test.ts`.

### [ ] Task 3.2: Audit logger records every login outcome

**Requirements:** Req 3 (AC 2, 3)
**Acceptance:** Every successful and failed login produces exactly one `AuditEvent` containing `timestamp_iso8601`, `email_hash` (SHA-256), `outcome`, and `client_ip`. Test asserts no record contains the raw password or the full JWT string.
**Files in scope:** `src/auth/audit-logger.ts`, `src/auth/auth-service.ts`, `tests/auth/audit-logger.test.ts`.

### [ ] Task 3.3: Implement `AuditLogger` component

**Requirements:** Req 3 (AC 2, 3)
**Acceptance:** `AuditLogger` component records auth events. The `AuditLogger.record(event)` method serializes an `AuditEvent` and persists it via the configured sink; failures to persist must not block the login response (best-effort write with error log). Unit test asserts that `AuditLogger` exposes `record` and emits one event per call.
**Files in scope:** `src/auth/audit-logger.ts`, `tests/auth/audit-logger.test.ts`.

## Definition of done

- All checkboxes flipped to `[x]`.
- Build passes (`npm run build`).
- All tests in `tests/auth/**` pass.
- Manual smoke: login -> use token -> wait past `exp` -> token rejected -> re-login succeeds.
