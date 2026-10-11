#!/usr/bin/env node
'use strict';
// Local mock of the System One decision-model contract, for preclassify.test.cjs.
// argv: <modeFile> <countFile>. Prints the bound port on stdout. No network beyond 127.0.0.1.
const http = require('http');
const fs = require('fs');
const [modeFile, countFile] = process.argv.slice(2);
const PICK = {
  normal: { tt: 'bugfix', tc: 0.92, cx: 'media', cc: 0.88, np: 0.95 },
  low: { tt: 'bugfix', tc: 0.55, cx: 'media', cc: 0.9, np: 0.95 },
};
http.createServer((req, res) => {
  fs.writeFileSync(countFile, String(Number(fs.readFileSync(countFile, 'utf8')) + 1));
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const mode = fs.readFileSync(modeFile, 'utf8').trim();
    if (mode === 'http529') { res.writeHead(529); res.end('overloaded'); return; }
    const pick = PICK[mode] || PICK.normal;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      model: 'jev-mock', usage: { input_tokens: 123, output_tokens: 0 },
      answers: {
        needs_pipeline: { type: 'noul', noul: pick.np },
        task_type: { type: 'choice', choice: pick.tt, probabilities: { [pick.tt]: pick.tc }, confidence: pick.tc },
        complexity: { type: 'choice', choice: pick.cx, probabilities: { [pick.cx]: pick.cc }, confidence: pick.cc },
      },
    }));
  });
}).listen(0, '127.0.0.1', function onListen() { process.stdout.write(String(this.address().port) + '\n'); });
