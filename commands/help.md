---
description: "Cardápio do plugin pipeline-orchestrator: explica os comandos em linguagem simples — o que cada um faz, quando usar, exemplo, e as opções (flags) de cada um. Não executa nada, só exibe o guia."
allowed-tools: Read
---

**INSTRUÇÃO PARA O ASSISTENTE — LEIA E OBEDEÇA:** Este é um comando de exibição. A sua resposta ao usuário DEVE ser o guia abaixo, reproduzido na íntegra e formatado de forma limpa, incluindo TODAS as opções (flags) de cada comando. NÃO resuma, NÃO diga "está pronto", NÃO faça perguntas, NÃO encerre sem mostrar — apenas apresente o guia completo como a sua resposta. Não exiba esta linha de instrução.

# Pipeline Orchestrator — Guia dos comandos

Este plugin é uma linha de montagem para trabalho de software. Você descreve uma tarefa em palavras e ele cuida do resto com vários robôs especialistas: um classifica, outro planeja, outro escreve os testes, outro implementa, outros revisam de forma crítica, e no fim sai um veredito de "pode ir" ou "não pode ir". O nome desse veredito final é "Pa de Cal".

Existem dois jeitos de usar:

- **Aqui na sua máquina** — você acompanha em tempo real, responde às perguntas e aprova cada passo. São o comando guarda-chuva `pipeline`, o `brainstorm`, e um atalho direto pra cada tipo de tarefa (conserto de bug, funcionalidade, auditoria, experiência do usuário, e outros).

Os comandos se dividem em duas famílias: os que rodam na sua máquina e o de ajuda. Abaixo, cada um explicado.

---

## Comandos que rodam na sua máquina

### `/pipeline-orchestrator:pipeline`
É o comando principal, o coração do plugin. Você dá uma tarefa qualquer — "conserta o login que trava no celular", "cria a tela de relatório", "audita o módulo de pagamento" — e ele descobre sozinho que tipo de tarefa é e o tamanho dela. Depois te mostra uma proposta pra você confirmar, e só então começa a trabalhar. Ele escreve os testes antes do código (pra garantir que o conserto realmente funciona), revisa o próprio trabalho de forma crítica a cada etapa, e fecha com o veredito final.

Quando usar: sempre que quiser que algo seja feito de verdade, com qualidade e rede de segurança. É o que você usa na maioria das vezes.

Ele também tem **modos** (uma palavra logo depois do comando) e **opções** (começam com dois tracinhos):

- `diagnostic <tarefa>` — só analisa e te diz o tipo e o tamanho da tarefa, sem fazer nada. Serve pra você ter uma ideia antes de mandar pra valer.
- `continue` — retoma um trabalho que ficou pela metade, de onde parou.
- `review-only` — pula tudo e só faz uma revisão crítica final sobre mudanças que você já fez na mão. Não conserta nada, só aponta.
- `--simples` / `--media` / `--complexa` — força o tamanho da tarefa, caso você discorde da classificação automática. Pequena, média ou grande.
- `--light` / `--heavy` — escolhe a versão leve (mais rápida) ou pesada (mais minuciosa) do fluxo de conserto de bug.
- `--variant=feature-light` / `--variant=feature-heavy` — a mesma escolha de leve ou pesado, mas para criar funcionalidade nova.
- `--hotfix` — modo emergência, pra quando algo está pegando fogo em produção. Corta etapas de planejamento pra ir mais rápido, mas mantém os testes e a revisão de segurança. Faz uma tarefa de cada vez, com cuidado máximo.
- `--grill` — liga um "interrogatório" de design: o robô te faz perguntas duras sobre as decisões de arquitetura antes de começar. Use quando a tarefa tem decisões importantes que valem a pena pensar bem.
- `--plan` — obriga a fase de planejamento (com um plano que você aprova) mesmo numa tarefa pequena.
- `--no-plan` — pula o planejamento. Só funciona em tarefa média; se a tarefa for grande, o plano roda mesmo assim, porque pular nesse caso costuma dar problema.
- `--type=<tipo>` — você já declara o tipo da tarefa de antemão (por exemplo `--type=spec`, `--type=feature`), em vez de deixar ele adivinhar.
- `--strict-spec` — modo rígido para automação sem ninguém na frente do teclado (robôs, integração contínua): ele só trata a tarefa como "especificação" se você declarar isso de forma explícita, em vez de adivinhar pela escrita. Evita que ele entre no caminho errado quando não tem você ali pra confirmar.

Exemplo: `/pipeline-orchestrator:pipeline conserta o cálculo de juros que arredonda errado`

### `/pipeline-orchestrator:brainstorm`
É a fase de pensar antes de fazer. Em vez de já sair codificando, este comando senta com você: captura a ideia, faz perguntas pra entender direito o que você quer, sugere caminhos alternativos que talvez você não tenha pensado, e no fim escreve uma especificação completa — um documento com os requisitos, o desenho da solução e a lista de tarefas. Pra tarefas médias e grandes, o comando principal chama este aqui automaticamente, porque pensar antes economiza retrabalho depois.

Quando usar: quando a ideia ainda está crua e você quer lapidar antes de construir.

Opções:
- `--resume <id>` — retoma um brainstorm que ficou pela metade.
- `--type <Tipo>` — você já diz de antemão o tipo da tarefa (conserto, funcionalidade nova, auditoria, etc.), pulando a parte de adivinhação.
- `--no-impl` — para assim que a especificação fica pronta, sem oferecer seguir pra construção.
- `--skip-validate-gap` — pula a comparação com o código que já existe. Use em projeto novo, começando do zero, onde não há nada pra comparar.
- `--skip-alternatives` — pula a parte de sugerir caminhos alternativos. Use quando você já decidiu o caminho e quer ir direto.

Exemplo: `/pipeline-orchestrator:brainstorm quero um sistema de cupons de desconto`

### `/pipeline-orchestrator:help`
É este guia que você está lendo. Lista e explica todos os comandos. Não tem opções.

---

## Atalhos locais por tipo de tarefa

Estes também rodam na sua máquina, igual ao `pipeline` — a diferença é que cada um já entra direto no tipo de tarefa certo, sem o classificador precisar adivinhar. São o espelho local dos comandos do servidor: o mesmo trabalho, mas aqui, com você acompanhando e aprovando cada passo. Use quando você já sabe que tipo de tarefa é e quer ir direto ao ponto. Quase todos aceitam `--light` (mais rápido) ou `--heavy` (mais minucioso); sem flag, ele mesmo decide o tamanho.

### `/pipeline-orchestrator:bugfix`
Conserta um defeito. Vai pelo caminho completo: escreve o teste que prova o conserto antes de mexer no código, implementa, revisa de forma crítica e fecha com o veredito. Mexe no código de verdade. Aceita `--light` / `--heavy`.

### `/pipeline-orchestrator:feature`
Constrói uma funcionalidade nova quando você já tem a história e os critérios do que ela precisa fazer. Mexe no código. Aceita `--light` / `--heavy`.

### `/pipeline-orchestrator:user-story`
A mesma coisa que a funcionalidade nova, mas quando você descreve em forma de história — "como cliente, quero redefinir a senha pelo e-mail". Ele tira da frase os critérios do que precisa funcionar e constrói. Mexe no código. Aceita `--light` / `--heavy`.

### `/pipeline-orchestrator:refactor`
Arruma a arrumação do código sem mudar o que ele faz por fora. Serve pra quando o programa funciona certo, mas a tripa dele está bagunçada e difícil de mexer — você quer reorganizar, renomear, separar em pedaços menores, sem que o comportamento visível mude em nada.

Antes de tocar em qualquer linha, ele fecha um "contrato de mudança": o que pode mexer e o que é proibido mexer (nada de mudar o que o programa entrega por fora). Esse contrato vira uma trava — se algum passo tentar furar a regra, o trabalho para na hora.

Pra provar que não quebrou nada, ele roda os testes que olham o comportamento de fora antes de começar e de novo no fim; os dois resultados têm que bater igualzinho. Tem versão leve (uma arrumação pequena num só lugar) e pesada (arrumação que cruza vários lugares, com uma revisão crítica final). Use quando quiser limpar a casa com rede de segurança.

### `/pipeline-orchestrator:audit`
Examina um pedaço do sistema e entrega um relatório de riscos e problemas. Só leitura, não mexe em nada. Aceita `--light` / `--heavy`.

### `/pipeline-orchestrator:ux-sim`
Simula como diferentes tipos de pessoa usariam o produto e aponta onde elas travariam. Só leitura, nunca mexe no código. Aceita `--light` / `--heavy`.

### `/pipeline-orchestrator:review`
Confere uma tarefa já implementada contra aquilo que tinha sido combinado pra ela — se está completa, dentro do escopo e com prova de que funciona — e diz se pode ser dada como pronta. Só leitura. Você passa a identificação da tarefa.

### `/pipeline-orchestrator:spec`
Escreve a especificação completa de uma ideia do zero: clareia o que você quer, propõe melhorias, interroga o desenho, monta os requisitos, o desenho e a lista de tarefas, passa por uma revisão crítica e sela o documento. Ele para aí, não constrói nada. Use `--amend` pra mexer numa especificação já selada. Pra construir a partir de uma especificação que já existe, são outros três atalhos: a versão leve, a pesada e a de só-auditoria.

---

Uma dica pra fechar: as opções de planejamento e interrogação do comando local (`--grill`, `--plan`, `--no-plan`) afetam apenas o comando pipeline.
