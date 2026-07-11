# Auditoria — Por que o agente trava, se perde e queima tokens ao executar o pipeline

- **Data:** 2026-07-08
- **Autor:** Claude (sessão de auditoria dedicada, a pedido do usuário)
- **Escopo:** camada de enforcement (hooks), mensagens de bloqueio, superfície de instruções (skills/agents/commands), régua de avaliação e2e, telemetria corretiva real de 29/06→07/07
- **Pergunta:** por que o agente, sob a v8.19.x–v8.22.0, ainda trava dentro de runs governados e gasta grandes volumes de token "dando voltas" para sair de bloqueios — e qual é a correção definitiva (não mais um patch por deadlock)?

---

## 1. Sumário executivo

O sistema de enforcement funciona como projetado: ele **nega** ações fora do trilho. O que ele não faz é **entregar o trilho**. Todo o desperdício observado nasce desse desenho meio-completo:

1. O gate calcula a negação a partir do estado do run — ou seja, ele **sabe** exatamente o que falta. As mensagens vivas melhoraram muito na v8.20.0/v8.22.0 (a maioria hoje nomeia uma ação), mas o trilho **não é um contrato garantido**: a telemetria corretiva ainda grava correção vazia, ~9 caminhos de estado-corrompido são semi-acionáveis, a ação apontada não é verificada como PERMITIDA pelos demais gates (classe ovo-e-galinha), e a mensagem ignora o destinatário (um subagente sem a ferramenta Agent recebe um remédio que não consegue executar).
2. Sem receita, o agente faz o que um LLM previsivelmente faz: tenta variações, depois tenta contornar (editar estado assinado, forçar fechamento, desligar enforcement). Cada tentativa é corretamente barrada, queima uma rodada inteira de contexto, e algumas **incrementam contadores fatais** (continuity cap do Stop).
3. Regras operacionais críticas ("trabalhe síncrono", "não rode o controller em background", "a saída de um pending é despachar o alvo X") **não existem como instrução no momento do uso** — o agente as descobre por tentativa e erro, tarde.
4. Uma fração dominante dos bloqueios históricos foi **fogo amigo**: bugs do próprio estado de enforcement (marcador órfão, ovo-e-galinha do dispatch-pending, falso timeout de 482 min), não desvio do agente. ~10 releases em 3 semanas (8.11.1→8.22.0) consertaram deadlocks da própria máquina de segurança, um por vez.
5. A régua de auto-avaliação pune o caminho certo (run selado e completo tira 30/100 com 24 "gates ausentes" que não se aplicam ao workflow), gerando corretivas e confusão em cima de runs saudáveis.

**Correção definitiva proposta (§4):** inverter a polaridade do enforcement — de "punir o desvio" para "entregar o trilho" — em 3 pilares: (P1) contrato Next-Action em todo deny, (P2) skill `unblock` determinística + instruções operacionais fatiadas em skills de procedimento carregadas just-in-time (padrão do playbook de skills da Anthropic, que o usuário citou), (P3) liveness garantida por teste + stop-cap ciente de espera + contração do estado distribuído + conclusão da recalibragem da régua (spec S2, já em andamento e agora destravável).

---

## 2. Evidências

### E1 — Telemetria corretiva: 27 gatilhos em 3 famílias; o mais frequente pós-fix grava correção VAZIA

Fonte: `.pipeline/state/corrective-triggers.jsonl` (raiz do workspace + `claude-code/`), período 2026-06-29 → 2026-07-04.

| Família | Ocorrências | Natureza | Estado |
|---|---|---|---|
| `NOT_ARMED` | ×18 | Marcador `pipeline-arm-pending` órfão / armado por tarefa só-leitura — **bug do enforcement**, não desvio do agente | Resolvido (v8.19.1 consume-on-close + v8.19.3 read-only não arma); zero desde 01/07 |
| `INLINE_WORK_BLOCKED` | ×8 (3 pós-v8.20.0) | Mutação fora de janela de execução; inclui o deadlock ovo-e-galinha do dispatch-pending (a única saída — `exec-window/open.cjs` — era negada pelo próprio gate) | Deadlock resolvido (v8.22.0 T2); a **mensagem** segue genérica (E2/E3) |
| `CORRUPT_STATE` | ×1 | Sentinel-state ilegível na janela governada | Mitigado (v8.20.0 autosign) |

Ponto crítico: **toda ocorrência de `INLINE_WORK_BLOCKED` grava `corrective: {}`** — objeto vazio, sem `what_failed`, sem `fix_instruction`, sem `resume_instruction`. O descritor corretivo simplesmente não é construído para esse invariante. E a mensagem viva do hook (`.claude/hooks/pipeline-arm-gate.cjs:239-242`) diz:

> "Despache o agente do passo esperado (que abre a janela) em vez de trabalhar inline."

— sem dizer **qual** é o agente do passo esperado, nem o `subagent_type` literal, nem como descobrir. O gate tem acesso ao step-ledger e ao workflow manifest (ele sabe o passo esperado); a informação existe e não é entregue.

### E2 — Relato de primeira mão do agente executor (run `2026-06-29-telemetry-instrumentation-spec`)

O usuário colou o post-mortem escrito pelo próprio agente que executou o run. Motivos rankeados por custo, na voz do agente:

1. **Maior custo:** rodar o controller em background e encerrar o turno para esperar. Cada espera contou como "tentativa de parar" no stop-gate; na 3ª o run foi convertido em falha terminal de propósito. A correção ("conduzir tudo síncrono") só foi descoberta tarde, por tentativa e erro. *"Isso foi falha minha de manejo, não da ferramenta"* — na verdade é dos dois: nenhuma instrução dizia isso (CR2), e o cap não distingue espera legítima de abandono (E3).
2. **Segundo maior:** tentativas de contornar as travas (editar o arquivo de controle assinado por fora, rodar o comando de fechamento na marra, desligar a fiscalização por sessão). Todas corretamente barradas; várias rodadas queimadas. É o comportamento previsível de um agente bloqueado **sem receita de saída** (CR1).
3. Atrito estrutural: o pipeline supõe que subagentes falam com o usuário, o runtime remove essa capacidade (Achado #7) → o parent vira intermediário de tudo, multiplicando idas e vindas. E o "vigia de continuidade" deu falso-positivo, matando o processo com as checagens verdes.
4. Estado externo genuinamente quebrado (banco do projeto apagado) — alheio ao plugin.
5. Concorrência com outro agente no mesmo código + atritos de ambiente.

Síntese do próprio agente: duas fichas — "trabalhar síncrono" e "ir por dentro das travas" — resolviam quase tudo, e caíram tarde. **As duas cabiam em duas linhas de instrução entregues na hora certa.**

### E3 — O continuity cap do Stop converte espera legítima em morte do run

`.claude/hooks/stop-gate-hook.cjs:50`: `CONTINUITY_CAP = 3` — run incompleto + enforcement armado ⇒ Stop bloqueado; na 3ª continuidade, `writeHardFailed()` grava terminal `hard_failed` permanente. O comentário do próprio código explica a intenção: *"the 3-continuity cap → hard_failed prevents an infinite block"* — anti-deadlock. O pressuposto implícito é que 3 stops bloqueados = agente perdido/abandono. O relato E2 prova o caso não coberto: **agente saudável esperando subagente em background** encerra o turno a cada espera → 3 esperas = run assassinado. Não há checagem de "existe dispatch/subagente vivo em andamento?" antes de incrementar o contador.

### E4 — A régua e2e pune o caminho certo

Fonte: `.pipeline/eval-log.jsonl` (raiz) + `e2e-eval.md`/`sentinel-state.json` do run citado em E2.

| Run | Score | Glitches | Dos quais `missing_gate` |
|---|---|---|---|
| 2026-06-29-spec-output-enforcement | 41/100 | 19 | 18 |
| 2026-06-29-telemetry-rule-adherence | 100/100 | 0 | 0 |
| 2026-06-29-telemetry-instrumentation-spec | 30/100 | 26 | 24 |

O terceiro run terminou **selado e completo** (`sentinel-state.json`: `final_decision: "SEALED"`, `terminal_state: "completed"`) e ainda assim tirou 30/100 — os 24 `missing_gate` são gates de implementação de código (`TDD_APPROVAL`, `CHECKPOINT_FAIL`, `ADVERSARIAL_*`…) cobrados de um run de **spec-authoring**, que por design para no selo. Já diagnosticado na auditoria de workflows de 2026-07-03 ("régua descalibrada — runs limpos tiram 30/100"); a correção vive na spec `workflow-audit-remediation` S2 — cujo Batch 1 morreu justamente no deadlock do dispatch-pending (0/320 diff), fechando o círculo vicioso. Efeito colateral: o self-eval no Stop levanta propostas de fix para glitches fantasmas → mais rodadas, mais token, e o score perde valor informativo.

### E5 — Histórico: a classe de defeito sobrevive aos fixes pontuais

Releases consecutivas consertando deadlock/atrito da própria camada de enforcement: 8.11.1 (deadlock sentinel×dispatch-pending), 8.16.0 (glitches do avaliador), 8.18.0/8.18.1 (staleness, session filtering), 8.18.2 (observer falso-positivo em agentes do harness), 8.19.1 (arm-marker órfão), 8.19.2 (crash fail-closed), 8.19.3 (read-only armando), 8.20.0 (stop-trap fail-open; deny invisível do scope-lock; mensagens sem ação alcançável; **arm fantasma disparado por prosa de relatório**; autosign), 8.22.0 (5 correções: isenção já-despachado, exec-window negado pelo próprio gate, pending não-limpo no retorno, falso timeout de 482 min, carimbo tdd por evidência). ~10 releases em ~3 semanas. Cada uma fecha o buraco específico e **a classe permanece**, porque a classe é arquitetural: estado de coordenação distribuído em muitos arquivos/markers com TTL+HMAC+locks, policiado por ~29 registros de hook em 9 eventos (10 hooks em série em cada spawn de Agent; 2 gates catch-all em TODA chamada de ferramenta), sem verificação sistemática de que todo estado bloqueável tem saída permitida.

### E6 — Inventário dos gates e das mensagens de bloqueio (varredura dedicada)

Dimensão da camada: **37 scripts de hook (não-teste), ~12.300 linhas de JS** + ~3.900 de libs de enforcement ≈ **11.300 linhas efetivas de enforcement**; 36 scripts registrados em 8 eventos (41 comandos de hook): 10 hooks em série em cada `PreToolUse:Agent`, 2 gates catch-all em **toda** chamada de ferramenta. **19 hooks podem negar**, cobrindo **~40 invariantes distintos**.

Estado das mensagens (pós-v8.20.0/v8.22.0): **~34 invariantes já emitem ação exata** (ex.: `PIPELINE_NOT_ARMED` → "PRÓXIMA AÇÃO (única): `Agent(subagent_type: "pipeline-orchestrator:core:pipeline-controller", …)`") — a reescrita das duas últimas versões converteu os denies mais quentes em trilho. **Restam ~9 semi-acionáveis** (as variantes `*_STATE_CORRUPT`/`*_UNVERIFIED`, o internal-error fail-closed do edit-guard — que não tem escape warn — e os caminhos HMAC-strict), que só dizem "recrie/re-assine via controller" sem o passo fino. E os 3 problemas de contrato seguem abertos: (a) o descritor corretivo do `INLINE_WORK_BLOCKED` grava `corrective: {}` vazio (a telemetria diverge da mensagem viva); (b) nenhum teste garante que caminho novo de deny nasça com receita; (c) nada verifica que a ação apontada por um gate é permitida pelos outros. *(Detalhe por gate: anexo A.)*

### E7 — Superfície de instruções e distância instrução↔uso (varredura dedicada)

Corpus de instrução em linguagem natural: **~48.200 linhas** de `.md` (agents/ 14.386 em 50 arquivos; skills/ 19.164 em 191; commands/ 3.037; references/ 11.609) — sobre uma camada **separada e quase disjunta** de 12.300 linhas de enforcement em JS que o agente nunca lê (a maior concentração de menções a hooks são 17 linhas dentro do controller; workers têm ~1 menção incidental).

- **Espinha residente de um run FULL:** `commands/pipeline.md` (1.224) + `agents/core/pipeline-controller.md` (1.738 linhas, 103 menções de fase, 41 steps, 81 tokens de gate) + `agents/executor/executor-controller.md` (434) = **3.396 linhas**, mais ~1.252 de references grep-carregadas ≈ **4.650 linhas de orquestração antes da primeira linha de prompt de trabalho**. Um run pesado atravessa ~18-20 mil linhas no total.
- **A receita de saída de bloqueio vive em 3 lugares — nenhum no prompt do worker:** (1) a mensagem do próprio hook (endereçada ao PARENT); (2) `references/gate-request-protocol.md` (260 linhas, grep-loaded); (3) o re-entry contract dentro do controller N1. Workers N2 não recebem nenhuma.
- **Lacuna aguda — remédio inexecutável para o destinatário:** as mensagens de recuperação (`dispatch-pending-gate`, `PIPELINE_NOT_ARMED`) instruem "despache o subagente via Agent tool" / "chame `Agent(pipeline-controller)`" — mas o Achado #7 remove a ferramenta Agent do runtime de subagente. Um N2 bloqueado é **literalmente incapaz de executar a instrução que recebe**. O texto não é adaptado ao destinatário.
- **Colisão semântica:** `executor-implementer-task.md:227,247` instrui "não use status BLOCKED (para 'não posso começar'); use QUESTIONS" — "BLOCKED" nos prompts é vocabulário de RELATÓRIO, sentido oposto ao do hook. O worker que leva um deny do edit-guard (ex.: TTL da exec-window expira no meio do trabalho) não tem uma linha sequer sobre exec-windows no prompt de 420 linhas.
- **Não existe** skill/command/doc de "unblock"/"recovery" voltado ao agente em runtime (o único "hook-unblock" é pacote de desenvolvimento do mantenedor, não artefato de run).

---

## 3. Causas raiz

- **CR1 — Trilho recente, parcial e não-garantido.** O gate conhece a saída (computou a negação a partir do estado). As mensagens foram reescritas caso a caso (v8.20.0/v8.22.0) e hoje ~34/40 nomeiam uma ação — mas isso é prosa por gate, não CONTRATO: a telemetria corretiva grava `corrective: {}`; ~9 caminhos de estado-corrompido são semi-acionáveis; nada garante que a ação apontada é PERMITIDA pelos demais gates (o ovo-e-galinha da 8.20→8.22 era exatamente isso: o gate mandava abrir a janela e ele próprio negava o comando que a abre); e nenhum teste falha quando um caminho novo de deny nasce sem receita. Foi no mundo pré-8.20 (mensagens piores) que os runs registrados queimaram tokens — e os gaps de contrato continuam capazes de recriar a espiral.
- **CR2 — Regras operacionais implícitas.** "Síncrono, nunca background para o controller", "stop com run ativo incrementa um contador fatal", "a saída canônica de cada bloqueio é X" — nada disso chega ao agente como instrução no momento do uso. As duas lições que destravaram o run E2 cabiam em 2 linhas.
- **CR3 — Estado distribuído frágil.** arm-marker + sentinel-state + pending_dispatches + step-ledger + exec-window + read-ledger + gate-decisions + protocol-events, cada um com sua vida. Cada inconsistência possível entre eles já virou um deadlock real. Não existe invariante de liveness ("de todo estado bloqueável existe ao menos uma ação permitida que progride") verificada por teste.
- **CR4 — Régua descalibrada.** Cobra a matriz de gates de código de workflows que não a têm; pune runs selados; realimenta o sistema corretivo com ruído.
- **CR5 — Custo estrutural do protocolo.** Subagentes sem canal com o usuário (Achado #7) forçam o parent-intermediário; 10 hooks em série por spawn; ~4.650 linhas de orquestração residente antes do primeiro prompt de trabalho diluem instruções (instruction dilution) — o que agrava CR2.
- **CR6 — Mensagem de recuperação cega ao destinatário.** Os textos de deny assumem que quem os lê é o parent com a ferramenta Agent disponível; quando o bloqueio atinge um subagente N2 (que não tem Agent, por Achado #7), o remédio instruído é inexecutável — o N2 só pode emitir um bloco e encerrar, e nenhuma mensagem diz isso.

---

## 4. Proposta de correção definitiva

Princípio único: **o enforcement passa a entregar o trilho, não só a cerca.** Três pilares, do mais barato/urgente ao mais estrutural:

### P1 — Next-Action Contract (todo deny carrega a próxima ação literal)

*(A v8.20.0/v8.22.0 já fez isso à mão para os gates mais quentes; este pilar transforma a prática em contrato universal, testado e ciente de destinatário.)*

- Novo SSOT `lib/next-action.cjs`: dado (estado do run, gate, ferramenta negada, **destinatário**), resolve **a próxima ação válida** como texto executável — ex.: `Agent(subagent_type: "pipeline-orchestrator:executor:executor-controller", prompt: "<retomar batch N>")`, ou o comando exec-window exato, ou "responda o GATE_REQUEST pendente via AskUserQuestion".
- **Ciente do destinatário (fecha CR6):** o resolvedor distingue parent × subagente (os hooks já registram spawns via dispatch-record; um deny dentro de janela de subagente despachado é detectável). Para um N2 sem Agent tool, a next_action NUNCA é "despache X" — é "emita o bloco `<TIPO>` com o payload Y e encerre; o parent processa" (o único remédio que ele consegue executar).
- TODO caminho de deny de TODO hook passa a emitir o envelope padronizado: `O QUE HOUVE` (1 linha) + `PRÓXIMA AÇÃO` (literal copy-paste) + `NUNCA` (editar `.pipeline/state`, desligar enforcement, rodar controller em background) + ponteiro para a skill `unblock` (P2).
- O descritor corretivo (`corrective_trigger`) NUNCA mais é gravado vazio — mesmo builder.
- **Teste varredor:** enumera estaticamente todos os caminhos `decision: block|deny` dos hooks e falha se algum não produzir `next_action` não-vazio e executável.

### P2 — Skill `unblock` + instruções operacionais como skills de procedimento

- **Nova skill `pipeline-orchestrator:unblock`** (o "lugar único para ir quando travado"): roda um script determinístico que lê o estado real (arm, pending, exec-window, step-ledger, locks, TTLs) e imprime diagnóstico + a UMA ação que destrava — ou executa a limpeza segura quando for caso de órfão (o que hoje só o TTL/restart faz). Toda mensagem de deny aponta para ela.
- **Fatiar as instruções operacionais em mini-skills de propósito único** carregadas just-in-time (abrir/fechar janela de execução; responder GATE_REQUEST; despachar o passo N; fechar um run; operar síncrono) em vez dos mega-prompts — aplicando o playbook de skills da Anthropic citado pelo usuário: skills focadas ("as melhores cabem numa única categoria; as que tentam demais confundem o agente"), progressive disclosure (SKILL.md enxuto + arquivos de apoio lidos na hora certa), e estado persistente para procedimento confiável.
- **Duas linhas permanentes no prompt de todo controller/executor** (a lição nº 1 e nº 2 do relato E2): "Trabalhe SÍNCRONO — nunca rode controller/subagente governado em background para 'esperar'"; "Bloqueado? NUNCA contorne — invoque a skill unblock".

### P3 — Liveness garantida + contração do estado + régua por workflow

- **Stop-cap ciente de espera:** antes de incrementar a continuidade, o stop-gate verifica se há dispatch/subagente em andamento registrado (pending_dispatches vivo com spawn confirmado); espera legítima não conta para o cap. Cenário de regressão novo: "run com background wait não vira hard_failed".
- **Suíte de liveness:** para cada estado bloqueável simulável (matriz de estados dos gates), verifica que a `next_action` resolvida pelo P1 **não é negada por nenhum outro gate** — a classe ovo-e-galinha (8.20/8.22) passa a ser pega em teste, não em produção.
- **Contração gradual do estado:** marcadores paralelos (arm-pending, read-ledger…) viram campos do sentinel-state assinado único onde couber — menos arquivos, menos combinações de inconsistência, menos TTLs independentes.
- **Régua por workflow (concluir a spec S2, agora destravável pós-8.22.0):** o avaliador cobra apenas os gates aplicáveis ao workflow do run (spec-authoring não espera TDD/CHECKPOINT/ADVERSARIAL de código); run selado limpo ⇒ ≥90.

### Alternativa registrada (Opção B — não recomendada como definitiva)

Rebaixar os gates de **processo** para `warn` (observar sem bloquear), mantendo `deny` só nos de **integridade** (tamper, seal, scope-lock). Reduz o desperdício imediatamente, mas abre mão da tese central do produto (enforcement determinístico). Fica documentada como fallback operacional — parcialmente já existente via `PIPELINE_AUTONOMOUS_RECOVERY_MODE` (v8.18.1) — para runs autônomos longos enquanto P1–P3 não estão entregues.

---

## 5. Critérios de aceite mensuráveis

1. 100% dos caminhos de deny com `next_action` literal (teste varredor verde).
2. Zero `corrective_trigger` com `corrective` vazio.
3. Suíte de liveness verde: nenhum estado bloqueável sem saída permitida.
4. Cenário "espera em background" não converte run em `hard_failed`.
5. Run spec-authoring selado limpo avalia ≥ 90/100.
6. Métrica de acompanhamento por run: gatilhos corretivos → tendência 0; denials consecutivos do mesmo gate na mesma sessão ≤ 2.

## 6. Sequenciamento sugerido

1. **Fase 1 (maior alívio por token):** P1 (next-action em todos os denies + builder corretivo nunca-vazio) + skill `unblock` + as 2 linhas operacionais nos controllers.
2. **Fase 2:** P3a stop-cap ciente de espera + suíte de liveness.
3. **Fase 3:** conclusão da spec S2 (régua por workflow) — retomar pelo HANDOFF existente.
4. **Fase 4 (estrutural, via spec própria):** fatiamento das skills de procedimento + contração do estado distribuído.

## 7. Referências

- Telemetria: `.pipeline/state/corrective-triggers.jsonl` (raiz + claude-code), `.pipeline/eval-log.jsonl`, run `2026-06-29-telemetry-instrumentation-spec` (`e2e-eval.md`, `sentinel-state.json`)
- Código citado: `.claude/hooks/pipeline-arm-gate.cjs:236-244`, `.claude/hooks/stop-gate-hook.cjs:50,201-210`, `hooks/hooks.json`
- Diagnóstico anterior: memória de sessão 2026-07-07 (27 gatilhos, 3 famílias); auditoria de workflows 2026-07-03; spec `workflow-audit-remediation` (S2 in-flight, v8.21.0 reservada)
- Anthropic: "Lessons from building Claude Code: How we use skills" + "Equipping agents for the real world with Agent Skills" (claude.com/blog · anthropic.com/engineering)

---

## Anexo A — Inventário dos hooks bloqueadores (varredura 2026-07-08)

- 37 scripts (~12.300 linhas) em `.claude/hooks/`; 36 registrados em 8 eventos (41 comandos de hook); **19 podem negar**; com as libs de enforcement de `lib/` (~3.900), a camada efetiva ≈ 11.300 linhas.
- Por evento: PreToolUse 19 (15 negam) · Stop 5 (2: stop-gate, e2e-eval) · SubagentStop 2 (1: subagent-stop-commit) · SessionStart 3+1 prompt (1 condicional-strict) · UserPromptSubmit 3 (0) · PostToolUse 7 (0 — corrective-dispatch é observador) · SessionEnd/StopFailure: stop-gate nunca bloqueia nesses eventos.
- ~40 invariantes; **~34 com ação exata** na mensagem (pós-8.20/8.22); **~9 semi-acionáveis** (`*_STATE_CORRUPT`/`*_UNVERIFIED`, internal-error do edit-guard — sem escape warn —, caminhos HMAC-strict).
- Bloqueadores principais (linhas): dispatch-guard 1.160 (5 caminhos) · edit-guard 985 (5 caminhos; SSOT de descoberta de estado) · pipeline-arm-gate 689 (4 invariantes; grava o corrective-trigger — hoje vazio p/ INLINE_WORK_BLOCKED) · sentinel-hook 541 · stop-gate 459 (CONTINUITY_CAP=3 → hard_failed) · subagent-stop-commit 435 (cap 3) · scope-lock 429 · e2e-eval-gate 286 · dispatch-pending-gate 285 · dispatch-record 280 (só corrupt) · spec-seal-guard 273 · parallel-dispatch 254 (warn-first) · step-ledger 218 · audit-read-budget 125+290 · gate-log 122 · checkpoint-verdict 124 · batch-review 128 · phase-verdict 74.
- Saídas canônicas que as mensagens apontam: (1) `Agent(subagent_type: "pipeline-orchestrator:core:pipeline-controller", prompt: <tarefa>)` — a ação canônica; (2) re-dispatch com payload prependado (DISPATCH_RESULTS/GATE_RESPONSES/PLAN_MODE_RESULTS); (3) TTLs de 30 min (ARM, HANDSHAKE) + cleanup-orphan no SessionStart; (4) escape env `PIPELINE_*_ENFORCEMENT=warn` por gate; (5) `references/gates.md` e `references/implementation-discipline.md`.

## Anexo B — Superfície de instruções (varredura 2026-07-08)

- Corpus `.md`: **~48.200 linhas** — agents/ 14.386 (50 arquivos; core 4.446, type-specific 5.367, quality 2.180, executor 1.764, brainstorm 629) · skills/ 19.164 (191) · commands/ 3.037 (15; pipeline.md 1.224) · references/ 11.609 (77).
- Top agentes: pipeline-controller **1.738** (103 menções de fase, 41 steps, 81 tokens de gate — toda a mecânica de recuperação vive aqui) · executor-controller 434 · executor-implementer-task 420 · task-orchestrator 419 · spec-closer 400.
- Espinha residente de um run FULL: 1.224 + 1.738 + 434 = **3.396 linhas** + ~1.252 de references grep-carregadas ≈ **4.650 antes do 1º prompt de trabalho**; run pesado atravessa ~18-20 mil linhas.
- Receita de recuperação de bloqueio vive em 3 lugares — mensagem do hook (endereçada ao parent), `references/gate-request-protocol.md` (260, grep-loaded), re-entry contract do controller. **Workers N2: zero.** O executor-implementer-task (420 linhas) não menciona exec-window; usa "BLOCKED" com sentido de RELATÓRIO (oposto ao do hook). **Não existe skill/command de unblock/recovery de runtime.**
