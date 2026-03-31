#!/usr/bin/env node
/**
 * Hook 6: completion-checklist.cjs
 * Event: Stop
 *
 * Quando o agente tenta parar, verifica se os requisitos minimos
 * foram atendidos conforme as regras do projeto:
 *   - .kiro/steering/golden-rule.md (17 regras inegociaveis — PRIMARIO)
 *   - .kiro/steering/authority-map.md (SSOT por dominio)
 *   - .claude/rules/00-core.md (ORCHESTRATOR_DECISION)
 *   - .claude/rules/20-quality.md (build obrigatorio)
 *   - .claude/rules/37-impl-flow.md (TDD)
 *
 * v2.0 (2026-02-12): Adiciona verificacao de Coverage Gate para specs de auditoria
 */

const fs = require('fs');
const path = require('path');

/**
 * Detecta se alguma spec com audit_source existe no projeto.
 * Retorna lista de specs de auditoria encontradas.
 */
function findAuditSourcedSpecs() {
  const specsDir = path.join(process.cwd(), '.kiro', 'specs');
  const found = [];
  try {
    if (!fs.existsSync(specsDir)) return found;
    const dirs = fs.readdirSync(specsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const specJsonPath = path.join(specsDir, dir.name, 'spec.json');
      try {
        if (!fs.existsSync(specJsonPath)) continue;
        const specJson = JSON.parse(fs.readFileSync(specJsonPath, 'utf8'));
        // Only flag specs that are not yet closed/completed and have audit_source
        if (specJson.audit_source && specJson.phase !== 'closed') {
          found.push({
            name: dir.name,
            audit_source: specJson.audit_source,
            phase: specJson.phase || 'unknown'
          });
        }
      } catch { /* ignore parse errors */ }
    }
  } catch { /* ignore fs errors */ }
  return found;
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const contextParts = [
      '## Checklist de Conclusao (auto-injetado)',
      'Fontes: .kiro/steering/golden-rule.md + authority-map.md + .claude/rules/00-core.md + 20-quality.md + 37-impl-flow.md',
      '',
      '### Regras Inegociaveis (.kiro/steering/golden-rule.md)',
      '- [ ] Regra 1: Spec → Design → Tasks antes de codigo?',
      '- [ ] Regra 2: Evidencia acima de suposicao?',
      '- [ ] Regra 3: Mudanca minima, diff minimo?',
      '- [ ] Regra 5: SSOT — regras criticas no backend?',
      '- [ ] Regra 10: Build obrigatorio, max 2 tentativas?',
      '- [ ] Regra 15: Nao-Invencao — lacunas preenchidas sem perguntar?',
      '- [ ] Regra 16: Execucao Nao-Assumptiva — so o que foi pedido?',
      '',
      '### Pipeline (.claude/rules/00-core.md)',
      '- [ ] ORCHESTRATOR_DECISION emitido no inicio?',
      '- [ ] Persona correta seguida? (.kiro/agent-roles/AGENT_*.md)',
      '',
      '### Qualidade (.claude/rules/20-quality.md + 37-impl-flow.md)',
      '- [ ] Validacao executada? `python -m compileall OBZ/bpo-pricing-platform/app`',
      '- [ ] Testes executados (se existirem)? `python -m unittest discover OBZ/bpo-pricing-platform/tests`',
      '- [ ] Testes passaram? TDD RED->GREEN se implementou codigo',
      '- [ ] Sem regressoes? Suite de regressao do CHECKPOINT passa',
      '',
      '### SSOT (.kiro/steering/authority-map.md)',
      '- [ ] Dominio tocado tem SSOT unica? (recusa se 2 fontes detectadas)',
    ];

    // v2.0: Check for audit-sourced specs
    const auditSpecs = findAuditSourcedSpecs();
    if (auditSpecs.length > 0) {
      contextParts.push('');
      contextParts.push('### Coverage Gate — Specs de Auditoria (OBRIGATORIO)');
      contextParts.push(`Specs de auditoria detectadas: ${auditSpecs.map(s => s.name).join(', ')}`);
      contextParts.push('');
      for (const spec of auditSpecs) {
        contextParts.push(`**${spec.name}** (fase: ${spec.phase}, audit: ${spec.audit_source})`);
      }
      contextParts.push('');
      contextParts.push('- [ ] Coverage Gate emitido? (tabela gap→AC→task, TODOS os gaps cobertos)');
      contextParts.push('- [ ] Priority Consistency? (gap P0 nunca em slice P2)');
      contextParts.push('- [ ] /kiro:validate-spec rodado? (12 eixos de conteudo, alem do Spec Gate de formato)');
      contextParts.push('');
      contextParts.push('Se qualquer item acima NAO foi cumprido, complete antes de finalizar.');
      contextParts.push('Ref: memory/spec-from-audit-checklist.md');
    }

    // v3.0: Pipeline phase enforcement (always inject — approach B)
    contextParts.push('');
    contextParts.push('### Pipeline Orchestrator — Fases Obrigatorias');
    contextParts.push('Se /pipeline foi invocado nesta sessao, TODAS as fases devem ter sido executadas:');
    contextParts.push('- [ ] Phase 0: task-orchestrator spawnado (CLASSIFICATION emitida)?');
    contextParts.push('- [ ] Phase 0: information-gate spawnado (INFORMATION_GATE emitida)?');
    contextParts.push('- [ ] Phase 1: PIPELINE PROPOSAL apresentado e usuario confirmou?');
    contextParts.push('- [ ] Phase 2: executor-controller spawnado com batch execution?');
    contextParts.push('- [ ] Phase 2: checkpoint-validator rodou (build + test)?');
    contextParts.push('- [ ] Phase 3: sanity-checker spawnado com evidencia de comando + output?');
    contextParts.push('- [ ] Phase 3: final-validator (Pa de Cal) emitiu GO/CONDITIONAL/NO-GO?');
    contextParts.push('- [ ] Phase 3: finishing-branch apresentou opcoes de closeout?');
    contextParts.push('- [ ] Gate decisions logadas em gate-decisions.jsonl?');
    contextParts.push('- [ ] Phase transition summaries emitidos entre cada fase?');
    contextParts.push('');
    contextParts.push('Se /pipeline NAO foi invocado, ignore esta secao.');
    contextParts.push('Se alguma fase foi pulada, PARE e complete antes de finalizar.');

    contextParts.push('');
    contextParts.push('Se algum item nao foi cumprido, considere completar antes de finalizar.');
    contextParts.push('Se build falhou 2x: PARAR e analisar causa raiz (Stop Rule).');

    console.log(JSON.stringify({
      continue: true,
      additionalContext: contextParts.join('\n')
    }));

  } catch (e) {
    console.log(JSON.stringify({ continue: true }));
  }
});
