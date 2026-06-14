> ## ⚠️ CORREÇÃO (2026-06-14, audit-heavy) — LEIA ANTES DE USAR ESTE DOCUMENTO
>
> Uma auditoria audit-heavy do próprio pipeline (relatório em `.pipeline/docs/Pre-Heavy-action/2026-06-14-contract-enforcement-base-audit/`) verificou que partes deste documento foram escritas contra uma foto **defasada** do repositório (~v7.8.0). O conserto de código (Fase 1) foi feito sobre a base CORRETA (git parent = release **v7.14.0** `b6d383e`) e integrou limpo, mas o raciocínio abaixo contém premissas factualmente erradas sobre o estado real em v7.14.0:
>
> - **Versão real:** o repositório está em **v7.14.0**, não 7.8.0.
> - **Arquivos ditos "NÃO existe" que EXISTEM:** `lib/step-1-7-routing.cjs` (v7.14.0) e `references/plan-mode-mandatory-agents.json` (v7.11.0) — ver §2 itens 1 e 2. Também já existem `references/step-1-7-enforcement.json`, `references/entry-points.json`, `lib/entry-points.cjs`, `lib/exclusive-lock.cjs`.
> - **§2 item 3 está errado:** `scripts/run-tests.cjs` JÁ varre `tests/unit`, `tests/packaging` e `tests/watchdog` (desde v7.13.0).
> - **Contagem de testes:** a suíte real é **114/4/118**, não 58/60.
> - **Consequência:** NÃO execute as Fases 2–6 do plano confiando na Seção 2 sem revalidar contra o código atual — várias lacunas já estão resolvidas, e criar SSOTs novos para arquivos que já existem reintroduziria o drift que o hardening quer eliminar.

# Auditoria — Proposta "TypeScript Contract Enforcement" (hardening de hooks)

**Data:** 2026-06-14
**Auditor:** pipeline-orchestrator (auditoria autônoma, gates em bypass por instrução do usuário)
**Escopo:** avaliar a proposta de criar uma camada TypeScript (`.cts → .cjs`) de contratos executáveis consumidos por hooks determinísticos, para forçar o workflow do plugin.
**Repositório:** `fernandoxavier02/Pipeline-Orchestrator` @ `main`, versão canônica `7.8.0`.
**Método:** leitura direta do código + cruzamento com a documentação oficial atual do Claude Code (plugins, hooks, sub-agents, settings) + execução da suíte de fidelidade (regression + hooks).

---

## Veredito de uma linha

**CONCORDO COM O PROBLEMA, DISCORDO DA SOLUÇÃO NA ESCALA PROPOSTA.** A proposta identifica corretamente um bug real e urgente (drift de schema do `gate-decisions.jsonl`), mas embrulha a correção numa migração TypeScript desproporcional para um repo que é hoje *zero-build, zero-devDependency, CommonJS puro, Iron-Law additive-only* — e várias premissas do plano descrevem arquivos que não existem.

**Decisão:** `CONDITIONAL GO` — aprovar e priorizar o núcleo (Fase 2, correção de drift), rebaixar a camada TypeScript para módulos `.cjs` SSOT + script de sync, e tratar o scope-lock fail-closed com cautela. Rejeitar a adoção do `tsc` como toolchain de publicação nesta etapa.

---

## 1. O que a proposta acertou (VERIFICADO no código)

### 1.1 O bug central é real e está shippado — esta é a parte mais valiosa da proposta

O writer canônico `lib/gate-decision-writer.cjs` (v7.1.0) emite **13 campos** por linha: os 8 campos-base (`gate`, `hardness`, `phase`, `decision`, `decided_by`, `timestamp`, `detail`, `confidence_impact`) **mais** os 5 campos de correlação (`run_id`, `plugin_version`, `schema_version`, `type`, `complexity`). O sanitizador `lib/jsonl-sanitizer.cjs` já aceita os 13 (`ALLOWED_GATE_DECISION_KEYS`, linhas 40-47).

Porém três arquivos de núcleo ainda descrevem o schema antigo de 8 campos e tratam qualquer campo extra como anomalia:

- `references/audit-trail.md:66` — *"Each line MUST parse as a single valid JSON object with **exactly these keys**: [os 8]. Lines that ... contain unexpected keys MUST be flagged as anomalous."*
- `agents/core/pipeline-controller.md:257` — *"Parse ONLY the documented fields [os 8]. Any line that does not parse as a valid single JSON object with **exactly these keys** MUST be ignored and logged as anomalous."*
- `agents/core/final-validator.md:66` — *"these must ALL show `decision: RESOLVED | APPROVED`"* — sendo que **`RESOLVED` não é um dos 8 valores canônicos** que o writer consegue emitir (`BLOCKED, DISPATCHED, SKIPPED, APPROVED, CONFIRMED, REJECTED, TRIGGERED, NOT_TRIGGERED`).

**Consequência prática (impacto real):** todo `gate-decisions.jsonl` gerado pela v7.1.0+ tem 13 campos por linha → o `final-validator` e o `pipeline-controller`, seguindo a regra "exactly these keys", marcariam o próprio audit trail do plugin como **adulterado/anômalo**. E como o `final-validator` procura `decision: RESOLVED` (valor que nunca é escrito), a validação de gates MANDATORY/HARD efetivamente **não casa com nada**. O plugin reprova a própria auditoria por drift de schema. **A proposta está 100% certa em chamar isto de prioridade #1.**

### 1.2 A filosofia "hook como polícia, não prompt" está correta e bem fundamentada

Cruzei as 6 afirmações da proposta sobre a doc oficial. Resultado: **5 de 6 verdadeiras**, 1 imprecisa só na terminologia.

| Afirmação | Veredito doc oficial |
|---|---|
| `commands/agents/skills/hooks` ficam na raiz do plugin, fora de `.claude-plugin/` | VERDADEIRO (estrutura). "shareable location" é terminologia imprecisa, mas `hooks/hooks.json` na raiz é o local canônico |
| `PreToolUse` bloqueia via `permissionDecision: "deny"` | VERDADEIRO — mecanismo determinístico suportado |
| Subagentes não têm `AskUserQuestion` nem `EnterPlanMode` mesmo se no frontmatter | VERDADEIRO — listados explicitamente como indisponíveis |
| Plugin subagents não suportam frontmatter `hooks`/`mcpServers`/`permissionMode` | VERDADEIRO — restrição de segurança documentada |
| `subagent_permissions` em settings.json **não existe** oficialmente | VERDADEIRO — não há tal campo; enforcement deve mesmo ficar em hooks |
| Matchers regex `Edit\|Write\|...` e `Skill\|Agent` em PreToolUse | VERDADEIRO — alternância regex suportada e exemplificada |

Ou seja: a decisão de **não** depender de settings/subagent_permissions e de manter o enforcement em hooks PreToolUse está alinhada com a doc oficial. Bom julgamento.

### 1.3 Listas duplicadas existem mesmo (parcial)

- `lib/fidelity-reporter.cjs:94` tem `MANDATORY_GATES_BY_COMPLEXITY` próprio, duplicado contra `references/gates.md`. **Confirmado** — candidato legítimo a SSOT.
- `.claude/hooks/dispatch-guard.cjs:39` tem `AGENT_LEAF_TO_FQN` próprio. **Confirmado** — candidato legítimo a SSOT.

---

## 2. O que a proposta errou (premissas factualmente incorretas sobre o repo atual)

Estas imprecisões importam porque vários passos do plano mandam "espelhar/absorver X" onde X não existe, e três testes propostos (F37/F38/F41) falhariam contra a realidade.

1. **`lib/step-1-7-routing.cjs` NÃO existe.** O plano (Fase 0 passo 4, e o premissa do `step-1-7-routing.cts`) manda ler e espelhar esse helper "com closed vocabulary load-existing/dispatch-brainstorm/...". Não há arquivo com esse nome em `lib/`. A lógica de Step 1.7 vive no `pipeline-controller.md` e num teste `tests/pipeline-controller-step-1-7-guard.test.cjs`, não num módulo lib.
2. **`references/plan-mode-mandatory-agents.json` NÃO existe.** As Fases 4 (workflow.cts: "espelhar references/plan-mode-mandatory-agents.json") e o teste F38 ("plan-mode mandatory agents batem com esse arquivo") referenciam um JSON que não está em `references/`.
3. **O test runner NÃO descobre `unit`, `packaging` nem `watchdog`.** `scripts/run-tests.cjs` só descobre dois grupos: `tests/regression/v<semver>/` e `.claude/hooks/__tests__/`. Não há categoria "watchdog" no projeto inteiro (busca por `*watchdog*` retorna vazio). A "fidelidade de execução" é guardada justamente por esse conjunto regression+hooks (e pelo `lib/fidelity-reporter.cjs`).
4. **`fidelity-reporter` já consome os sets canônicos.** Desde a v7.1.0, `VALID_HARDNESS = CANONICAL_HARDNESS` e `VALID_DECISION = CANONICAL_DECISIONS` (importados do writer). O "drift" que o plano quer consertar aqui já está, em boa parte, consertado — o writer já é o SSOT de-facto de decisões/hardness. Resta só o `MANDATORY_GATES_BY_COMPLEXITY` local.

---

## 3. Riscos da solução como proposta

### 3.1 Desproporção: `tsc` num repo zero-build / zero-devDependency (peso ALTO)

O `package.json` hoje: `"type": "commonjs"`, `engines.node >=18`, **`devDependencies: undefined`**, uma única dependência runtime (`langfuse`), e **nenhuma etapa de compilação** para o código que roda. Introduzir `typescript` como devDependency e `tsc -p tsconfig.contracts.json` no `build`/`test`/`prepublishOnly` significa:

- A publicação passa a depender de um passo de compilação. Se `lib/contracts/*.cjs` e `lib/validators/*.cjs` não forem committados (ou ficarem dessincronizados do `.cts`), o pacote publicado quebra para o usuário final.
- Toda a base é `.cjs` artesanal e legível; um build TS cria um *segundo* artefato (`.cts` fonte vs `.cjs` gerado) que precisa ser mantido em sync — exatamente o tipo de drift que a proposta quer eliminar, reintroduzido numa nova dimensão.
- O ganho de "tipos como lei" é real em teoria, mas o enforcement em runtime **já** vem de `throw TypeError` no writer + validação de chaves no sanitizer. O tipo estático não roda em produção; o que protege o usuário é o código `.cjs` que já existe.

**Recomendação:** entregar os contratos como módulos **`.cjs` SSOT puros** (ex.: `lib/contracts/gate-decision.cjs` exportando os sets e a lista de chaves) consumidos por writer/sanitizer/fidelity-reporter/hooks, mais um `scripts/verify-contract-sync.cjs` que falha o CI se `references/gates.md` divergir do contrato. Isso entrega o SSOT e o anti-drift **sem** compilador, sem devDependency, sem risco de publicação. Se no futuro quiserem tipos, adicionar `// @ts-check` + JSDoc nos `.cjs` dá checagem estática em dev **sem** etapa de build.

### 3.2 Scope-lock fail-closed é um footgun com o hook global (peso ALTO)

O `scope-lock-hook.cjs` dispara em **todo** `Edit|Write|MultiEdit|NotebookEdit` da sessão, não só durante runs de pipeline. Hoje ele é permissivo quando não há contrato — de propósito, por backward-compat, e porque o `CLAUDE.md` do projeto diz explicitamente *"Edits diretos OK fora do pipeline"*. Tornar fail-closed "negar Write/Edit fora de `.pipeline/` quando o run-context não é determinável mas há lock ativo" tem um modo de falha sério: um lock órfão/stale + contexto indeterminável → **bloqueia toda edição legítima ad-hoc** do usuário, inclusive a edição necessária para destravar o próprio lock. O escape `bootstrap.active` ajuda, mas exige que alguém consiga escrever o contrato primeiro — e é justamente isso que o fail-closed pode impedir.

**Recomendação:** se adotar fail-closed, condicioná-lo estritamente a (a) lock ativo **não-stale** (heartbeat válido) **E** (b) run-context com `complexity ∈ {MEDIA, COMPLEXA, Spec}` positivamente identificado. Em contexto indeterminável, preferir `warn` (não-bloqueante) + telemetria, nunca `deny` cego. E garantir que `.pipeline/` e o arquivo de contrato permaneçam sempre graváveis.

### 3.3 Tensão direta com a Iron Law do projeto (peso ALTO — governança)

O `CLAUDE.md` repete em quase todo release: *"Iron Law preservada: ZERO mudanças em agents/, skills/, references/, commands/, lib/."* O plano proposto reescreve `lib/gate-decision-writer.cjs`, `lib/jsonl-sanitizer.cjs`, `lib/fidelity-reporter.cjs`, dois hooks de núcleo, `references/audit-trail.md`, `references/gates.md`, `agents/core/final-validator.md` e `agents/core/pipeline-controller.md`. Isso **não é** additive-only; é uma mudança invasiva no núcleo. Não é proibido — mas é uma decisão de governança que precisa ser explícita e versionada como MAJOR/MINOR consciente, não deslizada como "hardening". A correção de drift (§1.1) justifica tocar os 3 arquivos de doc; o resto precisa de justificativa caso a caso.

### 3.4 Contagens hard-coded viram pins frágeis (peso MÉDIO)

Os testes F37/F41 fixam "35 gates" e "23 mandatory rows". O registro já evoluiu 22→27→32→35 e o mandatory 22→23 ao longo das versões. Fixar números num teste só vale se o contrato `.cjs` for o SSOT e `references/gates.md` for gerado/verificado a partir dele — caso contrário são só mais um lugar para dessincronizar.

---

## 4. Recomendação de execução (o que eu faria, em ordem)

1. **PRIMEIRO E URGENTE — fechar o cartório (drift de schema), sem TypeScript.** Corrigir os 3 arquivos: `audit-trail.md` e `pipeline-controller.md` passam a aceitar o conjunto canônico de 13 chaves (8 base + 5 correlação) e a marcar como anomalia só o que estiver *fora* desse conjunto; `final-validator.md` remove `RESOLVED` e passa a regra para "MANDATORY/HARD nunca podem ser `SKIPPED`; valores válidos são os 8 canônicos; sucesso/falha é por-gate". Criar `lib/contracts/gate-decision.cjs` como SSOT dos sets + chaves e fazer writer/sanitizer/fidelity-reporter importarem dele. Adicionar regression `F-gate-decision-contract` em `tests/regression/v7.9.0/` (ou a versão corrente). **Este pacote é pequeno, fail-safe e resolve o risco de o plugin reprovar a própria auditoria.**
2. **DEPOIS — SSOT de gates + sync-check.** `lib/contracts/gates.cjs` com o registro atual; `fidelity-reporter` e o controller consomem; `scripts/verify-contract-sync.cjs` falha o CI se `references/gates.md` divergir. Documentação gerável via snapshot auditável (sem sobrescrever `references/gates.md` automaticamente).
3. **DEPOIS — workflow/FQN SSOT.** Extrair `AGENT_LEAF_TO_FQN` para `lib/contracts/workflow.cjs` consumido por `dispatch-guard` e `sentinel-hook`. (Pular as referências a arquivos inexistentes — `step-1-7-routing.cjs`, `plan-mode-mandatory-agents.json` — ou criá-los de propósito como SSOT novo, decisão explícita.)
4. **POR ÚLTIMO E COM CUIDADO — scope-lock fail-closed** com as condições de §3.2.
5. **TypeScript:** rebaixar para `// @ts-check` + JSDoc nos `.cjs` SSOT (checagem em dev, zero build). Só considerar `tsc` real se/quando o projeto adotar uma etapa de build de primeira classe — decisão separada deste hardening.

---

## 5. Estado de fidelidade no momento da auditoria

Suíte completa (regression + hooks): **`58 passed / 2 failed / 60 total`**. As 2 falhas são ambas testes de observabilidade Langfuse da v7.3.0 (F9/F10), falhando por motivo ambiental — dependem de um hook Langfuse já ter rodado (`.pipeline/langfuse-errors.jsonl` ausente), de um timeout de flush de 3s e de ruído de `CARRIER_PPID_FALLBACK`. São pré-existentes e não têm relação com a proposta (o próprio `CLAUDE.md` documenta a falha de vendoring Langfuse como baseline conhecido). **A fidelidade do núcleo do pipeline está efetivamente verde.**

---

## 6. Resumo executivo

A proposta é tecnicamente competente e identifica o bug certo. O erro dela é de **dosagem**: aplica um martelo TypeScript onde uma chave de fenda `.cjs` resolve, parte de premissas sobre arquivos inexistentes, e colide com a Iron Law do projeto. Aprovo a *intenção* e o *diagnóstico*; condiciono a *execução* a (1) fazer o conserto de drift primeiro e sem compilador, (2) tratar o fail-closed do scope-lock com trava de contexto, e (3) decidir conscientemente sobre a quebra da Iron Law. O plano detalhado e corrigido está no arquivo `02-implementation-plan.md` ao lado deste.
