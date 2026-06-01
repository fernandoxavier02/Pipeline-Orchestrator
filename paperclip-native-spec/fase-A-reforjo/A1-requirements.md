# A1 — Requirements da Fase A (Reforjo)

**Status:** Draft v1.1 (Onda A1 + calibração 2026-06-01)
**Data:** 2026-05-24 · calibrado 2026-06-01
**Depende de:** 00-VISION.md, 00-PRINCIPIOS-COMUNS.md, A0-CALIBRACAO-pos-execucoes-2026-06-01.md
**Metodologia:** ATDD (critérios antes do conteúdo), BDD (Given/When/Then por capacidade), DDD (linguagem ubíqua do domínio)

> ⚠️ **CALIBRADO PÓS-EXECUÇÕES — ver `A0-CALIBRACAO-pos-execucoes-2026-06-01.md`.** O substrato de estado deixou de ser o campo `executionState` (provado morto no spike T-A2-01) e passou a ser **comentários estruturados `PIPELINE_STATE`**. Onde este documento disser `executionState.pipeline.*`, leia o comentário equivalente (A0 §3). Os critérios C3-A, C5-A, HC2-A e SC3-A já foram corrigidos abaixo.

---

## Critérios de aceitação deste documento (ATDD — antes da escrita)

```gherkin
Feature: A1-requirements descreve o que a Fase A deve entregar

  Scenario: Capacidades cobertas
    Given o programa Fase A está planejado
    When eu leio A1-requirements.md
    Then vejo 8 capacidades numeradas (C1-A a C8-A) com descrição clara
    And cada capacidade tem critério de aceitação em formato Given/When/Then

  Scenario: Restrições duras documentadas
    Given a Iron Law e os Princípios Comuns estão definidos
    When eu leio A1-requirements.md
    Then vejo 6 restrições duras (HC1-A a HC6-A) adaptadas ao contexto de reforjo
    And cada restrição é verificável de forma binária (passou/falhou)

  Scenario: Mapeamento canônico presente
    Given o canonical tem 35 portões e 48 cargos
    When eu leio A1-requirements.md
    Then encontro referência ao mapping completo nas tabelas da Fase A
    And os números estão corretos (35 portões, 47 agentes CC, 48 cargos Paperclip)
```

---

## 1. Por que a Fase A existe

A paridade entre o Paperclip e o Claude Code canônico está em torno de 70-75% (`PARITY_VERDICT=PASS_WITH_NOTES`, medido em v7.6.0). Os agentes Paperclip podem:
- Improvisar decisões críticas sem approval explícito
- Pular revisão adversarial ("pequeno demais")
- Deixar de registrar portões disparados
- Tomar próxima tarefa sem resolver bloqueios

A Fase A resolve isso adicionando enforcement via primitivos nativos do Paperclip — sem construir novo código JavaScript na Onda A1, sem modificar o plugin canônico, sem reescrever os 48 agentes do zero.

---

## 2. Capacidades da Fase A (C1-A a C8-A)

As capacidades abaixo são o que a Fase A completa (Ondas A1+A2+A3) deve entregar. Onda A1 cobre apenas a documentação; as capacidades em si são implementadas nas ondas seguintes.

### C1-A — Mapeamento Completo de Portões

**Descrição:** Toda decisão de portão do canonical (35 portões em 5 níveis de dureza) tem um equivalente explícito no Paperclip via approval type no formato `pip:*` ou `pip-spec:*`.

**Critério de aceitação:**
```gherkin
Given o canonical tem 35 portões definidos em references/gates.md
When a Fase A está completa (Ondas A1+A2+A3)
Then existe um approval type pip:* ou pip-spec:* para cada portão
And cada approval type tem payload JSON com os campos: gate_name, hardness, trigger, decision, evidence, timestamp
And portões MANDATORY nunca podem ser resolvidos como "skipped" (validado por lint da lib)
```

### C2-A — Protocolo de Não-Autonomia Universal

**Descrição:** Todo cargo (AGENTS.md) tem um INVARIANTS block no topo que lista o que nunca fazer, quando criar approval issue, e qual spec de workflow seguir. Nenhum cargo opera sem esse bloco.

**Critério de aceitação:**
```gherkin
Given um cargo qualquer dos 48 no Paperclip
When o cargo está reforçado (Onda A3)
Then seu AGENTS.md começa com um bloco ### INVARIANTS v1 antes de qualquer instrução de workflow
And o bloco lista: ações proibidas sem approval, trigger de escalation, referência ao workflow ativo
And o bloco é idêntico nos campos universais e personalizado nos campos cargo-específicos
```

### C3-A — Estado de Execução Rastreável

**Descrição:** Cada issue de pipeline mantém seu estado de execução — fase, portões disparados, hash chain, versão do registry — em **comentários estruturados `PIPELINE_STATE`** (append-only; o campo `executionState` está morto, ver A0 §3). O estado é auditável e verificável reconstruindo a corrente por `previous_hash`.

**Critério de aceitação:**
```gherkin
Given uma issue de pipeline em andamento
When qualquer portão é disparado
Then um comentário PIPELINE_STATE é postado com uma entrada contendo gate_name, hardness, decision, evidence, timestamp
And a entrada carrega previous_hash ligando-a à entrada anterior (hash chain SHA-256)
And a entrada registra a versão do registry usada (gate_registry_version)
```

### C4-A — Revisão Adversarial Enforced

**Descrição:** O trio adversarial (segurança, arquitetura, qualidade) roda como sub-tarefas obrigatórias após cada batch implementado. Cargo não pode avançar para próxima fase sem resolução das sub-tarefas adversariais.

**Critério de aceitação:**
```gherkin
Given um batch de implementação foi concluído
When o cargo executor finaliza o batch
Then cria 3 sub-tarefas adversariais (pip:adversarial-security, pip:adversarial-architecture, pip:adversarial-quality)
And as 3 sub-tarefas têm status initial = pending
And o cargo NÃO pode criar sub-tarefa do próximo batch enquanto qualquer adversarial tiver status != done
And findings CRITICAL ou HIGH bloqueiam o batch seguinte até resolução ou waiver explícito com approval do Board
```

### C5-A — Trilha de Auditoria Completa

**Descrição:** Toda decisão crítica do pipeline — criação de approval, mudança de status, resolução de finding, veredicto final — gera uma entrada no activity log do Paperclip E um comentário estruturado `PIPELINE_STATE` na issue. A trilha é não-repudiável via hash chain.

**Critério de aceitação:**
```gherkin
Given um pipeline completo rodou (do início ao Pa de Cal)
When o Board audita a execução
Then o activity log da issue principal contém entradas para cada portão disparado
And cada entrada tem: tipo de evento, cargo responsável, timestamp, resultado
And os comentários PIPELINE_STATE da issue contêm a mesma lista
And a hash chain pode ser verificada computacionalmente (sem gaps, sem adulterações)
```

### C6-A — Drift Detection Ativo

**Descrição:** Um cargo sentinel roda em cron verificando se outros cargos estão executando ações sem approval ou pulando etapas. Drift detectado gera approval issue de alerta para o Board em até 1 ciclo de heartbeat.

**Critério de aceitação:**
```gherkin
Given um cargo improvisa uma ação que deveria ter approval
When o sentinel-agent roda no próximo ciclo de heartbeat
Then detecta a ação no activity log sem approval correspondente
And cria approval issue de alerta atribuída ao Board com: cargo infrator, ação, timestamp, severity
And marca a issue original como status=blocked até resolução do alerta
```

### C7-A — Paridade Mensurável

**Descrição:** O `parity_score` (portões emitidos vs esperados) pode ser calculado e calculado para cada cenário de teste E2E definido em A4-validation.md.

**Critério de aceitação:**
```gherkin
Given os 6 variants de pipeline têm cenários de teste definidos em A4-validation.md
When um cenário é executado com o ambiente Fase A completo
Then é possível calcular parity_score = (portões emitidos que eram esperados) / (portões esperados totais)
And o resultado é um número entre 0 e 1 com precisão de 2 casas decimais
And parity_score ≥ 0.95 em todos os cenários para declarar PASS
```

### C8-A — Compatibilidade com Workflows Ativos

**Descrição:** A aplicação do reforço (INVARIANTS blocks + approval types + executionState) não quebra nenhum workflow ativo. Os 48 cargos continuam funcionando para seus casos de uso existentes.

**Critério de aceitação:**
```gherkin
Given os workflows ativos (bugfix, feature, audit, UX, spec, adversarial)
When a Fase A é aplicada (Onda A3)
Then todos os smoke tests dos workflows que passavam antes continuam passando
And o tempo de execução de um workflow típico não aumenta mais de 20%
And nenhuma issue existente em andamento é afetada retroativamente pelo rollout
```

---

## 3. Restrições Duras (HC1-A a HC6-A)

### HC1-A — Iron Law: Subdir Aditivo

**Restrição:** A Fase A adiciona apenas em `references/paperclip/spec/` dentro do plugin canônico. Qualquer outro arquivo do plugin (`agents/`, `skills/`, `commands/`, `lib/`, `references/` não-paperclip) é somente-leitura absoluto.

**Verificação:** `git status D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/` mostra zero modificações ao final de cada onda.

**Violação:** Falha crítica imediata. Rollback obrigatório.

### HC2-A — Primitivos Nativos Apenas

**Restrição:** A Fase A usa apenas os primitivos documentados da API do Paperclip: approval issues via POST `/api/companies/{id}/issues`, status changes via PATCH `/api/issues/{id}`, e comentários estruturados via POST `/api/issues/{id}/comments` (substrato de estado `PIPELINE_STATE`). O campo `executionState` foi descartado por ser não-gravável nesta versão (ver A0). Nenhuma API não-documentada.

**Verificação:** Toda chamada de API da Fase A pode ser tracada para um endpoint documentado no Paperclip HTTP API reference.

### HC3-A — Zero Código JavaScript na Onda A1

**Restrição:** Esta Onda A1 é documentação pura. Nenhum arquivo `.js`, `.cjs`, `.ts`, `.mjs` é criado ou modificado. Código JavaScript entra apenas nas Ondas A2 e A3.

**Verificação:** `ls paperclip-native-spec/**/*.{js,cjs,ts,mjs}` retorna vazio ao final da Onda A1.

### HC4-A — Versionamento Independente

**Restrição:** A Fase A tem seu próprio versionamento (Spec v1.0, v1.1...) independente do plugin canônico (v7.6.1) e da Fase B (futuro v1.0.0 do plugin). Os números de versão não se relacionam.

**Verificação:** Nenhum arquivo da Fase A referencia a versão do plugin canônico como seu próprio número de versão.

### HC5-A — PolyForm Shield Compatível

**Restrição:** A Fase A vive como subdir do plugin canônico e herda sua licença PolyForm Shield 1.0.0. A Fase A não pode incluir componentes com licenças incompatíveis (GPL, AGPL, Commons Clause over comercial use).

**Verificação:** Todo código da Fase A (Ondas A2/A3) usa apenas dependências com licenças MIT, Apache-2.0, BSD, ou ISC.

### HC6-A — Aprendizados Portáveis Voluntariamente

**Restrição:** Decisões tomadas na Fase A não restringem a Fase B. Aprendizados PODEM ser portados para a Fase B voluntariamente, explicitamente, por decisão do Board — nunca automaticamente ou por pressão implícita.

**Verificação:** Qualquer porte de aprendizado da Fase A para a Fase B tem um ADR explícito documentando a decisão.

---

## 4. Restrições Suaves (preferências, não bloqueadoras)

| ID | Restrição |
|---|---|
| SC1-A | O INVARIANTS block deve ser legível por humano em < 30 segundos por cargo |
| SC2-A | Os approval types devem usar nomenclatura consistente com o canonical (nomes de portões iguais, prefixo `pip:`) |
| SC3-A | O registro de estado (comentário `PIPELINE_STATE`) deve ter schema versionado para permitir evolução sem breaking change |
| SC4-A | A documentação deve estar em português por default (audiência: Fernando), com termos técnicos mantidos em inglês quando são nomes próprios de primitivos |

---

## 5. Fora de Escopo da Fase A (declarado)

| Item | Por quê está fora |
|---|---|
| Modificação dos 48 AGENTS.md atuais | Vem em Onda A3, não em Onda A1 |
| Criação de qualquer arquivo JavaScript | Vem em Ondas A2/A3 |
| Mudanças em `~/.paperclip/instances/` | Vem em Onda A2 (PoC) e A3 (rollout) |
| Construção do plugin SDK (Fase B) | Fase separada com gate de decisão |
| Modificações no plugin Claude Code canônico | Iron Law permanente |
| Troca do modelo LLM além do já configurado | gpt-5.5 travado, Sonnet 4.6 como fallback |
| Automação de CI/CD para a Fase A | Backlog — não crítico para Onda A1 |

---

## 6. Contrato de entrega desta spec (Onda A1 especificamente)

As regras abaixo governam a Onda A1 como entrega de documentação:

1. **Critérios de aceitação ATDD** declarados antes da escrita de cada documento
2. **Decision log** embutido em A2-design.md (≥5 entries)
3. **14 lentes de gap inventory** aplicadas em A2-design.md com resultado por lente
4. **Adversarial review** rodado em A2 e A3 antes do fechamento da onda
5. **Iron Law verificada** via `git status` ao final
6. **3 ADRs documentados** com contexto, alternativas e justificativa
7. **Tabelas de mapping** com dados reais das fontes canônicas (não estimativas)

---

## 7. Referências canônicas (somente leitura)

| Fonte | Conteúdo relevante |
|---|---|
| `references/gates.md` | 35 portões em 5 seções, hardness taxonomy |
| `references/team-registry.md` | Mapeamento type→team, 6 variants |
| `references/complexity-matrix.md` | Pipeline routing matrix (6 variants × 3 complexidades) |
| `references/paperclip/PAPERCLIP-AXIOMS.md` | 4 axiomas base (expandidos para 9 em 00-PRINCIPIOS-COMUNS.md) |
| `references/paperclip/paperclip-catalog.md` | 47 agentes CC com sugestão de cargo Paperclip |
| `.claude/hooks/*.cjs` | 12 hooks (12 = sem __tests__ e skill-frontmatter-parser) |
| `references/gate-request-protocol.md` | 3 blocos do protocolo Achado #7 |
| `references/sentinel-integration.md` | 5 checkpoints + schema do state |

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-05-24 | Criado em Onda A1 — requirements do reforjo adaptados do PIP spec original |
