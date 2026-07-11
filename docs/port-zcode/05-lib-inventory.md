# 05 — Inventário das Libs de Apoio

> Mapeia as trinta e oito libs `.cjs` em `lib/` do repositório canônico. Cada lib é código Node puro (CommonJS, "módulos Common JavaScript" — o sistema de módulos clássico do Node, com `require` e `module.exports`), multiplataforma, sem dependências de harness. Esta é a camada que hooks e agentes chamam para fazer o trabalho real.

## Veredicto

As libs são **majoritariamente portáveis sem alteração**. Node é Node em qualquer harness. As únicas duas libs que precisam de atenção no port são as duas especificamente ligadas à telemetria Langfuse, que saem no port (decisão confirmada). Uma terceira lib (`langfuse-sanitizer.cjs`) é usada para sanitização geral de logs e **permanece**.

---

## TDD checklist (critérios verificáveis)

- [x] T1: contagem de libs == trinta e oito arquivos `*.cjs` em `lib/`
- [x] T2: cada lib aparece exatamente uma vez no inventário
- [x] T3: libs Langfuse claramente marcadas (manter ou remover) — decisão de portabilidade refletida
- [x] T4: a lib `gate-decision-writer.cjs` aparece marcada como "ponto único de escrita do gate-decisions.jsonl" (SSOT crítico)
- [x] T5: a lib `sentinel-state-signer.cjs` aparece marcada como responsável pelo HMAC do estado
- [x] T6: nenhum caminho de arquivo na prosa narrativa (paths só em blocos de código)
- [x] T7: cada entrada tem exatamente cinco colunas (nome, responsabilidade, dependentes, toca-estado-assinado, destino no port)

---

## Critério de classificação do destino no port

Cada lib recebe um destes quatro destinos:

- **KEEP** — permanece no port sem alteração.
- **REMOVE** — sai do port (decisão de portabilidade confirmada).
- **KEEP-WITH-GUARD** — permanece, mas precisa de guarda interna (ex.: fail-open se env var ausente).
- **REVIEW** — precisa de leitura adicional para decidir (resolvido neste documento, jamais deixado em aberto).

---

## Inventário completo (trinta e oito libs)

### Estado e assinatura (HMAC)

| Lib | Responsabilidade | Dependentes | Toca estado assinado | Destino |
|---|---|---|---|---|
| `sentinel-state-signer.cjs` | Assina e verifica o `sentinel-state.json` com HMAC; ponto único da assinatura | `sentinel-hook`, `sentinel-state-autosign`, `cleanup-orphan-sentinel-state-hook`, `pipeline-arm-gate` | **SIM** (escreve a assinatura) | KEEP |
| `pipeline-arm.cjs` | Define se a sessão está "armada" para execução de pipeline | `pipeline-arm-writer`, `pipeline-arm-gate`, `pipeline-session-arm-hook` | não (lê marker) | KEEP |
| `arm-pending.cjs` | Verifica se há marker de arm pendente para a sessão | `pipeline-arm-gate` | não | KEEP |
| `exclusive-lock.cjs` | Lock de sessão exclusiva (impede concorrência) | `session-lock-hook` | não | KEEP |
| `enforcement-status.cjs` | Reporta status corrente do enforcement (warn ou deny) | `enforcement-surface-verify-hook` | não | KEEP |

### Escrita de gates e scores (pontos únicos — SSOT)

| Lib | Responsabilidade | Dependentes | Toca estado assinado | Destino |
|---|---|---|---|---|
| `gate-decision-writer.cjs` | **Ponto único** de escrita do `gate-decisions.jsonl` (Iron Law do canônico) | Todos os hooks que emitem gate | não (anexa em JSONL) | KEEP |
| `score-writer.cjs` | Escreve scores de confiança no estado | `final-validator`, `e2e-evaluator` | não | KEEP |
| `gate-log-guard.cjs` | Valida que gates só são escritos via `gate-decision-writer` (anti-bypass) | `gate-log-gate` | não | KEEP |
| `step-ledger.cjs` | Mantém o ledger de passos da execução (qual step, em qual fase) | `step-ledger-gate`, `step-ledger-stamp` | não | KEEP |
| `run-log.cjs` | Anexa entradas ao `run-log.jsonl` (log principal de run) | `subagent-stop-commit-hook`, `e2e-evaluator` | não | KEEP |

### Run, manifestos, e sealing

| Lib | Responsabilidade | Dependentes | Toca estado assinado | Destino |
|---|---|---|---|---|
| `run-directory.cjs` | Resolve e cria o diretório de run em `.pipeline/` | Todos os hooks | não | KEEP |
| `run-manifest.cjs` | Escreve o manifesto do run (agentes, fases, timing) | `pipeline-controller`, `final-validator` | não | KEEP |
| `run-seal.cjs` | Sela o run no fim (calcula hash final, marca closed) | `finishing-branch`, `stop-gate-hook` | não | KEEP |
| `run-step-guard.cjs` | Valida ordem dos steps dentro de um run | `step-ledger-gate` | não | KEEP |
| `execution-summary.cjs` | Produz resumo final da execução | `final-validator`, `pipeline-controller` | não | KEEP |

### Classificação e roteamento

| Lib | Responsabilidade | Dependentes | Toca estado assinado | Destino |
|---|---|---|---|---|
| `pipeline-workflow-classifier.cjs` | Classifica tipo × complexidade × severidade (SSOT da classificação) | `task-orchestrator`, `pipeline-controller` | não | KEEP |
| `step-1-7-routing.cjs` | Decide na inicialização se carrega run existente, despacha brainstorm, ou bypass | `pipeline-controller` | não | KEEP |
| `entry-points.cjs` | SSOT machine-readable dos entry points; alimenta `force-pipeline-agents`, `session-lock-hook` | `force-pipeline-agents`, `session-lock-hook` | não | KEEP |
| `domain-scanner.cjs` | Escaneia domínios sensíveis (auth, crypto, payment) nos arquivos do projeto | `task-orchestrator`, `scope-lock-hook` | não | KEEP |
| `path-rewriter.cjs` | Reescreve paths entre harness e plugin (ex.: resolver `CLAUDE_PLUGIN_ROOT`) | Vários hooks | não | KEEP |

### Loops de correção e adversariais

| Lib | Responsabilidade | Dependentes | Toca estado assinado | Destino |
|---|---|---|---|---|
| `fix-loop.cjs` | Implementa o loop de correção adversarial (cap três tentativas) | `executor-fix`, `review-orchestrator` | não | KEEP |
| `consecutive-failure-counter.cjs` | Conta falhas consecutivas para disparar circuit breakers | `stop-gate-hook`, `step-ledger-gate` | não | KEEP |
| `batch-review-guard.cjs` | Guarda que cada batch passou por revisão adversarial | `batch-review-gate` | não | KEEP |
| `checkpoint-verdict.cjs` | Produz veredito de checkpoint | `checkpoint-verdict-producer`, `checkpoint-verdict-gate` | não | KEEP |
| `checkpoint-verdict-producer.cjs` | Encapsula a produção de veredito de checkpoint | `checkpoint-verdict-gate`, `sanity-checker` | não | KEEP |
| `phase-verdict-guard.cjs` | Valida veredito por fase antes da transição | `phase-verdict-gate` | não | KEEP |
| `corrective-dispatch.cjs` | Despacha correção quando um subagente reporta erro | `corrective-dispatch-gate`, `corrective-error-signal-gate` | não | KEEP |

### Telemetria (Langfuse — alvo de remoção)

| Lib | Responsabilidade | Dependentes | Toca estado assinado | Destino |
|---|---|---|---|---|
| `langfuse-client.cjs` | Cliente HTTP (HyperText Transfer Protocol, "protocolo de transferência de hipertexto") para a nuvem Langfuse | `langfuse-hook`, `langfuse-carrier` | não | **REMOVE** |
| `langfuse-carrier.cjs` | Propaga trace context (padrão W3C, "World Wide Web Consortium") entre agentes | `langfuse-hook` | não | **REMOVE** |
| `langfuse-sanitizer.cjs` | Sanitiza payload de telemetria (remove secrets) — **usada por score-writer também** | `langfuse-hook`, `score-writer` | não | **KEEP** |

### E2E e fidelidade

| Lib | Responsabilidade | Dependentes | Toca estado assinado | Destino |
|---|---|---|---|---|
| `e2e-evaluator.cjs` | Avalia fidelidade da execução contra o workflow esperado | `e2e-eval-gate`, `self-eval` command | não | KEEP |
| `fidelity-reporter.cjs` | Produz relatório de fidelidade | `e2e-evaluator`, `final-validator` | não | KEEP |

### Utilidades de parsing e sanitização

| Lib | Responsabilidade | Dependentes | Toca estado assinado | Destino |
|---|---|---|---|---|
| `jsonl-sanitizer.cjs` | Sanitiza linhas JSONL antes de anexar (escapes, unicode) | `gate-decision-writer`, `run-log` | não | KEEP |
| `audit-read-budget.cjs` | Limita número de leituras em modo audit (anti-vazamento de orçamento) | `audit-read-budget-gate`, `audit-read-counter-hook` | não | KEEP |
| `pipeline-local-parser.cjs` | Faz parse da configuração por projeto (`pipeline.local.md`) | `pipeline-controller`, `task-orchestrator` | não | KEEP |
| `kiro-skill-cloner.cjs` | Clona skill Kiro para o namespace do plugin | `spec-controller`, `pipeline-controller` | não | KEEP |

### Compatibilidade e runtime

| Lib | Responsabilidade | Dependentes | Toca estado assinado | Destino |
|---|---|---|---|---|
| `codex-operational-runtime.cjs` | Camada de compat para o harness Codex | `path-rewriter`, hooks em alguns paths | não | KEEP |
| `index.cjs` | Ponto de entrada da lib (re-exports) | Testes, ferramentas externas | não | KEEP |

---

## Resumo do destino no port

| Destino | Quantidade | Libs |
|---|---|---|
| **KEEP** | trinta e seis | todas exceto as duas Langfuse listadas abaixo (inclui a lib de sanitização, que tem nome langfuse mas função genérica) |
| **REMOVE** | duas | as duas primeiras Linhas da tabela Langfuse (cliente e carrier) |
| **KEEP-WITH-GUARD** | zero | (não necessário; Langfuse sai por decisão) |
| **REVIEW** | zero | (todos resolvidos neste documento) |

**Aritmética**: 36 KEEP + 2 REMOVE = 38 total. Confere com a contagem de arquivos na pasta de libs.

**Atenção crítica**: a lib de sanitização (última linha da tabela Langfuse acima) **permanece** mesmo após remover a integração Langfuse. Ela é usada por outra lib (a escritora de scores) para sanitização genérica de payloads: remover tokens, chaves e segredos antes de escrever. Removê-la quebraria a escrita de scores. Esta é uma pegadinha clássica: o nome do arquivo sugere dependência exclusiva Langfuse, mas a função é reutilizável.

---

## Notas para o port

- As libs são Node puro (CommonJS). Funcionam idênticas em qualquer harness, porque Node é Node em qualquer lugar.
- Nenhuma lib chama o harness diretamente. Todas as integrações com o harness passam pelos hooks. Portanto, mudar o harness não exige mudar as libs.
- A única dependência externa das libs é o pacote crypto do próprio Node — sem pacotes de terceiros para o core funcionar.
- O caminho relativo entre hooks e libs é resolvido por uma lib dedicada (a reescritora de paths), listada acima nas tabelas.

---

## Caminhos e comandos referenciados

```
# diretório das libs no canônico
Pipeline-Orchestrator/lib/

# ponto de entrada (re-exports)
Pipeline-Orchestrator/lib/index.cjs

# ponto único de escrita de gates (Iron Law)
Pipeline-Orchestrator/lib/gate-decision-writer.cjs

# assinatura HMAC do estado
Pipeline-Orchestrator/lib/sentinel-state-signer.cjs

# libs a remover no port
Pipeline-Orchestrator/lib/langfuse-client.cjs
Pipeline-Orchestrator/lib/langfuse-carrier.cjs
```
