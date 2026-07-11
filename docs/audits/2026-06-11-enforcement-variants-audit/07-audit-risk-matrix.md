# 07-audit-risk-matrix.md — Enforcement Variants Audit
**Phase:** 4 (Consolidation & Risk Matrix)
**Auditor:** audit-risk-matrix-generator
**Run date:** 2026-06-11
**Inputs consumed:**
- `04-audit-intake.md` (AuditIntake — Signals A-G + S1/S2)
- `05-audit-domain-analyzer.md` (DOMAIN_ANALYSIS — mechanism classification, SSOT drift, cascade map, Signal G root-cause)
- `06-audit-compliance-checker.md` (COMPLIANCE_REPORT — 4 axes, 5×4 variant matrix)
- `protocol-events.jsonl` (14 live events, evt-001 → evt-014)
- `gate-decisions.jsonl` (3 decisions — all NOT_TRIGGERED)

**Mandatory T3 Correction applied:** T3 claimed `gate-decisions.jsonl` and `protocol-events.jsonl` are absent from the canonical run folder — this was WRONG. T3 inspected the repo-side mirror folder (Signal F dual-location confusion). Both files exist in the canonical pipeline docs folder. This is reclassified as additional Signal F / evt-012 evidence and surfaced in the executive summary as a notable meta-finding: the audit caught itself committing the very defect it was documenting.

---

```yaml
AUDIT_REPORT:

  # =================================================================
  # EXECUTIVE SUMMARY
  # =================================================================
  executive_summary: |
    The pipeline-orchestrator v7.10.1 enforcement system is structurally sound at the
    level it was built to operate — runtime hook sequencing works, the test suite is
    green, and the Bug Fix pathway (the most-used type) is fully covered. However, the
    audit uncovered five critical defects concentrated in two areas: (1) the Plan Mode
    contract — the mechanism designed to force research agents into a supervised planning
    phase before doing any free-form investigation — is enforced entirely by persuasive
    prose with zero deterministic backstop; a live bypass occurred during this very audit
    run (Signal G: design-interrogator performed 94 inline tool uses undetected), and the
    four regression tests that are supposed to guard this contract assert only that the
    text is present in the right files, not that the runtime actually enforces it; (2) the
    telemetry correlation layer is broken in production — all 384 Langfuse pipeline spans
    from the last 10 days carry run_id=null, making it impossible to attribute any
    enforcement event to a specific run, and the fidelity scores that feed into the health
    dashboard freeze at the value recorded during the first sub-session teardown, never
    updating even when subsequent sessions trigger more gates.

    A notable meta-finding: during Task T3 (the compliance-checker audit), the auditor
    itself made the exact mistake it was documenting — it looked in the wrong folder for
    the telemetry files and declared them absent, committing the dual-location confusion
    defect (Signal F) it was auditing. This is not a process failure; it is live evidence
    that the dual-location ambiguity is real enough to fool both pipeline agents and auditors.

    The top priority is converting the Plan Mode enforcement from persuasive text to a
    deterministic hook that intercepts agent dispatches and validates whether a
    PLAN_MODE_REQUEST was emitted before any research tool use. The second priority is
    fixing the run_id propagation so telemetry traces are attributable. Everything else
    follows.

  # =================================================================
  # RISK MATRIX — ordered by risk_score DESC (scale 1-25)
  # =================================================================
  risk_matrix:

    - id: "AUDIT-001"
      title: "Plan Mode contract enforced by prose-only — zero hook backstop"
      description: |
        PLAN_MODE_MANDATORY_AGENTS table (pipeline-controller.md:518-531) lists 10 agents
        that MUST emit PLAN_MODE_REQUEST before performing any inline research. The enforcement
        mechanism is entirely pipeline-controller.md prose (line 533) and per-agent Step-0
        text. grep PLAN_MODE_BYPASS|PLAN_MODE_REQUEST across .claude/hooks/ returns ZERO
        matches. No hook intercepts whether the REQUEST block was emitted before tool use
        begins. All four regression tests (F18/F19/F20/F21) assert that the contract TEXT
        is present in the correct files — not that the runtime DETECTS or ENFORCES anything.
        A run can violate the contract while every test stays green.
      impact: 5
      probability: 5
      risk_score: 25
      classification: "Critical"
      tag: "[VERIFIED]"
      evidence:
        - file: ".claude/hooks/ (grep PLAN_MODE_BYPASS|PLAN_MODE_REQUEST)"
          line: "ALL — 0 matches"
          detail: "Zero hook code exists for Plan Mode enforcement"
        - file: "agents/core/pipeline-controller.md"
          line: 533
          detail: "PLAN_MODE_BYPASS enforcement is prose-only; hardness explicitly AUDIT not HARD"
        - file: "tests/regression/v7.10.0/F20-plan-mode-mandatory-agents.test.cjs"
          line: "25-35"
          detail: "F20 loops 9 agents (plan-architect absent), asserts TEXT presence only"
        - evt: "evt-005"
          detail: "Signal G live bypass: design-interrogator performed 94 inline tool uses without PLAN_MODE_REQUEST; controller cleared with factually wrong claim"
      affected_variants: ["all — every pipeline variant that dispatches a PLAN_MODE_MANDATORY agent"]
      source_reports: ["DOMAIN_ANALYSIS.prompt_only_layers_flagged.layer_1", "COMPLIANCE_REPORT.axis_B.B-001", "COMPLIANCE_REPORT.axis_D.D-001", "AuditIntake.layer_1_plan_mode_contract"]
      dedup_note: "Merges AuditIntake Signal G, DOMAIN_ANALYSIS Layer 1, COMPLIANCE_REPORT B-001 and D-001 — all refer to the same defect"

    - id: "AUDIT-002"
      title: "Controller table-lookup is LLM-textual read — Signal G bypass occurred live"
      description: |
        The PLAN_MODE_MANDATORY_AGENTS table (pipeline-controller.md:518-531) is a prose table
        read by the controller LLM at runtime. No programmatic lookup exists. In this audit run
        (evt-005), design-interrogator performed 94 inline tool uses without emitting
        PLAN_MODE_REQUEST. The controller ACCEPTED the output and cleared the agent with the
        factually wrong claim that design-interrogator was 'not in the table' — it IS listed at
        line 527. The PLAN_MODE_BYPASS detector (line 533) did not fire because both the
        table-lookup and the bypass detector share the same fallible textual read. There is no
        independent cross-check. The same controller that owns the table also owns the detector.
      impact: 5
      probability: 4
      risk_score: 20
      classification: "Critical"
      tag: "[VERIFIED]"
      evidence:
        - file: "agents/core/pipeline-controller.md"
          line: 518-531
          detail: "PLAN_MODE_MANDATORY_AGENTS table — design-interrogator at line 527"
        - file: "agents/core/pipeline-controller.md"
          line: 533
          detail: "Enforcement detector is prose on the same controller that misread the table"
        - evt: "evt-005"
          detail: "Live Signal G bypass: controller cleared design-interrogator claiming 'not in table'"
        - file: "agents/core/pipeline-controller.md"
          line: 527
          detail: "design-interrogator IS in table — factual contradiction with controller's claim"
      affected_variants: ["any pipeline type that dispatches a PLAN_MODE_MANDATORY agent without programmatic table validation"]
      source_reports: ["DOMAIN_ANALYSIS.contract_compliance.design-interrogator", "DOMAIN_ANALYSIS.why_signal_G_slipped", "COMPLIANCE_REPORT.axis_B.B-002", "AuditIntake.layer_4_dispatch_table.Signal-D"]

    - id: "AUDIT-003"
      title: "run_id=null on ALL Langfuse production spans — enforcement attribution impossible"
      description: |
        All 384 Langfuse pipeline-run observations from 2026-06-01 to 2026-06-11 carry
        run_id=null and pipeline_doc_path=''. Root cause: sentinel-state.json stores
        'pipeline_id' not 'run_id'; the Langfuse carrier's readSentinelData() looks for
        sentinel.run_id (field absent) and falls back to null. PIPELINE_RUN_ID env is never
        set when the controller creates the run folder manually. The consequence is that it
        is impossible to attribute any Langfuse enforcement event to a specific pipeline run.
        Telemetry exists but is unqueryable by run. Additionally, cross-trace collision is
        likely when two runs share a cwd and PIPELINE_RUN_ID is unset (mtime fallback
        selects the newest state folder, not necessarily the correct one).
      impact: 4
      probability: 5
      risk_score: 20
      classification: "Critical"
      tag: "[VERIFIED]"
      evidence:
        - file: ".pipeline/docs/Pre-Complex-action/2026-06-11-auditoria-enforcement-variants/sentinel-state.json"
          line: "root"
          detail: "Has 'pipeline_id' field, no 'run_id' field — carrier readSentinelData() returns null"
        - file: "lib/langfuse-carrier.cjs"
          line: "readSentinelData()"
          detail: "Reads sentinel.run_id — field absent in all runs"
        - evidence_from: "parent queryMetrics + listObservations (2026-06-01 to 06-11)"
          detail: "ALL 384 pipeline-run spans: run_id=null, pipeline_doc_path=''"
        - evt: "evt-012"
          detail: "T3 itself became a victim of cwd/folder confusion — meta-confirmation of ambiguity severity"
      affected_variants: ["all — every variant writes Langfuse traces"]
      source_reports: ["COMPLIANCE_REPORT.axis_A.A-002", "COMPLIANCE_REPORT.langfuse_runtime_evidence_integration"]

    - id: "AUDIT-004"
      title: "Fidelity-report frozen at first teardown — multi-session runs permanently undercount"
      description: |
        stop-hook.cjs ensureFidelityReport() contains an idempotent-never-overwrite guard: if the
        fidelity-report.json file already exists it returns immediately without updating. First
        write wins permanently. In a multi-session pipeline run where the first sub-session tears
        down before all gates have been triggered, the fidelity score is frozen at the undercount
        value. Subsequent sessions that trigger additional gates cannot update it. Confirmed live:
        the 2026-06-06 run shows fidelity_score=0.2727 frozen across all 4 sessions despite
        total_gates_triggered growing from 4 to 15 across those sessions. Secondary consequence:
        if gate-decisions.jsonl is absent at first teardown, the function skips without creating
        any file, and all subsequent teardowns also skip (existsSync=false for report → proceed,
        then existsSync=false for gate-data → return-nothing) → report never created →
        fidelity_score=null permanently.
      impact: 4
      probability: 5
      risk_score: 20
      classification: "Critical"
      tag: "[VERIFIED]"
      evidence:
        - file: ".claude/hooks/stop-hook.cjs"
          line: 239-245
          detail: "ensureFidelityReport idempotent guard: 'if (fs.existsSync(reportPath)) return'"
        - file: ".pipeline/run-log.jsonl"
          line: "lines 120-123"
          detail: "2026-06-06 run: fidelity_score=0.2727 identical across all 4 entries despite gates growing 4→15"
        - file: ".pipeline/run-log.jsonl"
          line: "last entry"
          detail: "2026-06-09 run: fidelity_score=null, total_gates_triggered=0, total_gates_expected=11"
      affected_variants: ["all — all variants use the same stop-hook teardown path"]
      source_reports: ["AuditIntake.layer_3_fidelity_freeze", "COMPLIANCE_REPORT.axis_A.A-001", "COMPLIANCE_REPORT.fidelity_scoring", "DOMAIN_ANALYSIS.cascade_risk_paths.fidelity-freeze"]

    - id: "AUDIT-005"
      title: "cwd-discovery cascade: env-unset causes sentinel + run-log + fidelity + Langfuse to degrade together"
      description: |
        Both sentinel-hook.cjs (discoverStatePath, line 150-195) and stop-hook.cjs
        (findActiveRunFolder, lines 118-170) use the same discovery precedence: (1)
        PIPELINE_DOC_PATH env, (2) PIPELINE_RUN_ID env match, (3) mtime-newest scan under
        process.cwd()/.pipeline/docs. When both env vars are unset and the session cwd does
        not match the repo root, all four dependent systems degrade simultaneously: sentinel
        sequencing may deny with 'no state file found' (evt-002, false deny), run-log is
        misattributed to wrong run, fidelity-report is written against wrong run folder,
        Langfuse traces have pipeline_doc_path=''. This is a single coupling point that
        degrades four enforcement and observability layers at once. The current run experienced
        this live (evt-002: plan-architect spawn denied because sentinel walked cwd to wrong
        folder; workaround: relocate doc path to cwd-visible location). T3 made the same
        mistake (evt-012): declared files absent because it inspected the repo-side mirror
        folder, not the canonical cwd-visible location.
      impact: 5
      probability: 4
      risk_score: 20
      classification: "Critical"
      tag: "[VERIFIED]"
      evidence:
        - file: ".claude/hooks/sentinel-hook.cjs"
          line: 150-195
          detail: "discoverStatePath: PIPELINE_DOC_PATH(env) > PIPELINE_RUN_ID(env) > cwd-relative mtime scan"
        - file: ".claude/hooks/stop-hook.cjs"
          line: 118-170
          detail: "findActiveRunFolder: same precedence chain; cwd param at line 458"
        - evt: "evt-002"
          detail: "Live false deny: sentinel blocked plan-architect because state was in repo subfolder not cwd"
        - evt: "evt-012"
          detail: "T3 audit agent committed dual-location confusion — inspected mirror not canonical folder"
        - evt: "evt-013"
          detail: "Positive control: when state IS discoverable from cwd, sentinel deny + expected_next sequencing work correctly"
      affected_variants: ["all — all variants use sentinel-hook + stop-hook discovery"]
      source_reports: ["DOMAIN_ANALYSIS.cascade_risk_paths.Signal-F", "COMPLIANCE_REPORT.axis_A.A-006", "AuditIntake.layer_5_run_log_incoherence"]

    - id: "AUDIT-006"
      title: "Plan Mode tests assert text presence only — contract violation and green suite can coexist"
      description: |
        All four Plan Mode regression tests (F18/F19/F20/F21) are TEXT-ONLY: they assert that
        specific strings (PLAN_MODE_REQUEST, AWAITING_PLAN_MODE_RESULTS, PLAN_MODE_BYPASS paragraph)
        exist verbatim in the agent prose files. They do not: (a) require sentinel-hook.cjs and
        simulate a real dispatch, (b) verify that a real PLAN_MODE_REQUEST block was emitted before
        tool use, or (c) verify that a PLAN_MODE_BYPASS event is written to protocol-events.jsonl.
        As demonstrated by Signal G (evt-005): design-interrogator violated the contract in this
        run, yet all 4 tests would still be green because the contract text is physically present
        in the files. The test suite cannot detect runtime enforcement gaps. Additionally, F20
        omits plan-architect from its MANDATORY_AGENTS loop (9 agents, not 10) — plan-architect
        has a separate F18 but F20's coverage claim of 'all 10 mandatory agents' is false.
      impact: 4
      probability: 5
      risk_score: 20
      classification: "Critical"
      tag: "[VERIFIED]"
      evidence:
        - file: "tests/regression/v7.9.4/F18-plan-mode-contract.test.cjs"
          line: "all"
          detail: "Asserts heading extraction + string presence in plan-architect.md. No hook execution."
        - file: "tests/regression/v7.10.0/F20-plan-mode-mandatory-agents.test.cjs"
          line: "25-35"
          detail: "Loops 9 agents only — plan-architect ABSENT from MANDATORY_AGENTS array"
        - file: "tests/regression/v7.9.4/F19-controller-inline-plan-check.test.cjs"
          line: "all"
          detail: "Asserts AUDIT label text present in controller.md. No protocol-events.jsonl write tested."
        - evt: "evt-005"
          detail: "Signal G bypass in this run: all 4 tests green while contract was violated"
      affected_variants: ["all — test weakness spans all pipeline types"]
      source_reports: ["COMPLIANCE_REPORT.axis_D.D-001", "COMPLIANCE_REPORT.axis_C.C-004", "DOMAIN_ANALYSIS.why_signal_G_slipped.reason_3"]

    - id: "AUDIT-007"
      title: "Sentinel checkpoint enforcement ABSENT for all inline-routed pipelines"
      description: |
        enforceSkillContract() in sentinel-hook.cjs (lines 45-62) returns null (skips entirely)
        when no skill is currently in flight (current_skill absent from state). The only pipelines
        with a skill in flight are those dispatched via the Skill tool: bugfix-light, bugfix-heavy,
        and all spec-* variants. All other pipeline types — audit-*, ux-sim-*, user-story-*,
        feature-*/implement-* — run inline from the controller with no skill registered. These four
        types (3 of 5 task types, or 4 of 6 enforcement layers) operate entirely without sentinel
        checkpoint enforcement. The TDD gate sequencing obligation (quality-gate-router +
        pre-tester must complete before executor-controller) is also unenforced for inline variants
        because no skill sentinel_checkpoints exist for them.
      impact: 4
      probability: 4
      risk_score: 16
      classification: "High"
      tag: "[VERIFIED]"
      evidence:
        - file: ".claude/hooks/sentinel-hook.cjs"
          line: 45-62
          detail: "enforceSkillContract: returns null immediately when current_skill is absent"
        - file: "agents/core/pipeline-controller.md"
          line: 192
          detail: "Inline routing list: implement-light/heavy, user-story-light/heavy, audit-*, ux-sim-*, DIRETO"
        - file: ".claude/hooks/dispatch-guard.cjs"
          line: 124
          detail: "dispatch-guard validates only when current_skill+step are set — same conditional gap"
      affected_variants: ["Audit-light", "Audit-heavy", "UX Simulation-light/heavy", "User Story-light/heavy", "Feature/implement-light/heavy"]
      source_reports: ["COMPLIANCE_REPORT.axis_B.B-005", "COMPLIANCE_REPORT.axis_B.B-003", "DOMAIN_ANALYSIS.invariant_classification.skill-contract"]

    - id: "AUDIT-008"
      title: "Gate-count 5-source SSOT drift: self-declared authorities are stale; correct registry would be branded tampered"
      description: |
        The gate registry has FOUR distinct numbers across FIVE sources:
        - 22: commands/pipeline.md:387 Inline Invariants (self-declared override authority: 'override
          Grep results if they disagree') + commands/pipeline.md:1020 + controller:298
        - 27: agents/core/pipeline-controller.md:261 Inline Invariants
        - 23: Mandatory-by-Complexity unique gate names (different denominator, legitimately != 35)
        - 35: references/gates.md header + 35 rows verified by direct enumeration
        The two sources that explicitly claim override-precedence (pipeline.md:387 and
        controller:261) are BOTH stale — missing 13 and 8 gates respectively from the
        authoritative 35-gate registry. A contributor who found gates.md at 35 rows would be
        instructed by the self-declared authority to treat it as 'tampered'. The fix direction
        is to update the stale inline copies to match gates.md=35; the registry itself must NOT
        be edited (gate_registry_modification is a forbidden change type per
        references/implementation-discipline.md).
      impact: 3
      probability: 5
      risk_score: 15
      classification: "High"
      tag: "[VERIFIED]"
      evidence:
        - file: "commands/pipeline.md"
          line: 387
          detail: "Inline Invariants: '22 gates'; self-declares override-precedence; stale by 13 gates"
        - file: "commands/pipeline.md"
          line: 1020
          detail: "'Full 22-gate table lives in references/gates.md' — points to file that has 35"
        - file: "agents/core/pipeline-controller.md"
          line: 261
          detail: "Inline Invariants: 27 named gates; stale by 8 gates; disagrees with pipeline.md:387"
        - file: "agents/core/pipeline-controller.md"
          line: 298
          detail: "'The 22-gate registry is unchanged' — stale reference"
        - file: "references/gates.md"
          line: 3
          detail: "Header: '35-gate registry' — 35 rows verified by direct enumeration"
      affected_variants: ["all — fidelity denominator reads from gates.md:92-124 Mandatory table, not from inline copies"]
      source_reports: ["DOMAIN_ANALYSIS.ssot_verification.gate_count", "COMPLIANCE_REPORT.axis_C.C-001", "COMPLIANCE_REPORT.axis_C.C-005"]

    - id: "AUDIT-009"
      title: "sentinel-hook deny path has no behavioral test"
      description: |
        sentinel-hook.cjs (lines 342-377) is the sole deterministic enforcement mechanism in the
        entire repo — expected_next mismatch causes permissionDecision=deny. No test exercises
        this code path with a real stdin payload and asserts the deny response. F6_settings_json
        asserts the hook is registered in settings.json (text check). F5_stop_hook.cjs tests
        stop-hook exports. Neither simulates a PreToolUse interception with a crafted payload
        that should deny and verifies the hookSpecificOutput.permissionDecision field. The most
        critical runtime safety mechanism is behavioral-but-untested. Confirmed working by
        evt-013 (positive control: sentinel denied executor-controller spawn because
        expected_next=audit-risk-matrix-generator was set prematurely), but a regression that
        breaks the deny path would not be caught by any automated test.
      impact: 4
      probability: 3
      risk_score: 12
      classification: "High"
      tag: "[VERIFIED]"
      evidence:
        - file: ".claude/hooks/sentinel-hook.cjs"
          line: 342-377
          detail: "expected_next match → allow; mismatch → permissionDecision deny. Core deny logic."
        - file: "tests/ (entire directory inventory)"
          line: "N/A"
          detail: "No test file requires sentinel-hook.cjs with stdin payload + asserts deny response"
        - evt: "evt-013"
          detail: "Positive control: deny path works in production — but no regression test guards it"
      affected_variants: ["all — sentinel-hook guards all Agent dispatch calls"]
      source_reports: ["COMPLIANCE_REPORT.axis_D.D-002", "COMPLIANCE_REPORT.axis_B (Layer 5 partial)"]

    - id: "AUDIT-010"
      title: "clock-skew aborted run permanently incoherent in run-log"
      description: |
        The 2026-06-09 run-log entry has timestamp_end ('2026-06-09T14:17:47.784Z') BEFORE
        timestamp_start ('2026-06-09T18:10:00.000Z'). stop-hook does not validate that
        end>=start before writing. Mechanism: timestamp_start was likely entered manually as
        '18:10' in a local timezone while stop-hook's wall-clock read 14:17 UTC. Secondary
        cause: stop-hook reads timestamp_start from session context with a null fallback; it
        does NOT derive from sentinel-state.json created_at. Multi-session runs also permanently
        carry timestamp_start=null (all 4 entries for the 2026-06-06 run). The entry is
        permanently incoherent because the idempotent freeze prevents correction.
      impact: 2
      probability: 4
      risk_score: 8
      classification: "Medium"
      tag: "[VERIFIED]"
      evidence:
        - file: ".pipeline/run-log.jsonl"
          line: "last entry (2026-06-09 run)"
          detail: "timestamp_end='2026-06-09T14:17:47.784Z', timestamp_start='2026-06-09T18:10:00.000Z'; final_decision=UNKNOWN; 0/11 gates"
        - file: ".claude/hooks/stop-hook.cjs"
          line: "timestamp_start read"
          detail: "Reads from session context with null fallback; does not derive from sentinel created_at"
        - file: ".pipeline/run-log.jsonl"
          line: "lines 120-123 (2026-06-06 run)"
          detail: "4 entries, all timestamp_start=null, duration_seconds=0"
      affected_variants: ["all — all variants use same stop-hook timestamp assembly"]
      source_reports: ["AuditIntake.Signal-A + S1", "COMPLIANCE_REPORT.axis_A.A-003 + A-007", "DOMAIN_ANALYSIS.cascade_risk_paths.clock-skew"]

    - id: "AUDIT-011"
      title: "chat-derek foreign traces polluting pipeline Langfuse project"
      description: |
        Parent queryMetrics (2026-06-01 to 2026-06-11) shows 475 observations labeled 'chat-derek'
        in the pipeline-orchestrator Langfuse project, alongside 384 pipeline-run and 397 null
        observations. The plugin's Langfuse key (pk-lf-1520c749...) is correctly dedicated to this
        project (not the Derek-project key pk-lf-45a8b363...). The contamination is therefore
        external to the plugin — either the same Langfuse project is being used by another
        application, or another application was misconfigured to use this project's keys.
        Consequence: queryMetrics counts are polluted; health dashboards that count total observations
        as pipeline-run proxies are inflated by 55%. Also 397 null-traceName spans persist
        post-v7.9.3 fragmentation fix.
      impact: 2
      probability: 5
      risk_score: 10
      classification: "Medium"
      tag: "[VERIFIED — mechanism HYPOTHESIS: shared project or external key reuse]"
      evidence:
        - evidence_from: "parent queryMetrics (2026-06-01 to 06-11)"
          detail: "chat-derek=475, pipeline-run=384, null=397, ai-conversation=12"
        - file: "lib/langfuse-client.cjs"
          line: 53
          detail: "Plugin key pk-lf-1520c749... is CORRECT — not the Derek key pk-lf-45a8b363..."
      affected_variants: ["all — pollution is at the Langfuse project level, not variant-specific"]
      source_reports: ["COMPLIANCE_REPORT.axis_A.A-004 + A-005"]

    - id: "AUDIT-012"
      title: "audit-heavy.md contradicts pipeline-controller on dispatch method"
      description: |
        references/pipelines/audit-heavy.md line 3 states that the audit pipeline 'dispatches
        the skill via Skill(pipeline-orchestrator:audit-heavy) for Phase 2 execution'.
        agents/core/pipeline-controller.md line 192 lists audit-* as inline-routed (explicitly
        excluded from the Skill-dispatch path). This is a direct contradiction. The controller
        is the runtime authority; audit-heavy.md is wrong. A contributor reading audit-heavy.md
        would expect Skill dispatch with sentinel_checkpoints — but those never fire for inline
        routes because enforceSkillContract skips when current_skill is absent.
      impact: 2
      probability: 4
      risk_score: 8
      classification: "Medium"
      tag: "[VERIFIED]"
      evidence:
        - file: "references/pipelines/audit-heavy.md"
          line: 3
          detail: "Claims Skill dispatch via pipeline-orchestrator:audit-heavy"
        - file: "agents/core/pipeline-controller.md"
          line: 192
          detail: "Lists audit-* as inline-routed — CONTRADICTION"
      affected_variants: ["Audit-heavy"]
      source_reports: ["COMPLIANCE_REPORT.axis_C.C-002"]

    - id: "AUDIT-013"
      title: "Feature-type naming mismatch across three systems"
      description: |
        The Feature task type has three inconsistent naming conventions in active use:
        (1) complexity-matrix.md line 61 uses 'implement-light | implement-heavy';
        (2) skills/ directory has 'feature-light/' and 'feature-heavy/' — no implement-* folders;
        (3) references/pipelines/ has 'implement-heavy.md' marked DEPRECATED as of v4.7.0.
        pipeline-controller.md line 192 lists 'implement-light/heavy' as inline-routed. If a
        contributor or the controller ever attempts to dispatch the Feature skill by name, the
        name mismatch between the routing table ('implement-*') and the skill folder ('feature-*')
        would cause a silent routing failure. Variant matrix score: 2/4 (degraded).
      impact: 2
      probability: 4
      risk_score: 8
      classification: "Medium"
      tag: "[VERIFIED]"
      evidence:
        - file: "references/complexity-matrix.md"
          line: 61
          detail: "Uses 'implement-light | implement-heavy' for Feature type"
        - file: "skills/"
          line: "N/A"
          detail: "Has feature-light/ and feature-heavy/ — no implement-light/ or implement-heavy/"
        - file: "references/pipelines/implement-heavy.md"
          line: 1
          detail: "DEPRECATED as of v4.7.0"
        - file: "agents/core/pipeline-controller.md"
          line: 192
          detail: "Lists 'implement-light/heavy' as inline-routed"
      affected_variants: ["Feature-light", "Feature-heavy"]
      source_reports: ["COMPLIANCE_REPORT.axis_C.C-003", "COMPLIANCE_REPORT.variant_coverage_matrix.Feature"]

    - id: "AUDIT-014"
      title: "UX Simulation and User Story types have no L3 skill folders and no L4 regression tests"
      description: |
        UX Simulation and User Story each score 2/4 on the variant coverage matrix. L3: no
        skills/ux-sim-* or skills/user-story-* folders exist (unlike audit-* which has skill
        folders even though they are not dispatched). L4: no regression test file covers
        ux-sim-specific routing, gate triggering, or ux-simulator/ux-accessibility-auditor/
        ux-qa-validator agent enforcement. User Story likewise has zero dedicated tests.
        These two types have L1 routing rows and L2 pipeline docs but no skill dispatch
        surface and no behavioral test coverage.
      impact: 2
      probability: 3
      risk_score: 6
      classification: "Medium"
      tag: "[VERIFIED]"
      evidence:
        - file: "skills/"
          line: "N/A"
          detail: "No ux-sim-* or user-story-* entries in skills/ directory"
        - file: "tests/regression/"
          line: "N/A"
          detail: "No *ux-sim* or *user-story* test files"
        - file: "references/complexity-matrix.md"
          line: "62-64"
          detail: "Both types appear in routing table — L1 is present"
      affected_variants: ["UX Simulation-light/heavy", "User Story-light/heavy"]
      source_reports: ["COMPLIANCE_REPORT.variant_coverage_matrix.UX_Simulation + User_Story", "COMPLIANCE_REPORT.axis_D.D-004"]

    - id: "AUDIT-015"
      title: "F20 test plan-architect omission and fidelity-freeze cascade untested"
      description: |
        Two medium test gaps: (1) F20-plan-mode-mandatory-agents.test.cjs MANDATORY_AGENTS array
        (lines 25-35) contains 9 agents, omitting plan-architect. plan-architect IS in the
        controller table at line 522 and F18 tests it separately, but F20's coverage of 'all 10
        mandatory agents' is incomplete. (2) F16-fidelity-report-on-stop.test.cjs tests that the
        idempotent guard skips an overwrite (scenario S2), but no test simulates two consecutive
        teardowns and verifies the run-log entry for the second teardown still reads the frozen
        undercount score from the first — the cascade to run-log staleness is untested.
      impact: 2
      probability: 3
      risk_score: 6
      classification: "Medium"
      tag: "[VERIFIED]"
      evidence:
        - file: "tests/regression/v7.10.0/F20-plan-mode-mandatory-agents.test.cjs"
          line: "25-35"
          detail: "9 agents in array — plan-architect absent despite being in controller table at line 522"
        - file: "tests/regression/v7.9.3/F16-fidelity-report-on-stop.test.cjs"
          line: "scenario S2"
          detail: "Tests idempotent guard skip, but not cascade of frozen score to run-log"
        - file: "agents/core/pipeline-controller.md"
          line: 522
          detail: "plan-architect IS in the table"
      affected_variants: ["test accuracy — does not affect runtime behavior"]
      source_reports: ["COMPLIANCE_REPORT.axis_C.C-004", "COMPLIANCE_REPORT.axis_D.D-005"]

    - id: "AUDIT-016"
      title: "Anti-deadlock PLAN_MODE_BYPASS accept: second bypass always accepted — no terminal enforcement"
      description: |
        pipeline-controller.md line 533 explicitly states that the Plan Mode bypass enforcement is
        AUDIT hardness (not a registered gate) and that a second bypass is accepted
        unconditionally to prevent legacy session deadlock. This is a by-design decision.
        The risk: any pipeline where an agent bypasses Plan Mode twice (or the controller
        misreads once and the retry also bypasses) produces fully accepted inline-research output
        with no terminal block. Combined with AUDIT-001 (enforcement is prose-only) and AUDIT-002
        (table lookup is fallible), the anti-deadlock accept means Signal G events can always
        produce accepted output.
      impact: 3
      probability: 3
      risk_score: 9
      classification: "Medium"
      tag: "[VERIFIED — DESIGN]"
      evidence:
        - file: "agents/core/pipeline-controller.md"
          line: 533
          detail: "AUDIT hardness explicit; anti-deadlock accept on second bypass; explicitly NOT a registered gate"
      affected_variants: ["all — anti-deadlock accept applies to all pipeline types"]
      source_reports: ["DOMAIN_ANALYSIS.prompt_only_layers_flagged.layer_6", "COMPLIANCE_REPORT.axis_B.B-004"]

    - id: "AUDIT-017"
      title: "sentinel-hook cache vs repo byte-identical (informational — no action needed)"
      description: |
        Research finding [11] confirmed: sentinel-hook.cjs in the deployed cache and the repo
        copy are byte-identical (17536 bytes). This is informational — it confirms that the
        deployed hook matches the canonical source and no drift has occurred between repo and
        cache. No action required; included for completeness.
      impact: 1
      probability: 1
      risk_score: 1
      classification: "Low"
      tag: "[VERIFIED]"
      evidence:
        - file: "sentinel-hook.cjs (repo + cache)"
          line: "byte comparison"
          detail: "17536 bytes — identical"
      affected_variants: ["N/A"]
      source_reports: ["AuditIntake.layer_6_controller_bypass_gap.Signal-F"]

  # =================================================================
  # PRIORITY BACKLOG
  # =================================================================
  priority_backlog:

    quick_wins:
      - id: "AUDIT-008-fix"
        description: "Update two stale inline gate-count claims to match gates.md=35. Edit (1) commands/pipeline.md:387 Inline Invariants: change '22 total' to '35 total' and add the 13 missing gate names; (2) agents/core/pipeline-controller.md:261: add the 8 missing gate names; (3) pipeline-controller.md:298: update '22-gate registry' to '35-gate registry'; (4) commands/pipeline.md:1020: update '22-gate table' to '35-gate table'. DO NOT edit references/gates.md rows (forbidden change type)."
        finding_id: "AUDIT-008"
        risk_score: 15
        effort: "hours (4 targeted line edits)"
        dependencies: []
        safe_change_strategy: "Atomic: edit each of the 4 stale references independently; run F1 to verify gates.md unchanged; run full test suite; no runtime behavior changes."

      - id: "AUDIT-012-fix"
        description: "Correct references/pipelines/audit-heavy.md line 3 to state that the audit pipeline routes INLINE (not via Skill dispatch). Add a note that audit-heavy/, audit-light/ skill folders exist but are not wired to controller dispatch."
        finding_id: "AUDIT-012"
        risk_score: 8
        effort: "hours (1 file, 2-3 line edit)"
        dependencies: []
        safe_change_strategy: "Documentation-only change; no runtime impact."

      - id: "AUDIT-013-fix"
        description: "Establish a single canonical name for the Feature task type. Recommended: adopt 'feature-light/feature-heavy' (matching skills/ folder names) as the canonical naming; update complexity-matrix.md:61 from 'implement-light/implement-heavy' to 'feature-light/feature-heavy'; mark references/pipelines/implement-heavy.md and implement-light.md as DEPRECATED with forward pointer."
        finding_id: "AUDIT-013"
        risk_score: 8
        effort: "hours (3-4 file edits)"
        dependencies: []
        safe_change_strategy: "Documentation and routing-table update only; no hook code changes. Update pipeline-controller.md:192 'implement-light/heavy' reference to 'feature-light/heavy' simultaneously."

      - id: "AUDIT-015a-fix"
        description: "Add plan-architect to the MANDATORY_AGENTS array in F20-plan-mode-mandatory-agents.test.cjs (lines 25-35), bringing the count from 9 to 10. Run suite to confirm green."
        finding_id: "AUDIT-015"
        risk_score: 6
        effort: "hours (1 file, 1 array element)"
        dependencies: []
        safe_change_strategy: "Test-only change; atomic; reversible."

      - id: "AUDIT-010-fix"
        description: "Modify stop-hook.cjs timestamp assembly to: (a) derive timestamp_start from sentinel-state.json pipeline_id or created_at when session context provides null; (b) add a post-write validation guard that logs a warning if timestamp_end < timestamp_start (do not refuse to write — just log). This prevents new incoherent entries without breaking existing records."
        finding_id: "AUDIT-010"
        risk_score: 8
        effort: "hours (10-15 lines in stop-hook.cjs)"
        dependencies: []
        safe_change_strategy: "Additive: fallback to sentinel created_at is backward-compatible. Guard log is non-blocking. Add F-new behavioral test asserting timestamp derivation."

    medium_term:

      - id: "AUDIT-003-fix"
        description: "Fix run_id propagation: (a) rename sentinel-state.json 'pipeline_id' field to 'run_id' OR add a 'run_id' alias field written alongside 'pipeline_id'; (b) update langfuse-carrier.cjs readSentinelData() to read 'run_id' (with fallback to 'pipeline_id' for backward compat); (c) ensure pipeline-controller sets PIPELINE_RUN_ID env or writes run_id into sentinel-state at run creation. After fix, ALL new Langfuse spans should carry run_id != null."
        finding_id: "AUDIT-003"
        risk_score: 20
        effort: "days (3 files: sentinel-state writer, langfuse-carrier.cjs, pipeline-controller.md contract)"
        dependencies: []
        safe_change_strategy: "Add run_id as a NEW field alongside pipeline_id (not rename) to maintain backward compat with existing state files. Update F17 test to verify run_id is non-null."

      - id: "AUDIT-004-fix"
        description: "Fix fidelity freeze: replace the idempotent-never-overwrite guard in ensureFidelityReport() with a 'keep-max' strategy: if a fidelity-report.json already exists, read its total_gates_triggered; if the new count from gate-decisions.jsonl is HIGHER, overwrite; otherwise keep. This allows later sessions to update the score upward without losing the initial record. Alternatively: write fidelity-report.json only on the FINAL teardown (when final_decision is GO or NO-GO), not on every sub-session teardown."
        finding_id: "AUDIT-004"
        risk_score: 20
        effort: "days (1 file: stop-hook.cjs ensureFidelityReport; update F16 test)"
        dependencies: ["AUDIT-003-fix (run_id propagation — needed to identify which teardown is 'final')"]
        safe_change_strategy: "Keep-max is additive and reversible. Update F16 scenario S2 to assert that a second teardown with more gates DOES update the report."

      - id: "AUDIT-007-fix"
        description: "Enable sentinel checkpoint enforcement for inline-routed pipelines: either (a) register the audit-*, ux-sim-*, user-story-* types as skill-dispatched (move them from inline to Skill dispatch, leveraging existing skill folders for audit-*) or (b) extend enforceSkillContract to also check a 'pipeline_variant' field in sentinel-state (set by controller at run creation) so it can enforce expected_next even without a current_skill. Option (b) is lower risk."
        finding_id: "AUDIT-007"
        risk_score: 16
        effort: "days (sentinel-hook.cjs + pipeline-controller.md + controller expected_next set at run init)"
        dependencies: []
        safe_change_strategy: "Option (b) is additive: add pipeline_variant read to enforceSkillContract, defaulting to null-skip if absent (backward compat). Test: add behavioral test that spawns a mock inline audit pipeline and verifies expected_next mismatch causes deny."

      - id: "AUDIT-005-fix"
        description: "Eliminate cwd-coupled discovery fragility: add a required sentinel-state.json path written to an ABSOLUTE path ENV at run creation (PIPELINE_DOC_PATH must be set by controller, not discovered by hooks). Enforce: if PIPELINE_DOC_PATH is unset, sentinel-hook emits a startup warning and falls back only to PIPELINE_RUN_ID (no cwd-mtime scan). Eliminates the dual-location ambiguity that caused evt-002 and evt-012."
        finding_id: "AUDIT-005"
        risk_score: 20
        effort: "days (pipeline-controller.md: add PIPELINE_DOC_PATH set at run init; sentinel-hook.cjs + stop-hook.cjs: harden fallback path; add behavioral test)"
        dependencies: ["AUDIT-003-fix (run_id propagation uses same env vars)"]
        safe_change_strategy: "Additive: controller already knows the doc path at creation. Set env at creation; hooks use it preferentially (already in precedence chain). Only change: remove mtime-scan as automatic fallback; make it an explicit opt-in with a deprecation warning."

      - id: "AUDIT-009-fix"
        description: "Add a behavioral test for sentinel-hook deny path: create a test that (a) reads sentinel-hook.cjs via require(), (b) constructs a minimal stdin payload with a tool_name and an expected_next in sentinel-state that MISMATCHES, (c) calls the hook's main function, and (d) asserts hookSpecificOutput.permissionDecision === 'deny'. Mirror with a passing case (expected_next MATCHES → allow)."
        finding_id: "AUDIT-009"
        risk_score: 12
        effort: "days (1 new test file — F22 or similar)"
        dependencies: []
        safe_change_strategy: "Test-only change. Requires refactoring sentinel-hook.cjs slightly to export the core decision function (or accept stdin from a pipe in test mode). No production logic changes."

      - id: "AUDIT-011-fix"
        description: "Investigate and eliminate chat-derek foreign trace contamination: (a) identify which application is writing 'chat-derek' traces to the pipeline Langfuse project; (b) if it is a misconfigured external app, revoke the shared keys and issue new keys to the pipeline plugin; (c) if the project is intentionally shared, prefix all pipeline trace names with 'pipeline/' and query on that prefix. Add F14 assertion that no non-pipeline trace names appear in the project."
        finding_id: "AUDIT-011"
        risk_score: 10
        effort: "days (investigation + key rotation or filtering)"
        dependencies: []
        safe_change_strategy: "Key rotation is reversible. Query-prefix approach is additive."

    long_term:

      - id: "AUDIT-001-fix"
        description: "Convert Plan Mode enforcement from prompt-only to deterministic hook: add a PreToolUse hook (or extend dispatch-guard.cjs) that, when intercepting an Agent dispatch for an agent in the PLAN_MODE_MANDATORY_AGENTS list, checks whether the agent was dispatched WITH PLAN_MODE_RESULTS in its payload (a field the controller is required to include post-approval). If PLAN_MODE_RESULTS is absent, the hook emits a PLAN_MODE_BYPASS event to protocol-events.jsonl and may deny the dispatch or set expected_next back to the requesting agent. This converts the current prose-only detection to a deterministic pre-dispatch check."
        finding_id: "AUDIT-001"
        risk_score: 25
        effort: "weeks (new hook or extension of dispatch-guard.cjs; controller contract update to always inject PLAN_MODE_RESULTS tag; update F18/F19/F20/F21 to include behavioral assertions)"
        dependencies: ["AUDIT-005-fix (env path reliability needed for hook to read sentinel state reliably)"]
        safe_change_strategy: "Introduce as a new PreToolUse hook that adds a WARN event first (not deny) so the behavior can be monitored before enforcement is hardened. Gate the deny path behind a config flag."

      - id: "AUDIT-002-fix"
        description: "Replace LLM-textual table lookup with a programmatic check: extract the PLAN_MODE_MANDATORY_AGENTS list into a machine-readable YAML or JSON file (e.g., references/plan-mode-mandatory-agents.yaml) that both the controller prose cites AND the dispatch-guard hook reads at runtime. The hook can then verify table membership deterministically without relying on the controller LLM's textual reading."
        finding_id: "AUDIT-002"
        risk_score: 20
        effort: "weeks (extract table to YAML; update controller to cite YAML; update dispatch-guard to read YAML; update F20 to load YAML rather than text-grep)"
        dependencies: ["AUDIT-001-fix (the hook needs the list before it can enforce it)"]
        safe_change_strategy: "Extract is purely additive — YAML file is a new artifact. Controller prose can continue citing it as authoritative while hook reads it. Rollout: add YAML, update F20 first, then add hook enforcement."

      - id: "AUDIT-014-fix"
        description: "Build out L3 (skill folders) and L4 (regression tests) for UX Simulation and User Story: create skills/ux-sim-light/ and skills/ux-sim-heavy/ SKILL.md manifests with sentinel_checkpoints; create parallel User Story skill folders; add regression tests covering routing, expected agent dispatch, and gate sequencing for both types."
        finding_id: "AUDIT-014"
        risk_score: 6
        effort: "weeks (5-6 new SKILL.md files + 4-6 new regression test files)"
        dependencies: ["AUDIT-007-fix (sentinel enforcement for inline types — prerequisite for checkpoints to matter)"]
        safe_change_strategy: "Additive — new files only. Existing inline routing remains unchanged."

    do_not_touch:
      - location: "references/gates.md — registry rows (lines 25-76) and Mandatory-by-Complexity table (lines 92-124)"
        reason: "gate_registry_modification is a FORBIDDEN change type per references/implementation-discipline.md. F1 pins the table and breaks on edit by design. SSOT drift fixes must update the STALE INLINE COPIES (pipeline.md:387, controller:261) to match gates.md=35 — not the reverse."
        source: "DOMAIN_ANALYSIS.refactor_boundaries; AuditIntake.hotspots:references/gates.md"

      - location: "agents/core/pipeline-controller.md PLAN_MODE_MANDATORY_AGENTS table (lines 518-531)"
        reason: "10-agent roster is the live contract. Changing membership cascades to F20 test + 10 per-agent Step-0 clauses + per-agent hook payloads. Any change here must be accompanied by synchronized updates to all 3 downstream artifacts. Do not change in isolation."
        source: "DOMAIN_ANALYSIS.refactor_boundaries; COMPLIANCE_REPORT.axis_C.plan_mode_table_consistency"

      - location: ".claude/hooks/sentinel-hook.cjs expect_next deny logic (lines 342-377)"
        reason: "The only deterministic enforcement mechanism in the repo. Zero behavioral test coverage (AUDIT-009). Changing the deny logic without first adding a test (AUDIT-009-fix) risks breaking the sole safety net with no regression detection."
        source: "COMPLIANCE_REPORT.axis_D.D-002; evt-013 (positive control confirming it works)"

  # =================================================================
  # RECOMMENDATIONS
  # =================================================================
  recommendations:

    top_5_priorities:
      - priority: 1
        finding_id: "AUDIT-001"
        action: "Add a deterministic hook that checks for PLAN_MODE_RESULTS in agent dispatch payload before allowing a PLAN_MODE_MANDATORY agent to run inline. Hook should emit a PLAN_MODE_BYPASS event to protocol-events.jsonl and optionally deny."
        justification: "The Plan Mode contract is the architectural centerpiece of research quality control. It is entirely unenforceable today (0 hook lines). Signal G demonstrated a live bypass during this audit. All four guard tests are text-only and would stay green through any bypass. Risk score 25 (maximum)."
        affected_files:
          - ".claude/hooks/dispatch-guard.cjs or new PreToolUse hook"
          - "agents/core/pipeline-controller.md:533 (update enforcement rationale)"
          - "tests/regression/ (add behavioral F-new)"

      - priority: 2
        finding_id: "AUDIT-003"
        action: "Fix run_id propagation: pipeline-controller must write a 'run_id' field into sentinel-state.json at run creation (or alias pipeline_id as run_id); update langfuse-carrier.cjs readSentinelData() to read run_id with pipeline_id fallback."
        justification: "All 384 Langfuse spans over 10 days carry run_id=null, making enforcement event attribution impossible. The telemetry layer exists and produces data but cannot be queried per run. This blocks any future data-driven enforcement monitoring. Risk score 20."
        affected_files:
          - "agents/core/pipeline-controller.md (sentinel-state write contract)"
          - "lib/langfuse-carrier.cjs (readSentinelData)"
          - "tests/regression/v7.9.3/F17-langfuse-trace-enrichment.test.cjs"

      - priority: 3
        finding_id: "AUDIT-004"
        action: "Replace idempotent-never-overwrite guard in ensureFidelityReport() with a keep-max strategy that updates fidelity-report.json if a later teardown has triggered more gates than the frozen count."
        justification: "Fidelity scores are permanently frozen at first teardown, causing the health dashboard to report undercount values for all multi-session runs. Confirmed live: 2026-06-06 run shows 0.2727 frozen across 4 sessions despite gate count growing to 15. Risk score 20."
        affected_files:
          - ".claude/hooks/stop-hook.cjs (ensureFidelityReport, lines 239-245)"
          - "tests/regression/v7.9.3/F16-fidelity-report-on-stop.test.cjs (add scenario)"

      - priority: 4
        finding_id: "AUDIT-005"
        action: "Require pipeline-controller to set PIPELINE_DOC_PATH env at run creation and harden sentinel-hook + stop-hook discovery to warn (not silently fallback) when PIPELINE_DOC_PATH is unset. Remove the mtime-newest cwd-scan as a default fallback."
        justification: "The cwd-coupled discovery is a single coupling point that degrades 4 layers simultaneously (sentinel sequencing, run-log, fidelity-report, Langfuse). Demonstrated live this run: evt-002 false deny, evt-012 T3 auditor committed the same mistake. Risk score 20."
        affected_files:
          - "agents/core/pipeline-controller.md (add PIPELINE_DOC_PATH set at run creation)"
          - ".claude/hooks/sentinel-hook.cjs (lines 150-195)"
          - ".claude/hooks/stop-hook.cjs (lines 118-170)"

      - priority: 5
        finding_id: "AUDIT-008"
        action: "Update the two stale inline gate-count claims to match gates.md=35. Edit commands/pipeline.md:387 (22→35, add 13 missing gate names) and agents/core/pipeline-controller.md:261 (27→35, add 8 missing gate names). Also fix :298 and :1020 stale references. Do NOT edit gates.md registry."
        justification: "The self-declared 'override authority' (pipeline.md:387) is stale by 13 gates. A contributor who follows it would brand the correct gates.md as tampered. This is a low-effort fix (hours) for a high-risk governance contradiction. Risk score 15."
        affected_files:
          - "commands/pipeline.md:387, 1020"
          - "agents/core/pipeline-controller.md:261, 298"

    contract_ssot_strategy:
      - concept: "PLAN_MODE_MANDATORY_AGENTS list"
        current_state: "Table at pipeline-controller.md:518-531 (prose) + 10 per-agent Step-0 clauses + F20 array (9, incomplete). Three representations, all text-only."
        recommendation: "Extract to a single machine-readable artifact (references/plan-mode-mandatory-agents.yaml). Controller prose and F20 test read from it; dispatch-guard hook checks against it at runtime. One source, one update point."
        tag: "[DESIGN — AUDIT-002-fix]"

      - concept: "Gate registry total count"
        current_state: "Five sources, four numbers. Two self-declared authorities stale by 8-13 gates."
        recommendation: "Update pipeline.md:387 and controller:261 to match gates.md=35. Add a static-check test (F-new) that reads all three inline counts and asserts they equal gates.md header count."
        tag: "[VERIFIED — AUDIT-008-fix]"

      - concept: "run_id in sentinel-state.json"
        current_state: "Field named 'pipeline_id' in state file; Langfuse carrier reads 'run_id' (field absent) → null forever."
        recommendation: "Pipeline-controller writes 'run_id' into sentinel-state at run creation. Carrier reads 'run_id' with 'pipeline_id' fallback. Single field, single writer, propagated to all consumers."
        tag: "[VERIFIED — AUDIT-003-fix]"

      - concept: "Feature type variant naming"
        current_state: "complexity-matrix uses 'implement-*'; skills/ uses 'feature-*'; references/pipelines/ uses DEPRECATED 'implement-*.md'."
        recommendation: "Adopt 'feature-*' as canonical name (matches the active skill folders). Update complexity-matrix and controller references; archive deprecated pipelines docs."
        tag: "[VERIFIED — AUDIT-013-fix]"

    validation_suite:
      - type: "behavioral test — sentinel deny path"
        check: "Require sentinel-hook.cjs with crafted stdin (expected_next mismatch) → assert permissionDecision=deny"
        status: "not implemented (AUDIT-009)"
        priority: "high"

      - type: "behavioral test — Plan Mode bypass event"
        check: "Simulate PLAN_MODE_MANDATORY agent dispatch without PLAN_MODE_RESULTS → assert protocol-events.jsonl PLAN_MODE_BYPASS write"
        status: "not implemented (AUDIT-001-fix dependency)"
        priority: "critical"

      - type: "behavioral test — fidelity freeze keep-max"
        check: "Two consecutive teardowns with increasing gate-decisions.jsonl → assert second teardown updates fidelity-report.json"
        status: "not implemented (AUDIT-015-fix)"
        priority: "medium"

      - type: "behavioral test — run_id propagation"
        check: "Assert Langfuse span readSentinelData() returns non-null run_id after sentinel-state.json write includes run_id field"
        status: "not implemented (AUDIT-003-fix dependency)"
        priority: "high"

      - type: "static test — gate count consistency"
        check: "Read inline counts from pipeline.md:387 and controller:261; assert both equal gates.md header count (35)"
        status: "not implemented"
        priority: "medium"

      - type: "CI gate — pre-commit linter"
        check: "Lint + type check before commit"
        status: "not implemented (no pre-commit hook observed in .claude/settings.json)"
        priority: "low"

      - type: "existing behavioral — stop-hook exports (F15/F16/F17)"
        check: "shouldAppendRunLogEntry, ensureFidelityReport, readSentinelData exercised with real temp fs"
        status: "implemented (TEST-BEHAVIORAL, partial)"
        priority: "maintain"

      - type: "existing behavioral — sentinel byte-identity (implicit)"
        check: "Cache and repo sentinel-hook.cjs are byte-identical (confirmed via research)"
        status: "confirmed — no automated gate needed; informational"
        priority: "low"

    do_not_change:
      - area: "references/gates.md — registry rows + Mandatory-by-Complexity table"
        reason: "gate_registry_modification is FORBIDDEN per references/implementation-discipline.md. F1 breaks on row edit by design. Drift remediation is one-directional: update stale inline copies to match gates.md, never the reverse."
        evidence: "AuditIntake.hotspots:references/gates.md + DOMAIN_ANALYSIS.refactor_boundaries"

      - area: "sentinel-hook.cjs deny path (lines 342-377) — without behavioral test in place first"
        reason: "Only deterministic enforcement mechanism in the repo. Changing deny logic without first adding AUDIT-009 behavioral test risks breaking the sole safety net with no regression catch."
        evidence: "COMPLIANCE_REPORT.axis_D.D-002; evt-013"

      - area: "PLAN_MODE_MANDATORY_AGENTS table (pipeline-controller.md:518-531) in isolation"
        reason: "Any membership change cascades to F20 array, 10 per-agent Step-0 clauses, and dispatch-guard hook (once implemented). All three must be updated atomically."
        evidence: "DOMAIN_ANALYSIS.refactor_boundaries"

      - area: "stop-hook.cjs fidelity freeze guard — before keep-max strategy is designed and tested"
        reason: "The freeze is also the first-write integrity mechanism. Removing the guard without the keep-max replacement could cause fidelity-report to be overwritten by a LOWER count (e.g., empty gate file in a restart session)."
        evidence: "COMPLIANCE_REPORT.axis_A.A-001; stop-hook.cjs:239-245"

  # =================================================================
  # META-FINDING (mandatory — per TASK_CONTEXT)
  # =================================================================
  meta_finding_audit_self_reference:
    description: |
      During Task T3 (audit-compliance-checker), the auditing agent declared that
      gate-decisions.jsonl and protocol-events.jsonl were ABSENT from the current run folder.
      This was factually incorrect: the agent had inspected the repo-side mirror folder
      (a duplicate created earlier to resolve the cwd-discovery mismatch from evt-002) rather
      than the canonical run folder. The T3 claim is reclassified as additional evidence for
      AUDIT-005 (cwd-coupled dual-location confusion). The files exist; the T3 finding was a
      false negative caused by exactly the discovery ambiguity the audit was documenting.
    corrective_action: "T4 (this agent) read both files directly from the canonical path and confirmed their presence. The AUDIT-005 risk score reflects the severity of a defect capable of fooling both pipeline agents and their auditors."
    evidence: "evt-012 + direct file read of gate-decisions.jsonl (3 entries) + protocol-events.jsonl (14 entries)"

```

---

## RISK_MATRIX_GENERATOR_RESULT

```yaml
RISK_MATRIX_GENERATOR_RESULT:
  status: "COMPLETE"
  output: "AUDIT_REPORT"
  next_agent: "none — final audit deliverable"
  summary: |
    17 consolidated findings (deduped from ~30 raw signals across 3 reports + 14 live events).
    5 Critical (risk 20-25), 3 High (risk 12-16), 7 Medium (risk 6-9), 1 Low (risk 1), 1 Informational.
    Top risk: Plan Mode contract is prose-only with zero hook enforcement and live bypass confirmed in this run.
    Top quick win: update stale gate-count inline copies (hours, no runtime changes).
    Top structural fix: convert Plan Mode enforcement to deterministic hook (weeks, architectural change).
    Meta-finding: audit self-reference confirmed — T3 committed the dual-location confusion defect it was auditing.
  stats:
    total_findings: 17
    critical: 5
    high: 3
    medium: 7
    low: 1
    informational: 1
    verified: 15
    hypothesis: 2
    design: 3
  blocked_reason: null
```
