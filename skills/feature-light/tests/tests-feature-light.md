---
source: "Pulsar/Ligth/TESTS_USER_STORY_LIGHT.md"
---

## Diretrizes de testes para tradução de user story – Nível Light

Esta diretriz orienta como transformar uma narrativa em linguagem natural, fornecida por um usuário final (não técnico), em critérios técnicos claros e verificáveis. O objetivo é garantir que a interpretação da história de usuário para requisitos de software esteja correta e completa, utilizando testes como mecanismo de validação.

### 1. Entendimento inicial e validação

1. **Ler e resumir a história**: leia a user story original e escreva um resumo em linguagem técnica simples. Identifique atores, intenções e restrições implícitas.
2. **Identificar lacunas**: anote quaisquer ambiguidades ou detalhes ausentes (ex.: formatos de dados, limites, mensagens de erro). Faça perguntas objetivas ao solicitante ou use a pipeline de *diagnóstico* para obter clareza.
3. **Confirmar entendimento**: apresente o resumo ao solicitante (ou represente o usuário) e valide que a interpretação corresponde à intenção original.

### 2. Definir critérios de aceitação em linguagem de negócio

1. **Escrever cenários de aceitação**: utilize o formato *Dado/Quando/Então* para cada comportamento esperado. Por exemplo:
   - *Dado* que o usuário não fez check‑in hoje,
   - *Quando* ele fizer check‑in informando emoção “triste”,
   - *Então* o sistema deve registrar o evento e aumentar o contador de check‑ins do dia.
2. **Cobrir casos alternativos**: inclua cenários para entradas inválidas, permissões insuficientes ou dependências indisponíveis. Cada cenário deve ter resultado previsível.
3. **Priorizar critérios**: marque os critérios essenciais (que precisam ser implementados primeiro) e os desejáveis (que podem ser incrementais).

### 3. Traduzir critérios em testes automatizados

1. **Escolher o nível adequado**: para user stories simples, testes de aceitação podem ser implementados como testes de API ou de camada de aplicação; para fluxos que incluem UI, planeje testes de interface.
2. **Criar esboço de teste**: para cada critério de aceitação, descreva em pseudo‑código ou em notação Gherkin o passo a passo do teste. Use nomes autoexplicativos (ex.: `Cenario: registrar check-in com sucesso`).
3. **Reutilizar componentes**: identifique funções, páginas ou endpoints existentes que podem ser usados para implementar o critério. Se nenhum componente existir, registre a necessidade de criação no backlog.

### 4. Validar abrangência da tradução

1. **Cobertura funcional**: verifique se todos os requisitos explícitos e implícitos da história estão representados nos critérios de aceitação. Use checklists ou diagramas para garantir que nenhuma parte foi esquecida.
2. **Garantir não adição de escopo**: assegure que os critérios não extrapolem o pedido original. Se um critério introduzir funcionalidade não solicitada, questione sua relevância ou remova‑o.
3. **Revisão cruzada**: peça para outro membro da equipe revisar a tradução e os critérios, validando clareza e completude.

### 5. Registrar artefatos e planejar implementação

1. **Documentar critérios**: armazene os cenários em arquivos de especificação (`*.feature` para Gherkin ou Markdown) no repositório. Isso servirá de contrato entre time de produto e desenvolvimento.
2. **Criar tarefas técnicas**: para cada critério, abra histórias técnicas ou *tickets* no sistema de gerenciamento, detalhando implementação, testes automatizados necessários e dependências.
3. **Planejar testes antes da codificação**: antes de iniciar a implementação, prepare os testes automatizados correspondentes (mesmo que falhem inicialmente). Isso garante que a tradução esteja alinhada à prática de TDD.

### 6. Saída esperada

- Um conjunto claro de critérios de aceitação derivados da user story.
- Perguntas de esclarecimento respondidas ou documentadas para consultas futuras.
- Testes de aceitação em pseudo‑código ou Gherkin prontos para serem automatizados.
- Tarefas técnicas criadas para cada critério, alinhadas ao backlog do projeto.

Seguindo estas diretrizes, a equipe assegura que a linguagem do usuário final é corretamente interpretada em termos técnicos e que a implementação posterior atenderá exatamente às expectativas do usuário.
