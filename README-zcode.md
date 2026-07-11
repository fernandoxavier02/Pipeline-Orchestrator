# Pipeline Orchestrator — Instalação no Z-Code

> Guia rápido para instalar este plugin portado num ambiente Z-Code. Para a documentação completa de auditoria e portabilidade, veja a pasta `docs/port-zcode/`.

## Pré-requisitos

- Z-Code instalado e funcional.
- Node.js versão dezoito ou superior instalado (as libs são Node puro, extensão `.cjs`).
- O diretório deste plugin acessível no sistema de arquivos local.

## Passo 1 — Adicionar o marketplace local

> **Local do marketplace**: o arquivo de marketplace deste plugin vive dentro da própria pasta do plugin, em `.glm-marketplace/marketplace.json` (relativo à raiz do plugin).

Abra Z-Code → Settings → Plugin Management → Discover → clique no botão **"+"** para adicionar um marketplace.

Aponte para o subdiretório `.glm-marketplace` que fica **dentro** da pasta deste plugin (ele contém o arquivo `marketplace.json` que declara este plugin como `source: filesystem`).

## Passo 2 — Instalar o plugin

Após adicionar o marketplace, o plugin **pipeline-orchestrator** aparecerá na aba Discover. Clique em **Instalar**.

## Passo 3 — Habilitar os hooks

Em Settings, certifique-se de que a configuração de hooks está habilitada (`hooks.enabled: true`). Quando qualquer plugin contribui com hooks, o hook runner é ativado automaticamente — mas vale confirmar.

## Passo 4 — Reiniciar a sessão

Reinicie a sessão do Z-Code para que os hooks `SessionStart` disparem.

## Verificação

Após reiniciar:

1. **Banner de boas-vindas**: você deve ver o banner do Pipeline Orchestrator listando os entry points.
2. **Comando disponível**: digite `/` no input e procure por `/pipeline-orchestrator:pipeline`. Deve aparecer.
3. **Smoke test**: rode `/pipeline-orchestrator:pipeline diagnostic <tarefa qualquer>`. Você deve ver a classificação (tipo × complexidade × severidade) sem erro.

## Variáveis de ambiente

| Variável | Default | Função |
|---|---|---|
| `PIPELINE_ENFORCEMENT` | `warn` até a data de corte, depois `deny` | Modo de enforcement (warn = só avisa; deny = bloqueia) |
| `PIPELINE_HANDSHAKE_TIMEOUT_MS` | `1800000` (30 min) | Tempo máximo de espera para subagente responder |
| `PIPELINE_TEST_TIMEOUT_MS` | `180000` (3 min) | Tempo máximo por arquivo de teste |

## Variáveis que NÃO se aplicam a este port

As seguintes variáveis do canônico foram removidas neste port:

- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` — a integração com Langfuse foi removida.
- Quaisquer variáveis `PAPERCLIP_*` — a integração com Paperclip foi removida.

## Solução de problemas

**Plugin não aparece no Discover**: confirme que o `marketplace.json` dentro do subdiretório `.glm-marketplace` deste plugin aponta para o caminho absoluto correto da pasta do plugin e que o arquivo `.zcode-plugin/plugin.json` existe na raiz.

**Hooks não disparam**: confirme `hooks.enabled: true` em Settings. Reinicie a sessão.

**Comando `/pipeline-orchestrator:pipeline` não aparece**: confirme que o plugin está marcado como `enabled` (não apenas `installed`) em Settings → Plugin Management.

## Documentação de auditoria

A pasta `docs/port-zcode/` contém a auditoria completa da portabilidade:

- `00-overview.md` — visão geral + glossário ubíquo
- `01-hooks-inventory.md` — os trinta e seis hooks e seus destinos
- `02-agents-inventory.md` — os cinquenta agentes
- `03-workflows-and-stages.md` — os vinte e quatro entry points
- `04-gates-and-enforcements.md` — os quarenta e nove gates
- `05-lib-inventory.md` — as trinta e oito libs
- `06-portability-plan.md` — o plano de portabilidade executado
- `batch-audit-log.md` — a trilha de auditoria dos batches
