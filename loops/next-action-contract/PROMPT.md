# PROMPT DE LOOP — Next-Action Contract + liveness + retomada S2 (Pipeline-Orchestrator enforcement) — 2026-07-08

Você é um agente de código rodando em LOOP AUTOMÁTICO no repositório
.. A cada execução deste prompt você faz EXATAMENTE UMA tarefa
da lista e termina. Sua memória entre execuções são os arquivos de loops/next-action-contract/ e
o próprio repositório — nada da conversa anterior persiste.

## Passos desta iteração (siga na ordem)

1. Leia loops/next-action-contract/LOOP_PLAN.md (fatos + tarefas) e loops/next-action-contract/AGENT_NOTES.md
   (lições de voltas anteriores; crie vazio se não existir).
2. Garanta que está na branch `loop/next-action-contract` (crie a partir de
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
   b. Rode `node scripts/run-tests.cjs` — critério: nenhuma falha NOVA além do baseline
      registrado no plano.
   c. Rode a auditoria extra do projeto: `docs/audits/2026-07-08-agent-lockup-audit/AUDIT-REPORT.md` — precisa passar.
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
    escreva loops/next-action-contract/LOOP_DONE.md com resumo executivo (feito / pendente de
    humano / bloqueado, com evidências), commite-o e NÃO altere mais nada.

## Proibições permanentes (valem em TODA iteração, sem exceção)

- NUNCA editar nenhum arquivo dentro de .claude/hooks/** — proteção de arquivo sensível do harness bloqueia essa edição em sessão headless/não-interativa (confirmado ao vivo no loop anterior loop/hook-unblock). Se uma tarefa precisar dessa edição, ela deve APENAS preparar o diff/instrução exata num arquivo de nota e marcar como pendência para sessão interativa — nunca tentar a edição.
- NUNCA editar .codex/hooks/** ou qualquer espelho Codex — fora de escopo desta correção.
- NUNCA tocar no cache global de plugins (~/.claude/plugins/cache) nem no marketplace.
- NUNCA enviar os commits para o repositório remoto (sincronizar com o GitHub), nem publicar o pacote no registro npm, nem qualquer ação de release/deploy/versionamento — só commits locais na branch do loop.
- NUNCA git add -A nem git add . cego — a árvore já tem itens não commitados de trabalho anterior do usuário (ver fatos) que devem ser preservados intocados; commits sempre seletivos por caminho explícito.
- NUNCA alterar a tabela 'Mandatory Gates by Complexity' nem o 'Gate Registry' em references/gates.md — lib/next-action.cjs é um SSOT consumido por gates já existentes, não um gate novo (mesmo padrão de lib/audit-read-budget.cjs, v8.15.0).
- NUNCA inventar nome de subagent_type — usar exatamente os já existentes (dispatch-guard.cjs:47-107 AGENT_LEAF_TO_FQN) ou o fallback genérico documentado para workflows sem agents_by_step.
- NUNCA marcar uma tarefa como concluída sem node scripts/run-tests.cjs mostrando zero falhas NOVAS além do baseline.
- NUNCA tentar diferenciar 'parent' de 'subagente' pelo payload do hook (session_id é idêntico entre os dois — ver fatos); toda mensagem de próxima ação deve trazer AMBOS os caminhos possíveis na mesma mensagem.
- NUNCA commitar segredos, credenciais, .env ou dados ignorados pelo
  .gitignore.
- NUNCA executar ações destrutivas, de custo (nuvem) ou de rede/produção:
  itens assim são GATE-HUMANO — prepare o runbook, marque o item como
  pronto-para-humano e passe ao próximo.
- Diff mínimo: não reformatar, não renomear, não "melhorar de passagem" o
  que não faz parte do item.
- Se um mesmo item falhar a contrapressão 2 vezes seguidas: marque-o
  BLOQUEADO com o diagnóstico e passe ao próximo (nunca insista em círculo).
