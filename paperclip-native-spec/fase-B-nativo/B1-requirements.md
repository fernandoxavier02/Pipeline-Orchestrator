# Spec — Pipeline Orchestrator Paperclip (PIP)

**Status:** Draft v0.1
**Date:** 2026-05-24
**Author:** Fernando Costa Xavier
**Independence:** Totally separate from pipeline-orchestrator (Claude Code plugin). Zero shared code, zero shared runtime, zero shared git history.

---

## 1. Por que esse projeto existe

O plugin pipeline-orchestrator pro Claude Code entrega governança de execução (TDD, batches, revisão adversarial, registro de portões, trilha de auditoria) há mais de um ano e está maduro (v7.6.0). O Paperclip é uma plataforma emergente de orquestração de agentes cujos primitivos — sub-tarefas assíncronas, plugins com capacidades tipadas, painéis React, workers orientados a eventos, manifestos declarativos — tornam um *porte fiel* do plugin Claude Code desconfortável.

Em vez de portar, este projeto reconstrói a mesma proposta de valor (execução multi-agente governada) do zero usando o modelo idiomático do Paperclip. O plugin Claude Code permanece intocado e os dois produtos evoluem em separado.

## 2. O que o plugin faz

PIP é um plugin do Paperclip que orquestra execução estruturada e governada de tarefas de engenharia de software por múltiplos agentes. Dado uma tarefa (correção de bug, nova funcionalidade, auditoria, spec, etc.) ele:

- Classifica a tarefa (tipo + complexidade) e produz plano estruturado
- Decompõe trabalho em batches com disciplina dirigida por testes
- Despacha agentes especializados (implementador, revisor, etc.) como sub-tarefas paralelas ou sequenciais
- Roda revisão adversarial a cada fronteira de batch com contexto isolado
- Registra toda decisão de governança (portão disparado, decisão tomada, evidência capturada)
- Produz veredicto final GO/CONDITIONAL/NO-GO com trilha de auditoria

Diferente do plugin Claude Code, PIP explora o modelo nativo do Paperclip: fluxo de aprovação assíncrono em vez de pergunta síncrona ao usuário, sub-tarefas visíveis no quadro em vez de subagentes em-processo, painel React em vez de auditoria em markdown puro, ferramentas com gate de capacidade em vez de aplicação por hook.

## 3. Usuários primários

- **Desenvolvedor solo** rodando PIP dentro da própria instância Paperclip pra governar projetos pessoais
- **Time pequeno** rodando PIP dentro de workspace compartilhado pra impor disciplina de engenharia em todos os repos
- **Futuro:** consumidores via canal de plugins do Paperclip instalando PIP como camada de governança plug-and-play sobre qualquer repo gerenciado

## 4. Capacidades (usuário-final)

| ID | Capacidade | Resumo |
|---|---|---|
| C1 | Classificação de tarefa | Dada descrição em linguagem natural, PIP classifica tipo + complexidade + variante de pipeline |
| C2 | Planejamento somente-leitura | Pra MEDIA+, fase de pesquisa que produz plano estruturado, levanta riscos, exige aprovação |
| C3 | Execução dirigida por testes | Pra tarefas que alteram código: cenários de teste em linguagem natural, aprovação, conversão pra testes falhantes, depois implementação |
| C4 | Implementação em batches | Trabalho quebrado em batches dimensionados por complexidade (todos / 2-3 / 1), cada um passando por gate de build+teste |
| C5 | Revisão adversarial | A cada fronteira de batch, três revisores independentes (segurança, arquitetura, qualidade) com zero contexto de implementação. Achados bloqueiam progresso |
| C6 | Log de decisões governado | Toda decisão de portão registrada com timestamp, decisor, evidência, justificativa. Visível em tempo real no painel |
| C7 | Validação final | Após todos os batches, validador final emite GO/CONDITIONAL/NO-GO com justificativa |
| C8 | Brainstorm pré-execução | Pra tarefas ambíguas, fase exploratória (intake, clarificação, alternativas, ciclo de spec) antes de comprometer com execução |

## 5. Critérios de aceitação por capacidade

**C1.** Dada uma descrição de tarefa, *quando* o usuário invoca a ferramenta de classificação, *então* PIP cria issue-pai com campos de metadado (tipo, complexidade, variante, escopo afetado) e apresenta a classificação como sub-tarefa de aprovação no quadro do Paperclip.

**C2.** Dada uma tarefa classificada como MEDIA ou superior, *quando* o usuário aprova a classificação, *então* PIP cria sub-tarefa de planejamento atribuída ao agente planejador, que produz documento de plano anexado e exige aprovação antes da execução começar.

**C3.** Dada uma tarefa que altera código com plano aprovado, *quando* a execução inicia, *então* PIP cria sub-tarefas de cenários de teste que o usuário precisa aprovar individualmente antes de qualquer trabalho de implementação acontecer.

**C4.** Dada uma tarefa classificada, *quando* a execução começa, *então* PIP cria sub-tarefas de batch dimensionadas por complexidade (SIMPLES = tudo num batch só, MEDIA = 2-3 tarefas por batch, COMPLEXA = 1 tarefa por batch), com critério de aceitação explícito por batch.

**C5.** Dado um batch completo, *quando* o gate de build+testes passa, *então* PIP cria três sub-tarefas paralelas de revisão adversarial (segurança, arquitetura, qualidade) atribuídas a agentes revisores que recebem apenas o diff (sem contexto de implementação). Achados precisam ser resolvidos ou explicitamente dispensados antes do próximo batch começar.

**C6.** Dada qualquer decisão de portão (pass, block, skip, waive), *quando* a decisão é registrada, *então* um evento é emitido via barramento de eventos do plugin e persistido no banco do plugin contendo: nome do portão, nível de rigor, decisão, decisor (usuário ou agente), timestamp, referência de evidência, justificativa.

**C7.** Dados todos os batches completos e a revisão adversarial final (se ativada), *quando* o validador final roda, *então* produz veredicto GO/CONDITIONAL/NO-GO que aparece na issue-pai com justificativa visível no painel.

**C8.** Dada uma tarefa ambígua (baixa pontuação de clareza), *quando* o usuário invoca o brainstorm, *então* PIP roda fluxo de quatro fases (intake → clarificação com perguntas citadas por evidência → abordagens alternativas → ciclo de spec) antes de oferecer entrega pra execução.

## 6. Restrições duras (não-negociáveis)

| ID | Restrição |
|---|---|
| HC1 | **Separação total:** zero código-fonte, zero dependência de runtime, zero acoplamento de build com o plugin Claude Code. Os dois projetos não compartilham arquivos, pacotes nem histórico git |
| HC2 | **Nativo idiomático:** PIP usa primitivos do Paperclip na forma idiomática deles. Sub-tarefas pra aprovação assíncrona, capacidades pra acesso governado, React UI pra visualização de estado, banco do plugin pra estado, barramento de eventos pra sinais cross-componente. NÃO tenta recriar a semântica síncrona de AskUserQuestion do Claude Code dentro do Paperclip |
| HC3 | **Conformidade com SDK:** usa o pacote oficial `@paperclipai/plugin-sdk` versão um do esquema de manifesto. Capacidades são declaradas explicitamente. Sem APIs não-documentadas do Paperclip |
| HC4 | **Versionamento independente:** numeração de versão do PIP é própria (começa em 1.0.0), sem relação com a linhagem v7.x do plugin Claude Code |
| HC5 | **Licença compatível com código aberto:** licença do PIP é compatível com a licença do próprio Paperclip (provavelmente Apache-2.0 ou MIT; confirmar na Fase A) |
| HC6 | **Sem pressão de retro-porte:** decisões tomadas no PIP não restringem retroativamente o plugin Claude Code. Melhorias arquiteturais descobertas no PIP PODEM ser retro-portadas voluntariamente, nunca automaticamente |

## 7. Restrições suaves (preferências, não bloqueadoras)

- **SC1.** PIP deve reusar skills do Paperclip que já existem no ecossistema quando aplicável, em vez de reinventar
- **SC2.** A UI deve ser legível em mobile (Paperclip é web-first)
- **SC3.** Telemetria e observabilidade devem integrar com o sistema de logging nativo do Paperclip quando possível
- **SC4.** Documentação em inglês (audiência mais ampla) com resumo em português

## 8. Fora de escopo

- **OS1.** Ferramenta de migração do plugin Claude Code pro PIP — os dois são produtos independentes, usuários escolhem um
- **OS2.** Hospedagem SaaS multi-tenant do PIP — esse é trabalho do próprio Paperclip; PIP é só um plugin que roda dentro de uma instância Paperclip
- **OS3.** Compatibilidade reversa com a camada-atalho atual em `references/paperclip/` do plugin Claude Code — essa camada fica deprecada pela existência do PIP e será arquivada quando PIP atingir paridade
- **OS4.** Suporte a qualquer runtime de agente que não seja os adapters nativos do Paperclip

## 9. Contrato de entrega desta spec

As regras abaixo governam a implementação desta spec e são obrigatórias para `02-design.md` e `03-tasks.md`:

1. **Tasks executadas em sprints.** O plano de implementação deve quebrar o trabalho em sprints com objetivo verificável, evidência e critério claro de encerramento.
2. **Sprints fecham slices verticais.** Cada slice vertical pode exigir 1 ou mais sprints, mas só é considerado concluído quando a cadeia completa de sprints daquele slice terminar e o review total do slice passar.
3. **Loop adversarial por sprint.** Ao final de cada sprint deve existir revisão adversarial em loop. Nenhum sprint seguinte pode começar enquanto houver findings abertos, blockers ou correções sem validação.
4. **Revisão total ao fechar o slice.** Depois do último sprint de um slice, deve ocorrer uma nova revisão adversarial completa do slice inteiro, não apenas do diff incremental do último sprint.
5. **DDD guia as fronteiras.** Cada sprint deve preservar bounded contexts, linguagem ubíqua e contratos entre contextos.
6. **ATDD define o alvo.** Antes da implementação, cada sprint e cada slice precisam ter cenários de aceitação explícitos e rastreáveis.
7. **BDD explicita o comportamento.** Os cenários aprovados devem ser escritos em linguagem de negócio/Given-When-Then antes da codificação.
8. **TDD controla a execução.** Cada comportamento aprovado deve passar pelo ciclo RED -> GREEN -> REFACTOR antes do sprint ser encerrado.
9. **Tudo vira regressão.** Todo cenário aprovado por ATDD/BDD e todo bug ou finding relevante descoberto em TDD/adversarial review deve terminar materializado como teste de regressão automatizado até o fechamento do slice.

---

## Próximas seções (a redigir após aprovação desta)

- **02-design.md** — arquitetura, modelo de dados, interfaces, workflows mapeados a primitivos Paperclip, decisões com justificativa
- **03-tasks.md** — slices verticais quebrados em sprints, com dependências, critérios de aceitação por sprint/fatia, loops adversariais e promoção obrigatória para regressão
