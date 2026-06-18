'use strict';

// v8.4.0 (W3): 'sealed' is additive — the terminal status of a spec-authoring
// run that has been sealed (no implementation handoff). It never replaces any
// existing status; all prior states remain valid.
const VALID_STATUSES = ['ready', 'partial', 'cancelled', 'executing', 'completed', 'sealed'];
const VALID_PHASES = [0, 1, 2, 3];
const VALID_TYPES = ['Feature', 'Bug Fix', 'Audit', 'User Story', 'UX Simulation', 'Spec', 'Unknown'];
const VALID_COMPLEXITIES = ['SIMPLES', 'MEDIA', 'COMPLEXA', 'unknown'];
const VALID_HANDOFF = ['run-now', 'stop', null];

const REQUIRED_FIELDS = [
  'schema_version', 'run_id', 'created_at', 'updated_at', 'status', 'phase',
  'step_completed', 'type', 'complexity', 'brainstorm_completed',
  'spec_lifecycle_completed', 'handoff_decision', 'linked_pipeline_doc_path', 'notes',
];

class RunManifest {
  constructor(data) {
    this._data = Object.freeze({ ...data });
  }
  get run_id() { return this._data.run_id; }
  get status() { return this._data.status; }
  get phase() { return this._data.phase; }
  get step_completed() { return this._data.step_completed; }

  static fromObject(obj) {
    for (const f of REQUIRED_FIELDS) {
      if (!(f in obj)) throw new Error(`missing required field: ${f}`);
    }
    if (obj.schema_version !== 1) throw new Error(`invalid schema_version: ${obj.schema_version}`);
    if (!VALID_STATUSES.includes(obj.status)) throw new Error(`invalid status: ${obj.status}`);
    if (!VALID_PHASES.includes(obj.phase)) throw new Error(`invalid phase: ${obj.phase}`);
    if (!VALID_TYPES.includes(obj.type)) throw new Error(`invalid type: ${obj.type}`);
    if (!VALID_COMPLEXITIES.includes(obj.complexity)) throw new Error(`invalid complexity: ${obj.complexity}`);
    if (!VALID_HANDOFF.includes(obj.handoff_decision)) throw new Error(`invalid handoff_decision: ${obj.handoff_decision}`);
    return new RunManifest(obj);
  }

  toYaml() {
    const d = this._data;
    const str = (v) => v === null ? 'null' : JSON.stringify(v);
    const raw = (v) => v === null ? 'null' : String(v);
    return [
      `schema_version: ${d.schema_version}`,
      `run_id: ${str(d.run_id)}`,
      `created_at: ${str(d.created_at)}`,
      `updated_at: ${str(d.updated_at)}`,
      `status: ${str(d.status)}`,
      `phase: ${d.phase}`,
      `step_completed: ${raw(d.step_completed)}`,
      `type: ${str(d.type)}`,
      `complexity: ${str(d.complexity)}`,
      `brainstorm_completed: ${d.brainstorm_completed}`,
      `spec_lifecycle_completed: ${d.spec_lifecycle_completed}`,
      `handoff_decision: ${str(d.handoff_decision)}`,
      `linked_pipeline_doc_path: ${str(d.linked_pipeline_doc_path)}`,
      `notes: ${JSON.stringify(d.notes)}`,
      '',
    ].join('\n');
  }

  static fromYaml(text) {
    const lines = text.split(/\r?\n/);
    const obj = {};
    for (const line of lines) {
      if (!line.trim()) continue;
      const idx = line.indexOf(':');
      const key = line.slice(0, idx).trim();
      const raw = line.slice(idx + 1).trim();
      if (raw === 'null') obj[key] = null;
      else if (raw === 'true') obj[key] = true;
      else if (raw === 'false') obj[key] = false;
      else if (/^-?\d+$/.test(raw)) obj[key] = parseInt(raw, 10);
      else if (raw.startsWith('"')) obj[key] = JSON.parse(raw);
      else obj[key] = raw;
    }
    return RunManifest.fromObject(obj);
  }

  toObject() { return { ...this._data }; }

  /**
   * Return this manifest's `notes` field coerced to a plain object.
   * See the module-level notesToObject for the parsing contract.
   */
  notesObject() { return notesToObject(this._data.notes); }
}

/**
 * Coerce a manifest `notes` field into a plain object (v8.4.0 FIX-H — SSOT).
 *
 * `notes` round-trips as a STRING via RunManifest.toYaml (JSON.stringify on
 * write), so a manifest read back carries `notes` as JSON text. A freshly built
 * manifest may carry it as an object. Anything that does not parse into a plain
 * object (arrays, scalars, malformed JSON, empty string) becomes {}.
 *
 * Encapsulated here so consumers (run-seal, future readers) share one
 * implementation instead of each re-deriving the string-vs-object handling.
 */
function notesToObject(notes) {
  if (notes && typeof notes === 'object' && !Array.isArray(notes)) return { ...notes };
  if (typeof notes === 'string' && notes.trim()) {
    try {
      const parsed = JSON.parse(notes);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_e) { /* not JSON — drop */ }
  }
  return {};
}

module.exports = { RunManifest, notesToObject };
