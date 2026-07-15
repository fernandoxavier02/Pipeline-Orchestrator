# Achado #7 GATE_REQUEST handler — canonical skill fragment (SSOT)

This is the single source of truth for the Achado #7 GATE_REQUEST-handler block that
every block-carrying skill embeds. The 8 carrier skills (`pipeline`, `bugfix`,
`feature`, `audit`, `refactor`, `user-story`, `ux-sim`, `spec`) MUST embed this exact
16-line fragment, with the two slots substituted for that skill's values.

## Slots

- `{{CONTROLLER}}` — the dispatched controller name for the skill
  (`pipeline-controller` for the 7 processing skills, `spec-controller` for `spec`).
- `{{TERMINAL}}` — the terminal block phrase the controller emits
  (`PIPELINE COMPLETE` for the 7 processing skills, `SPEC AUTHORING COMPLETE` for `spec`).

After substituting each skill's two slot values, the embedded block must be
byte-identical to the fragment below (line-ending representation aside — the repo
policy is `eol=lf` and the parity check normalizes CRLF/CR to LF before comparing).
The regression check `tests/regression/v8.21.0/F5_achado7_parity.cjs` enforces this.

## Canonical fragment

The shared fragment lives between the two markers below. Tools read exactly this
region (see F5 `loadCanonicalFragment`). Do NOT edit inside the markers without
re-syncing all 8 carrier skills in the same change.

<!-- ACHADO7_FRAGMENT_START -->
## Achado #7 GATE_REQUEST handler (2026-05-07+, v5.2.0-rc.2+)

When the dispatched {{CONTROLLER}} (or any subagent it transitively dispatches via DISPATCH_REQUEST) returns a tool result containing `=== GATE_REQUEST v1 ===`, `=== DISPATCH_REQUEST v1 ===`, or `=== PLAN_MODE_REQUEST v1 ===` blocks AND ends with `STATUS: AWAITING_GATE_RESPONSES` / `AWAITING_DISPATCH_RESULTS` / `AWAITING_PLAN_MODE_RESULTS`, the parent main LLM MUST process them per `references/gate-request-protocol.md`:

1. Parse each block out of the tool result.
2. For `GATE_REQUEST`: invoke `AskUserQuestion` with the parsed question + options.
3. For `DISPATCH_REQUEST` with `target_kind: agent`: invoke `Agent(subagent_type, description, prompt)`.
4. For `DISPATCH_REQUEST` with `target_kind: skill`: invoke `Skill(skill: target_name)`.
5. For `PLAN_MODE_REQUEST`: invoke `EnterPlanMode`, conduct read-only research, exit with plan.
6. Aggregate responses/results into `GATE_RESPONSES` / `DISPATCH_RESULTS` / `PLAN_MODE_RESULTS` YAML payloads.
7. Re-dispatch the SAME subagent with the original prompt PLUS payloads prepended.
8. Repeat 1-7 until the subagent emits its terminal block (e.g., `{{TERMINAL}}`) without AWAITING_*.

Append every block emission and every response to `{PIPELINE_DOC_PATH}/protocol-events.jsonl` (NOT `gate-decisions.jsonl`). Named gates (ADVERSARIAL_GATE, FINAL_ADVERSARIAL_GATE, CLOSEOUT_CONFIRM, TDD_APPROVAL, PLAN_REJECTED, INFO_GATE_BLOCKED) ALSO get a canonical `gate-decisions.jsonl` entry with `decided_by: user` referencing the protocol event id. See `references/gate-request-protocol.md` "gate_id → canonical gate mapping" for the full table.

**Never silently default.** Malformed blocks → present to user via your own `AskUserQuestion` ("malformed block — investigate, retry, or abort?"); do NOT guess.
<!-- ACHADO7_FRAGMENT_END -->

## Per-skill terminal-block note

`spec` additionally carries, OUTSIDE this fragment, an extra re-dispatch clarification
paragraph and its own `## Flags` section — those are NOT part of the shared fragment
and are intentionally excluded from the parity window (F5-5 pins that boundary).
