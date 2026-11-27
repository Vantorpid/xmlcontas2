// Tabela de precificação: tudo fica só na memória da página (nada é salvo).
(() => {
  const $ = id => document.getElementById(id);
  const num = v => { const raw = String(v).trim(); const n = parseFloat(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw); return isFinite(n) ? n : 0; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const f2 = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tx = (e, t) => { const n = e && e.getElementsByTagNameNS('*', t)[0]; return n ? n.textContent.trim() : ''; };
  const tags = (e, t) => [...e.getElementsByTagNameNS('*', t)];
  let nota = null, cte = null, rows = [];

  const sec = document.createElement('section');
  sec.id = 'v-precificacao'; sec.hidden = true;
  sec.innerHTML = `
    <h1>Tabela de precificação</h1>
    <p class="mut">Solte o XML da nota de compra e, se tiver, o da transportadora (CT-e). Nada fica salvo: ao recarregar a página, tudo some.</p>
    <div id="pz" class="glass zona" tabindex="0" role="button">Solte os XMLs aqui ou clique para escolher<br><small id="ps"></small></div>
    <input id="pa" type="file" accept=".xml" multiple hidden>
    <div id="pw" class="mut" role="status"></div>
    <div id="p-alerta-fiscal" class="p-alerta-fiscal" role="status" hidden></div>
    <div class="ctl glass">
      <label>Lucro desejado sobre venda (%)<input id="pg" class="campo" inputmode="decimal" placeholder="0"></label>
      <label>Multiplicador da nota (ex.: 2,5)<input id="pn" class="campo" inputmode="decimal" placeholder="1"></label>
      <label>Frete da transportadora (R$)<input id="pf" class="campo" inputmode="decimal" placeholder="0,00"></label>
      <label>Markup geral (%)<input id="pm" class="campo" inputmode="decimal" placeholder="0"></label>
      <label class="chkl"><input id="pv" type="checkbox"> Mostrar composição</label>
      <button id="pe" class="pri">Exportar para Excel</button><button id="pl">Nova precificação</button>
    </div>
    <p class="mut">Markup automático = margem ÷ (100 − margem) × 100. O frete integra o custo antes do markup. Lucro desejado é a sua meta; markup manual altera o preço sem mudar essa meta. A margem real mostra o resultado. Apague o markup individual para voltar ao automático (ou ao geral, quando não houver meta individual).</p>
    <div id="p-resumo" class="p-resumo" hidden></div>
    <div class="wrap glass p-tabela"><table id="tp"><thead></thead><tbody></tbody><tfoot></tfoot></table><p id="p-vazio" class="p-vazio">Importe uma nota XML para começar a precificação.</p></div>`;
  document.querySelector('main').append(sec);

  // Ausência de destaque não prova ausência de tributo no custo. Apenas sinaliza revisão.
  function revisarTributos(d) {
    const imposto = tags(d, 'imposto')[0];
    const grupos = ['ICMS', 'PIS', 'COFINS'];
    if (!imposto) return 'Grupo de impostos ausente no XML';
    const ausentes = grupos.filter(t => !tags(imposto, t).length);
    const destacados = ['vICMS', 'vPIS', 'vCOFINS'].some(t => tags(imposto,t).some(e => Number(e.textContent) > 0));
    const motivos = [];
    if (ausentes.length) motivos.push('Sem grupo: ' + ausentes.join(', '));
    if (!destacados) motivos.push('ICMS próprio, PIS e COFINS sem valor positivo destacado');
    return motivos.join('; ');
  }
  function lerNota(doc) {
    const inf = doc.getElementsByTagNameNS('*', 'infNFe')[0];
    const itens = tags(doc, 'det').map(d => {
      const g = t => parseFloat(tx(d, t)) || 0;
      return { c: tx(d, 'cProd'), nome: tx(d, 'xProd'), ncm: tx(d, 'NCM'), un: tx(d, 'uCom'), qtd: g('qCom'),
        alertaFiscal: revisarTributos(d), prod: g('vProd'), ipi: g('vIPI'), st: g('vICMSST') + g('vFCPST'), frete: g('vFrete'), seg: g('vSeg'),
        outro: g('vOutro'), desc: g('vDesc'), emb: g('vICMS') + g('vPIS') + g('vCOFINS') };
    });
    // Se frete, seguro, outras despesas ou desconto vierem só no total da nota, rateia pelos itens.
    const tot = k => parseFloat(tx(doc.getElementsByTagNameNS('*', 'ICMSTot')[0], 'v' + k)) || 0;
    const sp = itens.reduce((s, i) => s + i.prod, 0) || 1;
    for (const [campo, k] of [['frete', 'Frete'], ['seg', 'Seg'], ['outro', 'Outro'], ['desc', 'Desc']]) {
      if (!tx(doc.getElementsByTagNameNS('*', 'ICMSTot')[0], 'v' + k)) continue;
      const resto = tot(k) - itens.reduce((s, i) => s + i[campo], 0);
      if (Math.abs(resto) > 0.005) itens.forEach(i => { i[campo] += resto * i.prod / sp; });
    }
    return { chave: (inf.getAttribute('Id') || '').replace('NFe', ''), numero: tx(doc, 'nNF'),
      emitente: tx(doc.getElementsByTagNameNS('*', 'emit')[0], 'xNome'), total: parseFloat(tx(doc, 'vNF')) || 0, itens };
  }

  function lerCte(doc) {
    return { numero: tx(doc, 'nCT'), transp: tx(doc.getElementsByTagNameNS('*', 'emit')[0], 'xNome'),
      valor: parseFloat(tx(doc, 'vTPrest')) || 0, chaves: tags(doc, 'infNFe').map(e => tx(e, 'chave')) };
  }

  async function receber(files) {
    const av = [];
    for (const f of [...files].filter(f => /\.xml$/i.test(f.name))) {
      try {
        const doc = new DOMParser().parseFromString(await f.text(), 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error('XML inválido');
        if (doc.getElementsByTagNameNS('*', 'infCte')[0]) { cte = lerCte(doc); $('pf').value = f2(cte.valor); }
        else if (doc.getElementsByTagNameNS('*', 'infNFe')[0]) {
          nota = lerNota(doc); montar();
          const s = nota.itens.reduce((a, i) => a + i.prod + i.ipi + i.st + i.frete + i.seg + i.outro - i.desc, 0);
          if (Math.abs(s - nota.total) > 0.05) av.push(`Aviso: os itens somam ${brl(s)} e o total da nota é ${brl(nota.total)}. Confira.`);
        } else throw new Error('não é NF-e nem CT-e');
      } catch (e) { av.push(`${f.name}: ${e.message}`); }
    }
    if (cte && nota && cte.chaves.length && !cte.chaves.includes(nota.chave)) av.push('Atenção: este CT-e não cita a nota carregada.');
    $('pw').textContent = av.join(' | '); pintar();
  }

  const markupDe = g => 100 * g / (100 - g);
  function montar() {
    const H = [['Código / NCM','p-cod'], ['Descrição','p-desc'], ['Qtd.','p-qtd'], ['Custo unit.','p-custo'],
      ['Lucro desejado %','p-margem'], ['Markup %','p-markup'], ['Preço final unit.','p-preco'], ['Custo total','p-total'], ['Lucro total','p-lucro'], ['Margem real %','p-real']];
    $('tp').tHead.innerHTML = '<tr>' + H.map(([h,c]) => `<th scope="col" class="${c}">${h}</th>`).join('') + '</tr>';
    const tb = $('tp').tBodies[0]; tb.replaceChildren(); rows = [];
    nota.itens.forEach(i => {
      const tr = document.createElement('tr'), td = H.map(([h,c]) => {
        const x = document.createElement('td'); x.className = c; x.dataset.label = h; tr.append(x); return x;
      });
      td[0].textContent = i.c; const ncm = document.createElement('small'); ncm.textContent = i.ncm; td[0].append(ncm);
      td[1].textContent = i.nome;
      if (i.alertaFiscal) {
        const flag = document.createElement('small'); flag.className = 'p-flag-fiscal';
        flag.textContent = '⚑ Conferir tributos'; flag.title = i.alertaFiscal;
        td[1].append(flag);
      }
      const campos = ['Lucro desejado', 'Markup'].map((nome, j) => {
        const inp = document.createElement('input'); inp.className = 'campo pct'; inp.inputMode = 'decimal';
        inp.setAttribute('aria-label', `${nome} percentual de ${i.nome}`); td[4+j].append(inp); return inp;
      });
      const detalhe = document.createElement('tr'); detalhe.className = 'comp p-detalhe';
      const dc = document.createElement('td'); dc.colSpan = H.length; detalhe.append(dc);
      const grade = document.createElement('div'); grade.className = 'p-composicao'; dc.append(grade);
      const valores = ['Produto', 'IPI', 'ICMS-ST + FCP-ST', 'Frete', 'Seguro', 'Outras despesas', 'Desconto', 'ICMS + PIS + COFINS (inclusos)'].map(nome => {
        const box = document.createElement('div'), label = document.createElement('small'), val = document.createElement('strong');
        label.textContent = nome; box.append(label,val); grade.append(box); return val;
      });
      const r = {td, campos, valores, meta: null, markup: null};
      campos.forEach((inp,j) => inp.oninput = () => {
        const v = inp.value.trim();
        if (j === 0) r.meta = v === '' ? null : clamp(num(v),0,99.99);
        else r.markup = v === '' ? null : Math.max(0,num(v));
        pintar();
      });
      rows.push(r); tb.append(tr, detalhe);
    });
  }

  function pintar() {
    $('ps').textContent = [nota && `Nota ${nota.numero}: ${nota.emitente}`, cte && `CT-e ${cte.numero}: ${cte.transp}`].filter(Boolean).join('   |   ') || 'Aguardando XML';
    const G = clamp(num($('pg').value),0,99.99), auto = markupDe(G);
    const M = $('pm').value.trim() === '' ? auto : Math.max(0,num($('pm').value));
    $('pm').placeholder = f2(auto); $('pm').classList.toggle('sobre',$('pm').value.trim() !== '');
    $('p-vazio').hidden = !!nota; $('p-resumo').hidden = !nota;
    const alerta = $('p-alerta-fiscal');
    const pendentes = nota ? nota.itens.filter(i => i.alertaFiscal) : [];
    alerta.hidden = !pendentes.length;
    alerta.replaceChildren();
    if (pendentes.length) {
      const titulo = document.createElement('strong');
      titulo.textContent = `⚑ Atenção fiscal — ${pendentes.length} de ${nota.itens.length} itens para conferir`;
      const texto = document.createElement('p');
      texto.textContent = 'Há grupos tributários ausentes ou ICMS próprio, PIS e COFINS sem destaque positivo. Isso pode ser normal (isenção, Simples Nacional, substituição tributária etc.). O XML foi carregado normalmente. Confira o custo com o fornecedor ou contador; nenhum imposto foi acrescentado por estimativa.';
      const detalhes = document.createElement('details'), resumo = document.createElement('summary');
      resumo.textContent = 'Ver itens e motivos'; detalhes.append(resumo);
      const lista = document.createElement('ul');
      pendentes.forEach(i => { const li = document.createElement('li'); li.textContent = `${i.c} — ${i.nome}: ${i.alertaFiscal}`; lista.append(li); });
      detalhes.append(lista); alerta.append(titulo, texto, detalhes);
    }
    if (!nota) return;
    const N = clamp(num($('pn').value) || 1,1,100), F = Math.max(0,num($('pf').value));
    const soma = nota.itens.reduce((s,i)=>s+i.prod*N,0) || 1;
    let tc=0,tv=0;
    nota.itens.forEach((i,k)=>{
      const r=rows[k], t=r.td, q=i.qtd, prod=i.prod*N;
      const ext=(i.ipi+i.st+i.seg+i.outro-i.desc)*N, fr=i.frete*N+F*prod/soma;
      const custo=prod+ext+fr, cu=q?custo/q:0;
      const desejada=r.meta ?? G;
      const p=r.markup ?? (r.meta !== null ? markupDe(desejada) : M);
      const pu=Math.round(cu*(1+p/100)*100)/100;
      const margem=pu>0?100*(pu-cu)/pu:0;
      t[2].textContent=`${q.toLocaleString('pt-BR')} ${i.un}`; t[3].textContent=brl(cu);
      t[6].textContent=brl(pu); t[7].textContent=brl(custo); t[8].textContent=brl(pu*q-custo); t[9].textContent=f2(margem)+'%';
      r.campos.forEach((inp,j)=>{
        const v=j===0?desejada:p; const manual=j===0?r.meta:r.markup;
        inp.placeholder=f2(v); inp.classList.toggle('sobre',manual !== null);
        if(manual === null) inp.value='';
      });
      [prod,i.ipi*N,i.st*N,fr,i.seg*N,i.outro*N,-i.desc*N,i.emb*N].forEach((v,j)=>r.valores[j].textContent=q?brl(v/q):'—');
      Object.assign(r,{q,cu,p,pu,custo,margem,desejada}); tc+=custo; tv+=pu*q;
    });
    $('p-resumo').innerHTML = [['Custo total',brl(tc)],['Venda total',brl(tv)],['Lucro bruto',brl(tv-tc)],['Margem real',f2(tv>0?100*(tv-tc)/tv:0)+'%']].map(([l,v])=>`<div class="glass"><small>${l}</small><strong>${v}</strong></div>`).join('');
  }

  // CSV para Excel (separador ;, vírgula decimal, acentos ok). Texto que começa com = + - @ é neutralizado.
  function exportar() {
    if (!nota) return;
    const s = v => `"${String(v).replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
    const t = v => /^\d+$/.test(v) ? `="${v}"` : s(v);
    const d = v => v.toFixed(2).replace('.', ',');
    const L = [['Código', 'Descrição', 'NCM', 'Qtd', 'Un', 'Custo unit.', 'Lucro desejado %', 'Markup %', 'Preço final unit.', 'Custo total', 'Preço total', 'Lucro', 'Margem real %', 'Conferência fiscal'].map(s).join(';')];
    nota.itens.forEach((i, k) => {
      const r = rows[k];
      L.push([t(i.c), s(i.nome), t(i.ncm), String(r.q).replace('.', ','), s(i.un), d(r.cu), d(r.desejada), d(r.p), d(r.pu), d(r.custo), d(r.pu * r.q), d(r.pu * r.q - r.custo), d(r.margem), s(i.alertaFiscal)].join(';'));
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `precificacao-nota-${nota.numero}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  ['pg', 'pn', 'pf', 'pm'].forEach(id => { $(id).oninput = pintar; });
  $('pv').onchange = e => $('tp').classList.toggle('ver', e.target.checked);
  $('pe').onclick = exportar;
  $('pl').onclick = () => {
    nota = cte = null; rows = [];
    ['pg', 'pn', 'pf', 'pm'].forEach(id => { $(id).value = ''; });
    $('tp').tHead.replaceChildren(); $('tp').tBodies[0].replaceChildren(); $('pw').textContent = ''; pintar();
  };
  $('pz').onclick = () => $('pa').click();
  $('pz').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pa').click(); } };
  $('pa').onchange = () => { receber($('pa').files); $('pa').value = ''; };

  // Nesta tela o "soltar" é só daqui: impede o importador do calendário de receber estes XMLs.
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(tp => addEventListener(tp, e => {
    if (location.hash !== '#precificacao' || !e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.stopPropagation(); e.preventDefault();
    $('pz').classList.toggle('on', tp === 'dragenter' || tp === 'dragover');
    if (tp === 'drop') receber(e.dataTransfer.files);
  }, true));
  pintar();
})();
