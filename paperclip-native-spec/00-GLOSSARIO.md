# Glossário — Estratégia Paperclip Unificada

**Status:** Draft v1.0 (Onda A1)
**Data:** 2026-05-24
**Escopo:** Termos compartilhados entre Fase A (reforjo) e Fase B (plugin nativo)

> Este glossário é a fonte única de verdade (SSOT) para terminologia neste programa.
> Qualquer conflito entre um termo aqui definido e uma definição inline num documento de fase,
> o glossário vence.

---

## A

**Achado #7 (Subagent Runtime Tool Stripping)**
Descoberta documentada em 2026-05-07: o harness do Claude Code remove ferramentas como `AskUserQuestion` e `Agent` dos subagentes em runtime, independente do que está declarado no frontmatter. O protocolo `GATE_REQUEST / DISPATCH_REQUEST / PLAN_MODE_REQUEST` foi desenvolvido como solução — subagentes comunicam necessidade de interação via bloco de texto estruturado, e o agente pai (que tem acesso às ferramentas) executa a ação. No contexto Paperclip, o equivalente é a escalation policy via approval issues.

**Activity Log**
Sistema nativo do Paperclip que registra automaticamente toda mutação em issues: criação, mudança de status, atribuição, comentário, adição de approval. Usado na Fase A como equivalente ao `gate-decisions.jsonl` do Claude Code para rastreabilidade de decisões de portão.

**Adversarial Review**
Processo de revisão por agentes independentes com zero contexto de implementação, que procuram ativamente falhas de segurança, arquitetura e qualidade. No Claude Code canônico, ocorre por batch (via `adversarial-batch`) e na fase final (via `final-adversarial-orchestrator`). No Paperclip, traduzido como sub-tarefas paralelas de revisão atribuídas aos cargos `adversarial-security-scanner`, `adversarial-architecture-critic` e `adversarial-quality-reviewer`.

**Agente / Cargo**
Usados como sinônimos neste programa: uma persona de IA especializada com responsabilidade definida. "Agente" é o termo do Claude Code (arquivo em `agents/**/*.md`). "Cargo" é o termo do Paperclip (persona carregada via `AGENTS.md` ou `instructionsFilePath`). O mapeamento completo está em `fase-A-reforjo/tables/agents-mapping.md`.

**Approval Issue**
Primitivo nativo do Paperclip: uma issue criada especificamente para solicitar aprovação de uma decisão ao Board (usuário humano). Estado evolui via state machine: `pending → approved / rejected / revision_requested`. Usado na Fase A como equivalente ao `AskUserQuestion` do Claude Code.

**ATDD (Acceptance Test-Driven Development)**
Prática de definir critérios de aceitação como testes antes de qualquer implementação. No contexto desta spec (doc-only), os critérios de aceitação de cada documento são declarados explicitamente antes da escrita.

**Axioma**
Regra inquebrável que não admite exceção nem override por workflow específico. Os 4 axiomas do `PAPERCLIP-AXIOMS.md` são expandidos para 9 em `00-PRINCIPIOS-COMUNS.md` nesta spec unificada.

---

## B

**Batch**
Unidade de trabalho no pipeline. No Claude Code canônico, o tamanho do batch é proporcional à complexidade: SIMPLES = tudo de uma vez, MEDIA = 2-3 tarefas por batch, COMPLEXA = 1 tarefa por batch. No Paperclip, traduzido como grupo de sub-tarefas criadas de uma vez com critério de aceitação compartilhado.

**BDD (Behavior-Driven Development)**
Prática de descrever comportamentos esperados em linguagem de negócio (formato Given/When/Then) antes da implementação. Aplicado nesta spec aos próprios documentos: o comportamento esperado de cada doc é declarado em Gherkin antes da escrita.

**Board**
No contexto Paperclip: a entidade humana (usuário) que recebe approval issues e toma decisões. Equivale ao usuário que responde `AskUserQuestion` no Claude Code. O Board é a única fonte de verdade de negócio — os cargos são executores, não decisores autônomos.

**Bounded Context**
Conceito do DDD (Domain-Driven Design): fronteira explícita dentro da qual um modelo de domínio é válido e consistente. Na Fase B, os bounded contexts do plugin nativo são: Workspace, Classification, Execution, Adversarial Review, Fix Loop, Validation, e Gate Decision (cross-cutting). Na Fase A, o conceito se aplica ao mapeamento de gates por domínio funcional.

---

## C

**Canonical / Canônico**
Refere-se ao plugin Pipeline Orchestrator para Claude Code (`D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/`). É a fonte de verdade de referência para paridade. Nunca modificado por nenhuma onda deste programa (Iron Law).

**Cargo**
Ver: Agente / Cargo.

**Ciclo de Heartbeat**
No Paperclip, o intervalo entre execuções de um agente para verificar sua inbox e executar tarefas pendentes. Relevante para latência de detecção de desvio (um agente que improvisou é detectado pelo sentinel-agent no próximo ciclo de heartbeat).

**COMPLEXA**
Nível de complexidade mais alto na matriz do pipeline canônico. Critérios: 6+ arquivos, >100 linhas, 3+ domínios, risco alto. Esta spec (Onda A1) é classificada como COMPLEXA pelos critérios de arquivos (15+ docs) e escopo multi-semana.

---

## D

**DDD (Domain-Driven Design)**
Abordagem de design que usa a linguagem do domínio de negócio para guiar nomenclatura, estrutura e fronteiras de módulos. Aplicado nesta spec para garantir que os termos usados nos docs de governança reflitam como o Paperclip e o Claude Code realmente funcionam.

**Decision Log**
Registro de cada escolha de design tomada durante a spec, com contexto, alternativas consideradas e justificativa da decisão tomada. Obrigatório em `A2-design.md` por princípio desta spec.

**Desvio / Drift**
Divergência entre o comportamento esperado (conforme spec de workflow) e o comportamento real de um cargo. Detectado pelo sentinel-agent via activity log e `executionState`. A detecção de drift é um dos outputs da Onda A3.

---

## E

**Enforcement**
Mecanismo que garante que um portão seja obedecido. No Claude Code canônico, enforcement é via hooks `.cjs` (PreToolUse) que bloqueiam chamadas de ferramentas. No Paperclip (Fase A), enforcement é via INVARIANTS block no AGENTS.md de cada cargo + approval issues obrigatórias + validação post-hoc pelo sentinel-agent.

**ExecutionState**
Campo JSON extensível presente em cada issue do Paperclip (`issue.executionState`). Usado na Fase A como store de estado do pipeline — equivalente ao `sentinel-state.json` do Claude Code. Armazena fase atual, portões disparados, hash chain, e versão do registry de portões.

---

## F

**Fase A — Reforjo**
Primeira fase do programa. Documenta e aplica enforcement de governança nos 48 agentes existentes do Paperclip usando primitivos nativos. Não constrói código JavaScript novo na Onda A1. Ver `fase-A-reforjo/`.

**Fase B — Plugin Nativo**
Segunda fase do programa. Constrói plugin Paperclip novo do zero com SDK oficial. Aproveita aprendizados da Fase A. Ver `fase-B-nativo/`.

**Fidelidade / Parity Score**
Métrica quantitativa de paridade: portões emitidos dividido por portões esperados em cenários de teste end-to-end. Thresholds: PASS ≥0.95, PASS_WITH_NOTES ≥0.80, FAIL <0.80. Definida completa em `A4-validation.md`.

---

## G

**Gate / Portão**
Ponto de controle no pipeline que pode bloquear, avisar ou registrar. No canonical, 35 portões categorizados em 5 dureza (MANDATORY, HARD, CIRCUIT_BREAKER, SOFT, AUDIT). No Paperclip (Fase A), cada portão mapeia para um ou mais approval types no formato `pip:*` ou `pip-spec:*`. Mapeamento completo em `fase-A-reforjo/tables/gates-mapping.md`.

**Gate-Decisions.jsonl**
Arquivo de log do canonical onde cada decisão de portão é registrada com timestamp, decisor, evidência e justificativa. No Paperclip (Fase A), o equivalente é o activity log nativo + campo `executionState.pipeline.gate_decisions[]`.

---

## H

**Hash Chain**
Mecanismo de integridade: cada entrada no log de portões inclui um hash do estado anterior, criando uma cadeia verificável. Implementado no canonical em `gate-decisions.jsonl`. Na Fase A, armazenado em `executionState.pipeline.hash_chain_head`.

**Hook**
Script `.cjs` executado pelo harness do Claude Code em eventos de ciclo de vida (PreToolUse, SessionStart, Stop, etc.). O canonical tem 12 hooks ativos. No Paperclip, hooks `.cjs` não executam (o Paperclip orquestra lifecycle próprio) — o mapeamento de enforcement é feito via INVARIANTS block e approval issues. Ver `fase-A-reforjo/tables/hooks-mapping.md`.

---

## I

**INVARIANTS Block**
Bloco de texto inserido no topo de cada `AGENTS.md` no Paperclip que declara explicitamente as regras invioláveis do cargo: o que nunca fazer, quando criar approval issue, qual spec de workflow seguir. Equivalente funcional aos hooks do Claude Code como mecanismo de enforcement de primeiro nível.

**Iron Law**
Regra absoluta deste programa: o plugin Claude Code canônico (`D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/`) é somente-leitura. Nenhuma onda deste programa modifica qualquer arquivo nessa pasta. Violação é falha crítica imediata.

---

## O

**Onda**
Subdivisão de uma fase em entregáveis sequenciais. Onda A1 = documentação (esta semana). Onda A2 = PoC em 1 cargo. Onda A3 = rollout nos 48 agentes. Cada onda tem seu próprio DoD (Definition of Done) e pode ser revisada e aprovada independentemente.

---

## P

**Pa de Cal**
Veredicto final do pipeline canônico emitido pelo agente `final-validator`. Pode ser GO (aprovado), CONDITIONAL (aprovado com ressalvas), ou NO-GO (bloqueado). No Paperclip (Fase A), equivale à approval issue de closeout com status final da execução.

**Paridade**
Ver: Fidelidade / Parity Score.

**Pipeline**
Sequência estruturada de fases e agentes para executar uma tarefa de engenharia com governança. No canonical: Triagem → Planejamento → Execução em batches → Fechamento. Os 6 variants de pipeline mapeados em `fase-A-reforjo/tables/variant-catalog.md`.

**PRINCIPIOS-COMUNS**
Arquivo `00-PRINCIPIOS-COMUNS.md` que declara os 9 axiomas válidos para ambas as fases. É a extensão e endurecimento dos 4 axiomas originais do `PAPERCLIP-AXIOMS.md`.

---

## R

**Reforjo**
O ato de fortalecer e adicionar enforcement a um sistema existente sem reconstruí-lo do zero. A Fase A é um reforjo: os 48 agentes continuam existindo e funcionando, mas ganham camadas de governance via INVARIANTS blocks, approval types e sentinel-agent.

**Registry de Portões**
Tabela canônica de todos os portões do sistema com suas dureza, triggers, ações e recuperações. No canonical, 35 portões em `references/gates.md`. No Paperclip (Fase A), mapeados para approval types em `fase-A-reforjo/tables/gates-mapping.md`.

---

## S

**Sentinel-Agent**
No canonical: agente `sentinel` que valida sequência de fases, coerência entre portões, e bloqueia desvios. No Paperclip (Fase A), cargo designado que lê o activity log e o `executionState` para detectar drift e criar approval issues de alerta quando necessário.

**Shim**
Camada de adaptação intermediária. A `references/paperclip/` no plugin canonical é atualmente um shim — 14 docs + 11 skills que fazem o Claude Code funcionar "no estilo Paperclip" sem usar os primitivos nativos da plataforma. A Fase A substitui esse shim por enforcement nativo.

**SIMPLES**
Nível de complexidade mais baixo. Critérios: 1-2 arquivos, <30 linhas, 1 domínio, risco baixo. Pipelines SIMPLES rodam DIRETO sem fase de planejamento.

**Slice Vertical**
Unidade de entrega que atravessa todas as camadas relevantes do sistema (requisito → design → tarefa → validação). Aplicado neste programa: cada onda é um slice vertical da spec completa.

**Spec**
Tipo de tarefa no pipeline canônico: criação ou implementação de especificação formal com artefatos requirements + design + tasks. Esta Onda A1 é classificada como type=Spec, complexity=COMPLEXA, variant=spec-heavy.

---

## T

**TDD (Test-Driven Development)**
Ciclo RED → GREEN → REFACTOR. No contexto doc-only desta Onda A1, o "teste" é o critério de aceitação declarado antes da escrita de cada documento. O documento "passa" quando todos os seus critérios estão satisfeitos e verificáveis.

**Trio Adversarial**
Os três agentes de revisão adversarial independentes: `adversarial-security-scanner`, `adversarial-architecture-critic`, `adversarial-quality-reviewer`. Rodam em paralelo com zero contexto compartilhado. No Paperclip, mapeiam para os cargos equivalentes.

---

## V

**Variant**
Configuração de pipeline que determina quais agentes são despachados e em qual ordem. Os 6 variants: bugfix-light, bugfix-heavy, implement-light, implement-heavy, spec-light, spec-heavy (além de audit, UX, user-story). Mapeados em `fase-A-reforjo/tables/variant-catalog.md`.

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-05-24 | Criado em Onda A1 — termos compartilhados Fase A e Fase B |
