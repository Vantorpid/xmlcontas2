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
    <div class="ctl glass">
      <label>Margem de lucro sobre venda <input id="pg" class="campo" inputmode="decimal" placeholder="0"></label>
      <label>Nota partida<input id="pn" class="campo" inputmode="numeric" placeholder="1"></label>
      <label>Frete da transportadora (R$)<input id="pf" class="campo" inputmode="decimal" placeholder="0,00"></label>
      <label>Markup geral (%) — vazio = automático<input id="pm" class="campo" inputmode="decimal" placeholder="0"></label>
      <label class="chkl"><input id="pv" type="checkbox"> Mostrar composição</label>
      <button id="pe" class="pri">Exportar para Excel</button><button id="pl">Nova precificação</button>
    </div>
    <p class="mut">Markup automático = margem ÷ (100 − margem) × 100. O frete integra o custo antes do markup. Apague o markup manual para voltar ao automático; cada item também pode ter seu próprio markup.</p>
    <div class="wrap glass" style="overflow-x:auto"><table id="tp"><thead></thead><tbody></tbody><tfoot></tfoot></table></div>`;
  document.querySelector('main').append(sec);

  function lerNota(doc) {
    const inf = doc.getElementsByTagNameNS('*', 'infNFe')[0];
    const itens = tags(doc, 'det').map(d => {
      const g = t => parseFloat(tx(d, t)) || 0;
      return { c: tx(d, 'cProd'), nome: tx(d, 'xProd'), ncm: tx(d, 'NCM'), un: tx(d, 'uCom'), qtd: g('qCom'),
        prod: g('vProd'), ipi: g('vIPI'), st: g('vICMSST') + g('vFCPST'), frete: g('vFrete'), seg: g('vSeg'),
        outro: g('vOutro'), desc: g('vDesc'), emb: g('vICMS') + g('vPIS') + g('vCOFINS') };
    });
    // Se frete, seguro, outras despesas ou desconto vierem só no total da nota, rateia pelos itens.
    const tot = k => parseFloat(tx(doc.getElementsByTagNameNS('*', 'ICMSTot')[0], 'v' + k)) || 0;
    const sp = itens.reduce((s, i) => s + i.prod, 0) || 1;
    for (const [campo, k] of [['frete', 'Frete'], ['seg', 'Seg'], ['outro', 'Outro'], ['desc', 'Desc']]) {
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

  function montar() {
    const H = [['Cód.'], ['Descrição'], ['NCM'], ['Qtd', 'n'], ['Produto', 'n comp'], ['IPI, ST, outros', 'n comp'], ['Frete', 'n comp'],
      ['ICMS+PIS+COFINS (já inclusos)', 'n comp'], ['Custo unit.', 'n'], ['Markup %', 'n'], ['Preço final unit.', 'n'], ['Custo total', 'n'], ['Lucro', 'n'], ['Margem real %', 'n']];
    $('tp').tHead.innerHTML = '<tr>' + H.map(([h, c = '']) => `<th class="${c}">${h}</th>`).join('') + '</tr>';
    const tb = $('tp').tBodies[0]; tb.replaceChildren(); rows = [];
    nota.itens.forEach(i => {
      const tr = document.createElement('tr'), td = [];
      for (let c = 0; c < 14; c++) {
        const x = document.createElement('td');
        if (c > 2) x.className = 'n' + (c >= 4 && c <= 7 ? ' comp' : '');
        td.push(x); tr.append(x);
      }
      td[0].textContent = i.c; td[1].textContent = i.nome; td[2].textContent = i.ncm;
      const inp = document.createElement('input');
      inp.className = 'campo pct'; inp.inputMode = 'decimal'; inp.setAttribute('aria-label', 'Markup percentual deste item (vazio = geral)');
      const r = { td, inp, pct: null };
      inp.oninput = () => { const v = inp.value.trim(); r.pct = v === '' ? null : Math.max(0, num(v)); inp.classList.toggle('sobre', r.pct !== null); pintar(); };
      td[9].append(inp); rows.push(r); tb.append(tr);
    });
  }

  // Recalcula tudo (usa os valores originais da nota, então nunca acumula erro)
  function pintar() {
    $('ps').textContent = [nota && `Nota ${nota.numero}: ${nota.emitente}`, cte && `CT-e ${cte.numero}: ${cte.transp}`].filter(Boolean).join('   |   ') || 'Aguardando XML';
    const tf = $('tp').querySelector('tfoot');
    const G = clamp(num($('pg').value), 0, 99.99);
    const auto = 100 * G / (100 - G);
    const M = $('pm').value.trim() === '' ? auto : Math.max(0, num($('pm').value));
    $('pm').placeholder = f2(auto);
    $('pm').classList.toggle('sobre', $('pm').value.trim() !== '');
    if (!nota) { tf.replaceChildren(); return; }
    const N = clamp(Math.round(num($('pn').value)) || 1, 1, 100), F = Math.max(0, num($('pf').value));
    const soma = nota.itens.reduce((s, i) => s + i.prod * N, 0) || 1;
    let tc = 0, tv = 0;
    nota.itens.forEach((i, k) => {
      const r = rows[k], t = r.td, q = i.qtd, prod = i.prod * N, ext = (i.ipi + i.st + i.seg + i.outro - i.desc) * N;
      const fr = i.frete * N + F * prod / soma, custo = prod + ext + fr, cu = q ? custo / q : 0;
      const p = r.pct ?? M, pu = Math.round(cu * (1 + p / 100) * 100) / 100, u = v => q ? f2(v / q) : '—';
      t[3].textContent = `${q.toLocaleString('pt-BR')} ${i.un}`;
      t[4].textContent = u(prod); t[5].textContent = u(ext); t[6].textContent = u(fr); t[7].textContent = u(i.emb * N);
      t[8].textContent = f2(cu); t[10].textContent = f2(pu); t[11].textContent = f2(custo); t[12].textContent = f2(pu * q - custo);
      const margem = pu > 0 ? 100 * (pu - cu) / pu : 0;
      t[13].textContent = f2(margem) + '%';
      r.inp.placeholder = f2(M); Object.assign(r, { q, cu, p, pu, custo, margem });
      tc += custo; tv += pu * q;
    });
    tf.innerHTML = `<tr><td colspan="8"><b>Totais</b></td><td></td><td></td><td class="n"><b>Venda ${f2(tv)}</b></td><td class="n"><b>${f2(tc)}</b></td><td class="n"><b>${f2(tv - tc)}</b></td><td class="n"><b>${f2(tv > 0 ? 100 * (tv - tc) / tv : 0)}%</b></td></tr>`;
  }

  // CSV para Excel (separador ;, vírgula decimal, acentos ok). Texto que começa com = + - @ é neutralizado.
  function exportar() {
    if (!nota) return;
    const s = v => `"${String(v).replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
    const t = v => /^\d+$/.test(v) ? `="${v}"` : s(v);
    const d = v => v.toFixed(2).replace('.', ',');
    const L = [['Código', 'Descrição', 'NCM', 'Qtd', 'Un', 'Custo unit.', 'Markup %', 'Preço final unit.', 'Custo total', 'Preço total', 'Lucro', 'Margem real %'].map(s).join(';')];
    nota.itens.forEach((i, k) => {
      const r = rows[k];
      L.push([t(i.c), s(i.nome), t(i.ncm), String(r.q).replace('.', ','), s(i.un), d(r.cu), d(r.p), d(r.pu), d(r.custo), d(r.pu * r.q), d(r.pu * r.q - r.custo), d(r.margem)].join(';'));
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