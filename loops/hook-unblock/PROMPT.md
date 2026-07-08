# PROMPT DE LOOP — Destravar os hooks do pipeline (deadlock de despacho pendente + contabilidade) — 2026-07-07

Você é um agente de código rodando em LOOP AUTOMÁTICO no repositório
.. A cada execução deste prompt você faz EXATAMENTE UMA tarefa
da lista e termina. Sua memória entre execuções são os arquivos de loops/hook-unblock/ e
o próprio repositório — nada da conversa anterior persiste.

## Passos desta iteração (siga na ordem)

1. Leia loops/hook-unblock/LOOP_PLAN.md (fatos + tarefas) e loops/hook-unblock/AGENT_NOTES.md
   (lições de voltas anteriores; crie vazio se não existir).
2. Garanta que está na branch `loop/hook-unblock` (crie a partir de
   main se não existir). NUNCA trabalhe direto na
   main.
3. Escolha o PRIMEIRO item `- [ ]` do plano que NÃO seja GATE-HUMANO nem
   esteja BLOQUEADO. Faça SOMENTE esse item nesta iteração. Só um.
4. Antes de escrever qualquer código: PROCURE no repositório (grep) o que já
   existe. NUNCA assuma que algo não está implementado sem procurar.
5. Implementação SEMPRE completa. NUNCA escreva placeholder, stub, TODO no
   código ou "versão simplificada". Se o item for grande demais para uma
   iteração, divida-o em sub-itens no LOOP_PLAN.md e execute só o primeiro.
6. Contrapressão (obrigatória antes de marcar concluído):
   a. Rode o critério de aceite escrito no próprio item.
   b. Rode `node loops/hook-unblock/check_no_new_failures.cjs` — critério: nenhuma falha NOVA além do baseline
      registrado no plano.
   d. Registre a evidência (comando + saída resumida) em AGENT_NOTES.md.
7. Só então marque o item `- [x]` no LOOP_PLAN.md, com data e 1 linha de
   evidência.
8. Descobriu bug, pendência ou dúvida FORA do item atual? NÃO conserte
   agora — adicione um item novo `- [ ]` na seção "Descobertas do loop".
9. Aprendeu algo operacional (comando que funciona, pegadinha de ambiente)?
   Registre em AGENT_NOTES.md para as próximas voltas.
10. Finalize: commit SELETIVO só dos arquivos que você tocou neste item
    (nunca inclua .env, segredos/credenciais, dados do .gitignore), com mensagem clara.
    NÃO faça push — push é decisão humana.
11. Se TODOS os itens do plano estiverem `[x]`, GATE-HUMANO ou BLOQUEADO:
    escreva loops/hook-unblock/LOOP_DONE.md com resumo executivo (feito / pendente de
    humano / bloqueado, com evidências), commite-o e NÃO altere mais nada.

## Proibições permanentes (valem em TODA iteração, sem exceção)

- NAO tocar tests/regression/v8.21.0/ — testes congelados da fatia S2 da spec workflow-audit-remediation (READ-ONLY, contrato de outra frente de trabalho)
- NAO tocar references/gates.md, a tabela Mandatory Gates nem o Gate Registry (Iron Law do repo): nenhum gate novo, nenhuma linha alterada
- Escopo de arquivos permitido: .claude/hooks/, lib/, hooks/hooks.json, tests/regression/v8.22.0/ e a pasta do loop. NADA em agents/, skills/, commands/, references/, .codex/ (esses hooks nao espelham por design)
- Preservar o diff nao-commitado de .claude/hooks/edit-guard-hook.cjs (implementacao da fatia S1): fazer commit de checkpoint separado desse trabalho ANTES da primeira volta e nunca adicionar arquivos ao stage em bloco — commits sempre seletivos por arquivo
- Postura fail-closed dos gates PRESERVADA: toda isencao nova e POSITIVA (prova afirmativa), ancorada e sujeita a mesma verificacao de assinatura HMAC do estado que o gate ja usa; casamento por substring simples de comando e proibido (anti-injecao)
- Sem publicacao, sem bump de versao, sem comando de rede — release e o item GATE-HUMANO e o loop apenas PREPARA o runbook
- Nao commitar .pipeline/ (working-state) e nao tocar .kiro/ (specs de outra frente)
- Proibido placeholder/stub/TODO: item grande demais vira sub-item novo na secao Descobertas do LOOP_PLAN.md
- NUNCA commitar segredos, credenciais, .env ou dados ignorados pelo
  .gitignore.
- NUNCA executar ações destrutivas, de custo (nuvem) ou de rede/produção:
  itens assim são GATE-HUMANO — prepare o runbook, marque o item como
  pronto-para-humano e passe ao próximo.
- Diff mínimo: não reformatar, não renomear, não "melhorar de passagem" o
  que não faz parte do item.
- Se um mesmo item falhar a contrapressão 2 vezes seguidas: marque-o
  BLOQUEADO com o diagnóstico e passe ao próximo (nunca insista em círculo).
