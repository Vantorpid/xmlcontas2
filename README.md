# Montador de XML (NF-e)

Lê XMLs de NF-e baixados do ERP e mostra os vencimentos das duplicatas, em abas por mês.

## Arquivos
`index.html` (estrutura), `style.css` (visual), `app.js` (lógica).

## Como usar
1. Baixe os XMLs no ERP e extraia o zip.
2. Abra `index.html` no navegador e solte os XMLs em qualquer lugar da tela
   (ou use o menu das três barras, em "Montador de XML").
3. Notas com duplicata entram direto em **Vencimentos**. Marque a caixinha redonda quando pagar.
   Linha verde = paga, vermelha = vencida e não paga.
4. No menu, **Notas** permite remover do calendário, aceitar, descartar (vai para o lixo) e restaurar.

Os dados ficam no navegador (localStorage). Descartar aqui **não** avisa a SEFAZ:
o Desconhecimento da Operação é registrado no ERP.

## Regras
- Nota repetida (mesma chave de 44 dígitos) é ignorada; nota no lixo também.
- Resumo (`resNFe`) é atualizado se depois chegar o XML completo (`nfeProc`).
- Nota sem `<dup>` fica pendente, para revisar em Notas.

## Dados e privacidade
Não suba XMLs reais para o repositório. Use apenas exemplos anonimizados em `exemplos/`.

## Próximos passos
- [ ] Firebase (Firestore + Auth) no lugar do localStorage
- [ ] Aceitar `.zip` direto
- [ ] Exportar vencimentos para CSV
