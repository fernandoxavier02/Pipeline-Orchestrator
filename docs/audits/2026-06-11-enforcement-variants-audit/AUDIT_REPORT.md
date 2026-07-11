# Relatório de Auditoria — Enforcement Variants
**Data:** 2026-06-11
**Versão do sistema auditado:** 7.10.1
**Auditores:** 4 agentes especializados em sequência

---

## Veredicto

O sistema funciona bem para o tipo de trabalho mais usado, mas tem cinco falhas críticas concentradas em duas áreas: o mecanismo que deveria forçar os agentes a pedir permissão antes de pesquisar livremente não tem nenhum código determinístico por trás — é pura instrução de texto — e durante esta própria auditoria um agente burlou esse mecanismo sem que nada bloqueasse. Além disso, toda a rastreabilidade de execução (os registros de saúde que mostram quantas etapas foram completadas) está quebrada em produção desde pelo menos 10 dias.

---

## O que foi verificado

A auditoria percorreu seis camadas de controle do sistema, todas elas relacionadas a como o orquestrador (o coordenador central de todo o pipeline — o programa que decide qual agente roda quando e com quais restrições) garante que seus agentes sigam as regras. Isso inclui: o contrato de "modo planejamento" (a regra que obriga certos agentes a pedir aprovação antes de sair pesquisando arquivos livremente), os registros de qualidade de execução, a rastreabilidade via Langfuse (a plataforma externa de observabilidade — funciona como um painel de monitoramento em nuvem), e a cobertura de testes por tipo de pipeline.

Foram lidos 17 arquivos e analisados 14 eventos ao vivo desta própria sessão de auditoria, além dos registros históricos das últimas semanas.

---

## O que está quebrado

**As cinco falhas mais sérias, em ordem de gravidade:**

**Primeira:** O mecanismo de "modo planejamento" não tem nenhum código que o obrigue a funcionar. Existe um conjunto de regras em prosa dizendo que dez agentes específicos precisam pedir aprovação antes de pesquisar arquivos. Mas nenhum código de interceptação verifica se esse pedido foi feito. Os quatro testes que deveriam guardar essa regra verificam apenas se o texto da regra existe nos arquivos certos — não se o sistema realmente a executa. Resultado direto: nesta própria auditoria, um dos agentes obrigatórios (o interrogador de design) fez 94 consultas em modo livre sem pedir aprovação, e o orquestrador aceitou o resultado alegando que o agente "não estava na lista" — o que é factualmente errado; ele está listado na linha 527 do arquivo de controle. Nenhuma camada detectou o desvio.

**Segunda:** Todos os 384 registros de rastreabilidade no Langfuse dos últimos dez dias têm o campo de identificação de execução vazio (nulo). Isso significa que é impossível dizer qual observação de monitoramento pertence a qual execução do pipeline. A plataforma existe, está recebendo dados, mas esses dados não podem ser consultados por execução. A causa é simples: o arquivo de estado interno do sistema usa o nome "pipeline_id" para identificar a execução, mas o conector do Langfuse procura um campo chamado "run_id" — que nunca é criado.

**Terceira:** A pontuação de fidelidade (o número que indica quantas etapas obrigatórias foram concluídas, entre 0 e 1) congela no valor registrado pela primeira sessão de encerramento e nunca mais atualiza. Uma execução que leva múltiplas sessões acumula mais etapas ao longo do tempo, mas o placar continua mostrando o número da primeira sessão para sempre. Confirmado nos registros: a execução de 6 de junho mostrou 0,2727 congelado em quatro entradas consecutivas, mesmo com o número de etapas crescendo de 4 para 15.

**Quarta:** Os dois hooks (os programas que fazem interceptação — funcionam como porteiros que decidem se uma ação pode prosseguir) que descobrem o estado do sistema dependem da pasta de trabalho atual do processo. Quando essa pasta não corresponde à raiz do repositório, os dois hooks podem olhar para o lugar errado ao mesmo tempo, degradando quatro camadas de uma vez: a sequência do sentinela, o registro de execuções, a pontuação de fidelidade, e os rastros do Langfuse. Isso aconteceu ao vivo nesta sessão (o plan-architect foi negado porque o sentinela não encontrou o arquivo de estado, que estava numa subpasta diferente).

**Quinta:** Todos os quatro testes do mecanismo de modo planejamento verificam apenas se o texto certo está nos arquivos. Não executam nenhum código real de interceptação. Uma violação em produção não acenderia nenhuma luz vermelha nos testes.

---

**Falhas de gravidade alta (três):**

O mecanismo de controle de sequência (o sentinela — o guardião que decide se um agente pode ser chamado na ordem correta) não tem nenhum teste que simulate uma negação real. Funciona em produção (confirmado ao vivo nesta sessão por um controle positivo), mas se o código de negação for alterado por engano, nenhum teste automatizado vai detectar.

A contagem de portões (etapas de controle do pipeline) tem quatro números diferentes em cinco fontes diferentes no mesmo repositório. As duas fontes que se declaram "autoridades com prioridade de sobreposição" estão desatualizadas por 8 e 13 portões em relação ao arquivo oficial. Um desenvolvedor que seguisse a instrução de "sobreposição" marcaria o arquivo correto como adulterado.

Quatro dos cinco tipos de pipeline (Auditoria, Simulação de UX, Histórias de Usuário, Feature) não têm o mecanismo de controle de sequência ativado porque esses tipos rodam de forma embutida no orquestrador, sem um "skill" registrado — e o sentinela só age quando um skill está ativo.

---

**Um achado meta notável:**

Durante a terceira etapa desta auditoria, o agente responsável pela checagem de conformidade declarou que dois arquivos de registro estavam ausentes da pasta de execução corrente. Isso estava errado — o agente tinha olhado para a cópia espelho na pasta do repositório, não para a pasta canônica visível pela sessão. O agente auditando o problema de "confusão de localização de arquivos" cometeu exatamente esse problema durante a auditoria. Isso não é falha de processo — é evidência ao vivo de que a ambiguidade de localização é real o suficiente para enganar tanto os agentes do pipeline quanto os auditores que os inspecionam.

---

## O que está funcionando

O pipeline de Correção de Bugs (o tipo mais usado no dia a dia) é o único tipo com cobertura completa: tem roteamento correto, documentação atualizada, skill registrado com despacho real via ferramenta, e testes comportamentais. Essa é a referência de como os outros tipos deveriam estar.

O mecanismo central do sentinela — a lógica de negação por sequência incorreta — funciona corretamente quando o arquivo de estado é encontrado na pasta certa (confirmado por um controle positivo ao vivo nesta sessão). O hook do plano de arquitetura também honrou o contrato corretamente nesta execução.

Os testes de comportamento das camadas de telemetria (parar sessão, escrever fidelidade, rastrear Langfuse) existem e exercitam código real — são os mais valiosos do conjunto atual.

---

## O que fazer primeiro

Três ações por ordem de impacto e facilidade:

**Hoje (horas de esforço):** Atualizar as duas listas desatualizadas de portões para refletir os 35 portões corretos — duas edições de texto em dois arquivos, sem mudança de comportamento, elimina a contradição de governança.

**Esta semana (dias de esforço):** Corrigir a propagação do identificador de execução no Langfuse — escrever o campo "run_id" no arquivo de estado no momento em que uma execução é criada, e atualizar o conector para ler esse campo. Isso desbloqueia dez dias de rastreabilidade que hoje não podem ser consultados.

**Esta sprint (dias de esforço):** Substituir o guarda de "nunca sobrescrever" na função de pontuação de fidelidade por uma lógica de "guarda o maior valor" — assim execuções de múltiplas sessões acumulam a pontuação correta em vez de congelar no primeiro número.

A conversão do modo planejamento para um código de interceptação real é a mudança mais importante em termos de segurança do sistema, mas também a mais complexa — leva semanas e requer mudanças em três camadas. As três ações acima criam a base de rastreabilidade necessária para monitorar essa mudança depois que ela for feita.

---

## Detalhe técnico

```
RISK MATRIX SUMMARY (risk_score / 25):

AUDIT-001  Plan Mode: zero hook backstop                    score=25  Critical
AUDIT-002  Controller table-lookup fallível (Signal G live)  score=20  Critical
AUDIT-003  run_id=null em 384 spans Langfuse (10 dias)       score=20  Critical
AUDIT-004  Fidelity freeze: first-write wins forever         score=20  Critical
AUDIT-005  cwd-discovery cascade (4 layers degradam juntas)  score=20  Critical
AUDIT-006  Testes Plan Mode: TEXT-ONLY, não behavioral       score=20  Critical
AUDIT-007  Sentinel enforcement ausente para rotas inline    score=16  High
AUDIT-008  Gate-count 5-source SSOT drift (22/27/35)         score=15  High
AUDIT-009  sentinel-hook deny-path sem behavioral test       score=12  High
AUDIT-010  Clock-skew aborted run incoerente no run-log      score=8   Medium
AUDIT-011  chat-derek 475 traces contaminando projeto        score=10  Medium
AUDIT-012  audit-heavy.md contradiz controller no despacho  score=8   Medium
AUDIT-013  Feature naming mismatch (implement-*/feature-*)   score=8   Medium
AUDIT-014  UX Sim + User Story: L3 e L4 ausentes            score=6   Medium
AUDIT-015  F20 omite plan-architect; freeze cascade untested score=6   Medium
AUDIT-016  Anti-deadlock ACCEPT: 2ª bypass sempre aceito     score=9   Medium [DESIGN]
AUDIT-017  sentinel-hook cache=repo byte-identical           score=1   Low (informational)

TOP 5 PRIORIDADES:
1. AUDIT-001 — converter Plan Mode para hook determinístico
   arquivos: .claude/hooks/dispatch-guard.cjs + agents/core/pipeline-controller.md:533
2. AUDIT-003 — corrigir run_id no sentinel-state.json
   arquivos: lib/langfuse-carrier.cjs + pipeline-controller (escrever run_id no estado)
3. AUDIT-004 — substituir freeze por keep-max em ensureFidelityReport
   arquivo: .claude/hooks/stop-hook.cjs:239-245
4. AUDIT-005 — forçar PIPELINE_DOC_PATH obrigatório; remover mtime-scan como fallback
   arquivos: .claude/hooks/sentinel-hook.cjs:150-195 + stop-hook.cjs:118-170
5. AUDIT-008 — atualizar inline gate-count de 22/27 para 35
   arquivos: commands/pipeline.md:387,1020 + agents/core/pipeline-controller.md:261,298

EVIDÊNCIAS VIVAS (protocol-events.jsonl):
  evt-002: sentinel negou plan-architect por cwd-mismatch (falso positivo)
  evt-005: Signal G — design-interrogator bypassou Plan Mode; controller aceitou
  evt-012: T3 cometeu dual-location confusion — achado meta confirmado
  evt-013: controle positivo — sentinel negou corretamente quando expected_next estava definido

NÃO TOCAR:
  references/gates.md registry rows — gate_registry_modification PROIBIDA
  sentinel-hook.cjs deny-path — sem behavioral test antes de qualquer mudança
  PLAN_MODE_MANDATORY_AGENTS table — mudança de membros cascadeia para 3 artefatos
```
