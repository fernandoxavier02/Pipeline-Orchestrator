---
source: "Pulsar/Heavy/TESTS_USER_STORY_HEAVY.md"
---

## Diretrizes de testes para tradução de user story – Nível Heavy

User stories complexas, com múltiplos requisitos, regras de negócio intrincadas ou dependências externas relevantes exigem uma abordagem estruturada para tradução técnica e validação. Este documento apresenta boas práticas para decompor essas histórias, elaborar critérios de aceitação completos e preparar testes que sirvam de base para o desenvolvimento orientado a testes (TDD).

### 1. Diagnóstico detalhado da história

1. **Mapeamento do contexto**: identifique todos os atores, sistemas externos e variáveis de contexto envolvidos. Crie um diagrama de casos de uso ou modelo de domínio para visualizar interações.
2. **Identificação de requisitos implícitos**: além do texto fornecido, busque regras tácitas (por exemplo, políticas de negócio, restrições legais, limites de performance). Consulte stakeholders ou documentação de processo.
3. **Análise de impacto**: avalie como a nova funcionalidade interage com features existentes, APIs e base de dados. Anote riscos de regressão ou necessidade de refatoração.

### 2. Elaboração de critérios de aceitação e matriz de cenários

1. **Decompor em sub‑funcionalidades**: divida a user story em partes menores, cada uma com seu próprio objetivo e critério de aceitação. Isso facilita teste e implementação incremental.
2. **Criar matriz de cenários**: para cada sub‑funcionalidade, construa uma matriz listando variações de entradas (dados válidos, inválidos, limites) e estados (por exemplo, usuário autenticado/não autenticado, configurações específicas). Defina o resultado esperado de cada combinação.
3. **Priorizar cenários**: classifique a matriz por criticidade e risco. Destaque cenários obrigatórios (que precisam estar na primeira entrega) e cenários avançados (que podem ser implementados depois).

### 3. Especificação técnica com foco em testes

1. **Formalizar contratos**: se a user story implica expor ou consumir APIs, defina contratos formais (OpenAPI, GraphQL) incluindo exemplos de requisições, respostas e códigos de erro. Esses contratos servirão de base para geração de testes automatizados.
2. **Modelagem de dados**: elabore modelos e esquemas de persistência necessários. Defina validações, constraints e relacionamentos. Planeje testes para migrações e integridade referencial.
3. **Critérios não funcionais**: documente requisitos de performance, segurança, conformidade e usabilidade que devem ser validados por testes específicos.

### 4. Planejamento de testes automatizados

1. **Escrever cenários BDD em detalhe**: utilize Gherkin ou formato equivalente para cada linha da matriz de cenários, descrevendo pré‑condições, ações e resultados esperados. Inclua títulos claros e tags para facilitar filtragem.
2. **Preparar dados e *fixtures***: para cenários complexos, prepare conjuntos de dados de teste com diferentes estados (por exemplo, usuários com histórico extenso, contas suspensas). Armazene fixtures versionadas.
3. **Determinar níveis de teste**:
   - **Unitários**: validar regras de negócio isoladas (cálculos, validações).
   - **Integração**: verificar comunicação entre módulos, persistência e consistência de dados.
   - **Contratos de API**: assegurar conformidade entre produtor e consumidor de serviços.
   - **E2E**: simular o fluxo completo do usuário, inclusive via interface gráfica, quando necessário.
   - **Propriedade**: aplicar property-based testing para regras com muitos domínios de entrada.

### 5. Validação da tradução e refinamento

1. **Reuniões de refinamento**: apresente critérios e cenários à equipe de produto e a stakeholders para revisão. Ajuste critérios conforme feedback.
2. **Cross‑review**: peça a um desenvolvedor ou arquiteto para revisar a especificação e os testes propostos, identificando inconsistências ou melhorias.
3. **Traçado de dependências**: garanta que todas as dependências (serviços externos, bibliotecas, dados) estão mapeadas e que existem estratégias de *mocking* ou sandboxing para testes.

### 6. Produção de artefatos de apoio

1. **Documentos de especificação**: compile todos os critérios, cenários, modelos de dados, contratos de API e diagramas em um documento versionado (`specs/<feature>.md` ou equivalente).
2. **Backlog de tarefas técnicas**: crie tarefas ou histórias de implementação correspondentes a cada sub‑funcionalidade e cenário, incluindo testes automatizados. Estime esforço e dependências.
3. **Plano de testes**: gere um plano de execução descrevendo quais testes serão automatizados inicialmente e quais ficarão para etapas posteriores (por exemplo, performance ou segurança).

### 7. Resultado esperado

Ao concluir a tradução heavy de uma user story, você terá:

- Uma decomposição completa da história em sub‑funcionalidades, cenários e critérios de aceitação.
- Especificações técnicas detalhadas (contratos, modelos de dados, restrições) prontas para consumo pela equipe de desenvolvimento.
- Um conjunto de testes BDD ou pseudo‑código cobrindo variações críticas, pronto para automação.
- Um backlog organizado de tarefas técnicas com foco em TDD e cobertura de testes.

Essas diretrizes ajudam a garantir que histórias complexas não sejam mal interpretadas e que a implementação posterior esteja alinhada aos requisitos de negócio e qualidade.
