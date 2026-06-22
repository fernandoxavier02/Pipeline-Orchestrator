# Live-Probe — Enforcement default-ON (v8.11.0 work)

> Roteiro curto pra confirmar, numa sessão autenticada (`ANTHROPIC_API_KEY` presente), que os 5 enforcements
> ligados por padrão se comportam como esperado e — o mais importante — **não travam um run que termina normal**.
> Regra de honestidade: cole a saída real ao lado de cada passo; nada é "aprovado" só pela prosa.

Rode tudo a partir de `claude-code/Pipeline-Orchestrator`.

## 0. Pré-condições

```bash
cd claude-code/Pipeline-Orchestrator
claude --version                       # 2.1.183 (ou mais novo)
echo "${ANTHROPIC_API_KEY:+present}"   # PRECISA imprimir: present  (se vazio, pare — nada roda)
claude plugin validate . --strict      # ✔ Validation passed
```

## 1. Os hooks registram (sanidade)

Dentro de uma sessão `claude --plugin-dir .`, rode `/hooks` e confira que aparecem:
- `stop-gate-hook.cjs` em **Stop**, **SessionEnd**, **StopFailure**
- `subagent-stop-commit-hook.cjs` em **SubagentStop**
- `machine-evidence-hook.cjs` em **PostToolUse** (Bash|PowerShell)
- `step-ledger-stamp.cjs` em **PostToolUse** (Agent)

**PASS:** todos aparecem. **FAIL:** algum sumiu → registro quebrado.

## 2. Um run NORMAL chega ao fim e NÃO trava (o risco nº 1 do default-on)

```bash
claude --plugin-dir . --debug hooks -p "/pipeline-orchestrator:pipeline fix a trivial typo in the README"
```

**PASS:** o run conclui e a sessão **encerra sozinha**, sem ficar presa pedindo "retome ou aborte". Isso prova que
ligar as travas por padrão NÃO deadlocka quem terminou (B1 marca `completed`; o subagent-stop e o stop-block não
barram um fluxo legítimo). **FAIL:** a sessão fica presa num loop de bloqueio no encerramento → relate a mensagem.

## 3. Inspecionar o que o run gravou (prova de B1, B2, B3)

```bash
node -e "const fs=require('fs'),p=require('path');const base='.pipeline/docs';function walk(d){let r=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory())r=r.concat(walk(f));else if(e.name==='sentinel-state.json')r.push(f);}return r;}const st=walk(base).map(f=>({f,m:fs.statSync(f).mtimeMs})).sort((a,b)=>b.m-a.m);if(!st.length){console.log('nenhum run');process.exit(0);}const dir=p.dirname(st[0].f);const s=JSON.parse(fs.readFileSync(st[0].f,'utf8'));console.log('RUN:',dir);console.log('terminal_state =',s.terminal_state||s.status||'(nenhum)');console.log('last_checkpoint_verdict =',s.last_checkpoint_verdict||'(nenhum)');const c=fs.readdirSync(dir).filter(x=>x.includes('.consumed'));console.log('verdict consumidos (consume-once) =',c.length?c.join(', '):'(nenhum)');"
```

**PASS:** `terminal_state = completed` (B1 funcionou). Se o run rodou testes num checkpoint,
`last_checkpoint_verdict` mostra `pass`/`fail` derivado do resultado real (B2). Se houve veredito de etapa,
aparece um arquivo `…consumed…` (B3). **FAIL:** `terminal_state` vazio num run que fechou bem (B1 não marcou).

## 4. (Opcional) Um run INCOMPLETO é barrado, sem deadlock (B5)

```bash
claude --plugin-dir . --debug hooks -p "/pipeline-orchestrator:pipeline implement a small feature"
# interrompa DE PROPÓSITO antes do fim (corte no meio de um batch) e tente encerrar.
```

**PASS:** o encerramento é **bloqueado** com uma mensagem concreta ("retome ou aborte explicitamente"); ao insistir,
após no máximo 3 tentativas o run vira `hard_failed` e **libera** (sem travar pra sempre). **FAIL:** nunca bloqueia
(a trava não pegou) OU bloqueia infinitamente (deadlock).

## 5. (Opcional) Fechar-com-verde nega fechamento vermelho (B2)

```bash
PIPELINE_REQUIRE_GREEN_CLOSE=true claude --plugin-dir . --debug hooks -p "/pipeline-orchestrator:pipeline fix a real bug with tests"
# deixe um teste vermelho no checkpoint final.
```

**PASS:** com a exigência ligada, o fechamento é negado enquanto o último checkpoint não estiver verde.
**FAIL:** fecha mesmo com teste vermelho.

---

**O que me reportar:** a saída dos passos 0, 2 e 3 (essenciais). Os passos 4 e 5 são bônus se você quiser ver as
travas mordendo. Se algo der FAIL, cole a mensagem — eu ajusto antes de preparar a publicação.
