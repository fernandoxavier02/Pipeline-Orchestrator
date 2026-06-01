---
name: engineering-principles
description: Principios canonicos de engenharia (SOLID, KISS, DRY, YAGNI, SSOT, Clean Architecture, fail-fast, defensive-at-boundaries). Fonte de regra default quando uma decisao tecnica nao esta coberta pela spec do workflow. Carregada por TODOS os 47 cargos como ultima linha de defesa antes de escalar ambiguidade.
when_to_use: Quando voce esta executando uma tarefa e encontra uma decisao tecnica NAO COBERTA pela spec do workflow ativo (PAPERCLIP-{BUGFIX,FEATURE,AUDIT,UX,SPEC,ADVERSARIAL}-WORKFLOW.md). Consulte ESTA skill ANTES de criar approval issue. Se nem aqui ha resposta, ESCALE — nao improvise.
---

# engineering-principles

Skill **canonica e universal**. Carregada por todos os 47 cargos. Contem os principios que ditam decisoes tecnicas quando a spec especifica do workflow nao cobre o caso.

## 1. Regra de uso (LEIA ANTES)

Hierarquia de fontes de decisao, em ordem:

```
1. Spec ESPECIFICA do workflow (PAPERCLIP-{tipo}-WORKFLOW.md)
   |
   v se nao cobre o caso
   v
2. Arquivos canonicos do PROJETO (ex: CLAUDE.md global do usuario, README.md do projeto cliente)
   |
   v se nao cobre o caso
   v
3. ESTA SKILL (engineering-principles)
   |
   v se nem aqui cobre
   v
4. ESCALATION: criar approval issue para o Board, pegar proxima task disponivel
   (NAO improvisar, NAO inventar)
```

**Iron Law universal:** voce NUNCA toma decisao por intuicao ou por "como geralmente se faz". Decisao tecnica = regra explicita citavel (file:line) das 4 fontes acima.

## 2. SOLID — Cinco principios de design OO/modular

### S — Single Responsibility Principle
**Regra:** cada modulo/classe/funcao tem **UMA unica razao para mudar**.

**Decisao default:**
- Tentado a colocar 2+ responsabilidades em 1 classe? **NAO** — separar.
- Funcao com mais de uma "e tambem"? **NAO** — separar.

**Anti-padroes proibidos:**
- "God class" (classe que faz tudo)
- "Utility module" com 20 funcoes nao-relacionadas
- Funcao chamada `process_and_save_and_notify`

### O — Open/Closed Principle
**Regra:** entidades sao **abertas para extensao, fechadas para modificacao**.

**Decisao default:**
- Adicionar comportamento novo? Use composicao, interfaces, ou heranca disciplinada — NAO edite a logica core existente.
- If/else crescendo com `if type == "X"`? Substituir por polimorfismo ou strategy pattern.

### L — Liskov Substitution Principle
**Regra:** subtipo deve substituir o tipo base sem quebrar o programa.

**Decisao default:**
- Subclasse retorna `null` onde base retorna sempre objeto? **VIOLACAO** — repensar hierarquia.
- Subclasse joga exception inesperada que base nao joga? **VIOLACAO**.

### I — Interface Segregation Principle
**Regra:** prefira muitas **interfaces pequenas e focadas** a uma interface grande.

**Decisao default:**
- Interface com 15 metodos? Quebrar em 3-4 interfaces de 3-5 metodos.
- Classe forcada a implementar metodo que nao usa? Sinal de I violado.

### D — Dependency Inversion Principle
**Regra:** modulos de alto nivel NAO dependem de modulos de baixo nivel — **ambos dependem de abstracoes**.

**Decisao default:**
- Service que faz `new MySQLClient()` direto? **VIOLACAO** — injetar interface `Database`.
- Logica de negocio sabendo o nome de uma biblioteca especifica? **VIOLACAO** — abstrair.

## 3. KISS — Keep It Simple, Stupid

**Regra:** a solucao **mais simples** que resolve o problema declarado eh a correta. Complexidade extra exige justificativa explicita.

**Decisao default:**
- Tem duas formas, uma simples e uma complexa? **Escolha a simples**, salvo a complexa estar justificada por requisito declarado.
- Funcao que faz UMA coisa em 3 linhas eh melhor que funcao que faz O MESMO em 30 linhas "futureproof".

**Anti-padroes proibidos:**
- Adicionar opcoes/parametros "porque um dia podemos precisar"
- Camada de abstracao sem requisito atual que a justifique
- Generics excessivos quando 1 tipo concreto resolve

## 4. DRY — Don't Repeat Yourself

**Regra:** **uma unica representacao** por regra, logica, ou constante. Repeticao significativa **deve** ser extraida.

**Decisao default:**
- Mesma logica em 3+ lugares? Extrair pra funcao/classe compartilhada.
- Mesma constante em 2+ lugares? Mover pra arquivo de configuracao ou modulo de constants.
- Linha quase-identica com pequena variacao? Parametrizar a variacao.

**EXCECAO importante (KISS prevalece):**
- Repeticao **superficial** (2 funcoes parecem iguais MAS evoluem por razoes diferentes) **NAO** deve ser deduplicada prematuramente. Espere pelo menos a 3a ocorrencia COM a mesma razao de mudar antes de extrair (rule of three).
- "Acidente sintatico vs duplicacao semantica" — se as duas vao mudar juntas pra sempre, DRY se aplica. Se mudam por motivos diferentes, NAO se aplica.

## 5. YAGNI — You Aren't Gonna Need It

**Regra:** **nao implemente** funcionalidade ate que seja **necessaria**. Sem codigo especulativo.

**Decisao default:**
- "E se um dia precisarmos de..." → NAO implementar.
- Parametro opcional adicional "por flexibilidade"? NAO adicionar.
- API que nada chama? Remover.

**Limite de YAGNI:**
- Pontos de extensao OBVIOS (ex: interface de banco para permitir futuras migracoes) podem ficar — desde que tenham CUSTO BAIXO. Custo alto requer requisito.

## 6. SSOT — Single Source of Truth

**Regra:** para cada **fato** (constante, regra de negocio, decisao de design), existe **UM lugar canonico** onde ele esta declarado. Outros lugares **referenciam**, nao duplicam.

**Decisao default:**
- Definicao de tax_rate em 3 modulos diferentes? **VIOLACAO** — mover pra `config/tax.py`, importar.
- Regra "premium customer = total_spent > $1000" no codigo E no comentario E no doc? **VIOLACAO** — definir UM lugar (codigo), comentario/doc referencia.
- Schema do banco gerado em 2 ferramentas (Prisma + Drizzle)? **VIOLACAO** — escolher um, usar como SSOT.

**Quando ha conflito entre fontes:**
- A SSOT canonica vence. Outros locais sao atualizados pra refletir.

## 7. Clean Architecture (Dependency Rule)

**Regra:** **dependencias apontam para dentro** — codigo externo (UI, framework, banco) depende de codigo interno (domain, business rules), nunca o contrario.

**Decisao default:**
- Modulo `domain/order.py` importando `flask`? **VIOLACAO** — domain nao conhece framework.
- Service depende direto de `postgresql_driver`? **VIOLACAO** — injetar interface `Database`.
- Camadas tipicas (do externo pra dentro): UI → Controllers → UseCases/Services → Domain Entities.

**Resumo aplicavel sem entrar em filosofia:**
- Pergunta: "esse modulo precisaria mudar se eu trocar o framework/banco?" Se sim, mover pra camada mais externa.
- Pergunta: "esse modulo precisaria mudar se a regra de negocio mudar?" Se sim, eh domain — proteger.

## 8. Fail-fast em fronteiras

**Regra:** **valide na borda**, confie no interior. Entradas que vem de fora (user input, network, file system) sao validadas IMEDIATAMENTE na chegada. Codigo interno confia que dados ja sao validos.

**Decisao default:**
- API endpoint recebe JSON? Validar schema na entrada (`pydantic`/`zod`/etc.) ANTES de chamar service.
- Service interno faz check defensivo `if x is None: raise`? Provavelmente desnecessario — confiar que API validou.
- Codigo interno cheio de `assert isinstance(x, str)`? Sinal de fronteira mal-definida.

## 9. Anti-padroes universais (PROIBIDOS sem justificativa)

| Anti-padrao | Por que eh ruim | Aceitar quando |
|---|---|---|
| **Premature abstraction** | Cria flexibilidade que nunca eh usada | Quando 3+ casos concretos ja existem |
| **Magic numbers/strings** | Sem nome = sem rastreabilidade | Nunca — sempre `CONSTANTE = "valor"` |
| **Global mutable state** | Imprevisivel, dificil de testar | Apenas configs read-only ou logger |
| **Boolean parameter trap** | `do_X(true)` ilegivel sem ler signature | Use enums ou metodos separados |
| **Exception swallowing** | `try: x() except: pass` esconde bug | Sempre log + decidir politica (re-raise/escalar) |
| **God function** | Funcao > 50 linhas que faz tudo | Refatorar em sub-funcoes nomeadas |
| **Comment explaining bad code** | Comentario nao corrige o codigo | Reescrever o codigo, deletar comentario |
| **Stringly-typed code** | `if status == "active"` espalhado | Usar enum `Status.ACTIVE` |

## 10. Quando aplicar qual principio em conflito

Quando dois principios apontam direcoes diferentes, use esta ordem de prioridade:

```
KISS > YAGNI > DRY > SOLID(SRP, S/I) > SOLID(O, L, D)
```

**Exemplos:**
- KISS vs DRY: 2 funcoes parecidas que evoluirao por motivos diferentes — **KISS vence**, nao extrair.
- DRY vs SOLID: extrair codigo duplicado mas isso introduz acoplamento entre modulos com responsabilidades diferentes — **SOLID vence**, nao extrair.
- YAGNI vs OCP: adicionar ponto de extensao "pra futuro" — **YAGNI vence**, nao adicionar.

## 11. Como reportar quando aplicou esta skill

Quando voce aplicar uma regra desta skill como fallback (porque a spec do workflow nao cobria), DEVE postar comment estruturado:

```markdown
### CANONICAL_FALLBACK_APPLIED v1

```yaml
issue_id: {{id}}
gap_description: "Decisao X nao coberta na spec do workflow"
fallback_source: engineering-principles
rule_applied: {{ex: SOLID/SRP, KISS, DRY/rule-of-three}}
decision: "{{o que voce decidiu fazer baseado na regra}}"
justification: "{{1-2 linhas citando a regra}}"
```
```

Isso vira log auditavel. Se Board nao concordar, vai sinalizar e voce ajusta na proxima.

## 12. Quando ESCALAR (nem aqui cobre)

Se voce chegou a esta skill E nem aqui ha regra clara para o caso, voce DEVE escalar. Acao:

1. Criar approval issue atribuida ao Board
2. Comment estruturado no formato:
   ```markdown
   ### ESCALATION_REQUEST v1

   ```yaml
   issue_id: {{id_da_issue_em_andamento}}
   gap_description: "Decisao especifica nao coberta em spec nem em engineering-principles"
   options_considered:
     - "Opcao A: {{...}}"
     - "Opcao B: {{...}}"
   recommendation: "{{sua melhor estimativa, sem ser autoritativa}}"
   blocking_my_work: {{true | false}}
   ```
   ```
3. **NAO BLOQUEIE**: marque a issue atual como `paused` (NAO `blocked`), pegue proxima task disponivel da fila, e volte quando Board responder.

So eh `blocked` quando voce **literalmente nao pode continuar nenhuma outra tarefa** (raro).

## 13. Princípio mestre

> "Quando em duvida, escolha o caminho que produz menos codigo, mais simples, e mais isolado de mudancas externas. Quando isso conflita, vence o caminho que mantem o codigo mais facil de DELETAR no futuro."

Esse eh o filtro final. Se voce nao consegue decidir entre dois caminhos validos, escolha o que sera **mais facil de remover** se descobrirmos depois que estava errado.
