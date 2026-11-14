# Montador de XML (NF-e)

Lê XMLs de NF-e baixados do ERP, cataloga numa tela, ignora notas repetidas
(pela chave de acesso de 44 dígitos) e lista os vencimentos das duplicatas das notas aceitas.

## Como usar
1. Baixe os XMLs no ERP e extraia o zip.
2. Abra `index.html` no navegador.
3. Arraste os XMLs para a área tracejada.
4. Aceite ou descarte cada nota. Notas aceitas aparecem em "Vencimentos".

Os dados ficam no navegador (localStorage). Descartar aqui **não** avisa a SEFAZ:
o Desconhecimento da Operação é registrado no ERP.

## Regras
- Nota repetida (mesma chave) é ignorada.
- Resumo (`resNFe`) é atualizado se depois chegar o XML completo (`nfeProc`).
- Nota sem `<dup>` não pode ser aceita (sem parcelas para lançar).

## Dados e privacidade
Não suba XMLs reais para o repositório. Use apenas exemplos anonimizados em `exemplos/`.

## Próximos passos
- [ ] Trocar localStorage por Firebase (Firestore + Auth)
- [ ] Aceitar `.zip` direto
- [ ] Exportar vencimentos para CSV
