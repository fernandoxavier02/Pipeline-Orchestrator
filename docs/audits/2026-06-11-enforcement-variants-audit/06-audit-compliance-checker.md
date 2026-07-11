# COMPLIANCE_REPORT — Enforcement Variants Audit

**Run date:** 2026-06-11
**Auditor:** audit-compliance-checker (T3 — audit-heavy COMPLEXA)
**Input consumed:** 04-audit-intake.md (AuditIntake) + 05-audit-domain-analyzer.md (DOMAIN_ANALYSIS)
**Langfuse runtime evidence:** queried by parent 2026-06-11 ~13:50 UTC (queryMetrics + listObservations)
**Scope:** 4 compliance axes — Axis A (telemetry/log integrity), Axis B (enforcement integrity), Axis C (governance/SSOT drift), Axis D (test coverage) — plus variant coverage matrix.

---

```yaml
COMPLIANCE_REPORT:

  # ====================================================================
  # AXIS A — TELEMETRY / LOG INTEGRITY
  # ====================================================================
  axis_A_telemetry_log_integrity:

    run_log_accuracy:
      timestamp_start_null:
        finding: "stop-hook reads timestamp_start from session context with null fallback; it does NOT derive from sentinel-state.json created_at or pipeline_id. Multi-session and manually-created runs permanently carry timestamp_start=null."
        evidence_live: ".pipeline/run-log.jsonl: ALL entries for run_id 2026-06-06-fix-plan-mode-contract have timestamp_start=null (4 rows). Duration_seconds=0 for all. run_id 2026-06-09-parallel-eligible-default: timestamp_start='2026-06-09T18:10:00.000Z' (present but ends BEFORE start — clock skew)."
        severity: "high"
        tag: "[VERIFIED]"
        evidence_file: ".pipeline/run-log.jsonl (lines 120-123 — last 4 entries for 2026-06-06 run)"

      clock_skew_aborted_run:
        finding: "run_id '2026-06-09-parallel-eligible-default' has timestamp_end='2026-06-09T14:17:47.784Z' BEFORE timestamp_start='2026-06-09T18:10:00.000Z'. Net duration_seconds=0. total_gates_triggered=0, total_gates_expected=11, fidelity_score=null, final_decision=UNKNOWN. The aborted run is permanently incoherent."
        mechanism: "stop-hook does not validate that end>=start before writing. timestamp_start is likely a manually entered value ('18:10') in the wrong timezone; stop-hook's session teardown wall-clock wrote 14:17 UTC."
        severity: "high"
        tag: "[VERIFIED]"
        evidence_file: ".pipeline/run-log.jsonl (line 123 — last entry)"

      fidelity_freeze_mechanism:
        finding: "stop-hook.cjs ensureFidelityReport() at the line equivalent to the idempotent guard: 'if (fs.existsSync(reportPath)) return; // idempotent — never overwrite'. First write wins permanently. A premature sub-session teardown (before gate-decisions.jsonl is fully populated) locks in an undercount fidelity-report.json that can never be corrected within the same run."
        secondary: "If gate-decisions.jsonl is absent at first teardown (line equivalent: 'if (!fs.existsSync(gdPath)) return'), no report is created. Later teardowns: existsSync=false for report (proceed), existsSync=false for gate-data (skip again) => report never created. Pattern confirmed: 2026-06-09 entry has fidelity_score=null."
        severity: "critical"
        tag: "[VERIFIED]"
        evidence_file: ".claude/hooks/stop-hook.cjs (ensureFidelityReport function, idempotent guard + gate-data absent guard)"

      current_run_fidelity:
        finding: "This run (2026-06-11-auditoria-enforcement-variants): gate-decisions.jsonl is ABSENT in the run folder at time of this audit agent's execution. sentinel-state.json has gate_summary with all arrays empty. fidelity-report.json does not exist. PIPELINE_RUN_ID env is unset. When stop-hook fires: ensureFidelityReport will find no gate-decisions.jsonl and create nothing => fidelity_score will be null in run-log."
        severity: "high"
        tag: "[VERIFIED]"
        evidence_files:
          - ".pipeline/docs/Pre-Complex-action/2026-06-11-auditoria-enforcement-variants/sentinel-state.json (gate_summary all-empty)"
          - ".pipeline/docs/Pre-Complex-action/2026-06-11-auditoria-enforcement-variants/ (no gate-decisions.jsonl present)"

    fidelity_scoring:
      denominator_source: "lib/fidelity-reporter.cjs lazy-required via plugin root (not payload cwd) — reads MANDATORY_GATES_BY_COMPLEXITY table from gates.md. For COMPLEXA=17 mandatory gates."
      numerator_source: "countGateTriggers() reads gate-decisions.jsonl line count."
      freeze_cascades_to_runlog: "buildRunLogEntry reads fidelity-report.json AFTER ensureFidelityReport — if report null/absent, fidelity_score=null propagates to run-log permanently."
      pattern_confirmed: "2026-06-09 run: fidelity_score=null, 0/11 gates. 2026-06-06 runs: fidelity_score=0.2727 frozen across all 4 sessions (first teardown crystallized 3/11 gates; later sessions added 11/11 and 13/11 and 15/11 triggers but score never updated)."
      severity: "critical"
      tag: "[VERIFIED]"
      evidence_file: ".pipeline/run-log.jsonl (entries 120-123: fidelity_score=0.2727 identical across 4 rows despite total_gates_triggered growing from 4→11→13→15)"

    langfuse_attribution:
      project_isolation_key_check:
        finding: ".env has LANGFUSE_PUBLIC_KEY='pk-lf-1520c749-130d-49cc-bcd8-4d8e9c32edf9'. This differs from the hardcoded FX Studio sentinel key in langfuse-client.cjs ('pk-lf-45a8b363-23f1-4145-8c2b-fe9c63209ac3'). Project isolation guard will NOT trigger a LANGFUSE_PROJECT_ISOLATION_VIOLATION audit event."
        status: "PASS at key level"
        tag: "[VERIFIED]"
        evidence_file: ".env (LANGFUSE_PUBLIC_KEY row) + lib/langfuse-client.cjs:53"

      run_id_null_in_spans:
        finding: "Parent runtime evidence (listObservations 06-09 to 06-11): ALL spans carry run_id=null despite v7.9.3 enrichment. Root cause: sentinel-state.json for this run has no 'run_id' field (only 'pipeline_id': '2026-06-11T12:26:46Z_audit-heavy'). PIPELINE_RUN_ID env is unset. readSentinelData() in langfuse-hook looks for sentinel.run_id — field absent => null. buildTraceMetadata() stamps run_id=null on every span."
        secondary: "pipeline_doc_path='' in Langfuse spans despite being 'D:/Pipeline Orchestrator Claude/.pipeline/docs/Pre-Complex-action/2026-06-11-auditoria-enforcement-variants' in sentinel. Root cause: PIPELINE_DOC_PATH env unset; carrier _resolveKey falls to sessionId or ppid tier."
        severity: "critical"
        tag: "[VERIFIED — mechanism confirmed via code path + live observation data]"
        evidence_files:
          - ".pipeline/docs/Pre-Complex-action/2026-06-11-auditoria-enforcement-variants/sentinel-state.json (no run_id field, only pipeline_id)"
          - "parent queryMetrics + listObservations: run_id=null, pipeline_doc_path='' on all spans"

      chat_derek_contamination:
        finding: "Parent queryMetrics shows chat-derek=475 observations in the pipeline telemetry project (2026-06-01 to 06-11). This is a FOREIGN APPLICATION bleeding its traces into the pipeline project. The plugin project isolation at the key level is correct (pk-lf-1520... is dedicated), but the Langfuse CLOUD project appears to also receive traces from an external source named 'chat-derek'. This is either a shared project (same keys used by two apps) or a misconfiguration external to this plugin."
        severity: "high"
        tag: "[VERIFIED from parent queryMetrics — mechanism is HYPOTHESIS: shared project or key reuse outside plugin]"
        evidence: "parent queryMetrics: chat-derek=475, pipeline-run=384, null=397, ai-conversation=12"

      null_trace_name_fragmentation:
        finding: "null=397 observations means 397 spans lack a traceName — these are orphan spans from agents where resolveSpanName() fell through or the AUDIT SPAN_NAME_FALLBACK fired. v7.9.3 partially fixed this (SPAN_NAME_FALLBACK breadcrumb) but 397 null entries remain post-fix."
        severity: "high"
        tag: "[VERIFIED from parent queryMetrics]"

      cross_trace_anomaly:
        finding: "Parent listObservations: spans labeled type='Bug Fix' COMPLEXA (task-orchestrator 13:11 type:null, sentinel 13:17, information-gate 13:18) on a SECOND trace ID during THIS audit run's time window. Possible concurrent session bleeding, or the same sentinel-state discovered by both sessions via mtime fallback (since PIPELINE_RUN_ID is unset). run_id=null on all spans makes disambiguation impossible."
        severity: "high"
        tag: "[VERIFIED from parent observation data — mechanism HYPOTHESIS: cwd-mtime fallback collision]"

    protocol_events_usage:
      finding: "protocol-events.jsonl is ABSENT from the current run folder. Neither PLAN_MODE_BYPASS events nor GATE_REQUEST traces have been written to it. This audit run dispatched design-interrogator (PLAN_MODE_MANDATORY) and plan-architect (PLAN_MODE_MANDATORY) — if either ran inline, no PLAN_MODE_BYPASS event was recorded to protocol-events.jsonl because the file doesn't exist."
      severity: "high"
      tag: "[VERIFIED]"
      evidence_file: ".pipeline/docs/Pre-Complex-action/2026-06-11-auditoria-enforcement-variants/ (protocol-events.jsonl absent)"

  # ====================================================================
  # AXIS B — ENFORCEMENT INTEGRITY
  # Six layers classified by backstop mechanism
  # ====================================================================
  axis_B_enforcement_integrity:

    classification_method: "HOOK-BACKED = deterministic JS that can deny/block; TEST-BEHAVIORAL = test that runs hook/lib code and asserts runtime behavior (not just text presence); TEXT-ONLY = regex/string assertion against prose files; ABSENT = no mechanism of any kind"

    layer_1_plan_mode_contract:
      description: "Agents in PLAN_MODE_MANDATORY_AGENTS table must emit PLAN_MODE_REQUEST before any inline research"
      backstop: "TEXT-ONLY"
      detail: |
        Enforcement lives entirely in pipeline-controller.md line 533 prose and per-agent Step-0 prose.
        grep PLAN_MODE_BYPASS|PLAN_MODE_REQUEST across .claude/hooks/ => 0 matches (VERIFIED).
        No hook intercepts whether a PLAN_MODE_REQUEST block was emitted before research begins.
        Detection at return-time is also prose-based: the controller LLM reads whether the return
        carried 'PLAN_MODE_REQUEST' or not. A LLM misread (Signal G, design-interrogator, this run)
        bypasses enforcement completely.
      runtime_gap: "design-interrogator performed 94 inline tool uses without PLAN_MODE_REQUEST in current run; controller cleared it with factually wrong claim ('not in table'). No mechanism caught it."
      severity: "critical"
      tag: "[VERIFIED]"
      evidence: ".claude/hooks/ grep=0 matches; agents/core/pipeline-controller.md:527 (design-interrogator IS in table); agents/core/pipeline-controller.md:533 (enforcement = prose)"

    layer_2_gate_request_ask_user_question:
      description: "GATE_REQUEST / AskUserQuestion protocol for user approval gates"
      backstop: "TEST-BEHAVIORAL (partial)"
      detail: |
        GATE_REQUEST protocol has regression coverage (D2_test_subagent_protocol.cjs tests the
        emit-and-hoist pattern). However the test verifies the PROTOCOL TEXT is present in agent
        files — it does not run a real hook interception or simulate a real GATE_REQUEST emission.
        Classification: TEXT-ONLY for hook enforcement, TEST-BEHAVIORAL for protocol-text presence.
        AskUserQuestion itself is stripped from subagent runtime (Achado #7) — the pattern relies on
        the controller receiving and forwarding the block, which is LLM-dependent.
      severity: "medium"
      tag: "[VERIFIED]"
      evidence: "tests/regression/v6.0.0/D2_test_subagent_protocol.cjs; agents/core/pipeline-controller.md GATE_REQUEST section"

    layer_3_tdd_gates:
      description: "TDD gates — quality-gate-router + pre-tester mandatory for Bug Fix/Feature/User Story"
      backstop: "TEXT-ONLY"
      detail: |
        TDD obligation declared in pipeline-controller.md line 687 and commands/pipeline.md line 1191.
        No hook verifies TDD ran before executor-controller is dispatched. Sentinel-hook enforces
        expected_next sequencing ONLY when a skill is in flight with declared sentinel_checkpoints.
        Inline-routed pipelines (audit, ux-sim, user-story per controller line 192) never trip the
        skill-contract checkpoint because enforceSkillContract returns null when current_skill is
        absent.
      severity: "high"
      tag: "[VERIFIED]"
      evidence: "agents/core/pipeline-controller.md:687,192; .claude/hooks/sentinel-hook.cjs:45-62 (enforceSkillContract returns null when no skill in flight)"

    layer_4_adversarial_gates:
      description: "Adversarial review gates — per-batch and final adversarial"
      backstop: "TEXT-ONLY (scheduling); HOOK-BACKED (sentinel expected_next sequencing after batches)"
      detail: |
        The adversarial review is scheduled by executor-controller prose. Sentinel-hook enforces
        expected_next — if the controller sets expected_next='review-orchestrator' before spawning,
        the hook will deny a different agent. However: (a) sentinel enforcement requires
        current_skill+step to be set (enforceSkillContract conditional); for inline-routed runs
        this conditional never fires. (b) For skill-dispatched runs (bugfix-*, spec-*), the
        dispatch-guard validates agent_type per SKILL.md step — adversarial steps listed in
        SKILL.md sentinel_checkpoints ARE enforced. (c) The final-adversarial-orchestrator is
        opt-in (not mandatory) except for COMPLEXA.
      severity: "medium"
      tag: "[VERIFIED — partial hook backing for skill-dispatched runs only]"
      evidence: ".claude/hooks/sentinel-hook.cjs:342-377 (expected_next match); :45-62 (skill conditional)"

    layer_5_sentinel_checkpoints_hooks:
      description: "Sentinel checkpoints and hooks — sequencing enforcement"
      backstop: "HOOK-BACKED (deterministic for skill-dispatched; absent for inline-routed)"
      detail: |
        sentinel-hook.cjs PreToolUse:Agent is the only fully deterministic enforcement in the repo.
        For skill-dispatched pipelines (bugfix-light/heavy, spec-*): dispatch-guard validates
        agent_type per SKILL.md step; sentinel-hook validates expected_next match.
        For INLINE-ROUTED pipelines (audit-*, ux-sim-*, user-story-*, feature-* per controller:192):
        enforceSkillContract returns null (no current_skill) => skip. No sentinel-checkpoints fire.
        PROTOCOL_HANDSHAKE_TIMEOUT has dual-layer backing: cleanup-orphan-sentinel-state-hook
        (SessionStart) + controller prose.
        cache vs repo: sentinel-hook.cjs byte-identical between repo and deployed cache (17536 bytes).
      severity: "medium"
      tag: "[VERIFIED]"
      evidence: ".claude/hooks/sentinel-hook.cjs:45-62 (enforceSkillContract conditional); agents/core/pipeline-controller.md:192 (inline routing list)"

    layer_6_fidelity_telemetry:
      description: "Fidelity scoring and telemetry — run-log accuracy, Langfuse attribution"
      backstop: "HOOK-BACKED (deterministic JS — but the determinism is the bug vector)"
      detail: |
        stop-hook.cjs is deterministic JS. The idempotent-never-overwrite guard IS deterministic —
        it reliably locks in the first fidelity score and never updates. This determinism makes the
        freeze reliable rather than occasional. Second bypass (PLAN_MODE_BYPASS) is ACCEPTED by
        design (anti-deadlock) — AUDIT hardness explicitly, no HARD gate. The Langfuse carrier
        is deterministic but keyed on sessionId/ppid when PIPELINE_RUN_ID is absent, causing
        fragmentation. The 'chat-derek' foreign traces (475 observations) represent a project-level
        isolation failure that is outside the plugin's control once the Langfuse project is shared.
      plan_mode_bypass_anti_deadlock:
        description: "PLAN_MODE_BYPASS enforcement: first bypass triggers re-dispatch + AUDIT event; second bypass is ACCEPTED (no hard block). This is an explicit design decision to prevent legacy deadlock."
        backstop: "TEXT-ONLY for detection; HOOK-BACKED (stop-hook) writes audit event but the accept/reject decision is prose"
        tag: "[VERIFIED — DESIGN]"
        evidence: "agents/core/pipeline-controller.md:533"
      severity: "high"
      tag: "[VERIFIED]"
      evidence: ".claude/hooks/stop-hook.cjs:239-245 (ensureFidelityReport idempotent guard); .pipeline/run-log.jsonl (0.2727 frozen across 4 sessions)"

    anti_injection_posture:
      finding: "Both sentinel-hook.cjs and stop-hook.cjs declare TRUST ASSUMPTION notes limiting trust to sentinel-state.json as controller-produced input. SEC-2 containment guard (path.resolve + startsWith check) prevents symlink/.. escapes in findActiveRunFolder. stdin cap (1 MiB) in stop-hook prevents unbounded buffering. Anti-injection is PRESENT but relies on process-level trust of the state file — any actor with write access to PIPELINE_DOC_PATH can neutralize the sentinel."
      severity: "low"
      tag: "[VERIFIED — DESIGN]"
      evidence: ".claude/hooks/sentinel-hook.cjs (TRUST ASSUMPTION comment); .claude/hooks/stop-hook.cjs:55 (MAX_STDIN_BYTES), :118-170 (SEC-2 containment)"

  # ====================================================================
  # AXIS C — GOVERNANCE / SSOT DRIFT
  # ====================================================================
  axis_C_governance_ssot_drift:

    gate_count_five_source_drift:
      authoritative_source: "references/gates.md header line 3: '35-gate registry' — 35 rows verified by direct enumeration (lines 25-42=18, 48-53=6, 61-64=4, 70-76=7)"
      divergent_sources:
        - source: "commands/pipeline.md:387 Inline Invariants"
          claims: "22 gates"
          status: "STALE by 13 gates — missing all 5 v7.2.0 gates (STATE_FILE_INIT_FAIL, PROTOCOL_HANDSHAKE_TIMEOUT, STEP_1_7_ROUTING, STOP_BEFORE_PA_DE_CAL, STEP_1_7_RECURSION_GUARD) + all 7 brainstorm gates + COMPLEXITY_GATE"
          self_declared_precedence: "YES — 'override Grep results if they disagree'"
          paradox: "A correct gates.md would be branded 'tampered' by this stale override-authority list"
          severity: "high"
          tag: "[VERIFIED]"
          evidence: "commands/pipeline.md:387"

        - source: "agents/core/pipeline-controller.md:261 Inline Invariants"
          claims: "27 named gates"
          status: "STALE by 8 gates — has v7.2.0 gates but missing COMPLEXITY_GATE + all 7 brainstorm gates"
          note: "Controller:261 and pipeline.md:387 disagree with each other (27 vs 22), AND both disagree with the authoritative registry (35)"
          severity: "high"
          tag: "[VERIFIED]"
          evidence: "agents/core/pipeline-controller.md:261"

        - source: "agents/core/pipeline-controller.md:298 protocol audit-trail note"
          claims: "'The 22-gate registry is unchanged'"
          status: "STALE — registry is 35"
          severity: "medium"
          tag: "[VERIFIED]"
          evidence: "agents/core/pipeline-controller.md:298"

        - source: "references/complexity-matrix.md Mandatory-by-Complexity table (gates.md:92-124)"
          claims: "23 unique gate names across SIMPLES/MEDIA/COMPLEXA/Spec columns"
          status: "PARTIAL DRIFT — 23 is a different denominator (mandatory subset), legitimately != 35, but CLAUDE.md changelog conflates them ('Mandatory table 22→23')"
          severity: "low"
          tag: "[VERIFIED]"
          evidence: "references/gates.md:92-124"

        - source: "commands/pipeline.md:1020 Gate Registry section"
          claims: "'Full 22-gate table ... lives in references/gates.md'"
          status: "STALE — points reader to '22-gate table' that actually has 35 rows"
          severity: "medium"
          tag: "[VERIFIED]"
          evidence: "commands/pipeline.md:1020"

      root_ssot_violation: "The gate roster (a single rule) has THREE declared authorities (gates.md registry, pipeline.md:387 inline, controller:261 inline). Both inline copies claim override-precedence AND are stale. This is a textbook DRY violation."
      fix_direction: "Reconcile the two stale inline copies to match gates.md=35; never edit gates.md registry rows (gate_registry_modification is a forbidden change type per references/implementation-discipline.md)."
      severity: "high"
      tag: "[VERIFIED]"

    plan_mode_table_consistency:
      finding: "PLAN_MODE_MANDATORY_AGENTS table (pipeline-controller.md:518-531) is INTERNALLY CONSISTENT: all 10 agents present in table, all 10 have matching per-agent Step-0 PLAN_MODE_REQUEST clauses, all 10 pinned by F20/F21 tests. Text-contract is 3-way consistent."
      gap: "plan-architect table entry at line 522 lists it; but F20 test at v7.10.0/F20-plan-mode-mandatory-agents.test.cjs lists only 9 agents (plan-architect ABSENT from MANDATORY_AGENTS array at line 25-35). The test file does not include plan-architect in the loop."
      gap_severity: "medium"
      tag: "[VERIFIED]"
      evidence: "tests/regression/v7.10.0/F20-plan-mode-mandatory-agents.test.cjs:25-35 (9 agents, plan-architect missing); agents/core/pipeline-controller.md:522 (plan-architect IS in table)"

    inline_routing_vs_skill_folder_mismatch:
      finding: "pipeline-controller.md:192 declares inline routing for: implement-light/heavy, user-story-light/heavy, audit-*, ux-sim-*, DIRETO. However references/pipelines/ contains audit-heavy.md line 3: 'it dispatches the skill via Skill(pipeline-orchestrator:audit-heavy) for Phase 2 execution'. This is a contradiction: the controller says inline, the pipeline doc says skill-dispatched."
      severity: "high"
      tag: "[VERIFIED]"
      evidence:
        - "agents/core/pipeline-controller.md:192 (audit-* = inline)"
        - "references/pipelines/audit-heavy.md:3 ('dispatches the skill via Skill(pipeline-orchestrator:audit-heavy)')"

    feature_variant_naming_mismatch:
      finding: "complexity-matrix.md routing table uses 'implement-light/implement-heavy' as variant names for Feature type (lines 61). But skills/ has 'feature-light/' and 'feature-heavy/' folders — not 'implement-light/'. pipeline-controller.md line 192 references 'implement-light/heavy' as inline-routed. references/pipelines/ has 'implement-heavy.md' (DEPRECATED as of v4.7.0). The naming is inconsistent: the canonical complexity-matrix.md uses 'implement-*', skills/ uses 'feature-*', and the deprecated references/pipelines/ uses 'implement-*'."
      severity: "medium"
      tag: "[VERIFIED]"
      evidence:
        - "references/complexity-matrix.md:61 (implement-light/implement-heavy)"
        - "skills/ directory: feature-light/, feature-heavy/ (NO implement-light/ or implement-heavy/)"
        - "references/pipelines/implement-heavy.md:1 (DEPRECATED v4.7.0)"
        - "agents/core/pipeline-controller.md:192 (implement-light/heavy as inline-routed)"

    f20_test_missing_plan_architect:
      finding: "F20-plan-mode-mandatory-agents.test.cjs MANDATORY_AGENTS array (lines 25-35) contains 9 agents but omits plan-architect — which IS in the controller table at line 522. F18 tests plan-architect contract separately. But F20's coverage claim of 'pinning all 10 mandatory agents' is incomplete for this specific test."
      severity: "medium"
      tag: "[VERIFIED]"
      evidence: "tests/regression/v7.10.0/F20-plan-mode-mandatory-agents.test.cjs:25-35"

  # ====================================================================
  # AXIS D — TEST COVERAGE
  # Per enforcement layer, behavioral vs text-pin
  # ====================================================================
  axis_D_test_coverage:

    framework: "Jest (package.json) — but regression tests use plain Node.js assert + process.exit, not jest runner directly. Auto-discovered by scripts/run-tests.cjs semver-globbing."
    total_regression_tests: 63
    test_types_present: ["text-pin (grep/regex on prose files)", "behavioral (direct require + function calls)", "structural (file existence + export checks)"]

    per_layer_coverage:
      layer_1_plan_mode:
        test_files: ["F18-plan-mode-contract.test.cjs", "F19-controller-inline-plan-check.test.cjs", "F20-plan-mode-mandatory-agents.test.cjs", "F21-plan-mode-bypass-enforcement.test.cjs"]
        classification: "TEXT-ONLY"
        detail: |
          F18: heading-anchored section extraction from plan-architect.md, asserts presence/absence
          of specific strings (PLAN_MODE_REQUEST, EnterPlanMode, GATE_REQUEST). No hook execution.
          F19: region detection in controller.md around PLAN_MODE_BYPASS keyword, asserts re-dispatch
          text present, AUDIT label, NOT 'HARD'. No protocol-events.jsonl write tested.
          F20: loops 9 agents, asserts text strings (PLAN_MODE_REQUEST v1, AWAITING_PLAN_MODE_RESULTS,
          ACHADO #7 RUNTIME PROTOCOL) present in prose files. No actual emission tested.
          F21: asserts PLAN_MODE_MANDATORY_AGENTS text present, 10 agents listed, re-dispatch mentioned.
          VERDICT: All 4 tests assert CONTRACT TEXT is present, NOT that runtime EMITS or DETECTS
          anything. A run can violate the contract while every test stays green.
        behavioral_tests: 0
        tag: "[VERIFIED]"

      layer_2_gate_request:
        test_files: ["D2_test_subagent_protocol.cjs"]
        classification: "TEXT-ONLY"
        detail: "Tests that GATE_REQUEST protocol text is present in agent files. Does not simulate hook interception or actual emission."
        behavioral_tests: 0
        tag: "[VERIFIED]"

      layer_3_tdd_gates:
        test_files: ["D5_atdd_quality_gate_router.cjs", "D6_bdd_gherkin_output_contract.cjs", "F10_scope_lock_check_in_implementer.cjs"]
        classification: "TEXT-ONLY (contract presence); no behavioral test of TDD gate enforcement"
        detail: "D5 tests quality-gate-router text contract. D6 tests BDD Gherkin output format. None simulate TDD gate blocking."
        behavioral_tests: 0
        tag: "[VERIFIED]"

      layer_4_adversarial_gates:
        test_files: ["F11_diff_discipline_reviewer_exists.cjs", "F12_review_orchestrator_spawns_diff_discipline.cjs", "F13_architecture_reviewer_new_checks.cjs"]
        classification: "TEXT-ONLY (file existence + prose content)"
        detail: "Tests that diff-discipline-reviewer agent file exists and review-orchestrator prose references it. No behavioral simulation."
        behavioral_tests: 0
        tag: "[VERIFIED]"

      layer_5_sentinel_hooks:
        test_files: ["F5_stop_hook.cjs", "F6_settings_json.cjs", "F7_hook_guard_acceptance.cjs", "F9-langfuse-span-lifecycle.test.cjs"]
        classification: "TEST-BEHAVIORAL (partial)"
        detail: |
          F15, F16, F17 directly require stop-hook.cjs and call exported functions
          (shouldAppendRunLogEntry, ensureFidelityReport) in a temp filesystem context.
          These ARE behavioral — they exercise real JS code paths.
          F9 tests langfuse span lifecycle via direct require of langfuse-hook.cjs.
          HOWEVER: no test simulates a REAL sentinel-hook PreToolUse interception with
          a stdin payload and checks that expected_next mismatch causes deny. The
          sentinel's core deny logic (lines 342-377) has NO behavioral test.
          tests/hooks/ directory does not exist (only tests/regression/, unit/, etc.).
        behavioral_tests: 3
        critical_gap: "sentinel-hook deny path (expected_next mismatch) has no behavioral test — TEXT-ONLY for the sequencing claim itself"
        tag: "[VERIFIED]"

      layer_6_fidelity_telemetry:
        test_files: ["F15-runlog-dedup.test.cjs", "F16-fidelity-report-on-stop.test.cjs", "F17-langfuse-trace-enrichment.test.cjs", "F14-langfuse-project-isolation.test.cjs", "F12-langfuse-telemetry-fidelity.test.cjs"]
        classification: "TEST-BEHAVIORAL"
        detail: |
          F15: directly requires stop-hook.cjs, calls shouldAppendRunLogEntry() with real
          candidate objects. Behavioral — exercises dedup guard logic.
          F16: requires stop-hook.cjs, creates temp gate-decisions.jsonl, calls ensureFidelityReport().
          Behavioral — exercises fidelity-report creation path.
          F17: requires langfuse-hook.cjs and langfuse-carrier.cjs, tests readSentinelData()
          and _resolveKey() with env overrides. Behavioral.
          F14: requires langfuse-client.cjs, checks project isolation guard.
          GAPS: no test covers the idempotent-never-overwrite freeze scenario end-to-end
          (a test could verify that a second teardown with more gates does NOT overwrite
          the first report). The freeze IS tested (S2 in F16 asserts existing report not
          overwritten) but not the cascade to run-log staleness.
        behavioral_tests: 5
        freeze_cascade_gap: "F16 tests that idempotent guard skips overwrite, but no test verifies that a SECOND session's run-log entry reads the frozen (undercount) score from the first session"
        tag: "[VERIFIED]"

    critical_untested_paths:
      - path: "sentinel-hook deny-path (expected_next mismatch → permissionDecision deny)"
        severity: "high"
        detail: "No test requires sentinel-hook.cjs with a fake stdin payload and asserts the hookSpecificOutput.permissionDecision=deny response. The enforcement is behavioral but the test coverage is TEXT-ONLY (F6_settings_json asserts hook is registered, not that it denies)."
        tag: "[VERIFIED]"

      - path: "PLAN_MODE_BYPASS event write to protocol-events.jsonl"
        severity: "high"
        detail: "F19 asserts the BYPASS paragraph TEXT is in controller.md. No test verifies that a real PLAN_MODE_BYPASS scenario causes an actual write to protocol-events.jsonl."
        tag: "[VERIFIED]"

      - path: "Fidelity-freeze cascade to run-log staleness (multi-session)"
        severity: "medium"
        detail: "F16 tests idempotent guard (skip overwrite). No test simulates two consecutive teardowns where the second has more gates and verifies the run-log entry for the second teardown still carries the frozen (undercount) fidelity_score from the first."
        tag: "[VERIFIED]"

      - path: "clock-skew aborted-run recording (timestamp_end < timestamp_start)"
        severity: "medium"
        detail: "No test exercises the case where stop-hook writes a timestamp_end before timestamp_start, nor verifies that duration_seconds=0 on incoherent runs."
        tag: "[VERIFIED]"

      - path: "cwd-mismatch Langfuse carrier fragmentation (multi-run collision)"
        severity: "high"
        detail: "F17 tests carrier key resolution for single process. No test simulates two concurrent runs sharing a cwd but with PIPELINE_RUN_ID unset, verifying they do NOT share carrier keys (i.e. traces don't merge)."
        tag: "[VERIFIED]"

  # ====================================================================
  # VARIANT COVERAGE MATRIX (user-requested centerpiece)
  # 4 Artifact Layers × 5 Task Types
  # ====================================================================
  variant_coverage_matrix:
    description: |
      L1 = routing row in complexity-matrix.md or pipeline-controller dispatch table
      L2 = references/pipelines/*.md file for that variant (light AND heavy)
      L3 = skills/ folder with SKILL.md (light AND heavy)
      L4 = dedicated tests covering that type's specific behavior

    wiring_nuance: |
      CRITICAL: Skill folder existing (L3) does NOT mean controller dispatches it via Skill tool.
      Only bugfix-light/heavy and spec-light/heavy/spec-audit-only are dispatched via Skill tool
      (controller.md:192). All others (audit-*, feature-*, ux-sim-*, user-story-*) run INLINE.
      L3=PRESENT means the skill folder and SKILL.md exist; DISPATCHED indicates controller wires it.

    matrix:
      Audit:
        L1_routing:
          status: "PRESENT"
          detail: "complexity-matrix.md:63 'Audit | DIRETO | audit-light | audit-heavy'"
          tag: "[VERIFIED]"
          evidence: "references/complexity-matrix.md:63"
        L2_pipeline_docs:
          status: "PRESENT"
          detail: "references/pipelines/audit-light.md + audit-heavy.md both exist"
          wiring_contradiction: "audit-heavy.md:3 says 'dispatches the skill via Skill(pipeline-orchestrator:audit-heavy)' but controller:192 says inline. CONTRADICTION."
          tag: "[VERIFIED]"
          evidence: "references/pipelines/audit-heavy.md:1-3; references/pipelines/audit-light.md:1"
        L3_skills:
          status: "PRESENT (NOT DISPATCHED)"
          detail: "skills/audit/, skills/audit-light/, skills/audit-heavy/ all have SKILL.md + steps/ + tests/"
          dispatched: false
          dispatch_mechanism: "INLINE (controller:192)"
          tag: "[VERIFIED]"
          evidence: "skills/audit-heavy/SKILL.md exists; agents/core/pipeline-controller.md:192"
        L4_tests:
          status: "ABSENT"
          detail: "No regression test file targeting audit-type-specific behavior. General F20/F21 cover plan-mode for audit-intake + audit-domain-analyzer agents, but no type=Audit routing or audit-specific gate behavior tested."
          tag: "[VERIFIED]"
        verdict: "3/4 — L4 absent"
        score: "3/4"

      Bug_Fix:
        L1_routing:
          status: "PRESENT"
          detail: "complexity-matrix.md:60 'Bug Fix | DIRETO | bugfix-light | bugfix-heavy'"
          tag: "[VERIFIED]"
          evidence: "references/complexity-matrix.md:60"
        L2_pipeline_docs:
          status: "PRESENT"
          detail: "references/pipelines/bugfix-light.md + bugfix-heavy.md"
          tag: "[VERIFIED]"
          evidence: "references/pipelines/bugfix-light.md (confirmed by audit-intake)"
        L3_skills:
          status: "PRESENT AND DISPATCHED"
          detail: "skills/bugfix-light/ + skills/bugfix-heavy/ with SKILL.md + steps/ + tests/"
          dispatched: true
          dispatch_mechanism: "Skill tool (controller:192 explicit carve-out: 'bugfix-light/bugfix-heavy')"
          tag: "[VERIFIED]"
          evidence: "agents/core/pipeline-controller.md:192; skills/bugfix-light/SKILL.md"
        L4_tests:
          status: "PRESENT (behavioral)"
          detail: "F15-runlog-dedup, F16-fidelity-report-on-stop, F17-langfuse-trace-enrichment were validated via dogfood bugfix-light runs. F13-runlog-entry-defects explicitly tests Bug Fix/MEDIA classification path in buildRunLogEntry."
          tag: "[VERIFIED]"
          evidence: "tests/regression/v7.9.3/ (F15-F17 validated via bugfix-light dogfood); tests/regression/v7.9.0/F13-runlog-entry-defects.test.cjs"
        verdict: "4/4 — FULLY COVERED"
        score: "4/4"

      Feature:
        L1_routing:
          status: "PRESENT (with naming ambiguity)"
          detail: "complexity-matrix.md:61 uses 'implement-light | implement-heavy'. Controller:192 says 'implement-light/heavy' as inline-routed. The variant name in matrix does NOT match skills/ folders (feature-light/feature-heavy)."
          naming_mismatch: "complexity-matrix says 'implement-*'; skills/ has 'feature-*'"
          tag: "[VERIFIED]"
          evidence: "references/complexity-matrix.md:61; agents/core/pipeline-controller.md:192"
        L2_pipeline_docs:
          status: "PRESENT (deprecated)"
          detail: "references/pipelines/implement-light.md + implement-heavy.md exist but implement-heavy.md:1 is 'DEPRECATED as of v4.7.0'. No feature-light.md or feature-heavy.md in references/pipelines/."
          tag: "[VERIFIED]"
          evidence: "references/pipelines/implement-heavy.md:1 (DEPRECATED)"
        L3_skills:
          status: "PRESENT (NOT DISPATCHED per controller:192)"
          detail: "skills/feature-light/ + skills/feature-heavy/ with SKILL.md + full steps/ + tests/. But controller:192 lists 'implement-light/heavy' as inline-routed, not feature-*. The skill folders use a different name than what the controller expects."
          dispatched: false
          dispatch_mechanism: "INLINE (controller:192) — but variant name mismatch means even if dispatching were attempted, 'feature-light' != 'implement-light'"
          tag: "[VERIFIED]"
          evidence: "skills/feature-light/SKILL.md (exists); agents/core/pipeline-controller.md:192 (implement-light/heavy as inline)"
        L4_tests:
          status: "ABSENT"
          detail: "No regression test targeting feature-type-specific routing or feature-implementer enforcement. F20 pins feature-implementer and feature-vertical-slice-planner in mandatory agents table but does not test Feature routing end-to-end."
          tag: "[VERIFIED]"
        verdict: "2/4 — L2 deprecated, L4 absent, L1/L3 naming mismatch degrades both"
        score: "2/4 (degraded)"

      UX_Simulation:
        L1_routing:
          status: "PRESENT"
          detail: "complexity-matrix.md:64 'UX Simulation | DIRETO | ux-sim-light | ux-sim-heavy'"
          tag: "[VERIFIED]"
          evidence: "references/complexity-matrix.md:64"
        L2_pipeline_docs:
          status: "PRESENT"
          detail: "references/pipelines/ux-sim-light.md + ux-sim-heavy.md both exist with full team compositions"
          tag: "[VERIFIED]"
          evidence: "references/pipelines/ux-sim-heavy.md:1-29"
        L3_skills:
          status: "ABSENT"
          detail: "No skills/ux-sim-light/ or skills/ux-sim-heavy/ folder found. skills/ directory has no ux-sim-* entries. UX Simulation has L2 docs but no L3 skill dispatch surface."
          dispatched: false
          dispatch_mechanism: "INLINE (controller:192) — but no skill folder exists for ux-sim-* unlike audit-* which has folders"
          tag: "[VERIFIED]"
          evidence: "skills/ directory inventory (no ux-sim-* entries); agents/core/pipeline-controller.md:192"
        L4_tests:
          status: "ABSENT"
          detail: "No regression test targeting ux-sim-specific behavior. ux-simulator, ux-accessibility-auditor, ux-qa-validator agents not covered by any test."
          tag: "[VERIFIED]"
        verdict: "2/4 — L3 absent, L4 absent"
        score: "2/4"

      User_Story:
        L1_routing:
          status: "PRESENT"
          detail: "complexity-matrix.md:62 'User Story | DIRETO | user-story-light | user-story-heavy'"
          tag: "[VERIFIED]"
          evidence: "references/complexity-matrix.md:62"
        L2_pipeline_docs:
          status: "PRESENT"
          detail: "references/pipelines/user-story-light.md + user-story-heavy.md both exist"
          tag: "[VERIFIED]"
          evidence: "references/pipelines/user-story-heavy.md:1-35"
        L3_skills:
          status: "ABSENT"
          detail: "No skills/user-story-light/ or skills/user-story-heavy/ folder found. skills/ directory has no user-story-* entries."
          dispatched: false
          dispatch_mechanism: "INLINE (controller:192)"
          tag: "[VERIFIED]"
          evidence: "skills/ directory inventory (no user-story-* entries)"
        L4_tests:
          status: "ABSENT"
          detail: "No regression test targeting user-story-specific behavior. No user-story specialist agents tested individually."
          tag: "[VERIFIED]"
        verdict: "2/4 — L3 absent, L4 absent"
        score: "2/4"

    summary_matrix_ascii: |
      Type          | L1 Routing | L2 Ref Docs | L3 Skills | L4 Tests | Score
      --------------|-----------|-------------|-----------|----------|-------
      Audit         | PRESENT   | PRESENT*    | PRESENT   | ABSENT   | 3/4
      Bug Fix       | PRESENT   | PRESENT     | PRESENT+  | PRESENT  | 4/4
      Feature       | PRESENT~  | DEPRECATED  | PRESENT~  | ABSENT   | 2/4
      UX Simulation | PRESENT   | PRESENT     | ABSENT    | ABSENT   | 2/4
      User Story    | PRESENT   | PRESENT     | ABSENT    | ABSENT   | 2/4

      * audit-heavy.md contradicts controller on dispatch method (docs say Skill, controller says inline)
      + bugfix-* is the ONLY type with controller actually wiring Skill dispatch
      ~ Feature has naming mismatch: complexity-matrix says 'implement-*', skills say 'feature-*'

    key_finding: "Only Bug Fix achieves 4/4 coverage. Audit achieves 3/4. Feature, UX Simulation, and User Story each achieve 2/4. The Skill dispatch wiring (L3 being DISPATCHED rather than just PRESENT) exists ONLY for bugfix-* and spec-*. The other three types with L3 folders (audit-*) or without (ux-sim-*, user-story-*) never trip skill-contract enforcement."

  # ====================================================================
  # LANGFUSE RUNTIME EVIDENCE — folded into Axes A and B
  # ====================================================================
  langfuse_runtime_evidence_integration:
    evidence_source: "Parent queryMetrics (2026-06-01 to 06-11) + listObservations (06-09 to 06-11)"
    key_observations:
      - "ALL spans carry run_id=null and pipeline_doc_path='' — enrichment is PARTIAL (classification fields type/complexity/phase flow correctly; correlation keys don't)"
      - "Root cause: sentinel-state.json stores pipeline_id not run_id; PIPELINE_RUN_ID env never set when controller creates run folder manually"
      - "chat-derek=475 foreign traces in pipeline project — project isolation failure external to plugin"
      - "null=397 orphan spans — fragmentation persists post-v7.9.3"
      - "Cross-trace Bug Fix spans during this audit run — cwd-mtime collision likely (PIPELINE_RUN_ID unset)"
      - "The run_id=null ambiguity makes it IMPOSSIBLE to attribute any Langfuse observation to a specific pipeline run"
    axis_A_verdict: "run_id attribution is broken in production. Fidelity scores are frozen/null. Telemetry is shared with foreign app. The audit trail is unreliable for enforcement attribution."
    axis_B_verdict: "PLAN_MODE_BYPASS detection is text-only AND enforcement events (protocol-events.jsonl) are absent from this run — enforcement gaps are not observable in telemetry."

  # ====================================================================
  # FINDINGS PER AXIS — consolidated with severity
  # ====================================================================
  findings_per_axis:

    axis_A:
      - id: "A-001"
        description: "Fidelity freeze: idempotent-never-overwrite guard in ensureFidelityReport locks first teardown score permanently. Multi-session runs always carry undercount fidelity."
        severity: "critical"
        tag: "[VERIFIED]"
        evidence: ".claude/hooks/stop-hook.cjs (ensureFidelityReport idempotent guard)"

      - id: "A-002"
        description: "run_id=null on ALL Langfuse spans in production (2026-06-01 to 06-11, all 384 pipeline-run observations). Correlation keys absent makes enforcement event attribution impossible."
        severity: "critical"
        tag: "[VERIFIED]"
        evidence: "parent listObservations; sentinel-state.json (no run_id field); PIPELINE_RUN_ID env unset"

      - id: "A-003"
        description: "clock-skew aborted-run: 2026-06-09 run has timestamp_end before timestamp_start, fidelity_score=null, 0/11 gates, final_decision=UNKNOWN. Permanently incoherent."
        severity: "high"
        tag: "[VERIFIED]"
        evidence: ".pipeline/run-log.jsonl (last entry)"

      - id: "A-004"
        description: "chat-derek foreign traces (475 observations) polluting the pipeline Langfuse project. Makes queryMetrics on trace counts unreliable as pipeline health signal."
        severity: "high"
        tag: "[VERIFIED — mechanism HYPOTHESIS: shared project or external key reuse]"
        evidence: "parent queryMetrics grouped by traceName"

      - id: "A-005"
        description: "null=397 orphan spans (missing traceName) persist post-v7.9.3 — fragmentation not fully resolved."
        severity: "high"
        tag: "[VERIFIED from parent queryMetrics]"
        evidence: "parent queryMetrics: null=397"

      - id: "A-006"
        description: "protocol-events.jsonl absent from current run — PLAN_MODE_BYPASS enforcement events and GATE_REQUEST traces are not recorded for this audit run."
        severity: "high"
        tag: "[VERIFIED]"
        evidence: ".pipeline/docs/Pre-Complex-action/2026-06-11-auditoria-enforcement-variants/ (no protocol-events.jsonl)"

      - id: "A-007"
        description: "timestamp_start=null on all multi-session runs (stop-hook uses session context null fallback, does not derive from sentinel pipeline_id or created_at)."
        severity: "medium"
        tag: "[VERIFIED]"
        evidence: ".pipeline/run-log.jsonl (2026-06-06 entries, all 4 rows: timestamp_start=null)"

    axis_B:
      - id: "B-001"
        description: "Plan Mode contract (Layer 1) is TEXT-ONLY — zero hook code enforces PLAN_MODE_REQUEST emission or detection. grep PLAN_MODE_BYPASS|PLAN_MODE_REQUEST across .claude/hooks/ = 0 matches."
        severity: "critical"
        tag: "[VERIFIED]"
        evidence: ".claude/hooks/ grep=0"

      - id: "B-002"
        description: "Controller table-lookup is LLM-textual-read (not programmatic). Signal G: design-interrogator bypassed in this audit run — controller cleared with wrong claim ('not in table' when it IS at line 527). No secondary check caught it."
        severity: "critical"
        tag: "[VERIFIED]"
        evidence: "agents/core/pipeline-controller.md:527; DOMAIN_ANALYSIS contract_compliance.design-interrogator"

      - id: "B-003"
        description: "TDD gates (Layer 3) TEXT-ONLY. No hook prevents executor-controller dispatch before quality-gate-router + pre-tester complete. Inline-routed pipelines (audit, ux-sim, user-story, feature) never trip skill-contract enforcement."
        severity: "high"
        tag: "[VERIFIED]"
        evidence: "agents/core/pipeline-controller.md:192; .claude/hooks/sentinel-hook.cjs:45-62"

      - id: "B-004"
        description: "PLAN_MODE_BYPASS enforcement (Layer 6) is AUDIT hardness by design — second bypass is accepted unconditionally. No terminal enforcement. Anti-deadlock ACCEPT is intentional design."
        severity: "high"
        tag: "[VERIFIED — DESIGN]"
        evidence: "agents/core/pipeline-controller.md:533"

      - id: "B-005"
        description: "Sentinel checkpoint enforcement (Layer 5) is ABSENT for inline-routed pipelines (audit, ux-sim, user-story, feature) because enforceSkillContract returns null when current_skill is absent."
        severity: "high"
        tag: "[VERIFIED]"
        evidence: ".claude/hooks/sentinel-hook.cjs:45-62 (enforceSkillContract conditional)"

    axis_C:
      - id: "C-001"
        description: "Gate count 5-source SSOT drift: 22 (pipeline.md:387 self-declared authority) vs 27 (controller:261 self-declared authority) vs 35 (gates.md registry — verified correct). Both inline copies claim override-precedence AND are stale. A correct gates.md would be branded 'tampered'."
        severity: "high"
        tag: "[VERIFIED]"
        evidence: "commands/pipeline.md:387; agents/core/pipeline-controller.md:261; references/gates.md:3"

      - id: "C-002"
        description: "audit-heavy.md says controller dispatches via Skill tool; pipeline-controller.md:192 says inline. Direct contradiction between pipeline doc and controller prose on dispatch method."
        severity: "high"
        tag: "[VERIFIED]"
        evidence: "references/pipelines/audit-heavy.md:3; agents/core/pipeline-controller.md:192"

      - id: "C-003"
        description: "Feature type naming mismatch: complexity-matrix uses 'implement-light/implement-heavy', skills/ has 'feature-light/feature-heavy', references/pipelines/ has DEPRECATED 'implement-*.md'. Three different naming schemes in active use."
        severity: "medium"
        tag: "[VERIFIED]"
        evidence: "references/complexity-matrix.md:61; skills/ inventory; references/pipelines/implement-heavy.md:1"

      - id: "C-004"
        description: "F20 test omits plan-architect from MANDATORY_AGENTS loop despite plan-architect being in the controller table at line 522. F18 tests plan-architect separately but F20's coverage of '10 mandatory agents' is incomplete."
        severity: "medium"
        tag: "[VERIFIED]"
        evidence: "tests/regression/v7.10.0/F20-plan-mode-mandatory-agents.test.cjs:25-35 (9 agents only)"

      - id: "C-005"
        description: "pipeline-controller.md:298 still says 'The 22-gate registry is unchanged' — stale reference in protocol audit-trail note section."
        severity: "medium"
        tag: "[VERIFIED]"
        evidence: "agents/core/pipeline-controller.md:298"

    axis_D:
      - id: "D-001"
        description: "All Layer 1 (Plan Mode) tests are TEXT-ONLY — F18/F19/F20/F21 assert contract text presence, not runtime emission or detection. A run can violate Plan Mode contract while all 4 tests stay green."
        severity: "critical"
        tag: "[VERIFIED]"
        evidence: "tests/regression/v7.9.4/F18-plan-mode-contract.test.cjs; tests/regression/v7.10.0/F20-plan-mode-mandatory-agents.test.cjs"

      - id: "D-002"
        description: "sentinel-hook deny-path (expected_next mismatch → permissionDecision=deny) has NO behavioral test. The most critical enforcement mechanism in the repo has no test exercising its actual denial logic."
        severity: "high"
        tag: "[VERIFIED]"
        evidence: "tests/ directory — no test requires sentinel-hook.cjs with stdin payload + asserts deny response"

      - id: "D-003"
        description: "PLAN_MODE_BYPASS event write to protocol-events.jsonl is untested behaviorally. F19 asserts the bypass paragraph text exists in controller.md; no test simulates an actual bypass scenario and verifies the .jsonl write."
        severity: "high"
        tag: "[VERIFIED]"
        evidence: "tests/regression/v7.9.4/F19-controller-inline-plan-check.test.cjs (text-pin only)"

      - id: "D-004"
        description: "No regression test covers any audit, ux-sim, or user-story type-specific routing, gate triggering, or enforcement behavior. These 3 of 5 task types have zero dedicated regression coverage."
        severity: "high"
        tag: "[VERIFIED]"
        evidence: "tests/regression/ inventory — no *audit*, *ux-sim*, *user-story* files"

      - id: "D-005"
        description: "Fidelity-freeze cascade to run-log staleness untested: F16 tests idempotent guard (skip overwrite), but no test verifies a second session with more gates still reads the frozen undercount score."
        severity: "medium"
        tag: "[VERIFIED]"
        evidence: "tests/regression/v7.9.3/F16-fidelity-report-on-stop.test.cjs (scenario S2)"

      - id: "D-006"
        description: "cwd-mismatch multi-run Langfuse carrier collision untested. F17 tests single-process carrier resolution; no test simulates two concurrent runs sharing cwd with PIPELINE_RUN_ID unset."
        severity: "medium"
        tag: "[VERIFIED]"
        evidence: "tests/regression/v7.9.3/F17-langfuse-trace-enrichment.test.cjs"
```

---

## COMPLIANCE_CHECKER_RESULT

```yaml
COMPLIANCE_CHECKER_RESULT:
  status: "COMPLETE"
  output: "COMPLIANCE_REPORT"
  next_agent: "audit-risk-matrix-generator"
  summary: |
    4 axes assessed across 6 enforcement layers + variant coverage matrix (5 types × 4 layers).

    CRITICAL FINDINGS (5):
    [A-001] Fidelity freeze: first teardown score locked permanently via idempotent-never-overwrite guard.
    [A-002] run_id=null on ALL 384 pipeline-run Langfuse spans (2026-06-01 to 06-11) — enforcement event attribution impossible.
    [B-001] Plan Mode contract 100% TEXT-ONLY — grep .claude/hooks/ for PLAN_MODE_BYPASS|PLAN_MODE_REQUEST = 0 matches.
    [B-002] Controller table-lookup is LLM-textual (not programmatic) — Signal G: design-interrogator bypassed THIS run without detection.
    [D-001] All Plan Mode tests are TEXT-ONLY — F18/F19/F20/F21 assert contract text, not runtime behavior. Contract violation and green test suite coexist.

    HIGH FINDINGS (11):
    [A-003] clock-skew aborted run (2026-06-09): timestamp_end before timestamp_start, 0/11 gates, fidelity=null, UNKNOWN.
    [A-004] chat-derek foreign traces (475 obs) polluting pipeline Langfuse project.
    [A-005] null=397 orphan spans persist post-v7.9.3.
    [A-006] protocol-events.jsonl absent from current run — enforcement events unrecorded.
    [B-003] TDD gates TEXT-ONLY; sentinel enforcement absent for inline-routed types (audit/ux-sim/user-story/feature).
    [B-004] PLAN_MODE_BYPASS anti-deadlock ACCEPT by design — second bypass always accepted (DESIGN).
    [B-005] Sentinel checkpoint enforcement absent for all inline-routed pipelines.
    [C-001] Gate count 5-source SSOT drift (22/27/35 across 5 sources; both self-declared authorities stale).
    [C-002] audit-heavy.md contradicts controller on dispatch method.
    [D-002] sentinel-hook deny-path has no behavioral test.
    [D-003] PLAN_MODE_BYPASS event write to protocol-events.jsonl untested behaviorally.
    [D-004] audit/ux-sim/user-story types have zero dedicated regression coverage.

    VARIANT MATRIX:
    Bug Fix: 4/4 (only type with Skill dispatch + behavioral tests).
    Audit: 3/4 (L4 absent; dispatch doc contradicts controller).
    Feature: 2/4 (naming mismatch, deprecated docs, L4 absent).
    UX Simulation: 2/4 (L3 absent, L4 absent).
    User Story: 2/4 (L3 absent, L4 absent).
  blocked_reason: null
```
