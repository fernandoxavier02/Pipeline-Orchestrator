'use strict';
// Scoring por árvore de pipeline.
// Uma "árvore" é uma issue-raiz (que declara complexity via ORCHESTRATOR_DECISION)
// mais todos os seus descendentes diretos e indiretos — exceto sub-raízes, que formam
// árvores próprias e absorvem seus próprios descendentes.
//
// REGRA DE RAIZ RESPONSÁVEL:
//   Para cada execução, sobe por parentId no mapa até encontrar a ancestral mais
//   próxima com complexity !== null. Se essa ancestral for ela mesma → é raiz.
//   Se chegar a parentId nulo/ausente/fora-do-conjunto sem achar complexity → ÓRFÃ.
//   Proteção contra ciclo: limite de MAX_HOPS saltos.

const { parseBlocks, parseComplexity } = require('./mirror-fidelity-parser.cjs');
const { scoreExecution } = require('./mirror-fidelity-score.cjs');

const MAX_HOPS = 50;

function scoreTrees(executions) {
  // Mapa id → { exec, complexity, blocks }
  const map = new Map();
  for (const exec of executions || []) {
    const complexity = parseComplexity(exec.comments);
    const blocks = parseBlocks(exec.comments);
    map.set(exec.id, { exec, complexity, blocks });
  }

  // Para cada id, resolve qual raiz é responsável por ele.
  // Retorna { rootId } ou { orphan: true }.
  const rootCache = new Map();

  function resolveRoot(id) {
    if (rootCache.has(id)) return rootCache.get(id);

    const visited = new Set();
    let current = id;
    while (true) {
      if (visited.has(current)) {
        // Ciclo detectado: tudo que está no ciclo é órfão
        for (const v of visited) rootCache.set(v, { orphan: true });
        return { orphan: true };
      }
      if (visited.size > MAX_HOPS) {
        for (const v of visited) rootCache.set(v, { orphan: true });
        return { orphan: true };
      }
      visited.add(current);

      const entry = map.get(current);
      if (!entry) {
        // Saiu do conjunto sem achar complexity
        for (const v of visited) rootCache.set(v, { orphan: true });
        return { orphan: true };
      }

      if (entry.complexity !== null) {
        // Encontrou raiz responsável
        const result = { rootId: current };
        for (const v of visited) rootCache.set(v, result);
        return result;
      }

      const parentId = entry.exec.parentId;
      if (parentId === null || parentId === undefined) {
        // Sem mais ancestrais, sem complexity → órfão
        for (const v of visited) rootCache.set(v, { orphan: true });
        return { orphan: true };
      }
      current = parentId;
    }
  }

  // Agrupa execuções por raiz responsável
  const treeMembers = new Map(); // rootId → Set of ids
  const orphans = [];

  for (const [id] of map) {
    const resolution = resolveRoot(id);
    if (resolution.orphan) {
      orphans.push(id);
    } else {
      const { rootId } = resolution;
      if (!treeMembers.has(rootId)) treeMembers.set(rootId, new Set());
      treeMembers.get(rootId).add(id);
    }
  }

  // Constrói as rows de cada árvore
  const trees = [];
  for (const [rootId, memberIds] of treeMembers) {
    const rootEntry = map.get(rootId);
    const rootExec = rootEntry.exec;
    const complexity = rootEntry.complexity;

    // União de blocos de todos os membros
    const allBlocks = new Set();
    for (const memberId of memberIds) {
      for (const b of map.get(memberId).blocks) allBlocks.add(b);
    }

    const scored = scoreExecution({ blocks: [...allBlocks], complexity });
    trees.push({
      identifier: rootExec.identifier,
      complexity,
      memberCount: memberIds.size,
      ...scored,
    });
  }

  // Identifiers dos órfãos (para diagnóstico)
  const orphanIdentifiers = orphans.map((id) => {
    const entry = map.get(id);
    return entry ? entry.exec.identifier : id;
  });

  return { trees, orphanCount: orphans.length, orphanIdentifiers };
}

module.exports = { scoreTrees };
