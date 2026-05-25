# Adversarial Review Plan

## Obrigatoriedade

Toda sprint e todo grupo terminam com revisão adversarial por segurança, arquitetura e qualidade. Cada grupo também exige mini-prova de paridade.

## Entrada

Contrato do slice, artefato ou diff, evidências, UI question records, gate decisions, protocol events, sentinel-state, confidence score e matriz de paridade aplicável. Revisores recebem contexto zero.

## Saída

Cada frente emite PASS, NEEDS_FIX ou BLOCK, com severidade, evidência, impacto, ação exigida e necessidade de re-review.

## Severidade e bloqueadores

CRITICAL: contrato físico ausente, hook smoke ausente, escrita fora de escopo, alteração do plugin original, stop inseguro permitido, tracing externo sem consentimento, sentinel BLOCK ignorado.

HIGH: UI question substituída por texto livre, gate obrigatório ausente, paridade gate por gate incompleta, mini-prova de paridade ausente, comando global curto sem decisão explícita, RED/GREEN obrigatório ausente.

MEDIUM: rastreabilidade incompleta, confidence score sem fator explicado, pergunta sem recomendação técnica quando deveria, relatório sem severidade.

LOW: clareza de texto, nomenclatura, organização.

## Segurança

Verifica escopo, segredo, tracing opt-in, hooks fail-closed, política de nomes globais e read-only nos modos audit.

## Arquitetura

Verifica bounded contexts, verticalidade dos slices, ordem base antes dos modos, contratos versionados e independência do plugin original.

## Qualidade

Verifica ATDD/TDD/BDD por modo, exemplos válidos/inválidos, mini-provas de paridade, evidência por sprint e testes em Windows PowerShell.

## Regra de re-review

CRITICAL e HIGH exigem correção e nova revisão da mesma frente. MEDIUM pode ser aceito só com pergunta UI de risco e GateDecision. LOW pode virar backlog.

## Fix loop

Máximo de 3 tentativas. A terceira exige pergunta pela UI do OpenCode. A quarta aciona STOP_RULE.
