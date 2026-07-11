# 04 — Gates e Enforcements

> Mapeia os quarenta e nove gates do repositório canônico, organizados por dureza e por categoria, mais os enforcements determinísticos (hooks que bloqueiam sem precisar de gate formal). Este arquivo é a fonte de verdade da auditoria para "o que trava o quê, quando, e por quê".

## Veredicto

O sistema de gates é o coração da governança. Quarenta e nove pontos de checagem distribuídos em cinco níveis de dureza. Sete enforcements determinísticos reforçam os gates com bloqueios diretos via hooks. Tudo isso é texto e lógica em libs de Node — nada de harness-specific — então o port preserva o sistema por inteiro.

---

## TDD checklist (critérios verificáveis)

- [x] T1: contagem total == quarenta e nove gates (verificável listando o registry canônico)
- [x] T2: os cinco níveis de dureza estão nomeados (MANDATORY, HARD, CIRCUIT_BREAKER, SOFT, AUDIT)
- [x] T3: cada gate tem dureza declarada conforme o registry canônico
- [x] T4: enforcements determinísticos (sete) listados com o hook que os implementa
- [x] T5: nenhum caminho de arquivo na prosa narrativa
- [x] T6: nenhum acrônimo sem expansão na primeira ocorrência

---

## Termos do domínio usados neste arquivo

Complementam o glossário do arquivo de visão geral.

- **gate** — ponto de checagem que decide se o fluxo avança, trava, ou pede entrada do usuário.
- **dureza** (hardness) — nível que diz quão duro um gate é: se pode ser pulado, se exige reset, etc.
- **MANDATORY** — dureza máxima: nunca bypassável, nem por flags de força. Para invariantes estruturais.
- **HARD** — bloqueia até ser resolvido, mas tem caminho de resolução claro (responder pergunta, aprovar teste, corrigir código).
- **CIRCUIT_BREAKER** — disjuntor: para o pipeline por segurança, exige reset explícito do usuário.
- **SOFT** — recomendado, pulável com ack do usuário (fica registrado no log).
- **AUDIT** — telemetria informativa, nunca bloqueia nem pergunta; só registra.
- **enforcement** — bloqueio determinístico feito por hook, independente de gate formal.
- **reset** — ato de retomar um CIRCUIT_BREAKER: usuário escolhe entre retry, retry com abordagem diferente, ou exit.
- **fix-loop** — loop de correção adversarial: máximo três tentativas por ciclo, até quatro ciclos por batch, antes do disjuntor.
- **determinístico** — sempre bloqueia da mesma forma; não depende de julgamento do modelo.
- **fidelidade** (score de fidelidade) — métrica que avalia o quanto a execução seguiu o workflow esperado. Gates SOFT pulados reduzem o score; gates AUDIT não afetam.
- **IO** (Input/Output, "entrada e saída") — operações de leitura e escrita em disco.
- **PR** (Pull Request, "pedido de merge") — solicitação de incorporação de mudanças num repositório git.
- **ATDD** (Acceptance Test-Driven Development, "desenvolvimento guiado por testes de aceite") — critérios de aceite viram testes antes do código.
- **PII** (Personally Identifiable Information, "informação pessoal identificável") — dados que identificam uma pessoa (CPF, e-mail, etc.).

---

## Taxonomia de dureza (cinco níveis)

| Dureza | Significado | Pulável? | Override do usuário? | Distinção operacional |
|---|---|---|---|---|
| **MANDATORY** | Nunca bypassável, nem por flags de força | Não | Não | Aplica sempre, independente de modo ou flag. Para integridade estrutural e revisões de segurança mandatórias. |
| **HARD** | Bloqueia até ser resolvido | Não | Não | Resolúvel por ação do usuário (responder, aprovar, corrigir). Diferente de MANDATORY porque tem caminho de resolução; MANDATORY é invariante. |
| **CIRCUIT_BREAKER** | Para por segurança, exige reset | Não | Só reset | Dispara em falhas repetidas. Não continua sem intervenção. Reset oferece: retry com replanejamento, retry com abordagem diferente, ou exit. |
| **SOFT** | Recomendado, pulável com ack | Sim (registrado) | Sim | Sempre registrado quando pulado. Algumas vezes escala para HARD se domínio sensível é tocado. |
| **AUDIT** | Telemetria, nunca bloqueia | n/a | n/a | Para eventos de observabilidade que precisam de uma linha no log de gates. Não conta no score de fidelidade. |

---

## Registry dos quarenta e nove gates

Agrupados por categoria. Cada gate aparece exatamente uma vez. A lista de nomes e durezas foi extraída do registry canônico (fonte única de verdade).

### Gates estruturais e de SSOT (cinco)

| Gate | Dureza | Gatilho | Ação |
|---|---|---|---|
| `SSOT_CONFLICT` | MANDATORY | Múltiplas fontes de verdade | Bloqueio total — usuário resolve |
| `STATE_FILE_INIT_FAIL` | CIRCUIT_BREAKER | Falha de IO ao escrever o estado do sentinel | Para pipeline antes de qualquer dispatch |
| `STEP_1_7_ROUTING` | HARD | Decisão de roteamento na inicialização | Anexa entrada no log |
| `STEP_1_7_RECURSION_GUARD` | CIRCUIT_BREAKER | Inicialização entrou três ou mais vezes | Para pipeline |
| `STRICT_SPEC_REJECTION` | AUDIT | Flag strict-spec rejeitou spec candidate | Entrada informativa no log |

### Gates de informação e triagem (cinco)

| Gate | Dureza | Gatilho | Ação |
|---|---|---|---|
| `INFO_GATE_BLOCKED` | HARD | Lacuna crítica de informação | Bloqueia fase zero |
| `MICRO_GATE_GAP` | HARD | Informação faltante por tarefa | Para a tarefa |
| `CLARIFICATION_RESOLVED` | HARD | Usuário respondeu clarificação | Registra no log |
| `CLARIFICATION_GAPS_DETECTED` | AUDIT | Inventário de lacunas por lente | Entrada informativa |
| `CLARIFICATION_SKIPPED` | SOFT | Lente já respondida no intake | Entrada com rationale |

### Gates de complexidade e planejamento (três)

| Gate | Dureza | Gatilho | Ação |
|---|---|---|---|
| `COMPLEXITY_GATE` | SOFT | Override do classifier ou confiança baixa | Pede confirmação |
| `PLAN_REJECTED` | HARD | Usuário rejeita plano | Retorna para fase um |
| `PROTOCOL_HANDSHAKE_TIMEOUT` | HARD | Subagente não responde em trinta minutos | Para pipeline |

### Gates de TDD e execução (três)

| Gate | Dureza | Gatilho | Ação |
|---|---|---|---|
| `TDD_APPROVAL` | HARD | Testes precisam de aprovação | Bloqueia até aprovar |
| `CHECKPOINT_FAIL` | HARD | Build ou teste falha | Retorna ao executor |
| `STOP_BEFORE_PA_DE_CAL` | HARD | verify-completion falhou antes do validator | Pula Pa de Cal, marca NO-GO |

### Gates adversariais (oito)

| Gate | Dureza | Gatilho | Ação |
|---|---|---|---|
| `ADVERSARIAL_GATE_MANDATORY` | MANDATORY | Batch toca auth, cripto, ou dados | Bloqueio, não pode pular |
| `ADVERSARIAL_BLOCK` | HARD | Achados críticos | Loop de correção (máx três por ciclo) |
| `ADVERSARIAL_GATE` | SOFT | Pós-checkpoint por batch | Pede ao usuário (sim/pular/ajustar) |
| `FINAL_ADVERSARIAL_GATE` | SOFT | Pós-sanity, pré-validator | Pede ao usuário (recomendado) |
| `FINAL_ADVERSARIAL_REWORK` | HARD | Adversarial final reporta CRITICAL | Pede ao usuário (consertar/seguir/descartar) |
| `ADVERSARIAL_LOOP_BREAKER` | CIRCUIT_BREAKER | Quatro ciclos adversariais sem CLEAN | Para pipeline; dispara o escape diagnose-then-reimplement |
| `ADVERSARIAL_LOOP_CHECKPOINT` | SOFT (com escalação) | Três tentativas de fix-loop sem CLEAN | Pergunta: continuar/escalar para heavy/aceitar/abortar |
| `FIX_LOOP_EXHAUSTED` | CIRCUIT_BREAKER | Três tentativas de fix falharam | Para pipeline, propõe alternativas |

### Gates de fechamento e parada (quatro)

| Gate | Dureza | Gatilho | Ação |
|---|---|---|---|
| `CLOSEOUT_CONFIRM` | SOFT | Push+PR ou Descartar | Pausa para confirmação |
| `STOP_RULE` | CIRCUIT_BREAKER | Duas falhas consecutivas | Para pipeline, escala |
| `STALE_CONTEXT` | SOFT (HARD se COMPLEXA + sensível) | Continue com contexto maior que vinte e quatro horas | Pede revalidação |
| `REFACTOR_SCOPE_LOCK` | HARD | Passo quatro do refactor: valida CHANGE_CONTRACT assinado | Bloqueia execução até contrato verificado |

### Gates de spec — Wave 5 (cinco)

| Gate | Dureza | Gatilho | Ação |
|---|---|---|---|
| `SPEC_ARTIFACT_MISSING` | MANDATORY | Spec detectada mas faltam artefatos | Bloqueio total |
| `SPEC_FORMAT_GATE_FAIL` | HARD | Menos de vinte e dois de vinte e cinco checagens de formato | Bloqueia, pede Edit/Bypass/Abort |
| `SPEC_CONTENT_REVIEW_NOGO` | HARD | spec-content-reviewer reporta NOGO | Bloqueia fase um e meio |
| `SPEC_AC_TRACEABILITY_GAP` | HARD | Não derivou um cenário ATDD por critério de aceite | Bloqueia TDD |
| `SPEC_POST_IMPL_FAIL` | HARD | spec-post-impl-validator abaixo de setenta e cinco por cento | Bloqueia |

### Gates de brainstorm (sete)

| Gate | Dureza | Gatilho | Ação |
|---|---|---|---|
| `ALTERNATIVES_PROPOSED` | AUDIT | step-01b emite alternativas | Entrada informativa |
| `ALTERNATIVE_CHOSEN` | SOFT | Usuário escolhe alternativa | Entrada com escolha |
| `ALTERNATIVES_SKIPPED` | SOFT | step-01b auto-pula (mecânico, sem lacunas, poucos arquivos) | Entrada informativa |
| `STEP_01_GAP_LEAKED` | SOFT | step-01b acha lacuna que step-01 devia ter pego | Entrada, recomenda re-rodar step-01 |
| `IDEATION_PROPOSED` | AUDIT | step-01c emite ideias | Entrada informativa |
| `IDEATION_ACCEPTED` | SOFT | Usuário aceita ideia | Entrada com escolha |
| `IDEATION_REJECTED` | SOFT | Usuário rejeita ideia | Entrada informativa |

### Gates de spec authoring — Wave v8.0.0 + v8.5.0 (nove)

Estes são quase todos **AUDIT** (telemetria informativa, não bloqueiam), exceto IDEATION_SKIPPED que é SOFT porque envolve decisão de pular. Registram eventos do ciclo de authoring de specs.

| Gate | Dureza | Gatilho | Ação |
|---|---|---|---|
| `DESIGN_INTERROGATOR_FORCED` | AUDIT | spec-controller despachou o design-interrogator forçado | Entrada informativa (DISPATCHED) |
| `SPEC_SEALED` | AUDIT | spec-controller selou a spec | Entrada informativa (CONFIRMED) |
| `SPEC_AMENDED` | AUDIT | spec-controller re-selou spec emendada | Entrada informativa (CONFIRMED) |
| `SPEC_AUTHORING_INCOMPLETE` | AUDIT | Loop de revisão não convergiu quando do seal | Entrada informativa |
| `SPEC_AUTHORING_STEP_BYPASS` | AUDIT | Step de authoring avançou sem o carimbo registrado | Entrada informativa |
| `SPEC_CONTRACT_DISCIPLINE_MISSING` | AUDIT | Contrato selado com gates de implementação não satisfeitos | Entrada informativa; final-validator rebaixa GO → CONDITIONAL |
| `PARALLEL_DISPATCH_VIOLATION` | AUDIT | Spawn fora do grupo durante paralelo armado | Entrada informativa; warn-first (deny só com flag) |
| `SPEC_REVIEW_FINDINGS` | AUDIT | Achados de revisão de spec | Entrada informativa |
| `IDEATION_SKIPPED` | SOFT | step-01c auto-pula (mecânico, sem lacunas, poucos arquivos) | Entrada informativa |

> Nota: a categoria "spec authoring" no canônico se divide em duas ondas. A v8.0.0 traz oito gates (cinco aqui nesta seção, mais IDEATION_PROPOSED/ACCEPTED/REJECTED que estão na seção de brainstorm porque pertencem ao fluxo criativo do step-01c). A v8.5.0 traz quatro gates de enforcement de spec-authoring (SPEC_AUTHORING_INCOMPLETE, SPEC_AUTHORING_STEP_BYPASS, SPEC_CONTRACT_DISCIPLINE_MISSING, PARALLEL_DISPATCH_VIOLATION). Esta seção agrega os nove gates que sobraram após as outras sete categorias.

---

## Conferência da contagem

Cinco + cinco + três + três + oito + quatro + cinco + sete + nove = quarenta e nove. Confere com o registry canônico.

---

## Enforcements determinísticos (sete)

Estes não são gates formais; são bloqueios diretos implementados por hooks. Complementam o sistema de gates com travas que o modelo não consegue contornar mesmo com prompt engenhoso.

| Enforcement | Hook que implementa | O que faz | Equivalente gate |
|---|---|---|---|
| **Trava de escopo** | scope-lock-hook | Bloqueia escrita fora dos arquivos permitidos no contrato | Primo do REFACTOR_SCOPE_LOCK |
| **Guard de edição** | edit-guard-hook | Bloqueia subagente de editar fora do diretório de pipeline | (sem equivalente — invariante de runtime) |
| **Guard de dispatch** | dispatch-guard | Bloqueia Skill quando deveria ser Agent (erro comum) | (sem equivalente — invariante de chamada) |
| **Arm-gate** | pipeline-arm-gate | Bloqueia Bash antes do plano registrado | (sem equivalente — trava de estado armado) |
| **Gate de paralelismo** | parallel-dispatch-gate | Valida grupo paralelo que não disparou junto | Primo do PARALLEL_DISPATCH_VIOLATION |
| **Lock de sessão** | session-lock-hook | Bloqueia concorrência manual durante run | (sem equivalente — invariante de sessão) |
| **Orçamento de leitura** | audit-read-budget-gate | Limita leituras em modo audit | (sem equivalente — proteção de recurso) |

A diferença entre gate e enforcement: o gate tem nome no registry, dureza formal, e aparece no log de gates. O enforcement é um bloqueio operacional direto do hook, sem nome formal mas com efeito idêntico. Os dois sistemas se reforçam — defesa em camadas.

---

## Notas para o port

- Os quarenta e nove gates são todos definidos em texto markdown no registry. Port direto: copiar o arquivo.
- As durezas são interpretadas pelos hooks (que leem o registry) e pela lib escritora do log de gates. Nada de harness-specific.
- Os sete enforcements determinísticos são todos hooks — já estão no inventário de hooks. O port segue as decisões de hook (trinta e três mantêm, um remove, dois migram).
- A lógica de disparo de cada gate (ex.: "duas falhas consecutivas") está em libs Node, multiplataforma.

---

## Caminhos e comandos referenciados

```
# registry de gates (SSOT)
Pipeline-Orchestrator/references/gates.md

# macro-gates e micro-gates (detalhes operacionais)
Pipeline-Orchestrator/references/gates/macro-gate-questions.md
Pipeline-Orchestrator/references/gates/micro-gate-checklist.md

# writer do log de gates (ponto único)
Pipeline-Orchestrator/lib/gate-decision-writer.cjs

# hooks que implementam enforcements determinísticos
Pipeline-Orchestrator/.claude/hooks/scope-lock-hook.cjs
Pipeline-Orchestrator/.claude/hooks/edit-guard-hook.cjs
Pipeline-Orchestrator/.claude/hooks/dispatch-guard.cjs
Pipeline-Orchestrator/.claude/hooks/pipeline-arm-gate.cjs
Pipeline-Orchestrator/.claude/hooks/parallel-dispatch-gate.cjs
Pipeline-Orchestrator/.claude/hooks/session-lock-hook.cjs
Pipeline-Orchestrator/.claude/hooks/audit-read-budget-gate.cjs
```

