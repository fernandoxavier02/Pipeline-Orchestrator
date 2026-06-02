---
description: "Despacha uma UX Simulation para os robôs do Paperclip (VPS). Classifica complexidade localmente, mostra a árvore em dry-run e pede confirmação antes de criar qualquer cartão."
allowed-tools: Bash, Read, AskUserQuestion
---

# Paperclip — UX Simulation

<background_information>
Este comando monta e despacha uma árvore de tarefas do tipo **UX Simulation** direto nos robôs do Paperclip rodando na VPS, via túnel SSH. O Claude só faz a montagem; a execução acontece nos agentes da empresa Pipeline Orchestrator no servidor remoto.

**Empresa fixa:** Pipeline Orchestrator (PIP) — `019c6f31-41ed-497a-93ba-cb4eff651a7c`
**Tipo fixo:** `UX Simulation`
**Variante (determinada pela complexidade):**
- `SIMPLES` → `ux.light`
- `MEDIA` → `ux.light`
- `COMPLEXA` → `ux.heavy`

**O que o fluxo faz:** simula jornadas de usuário e produz relatórios de experiência — sem escrita de código de produção (report-only). No fluxo light, o `ux-simulator` roda sozinho e entrega para o `ux-qa-validator`. No fluxo heavy, `ux-simulator` e `ux-accessibility-auditor` rodam **em paralelo** (mesmo contexto de tarefa, saídas independentes), convergindo ambos na junção `ux-qa-validator` — que só abre quando os dois irmãos concluem. Após a validação, o `final-validator` emite o Pa de Cal e o `finishing-branch` fecha o ciclo com os relatórios técnico e executivo.

**Como acompanhar após o despacho:** abra o painel do Paperclip em `http://127.0.0.1:3100` (requer túnel `ssh hostinger-vps -L 3100:127.0.0.1:3100` ativo). Os cartões aparecem na fila de cada cargo assim que criados.

**Módulos usados (puros, sem I/O de rede):**
- `references/paperclip/spec/lib/classify-bridge.cjs` — classifica tipo + complexidade por heurística de palavras-chave
- `references/paperclip/spec/lib/grow-tree.cjs` — CLI que cria issues na VPS via API loopback (`PAPERCLIP_API_URL` padrão `http://127.0.0.1:3100`)
</background_information>

<instructions>

## Passo 0 — Validar argumento

Se `<arguments>` estiver vazio ou ausente, mostre a mensagem abaixo e **pare** — não classifique nem crie nada:

```
Uso: /pipeline-orchestrator:paperclip-ux <descrição da jornada ou tela a simular>
Exemplo: /pipeline-orchestrator:paperclip-ux "fluxo de onboarding do usuário novo no mobile"

Flags de override de complexidade (opcionais):
  --simples   força variante light (SIMPLES)
  --media     força variante light (MEDIA)
  --complexa  força variante heavy (COMPLEXA) — paralelo ux-simulator ‖ ux-accessibility-auditor
```

---

## Passo 1 — Classificar complexidade localmente

O tipo já é fixo (`UX Simulation`). O que falta é a **complexidade**, que determina se vai para o fluxo `light` (SIMPLES ou MEDIA) ou `heavy` (COMPLEXA).

**Detectar override na linha de comando:**
- `--simples` → `{ complexity: 'SIMPLES' }`
- `--media`   → `{ complexity: 'MEDIA' }`
- `--complexa` → `{ complexity: 'COMPLEXA' }`

Se não houver override, rodar a heurística:

```bash
node -e "
const { classify } = require('./references/paperclip/spec/lib/classify-bridge.cjs');
const desc = process.argv[1];
const result = classify(desc, { type: 'UX Simulation' });
console.log(JSON.stringify(result, null, 2));
" -- "<descrição da simulação sem flags>"
```

Resultado esperado: `{ type: 'UX Simulation', complexity: 'SIMPLES'|'MEDIA'|'COMPLEXA', source: '...', notes: [...] }`

**Mapeamento para variante grow-tree:**
- `SIMPLES` → argumento `ux.light`
- `MEDIA`   → argumento `ux.light`
- `COMPLEXA` → argumento `ux.heavy`

Se a classificação automática parecer errada para a descrição fornecida, pergunte ao usuário antes de continuar:

```
AskUserQuestion
  header: "Complexidade"
  options:
    - label: "SIMPLES — light (Recomendado pelo classificador)"
      description: "1-2 jornadas, tela única, sem acessibilidade dedicada — ux-simulator roda sozinho"
    - label: "MEDIA — light"
      description: "3-5 jornadas, fluxo moderado, acessibilidade checada inline pelo simulador"
    - label: "COMPLEXA — heavy"
      description: "6+ jornadas, múltiplas personas, auditoria de acessibilidade em paralelo com a simulação"
```

---

## Passo 2 — Dry-run: mostrar o que seria criado

**GUARD DE SEGURANÇA — OBRIGATÓRIO:** nunca criar cartões na VPS sem confirmação explícita do usuário.

Rodar grow-tree **sem** `--confirm` para ver o primeiro nó que seria criado:

```bash
node references/paperclip/spec/lib/grow-tree.cjs \
  019c6f31-41ed-497a-93ba-cb4eff651a7c \
  ux.light
```

_(Substitua `ux.light` por `ux.heavy` se COMPLEXA.)_

O dry-run retorna JSON com `{ step, title, nextStep }` — sem POST algum na API.

Apresente ao usuário em linguagem simples:
- Qual é a variante escolhida (light ou heavy)
- O nome do primeiro cartão que seria criado
- Quantos cartões o fluxo tem no total (light ≈ 11 issues, heavy ≈ 17 issues — incluindo o par paralelo ux-simulator ‖ ux-accessibility-auditor no heavy)
- Que no fluxo heavy os cartões de simulação e acessibilidade rodam em paralelo, convergindo no validador
- Que a execução acontecerá nos robôs do Paperclip, não no Claude

---

## Passo 3 — Pedir confirmação explícita

```
AskUserQuestion
  header: "Criar árvore?"
  options:
    - label: "Criar no Paperclip"
      description: "Dispara o primeiro cartão agora; os robôs criam os seguintes em cascata"
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
  ux.light \
  --confirm
```

O grow-tree faz `GET /api/companies/<id>/agents` para resolver o roster de cargos e `POST /api/issues` para criar o primeiro cartão. Retorna JSON com `{ step, issueId, title, nextStep }`.

**Informe ao usuário:**
- O ID do cartão criado (campo `issueId` do JSON)
- O cargo responsável pelo primeiro passo
- Como acompanhar: painel em `http://127.0.0.1:3100` — os cartões seguintes aparecem automaticamente conforme cada robô conclui a sua etapa
- No heavy: os cartões de `ux-simulator` e `ux-accessibility-auditor` serão criados como irmãos (sem trava entre si) e o cartão de `ux-qa-validator` só desbloqueará quando ambos concluírem
- Que a execução está 100% nos robôs; o Claude não precisa monitorar

---

## Notas operacionais

- O túnel SSH (`ssh hostinger-vps -L 3100:127.0.0.1:3100`) deve estar ativo antes do Passo 4. Se o grow-tree falhar com erro de conexão, peça ao usuário para verificar o túnel.
- O Paperclip orquestra a fila de dominó: cada robô que conclui cria o cartão seguinte via `blockedByIssueIds`. O fluxo light tem ~11 cartões e o heavy ~17 — nenhum precisa de intervenção manual entre os passos.
- UX Simulation é **report-only**: não há escrita de código de produção, portanto os ciclos de TDD e adversarial de código são suprimidos por design. O teto de fidelidade do light é ~50% por conta dessa supressão estrutural — isso é esperado, não é falha.
- Flags `--grill`, `--plan`, `--no-plan` não têm efeito neste comando e devem ser ignoradas silenciosamente.

</instructions>
