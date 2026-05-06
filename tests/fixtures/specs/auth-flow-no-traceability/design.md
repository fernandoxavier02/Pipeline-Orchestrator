# Design — auth-flow-no-traceability

## Architecture overview

The feature is structured as three components behind a thin HTTP layer.

## Components

### AuthService

Validates credentials and orchestrates token issuance.

### JwtSigner

Produces signed JWTs.

### SessionStore

Tracks active sessions.

### AuditLogger

Records authentication events.

## Decisions and trade-offs

- HS256 over RS256: symmetric signing keeps the design self-contained.
- In-memory rate-limit counter: acceptable for single-process deployment.
- No refresh tokens: out of scope.

## Risks and mitigations

- Risk: secret leakage via misconfigured logs. Mitigation: log review.
- Risk: rate-limit bypass via IP rotation. Mitigation: track failures by email.
- Risk: replay of expired tokens. Mitigation: verify exp against system time.
