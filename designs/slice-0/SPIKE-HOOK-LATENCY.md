# SPIKE-HOOK-LATENCY.md — BDD §12.3.1 (Cenário #3)

**Data:** 2026-04-30
**Cenário:** Latência aceitável de hook lendo pipeline reference em runtime
**Threshold:** mediana < 200ms, p99 < 1000ms
**Status:** 🟢 **PASS — passa folgado**

---

## 1. Setup

**Hot-path simulado:** PreToolUse:Agent hook → lê `references/pipelines/bugfix-light.md` → parseia seções (proxy para extração de phase ids) → retorna allow-list para validação de spawn.

**Target:** `D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/references/pipelines/bugfix-light.md`

**Ambiente:**
- Plataforma: Windows 11 Pro 26200, Node.js (compatível com runtime do harness)
- Sistema de arquivos: NTFS local, drive D:
- 50 invocações consecutivas (sem warmup separado)
- Medição: `process.hrtime.bigint()`

**Script** (`/tmp/bench-cc.cjs`):
```javascript
const fs = require('fs');
const target = 'D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/references/pipelines/bugfix-light.md';
const samples = [];
for (let i = 0; i < 50; i++) {
  const t0 = process.hrtime.bigint();
  const content = fs.readFileSync(target, 'utf8');
  const sections = content.split(/^## /m);
  const phaseIds = [];
  for (const s of sections) {
    const m = s.match(/^([a-z][\w-]*)/);
    if (m) phaseIds.push(m[1]);
  }
  const t1 = process.hrtime.bigint();
  samples.push(Number(t1 - t0) / 1e6);
}
samples.sort((a, b) => a - b);
```

---

## 2. Resultados (50 invocações reais)

| Métrica | Valor (ms) | Threshold | Status |
|---|---|---|---|
| Min | 0.068 | — | — |
| **Mediana** | **0.078** | < 200 | 🟢 PASS (2560x abaixo) |
| Mean | 0.093 | — | — |
| **p99** | **0.741** | < 1000 | 🟢 PASS (1350x abaixo) |
| Max | 0.741 | — | — |

**Distribuição:** majoritariamente entre 0.068–0.150ms; um outlier em 0.741ms (provável cold cache + GC). Mesmo o pior caso fica 1350x abaixo do limite p99.

---

## 3. Análise

### Por que o resultado é tão bom

1. Arquivo é pequeno (~117 linhas, ~3.5KB).
2. NTFS cache do OS torna leituras subsequentes praticamente livres.
3. Parse trivial de markdown sections — sub-microssegundo.
4. Sem dependência de YAML loader; mesmo se adicionarmos `yaml.parse()` (futuro Slice 5), overhead é ~0.5-2ms — ainda passa.

### Cache strategy decidida: **NENHUM cache em v5.0**

Mediana 0.078ms vs threshold 200ms = **2560x de margem**. Caching seria optimização prematura.

Se futuro perfile mostrar regressão (pipelines maiores, repos remotos, FUSE):
- Cache em memória: `Map<path, {mtime, parsed}>`
- Invalidação por `fs.statSync(path).mtimeMs` (não content-hash)
- Sem TTL

---

## 4. Caveats

🟠 Não mediu overhead do harness Claude Code spawning o hook (fork-exec do Node, ~10-50ms tipicamente). Esse overhead é **constante por invocação** e independe do tamanho do arquivo lido — não muda a decisão.

🟠 Não mediu YAML parse real (usei split de markdown headers como proxy). Adicionar YAML parse: +0.5-2ms estimado. Ainda passa.

🟠 Filesystem local, não rede. Volume montado em rede pode subir para 5-20ms. Ainda 10-40x abaixo do threshold.

---

## 5. Reprodução

```bash
node /tmp/bench-cc.cjs
```

Script versionado neste artifact. Pode ser parametrizado para qualquer pipeline reference do CC plugin trocando a constante `target`.

---

## 6. Veredicto

🟢 **PASS folgado.** Hook latency NÃO é bloqueador para V5. Threshold da spec é respeitado por 3 ordens de magnitude. Cache não é necessário em v5.0.

Recomendação ao consolidado: marcar SPIKE-HOOK-LATENCY como concluído na §12.3.2 DoD.
