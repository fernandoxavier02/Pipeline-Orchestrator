# Requirements — Pipeline completo e gates de UI

## Requisitos bloqueadores

- Como auditor, quero schemas físicos versionados para UI question, gate decision, protocol event, sentinel-state, confidence score, evidence record e timeout, para bloquear avanço quando a evidência for inválida.
- Como mantenedor, quero smoke test real de hooks no começo, para provar OpenCode real antes dos modos.
- Como usuário operador, quero toda decisão discreta pela UI/tool de question do OpenCode, para evitar aprovação solta.
- Como mantenedor, quero comandos globais prefixados por padrão, para evitar colisão com comandos existentes.

Critérios de aceite:

- Cada contrato físico tem campos obrigatórios, exemplo válido, exemplo inválido, regra de bloqueio e teste obrigatório.
- SessionStart, UserPromptSubmit, PreToolUse Edit/Write, PreToolUse Agent e Stop inseguro têm smoke test antes de qualquer modo.
- Cada pergunta da matriz tem texto, opções exatas, recomendação técnica quando aplicável, gate, evento, decisão e efeito.
- Comando global curto sem decisão explícita bloqueia instalação.

## Histórias por modo

### Bugfix light

Como usuário operador, quero reproduzir erro, aplicar fix mínimo e rodar regressão essencial, para resolver problema simples.

Aceite: entrada bug report simples; ação roda reprodução e RED; saída esperada GREEN + regressão; falha esperada sem RED bloqueia; evidência obrigatória RED, GREEN e closeout.

### Bugfix heavy

Como usuário operador, quero raiz, plano aprovado, batches e revisão, para corrigir bug arriscado.

Aceite: entrada bug crítico; ação pede plano pela UI; saída esperada raiz + batches + verify-completion; falha esperada achado HIGH bloqueia; evidência obrigatória raiz, plano, RED/GREEN, adversarial e final verdict.

### Feature/implement light

Como usuário operador, quero entregar um slice vertical pequeno, para ter valor de ponta a ponta.

Aceite: entrada feature pequena; ação aprova cenário; saída esperada comportamento integrado; falha esperada slice sem integração bloqueia; evidência obrigatória ATDD, RED/GREEN e não regressão.

### Feature/implement heavy

Como usuário operador, quero múltiplos slices verticais com plano, para entregar feature grande em partes seguras.

Aceite: entrada feature complexa; ação aprova plano e batches; saída esperada integração entre slices; falha esperada ausência de checkpoint bloqueia; evidência obrigatória plano, batch evidence, review e final verdict.

### Audit light

Como auditor, quero auditoria somente leitura com achados objetivos, para avaliar sem alterar código.

Aceite: entrada escopo de auditoria; ação roda read-only; saída esperada achados com evidência; falha esperada qualquer escrita funcional bloqueia; evidência obrigatória read-only proof e audit report.

Bloqueadores objetivos: escrita funcional, achado sem evidência, severidade sem justificativa, tracing externo sem consentimento.

### Audit heavy

Como auditor, quero auditoria ampla com matriz de risco, para priorizar correções.

Aceite: entrada escopo aprovado; ação coleta evidências; saída esperada matriz de risco; falha esperada CRITICAL sem STOP_RULE bloqueia; evidência obrigatória matriz, fontes, revisão adversarial.

Bloqueadores objetivos: ausência de matriz de risco, menos de 3 frentes avaliadas quando escopo heavy, qualquer alteração funcional.

### UX light

Como usuário de produto, quero validar persona, fluxo principal e acessibilidade básica, para detectar fricção rápida.

Aceite: entrada fluxo principal; ação valida jornada; saída esperada achados priorizados; falha esperada sem persona bloqueia; evidência obrigatória persona, fluxo e acessibilidade básica.

Bloqueadores objetivos: contraste crítico, navegação principal quebrada, ausência de persona, fluxo sem evidência.

### UX heavy

Como usuário de produto, quero jornadas, acessibilidade e validação visual ampla, para melhorar experiência com segurança.

Aceite: entrada jornada complexa; ação aprova personas pela UI; saída esperada relatório visual/fluxo; falha esperada bloqueio de acessibilidade crítico; evidência obrigatória personas, cenários, visual/fluxo e review.

Bloqueadores objetivos: WCAG crítico, tarefa principal impossível, inconsistência visual que impede ação, falta de evidência visual quando aplicável.

### SPEC light

Como mantenedor, quero requisitos, design e tasks mínimos, para planejar trabalho simples.

Aceite: entrada ideia simples; ação cria spec enxuta; saída esperada AC rastreável; falha esperada sem tasks bloqueia; evidência obrigatória spec gates.

Bloqueadores objetivos: falta de user story, falta de critério de aceite testável, tasks sem slice vertical.

### SPEC heavy

Como mantenedor, quero spec completa com DDD, testes, contratos e riscos, para guiar trabalho grande.

Aceite: entrada trabalho complexo; ação cria requirements/design/tasks/test strategy; saída esperada rastreabilidade AC; falha esperada contrato pendente bloqueia; evidência obrigatória revisão adversarial da spec.

Bloqueadores objetivos: requisitos sem rastreabilidade, design sem bounded contexts, tasks horizontais, ausência de test strategy.

### Pipeline full

Como usuário operador, quero classificador geral com confirmação, para escolher a rota correta.

Aceite: entrada pedido livre; ação Mode Routing propõe modo light/heavy; saída esperada UI confirma; falha esperada classificação sem confirmação bloqueia; evidência obrigatória ORCHESTRATOR_DECISION, UI question e gate decision.
