# 09-final-validator.md — Pa de Cal (Final Validator)

**Pipeline:** audit-heavy COMPLEXA (report-only)
**Plugin version:** v7.10.1 (READ-ONLY run)
**Run ID:** 2026-06-11-auditoria-enforcement-variants
**Stage:** 6/6
**Timestamp:** 2026-06-11T14:10:00Z

---

## OBSERVABILITY BANNER

```
+==================================================================+
|  FINAL-VALIDATOR (Pa de Cal)                                       |
|  Stage: 6/6 in pipeline                                            |
|  Status: COMPLETE                                                  |
|  Action: Decision issued — GO                                      |
|  Next: END OF PIPELINE                                             |
+==================================================================+
```

---

## STEP 1: STAGE INPUTS COLLECTED

| Stage | Output | Status |
|-------|--------|--------|
| 1. Task Orchestrator | ORCHESTRATOR_DECISION (sentinel-state.json:orchestrator_decision) | RECEIVED |
| 2. Information Gate | INFO_GATE_BLOCKED = NOT_TRIGGERED, CLEAR | RECEIVED |
| 2.5 Quality Gate | N/A (audit-heavy does not dispatch quality-gate-router) | N/A |
| 2.6 Pre-Tester | N/A (report-only, zero code surface) | N/A |
| 3. Executor | EXECUTOR_RESULT: 4/4 batches COMPLETE (evt-006 to evt-015) | RECEIVED |
| 4. Adversarial | FINAL_ADVERSARIAL_GATE = SKIPPED (SOFT, contract-mandated) | RECEIVED (SKIPPED) |
| 5. Sanity | SANITY_CHECK overall_status=PASS (6/6 checks, 0 consecutive failures) | RECEIVED |

---

## STEP 1b: GATE-DECISIONS.JSONL VALIDATION

**File:** `gate-decisions.jsonl` — 4 substantive entries + 1 trailing empty line (benign)

| # | Gate | Hardness | Decision | Confidence Impact | Parse Valid | Hardness Matches Registry |
|---|------|----------|----------|-------------------|-------------|--------------------------|
| 1 | SSOT_CONFLICT | MANDATORY | NOT_TRIGGERED | 0 | YES | YES |
| 2 | INFO_GATE_BLOCKED | HARD | NOT_TRIGGERED | 0 | YES | YES |
| 3 | PLAN_REJECTED | HARD | NOT_TRIGGERED | 0 | YES | YES |
| 4 | FINAL_ADVERSARIAL_GATE | SOFT | SKIPPED | 0 | YES | YES |

**Anomalous entries:** None. Trailing empty line on line 5 is a file artifact, not an anomalous JSON record.

**MANDATORY/HARD gate check:** Both HARD gates show NOT_TRIGGERED (no blocking condition arose). The MANDATORY gate (SSOT_CONFLICT) also shows NOT_TRIGGERED. Zero MANDATORY or HARD gates are in SKIPPED state. Criterion: PASS.

**SOFT gates skipped:** 1 (FINAL_ADVERSARIAL_GATE). Per audit-heavy contract line 148 (cited in gate entry): final-adversarial is SKIPPED for report-only audit pipelines with zero code surface. This is contract-mandated, not a pipeline failure.

**Gate penalty recompute:** Sum of confidence_impact from all JSONL entries = 0 + 0 + 0 + 0 = 0. The -0.15 penalty stored in confidence-score.yaml is applied at the pipeline-controller policy level for the SOFT skip, outside the per-entry impact fields. This is consistent with the confidence.md penalty schedule. No discrepancy between recomputed JSONL sum and stored policy value (they operate on different levels, not the same field).

**Gate statistics:** 4 total triggered/evaluated, 0 HARD/MANDATORY skipped, 1 SOFT skipped.

---

## STEP 1c: CONFIDENCE SCORE VALIDATION

**Score:** 0.85 (HIGH zone — >= 0.80)

**Dimension audit (clamped to [0.0, 1.0]):**

| Dimension | Raw Value | Clamped | Valid Range |
|-----------|-----------|---------|-------------|
| classification_clarity | 1.0 | 1.0 | YES |
| info_completeness | 1.0 | 1.0 | YES |
| design_clarity | 1.0 | 1.0 | YES |
| plan_coverage | 1.0 | 1.0 | YES |
| tdd_coverage | null | N/A | YES (N/A for audit) |
| implementation_quality | 1.0 | 1.0 | YES |
| sanity | 1.0 | 1.0 | YES |
| gate_penalty | -0.15 | — | Applied at policy level |

**Recomputed total:** (1.0+1.0+1.0+1.0+1.0+1.0) / 6 dimensions = 1.0 raw, minus 0.15 gate_penalty = **0.85**. Matches stored value. No discrepancy.

**Zone:** HIGH (>= 0.80). Score is advisory only — binary PASS/FAIL checks take precedence. All binary checks below pass.

---

## STEP 2: ACCEPTANCE CRITERIA — PROPORTIONAL VALIDATION (COMPLEXA, REPORT-ONLY AUDIT)

### Criterion A — All 4 phase deliverables + executive report complete

| Deliverable | File | Lines | Status |
|-------------|------|-------|--------|
| Phase 1: AuditIntake | 04-audit-intake.md | 297 | PASS |
| Phase 2: DOMAIN_ANALYSIS | 05-audit-domain-analyzer.md | 383 | PASS |
| Phase 3: COMPLIANCE_REPORT | 06-audit-compliance-checker.md | 671 | PASS |
| Phase 4: AUDIT_REPORT (risk matrix) | 07-audit-risk-matrix.md | 798 | PASS |
| Executive report | AUDIT_REPORT.md | 81 | PASS |

**Result: PASS — 5/5 deliverables present and substantive**

---

### Criterion B — Enforcement/execution failure mapping with Plan Mode case verified

The Plan Mode enforcement failure is the central finding of this audit and is comprehensively documented:

**Plan Mode findings (AUDIT-001, AUDIT-002, AUDIT-006):**
- AUDIT-001 (risk=25, Critical): Plan Mode contract is prose-only with zero hook backstop. Evidence: grep across `.claude/hooks/` returns 0 matches for PLAN_MODE_BYPASS or PLAN_MODE_REQUEST in hook code; pipeline-controller.md:533 confirms AUDIT hardness (not HARD gate); 4 regression tests (F18/F19/F20/F21) assert text presence only, not runtime behavior.
- AUDIT-002 (risk=20, Critical): Controller table-lookup is LLM-textual — design-interrogator bypass occurred live in this run (evt-005). Controller cleared the agent claiming it was "not in table" while pipeline-controller.md:527 shows it IS listed.
- AUDIT-006 (risk=20, Critical): All 4 Plan Mode tests are text-only. Signal G bypass occurred while all 4 tests would have stayed green.

**Live evidence from protocol-events.jsonl:**
- evt-003: plan-architect correctly emitted PLAN_MODE_REQUEST (positive confirmation of v7.10.0 contract fix)
- evt-004: parent entered Plan Mode, research executed, plan approved by user
- evt-005: design-interrogator performed 94 inline tool uses WITHOUT PLAN_MODE_REQUEST; controller accepted, claiming agent not in table (factually wrong)
- evt-007: audit-intake correctly emitted PLAN_MODE_REQUEST (second positive confirmation)
- evt-013: sentinel deny path confirmed working via positive control

**Cascade and co-occurring failures mapped:**
- AUDIT-003: run_id=null on all 384 Langfuse spans (10 days) — sentinel-state.json uses `pipeline_id`, carrier reads `run_id`
- AUDIT-004: fidelity freeze at first teardown — stop-hook.cjs:239-245 idempotent guard; confirmed in run-log (2026-06-06 run: 0.2727 frozen across 4 sessions)
- AUDIT-005: cwd-discovery cascade — same env-unset condition degrades sentinel, run-log, fidelity, and Langfuse simultaneously; demonstrated live (evt-002 false deny, evt-012 T3 auditor committed same error)
- AUDIT-009: sentinel deny path has no behavioral test despite being the only deterministic enforcement mechanism

**Result: PASS — enforcement/execution failure mapping complete with Plan Mode case fully verified by live evidence**

---

### Criterion C — Light/heavy variant coverage check for Audit / Bug Fix / Feature / UX Simulation

The compliance checker (06-audit-compliance-checker.md) produced a 5×4 variant matrix covering L1 (routing), L2 (pipeline docs), L3 (skill folders), L4 (regression tests) for all five task types across light/heavy variants:

| Task Type | L1 Routing | L2 Docs | L3 Skills | L4 Tests | Score | Finding |
|-----------|------------|---------|-----------|----------|-------|---------|
| Bug Fix | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | Fully covered — reference implementation |
| Audit | 4/4 | 3/4 | 3/4 | 2/4 | 3/4 | AUDIT-007 (no sentinel enforcement); AUDIT-012 (audit-heavy.md contradicts controller) |
| Feature | 4/4 | 3/4 | 4/4 | 3/4 | 3-4/4 | AUDIT-013 (implement-*/feature-* naming mismatch across 3 systems) |
| UX Simulation | 4/4 | 3/4 | 2/4 | 2/4 | 2/4 | AUDIT-014 (no L3 skill folders, no L4 tests) |
| User Story | 4/4 | 3/4 | 2/4 | 2/4 | 2/4 | AUDIT-014 (same — no L3 or L4) |

**Key variant-specific findings:**
- AUDIT-007 (High, risk=16): sentinel enforcement absent for all inline-routed types (Audit, Feature, UX Sim, User Story) — enforceSkillContract() returns null when current_skill is absent (sentinel-hook.cjs:45-62)
- AUDIT-012 (Medium, risk=8): audit-heavy.md:3 claims Skill dispatch; pipeline-controller.md:192 lists audit-* as inline-routed — direct contradiction
- AUDIT-013 (Medium, risk=8): Feature type has three inconsistent names across complexity-matrix.md, skills/ directory, and references/pipelines/
- AUDIT-014 (Medium, risk=6): UX Simulation and User Story have L1 routing rows but no L3 skill folders and no L4 regression tests

**Result: PASS — variant coverage matrix complete for all requested types; gaps quantified with evidence**

---

### Criterion D — No production modifications (READ-ONLY integrity)

Sanity check 5 PASS: `git -C 'Pipeline-Orchestrator' status --porcelain --untracked-files=no` returned no output (zero tracked file changes). All 5 audit deliverables confirmed in `.pipeline/docs/` not in the repo production tree. sentinel-state.json is a working-directory state file, not a production artifact.

**Result: PASS — production repository untouched**

---

### Criterion E — Evidence discipline (15/17 VERIFIED, 44 file:line + 8 evt citations)

Per 07-audit-risk-matrix.md stats block and sanity checker check 4:
- 15/17 findings tagged [VERIFIED] (confirmed by direct file read or live event)
- 2 findings tagged [VERIFIED — MECHANISM HYPOTHESIS] (AUDIT-011: external Langfuse contamination mechanism; confirmed by queryMetrics data but root cause is external application — investigation required) and [VERIFIED — DESIGN] (AUDIT-016: anti-deadlock accept is explicit by-design choice documented at pipeline-controller.md:533)
- 44 file:line evidence entries across 17 findings
- 8 evt-NNN references with detail explanations
- 100% evidence field coverage (all findings have at least 2 evidence entries)

**Result: PASS — evidence discipline meets audit-heavy COMPLEXA standard**

---

### Criterion F — gate-decisions.jsonl conformant

Validated in Step 1b above: 4 valid JSON entries, all required keys present, no spurious keys, hardness matches registry for all entries, no anomalous lines. Trailing empty line is benign file artifact.

**Result: PASS**

---

## STEP 3: FINAL DECISION

```
+==================================================================+
|  PA DE CAL - FINAL DECISION                                        |
|  Request: Audit enforcement failures + variant coverage check      |
|  Level: COMPLEXA                                                   |
|  Pipeline: HEAVY (audit-heavy)                                     |
|  Build: N/A (report-only audit)                                    |
|  Tests: N/A (no code modified)                                     |
|  Adversarial: SKIPPED (SOFT — contract-mandated, zero code surface)|
|  Regression: N/A (no production changes)                           |
|  Confidence: 0.85 (HIGH — >= 0.80)                                 |
|  Gates: 4 total, 1 skipped (SOFT, FINAL_ADVERSARIAL_GATE)          |
|  Fidelity: n/a (report-only audit run)                             |
|                                                                    |
|  FINAL DECISION: GO                                                |
|  All 6 acceptance criteria PASS. 4/4 phase deliverables complete.  |
|  Both user objectives answered with live evidence. Production       |
|  repo untouched. Evidence discipline (44 file:line, 8 evt refs)     |
|  meets COMPLEXA audit standard. No MANDATORY or HARD gates         |
|  blocked or skipped. Single SOFT gate skip is contract-mandated.   |
+==================================================================+
```

### Decision justification

This is a report-only audit run with zero code production modifications. The GO decision is grounded in all six acceptance criteria passing:

The four deliverable phases are complete and substantive (2,230 total lines across 5 documents). The two user objectives are fully answered: (1) enforcement and execution failure mapping documented 6 critical failures including the Plan Mode bypass observed live in this very run, with 44 file:line citations and live protocol event confirmation; (2) the light/heavy variant coverage matrix produced quantified scores for all 5 task types with specific findings for Audit (AUDIT-007, AUDIT-012), Feature (AUDIT-013), and UX Simulation + User Story (AUDIT-014). The production repository is clean (git status confirmed). Evidence discipline is at the expected level for an audit-heavy COMPLEXA run. Gate conformance is clean.

The single SOFT gate skip (final-adversarial) is not a GO-degrading condition — the audit-heavy contract explicitly exempts report-only runs from adversarial code review because there is no code surface to attack. The -0.15 confidence penalty correctly records this skip without changing the binary outcome.

The notable meta-finding — T3 auditor committing the exact dual-location confusion defect it was auditing — is appropriately surfaced as additional evidence for AUDIT-005 rather than a process failure. It strengthens the finding rather than undermining the audit.

---

## PA_DE_CAL OUTPUT

```yaml
PA_DE_CAL:
  decision: "GO"
  level: "COMPLEXA"
  justification: |
    All 6 acceptance criteria PASS for a report-only audit-heavy run.
    4/4 phase deliverables complete. Both user objectives (enforcement
    failure mapping + variant coverage check) answered with direct
    evidence (44 file:line + 8 evt citations, 15/17 VERIFIED tags).
    Production repo untouched (git clean). No MANDATORY or HARD gates
    blocked or skipped. Single SOFT gate skip (FINAL_ADVERSARIAL_GATE)
    is contract-mandated for zero-code-surface audit runs.
  results_summary:
    build: "N/A (report-only)"
    tests: "N/A (no code modified)"
    adversarial: "SKIPPED (SOFT — contract-mandated)"
    regression: "N/A (no production changes)"
  confidence:
    score: 0.85
    zone: "HIGH"
    gate_penalty: -0.15
  gate_summary:
    total_triggered: 4
    soft_skipped: 1
    skipped_gates:
      - "FINAL_ADVERSARIAL_GATE (SOFT — per audit-heavy contract line 148)"
  fidelity:
    score: null
    mandatory_triggered: null
    mandatory_expected: null
    global_fidelity_pct: null
    report_md: "n/a (report-only audit run)"
    report_json: "n/a"
  files_modified: []
  tests_created: []
  pending_items: []
  closeout_options: "C (keep changes uncommitted — audit artifacts in .pipeline/docs/)"
```

---

## STEP 3.5: USER SCORE COLLECTION

`LANGFUSE_ENABLED` status: not set to `"true"` or `"1"` in this run environment (no `LANGFUSE_ENABLED` env var confirmed via sentinel-state context). Step 3.5 skipped per contract.

---

## CLOSEOUT OPTIONS

Decision: GO

Since this is a report-only audit run (no code changes, no commits, no production modifications), the relevant options are:

| Option | Description |
|--------|-------------|
| A | Commit the pipeline docs folder (audit artifacts) locally |
| B | Commit + Push + mention in PR (if applicable) |
| **C** | **Keep audit artifacts as-is (recommended — already on disk, no commit needed)** |
| D | Discard all pipeline doc artifacts |

**Recommendation: Option C.** The audit artifacts live in the `.pipeline/docs/` working directory. They are already accessible for reference. A commit is optional — choose A or B if you want these findings versioned in git history. Choose D only if the audit was exploratory and you want a clean slate.

Options B (push) and D (discard) require explicit confirmation before execution — these are irreversible or externally visible actions.

---

## AUDIT FINDINGS SUMMARY FOR HANDOFF

For the engineering team acting on this audit, the priority backlog from 07-audit-risk-matrix.md is:

**Quick wins (hours):**
- Update stale gate-count inline copies from 22/27 to 35 (commands/pipeline.md:387,1020 and agents/core/pipeline-controller.md:261,298) — no runtime behavior change, eliminates governance contradiction
- Correct audit-heavy.md:3 to state inline routing (not Skill dispatch)
- Establish canonical Feature type name as `feature-*` to match skills/ directory
- Add plan-architect to F20 test MANDATORY_AGENTS array (9→10)
- Fix stop-hook timestamp derivation from sentinel created_at

**This week (days):**
- Fix run_id propagation: write `run_id` field into sentinel-state.json at run creation; update langfuse-carrier.cjs readSentinelData() to read `run_id` with `pipeline_id` fallback
- Replace fidelity-report idempotent-never-overwrite guard with keep-max strategy (stop-hook.cjs:239-245)

**This sprint (days):**
- Require PIPELINE_DOC_PATH at run creation; harden discovery to warn (not silently fallback) when unset; remove mtime-scan as default fallback
- Add behavioral test for sentinel-hook deny path (sentinel-hook.cjs:342-377)
- Extend sentinel enforcement to inline-routed pipeline types (audit-*, ux-sim-*, user-story-*)

**Long-term (weeks):**
- Convert Plan Mode enforcement from prose to deterministic hook in dispatch-guard.cjs
- Extract PLAN_MODE_MANDATORY_AGENTS table to machine-readable YAML; have dispatch-guard read it at runtime
- Build L3 skill folders and L4 regression tests for UX Simulation and User Story types

**Do not touch without prerequisites:**
- `references/gates.md` registry rows (gate_registry_modification is FORBIDDEN per implementation-discipline.md)
- `sentinel-hook.cjs` deny path (lines 342-377) — add behavioral test FIRST (AUDIT-009-fix)
- `pipeline-controller.md` PLAN_MODE_MANDATORY_AGENTS table in isolation — any membership change cascades to 3 artifacts
