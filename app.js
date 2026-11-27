const KEY = 'montador-nfe-v2';
let notas = {}, lixo = {}, aba = null, asc = true;
try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); notas = d.notas || {}; lixo = d.lixo || {}; } catch (e) {}
const salvar = () => { try { localStorage.setItem(KEY, JSON.stringify({ notas, lixo })); } catch (e) {} };

const $ = id => document.getElementById(id);
const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dta = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
const tx = (e, tag) => { const n = e && e.getElementsByTagNameNS('*', tag)[0]; return n ? n.textContent.trim() : ''; };
function el(t, p = {}, ...k) { const e = document.createElement(t); Object.assign(e, p); e.append(...k); return e; }
const linhaVazia = (c, t) => el('tr', {}, el('td', { colSpan: c, className: 'empty' }, t));
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const nomeMes = m => MES[+m.slice(5, 7) - 1] + '/' + m.slice(0, 4);
const SIT = { paga: 'paga', atrasada: 'atrasada', hoje: 'vence hoje', '': 'em dia' };

let tt;
function aviso(t) { const b = $('toast'); b.textContent = t; b.hidden = false; clearTimeout(tt); tt = setTimeout(() => { b.hidden = true; }, 8000); }
$('toast').onclick = () => { $('toast').hidden = true; };

// Lê um XML de NF-e (completo ou resumo) e devolve os dados que importam.
function ler(texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML inválido');
  const inf = doc.getElementsByTagNameNS('*', 'infNFe')[0];
  if (inf) {
    const emit = doc.getElementsByTagNameNS('*', 'emit')[0];
    const parcelas = [...doc.getElementsByTagNameNS('*', 'dup')].map(d => ({
      n: tx(d, 'nDup'), venc: tx(d, 'dVenc'), valor: parseFloat(tx(d, 'vDup')) || 0
    }));
    return {
      chave: (inf.getAttribute('Id') || '').replace('NFe', ''), tipo: 'completa',
      emitente: tx(emit, 'xNome'), cnpj: tx(emit, 'CNPJ'), numero: tx(doc, 'nNF'),
      emissao: tx(doc, 'dhEmi').slice(0, 10), total: parseFloat(tx(doc, 'vNF')) || 0, parcelas
    };
  }
  const res = doc.getElementsByTagNameNS('*', 'resNFe')[0];
  if (res) return {
    chave: tx(res, 'chNFe'), tipo: 'resumo', emitente: tx(res, 'xNome'), cnpj: tx(res, 'CNPJ'),
    numero: '', emissao: tx(res, 'dhEmi').slice(0, 10), total: parseFloat(tx(res, 'vNF')) || 0, parcelas: []
  };
  throw new Error('não é uma NF-e');
}

// Nota nova com duplicatas entra direto como "aceita". Sem duplicata fica "pendente" para revisão em Notas.
async function importar(files) {
  files = [...files].filter(f => /\.xml$/i.test(f.name));
  if (!files.length) return aviso('Nenhum arquivo .xml encontrado.');
  let aceitas = 0, rev = 0, ign = 0, lx = 0; const erros = [];
  for (const f of files) {
    try {
      const n = ler(await f.text());
      if (n.chave.length !== 44) throw new Error('chave inválida');
      const ex = notas[n.chave];
      if (lixo[n.chave]) lx++;
      else if (ex && !(ex.tipo === 'resumo' && n.tipo === 'completa')) ign++;
      else { n.status = n.parcelas.length ? 'aceita' : 'pendente'; notas[n.chave] = n; n.parcelas.length ? aceitas++ : rev++; }
    } catch (e) { erros.push(f.name + ': ' + e.message); }
  }
  if (aceitas) aba = 'todos';
  fim();
  const partes = [[aceitas, 'aceita(s)'], [rev, 'para revisar em Notas'], [ign, 'repetida(s) ignorada(s)'], [lx, 'no lixo, ignorada(s)']]
    .filter(([n]) => n).map(([n, t]) => `${n} ${t}`);
  if (erros.length) partes.push('erros: ' + erros.join('; '));
  aviso(partes.join(', ') || 'Nada para importar.');
  if (location.hash === '#montador') location.hash = '';
}

const fim = () => { salvar(); desenhar(); };
const aceitar = c => { notas[c].status = 'aceita'; fim(); };
const remover = c => { notas[c].status = 'pendente'; fim(); };
const descartar = c => { lixo[c] = notas[c]; delete notas[c]; fim(); };
const restaurar = c => { notas[c] = lixo[c]; notas[c].status = 'pendente'; delete lixo[c]; fim(); };
const pagar = (c, i, v) => { (notas[c].pagas ??= {})[i] = v; fim(); };

function desenharNotas() {
  const lista = Object.values(notas).sort((a, b) => b.emissao.localeCompare(a.emissao));
  const tb = $('notas'); tb.replaceChildren();
  if (!lista.length) tb.append(linhaVazia(7, 'Nenhuma nota ainda. Importe XMLs pelo Montador de XML.'));
  for (const n of lista) {
    const acoes = el('td');
    if (n.status === 'aceita') acoes.append(el('button', { textContent: 'Remover do calendário', onclick: () => remover(n.chave) }));
    else {
      if (n.parcelas.length) acoes.append(el('button', { className: 'pri', textContent: 'Aceitar', onclick: () => aceitar(n.chave) }), ' ');
      acoes.append(el('button', { className: 'bad', textContent: 'Descartar', onclick: () => descartar(n.chave) }));
    }
    const parc = n.tipo === 'resumo' ? 'só resumo' : (n.parcelas.length ? n.parcelas.length + 'x' : 'sem duplicata');
    tb.append(el('tr', {},
      el('td', { textContent: n.emitente }), el('td', { textContent: n.numero || '—' }),
      el('td', { textContent: dta(n.emissao) }), el('td', { className: 'n', textContent: brl(n.total) }),
      el('td', { textContent: parc }), el('td', {}, el('span', { className: 'tag', textContent: n.status })), acoes));
  }
  const ul = $('lixo'); ul.replaceChildren();
  const itens = Object.values(lixo);
  if (!itens.length) ul.append(el('li', { textContent: 'Lixo vazio.' }));
  for (const n of itens) ul.append(el('li', {},
    el('span', {}, n.emitente, el('small', { textContent: `Nº ${n.numero || '—'}, ${brl(n.total)}` })),
    el('button', { textContent: 'Restaurar', onclick: () => restaurar(n.chave) })));
}

function desenharHome() {
  const hoje = hojeISO();
  const todas = [];
  for (const n of Object.values(notas)) if (n.status === 'aceita') n.parcelas.forEach((p, i) =>
    todas.push({ ...p, chave: n.chave, i, emitente: n.emitente, k: `${i + 1}/${n.parcelas.length}`, paga: !!(n.pagas && n.pagas[i]) }));
  const meses = [...new Set(todas.map(p => p.venc.slice(0, 7)))].sort();
  if (aba === null || (aba !== 'todos' && !meses.includes(aba))) aba = meses.includes(hoje.slice(0, 7)) ? hoje.slice(0, 7) : 'todos';

  const ab = $('abas'); ab.replaceChildren();
  if (meses.length) for (const [k, t] of [['todos', 'Todos'], ...meses.map(m => [m, nomeMes(m)])]) {
    const b = el('button', { textContent: t, onclick: () => { aba = k; desenhar(); } });
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', aba === k); ab.append(b);
  }
  $('ordem').hidden = !meses.length;
  $('ordem').textContent = asc ? 'Mais próximas primeiro' : 'Mais distantes primeiro';

  const vis = todas.filter(p => aba === 'todos' || p.venc.slice(0, 7) === aba)
    .sort((a, b) => (asc ? 1 : -1) * (a.venc.localeCompare(b.venc) || a.emitente.localeCompare(b.emitente)));
  const vb = $('venc'); vb.replaceChildren();
  if (!vis.length) vb.append(linhaVazia(5, 'Nenhum vencimento ainda. Solte os XMLs em qualquer lugar da tela ou abra o menu.'));
  for (const v of vis) {
    const sit = v.paga ? 'paga' : v.venc < hoje ? 'atrasada' : v.venc === hoje ? 'hoje' : '';
    const chk = el('input', { type: 'checkbox', className: 'chk', checked: v.paga, onchange: e => pagar(v.chave, v.i, e.target.checked) });
    chk.setAttribute('aria-label', `Marcar parcela ${v.k} de ${v.emitente} como paga`);
    vb.append(el('tr', { className: sit },
      el('td', {}, chk), el('td', { textContent: dta(v.venc) }), el('td', { textContent: v.emitente }),
      el('td', { className: 'n', textContent: brl(v.valor) }), el('td', {}, el('span', { className: 'tag', textContent: SIT[sit] }))));
  }
  const soma = l => l.reduce((s, v) => s + v.valor, 0);
  $('total').textContent = vis.length ? `Total: ${brl(soma(vis))}, em aberto: ${brl(soma(vis.filter(v => !v.paga)))}` : '';
}

const desenhar = () => { desenharHome(); desenharNotas(); };

// Telas (a página é uma só, então os dados são compartilhados com segurança)
function mostrar() {
  const v = location.hash.slice(1);
  const alvo = ['notas', 'montador', 'precificacao'].includes(v) ? v : 'home';
  document.querySelectorAll('main section').forEach(s => { s.hidden = s.id !== 'v-' + alvo; });
  desenhar(); window.scrollTo(0, 0);
}
window.onhashchange = mostrar;

// Menu
const menu = abrir => {
  $('menu').hidden = $('veu').hidden = !abrir;
  $('burger').setAttribute('aria-expanded', abrir);
  $('burger').setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
  if (abrir) $('menu').querySelector('a').focus();
};
$('burger').onclick = () => menu($('menu').hidden);
$('veu').onclick = $('menu').onclick = () => menu(false);
document.onkeydown = e => { if (e.key === 'Escape' && !$('menu').hidden) { menu(false); $('burger').focus(); } };
$('ordem').onclick = () => { asc = !asc; desenhar(); };
$('esvaziar').onclick = () => {
  if (Object.keys(lixo).length && confirm('Esvaziar o lixo? Se importar o mesmo XML de novo, a nota volta.')) { lixo = {}; fim(); }
};

// Importação: seletor na tela do Montador e "solte em qualquer lugar" em todas as telas
const arq = $('arq');
$('drop').onclick = () => arq.click();
$('drop').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); arq.click(); } };
arq.onchange = () => { importar(arq.files); arq.value = ''; };
let dc = 0;
const temArq = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
addEventListener('dragenter', e => { if (temArq(e)) { dc++; $('dropg').hidden = false; } });
addEventListener('dragleave', e => { if (temArq(e) && --dc <= 0) { dc = 0; $('dropg').hidden = true; } });
addEventListener('dragover', e => { if (temArq(e)) e.preventDefault(); });
addEventListener('drop', e => { if (!temArq(e)) return; e.preventDefault(); dc = 0; $('dropg').hidden = true; importar(e.dataTransfer.files); });

// Brilho do vidro seguindo o mouse
document.addEventListener('pointermove', e => {
  const g = e.target.closest && e.target.closest('.glass');
  if (g) { const r = g.getBoundingClientRect(); g.style.setProperty('--mx', e.clientX - r.left + 'px'); g.style.setProperty('--my', e.clientY - r.top + 'px'); }
});
window.onfocus = desenhar; // atualiza "atrasada" se o dia virou com a aba aberta
mostrar();
