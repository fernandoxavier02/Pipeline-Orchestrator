'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateEvidenceRecord,
  validateGateDecisionRecord,
  validateProtocolEventRecord,
  validateProtocolEventSequence,
  validateConfidenceScore,
  validateConfidenceScoreCeilings,
} = require('../validators/contract-validator.cjs');

const REQUIRED_CLOSEOUT_SECTIONS = Object.freeze(['phase', 'hook', 'gate', 'file', 'agent', 'skill', 'mode', 'evidence']);
const FINAL_MODES = Object.freeze(['bugfix', 'feature', 'audit', 'ux', 'spec']);

function assertAbsolute(name, value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new TypeError(`${name} must be an absolute path`);
}

function assertSafeRunId(runId) {
  if (typeof runId !== 'string' || runId.length === 0) throw new TypeError('runId is required');
  if (/[\\/]|\.\./.test(runId)) throw new Error('runId contains unsafe path characters');
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertStateRootInsideAdaptation(stateRoot) {
  const tmpRoot = path.resolve(__dirname, '..', '..', 'tmp');
  const resolvedStateRoot = path.resolve(stateRoot);
  if (!isInside(tmpRoot, resolvedStateRoot)) throw new Error('stateRoot must be inside adaptation tmp');
  if (fs.existsSync(tmpRoot) && fs.existsSync(resolvedStateRoot)) {
    const realTmpRoot = fs.realpathSync(tmpRoot);
    const realStateRoot = fs.realpathSync(resolvedStateRoot);
    if (!isInside(realTmpRoot, realStateRoot)) throw new Error('stateRoot must be inside adaptation tmp');
  }
}

function pathsFor(stateRoot, runId) {
  assertAbsolute('stateRoot', stateRoot);
  assertStateRootInsideAdaptation(stateRoot);
  assertSafeRunId(runId);
  const realStateRoot = fs.realpathSync(stateRoot);
  const runsRoot = path.resolve(realStateRoot, 'runs');
  fs.mkdirSync(runsRoot, { recursive: true });
  const realRunsRoot = fs.realpathSync(runsRoot);
  if (!isInside(realStateRoot, realRunsRoot)) throw new Error('runs root must stay inside stateRoot');
  const runDir = path.resolve(realRunsRoot, runId);
  if (!isInside(realRunsRoot, runDir)) throw new Error('runId contains unsafe path characters');
  if (!fs.existsSync(runDir)) fs.mkdirSync(runDir, { recursive: true });
  const realRunDir = fs.realpathSync(runDir);
  if (!isInside(realRunsRoot, realRunDir)) throw new Error('run directory must stay inside runs root');
  return {
    runDir,
    evidence: path.join(runDir, 'evidence.jsonl'),
    events: path.join(runDir, 'protocol-events.jsonl'),
    decisions: path.join(runDir, 'gate-decisions.jsonl'),
    confidence: path.join(runDir, 'confidence-score.json'),
  };
}

function appendJsonl(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(value) + '\n');
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function readModeQualityJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(5).toString('hex')}`;
}

function bool(value) {
  return value === true;
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/\b(password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=REDACTED')
    .replace(/\b(token)\s+[^\s,;]+/gi, '$1 REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer REDACTED');
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function concreteArtifact(value) {
  return value && typeof value === 'object'
    && typeof value.command === 'string' && value.command.length > 0
    && typeof value.artifactRef === 'string' && value.artifactRef.length > 0
    && fs.existsSync(value.artifactRef);
}

function concreteEvidence(value) {
  return concreteArtifact(value) && typeof value.summary === 'string' && value.summary.length > 0;
}

function concreteEvidenceArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(concreteEvidence);
}

function sourceExists(value) {
  if (concreteEvidence(value) || concreteArtifact(value)) return true;
  return typeof value === 'string' && value.length > 0 && fs.existsSync(value);
}

function redFailedForExpectedReason(value) {
  if (!concreteArtifact(value)
    || typeof value.expectedFailurePattern !== 'string'
    || value.expectedFailurePattern.length === 0
    || typeof value.observedFailure !== 'string'
    || !value.observedFailure.includes(value.expectedFailurePattern)) return false;
  const logText = fs.readFileSync(value.artifactRef, 'utf8');
  return logText.includes(value.expectedFailurePattern);
}

function artifactFor(stateRoot, value, fallback) {
  if (typeof value === 'string' && value.length > 0 && fs.existsSync(value)) {
    const absolute = path.resolve(value);
    const relative = path.relative(stateRoot, absolute);
    if (!relative.startsWith('..') && !path.isAbsolute(relative) && fs.existsSync(absolute)) return relative;
  }
  if (value && typeof value === 'object' && typeof value.artifactRef === 'string') {
    const absolute = path.resolve(value.artifactRef);
    const relative = path.relative(stateRoot, absolute);
    if (!relative.startsWith('..') && !path.isAbsolute(relative) && fs.existsSync(absolute)) return relative;
  }
  const safeName = String(fallback || 'evidence-artifact').replace(/[^A-Za-z0-9._-]+/g, '-');
  const fallbackRelative = path.join('evidence-artifacts', `${safeName}.log`);
  const fallbackAbsolute = path.join(stateRoot, fallbackRelative);
  fs.mkdirSync(path.dirname(fallbackAbsolute), { recursive: true });
  if (!fs.existsSync(fallbackAbsolute)) fs.writeFileSync(fallbackAbsolute, `Generated evidence placeholder for ${safeName}.
`);
  return fallbackRelative;
}

function summaryFor(value, fallback) {
  const raw = value && typeof value === 'object' && typeof value.summary === 'string' && value.summary.length > 0 ? value.summary : fallback;
  return sanitizeText(raw);
}

function commandFor(value, fallback) {
  const raw = value && typeof value === 'object' && typeof value.command === 'string' && value.command.length > 0 ? value.command : fallback;
  return sanitizeText(raw);
}

function minimalFixEvidence(value) {
  return concreteArtifact(value) && Array.isArray(value.changedFiles) && value.changedFiles.length > 0 && value.changedFiles.length <= 2;
}

function checkpointEvidence(value) {
  return concreteArtifact(value) && (value.status === 'PASS' || value.status === 'CORRECTED');
}

function findingHasEvidence(finding) {
  return finding && typeof finding.summary === 'string' && finding.summary.length > 0
    && typeof finding.severity === 'string' && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(finding.severity)
    && typeof finding.severityJustification === 'string' && finding.severityJustification.length > 0
    && sourceExists(finding.sourceArtifact || finding.artifactRef || finding.source);
}

function riskFrontHasEvidence(front) {
  return front && typeof front.front === 'string' && front.front.length > 0
    && typeof front.summary === 'string' && front.summary.length > 0
    && sourceExists(front.sourceArtifact || front.artifactRef || front.source);
}

function accessibilityEvidencePasses(value) {
  return concreteEvidence(value) && value.critical !== true;
}

function buildEvidence({ runId, evidenceType, mode, sprint, slice, ref, summary, artifact, verdict = 'PASS', now }) {
  const record = {
    schemaVersion: 'EVIDENCE_RECORD/v1',
    runId,
    evidenceId: newId(`ev-${evidenceType.toLowerCase()}`),
    evidenceType,
    mode,
    sprint: String(sprint),
    slice,
    commandOrPromptRef: ref,
    resultSummary: sanitizeText(summary),
    artifactRef: artifact,
    verdict,
    createdAt: now,
  };
  const validation = validateEvidenceRecord(record);
  if (!validation.ok) throw new Error(validation.message);
  return record;
}

function appendEvent(paths, event) {
  const current = readModeQualityJsonl(paths.events);
  const next = [...current, event];
  const validation = validateProtocolEventSequence(next);
  if (!validation.ok) throw new Error(validation.message);
  appendJsonl(paths.events, event);
}

function buildEvent({ runId, eventType, phase, actor, payloadRef, parentEventId, severity = 'info', now }) {
  const event = {
    schemaVersion: 'PROTOCOL_EVENT_RECORD/v1',
    runId,
    eventId: newId('evt'),
    eventType,
    phase,
    timestamp: now,
    actor,
    payloadRef,
    parentEventId,
    severity,
  };
  const validation = validateProtocolEventRecord(event);
  if (!validation.ok) throw new Error(validation.message);
  return event;
}

function buildDecision({ runId, gate, hardness = 'HARD', phase, decision = 'APPROVED', detail, impact = 5, now }) {
  const record = {
    schemaVersion: 'GATE_DECISION_RECORD/v1',
    runId,
    gate,
    hardness,
    phase,
    decision,
    decided_by: 'mode-quality',
    timestamp: now,
    detail: sanitizeText(detail),
    confidence_impact: impact,
  };
  const validation = validateGateDecisionRecord(record);
  if (!validation.ok) throw new Error(validation.message);
  return record;
}

function recordGate(paths, runId, gate, hardness, phase, detail, now) {
  const decision = buildDecision({ runId, gate, hardness, phase, detail, now });
  appendJsonl(paths.decisions, decision);
  const events = readModeQualityJsonl(paths.events);
  const parentEventId = events.length ? events[events.length - 1].eventId : null;
  const event = buildEvent({ runId, eventType: `${gate.toLowerCase()}_decided`, phase, actor: 'mode-quality', payloadRef: gate, parentEventId, now });
  appendEvent(paths, event);
  return decision;
}

function blocked({ stateRoot, runId, sprint, mode, gate, reason }) {
  const now = new Date().toISOString();
  const paths = pathsFor(stateRoot, runId);
  const phase = `sprint-${sprint}`;
  const decision = buildDecision({ runId, gate, hardness: gate === 'STOP_RULE' ? 'CIRCUIT_BREAKER' : 'HARD', phase, decision: 'BLOCKED', detail: reason, impact: -40, now });
  appendJsonl(paths.decisions, decision);
  const events = readModeQualityJsonl(paths.events);
  const parentEventId = events.length ? events[events.length - 1].eventId : null;
  const event = buildEvent({ runId, eventType: 'mode_quality_blocked', phase, actor: 'mode-quality', payloadRef: gate, parentEventId, severity: 'high', now });
  appendEvent(paths, event);
  const blockArtifact = artifactFor(stateRoot, null, `blocked-${gate}`);
  const evidence = buildEvidence({ runId, evidenceType: 'VERDICT', mode, sprint, slice: `${sprint}.block`, ref: gate, summary: reason, artifact: blockArtifact, verdict: 'BLOCKED', now });
  appendJsonl(paths.evidence, evidence);
  return { ok: false, blocked: true, blockedGate: gate, reason, decision, protocolEvent: event };
}

function adversarialReview({ mode, sprint, input }) {
  const highOpen = input && input.highFindingOpen === true;
  const writeRisk = /^audit-/.test(mode) && input && (input.writeAttempt === true || !concreteEvidence(input.readOnlyProof));
  const missingIntegration = /^feature-/.test(mode) && input && input.integration === false;
  return {
    security: { verdict: writeRisk ? 'BLOCK' : 'PASS', findings: writeRisk ? ['Audit flow attempted functional write.'] : [] },
    architecture: { verdict: highOpen ? 'BLOCK' : 'PASS', findings: highOpen ? ['Open high finding prevents phase transition.'] : [] },
    quality: { verdict: missingIntegration ? 'BLOCK' : 'PASS', findings: missingIntegration ? ['Feature lacks integration proof.'] : [] },
    sprint: String(sprint),
    mode,
  };
}

function checksFor(mode, input) {
  const batches = Array.isArray(input.batches) ? input.batches : [];
  const slices = Array.isArray(input.slices) ? input.slices : [];
  const sanity = input.sanityByMode || {};
  const verify = input.verifyCompletionByMode || {};
  switch (mode) {
    case 'bugfix-light':
      return [
        ['RED_REPRODUCTION', concreteArtifact(input.reproduction) && typeof input.red === 'object', 'Bugfix light requires concrete reproduction and RED artifacts/logs, not booleans.'],
        ['RED_REPRODUCTION', redFailedForExpectedReason(input.red), 'Bugfix light RED must fail for the expected reason with a verifiable log.'],
        ['TDD_APPROVAL', minimalFixEvidence(input.fix), 'Bugfix light requires concrete minimal-fix evidence with changed files and log.'],
        ['GREEN_REGRESSION', concreteArtifact(input.green) && concreteArtifact(input.regression), 'Bugfix light requires concrete GREEN and regression artifacts/logs.'],
        ['CLOSEOUT_CONFIRM', concreteArtifact(input.closeout), 'Bugfix light requires concrete closeout artifact/log.'],
      ];
    case 'bugfix-heavy':
      return [
        ['RED_REPRODUCTION', concreteArtifact(input.rootCause), 'Bugfix heavy requires concrete root cause evidence.'],
        ['PLAN_REJECTED', concreteArtifact(input.planApproved), 'Bugfix heavy requires approved plan artifact/log.'],
        ['RED_REPRODUCTION', batches.length > 0 && batches.every((b) => redFailedForExpectedReason(b.red)), 'Every bugfix heavy batch RED must fail for the expected reason with a verifiable log.'],
        ['MICRO_GATE_GAP', batches.length > 0 && batches.every((b) => checkpointEvidence(b.checkpoint)), 'Every bugfix heavy batch requires a validated physical checkpoint artifact.'],
        ['ADVERSARIAL_GATE_MANDATORY', batches.length > 0 && batches.every((b) => concreteArtifact(b.green) && concreteArtifact(b.adversarial) && b.adversarial.verdict !== 'BLOCK'), 'Bugfix heavy requires GREEN and adversarial review artifacts for every batch.'],
        ['ADVERSARIAL_BLOCK', input.highFindingOpen !== true, 'Open HIGH adversarial finding blocks bugfix heavy.'],
        ['SPEC_POST_IMPL_FAIL', concreteArtifact(input.verifyCompletion), 'Bugfix heavy requires verify-completion artifact/log.'],
      ];
    case 'feature-light':
      return [
        ['TDD_APPROVAL', concreteEvidence(input.scenarioApproved) && concreteEvidence(input.atdd), 'Feature light requires approved scenario and ATDD artifacts/logs, not booleans.'],
        ['RED_REPRODUCTION', redFailedForExpectedReason(input.red), 'Feature light requires concrete RED failure for the expected reason.'],
        ['VERTICAL_SLICE', concreteEvidence(input.green), 'Feature light requires concrete GREEN vertical-slice artifact/log.'],
        ['INTEGRATION_GATE', concreteEvidence(input.integration), 'Feature light without concrete integration artifact/log is blocked.'],
        ['GREEN_REGRESSION', concreteEvidence(input.nonRegression), 'Feature light requires concrete non-regression artifact/log.'],
      ];
    case 'feature-heavy':
      return [
        ['PLAN_REJECTED', concreteEvidence(input.planApproved), 'Feature heavy requires approved plan artifact/log.'],
        ['RED_REPRODUCTION', slices.length >= 2 && slices.every((s) => redFailedForExpectedReason(s.red)), 'Feature heavy requires each slice RED to fail for the expected reason.'],
        ['MICRO_GATE_GAP', slices.length >= 2 && slices.every((s) => concreteEvidence(s.green) && checkpointEvidence(s.checkpoint)), 'Feature heavy requires multiple slices with concrete GREEN and checkpoint artifacts.'],
        ['INTEGRATION_GATE', concreteEvidence(input.integration), 'Feature heavy requires concrete integration artifact/log between slices.'],
        ['ADVERSARIAL_GATE_MANDATORY', concreteEvidence(input.finalReview), 'Feature heavy requires concrete final review artifact/log.'],
      ];
    case 'audit-light':
      return [
        ['READ_ONLY_SCOPE', input.writeAttempt !== true && concreteEvidence(input.readOnlyProof), 'Audit light must remain read-only and include physical read-only proof.'],
        ['FINDINGS_EVIDENCE', nonEmptyArray(input.findings) && input.findings.every(findingHasEvidence), 'Audit light findings need existing source artifacts, summary and severity justification.'],
        ['CLOSEOUT_CONFIRM', concreteEvidence(input.closeout), 'Audit light requires concrete closeout artifact/log.'],
      ];
    case 'audit-heavy':
      return [
        ['TDD_APPROVAL', concreteEvidence(input.scopeApproved), 'Audit heavy requires approved scope artifact/log.'],
        ['READ_ONLY_SCOPE', input.writeAttempt !== true && concreteEvidence(input.readOnlyProof), 'Audit heavy must remain read-only and include physical read-only proof.'],
        ['AUDIT_RISK_MATRIX', nonEmptyArray(input.riskMatrix) && input.riskMatrix.length >= 3 && input.riskMatrix.every(riskFrontHasEvidence), 'Audit heavy requires a risk matrix with at least three fronts and existing artifacts.'],
        ['FINDINGS_EVIDENCE', nonEmptyArray(input.sources) && input.sources.every(sourceExists), 'Audit heavy requires existing evidence sources.'],
        ['ADVERSARIAL_GATE_MANDATORY', concreteEvidence(input.adversarialReport), 'Audit heavy requires concrete adversarial report artifact/log.'],
        ['STOP_RULE', input.criticalFinding !== true || input.stopRule === true, 'CRITICAL finding without STOP_RULE blocks audit heavy.'],
      ];
    case 'ux-light':
      return [
        ['PERSONA_JOURNEY_GATE', concreteEvidence(input.persona) && concreteEvidence(input.flow), 'UX light requires persona record and main-flow artifact/log, not a string.'],
        ['ACCESSIBILITY_GATE', concreteEvidence(input.accessibilityBasic), 'UX light requires concrete basic accessibility artifact/log.'],
        ['FINDINGS_EVIDENCE', concreteEvidence(input.visualEvidence), 'UX light requires existing visual or flow evidence artifact/log.'],
      ];
    case 'ux-heavy':
      return [
        ['PERSONA_JOURNEY_GATE', concreteEvidence(input.personasApproved) && concreteEvidenceArray(input.journeys), 'UX heavy requires approved personas and journeys as artifacts/logs.'],
        ['TDD_APPROVAL', concreteEvidence(input.bddScenarios), 'UX heavy requires BDD scenarios artifact/log.'],
        ['FINDINGS_EVIDENCE', concreteEvidence(input.visualValidation), 'UX heavy requires concrete visual and flow validation artifact/log.'],
        ['ACCESSIBILITY_GATE', accessibilityEvidencePasses(input.accessibilityExpanded), 'UX heavy blocks critical accessibility failures and requires physical accessibility record.'],
        ['ADVERSARIAL_GATE_MANDATORY', concreteEvidence(input.review), 'UX heavy requires concrete review artifact/log.'],
      ];
    case 'spec-light':
      return [
        ['SPEC_ARTIFACT_MISSING', concreteEvidence(input.requirements) && concreteEvidence(input.design) && concreteEvidence(input.tasks), 'SPEC light requires existing requirements, design and tasks artifacts.'],
        ['SPEC_AC_TRACEABILITY_GAP', concreteEvidence(input.acceptanceTraceability), 'SPEC light requires traceable acceptance criteria artifact/log.'],
        ['SPEC_FORMAT_GATE_FAIL', concreteEvidence(input.formatGate), 'SPEC light requires format gate artifact/log.'],
      ];
    case 'spec-heavy':
      return [
        ['SPEC_ARTIFACT_MISSING', concreteEvidence(input.requirements) && concreteEvidence(input.ddd) && concreteEvidence(input.contracts) && concreteEvidence(input.testStrategy), 'SPEC heavy requires existing requirements, DDD, contracts and test strategy artifacts.'],
        ['SPEC_AC_TRACEABILITY_GAP', concreteEvidence(input.acceptanceTraceability), 'SPEC heavy requires AC traceability artifact/log.'],
        ['SPEC_FORMAT_GATE_FAIL', concreteEvidence(input.risks) && concreteEvidence(input.postImplementationGates), 'SPEC heavy requires risks and post-implementation gates artifacts.'],
        ['SPEC_CONTENT_REVIEW_NOGO', concreteEvidence(input.adversarialSpecReview), 'SPEC heavy requires adversarial spec review artifact/log.'],
      ];
    case 'final-validation':
      return [
        ['SPEC_POST_IMPL_FAIL', FINAL_MODES.every((modeName) => concreteEvidence(sanity[modeName]) && concreteEvidence(verify[modeName])), 'Final validation requires physical sanity and verify-completion artifacts for every mode.'],
        ['CLOSEOUT_CONFIRM', typeof input.confidenceScore === 'number' && input.confidenceScore >= 70, 'Confidence score below 70 blocks ready closeout.'],
        ['CONFIDENCE_EVIDENCE_CEILING', validateConfidenceScoreCeilings({ schemaVersion: 'CONFIDENCE_SCORE/v1', runId: 'ceiling-check', score: input.confidenceScore || 0, scale: '0-100', factors: [], updatedAt: new Date().toISOString(), updatedBy: 'final-validator', floorApplied: false }, input.evidenceCeilings || { allRequiredGatesPresent: false }).ok, 'Confidence score exceeds evidence ceilings.'],
        ['STOP_BEFORE_PA_DE_CAL', concreteEvidence(input.paDeCalStrict), 'Strict Pa de Cal validation requires concrete artifact/log before stop.'],
      ];
    case 'parity-closeout':
      return [
        ['CLOSEOUT_CONFIRM', concreteEvidence(input.closeoutViaUi) && input.missingGate !== true, 'Closeout requires physical UI decision record and no missing mandatory gate.'],
        ['FINAL_ADVERSARIAL_GATE', concreteEvidence(input.finalAdversarial), 'Final adversarial review requires physical artifact/log.'],
        ['FINAL_ADVERSARIAL_REWORK', input.finalRework !== true, 'Final adversarial rework blocks ready closeout.'],
        ['CLOSEOUT_REPORT_COMPLETE', concreteEvidence(input.reportArtifact) && REQUIRED_CLOSEOUT_SECTIONS.every((section) => (input.reportSections || input.reportArtifact.sections || []).includes(section)), 'Closeout report must be a concrete artifact covering phase, hook, gate, file, agent, skill, mode and evidence.'],
      ];
    default:
      return [['INFO_GATE_BLOCKED', false, `Unsupported mode: ${mode}`]];
  }
}
function writeEvidenceSequence({ paths, stateRoot, runId, mode, sprint, now, review, input = {} }) {
  let specs;
  if (mode === 'bugfix-light') {
    specs = [
      ['ACCEPTANCE', input.reproduction, 'Acceptance reproduction command and artifact recorded.'],
      ['RED', input.red, `RED failed for expected reason: ${input.red.expectedFailurePattern}.`],
      ['GREEN', input.green, summaryFor(input.green, 'Focused GREEN passed after minimum fix.')],
      ['PROMPT_DEBUG', input.fix, summaryFor(input.fix, 'Minimal fix evidence recorded.')],
      ['REVIEW', input.regression, `Security ${review.security.verdict}; architecture ${review.architecture.verdict}; quality ${review.quality.verdict}. Regression artifact linked.`],
      ['VERDICT', input.closeout, summaryFor(input.closeout, 'Bugfix light closeout completed.')],
    ];
  } else if (mode === 'bugfix-heavy') {
    specs = [
      ['ACCEPTANCE', input.rootCause, summaryFor(input.rootCause, 'Root cause artifact recorded.')],
      ...input.batches.map((batch, index) => ['RED', batch.red, `Batch ${index + 1} RED failed for expected reason: ${batch.red.expectedFailurePattern}.`, `${sprint}.batch-${index + 1}.red`]),
      ...input.batches.map((batch, index) => ['GREEN', batch.green, summaryFor(batch.green, `Batch ${index + 1} GREEN passed.`), `${sprint}.batch-${index + 1}.green`]),
      ['PROMPT_DEBUG', input.planApproved, summaryFor(input.planApproved, 'Approved plan artifact recorded.')],
      ...input.batches.map((batch, index) => ['PROMPT_DEBUG', batch.checkpoint, summaryFor(batch.checkpoint, `Batch ${index + 1} checkpoint validated.`), `${sprint}.batch-${index + 1}.checkpoint`]),
      ...input.batches.map((batch, index) => ['REVIEW', batch.adversarial, `Batch ${index + 1} adversarial review: ${batch.adversarial.verdict}.`, `${sprint}.batch-${index + 1}.adversarial`]),
      ['VERDICT', input.verifyCompletion, summaryFor(input.verifyCompletion, 'Bugfix heavy verify-completion completed.')],
    ];
  } else if (mode === 'feature-light') {
    specs = [
      ['ACCEPTANCE', input.scenarioApproved, summaryFor(input.scenarioApproved, 'Approved scenario artifact recorded.')],
      ['RED', input.red, `RED failed for expected reason: ${input.red.expectedFailurePattern}.`],
      ['GREEN', input.green, summaryFor(input.green, 'Feature light GREEN vertical slice passed.')],
      ['PROMPT_DEBUG', input.atdd, summaryFor(input.atdd, 'ATDD artifact recorded.')],
      ['REVIEW', input.integration, summaryFor(input.integration, `Integration review passed. Security ${review.security.verdict}; architecture ${review.architecture.verdict}; quality ${review.quality.verdict}.`)],
      ['VERDICT', input.nonRegression, summaryFor(input.nonRegression, 'Non-regression evidence recorded.')],
    ];
  } else if (mode === 'feature-heavy') {
    specs = [
      ['ACCEPTANCE', input.planApproved, summaryFor(input.planApproved, 'Approved feature plan artifact recorded.')],
      ...input.slices.map((slice, index) => ['RED', slice.red, `Slice ${index + 1} RED failed for expected reason: ${slice.red.expectedFailurePattern}.`, `${sprint}.slice-${index + 1}.red`]),
      ...input.slices.map((slice, index) => ['GREEN', slice.green, summaryFor(slice.green, `Slice ${index + 1} GREEN passed.`), `${sprint}.slice-${index + 1}.green`]),
      ...input.slices.map((slice, index) => ['PROMPT_DEBUG', slice.checkpoint, summaryFor(slice.checkpoint, `Slice ${index + 1} checkpoint validated.`), `${sprint}.slice-${index + 1}.checkpoint`]),
      ['REVIEW', input.finalReview, summaryFor(input.finalReview, `Final feature review passed. Security ${review.security.verdict}; architecture ${review.architecture.verdict}; quality ${review.quality.verdict}.`)],
      ['VERDICT', input.integration, summaryFor(input.integration, 'Cross-slice integration evidence recorded.')],
    ];
  } else if (mode === 'audit-light') {
    const firstFinding = input.findings[0].sourceArtifact || input.findings[0].artifactRef || input.findings[0].source;
    specs = [
      ['ACCEPTANCE', input.readOnlyProof, summaryFor(input.readOnlyProof, 'Read-only scope proof recorded.')],
      ['RED', input.readOnlyProof, 'Write attempt guard remained read-only.'],
      ['GREEN', firstFinding, summaryFor(input.findings[0], 'Audit finding source artifact recorded.')],
      ['PROMPT_DEBUG', input.readOnlyProof, 'Audit prompt trail stayed read-only.'],
      ['REVIEW', firstFinding, `Audit findings reviewed. Security ${review.security.verdict}; architecture ${review.architecture.verdict}; quality ${review.quality.verdict}.`],
      ['VERDICT', input.closeout, summaryFor(input.closeout, 'Audit light closeout recorded.')],
    ];
  } else if (mode === 'audit-heavy') {
    const firstRisk = input.riskMatrix[0].sourceArtifact || input.riskMatrix[0].artifactRef || input.riskMatrix[0].source;
    specs = [
      ['ACCEPTANCE', input.scopeApproved, summaryFor(input.scopeApproved, 'Approved audit scope recorded.')],
      ['RED', input.readOnlyProof, 'Write attempt guard stayed read-only for heavy audit.'],
      ['GREEN', firstRisk, summaryFor(input.riskMatrix[0], 'Risk matrix evidence recorded.')],
      ['PROMPT_DEBUG', input.readOnlyProof, 'Read-only proof recorded.'],
      ['REVIEW', input.adversarialReport, summaryFor(input.adversarialReport, 'Adversarial audit report reviewed.')],
      ['VERDICT', input.adversarialReport, 'Audit heavy verdict recorded with adversarial report.'],
    ];
  } else if (mode === 'ux-light') {
    specs = [
      ['ACCEPTANCE', input.persona, summaryFor(input.persona, 'Persona record artifact recorded.')],
      ['RED', input.flow, 'Main-flow friction check recorded.'],
      ['GREEN', input.visualEvidence, summaryFor(input.visualEvidence, 'Visual or flow evidence recorded.')],
      ['PROMPT_DEBUG', input.flow, summaryFor(input.flow, 'Main flow artifact recorded.')],
      ['REVIEW', input.accessibilityBasic, summaryFor(input.accessibilityBasic, 'Basic accessibility evidence recorded.')],
      ['VERDICT', input.visualEvidence, 'UX light verdict recorded.'],
    ];
  } else if (mode === 'ux-heavy') {
    specs = [
      ['ACCEPTANCE', input.personasApproved, summaryFor(input.personasApproved, 'Approved personas artifact recorded.')],
      ['RED', input.bddScenarios, summaryFor(input.bddScenarios, 'BDD scenarios artifact recorded.')],
      ['GREEN', input.visualValidation, summaryFor(input.visualValidation, 'Visual validation passed.')],
      ['PROMPT_DEBUG', input.journeys[0], summaryFor(input.journeys[0], 'Journey artifact recorded.')],
      ['REVIEW', input.review, summaryFor(input.review, 'UX heavy review recorded.')],
      ['VERDICT', input.accessibilityExpanded, summaryFor(input.accessibilityExpanded, 'Expanded accessibility evidence recorded.')],
    ];
  } else if (mode === 'spec-light') {
    specs = [
      ['ACCEPTANCE', input.requirements, summaryFor(input.requirements, 'Requirements artifact recorded.')],
      ['RED', input.formatGate, summaryFor(input.formatGate, 'Format gate evidence recorded.')],
      ['GREEN', input.design, summaryFor(input.design, 'Design artifact recorded.')],
      ['PROMPT_DEBUG', input.tasks, summaryFor(input.tasks, 'Tasks artifact recorded.')],
      ['REVIEW', input.acceptanceTraceability, summaryFor(input.acceptanceTraceability, 'Acceptance traceability reviewed.')],
      ['VERDICT', input.formatGate, 'SPEC light verdict recorded.'],
    ];
  } else if (mode === 'spec-heavy') {
    specs = [
      ['ACCEPTANCE', input.requirements, summaryFor(input.requirements, 'Requirements artifact recorded.')],
      ['RED', input.contracts, summaryFor(input.contracts, 'Contracts gate evidence recorded.')],
      ['GREEN', input.ddd, summaryFor(input.ddd, 'DDD design artifact recorded.')],
      ['PROMPT_DEBUG', input.testStrategy, summaryFor(input.testStrategy, 'Test strategy artifact recorded.')],
      ['REVIEW', input.adversarialSpecReview, summaryFor(input.adversarialSpecReview, 'Adversarial spec review recorded.')],
      ['VERDICT', input.acceptanceTraceability, summaryFor(input.acceptanceTraceability, 'SPEC heavy traceability verdict recorded.')],
    ];
  } else if (mode === 'final-validation') {
    specs = [
      ['ACCEPTANCE', input.sanityByMode.bugfix, 'Sanity evidence by mode recorded.'],
      ['RED', input.verifyCompletionByMode.bugfix, 'Verify-completion evidence by mode recorded.'],
      ['GREEN', input.sanityByMode.feature, 'Feature sanity evidence recorded.'],
      ['PROMPT_DEBUG', input.verifyCompletionByMode.feature, 'Feature verify-completion evidence recorded.'],
      ['REVIEW', input.paDeCalStrict, summaryFor(input.paDeCalStrict, 'Strict Pa de Cal artifact recorded.')],
      ['VERDICT', input.paDeCalStrict, 'Final validation verdict recorded.'],
    ];
  } else if (mode === 'parity-closeout') {
    specs = [
      ['ACCEPTANCE', input.closeoutViaUi, summaryFor(input.closeoutViaUi, 'Closeout UI decision recorded.')],
      ['RED', input.finalAdversarial, 'Final adversarial review gate recorded.'],
      ['GREEN', input.reportArtifact, summaryFor(input.reportArtifact, 'Parity report artifact recorded.')],
      ['PROMPT_DEBUG', input.closeoutViaUi, 'Closeout prompt trail recorded.'],
      ['REVIEW', input.finalAdversarial, summaryFor(input.finalAdversarial, 'Final adversarial review recorded.')],
      ['VERDICT', input.reportArtifact, 'Parity closeout verdict recorded.'],
    ];
  } else {
    specs = [
      ['ACCEPTANCE', null, 'Acceptance criteria recorded before implementation.'],
      ['RED', null, 'Focused test failed before mode-quality implementation.'],
      ['GREEN', null, 'Focused test passed after minimum implementation.'],
      ['PROMPT_DEBUG', null, 'Prompt/debug trail used sanitized references only.'],
      ['REVIEW', null, `Security ${review.security.verdict}; architecture ${review.architecture.verdict}; quality ${review.quality.verdict}.`],
      ['VERDICT', null, 'Sprint gate sequence completed.'],
    ];
  }
  const records = specs.map(([type, source, summary, explicitSlice], index) => buildEvidence({
    runId,
    evidenceType: type,
    mode,
    sprint,
    slice: explicitSlice || `${sprint}.${index + 1}`,
    ref: commandFor(source, `${mode}-${type.toLowerCase()}-record`),
    summary,
    artifact: artifactFor(stateRoot, source, `${mode}-${type.toLowerCase()}`),
    now,
  }));
  for (const record of records) appendJsonl(paths.evidence, record);

  return records;
}

function runModeQualitySprint({ stateRoot, runId, sprint, mode, input = {} }) {
  const checks = checksFor(mode, input);
  const failed = checks.find(([, passed]) => !passed);
  if (failed) return blocked({ stateRoot, runId, sprint, mode, gate: failed[0], reason: failed[2] });
  const paths = pathsFor(stateRoot, runId);
  const now = new Date().toISOString();
  const phase = `sprint-${sprint}`;
  const review = adversarialReview({ mode, sprint, input });
  if ([review.security, review.architecture, review.quality].some((item) => item.verdict !== 'PASS')) {
    return blocked({ stateRoot, runId, sprint, mode, gate: 'ADVERSARIAL_BLOCK', reason: 'Adversarial review found a blocking issue.' });
  }
  const startEvent = buildEvent({ runId, eventType: 'mode_quality_sprint_started', phase, actor: 'mode-quality', payloadRef: mode, parentEventId: null, now });
  appendEvent(paths, startEvent);
  const gates = checks.map(([gate]) => gate);
  for (const gate of gates) recordGate(paths, runId, gate, gate === 'STOP_RULE' ? 'CIRCUIT_BREAKER' : 'HARD', phase, `${gate} approved for ${mode}.`, now);
  const evidenceRecords = writeEvidenceSequence({ paths, stateRoot, runId, mode, sprint, now, review, input });
  return { ok: true, mode, sprint: String(sprint), gates, evidenceRecords, review };
}

function finalChecks(input) {
  return checksFor('final-validation', input);
}

function runFinalValidation({ stateRoot, runId, sprint = '17', input = {} }) {
  const failed = finalChecks(input).find(([, passed]) => !passed);
  if (failed) return blocked({ stateRoot, runId, sprint, mode: 'final-validation', gate: failed[0], reason: failed[2] });
  const paths = pathsFor(stateRoot, runId);
  const now = new Date().toISOString();
  const phase = `sprint-${sprint}`;
  const startEvent = buildEvent({ runId, eventType: 'final_validator_started', phase, actor: 'final-validator', payloadRef: 'sanity-verify-pa-de-cal', parentEventId: null, now });
  appendEvent(paths, startEvent);
  const gates = finalChecks(input).map(([gate]) => gate);
  for (const gate of gates) recordGate(paths, runId, gate, gate === 'STOP_BEFORE_PA_DE_CAL' ? 'HARD' : 'HARD', phase, `${gate} approved for final validation.`, now);
  const confidence = {
    schemaVersion: 'CONFIDENCE_SCORE/v1',
    runId,
    score: input.confidenceScore,
    scale: '0-100',
    factors: [{ name: 'sanity_verify_and_pa_de_cal_passed', delta: input.confidenceScore }],
    updatedAt: now,
    updatedBy: 'final-validator',
    floorApplied: false,
  };
  const validation = validateConfidenceScoreCeilings(confidence, input.evidenceCeilings || { allRequiredGatesPresent: false });
  if (!validation.ok) throw new Error(validation.message);
  writeJson(paths.confidence, confidence);
  const review = { security: { verdict: 'PASS', findings: [] }, architecture: { verdict: 'PASS', findings: [] }, quality: { verdict: 'PASS', findings: [] }, sprint: String(sprint), mode: 'final-validation' };
  const evidenceRecords = writeEvidenceSequence({ paths, stateRoot, runId, mode: 'final-validation', sprint, now, review, input });
  return { ok: true, gates, confidence, evidenceRecords, review };
}

function closeoutChecks(input) {
  return checksFor('parity-closeout', input);
}

function runParityCloseout({ stateRoot, runId, sprint = '18', input = {} }) {
  const failed = closeoutChecks(input).find(([, passed]) => !passed);
  if (failed) return blocked({ stateRoot, runId, sprint, mode: 'parity-closeout', gate: failed[0], reason: failed[2] });
  const paths = pathsFor(stateRoot, runId);
  const now = new Date().toISOString();
  const phase = `sprint-${sprint}`;
  const startEvent = buildEvent({ runId, eventType: 'parity_closeout_started', phase, actor: 'closeout', payloadRef: 'end-to-end-parity', parentEventId: null, now });
  appendEvent(paths, startEvent);
  const gates = closeoutChecks(input).map(([gate]) => gate);
  for (const gate of gates) {
    const hardness = gate === 'FINAL_ADVERSARIAL_REWORK' || gate === 'CLOSEOUT_REPORT_COMPLETE' ? 'HARD' : 'SOFT';
    recordGate(paths, runId, gate, hardness, phase, gate + ' approved for parity closeout.', now);
  }
  const review = { security: { verdict: 'PASS', findings: [] }, architecture: { verdict: 'PASS', findings: [] }, quality: { verdict: 'PASS', findings: [] }, sprint: String(sprint), mode: 'parity-closeout' };
  const evidenceRecords = writeEvidenceSequence({ paths, stateRoot, runId, mode: 'parity-closeout', sprint, now, review, input });
  return { ok: true, gates, reportComplete: true, evidenceRecords, review };
}

module.exports = {
  runModeQualitySprint,
  runFinalValidation,
  runParityCloseout,
  readModeQualityJsonl,
};
