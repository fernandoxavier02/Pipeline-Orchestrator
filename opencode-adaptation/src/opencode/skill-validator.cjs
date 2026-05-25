'use strict';

const fs = require('node:fs');
const path = require('node:path');

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const fields = {};
  for (const line of content.slice(4, end).split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) fields[match[1]] = match[2].trim();
  }
  return { fields, body: content.slice(end + 5) };
}

function validateSkillDirectory({ root, skillNames }) {
  const errors = [];
  const skills = [];
  for (const skillName of skillNames) {
    const filePath = path.join(root, '.opencode', 'skills', skillName, 'SKILL.md');
    if (!fs.existsSync(filePath)) {
      errors.push({ skillName, code: 'SKILL_MISSING' });
      continue;
    }
    const parsed = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
    if (!parsed) {
      errors.push({ skillName, code: 'FRONTMATTER_MISSING' });
      continue;
    }
    const name = parsed.fields.name;
    const description = parsed.fields.description;
    if (!NAME_PATTERN.test(name || '')) errors.push({ skillName, code: 'INVALID_NAME' });
    if (name !== skillName) errors.push({ skillName, code: 'NAME_FOLDER_MISMATCH' });
    if (!description) errors.push({ skillName, code: 'DESCRIPTION_MISSING' });
    skills.push({ name, folderName: skillName, description, body: parsed.body });
  }
  return errors.length === 0 ? { ok: true, skills, errors } : { ok: false, skills, errors };
}

module.exports = { validateSkillDirectory, parseFrontmatter };
