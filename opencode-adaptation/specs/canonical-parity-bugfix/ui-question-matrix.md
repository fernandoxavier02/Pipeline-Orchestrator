# UI Question Matrix — perguntas executáveis pela UI do OpenCode

Toda linha abaixo deve ser implementada com a UI/tool de question do OpenCode. Não aceitar resposta em texto livre quando houver opções.

| Ponto | Texto da pergunta | Opções exatas | Recomendada | Gate | Evento | Decisão | Efeito |
|---|---|---|---|---|---|---|---|
| Retomada de contexto velho | Encontrei uma run anterior. O que fazer? | Continuar run anterior; Arquivar e começar nova; Bloquear | Arquivar e começar nova, se a run não tiver final-validator | gate-resume-context | ui_question_emitted | resume_context_decided | continua, cria nova ou para |
| Confirmação de classificação | Confirmar modo, complexidade e rota propostos? | Aprovar rota proposta (Recomendado); Ajustar classificação; Bloquear | Aprovar quando evidência for suficiente | gate-classification | ui_question_emitted | classification_confirmed | avança, reclassifica ou para |
| Information-gate | Falta informação para continuar. Escolha como resolver. | Usar opção recomendada; Fornecer ajuste; Bloquear por falta crítica | Usar opção recomendada quando risco baixo | gate-information | gate_request_emitted | information_gate_decided | preenche lacuna ou para |
| Aprovação de plano | Aprovar plano de execução? | Aprovar plano (Recomendado); Pedir ajuste; Reduzir escopo; Bloquear | Aprovar se plano tiver slices e testes | gate-plan | plan_ready_for_approval | plan_decided | libera quality gate ou replaneja |
| Aprovação ATDD/BDD | Aprovar cenários de aceite? | Aprovar cenários (Recomendado); Ajustar cenários; Bloquear | Aprovar se cobrem ACs | gate-quality-scenarios | scenarios_ready | scenarios_decided | libera RED ou replaneja |
| Bypass justificado | Este bypass é permitido. Autorizar? | Autorizar com justificativa; Replanejar; Bloquear | Replanejar quando risco médio/alto | gate-bypass | bypass_requested | bypass_decided | registra exceção ou para |
| Adversarial por batch | Resultado adversarial do batch: como seguir? | Aceitar risco baixo; Corrigir achados; Bloquear | Corrigir achados quando houver MEDIUM+ | gate-adversarial-batch | adversarial_completed | adversarial_decided | avança, corrige ou para |
| Achado bloqueante | Há achado bloqueante. O que fazer? | Corrigir agora (Recomendado); Replanejar; Parar | Corrigir agora | gate-blocking-finding | blocking_finding_detected | blocking_finding_decided | inicia fix loop ou para |
| Terceira tentativa | Esta é a terceira e última tentativa. Continuar? | Autorizar última tentativa; Replanejar; Parar | Replanejar quando causa não estiver clara | gate-third-attempt | third_attempt_requested | third_attempt_decided | última tentativa ou STOP_RULE |
| Final adversarial | Rodar revisão adversarial final? | Rodar revisão final (Recomendado); Dispensar com justificativa; Bloquear | Rodar revisão final | gate-final-adversarial | final_adversarial_question | final_adversarial_decided | revisa, dispensa ou para |
| Tracing | Permitir observabilidade externa? | Manter desligado (Recomendado); Habilitar só local; Habilitar externo | Manter desligado | gate-tracing-consent | tracing_consent_requested | tracing_consent_decided | configura observabilidade |
| Closeout | Como fechar esta run? | Pronto para próxima etapa; Bloqueado; Revisão manual | Revisão manual se confiança < 70 | gate-closeout | closeout_requested | closeout_decided | fecha como pronto, bloqueado ou manual |

## Regras executáveis

- Cada pergunta cria UI_QUESTION_RECORD.
- Cada emissão cria PROTOCOL_EVENT_RECORD.
- Cada resposta que muda fluxo cria GATE_DECISION_RECORD.
- Opção recomendada deve existir na lista de opções.
- Pergunta técnica deve marcar uma opção como recomendada e explicar o motivo no campo reason.
- Se a ferramenta de question não estiver disponível, bloquear com STOP_RULE, exceto em modo spec-only offline, onde pode registrar DECISÃO PENDENTE.
