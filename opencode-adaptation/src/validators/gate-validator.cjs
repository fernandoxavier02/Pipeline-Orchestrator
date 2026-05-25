'use strict';

function failure(code, message) {
  return { ok: false, code, message };
}

function hasRecommendedLabel(option) {
  return typeof option.label === 'string' && option.label.includes('(Recomendado)');
}

function isCriticalGate(gate, options) {
  if (gate.safetyCritical) return true;
  const text = [gate.question, ...options.flatMap((option) => [option.label, option.description])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /seguran|security|escopo|scope|\btdd\b|protecao original|proteção original|original protection/.test(text);
}

function validateGate(gate) {
  const options = gate && Array.isArray(gate.options) ? gate.options : [];
  if (options.length < 2 || options.length > 4) {
    return failure('INVALID_OPTION_COUNT', 'Gate must have between two and four options.');
  }

  for (const option of options) {
    if (!option || typeof option.label !== 'string' || option.label.length === 0) {
      return failure('OPTION_LABEL_MISSING', 'Each option must have a label.');
    }
    if (typeof option.description !== 'string' || option.description.length === 0) {
      return failure('OPTION_DESCRIPTION_MISSING', 'Each option must have a description.');
    }
  }

  if (isCriticalGate(gate, options)) {
    const recommendedIndex = options.findIndex(hasRecommendedLabel);
    if (recommendedIndex === -1) {
      return failure('RECOMMENDED_OPTION_MISSING', 'Safety-critical gates require a recommended option.');
    }
    if (recommendedIndex !== 0) {
      return failure('RECOMMENDED_OPTION_NOT_FIRST', 'The recommended option must be first.');
    }
  }

  return { ok: true };
}

module.exports = { validateGate };
