'use strict';
const { execFile } = require('node:child_process');

// Defesa contra injeção de comando: os ids são interpolados numa string executada
// pelo shell REMOTO via ssh. Exige um id alfanumérico curto (UUID/identifier) e
// rejeita qualquer caractere de shell (;, $, espaço, aspas, etc.).
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
function assertSafeId(value, name) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new Error(`${name} inválido: precisa casar /^[A-Za-z0-9_-]{1,64}$/ (recebido: ${JSON.stringify(value)})`);
  }
  return value;
}

// Transport default: SSH para a VPS + curl loopback (read-only). Substituível em teste.
function sshTransport({ host = 'hostinger-vps', base = 'http://127.0.0.1:3100/api' } = {}) {
  function curl(path) {
    return new Promise((resolve, reject) => {
      execFile('ssh', [host, `curl -s ${base}${path}`], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(err);
        try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
      });
    });
  }
  return {
    async listIssues(companyId) { return curl(`/companies/${companyId}/issues`); },
    async getComments(issueId) { return curl(`/issues/${issueId}/comments`); },
  };
}

async function collectExecutions({ companyId, transport }) {
  assertSafeId(companyId, 'companyId');
  const t = transport || sshTransport();
  const issues = await t.listIssues(companyId);
  const arr = Array.isArray(issues) ? issues : (issues.issues || issues.data || []);
  const out = [];
  for (const it of arr) {
    // Isolamento por issue: id ausente/inválido, falha de rede ou JSON quebrado
    // não derrubam a coleta inteira — registra aviso e segue com comments vazio.
    let comments = [];
    try {
      const raw = await t.getComments(assertSafeId(it.id, 'issueId'));
      comments = Array.isArray(raw) ? raw : [];
    } catch (e) {
      console.warn(`[mirror] aviso: falha ao coletar comentários de ${it.identifier || it.id || '(sem id)'}: ${e.message}`);
    }
    out.push({ id: it.id, parentId: it.parentId !== undefined ? it.parentId : null, identifier: it.identifier, title: it.title, comments });
  }
  return out;
}

module.exports = { collectExecutions, sshTransport, assertSafeId };
