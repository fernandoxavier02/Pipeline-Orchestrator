# 06 — Plano de Portabilidade para Z-Code

> Plano reproduzível para portar o plugin Pipeline Orchestrator do harness Claude Code para o harness Z-Code. Cada passo é executável por qualquer engenheiro; os comandos são coláveis. Este plano assume que os outros seis documentos desta pasta já foram lidos.

## Veredicto

Portabilidade direta com três intervenções controladas: (um) criar o manifesto espelho para Z-Code; (dois) reescrever o manifesto de hooks migrando três eventos não suportados; (três) remover Paperclip e Langfuse. Tudo o mais é cópia de arquivos. Nenhuma lógica de negócio muda.

---

## TDD checklist (critérios verificáveis)

- [x] T1: as quatro decisões confirmadas estão refletidas com passos executáveis (migrar eventos, manifesto dual, remover Paperclip, remover Langfuse)
- [x] T2: cada passo tem comando colável ou instrução inequívoca
- [x] T3: o mapeamento de eventos (oito canônico → cinco eventos ativos no port, dos sete suportados pelo Z-Code) está completo
- [x] T4: as remoções (Paperclip e Langfuse) estão listadas arquivo por arquivo
- [x] T5: há smoke test final que valida o port carregou
- [x] T6: nenhum caminho de arquivo na prosa narrativa
- [x] T7: nenhum acrônimo sem expansão na primeira ocorrência

---

## Pré-requisitos

Antes de começar:

- Node.js versão dezoito ou superior instalado (as libs são CommonJS, "módulos Common JavaScript" — o sistema clássico de módulos do Node, com `require` e `module.exports`; extensão `.cjs`).
- Git instalado (para copiar o repositório preservando histórico).
- Acesso de leitura ao repositório canônico do Pipeline Orchestrator.
- Acesso de escrita a um diretório onde o port vai morar.
- Z-Code instalado e funcional na máquina de teste.

---

## Estrutura final do plugin portado

```
pipeline-orchestrator-zcode/
├── .claude-plugin/plugin.json      ← manifesto compat (intacto, para Claude Code/Cursor)
├── .zcode-plugin/plugin.json       ← manifesto espelho (mesmo nome/versão; campos extras Z-Code)
├── package.json
├── hooks/hooks.json                ← manifesto de hooks reescrito (5 eventos ativos no Z-Code)
├── .claude/hooks/                  ← 36 arquivos .cjs (35 hooks ativos + 1 lib compartilhada)
│                                   ← dos 36 hooks canônicos, 1 foi removido (langfuse-hook)
│                                   ← 2 mudaram de evento (subagent-stop-commit, corrective-error-signal)
├── agents/                         ← 50 agentes intactos (cópia direta)
├── commands/                       ← 4 comandos (sem os 10 paperclip + sem setup-paperclip)
├── lib/                            ← 36 libs (38 - 2 langfuse: client e carrier)
├── references/                     ← intacto (SSOT docs, cópia direta)
├── skills/                         ← skills por entry-point (cópia direta)
└── README-zcode.md                 ← novo, instruções de instalação no Z-Code
```

A contagem de scripts de hook merece explicação. O canônico tem trinta e seis hooks registrados no manifesto (trinta e sete arquivos na pasta, mas um deles é biblioteca compartilhada usada via require, não um hook). Após remover o langfuse-hook (um arquivo), a pasta tem trinta e seis arquivos: trinta e cinco hooks ativos mais a biblioteca compartilhada. Os dois hooks migrados de evento (subagent-stop-commit-hook e corrective-error-signal-gate) continuam existindo como arquivo, só mudam de evento no manifesto.

---

## Decisões confirmadas (resumo executivo)

Quatro decisões foram confirmadas com o dono do repositório. Cada uma tem seção dedicada abaixo com passos executáveis.

1. **Migrar três eventos não suportados** (`SessionEnd`, `StopFailure`, `SubagentStop`) para `Stop` e `PostToolUse`.
2. **Manifesto dual**: manter `.claude-plugin/plugin.json` intacto e adicionar `.zcode-plugin/plugin.json` espelho.
3. **Remover Paperclip**: dez comandos paperclip-* e o comando de setup saem do port.
4. **Remover Langfuse**: um hook e duas libs saem do port.

---

## Passo A — Preparar a árvore de destino

**Objetivo**: criar o diretório do port e copiar o canônico como baseline, **incluindo dotfiles e dot-directories** (essenciais: `.claude/hooks/`, `.claude-plugin/`, etc.).

```bash
# 1. Criar o diretório do port
mkdir -p /caminho/para/pipeline-orchestrator-zcode

# 2. Copiar o canônico INTEIRO incluindo dotfiles (a flag é importante)
#    Em bash, usar cp -a . para garantir dotfiles:
cp -a Pipeline-Orchestrator/. /caminho/para/pipeline-orchestrator-zcode/

# 3. Entrar no diretório do port
cd /caminho/para/pipeline-orchestrator-zcode

# 4. Remover artefatos do canônico que não pertencem ao port (state, worktrees, backups)
#    IMPORTANTE: NÃO remover .cursor-plugin/ e .codex/ — eles são manifestos espelho
#    do Cursor e OpenCode (byte-idênticos a .claude-plugin/ e .claude/hooks/),
#    necessários para a claim de 4 harnesses suportados.
rm -rf .pipeline .pipeline-orchestrator .pipeline-backup-* .remember .opencode .githubcopilot BPOPrincing*.bundle

# 5. Inicializar git (opcional, mas recomendado para versionar o port)
git init
git add .
git commit -m "feat: initial port from canonical Pipeline Orchestrator v8.20.0"
```

**Atenção ao passo 2**: o comando `cp -a` com a barra e o ponto finais copia o conteúdo incluindo arquivos ocultos (os chamados dotfiles, que começam com ponto). Usar a forma `cp -R <src>/* <dst>/` (sem o ponto) NÃO copia dotfiles — e nesse caso o diretório de hooks (que é oculto) ficaria de fora, quebrando todos os passos seguintes.

**Verificação**: listando o diretório do port com `ls -la`, você deve ver `agents/`, `commands/`, `hooks/`, `lib/`, `references/`, `.claude-plugin/`, `.claude/hooks/` (com os trinta e sete scripts), e os arquivos `package.json`, `README.md`, `CLAUDE.md`.

---

## Passo B — Aplicar remoções (Paperclip + Langfuse)

**Objetivo**: tirar tudo que não entra no port.

### B1 — Remover os dez comandos Paperclip

```bash
# Dentro do diretório do port
rm commands/paperclip-audit.md
rm commands/paperclip-bugfix.md
rm commands/paperclip-feature.md
rm commands/paperclip-hotfix.md
rm commands/paperclip-overview.md
rm commands/paperclip-refactor.md
rm commands/paperclip-review.md
rm commands/paperclip-spec.md
rm commands/paperclip-user-story.md
rm commands/paperclip-ux.md
rm commands/setup-paperclip.md
```

São onze arquivos no total: dez comandos paperclip-* mais o setup-paperclip.

### B2 — Remover as duas libs Langfuse

```bash
rm lib/langfuse-client.cjs
rm lib/langfuse-carrier.cjs
# NÃO remover lib/langfuse-sanitizer.cjs — ela é usada por score-writer para sanitização genérica
```

### B3 — Remover o hook Langfuse

```bash
rm .claude/hooks/langfuse-hook.cjs
```

### B4 — Limpar referências a Paperclip e Langfuse nos textos

Após a remoção física, é preciso limpar referências em markdown que citam esses componentes. Arquivos a editar (procurar e remover menções):

- O arquivo de ajuda de comandos — remover a seção sobre "Comandos que despacham pros robôs do servidor (Paperclip)" inteira (o título canônico exato é esse; procurar pela string "Paperclip").
- O arquivo do comando principal do pipeline — remover comentários que citam Langfuse como justificativa de telemetria.
- O README principal — remover a seção "Paperclip Runtime" e a seção "Observability · Langfuse" (é onde ficam as variáveis de ambiente LANGFUSE_PUBLIC_KEY e LANGFUSE_SECRET_KEY no canônico, não no CLAUDE.md).
- O CLAUDE.md — verificar e remover quaisquer menções a Paperclip ou Langfuse.

**Verificação**: rodar `grep -ri "paperclip" .` (excluindo node_modules e .git) deve retornar zero resultados. Para `grep -ri "langfuse" .`, o único resultado legítimo restante deve ser dentro do arquivo de sanitização (que permanece porque tem função genérica usada por outra lib).

### B5 — Remover os requires hard de Langfuse nos arquivos que permanecem

Este é o passo mais delicado da remoção de Langfuse. Dois arquivos que PERMANECEM no port têm requires top-level (não-guardados) das libs removidas. Sem este passo, o carregamento de cada hook de gate-decision e do hook de Stop quebra com MODULE_NOT_FOUND.

**Arquivo 1 — lib/gate-decision-writer.cjs**: na linha quarenta e três (aproximada), há um `require('./langfuse-carrier.cjs')` top-level. Também há na linha cento e oitenta e nove um `require('./langfuse-client.cjs')` dentro de uma função. Remover ambos, junto com qualquer código que use os símbolos importados (`readTraceCarrierForCurrentProcess`, etc.). Substituir por uma versão que retorna valores vazios ou undefined quando Langfuse não está presente — a função de escrita de gate não deve depender de telemetria para funcionar.

**Arquivo 2 — .claude/hooks/stop-hook.cjs**: na linha quarenta e cinco (aproximada), há um `require(path.join(PLUGIN_ROOT_STOP, 'lib', 'langfuse-carrier.cjs'))` top-level. Remover o require e qualquer código subsequente que use `carrierLib`. Esse hook escreve uma linha de resumo no log de run; a parte de telemetria era complementar, não essencial.

**Abordagem segura**: em vez de remover o código cegamente, encapsular os pontos de telemetria em try-catch com fail-open. Exemplo:

```javascript
// ANTES (quebra após remover langfuse-carrier)
const { readTraceCarrierForCurrentProcess } = require('./langfuse-carrier.cjs');

// DEPOIS (fail-open se Langfuse foi removido no port)
let readTraceCarrierForCurrentProcess = () => null;
try {
  if (process.env.PIPELINE_LANGFUSE_ENABLED === 'true') {
    readTraceCarrierForCurrentProcess = require('./langfuse-carrier.cjs').readTraceCarrierForCurrentProcess;
  }
} catch (e) {
  // Langfuse removido no port — telemetria desligada, funcionalidade core intacta
}
```

**Verificação após B5**: rodar `node -e "require('./lib/gate-decision-writer.cjs')"` no diretório do port. Não deve dar erro. Idem para `node -e "require('./.claude/hooks/stop-hook.cjs')"`.

---

## Passo C — Reescrever o manifesto de hooks (`hooks/hooks.json`)

**Objetivo**: migrar os três eventos não suportados para eventos que o Z-Code entende.

### C1 — Eventos no canônico (oito) vs Z-Code (sete)

| Evento canônico | Status no Z-Code | Ação |
|---|---|---|
| `SessionStart` | suportado | manter |
| `UserPromptSubmit` | suportado | manter |
| `PreToolUse` | suportado | manter |
| `PostToolUse` | suportado | manter |
| `Stop` | suportado | manter (absorve hooks de SessionEnd e StopFailure) |
| `SessionEnd` | **não suportado** | eliminar (hooks já cobertos por Stop) |
| `StopFailure` | **não suportado** | eliminar (hooks já cobertos por Stop) |
| `SubagentStop` | **não suportado** | migrar hooks para `PostToolUse` com matcher `Agent` |

Note que o Z-Code tem dois eventos que o canônico não usa: `PermissionRequest` e `PostToolUseFailure`. Eles são oportunidades para o futuro, mas o port não os adiciona por ora.

### C2 — Reescrita concreta do manifesto

Abra o arquivo `hooks/hooks.json` no diretório do port. Faça as seguintes mudanças:

1. **Remover o bloco `SessionEnd` inteiro** ( continha apenas `stop-gate-hook.cjs`, que já está em `Stop`).
2. **Remover o bloco `StopFailure` inteiro** (mesmo caso).
3. **No bloco `SubagentStop`**, pegar os dois hooks (`subagent-stop-commit-hook.cjs` e `corrective-error-signal-gate.cjs`) e movê-los para `PostToolUse` com matcher `Agent`.
4. **No bloco `PreToolUse` com matcher `Agent`**, remover a entrada do `langfuse-hook.cjs`.
5. **No bloco `PostToolUse` com matcher `Agent`**, remover a entrada do `langfuse-hook.cjs` e adicionar as duas entradas migradas de SubagentStop.

Após essas mudanças, o manifesto deve ter exatamente cinco eventos de hook ativos: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`.

### C3 — Risco controlado da migração SubagentStop → PostToolUse

O hook `subagent-stop-commit-hook` foi desenhado para disparar quando um subagente termina. Migrar para `PostToolUse` com matcher `Agent` faz ele disparar a cada chamada de ferramenta Agent completada — semântica próxima, mas não idêntica. O hook tem guarda interna idempotente (checa se já gravou commit para aquele run-id mais agent-id), então disparar múltiplas vezes não duplica entradas no log — apenas adiciona overhead de checagem. Esse comportamento deve ser verificado no smoke test final (Passo F6).

O `corrective-error-signal-gate` tem o mesmo padrão: guarda por combinação (run-id mais agent mais hash do erro), evitando redispatch duplicado.

---

## Passo D — Criar o manifesto dual

**Objetivo**: o plugin deve rodar tanto no Z-Code quanto no Claude Code/Cursor.

### D1 — Manter o manifesto existente intacto

O arquivo `.claude-plugin/plugin.json` já existe e é válido para Claude Code e Cursor. **Não mexer nele.**

### D2 — Criar o manifesto espelho para Z-Code

O manifesto Z-Code **não é idêntico** ao Claude Code: tem os mesmos campos básicos (name, version, description, author, license) MAIS os campos explícitos que apontam os diretórios de componentes (commands, skills, hooks, agents). O manifesto Z-Code também não usa alguns campos do Claude Code (autoDiscover, keywords).

```bash
# Criar o diretório .zcode-plugin
mkdir -p .zcode-plugin

# Criar o plugin.json espelho
cat > .zcode-plugin/plugin.json << 'EOF'
{
  "name": "pipeline-orchestrator",
  "version": "8.20.0",
  "description": "Pipeline Orchestrator — multi-agent governance layer for AI coding (Z-Code port; also runs on Claude Code and Cursor via dual manifest).",
  "author": { "name": "Pipeline Orchestrator" },
  "license": "PolyForm-Shield-1.0.0",
  "commands": "commands",
  "skills": "skills",
  "hooks": "hooks",
  "agents": "agents"
}
EOF
```

> Nota: os campos `name`, `version`, `description`, `author`, `license` devem refletir o canônico. Os campos `commands`, `skills`, `hooks`, `agents` são específicos do formato Z-Code e apontam os diretórios. O campo `autoDiscover` e o subcampo `author.url` do canônico são ignorados pelo Z-Code sem dano.

### D3 — Atualizar o package.json

Adicionar nota de portabilidade ao `package.json`:

```json
{
  "...": "...",
  "description": "Pipeline Orchestrator plugin. Portable across Claude Code, Cursor, OpenCode, and Z-Code via dual manifest (.claude-plugin + .zcode-plugin)."
}
```

**Verificação**: ambos os manifestos devem existir e ter o mesmo número de versão. O `.claude-plugin` permanece idêntico ao canônico; o `.zcode-plugin` é o espelho.

---

## Passo E — Documentação de instalação no Z-Code

**Objetivo**: criar o README com passos para o usuário final instalar.

Criar o arquivo `README-zcode.md` na raiz do port:

```markdown
# Pipeline Orchestrator para Z-Code

## Instalação

1. Abra Z-Code → Settings → Plugin Management → Discover.
2. Clique no botão "+" para adicionar um marketplace local.
3. Aponte para o subdiretório `.glm-marketplace` que fica **dentro** da pasta deste plugin (contém o `marketplace.json` que declara este plugin como `source: filesystem`).
4. Instale o plugin "pipeline-orchestrator".
5. Habilite os hooks em Settings: a configuração de hooks precisa de "hooks.enabled: true".
6. Reinicie a sessão.

## Variáveis de ambiente opcionais

- PIPELINE_ENFORCEMENT=warn|deny — controla o modo de enforcement (padrão: warn até a data de corte, deny depois).

## Variáveis que NÃO se aplicam mais (removidas no port)

- LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY — o port removeu a integração com Langfuse.
- Quaisquer variáveis PAPERCLIP_* — o port removeu a integração com Paperclip.

## Smoke test

Após instalar, em qualquer projeto:

    /pipeline-orchestrator:pipeline diagnostic <tarefa qualquer>

Você deve ver a classificação (tipo × complexidade × severidade) sem erro. Isso confirma que os hooks SessionStart dispararam e o plugin carregou.
```

---

## Passo F — Smoke test final

**Objetivo**: validar que o port carregou e funciona.

### F1 — Carregar o plugin no Z-Code

Abrir Settings → Plugin Management → Discover → instalar o plugin → habilitar hooks → reiniciar sessão.

### F2 — Verificar que os hooks SessionStart dispararam

Ao iniciar uma sessão nova, você deve ver a banner de boas-vindas do Pipeline Orchestrator listando os entry points. Isso confirma que os quatro hooks de SessionStart (cleanup-orphan-sentinel, pipeline-session-arm, enforcement-surface-verify, prompt-banner) rodaram.

### F3 — Rodar o command diagnostic

Em qualquer projeto:

```
/pipeline-orchestrator:pipeline diagnostic <tarefa qualquer>
```

Você deve ver a classificação (tipo × complexidade × severidade) sem erro. Isso confirma que:

- O entry point pipeline carregou.
- O task-orchestrator (agente N2 de classificação) despachou.
- O classifier rodou.
- O information-gate fez a checagem inicial.

### F4 — Verificar que o gate-decision-writer está escrevendo

Após o diagnostic, deve existir um arquivo `gate-decisions.jsonl` dentro do diretório de run criado para esta execução. O path canônico é `.pipeline/docs/Pre-{nivel}-action/{data}-{slug}/gate-decisions.jsonl` (por exemplo, `.pipeline/docs/Pre-Media-action/2026-07-03-minha-tarefa/gate-decisions.jsonl`). Procurar com `find .pipeline -name gate-decisions.jsonl` e abrir o arquivo encontrado, confirmando que tem pelo menos uma linha válida de JSON.

### F5 — Smoke test de um batch SIMPLES

Opcional, mas recomendado: rodar um pipeline completo em tarefa SIMPLES (dois arquivos, menos de trinta linhas). Verificar:

- O arm-gate disparou corretamente (registro do plano).
- O loop adversarial rodou (três revisores em paralelo).
- O Pa de Cal final apareceu (go, conditional, ou no-go).
- O `run-log.jsonl` foi escrito.
- O sentinel-state.json foi assinado com HMAC.

### F6 — Verificar a migração SubagentStop

Após rodar o pipeline SIMPLES, abrir o `.pipeline/run-log.jsonl` e confirmar que o `subagent-stop-commit-hook` gravou exatamente uma linha por subagente despachado (não uma linha por chamada de ferramenta Agent). Isso valida que a guarda idempotente funcionou após a migração de evento.

---

## Riscos conhecidos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Migração SubagentStop → PostToolUse causa log duplicado | média | médio | Guarda idempotente interna; validar no smoke test F6 |
| Z-Code não respeita algum matcher de PreToolUse | baixa | alto | Smoke test F3+F5 detecta; fallback é manter o matcher e reportar bug ao Z-Code |
| Hook fail-hard se env var ausente (algum hook legacy) | baixa | médio | Buscar `process.env` nos hooks restantes; tornar fail-open onde faltar |
| Manifesto dual causa conflito de namespace | muito baixa | alto | Testar carregar nos dois harnesses; nome do plugin idêntico nos dois manifestos |
| Referência residual a Langfuse/Paperclip quebra runtime | média | médio | Passo B4 garante limpeza via grep; smoke test valida |

---

## Estrutura de arquivos do port (final, após todos os passos)

```
pipeline-orchestrator-zcode/
├── .claude-plugin/plugin.json      ← intacto do canônico
├── .zcode-plugin/plugin.json       ← criado no Passo D
├── package.json                    ← atualizado no Passo D3
├── hooks/hooks.json                ← reescrito no Passo C
├── .claude/hooks/                  ← 36 arquivos .cjs (35 hooks ativos + 1 lib compartilhada)
├── agents/                         ← 50 agentes (cópia direta)
├── commands/                       ← 4 comandos (15 - 11 paperclip/setup)
├── lib/                            ← 36 libs (38 - 2 langfuse)
├── references/                     ← intacto
├── skills/                         ← intacto
├── README.md                       ← editado para remover Paperclip/Langfuse
├── README-zcode.md                 ← criado no Passo E
└── CLAUDE.md                       ← editado para remover env vars Langfuse
```

---

## Caminhos e comandos referenciados

```
# repositório canônico (origem do port)
Pipeline-Orchestrator/

# diretório do port (destino)
pipeline-orchestrator-zcode/

# manifesto dual
pipeline-orchestrator-zcode/.claude-plugin/plugin.json   ← intacto
pipeline-orchestrator-zcode/.zcode-plugin/plugin.json    ← criado no port

# manifesto de hooks reescrito
pipeline-orchestrator-zcode/hooks/hooks.json

# documentação de instalação
pipeline-orchestrator-zcode/README-zcode.md

# arquivos a remover (referência rápida)
pipeline-orchestrator-zcode/commands/paperclip-*.md   (10 arquivos)
pipeline-orchestrator-zcode/commands/setup-paperclip.md
pipeline-orchestrator-zcode/.claude/hooks/langfuse-hook.cjs
pipeline-orchestrator-zcode/lib/langfuse-client.cjs
pipeline-orchestrator-zcode/lib/langfuse-carrier.cjs
```
