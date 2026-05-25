'use strict';

const REQUIRED_PAYLOAD_FIELDS = Object.freeze([
  'given',
  'when',
  'then',
  'initialState',
  'triggeringAction',
  'expectedObservableResult',
  'author',
]);

const REQUIRED_METADATA_FIELDS = Object.freeze(['timestamp', 'sliceId']);

function missingField(code, field) {
  return { ok: false, code, field };
}

function validateAcceptanceEvidence(event) {
  if (!event || event.type !== 'acceptance.recorded') {
    return { ok: false, code: 'ACCEPTANCE_REQUIRED_BEFORE_IMPLEMENTATION' };
  }
  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!event[field]) return missingField('ACCEPTANCE_METADATA_MISSING', field);
  }
  if (event.implementationStartedAt
    && new Date(event.timestamp).getTime() > new Date(event.implementationStartedAt).getTime()) {
    return { ok: false, code: 'ACCEPTANCE_RECORDED_TOO_LATE' };
  }
  for (const field of REQUIRED_PAYLOAD_FIELDS) {
    if (!event.payload || !event.payload[field]) return missingField('ATDD_FIELD_MISSING', field);
  }
  return { ok: true };
}

module.exports = { validateAcceptanceEvidence };
