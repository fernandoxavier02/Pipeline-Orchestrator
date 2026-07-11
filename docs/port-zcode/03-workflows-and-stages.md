# 03 — Workflows e Etapas

> Mapeia os vinte e quatro entry points do pipeline, organizados por tipo e variante, com composição do time de agentes e gates disparados em cada transição de fase. Cada entry point é descrito como cenário BDD (dado/quando/então).

## Veredicto

A matriz de roteamento tipo × complexidade produz a maior parte dos vinte e quatro entry points. Cada um segue as quatro fases universais (zero, um e meio, dois, três), mas com times de agentes e profundidade diferentes. O roteamento é todo lógica em libs de Node — port direto.

A conta dos vinte e quatro: sete tipos roteáveis (Bug Fix, Feature, Refactor, User Story, Audit, UX Sim, Spec) têm três entry points cada (atalho + light + heavy) = vinte e um; Spec ainda tem o quarto (spec-audit-only, disparado por fase); Review é modo único; pipeline é o guarda-chuva auto-classify. Vinte e um + um (spec-audit-only) + um (review) + um (pipeline) = vinte e quatro.

---

## TDD checklist (critérios verificáveis)

- [x] T1: contagem de entry points == vinte e quatro (verificável no JSON de entry points)
- [x] T2: cada entry point tem tipo, variante, time, gates
- [x] T3: os oito tipos de tarefa estão nomeados (Bug Fix, Feature, Refactor, User Story, Audit, UX Simulation, Spec, Review)
- [x] T4: as três complexidades estão nomeadas (SIMPLES, MEDIA, COMPLEXA)
- [x] T5: cenários BDD usam dado/quando/então
- [x] T6: nenhum caminho de arquivo na prosa narrativa
- [x] T7: nenhum acrônimo sem expansão na primeira ocorrência

---

## Termos do domínio usados neste arquivo

Complementam o glossário do arquivo de visão geral.

- **entry point** — comando que inicia um pipeline (ex.: o comando principal de bugfix).
- **variante** — qual versão do pipeline: light (enxuto, médias e simples) ou heavy (completo, complexas). Direto é sem pipeline.
- **time** — conjunto de agentes N2 que executam o trabalho, sob o controlador N1.
- **complexidade** — tamanho da tarefa: SIMPLES (um a dois arquivos), MEDIA (três a cinco), COMPLEXA (seis ou mais).
- **tipo** — natureza da tarefa: conserto de bug, funcionalidade, refactor, user story, auditoria, simulação de UX, spec, ou review.
- **DIRETO** — sem pipeline, execução direta com build e teste.
- **ATDD** — Acceptance Test-Driven Development, "desenvolvimento guiado por testes de aceite": critérios de aceite viram testes antes do código.
- **PII** — Personally Identifiable Information, "informação pessoal identificável": dados que identificam uma pessoa (CPF, e-mail, etc.). Tocar em PII escala a complexidade da tarefa.
- **diff** — diferença entre o código antes e depois da mudança. Usado para medir o escopo do que foi alterado.
- **nó** (do inglês "node") — cada passo numa árvore de tarefas do Paperclip; no hotfix, o fluxo compactado tem doze passos.
- **SSOT** (Single Source of Truth, "fonte única de verdade") — arquivo que é a referência autoritativa para algum dado; outras fontes devem espelhar, não contradizer.

---

## A matriz de roteamento

Tipo × Complexidade → variante. Esta tabela é a fonte de verdade para qual pipeline dispara em qual caso.

| Tipo \ Complexidade | SIMPLES | MEDIA | COMPLEXA |
|---|---|---|---|
| Bug Fix | DIRETO | bugfix-light | bugfix-heavy |
| Feature | DIRETO | feature-light | feature-heavy |
| Refactor | DIRETO | refactor-light | refactor-heavy |
| User Story | DIRETO | user-story-light | user-story-heavy |
| Audit | DIRETO | audit-light | audit-heavy |
| UX Simulation | DIRETO | ux-sim-light | ux-sim-heavy |
| Spec | DIRETO | spec-light | spec-heavy |
| Review | (n/a — modo único) | review | (n/a) |

DIRETO = execução direta sem pipeline, máximo dois arquivos e menos de trinta linhas.

Exceções à matriz:

- **spec-audit-only** — disparado por fase (quando tasks.md está cem por cento completo e spec.json.phase != closed), não por complexidade.
- **hotfix** — modo de emergência, tipo Bug Fix fixo COMPLEXA severidade Critical.

---

## Os vinte e quatro entry points em cenários BDD

Cada cenário segue o formato dado/quando/então. Gates listados são os formais; enforcements determinísticos (os sete do arquivo de gates) disparam implicitamente em todos.

### Bug Fix (três entry points)

```
Cenário: bugfix-light (MEDIA, três a cinco arquivos)
  Dado que o usuário invoca /pipeline-orchestrator:bugfix com tarefa MEDIA
  Quando o classifier roda (Bug Fix × MEDIA)
  Então o sistema seleciona variante bugfix-light
  E despacha o time em sequência:
      bugfix-diagnostic-agent → executor-implementer-task → bugfix-regression-tester
  E skipa bugfix-root-cause-analyzer (heavy-only)
  E dispara gates: INFO_GATE_BLOCKED, TDD_APPROVAL, ADVERSARIAL_BLOCK,
                   ADVERSARIAL_GATE, CLOSEOUT_CONFIRM
```

```
Cenário: bugfix-heavy (COMPLEXA, seis ou mais arquivos)
  Dado que o usuário invoca /pipeline-orchestrator:bugfix-heavy com tarefa COMPLEXA
  Quando o classifier roda (Bug Fix × COMPLEXA)
  Então o sistema seleciona variante bugfix-heavy
  E despacha o time completo:
      bugfix-diagnostic-agent → bugfix-root-cause-analyzer
      → executor-implementer-task → bugfix-regression-tester
  E dispara os mesmos gates do light MAIS DESIGN_INTERROGATOR_FORCED
```

```
Cenário: bugfix atalho (auto-classify)
  Dado que o usuário invoca /pipeline-orchestrator:bugfix sem --light/--heavy
  Quando o classifier determina complexidade automaticamente
  Então cai em bugfix-light (MEDIA) ou bugfix-heavy (COMPLEXA) conforme classificação
  E SIMPLES cai em DIRETO (sem pipeline)
```

### Feature (três entry points: feature-light, feature-heavy, feature atalho)

> O cenário atalho (auto-classify sem --light/--heavy) é omitido por brevidade — funciona igual ao do Bug Fix: cai em light (MEDIA) ou heavy (COMPLEXA) conforme classificação, e SIMPLES cai em DIRETO.

```
Cenário: feature-light (MEDIA)
  Dado que o usuário invoca /pipeline-orchestrator:feature com tarefa MEDIA
  Quando o classifier roda (Feature × MEDIA)
  Então seleciona feature-light
  E despacha: feature-vertical-slice-planner → feature-implementer
  E skipa feature-integration-validator (heavy-only)
  E dispara gates: TDD_APPROVAL, ADVERSARIAL_GATE, ADVERSARIAL_BLOCK, CLOSEOUT_CONFIRM
```

```
Cenário: feature-heavy (COMPLEXA)
  Dado feature COMPLEXA invocada
  Quando classifier confirma
  Então time completo: feature-vertical-slice-planner → feature-implementer
                       → feature-integration-validator
  E dispara gates do light MAIS DESIGN_INTERROGATOR_FORCED e CHECKPOINT_FAIL estrito
```

### Refactor (três entry points: refactor-light, refactor-heavy, refactor atalho)

> Mesma regra de atalho dos demais: SEM flags, classifier decide; SIMPLES vai para DIRETO.

```
Cenário: refactor-light (MEDIA)
  Dado refactor MEDIA invocada
  Quando classifier roda
  Então time: pre-tester (caracterização) → executor-implementer-task
              → pre-tester (rerun caracterização)
  E skipa o trio adversarial (segurança, arquitetura, qualidade) — heavy-only
  E dispara REFACTOR_SCOPE_LOCK (valida CHANGE_CONTRACT assinado)
  E dispara TDD_APPROVAL, CHECKPOINT_FAIL, CLOSEOUT_CONFIRM
```

```
Cenário: refactor-heavy (COMPLEXA)
  Dado refactor COMPLEXA
  Então time light MAIS trio adversarial em paralelo:
      adversarial-security-scanner ‖ adversarial-architecture-critic ‖
      adversarial-quality-reviewer
  E dispara ADVERSARIAL_GATE_MANDATORY se tocar auth/cripto/dados
```

### User Story (três entry points: user-story-light, user-story-heavy, user-story atalho)

> Os cenários light e heavy são colapsados abaixo (são iguais ao Feature com passo extra de derivar critérios de aceite). Mesma regra de atalho dos demais.

```
Cenário: user-story-light/heavy
  Dado user-story invocada
  Quando classifier roda
  Então time é IGUAL ao feature (light ou heavy) mas com passo extra:
      derivar critérios de aceite da narrativa ("Como usuário, quero...")
  E dispara SPEC_AC_TRACEABILITY_GAP se não derivar ATDD por critério
```

### Audit (três entry points: audit, audit-light, audit-heavy)

```
Cenário: audit-light (MEDIA, sem keywords adversariais)
  Dado audit invocada em módulo sem keywords de adversarial review
  Quando classifier roda
  Então time: audit-intake → audit-compliance-checker → audit-risk-matrix-generator
  E skipa audit-domain-analyzer (heavy-only)
  E é report-only (não muda código)
  E dispara INFO_GATE_BLOCKED, CLOSEOUT_CONFIRM (sem TDD_APPROVAL — não muda código)
```

```
Cenário: audit-heavy (COMPLEXA, sem keywords adversariais)
  Dado audit-heavy invocada em módulo SEM keywords de adversarial review
  E tarefa é classificada COMPLEXA (seis ou mais arquivos, ou domínio sensível)
  Quando classifier roda
  Então time completo: audit-intake → audit-domain-analyzer
                       → audit-compliance-checker → audit-risk-matrix-generator
  E é report-only
```

```
Cenário: audit atalho (auto-classify)
  Dado audit invocada sem --light/--heavy
  Quando classifier determina complexidade
  Então cai em audit-light (MEDIA) ou audit-heavy (COMPLEXA) conforme classificação
  E SIMPLES não usa pipeline (DIRETO)
```

```
Cenário: audit com keywords adversariais (sub-route, light ou heavy)
  Dado task_type == Audit E descrição contém keywords adversariais
      ("adversarial review", "security audit", "threat model")
  Quando usuário confirma o sub-route
  Então o time muda:
      light: adversarial-review-coordinator → adversarial-security-scanner
      heavy: adversarial-review-coordinator
             → adversarial-security-scanner ‖ adversarial-architecture-critic
  E pode propor fixes (review + ou - fix), não é report-only estrito
```

> Nota: o sub-route adversarial não é um entry point separado — é um desvio que o controlador de execução toma quando detecta as keywords. Os três entry points formais do tipo Audit são audit (atalho), audit-light e audit-heavy.

### UX Simulation (três entry points)

```
Cenário: ux-sim-light (MEDIA)
  Dado ux-sim invocada
  Então time: ux-simulator → ux-qa-validator
  E skipa ux-accessibility-auditor (heavy-only)
  E é report-only
```

```
Cenário: ux-sim-heavy (COMPLEXA)
  Dado ux-sim COMPLEXA
  Então time: ux-simulator ‖ ux-accessibility-auditor (paralelo) → ux-qa-validator
  E dispara gates de fechamento
```

```
Cenário: ux-sim atalho (auto-classify)
  Dado ux-sim invocada sem --light/--heavy
  Quando classifier determina complexidade
  Então cai em ux-sim-light (MEDIA) ou ux-sim-heavy (COMPLEXA) conforme classificação
  E SIMPLES cai em DIRETO (sem pipeline)
```

### Spec (quatro entry points: spec, spec-light, spec-heavy, spec-audit-only)

> O comando `spec` (sem sufixo) é o atalho auto-classify: cai em spec-light (MEDIA) ou spec-heavy (COMPLEXA ou domínio sensível) conforme classificação. SIMPLES vai para DIRETO.

```
Cenário: spec-light (MEDIA)
  Dado spec invocada para spec pequena/média
  Então time: brainstorm-controller → spec-controller → spec-format-gate → spec-closer
  E dispara SPEC_FORMAT_GATE_FAIL se formato falhar
```

```
Cenário: spec-heavy (COMPLEXA ou domínio sensível)
  Dado spec COMPLEXA ou spec em domínio com auth/cripto/pagamento/PII
  Então time do spec-light MAIS:
      spec-content-reviewer (doze eixos) e spec-adversarial-critic (treze eixos)
  E dispara SPEC_CONTENT_REVIEW_NOGO se revisor reportar crítico
```

```
Cenário: spec-audit-only (disparado por fase, não por complexidade)
  Dado spec.json.phase != closed E tasks.md está cem por cento completo
  Quando o trigger de fase dispara (não é classificação de complexidade)
  Então roda sequência de auditoria na spec já implementada
  E valida spec-post-impl (SPEC_POST_IMPL_FAIL se abaixo de setenta e cinco por cento)
  E é report-only (audita a spec, não muda código de produção)
```

### Review (um entry point)

```
Cenário: review (modo único, sem light/heavy)
  Dado /pipeline-orchestrator:review invocada em diff já escrito
  Quando detecta o diff
  Então três revisores em paralelo:
      adversarial-security-scanner ‖ adversarial-architecture-critic ‖
      adversarial-quality-reviewer
  E consolida via adversarial-review-coordinator
  E produz relatório de achados
  E NÃO corrige, NÃO comita, NÃO emite Pa de Cal formal
```

### Modo hotfix (não está na matriz; modo de emergência)

```
Cenário: hotfix (emergência crítica em produção)
  Dado hotfix invocada
  Então tipo, complexidade, severidade são fixos (Bug Fix / COMPLEXA / Critical)
  E fluxo compactado de doze nós:
      pula design e planejamento, mantém conserto + trio adversarial + Pa de Cal
  E dispara todos os gates mandatórios (não há bypass em hotfix)
```

### Pipeline (guarda-chuva — um entry point)

```
Cenário: pipeline (auto-classify)
  Dado /pipeline-orchestrator:pipeline invocada com tarefa qualquer
  Quando o classifier determina tipo × complexidade
  Então roteia para a variante certa (ex.: Feature-MEDIA → feature-light)
  E o usuário confirma a classificação na fase zero
  E segue as quatro fases com profundidade proporcional
  E suporta modos: FULL (default), DIAGNOSTIC (só classifica),
                   CONTINUE (retoma run), REVIEW-ONLY (só revisa)
```

---

## As quatro fases universais (detalhe)

Todo entry point passa pelas mesmas fases. A profundidade varia conforme complexidade.

### Fase zero — Triagem

Agentes: task-orchestrator (classifica), information-gate (identifica lacunas), design-interrogator (só COMPLEXA).

Gates disparados: INFO_GATE_BLOCKED, MICRO_GATE_GAP, COMPLEXITY_GATE (se override), CLARIFICATION_GAPS_DETECTED, CLARIFICATION_RESOLVED.

Saída: classificação proposta mostrada ao usuário.

### Fase um e meio — Planejamento

Agentes: plan-architect (monta plano no modo plano do harness).

Gates disparados: PLAN_REJECTED (se usuário rejeita), DESIGN_INTERROGATOR_FORCED.

Regras: automático em COMPLEXA e Spec; opcional em MEDIA (flag --no-prep pula o ciclo de brainstorm/spec); impossível bypassar em COMPLEXA.

### Fase dois — Execução

Time: varia conforme tipo e variante (visto nos cenários BDD acima).

Gates disparados por batch: TDD_APPROVAL, CHECKPOINT_FAIL, ADVERSARIAL_BLOCK, ADVERSARIAL_GATE, ADVERSARIAL_GATE_MANDATORY (se sensível), ADVERSARIAL_LOOP_CHECKPOINT, ADVERSARIAL_LOOP_BREAKER, FIX_LOOP_EXHAUSTED, PARALLEL_DISPATCH_VIOLATION.

Loops: máximo três tentativas de fix por ciclo, até quatro ciclos por batch, antes do escape diagnose-then-reimplement.

### Fase três — Fechamento

Agentes: sentinel (valida transição dois→três), sanity-checker, trio adversarial final em paralelo (security, architecture, quality), final-validator (produz Pa de Cal), finishing-branch (commit/push/relatório).

Gates disparados: STOP_BEFORE_PA_DE_CAL, FINAL_ADVERSARIAL_GATE, FINAL_ADVERSARIAL_REWORK, CLOSEOUT_CONFIRM, STOP_RULE (se falhas repetidas).

Saída: Pa de Cal (go ≥ zero vírgula oitenta / conditional ≥ zero vírgula sessenta / no-go < zero vírgula sessenta).

---

## Notas para o port

- Toda a lógica de roteamento está em duas libs de classificação e roteamento (Node puro, multiplataforma).
- Os times são definidos em texto markdown no registry de times.
- A detecção de domínio sensível (que escala gates SOFT para HARD) está numa lib dedicada de scan de domínio.
- Nada nesta seção é harness-specific. O port é copiar os arquivos de referência e as libs.

---

## Caminhos e comandos referenciados

```
# registry de entry points (SSOT machine-readable)
Pipeline-Orchestrator/references/entry-points.json

# registry de times (SSOT para composição de variantes)
Pipeline-Orchestrator/references/team-registry.md

# matriz de complexidade (SSOT para classificação)
Pipeline-Orchestrator/references/complexity-matrix.md

# arquivos de pipeline por variante (dezessete)
Pipeline-Orchestrator/references/pipelines/

# libs de classificação e roteamento
Pipeline-Orchestrator/lib/pipeline-workflow-classifier.cjs
Pipeline-Orchestrator/lib/step-1-7-routing.cjs
Pipeline-Orchestrator/lib/domain-scanner.cjs
```
