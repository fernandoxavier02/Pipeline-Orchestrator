'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./skill-validator.cjs');

function parsePermission(lines, startIndex) {
  const permission = {};
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('  ')) break;
    const match = line.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) permission[match[1]] = match[2].trim();
  }
  return permission;
}

function parseAgentFrontmatter(content) {
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;
  const frontmatter = content.slice(4, content.indexOf('\n---\n', 4));
  const lines = frontmatter.split(/\r?\n/);
  const permissionLine = lines.findIndex((line) => line === 'permission:');
  const permission = permissionLine === -1 ? {} : parsePermission(lines, permissionLine);
  return { fields: { ...parsed.fields, permission }, body: parsed.body };
}

function validateAgentDirectory({ root, agentNames }) {
  const errors = [];
  const agents = [];
  for (const name of agentNames) {
    const filePath = path.join(root, '.opencode', 'agents', `${name}.md`);
    if (!fs.existsSync(filePath)) {
      errors.push({ name, code: 'AGENT_MISSING' });
      continue;
    }
    const parsed = parseAgentFrontmatter(fs.readFileSync(filePath, 'utf8'));
    if (!parsed) {
      errors.push({ name, code: 'FRONTMATTER_MISSING' });
      continue;
    }
    const agent = {
      name,
      mode: parsed.fields.mode,
      description: parsed.fields.description,
      permission: parsed.fields.permission,
      body: parsed.body,
    };
    if (agent.mode !== 'subagent') errors.push({ name, code: 'INVALID_MODE' });
    if (!agent.description) errors.push({ name, code: 'DESCRIPTION_MISSING' });
    agents.push(agent);
  }
  return errors.length === 0 ? { ok: true, agents, errors } : { ok: false, agents, errors };
}

module.exports = { validateAgentDirectory, parseAgentFrontmatter };
