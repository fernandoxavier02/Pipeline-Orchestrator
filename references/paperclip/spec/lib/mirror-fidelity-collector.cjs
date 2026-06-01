'use strict';
const { execFile } = require('node:child_process');

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
  const t = transport || sshTransport();
  const issues = await t.listIssues(companyId);
  const arr = Array.isArray(issues) ? issues : (issues.issues || issues.data || []);
  const out = [];
  for (const it of arr) {
    const comments = await t.getComments(it.id);
    out.push({ id: it.id, identifier: it.identifier, title: it.title, comments: Array.isArray(comments) ? comments : [] });
  }
  return out;
}

module.exports = { collectExecutions, sshTransport };
