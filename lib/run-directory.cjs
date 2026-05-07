'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { RunManifest } = require('./run-manifest.cjs');

function slugify(prompt, maxWords = 5) {
  const ascii = prompt
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = ascii.split(' ').filter(w => w && !['a','an','the','of','for','to','in','on'].includes(w));
  const slug = words.slice(0, maxWords).join('-');
  return slug || 'run';
}

function nextRunNumber(rootDir) {
  if (!fs.existsSync(rootDir)) return '001';
  const entries = fs.readdirSync(rootDir).filter(d => /^\d{3}-/.test(d));
  if (entries.length === 0) return '001';
  const max = Math.max(...entries.map(d => parseInt(d.slice(0, 3), 10)));
  return String(max + 1).padStart(3, '0');
}

function resolveSlugCollision(rootDir, baseSlug) {
  const existing = fs.existsSync(rootDir)
    ? fs.readdirSync(rootDir).filter(d => /^\d{3}-/.test(d))
    : [];
  const slugs = new Set(existing.map(d => d.slice(4)));
  if (!slugs.has(baseSlug)) return baseSlug;
  let n = 2;
  while (slugs.has(`${baseSlug}-${n}`)) n++;
  return `${baseSlug}-${n}`;
}

class RunDirectory {
  constructor(rootDir, runNumber, slug) {
    this._rootDir = rootDir;
    this._runNumber = runNumber;
    this._slug = slug;
  }
  get runNumber() { return this._runNumber; }
  get slug() { return this._slug; }
  get runId() { return `${this._runNumber}-${this._slug}`; }
  get absPath() { return path.join(this._rootDir, this.runId); }

  static allocate(rootDir, prompt) {
    fs.mkdirSync(rootDir, { recursive: true });
    const runNumber = nextRunNumber(rootDir);
    const baseSlug = slugify(prompt);
    const slug = resolveSlugCollision(rootDir, baseSlug);
    const rd = new RunDirectory(rootDir, runNumber, slug);
    fs.mkdirSync(rd.absPath, { recursive: true });
    for (const sub of ['00-brainstorm', '01-spec', '02-validations', '03-execution', 'attachments']) {
      fs.mkdirSync(path.join(rd.absPath, sub), { recursive: true });
    }
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const manifest = RunManifest.fromObject({
      schema_version: 1, run_id: rd.runId, created_at: now, updated_at: now,
      status: 'ready', phase: 0, step_completed: null,
      type: 'Unknown', complexity: 'unknown',
      brainstorm_completed: false, spec_lifecycle_completed: false,
      handoff_decision: null, linked_pipeline_doc_path: null, notes: '',
    });
    fs.writeFileSync(path.join(rd.absPath, 'manifest.yaml'), manifest.toYaml());
    return rd;
  }
}

module.exports = { RunDirectory };
