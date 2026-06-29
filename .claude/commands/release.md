---
description: Full deploy canônico do Pipeline-Orchestrator nos 4 canais (GitHub + cache global + NPM + marketplace) com bump lockstep e verificação de evidência.
argument-hint: <nova-versão> (ex: 8.18.3) — SemVer sem o "v"
---

# /release — Release completo nos 4 canais

Você vai publicar a versão **$1** do Pipeline-Orchestrator. Se `$1` estiver vazio, **PARE** e pergunte a versão (via AskUserQuestion) antes de tocar em qualquer coisa — nunca invente o número.

Convenções fixas deste projeto (não inventar):
- Repo de código (canônico): `D:\pipeline-orchestrator-claude\claude-code\Pipeline-Orchestrator`, remote `fernandoxavier02/Pipeline-Orchestrator`, branch `main`. Releases vão direto na `main` (é a convenção; não criar branch).
- Cache global do Claude Code: `~/.claude/plugins/cache/FX-Studio-AI/pipeline-orchestrator/<versão>/` (o "FX-Studio-AI" tem S maiúsculo).
- Ponteiro do que o CC carrega: `~/.claude/plugins/installed_plugins.json`, chave `pipeline-orchestrator@FX-Studio-AI`.
- Pacote NPM: `@fx-studio-ai/pipeline-orchestrator` (publishConfig.access = restricted).
- Marketplace real (repo SEPARADO): clone em `~/.claude/plugins/marketplaces/FX-Studio-AI`, remote `fernandoxavier02/FX-Studio-AI`. **Esse** é o que o CC instala — o `.claude-plugin/marketplace.json` dentro do repo de código NÃO é lido pelo CC (só serve ao teste F7). O marketplace **não tem `autoUpdate`**, por isso o cache global precisa do passo manual do Canal 2.

Regra de ouro: pular o **Canal 2 (cache global)** é o erro histórico que deixa o CC rodando a versão velha em todo terminal. Nunca pule.

---

## Passo 0 — Bump lockstep (no repo de código) + suíte

Descubra a versão **anterior** lendo a versão atual em `package.json` antes de mudar nada (vira o `PREV_VERSION` do teste F7).

Atualize **todas** estas superfícies para `$1` (o teste `tests/regression/v7.1.0/F7_version_sync.cjs` valida 8 delas; os pins-espelho também travam a versão — bumpe os três testes):

1. `.claude-plugin/plugin.json` → `version`
2. `.claude-plugin/marketplace.json` → `version` **e** `source.ref` (`v$1`)
3. `.cursor-plugin/plugin.json` → `version`
4. `package.json` → `version` **e** o sufixo `vX.Y.Z.` na `description`
5. `lib/index.cjs` → `version: '$1'`
6. `hooks/hooks.json` → banner `Pipeline Orchestrator v$1 loaded`
7. `README.md` → badge `version-$1-`
8. `CLAUDE.md` → linha `Atualmente: **$1** (...)` (descreva a mudança; mova a anterior para `Anterior:`) + nova linha no topo da tabela "Versão deste arquivo"
9. `CHANGELOG.md` → nova entrada `## [$1] - <data>` no topo
10. `tests/regression/v7.1.0/F7_version_sync.cjs` → `VERSION='$1'` e `PREV_VERSION=<anterior>`
11. `tests/regression/v8.5.0/F6-registration-lockstep.test.cjs` → `VERSION = '$1'`
12. `tests/regression/v8.8.0/F01_refactor_slice1.cjs` → `PINNED_VERSION = '$1'`

**NÃO** toque em `.claude/hooks/enforcement-surface-verify-hook.cjs` — os números de versão lá são comentários de proveniência histórica (ARCH-001/002); mudá-los falsearia o histórico.

Rode `node scripts/run-tests.cjs` e rode `node tests/regression/v7.1.0/F7_version_sync.cjs`. O F7 deve passar 8/8. A suíte deve ficar no **baseline conhecido** (hoje: 5 falhas pré-existentes — 3 Langfuse + score-writer + F4 dispatch-pending-gate herdado da v8.18.0). Se aparecer falha NOVA fora desse baseline, **PARE e investigue** — não prossiga com o deploy.

---

## Canal 1 — GitHub canônico

```
git add -A
git commit -F-   # mensagem release(v$1): <resumo>; corpo descrevendo o fix + "Suite NNN/baseline. Lockstep."
git tag v$1
git push origin main
git push origin v$1
```
Termine a mensagem do commit com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Canal 2 — Cache global (o passo sempre esquecido)

Instale a árvore limpa da tag no cache e aponte o ponteiro. Use `git archive` (não copia `.git` nem lixo de runtime) + copie o `node_modules` vendorizado (langfuse/langfuse-core/mustache):

```
DEST=~/.claude/plugins/cache/FX-Studio-AI/pipeline-orchestrator/$1
mkdir -p "$DEST"
git archive v$1 | tar -x -C "$DEST"
cp -r node_modules "$DEST"/
```
Depois edite `~/.claude/plugins/installed_plugins.json` (faça backup antes): na entrada `pipeline-orchestrator@FX-Studio-AI`, atualize `installPath` (→ ...\$1), `version` (→ $1), `lastUpdated` (ISO agora) e `gitCommitSha` (sha completo de `git rev-parse v$1`). Edite o JSON via `node` (parse → set → stringify 2), nunca por substituição cega de texto.

Verifique no cache: `grep version` em plugin.json/lib/index.cjs/hooks.json e que o hook corrigido esteja presente.

## Canal 3 — NPM

```
npm whoami      # deve ser fx-studio-ai
npm publish --ignore-scripts
```
Use `--ignore-scripts` porque o `prepublishOnly` roda a suíte inteira e ela tem falhas de baseline pré-existentes (Langfuse/env + F4) que abortariam o publish. Você JÁ rodou a suíte no Passo 0 e confirmou que não há regressão nova — por isso é seguro pular o hook aqui. Se o baseline já estivesse 100% verde, publique sem a flag.

## Canal 4 — Marketplace (repo separado, público)

No clone `~/.claude/plugins/marketplaces/FX-Studio-AI`, edite `.claude-plugin/marketplace.json` (via `node`): na entrada `pipeline-orchestrator`, `version` → $1 e `source.ref` → `v$1`. Confira `git diff` (deve ser só version + ref). Depois:
```
git -C ~/.claude/plugins/marketplaces/FX-Studio-AI add .claude-plugin/marketplace.json
git -C ~/.claude/plugins/marketplaces/FX-Studio-AI commit -m "pipeline-orchestrator v$1 (<resumo>)"
git -C ~/.claude/plugins/marketplaces/FX-Studio-AI push origin HEAD
```

---

## Verificação de evidência (não pular)

- **GitHub:** `git ls-remote --tags origin v$1` retorna o sha.
- **Cache:** `installed_plugins.json` mostra `version: $1` e `installPath` terminando em `$1`.
- **NPM:** `npm view @fx-studio-ai/pipeline-orchestrator version` retorna `$1`.
- **Marketplace:** o push do Canal 4 confirmou; `git -C <clone> log -1` mostra o commit `v$1`.

## Segurança

Push ao GitHub, `npm publish` e push ao marketplace são ações públicas/irreversíveis — se o ambiente pedir confirmação, confirme no momento. Nunca commite segredos. O deploy não exige rodar o `/pipeline` instalado (e nem deveria, para não esbarrar em enforcement de versão antiga durante o próprio release).
