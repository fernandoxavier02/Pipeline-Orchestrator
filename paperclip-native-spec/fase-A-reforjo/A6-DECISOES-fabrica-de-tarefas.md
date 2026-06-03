# A6 — Quadro de Decisões: a Fábrica de Tarefas (o desenho da correção)

**Status:** Em decisão (brainstorming 2026-06-01) — nada implementado
**Propósito:** reunir num lugar só TODAS as decisões em aberto da correção, pra refletir sobre o conjunto antes de virar plano.
**Depende de:** A0-CALIBRACAO (o diagnóstico), A5-skill-espelho-design (o desenho de alto nível), baseline-fidelidade (a nota 0.19).

---

## O que já está decidido (recap)

A correção **não** vai mexer no comportamento dos 47 robôs (instruir cada um a lembrar de seguir o método é frágil e tem teto baixo — a medição provou: eles esquecem). Em vez disso, vamos mudar **como as tarefas são criadas**: quando um trabalho novo chega, em vez de virar uma tarefa única "faça X", ele vira uma **árvore de tarefas** que já embute os pontos de controle como etapas obrigatórias, **travadas** pelo sistema nativo do Paperclip de "uma tarefa só libera quando a anterior termina". O robô que implementa não consegue começar antes da clarificação e do plano estarem prontos — não porque ele se lembrou, mas porque o sistema não deixa pular.

O que falta decidir são os detalhes abaixo. Cada um tem minha recomendação, mas a escolha é sua.

---

## Decisão 1 — Quem monta a árvore quando um trabalho novo chega

**O que está em jogo:** autonomia. Se eu monto, é seguro mas eu fico no meio do caminho. Se um robô monta, é autônomo mas é uma peça nova pra acertar.

| Opção | Prós | Contras |
|---|---|---|
| **Eu, como ferramenta** (recomendada p/ começar) | Risco mínimo; nada novo no Paperclip; uso o que já sei fazer | Não-autônomo: preciso montar cada árvore |
| Um robô-recepção dedicado | Autônomo desde já; não mexe nos 47 | Robô novo pra criar e validar; mais superfície de erro |
| Reformar o robô-orquestrador atual | Autônomo e reusa o existente | Mexe num agente (o que queríamos evitar) |

**Recomendação:** começar com **eu como ferramenta** para o piloto — prova que a árvore funciona com risco mínimo. Quando estiver provado, promover para o **robô-recepção** (a autonomia de verdade). Não criar o robô novo antes de saber que a abordagem entrega.

---

## Decisão 2 — Quais etapas a árvore embute (e como elas se travam)

**O que está em jogo:** o tamanho e a forma da árvore. Cada ponto de controle que a gente embute passa a existir de verdade; cada um que a gente deixa de fora continua sendo pulado.

A medição mostrou que os robôs já fazem as partes do meio (testar, revisar de forma crítica, corrigir, fechar). O que **falta sempre** são as etapas de **entrada** (clarificar o pedido, planejar, aprovar o plano) e qualquer **aprovação formal**.

A proposta é a árvore embutir a espinha dorsal do método, proporcional ao tamanho do trabalho:

- **Trabalho simples:** classificar → clarificar → implementar (com testes) → revisar → fechar.
- **Trabalho complexo:** acrescenta planejar → aprovar o plano → revisão crítica reforçada.

A trava funciona assim: as etapas de **entrada** (clarificar, planejar, aprovar) travam a implementação — ela fica bloqueada até elas terminarem. As fases de trabalho (implementar, revisar) seguem como já são hoje. E a árvore **sempre começa classificando** o trabalho — o que de quebra resolve o problema das execuções "cegas" (aquele pipeline do chat que nem declarava o tamanho do trabalho).

**Recomendação:** embutir a espinha dorsal proporcional (acima), com as etapas de entrada travando a implementação, e a classificação como primeiro passo obrigatório de toda árvore. Não embutir os pontos de controle raros/situacionais por ora (eles entram depois, se a medição mostrar que valem).

---

## Decisão 3 — Quem aprova nas etapas de aprovação ⚠️ (a mais importante)

**O que está em jogo:** o equilíbrio entre autonomia e controle — e o maior risco de travamento. Hoje ninguém pede nem dá aprovação (a medição achou **zero**). Se a árvore cria uma etapa de aprovação e ninguém aprova, a corrente trava parada ali.

| Opção | Prós | Contras |
|---|---|---|
| **Você aprova** manualmente | Controle real; um humano decide | Exige você no loop o tempo todo; trava se você não estiver |
| Um robô-aprovador carimba e registra | Autônomo; a etapa existe e fica registrada | A aprovação vira carimbo — não há um humano de fato decidindo |
| **Híbrido** (recomendado) | Autônomo no caminho normal; você entra só no que pesa | Um pouco mais de regra pra definir "o que pesa" |

**Recomendação:** o **híbrido**. No caminho normal, a aprovação é automática e fica registrada (a etapa existe, é auditável, não trava). Mas ela **escala pra você** quando algo importa de verdade — quando o trabalho toca segurança, ou quando a revisão crítica achou um problema grave. Assim você não vira gargalo, mas está no comando onde a decisão pesa. É a forma realista de conviver com o teto: a aprovação sempre existe; o julgamento humano entra onde faz diferença.

---

## Decisão 4 — Padronizar os recados dos robôs agora, ou depois

**O que está em jogo:** escopo. A fábrica resolve o **encadeamento** (as etapas passam a existir e na ordem certa). Mas os recados que cada robô deixa continuam cada um no seu formato.

**Recomendação:** **depois**. A fábrica já tapa o buraco maior. Padronizar o formato dos recados é uma melhoria incremental que pode esperar — e a régua que construímos já consegue traduzir os recados atuais. Fazer agora seria escopo a mais sem necessidade.

---

## Decisão 5 — Como provar que funciona, e medir o ganho

**O que está em jogo:** não repetir o erro de reformar no escuro. A gente tem a régua; vamos usá-la como juiz.

**Recomendação:** um **trabalho-teste pequeno e real**, montado pela fábrica, e medido pela régua. A gente compara a nota desse trabalho com o baseline de hoje (em torno de 19%). Critério de sucesso: a nota sobe **claramente** — e deve subir bastante, porque agora clarificar, planejar e aprovar passam a **existir** como tarefas, não dá pra pular. Se subir como esperado, a abordagem está provada e vale promover para o robô-recepção e espalhar.

---

## Riscos a encarar de olhos abertos

**O encadeamento pode travar mais.** A medição já tinha mostrado cinco casos de tarefas que travaram e precisaram de resgate. A árvore adiciona mais dependências encadeadas — então o risco de travamento **aumenta**, não diminui. Mitigação: cada tarefa da árvore declara explicitamente qual é o próximo passo, e a régua roda como fiscal, avisando quando algo emperra. É um risco gerenciável, mas tem que entrar no plano de propósito.

**A árvore garante que a etapa existe, não que ela é bem-feita.** O robô pode fazer a clarificação de qualquer jeito. Isso é o teto residual: primeiro a gente garante que a etapa **acontece** (o buraco gigante de hoje); a **qualidade** da etapa é o degrau seguinte, depois. É honesto assumir isso desde já.

---

## O que NÃO muda (a parte tranquilizadora)

Os 47 robôs ficam **intactos**. A gente não toca no comportamento de nenhum deles — só muda o formato do trabalho que chega até eles. Risco de quebrar o que já funciona: praticamente zero.

---

## Depois de fechar estas decisões

Quando você refletir e a gente fechar os cinco pontos, isso vira um **plano de construção** — e aí sim entra a máquina de construir (com testes, revisão, tudo), porque aí já existe o quê construir. A ordem é sempre: decidir → planejar → construir. Estamos no primeiro passo, do jeito certo.
