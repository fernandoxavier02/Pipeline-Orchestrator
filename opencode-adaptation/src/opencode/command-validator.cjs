'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./skill-validator.cjs');

function validateCommandConfig({ root, commandNames }) {
  const errors = [];
  const commands = [];
  const configCommands = [];
  const configPath = path.join(root, 'opencode.json');
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
  for (const commandName of commandNames) {
    const filePath = path.join(root, '.opencode', 'commands', `${commandName}.md`);
    if (!fs.existsSync(filePath)) {
      errors.push({ commandName, code: 'COMMAND_MISSING' });
      continue;
    }
    const parsed = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
    if (!parsed) {
      errors.push({ commandName, code: 'FRONTMATTER_MISSING' });
      continue;
    }
    const command = {
      name: commandName,
      description: parsed.fields.description,
      agent: parsed.fields.agent,
      template: parsed.body.trim(),
    };
    if (!command.description) errors.push({ commandName, code: 'DESCRIPTION_MISSING' });
    if (!command.template) errors.push({ commandName, code: 'TEMPLATE_MISSING' });
    if (!command.agent) errors.push({ commandName, code: 'AGENT_MISSING' });
    commands.push(command);

    const configCommand = config.command && config.command[commandName];
    if (!configCommand) {
      errors.push({ commandName, code: 'CONFIG_COMMAND_MISSING' });
      continue;
    }
    if (!configCommand.template) errors.push({ commandName, code: 'CONFIG_TEMPLATE_MISSING' });
    if (!configCommand.description) errors.push({ commandName, code: 'CONFIG_DESCRIPTION_MISSING' });
    if (!configCommand.agent) errors.push({ commandName, code: 'CONFIG_AGENT_MISSING' });
    if (configCommand.template && configCommand.template.trim() !== command.template) {
      errors.push({ commandName, code: 'CONFIG_TEMPLATE_MISMATCH' });
    }
    if (configCommand.description && configCommand.description !== command.description) {
      errors.push({ commandName, code: 'CONFIG_DESCRIPTION_MISMATCH' });
    }
    if (configCommand.agent && configCommand.agent !== command.agent) {
      errors.push({ commandName, code: 'CONFIG_AGENT_MISMATCH' });
    }
    configCommands.push({ name: commandName, ...configCommand });
  }
  return errors.length === 0
    ? { ok: true, commands, configCommands, configPath, errors }
    : { ok: false, commands, configCommands, configPath, errors };
}

module.exports = { validateCommandConfig };
