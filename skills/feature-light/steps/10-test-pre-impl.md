---
step_number: 10
step_name: "test-pre-impl"
source: "Pulsar/LIGHT_10_TEST_PRE_IMPL.md"
---

---
description: "Feature Light: Criar testes essenciais ANTES de implementar"
allowed-tools: Read, Grep, Glob, Write, Bash
---

# LIGHT 10 — Testes Pre-Implementacao (Feature)

> **Posicao no Pipeline:** Passo 10 — Apos IMPLEMENTATION_PLAN (9), ANTES de EXECUTION (11)
> **Objetivo:** Definir contratos minimos via testes antes de implementar

---

## ⚠️ Integração TDD v3.0 (VERIFICAR PRIMEIRO)

**ANTES de criar qualquer teste, verificar se o Pre-Tester (agente 2.6) já criou:**

```bash
# Verificar se existem testes do Pre-Tester para esta feature
ls -la functions/src/__tests__/*feature*.test.ts 2>/dev/null
ls -la src/__tests__/*.test.ts 2>/dev/null
grep -r "Pre-Tester\|PRE_TESTER" functions/src/__tests__/ 2>/dev/null
```

### Se Pre-Tester JÁ criou testes:

1. **NÃO criar novos testes** - usar os existentes
2. **Executar os testes**: `npm test -- [arquivo_existente]`
3. **Verificar que FALHAM** (RED) - feature não implementada ainda
4. **Prosseguir** para implementação

### Se Pre-Tester NÃO criou testes:

Seguir o fluxo abaixo para criar testes.

---

## CONTEXTO

- Feature simples, implementacao focada
- Testes devem ser objetivos
- Foco em: feature principal + 1 regressao + 1 borda

---

## 1) COMPORTAMENTOS ESPERADOS

| Funcionalidade | Esperado |
|----------------|----------|
| [principal] | [comportamento] |

**Sistema existente a proteger:** [descreva 1 integracao]

---

## 2) CONTRATOS (minimo 4)

### Feature
```
DADO que [contexto],
QUANDO [acao do usuario],
ENTAO [resposta do sistema].
```

### Regressao
```
DADO que [sistema existente],
QUANDO [usado normalmente],
ENTAO [continua funcionando].
```

### Borda
```
DADO que [limite: vazio, erro],
QUANDO [acao],
ENTAO [comportamento gracioso].
```

---

## 3) CRIAR TESTES

```typescript
describe('[Feature]', () => {
  // DEVE FALHAR ate implementar
  it('should [feature principal]', () => {
    // test
  });

  // DEVE PASSAR sempre
  it('should maintain [regressao]', () => {
    // test
  });

  // Borda
  it('should handle [edge case]', () => {
    // test
  });
});
```

---

## 4) VALIDACAO RAPIDA

- [ ] Teste de feature falha agora?
- [ ] Teste de regressao passa agora?
- [ ] Cobertura minima ok?

---

## OUTPUT

```markdown
## Testes (Feature Light)

- Arquivo: `[path.test.ts]`
- Feature tests: X (FALHA - esperado)
- Regression tests: X (PASSA)

Proximo: LIGHT_11_10_EXECUTION_MINIMAL_DIFF
```

---

**Próximo step:** 11
