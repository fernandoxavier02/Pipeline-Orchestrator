---
description: "Despacha um Review-Only para os robôs do Paperclip (VPS). Modo standalone de revisão adversarial final sobre mudanças já escritas — sem correções, sem planejamento, sem TDD. Mostra a árvore em dry-run e pede confirmação antes de criar qualquer cartão."
allowed-tools: Bash, Read, AskUserQuestion
---

# Paperclip — Review-Only

<background_information>
Este comando monta e despacha uma árvore de tarefas do modo **Review-Only** direto nos robôs do Paperclip rodando na VPS, via túnel SSH. O Claude só faz a montagem; a execução acontece nos agentes da empresa Pipeline Orchestrator no servidor remoto.

**Empresa fixa:** Pipeline Orchestrator (PIP) — `019c6f31-41ed-497a-93ba-cb4eff651a7c`
**Modo fixo:** `review-only` — revisão adversarial standalone de código já escrito
**Variante:** não existe — o modo tem apenas uma configuração (4 nós exatos, sem `.light/.heavy`)

**O que o fluxo faz:**
1. `pipeline-controller` detecta o diff (arquivos modificados via `git diff --name-only`)
2. `adversarial-review-coordinator` coordena os 3 scanners em paralelo (segurança, arquitetura, qualidade) — sem contexto de implementação, revisão zero-bias
3. `final-adversarial-orchestrator` consolida os achados e emite o veredicto final
4. `finishing-branch` fecha com relatório completo — **sem correções**, sem commit, sem push; o usuário decide o que fazer com os achados

**Importante:** este modo não emite Pa de Cal formal (GO/NO-GO). O resultado é um relatório de achados adversariais. É report-only por design.

**Como acompanhar após o despacho:** abra o painel do Paperclip em `http://127.0.0.1:3100` (requer túnel `ssh hostinger-vps -L 3100:127.0.0.1:3100` ativo). Os cartões aparecem na fila de cada cargo assim que criados.

**Módulos usados (puros, sem I/O de rede):**
- `references/paperclip/spec/lib/grow-tree.cjs` — CLI que cria issues na VPS via API loopback (`PAPERCLIP_API_URL` padrão `http://127.0.0.1:3100`)

_(Nota: `classify-bridge.cjs` não é usado neste modo — não há classificação de complexidade; o molde é fixo.)_
</background_information>

<instructions>

## Passo 0 — Validar argumento

Este modo não exige uma descrição longa — o diff é detectado automaticamente pelos robôs. Mas o comando pode receber um título opcional para identificar a revisão no painel.

Se `<arguments>` estiver ausente, use o título padrão `"Revisão adversarial de mudanças pendentes"`.

Se `<arguments>` contiver flags inválidas (ver **Notas operacionais**), ignorá-las silenciosamente e continuar com o título padrão.

Não há override de complexidade neste modo — ele é sempre fixo.

---

## Passo 1 — (Pulado) Sem classificação de complexidade

O modo Review-Only não tem variante light/heavy. O molde é fixo: chave `review-only` no catálogo, **4 nós exatos** (RO-N0 a RO-N3).

Não há `classify-bridge.cjs` neste modo. Não há AskUserQuestion de complexidade. Passar direto para o Passo 2.

---

## Passo 2 — Dry-run: mostrar o que seria criado

**GUARD DE SEGURANÇA — OBRIGATÓRIO:** nunca criar cartões na VPS sem confirmação explícita do usuário.

Rodar grow-tree **sem** `--confirm` para ver o primeiro nó que seria criado:

```bash
node references/paperclip/spec/lib/grow-tree.cjs \
  019c6f31-41ed-497a-93ba-cb4eff651a7c \
  review-only
```

O dry-run retorna JSON com `{ step, title, nextStep }` — sem POST algum na API.

Apresente ao usuário em linguagem simples:
- Que o modo é fixo: revisão adversarial standalone, sem light/heavy
- O nome do primeiro cartão que seria criado
- Que o fluxo tem **4 cartões no total** (pipeline-controller detecta diff → adversarial-review-coordinator → final-adversarial-orchestrator → finishing-branch)
- Que **não haverá correções** — o resultado é um relatório de achados; o usuário decide o que fazer depois
- Que a execução acontecerá nos robôs do Paperclip, não no Claude

---

## Passo 3 — Pedir confirmação explícita

```
AskUserQuestion
  header: "Criar revisão?"
  options:
    - label: "Criar no Paperclip"
      description: "Dispara a revisão adversarial agora; os robôs produzem o relatório de achados"
    - label: "Cancelar"
      description: "Nada será criado — você pode rodar o comando novamente com ajustes"
```

Se o usuário cancelar, encerre sem criar nada. Não tente alternativas.

---

## Passo 4 — Criar a raiz da árvore com --confirm

Somente após confirmação explícita no Passo 3:

```bash
node references/paperclip/spec/lib/grow-tree.cjs \
  019c6f31-41ed-497a-93ba-cb4eff651a7c \
  review-only \
  --confirm
```

O grow-tree faz `GET /api/companies/<id>/agents` para resolver o roster de cargos e `POST /api/issues` para criar o primeiro cartão. Retorna JSON com `{ step, issueId, title, nextStep }`.

**Informe ao usuário:**
- O ID do cartão criado (campo `issueId` do JSON)
- O cargo responsável pelo primeiro passo (`pipeline-controller` — detecta o diff)
- Como acompanhar: painel em `http://127.0.0.1:3100` — os cartões seguintes aparecem automaticamente conforme cada robô conclui a sua etapa
- Que ao final o relatório de achados estará nos comentários do cartão `finishing-branch` — **sem correções automáticas**
- Que a execução está 100% nos robôs; o Claude não precisa monitorar

---

## Notas operacionais

- O túnel SSH (`ssh hostinger-vps -L 3100:127.0.0.1:3100`) deve estar ativo antes do Passo 4. Se o grow-tree falhar com erro de conexão, peça ao usuário para verificar o túnel.
- O Paperclip orquestra a fila de dominó: cada robô que conclui cria o cartão seguinte via `blockedByIssueIds`. O fluxo Review-Only tem exatamente 4 cartões — nenhum precisa de intervenção manual entre os passos.
- Flags `--simples`, `--media`, `--complexa`, `--grill`, `--plan`, `--no-plan`, `--hotfix` não têm efeito neste comando e devem ser ignoradas silenciosamente.
- Este modo não emite `ORCHESTRATOR_DECISION` (Phase 0 é pulada por design). A régua de fidelidade retorna `complexity=null` e `indeterminate=true` para execuções Review-Only — isso é esperado (score = N/A, não uma falha).

</instructions>
