'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const n0 = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const n1 = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const pct = (v) => `${Math.round(v * 100)}%`;
  const cor = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  const calmo = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const largo = () => matchMedia('(min-width: 861px)').matches;
  const lat = (v) => `${n1(Math.abs(v))}°${v < 0 ? 'S' : 'N'}`;

  const TEXTOS = {
    frota: ['Frota offshore, de norte a sul', 'Role a página: o globo percorre as bacias produtoras do litoral, da mais ao norte à mais ao sul. Clique ou toque num círculo para abrir a ficha da instalação. Dados abertos da ANP.'],
    alarmes: ['Sala de alarmes', 'Replay de casos reais da base aberta 3W da Petrobras, com alerta explicado e retorno do operador'],
  };
  // Capítulos do passeio, agrupando bacias vizinhas; a ordem final sai da latitude (norte → sul).
  const GRUPOS = [
    ['Bacia Potiguar', ['Potiguar']],
    ['Sergipe e Alagoas', ['Sergipe', 'Alagoas']],
    ['Recôncavo e Camamu', ['Recôncavo', 'Camamu']],
    ['Espírito Santo', ['Espírito Santo']],
    ['Bacia de Campos', ['Campos']],
    ['Bacia de Santos', ['Santos']],
  ];
  const st = { frota: null, mapa: null, demo: new Map(), sel: null, aba: null, caps: [], cap: -1, pronto: false };

  function anima(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    const fim = (e) => { if (e.target !== el) return; el.classList.remove(cls); el.removeEventListener('animationend', fim); };
    el.addEventListener('animationend', fim);
  }

  // Traço sob o item atual do menu: desliza até a aba escolhida; sem animação na primeira pintura.
  function moverTraco(primeira) {
    const nav = $('#abas'), ativo = nav.querySelector('[aria-current="true"]'), tr = nav.querySelector('.menu-traco');
    if (!ativo || !tr) return;
    if (primeira) nav.classList.add('sem-transicao');
    tr.style.width = `${ativo.offsetWidth}px`;
    tr.style.transform = `translateX(${ativo.offsetLeft}px)`;
    if (primeira) requestAnimationFrame(() => requestAnimationFrame(() => nav.classList.remove('sem-transicao')));
  }

  function aba(nome) {
    nome = TEXTOS[nome] ? nome : 'frota';
    const antes = st.aba;
    if (antes === nome) return;
    st.aba = nome;
    $('#tela-frota').hidden = nome !== 'frota';
    document.body.classList.toggle('modo-frota', nome === 'frota');
    $('#tela-alarmes').hidden = nome !== 'alarmes';
    document.querySelectorAll('#abas a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.aba === nome)));
    $('#titulo-tela').textContent = TEXTOS[nome][0];
    $('#lead-tela').textContent = TEXTOS[nome][1];
    moverTraco(antes == null);
    // Troca de tela: título e conteúdo assentam de baixo para cima; as réguas das seções se desenham da esquerda.
    if (antes != null) { anima($(`#tela-${nome}`), 'assenta'); anima($('.cabecalho-pagina'), 'assenta'); }
    if (nome === 'frota' && st.mapa) setTimeout(() => st.mapa.resize(), 0);
  }

  // Dica ao passar o mouse em qualquer infográfico ([data-dica]); nos pontos, destaca o grupo inteiro.
  function dicas() {
    const d = document.createElement('div'); d.className = 'dica-flutuante'; d.setAttribute('role', 'tooltip'); document.body.appendChild(d);
    st.dica = d;
    let alvo = null;
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-dica]');
      if (el === alvo) return;
      if (alvo) alvo.closest('.pontos')?.classList.remove('foco-parado', 'foco-ok');
      alvo = el;
      if (!el) { if (!e.target.closest('.maplibregl-canvas')) esconderDica(); return; }
      mostrarDica(`<b>${el.dataset.dica}</b>${el.dataset.dicaSub ? `<span>${el.dataset.dicaSub}</span>` : ''}`);
      const g = el.closest('.pontos'); if (g) g.classList.add(el.classList.contains('parado') ? 'foco-parado' : 'foco-ok');
    });
    document.addEventListener('mousemove', (e) => { if (alvo) posicionarDica(e.clientX, e.clientY); });
  }

  // Balão: centralizado acima do cursor, com a ponta para baixo; perto do topo, vira para baixo do cursor.
  function mostrarDica(html) { const d = st.dica; if (d.innerHTML !== html) d.innerHTML = html; d.classList.add('on'); }
  function esconderDica() { st.dica && st.dica.classList.remove('on'); }
  function posicionarDica(cx, cy) {
    const d = st.dica, w = d.offsetWidth, h = d.offsetHeight, folga = 14;
    const embaixo = cy - h - folga < 70;
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, cx - w / 2));
    const y = embaixo ? cy + folga + 6 : cy - h - folga;
    d.classList.toggle('embaixo', embaixo);
    d.style.setProperty('--seta-x', `${Math.max(14, Math.min(w - 14, cx - x))}px`);
    d.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  async function iniciar() {
    dicas();
    window.addEventListener('hashchange', () => aba(location.hash.slice(1)));
    // Altura real do masthead, para o globo ocupar exatamente o resto do viewport.
    const barra = () => document.documentElement.style.setProperty('--altura-barra', `${$('.barra').offsetHeight}px`);
    barra();
    window.addEventListener('resize', () => { moverTraco(true); barra(); });
    aba(location.hash.slice(1) || 'frota');
    document.fonts && document.fonts.ready.then(() => moverTraco(true));
    const [frota, idx] = await Promise.all([fetch('data/frota.json').then((r) => r.json()), fetch('data/index.json').then((r) => r.json())]);
    st.frota = frota;
    st.ref = frota.referencia;
    associarDemo(frota.instalacoes, idx.instancias);
    capitulos(frota);
    globo(frota);
  }

  // O 3W é anonimizado: não diz em qual unidade cada poço está. Para a demonstração, cada poço do 3W
  // é ligado a uma das maiores unidades da Petrobras, sempre com o aviso de que a ligação é ilustrativa.
  function associarDemo(insts, casos) {
    const pocos = [...new Set(casos.map((c) => c.poco))].sort();
    const alvo = insts.filter((i) => i.operador.startsWith('Petrobras') && i.pocos >= 3).slice(0, pocos.length);
    pocos.forEach((p, k) => {
      if (!alvo[k]) return;
      const lista = casos.filter((c) => c.poco === p);
      st.demo.set(alvo[k].instalacao, { poco: p, casos: lista, alertas: lista.reduce((s, c) => s + c.alertas, 0) });
    });
  }

  // ---------- Infográficos pequenos, em HTML puro ----------
  // Barra empilhada: partes [{v, cls, rot}].
  function empilhada(partes, legenda = true) {
    const tot = partes.reduce((s, p) => s + p.v, 0) || 1;
    return `<div class="empilhada"><div class="empilhada-barra">${partes.map((p) => `<i class="${p.cls}" style="width:${(p.v / tot) * 100}%"${p.rot ? ` data-dica="${p.rot}" data-dica-sub="${pct(p.v / tot)} do total"` : ''}></i>`).join('')}</div>
      ${legenda ? `<div class="empilhada-leg">${partes.map((p) => `<span class="${p.cls}"><b>${pct(p.v / tot)}</b> ${p.rot}</span>`).join('')}</div>` : ''}</div>`;
  }
  // Um ponto por poço; os que produziram menos de 70% da própria média ficam em vermelho.
  function pontos(total, parados) {
    const max = 60, n = Math.min(total, max);
    const vermelhos = Math.round((parados / Math.max(1, total)) * n);
    const dP = `${n0(parados)} ${parados === 1 ? 'poço abaixo' : 'poços abaixo'} do normal" data-dica-sub="${pct(parados / Math.max(1, total))} dos poços · menos de 70% da própria média do ano`;
    const dO = `${n0(total - parados)} ${total - parados === 1 ? 'poço' : 'poços'} no normal" data-dica-sub="${pct((total - parados) / Math.max(1, total))} dos poços · 70% da própria média ou mais`;
    return `<div class="pontos" role="img" aria-label="${parados} de ${total} poços abaixo do normal">${Array.from({ length: n }, (_, k) => `<i class="${k < vermelhos ? 'parado' : 'ok'}" data-dica="${k < vermelhos ? dP : dO}"></i>`).join('')}${total > max ? `<span>cada ponto ≈ ${n1(total / max)} poços</span>` : ''}</div>`;
  }
  // Medidor da produção contra o normal: escala de 0 a 150%, com a marca no normal (100%).
  function medidor(v) {
    const w = Math.min(1.5, Math.max(0, v || 0)) / 1.5 * 100;
    return `<div class="medidor" data-dica="${pct(v)} do normal" data-dica-sub="Produção do mês ÷ média diária de ${st.ref || 'meses anteriores'}; a marca é o normal (100%)"><i class="${v < 0.5 ? 'critico' : ''}" style="width:${w}%"></i><span style="left:66.67%"></span></div>`;
  }

  function kpis(f) {
    const it = f.instalacoes;
    const oleo = it.reduce((s, i) => s + i.oleo_bbl_d, 0);
    const agua = it.reduce((s, i) => s + i.agua_bbl_d, 0);
    const pocos = it.reduce((s, i) => s + i.pocos, 0);
    const parados = it.reduce((s, i) => s + i.pocos_com_parada, 0);
    const santos = it.filter((i) => i.bacia === 'Santos').reduce((s, i) => s + i.oleo_bbl_d, 0);
    const [ano, mes] = f.periodo.split('-');
    return `<div class="kpis">${[
      ['Instalações no mar', it.length, '', `Produção por poço da ANP, ${mes}/${ano}`, ''],
      ['Petróleo por dia', oleo / 1000, 'mil bbl', 'Soma das instalações marítimas', empilhada([{ v: santos, cls: 'forte', rot: 'Santos' }, { v: oleo - santos, cls: 'fraco', rot: 'demais bacias' }])],
      ['Água produzida', agua / 1000, 'mil bbl/d', 'Sai junto com o petróleo', empilhada([{ v: oleo, cls: 'forte', rot: 'petróleo' }, { v: agua, cls: 'agua', rot: 'água' }])],
      ['Poços abaixo do normal', parados, `de ${n0(pocos)}`, 'Menos de 70% da própria média do ano', pontos(pocos, parados)],
    ].map(([r, v, u, d, g]) => `<div class="kpi"><p class="rotulo-menor">${r}</p><p class="kpi-valor"><span data-alvo="${v}">${n0(v)}</span>${u ? `<small>${u}</small>` : ''}</p><p class="descricao">${d}</p>${g}</div>`).join('')}</div>`;
  }

  // Os números contam uma vez quando aparecem (padrão do Portfolio). Com movimento reduzido, já nascem no valor final.
  function contar(els) {
    if (calmo()) return;
    const t0 = performance.now(), dur = 900, ease = (x) => 1 - Math.pow(1 - x, 3);
    const passo = (t) => {
      const k = ease(Math.min(1, (t - t0) / dur));
      els.forEach((el) => { el.textContent = n0(+el.dataset.alvo * k); });
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  // ---------- Capítulos do scrollytelling ----------
  function capitulos(f) {
    const it = f.instalacoes;
    const grupos = GRUPOS.map(([titulo, bacias]) => ({ titulo, lista: it.filter((i) => bacias.includes(i.bacia)).sort((a, b) => b.lat - a.lat) }))
      .filter((g) => g.lista.length).sort((a, b) => b.lista[0].lat - a.lista[0].lat);
    const tudo = [...it].sort((a, b) => b.lat - a.lat);
    st.caps = [{ titulo: 'Toda a costa', lista: tudo, tipo: 'abertura' }, { titulo: 'O mês na frota', lista: tudo, tipo: 'numeros' }, ...grupos.map((g) => ({ ...g, tipo: 'bacia' })), { titulo: 'Toda a costa', lista: tudo, tipo: 'fim' }];
    const total = st.caps.length;
    const oleoTot = it.reduce((s, i) => s + i.oleo_bbl_d, 0);
    $('#passos').innerHTML = st.caps.map((c, k) => {
      const oleo = c.lista.reduce((s, i) => s + i.oleo_bbl_d, 0);
      const pocos = c.lista.reduce((s, i) => s + i.pocos, 0);
      const parados = c.lista.reduce((s, i) => s + i.pocos_com_parada, 0);
      const cab = `<p class="rotulo">${k + 1} de ${total}${c.tipo === 'bacia' ? ` · ${lat(c.lista[0].lat)} a ${lat(c.lista[c.lista.length - 1].lat)}` : ''}</p>`;
      if (c.tipo === 'abertura') {
        const porGrupo = grupos.map((g) => ({ t: g.titulo, v: g.lista.reduce((s, i) => s + i.oleo_bbl_d, 0) }));
        const max = Math.max(...porGrupo.map((g) => g.v));
        return `<section class="passo" data-k="${k}">${cab}<h3>Frota offshore, de norte a sul</h3>
          <div class="para-que-serve"><p class="rotulo-menor">Para que serve</p><p>Ver num só lugar onde a produção no mar está abaixo do normal e chegar à unidade e ao poço que pedem atenção. Dali, um clique leva à sala de alarmes.</p></div>
          <p class="descricao">${it.length} instalações no mar, de ${lat(tudo[0].lat)} a ${lat(tudo[tudo.length - 1].lat)}. Cada círculo é uma instalação; ao aproximar, vira uma coluna 3D com altura igual ao petróleo por dia. Clique ou toque para abrir a ficha.</p>
          <p class="rotulo-menor">Petróleo por dia, por trecho do litoral</p>
          <ol class="barras-lat">${porGrupo.map((g) => `<li data-dica="${g.t}" data-dica-sub="${n0(g.v)} bbl/d de petróleo"><span>${g.t}</span><span class="b"><i style="width:${Math.max(1, (g.v / max) * 100)}%"></i></span><b>${g.v < 10000 ? n1(g.v / 1000) : n0(g.v / 1000)}<small> mil bbl</small></b></li>`).join('')}</ol>
          <p class="dica">Role em qualquer lugar da tela, ou use ↓, para descer o litoral</p></section>`;
      }
      if (c.tipo === 'numeros') {
        const [ano, mes] = f.periodo.split('-');
        return `<section class="passo" data-k="${k}">${cab}<h3>O mês na frota</h3>
          <p class="descricao">${mes}/${ano}: último mês publicado pela ANP. O normal de cada poço e de cada unidade é a própria média diária de ${f.referencia}.</p>
          ${kpis(f)}</section>`;
      }
      if (c.tipo === 'fim') {
        return `<section class="passo" data-k="${k}">${cab}<h3>A frota inteira, num só olhar</h3>
          <p class="descricao">Gire, incline e aproxime o globo à vontade. Clique ou toque numa instalação para abrir a ficha. Em amarelo, as que têm replay na sala de alarmes.</p>
          <div class="legenda"><span><i class="leg-ponto"></i> instalação</span><span><i class="leg-ponto demo"></i> com replay de demonstração</span><span><i class="leg-coluna"></i> altura da coluna = petróleo por dia</span></div>
          <p class="rotulo-menor">Mais abaixo do normal · unidades acima de 2 mil bbl/d</p>
          <ol class="barras-inst ranking-fim">${ranking(f).map((i) => `<li><button type="button" data-nome="${i.instalacao}"><span>${i.instalacao}</span><span class="b"><i class="${i.disponibilidade < 0.5 ? 'critico' : ''}" style="width:${Math.round(Math.min(1, i.disponibilidade) * 100)}%"></i></span><b>${pct(i.disponibilidade)}</b></button></li>`.replace('<button type="button"', `<button type="button" data-dica="${i.instalacao}" data-dica-sub="${pct(i.disponibilidade)} do normal · ${i.pocos_com_parada} de ${i.pocos} poços abaixo do normal"`)).join('')}</ol>
          <p class="descricao">Barra = produção do mês em relação à média do ano (cheia = 100%).</p></section>`;
      }
      const mostra = c.lista.length > 8 ? [...c.lista].sort((a, b) => b.oleo_bbl_d - a.oleo_bbl_d).slice(0, 8).sort((a, b) => b.lat - a.lat) : c.lista;
      const max = Math.max(...mostra.map((i) => i.oleo_bbl_d));
      const pior = [...c.lista].sort((a, b) => a.disponibilidade - b.disponibilidade)[0];
      return `<section class="passo" data-k="${k}">${cab}<h3>${c.titulo}</h3>
        <div class="passo-numeros">
          <div><p class="passo-valor">${n0(oleo / 1000)}<small>mil bbl/d</small></p><p class="descricao">${pct(oleo / oleoTot)} do petróleo no mar</p></div>
          <div><p class="passo-valor">${c.lista.length}<small>${c.lista.length === 1 ? 'instalação' : 'instalações'}</small></p><p class="descricao">${n0(pocos)} poços produtores</p></div>
        </div>
        ${empilhada([{ v: oleo, cls: 'forte', rot: `${c.titulo}` }, { v: oleoTot - oleo, cls: 'fraco', rot: 'resto do mar' }], false)}
        <p class="rotulo-menor">Petróleo por instalação, mil bbl/d${c.lista.length > mostra.length ? ` · as ${mostra.length} maiores de ${c.lista.length}` : ''} · <span class="leg-critico">vermelho</span> = abaixo de 50% do normal</p>
        <ol class="barras-inst">${mostra.map((i) => `<li><button type="button" data-nome="${i.instalacao}"><span>${i.instalacao}</span><span class="b"><i class="${i.disponibilidade < 0.5 ? 'critico' : ''}" style="width:${Math.max(2, (i.oleo_bbl_d / max) * 100)}%"></i></span><b>${n1(i.oleo_bbl_d / 1000)}</b></button></li>`.replace('<button type="button"', `<button type="button" data-dica="${i.instalacao}" data-dica-sub="${n0(i.oleo_bbl_d)} bbl/d · ${pct(i.disponibilidade)} do normal · ${i.pocos_com_parada} de ${i.pocos} poços abaixo do normal"`)).join('')}</ol>
        <p class="rotulo-menor">Poços abaixo do normal · ${parados} de ${pocos}</p>${pontos(pocos, parados)}
        <p class="descricao">Mais abaixo do normal: <b>${pior.instalacao}</b>, ${pct(pior.disponibilidade)} da média do ano.</p></section>`;
    }).join('');
    document.querySelectorAll('.barras-inst button').forEach((b) => b.addEventListener('click', () => selecionar(b.dataset.nome, { voar: true })));
    // No desktop os passos rolam dentro do painel sobre o globo; no celular, a página rola.
    const obs = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) ativar(+e.target.dataset.k); }), { root: largo() ? $('#passos') : null, rootMargin: '-45% 0px -45% 0px' });
    document.querySelectorAll('.passo').forEach((p) => obs.observe(p));
    navegacao();
    ativar(0);
  }

  // Como navegar: a roda do mouse em qualquer lugar da tela (globo ou painel) passa os capítulos;
  // zoom do globo com Ctrl + roda, pinça no trackpad ou os botões. Setas ↑ ↓ no painel e no teclado.
  function irPara(k) {
    k = Math.max(0, Math.min(st.caps.length - 1, k));
    const sec = document.querySelector(`.passo[data-k="${k}"]`);
    if (!sec) return;
    const comportamento = calmo() ? 'auto' : 'smooth';
    if (largo()) { const p = $('#passos'); p.scrollTo({ top: sec.offsetTop - p.offsetTop, behavior: comportamento }); }
    else sec.scrollIntoView({ behavior: comportamento, block: 'center' });
  }
  function navegacao() {
    $('#cap-ant').addEventListener('click', () => irPara(st.cap - 1));
    $('#cap-prox').addEventListener('click', () => irPara(st.cap + 1));
    document.addEventListener('keydown', (e) => {
      if (st.aba !== 'frota' || e.target.closest('input, select, textarea')) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); irPara(st.cap + 1); }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); irPara(st.cap - 1); }
    });
    let acum = 0, trava = 0;
    $('.palco').addEventListener('wheel', (e) => {
      if (!largo() || e.ctrlKey || e.target.closest('.ficha')) return;
      e.preventDefault(); e.stopPropagation();
      if (performance.now() < trava) return;
      acum += e.deltaY;
      if (Math.abs(acum) > 40) { irPara(st.cap + Math.sign(acum)); acum = 0; trava = performance.now() + 650; }
    }, { capture: true, passive: false });
  }

  function ativar(k) {
    if (k === st.cap) return;
    st.cap = k;
    const c = st.caps[k], total = st.caps.length;
    document.querySelectorAll('.passo').forEach((p) => p.classList.toggle('ativo', +p.dataset.k === k));
    $('#contador-n').textContent = `${k + 1} / ${total}`;
    $('#contador-i').style.transform = `scaleX(${(k + 1) / total})`;
    $('#cap-ant').disabled = k === 0;
    $('#cap-prox').disabled = k === total - 1;
    const sec = document.querySelector(`.passo[data-k="${k}"]`);
    if (sec && !sec.dataset.contou) { sec.dataset.contou = '1'; contar(sec.querySelectorAll('[data-alvo]')); }
    if (!st.pronto) return;
    if (st.sel) fecharFicha();
    const nomes = new Set(c.lista.map((i) => i.instalacao));
    st.frota.instalacoes.forEach((i) => estado(i.instalacao, { fora: c.tipo === 'bacia' && !nomes.has(i.instalacao) }));
    enquadrar(c);
  }

  // Folga da câmera: no desktop o painel ocupa a esquerda e a ficha a direita.
  function folga() {
    if (!largo()) return { top: 40, bottom: 40, left: 30, right: 30 };
    return { top: 60, bottom: 60, left: 460, right: st.sel ? 400 : 80 };
  }
  function enquadrar(c) {
    if (c.tipo === 'abertura' || c.tipo === 'numeros') return mover({ center: [-42, -16], zoom: largo() ? 2.9 : 2.2, pitch: 0, bearing: 0 });
    const b = new maplibregl.LngLatBounds();
    c.lista.forEach((i) => b.extend([i.lon, i.lat]));
    const fim = c.tipo === 'fim';
    const cam = st.mapa.cameraForBounds(b, { padding: folga(), maxZoom: fim ? 4.6 : 8 });
    // cameraForBounds já desconta a folga no zoom; o centro vai sem deslocamento, porque mover() aplica a folga de novo.
    mover({ center: b.getCenter(), zoom: cam.zoom - (fim ? 0 : 0.3), pitch: fim ? 0 : 55, bearing: fim ? 0 : -15 });
  }
  function mover(cam) {
    cam = { ...cam, padding: folga() };
    if (cam.zoom == null) delete cam.zoom;
    if (calmo()) st.mapa.jumpTo(cam);
    else st.mapa.flyTo({ ...cam, duration: 2200, essential: true, curve: 1.3 });
  }

  // ---------- Globo (MapLibre GL, projeção globo, WebGL) ----------
  function raio(i) { return 3 + Math.sqrt(i.oleo_bbl_d / 1000) * 1.2; }
  // Coluna 3D por instalação: prisma de 8 lados no mar, altura proporcional ao petróleo por dia.
  const RAIO_COL = 0.028; // graus (~3 km)
  const ALTURA_POR_BBL = 0.42; // metros de coluna por bbl/d (exagero vertical para ler de longe)
  function prisma(lon, lat) {
    const k = 1 / Math.cos((lat * Math.PI) / 180), anel = [];
    for (let j = 0; j <= 8; j += 1) { const a = (j % 8) * (Math.PI / 4) + Math.PI / 8; anel.push([lon + Math.cos(a) * RAIO_COL * k, lat + Math.sin(a) * RAIO_COL]); }
    return { type: 'Polygon', coordinates: [anel] };
  }
  // O mesmo estado (selecionada, fora do capítulo) vale para o ponto e para a coluna.
  function estado(nome, obj) { ['inst', 'col'].forEach((source) => st.mapa.setFeatureState({ source, id: nome }, obj)); }

  // Cor do mar na base Esri: enquanto um ladrilho carrega durante o voo, aparece o mar, não uma faixa preta.
  const MAR = '#222327';

  function globo(f) {
    const geo = { type: 'FeatureCollection', features: f.instalacoes.map((i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [i.lon, i.lat] }, properties: { instalacao: i.instalacao, r: raio(i), demo: st.demo.has(i.instalacao) } })) };
    const cols = { type: 'FeatureCollection', features: f.instalacoes.map((i) => ({ type: 'Feature', geometry: prisma(i.lon, i.lat), properties: { instalacao: i.instalacao, h: Math.max(6000, i.oleo_bbl_d * ALTURA_POR_BBL), demo: st.demo.has(i.instalacao) } })) };
    const papel = cor('--color-light'), acento = cor('--pb-amarelo'), verde = cor('--pb-verde-claro'), verdeEsc = cor('--pb-verde');
    const m = new maplibregl.Map({
      container: 'mapa',
      style: {
        version: 8,
        projection: { type: 'globe' },
        sources: {
          base: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16, attribution: 'Base: Esri, HERE, Garmin, © OpenStreetMap' },
          // Nomes de países, estados e cidades e as divisas, por cima da base.
          rotulos: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16 },
        },
        layers: [{ id: 'fundo', type: 'background', paint: { 'background-color': MAR } }, { id: 'base', type: 'raster', source: 'base' }, { id: 'rotulos', type: 'raster', source: 'rotulos', paint: { 'raster-opacity': 0.95 } }],
      },
      center: [-42, -16], zoom: largo() ? 2.9 : 2.2, attributionControl: { compact: true }, scrollZoom: true,
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    st.mapa = m;
    m.on('load', () => {
      m.addSource('inst', { type: 'geojson', data: geo, promoteId: 'instalacao' });
      const sel = ['boolean', ['feature-state', 'sel'], false], fora = ['boolean', ['feature-state', 'fora'], false];
      m.addLayer({ id: 'halo', type: 'circle', source: 'inst', paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, ['*', ['get', 'r'], 1], 8, ['*', ['get', 'r'], 2.4]],
        'circle-color': acento, 'circle-opacity': ['case', sel, 0.28, 0], 'circle-pitch-alignment': 'map' } });
      // De longe, círculos; ao aproximar (zoom 5 a 6,5) os círculos encolhem e as colunas 3D sobem.
      const zoomCol = (longe, perto) => ['interpolate', ['linear'], ['zoom'], 4.8, longe, 6.2, perto];
      m.addLayer({ id: 'inst', type: 'circle', source: 'inst', paint: {
        'circle-radius': zoomCol(['*', ['get', 'r'], 0.75], 3),
        'circle-color': ['case', sel, acento, ['get', 'demo'], acento, verde],
        'circle-opacity': ['case', sel, 1, fora, 0.12, ['get', 'demo'], 0.95, 0.6],
        'circle-stroke-color': papel, 'circle-stroke-width': 0.8,
        'circle-stroke-opacity': ['case', fora, 0.2, 1], 'circle-pitch-alignment': 'map' } });
      m.addSource('col', { type: 'geojson', data: cols, promoteId: 'instalacao' });
      m.addLayer({ id: 'col', type: 'fill-extrusion', source: 'col', minzoom: 4.5, paint: {
        'fill-extrusion-height': ['get', 'h'],
        'fill-extrusion-base': 0,
        'fill-extrusion-color': ['case', sel, acento, fora, '#2a2a30', ['get', 'demo'], acento, verdeEsc],
        'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 4.8, 0, 6.2, 0.92],
        'fill-extrusion-vertical-gradient': true } });
      // Clicar ou tocar em qualquer parte da coluna (da base ao topo) ou do círculo abre a ficha.
      // O picking nativo só pega a base da coluna; aqui a coluna inteira vira alvo, com folga para o dedo.
      const W = st.frota.instalacoes;
      function escolher(pt) {
        const z = m.getZoom(), inc = Math.sin((m.getPitch() * Math.PI) / 180), cv = m.getCanvas();
        const colunas = z >= 5.2;
        let melhor = null, dmin = Infinity;
        W.forEach((i) => {
          const b = m.project([i.lon, i.lat]);
          if (b.x < -50 || b.y < -50 || b.x > cv.clientWidth + 50 || b.y > cv.clientHeight + 50) return;
          const mpp = (40075016.686 * Math.cos((i.lat * Math.PI) / 180)) / (512 * 2 ** z);
          const alt = colunas ? (Math.max(6000, i.oleo_bbl_d * ALTURA_POR_BBL) / mpp) * inc : 0;
          const r = Math.max(12, colunas ? (RAIO_COL * 111320) / mpp + 6 : raio(i) * 0.75 + 6);
          const dx = Math.abs(pt.x - b.x);
          if (dx > r || pt.y < b.y - alt - r || pt.y > b.y + r) return;
          const d = dx + Math.abs(pt.y - Math.min(b.y, Math.max(b.y - alt, pt.y)));
          if (d < dmin) { dmin = d; melhor = i; }
        });
        return melhor;
      }
      m.on('click', (e) => { const i = escolher(e.point); if (i) selecionar(i.instalacao); else fecharFicha(); });
      // Ao passar o mouse: nome, produção e situação contra o normal, sem precisar clicar.
      m.on('mousemove', (e) => {
        const i = escolher(e.point), d = st.dica;
        // A mãozinha vai no canvas e no contêiner (o CSS do MapLibre força "grab" no contêiner).
        m.getCanvas().style.cursor = i ? 'pointer' : '';
        m.getCanvasContainer().style.cursor = i ? 'pointer' : '';
        if (!d) return;
        if (!i) { esconderDica(); return; }
        const disp = Math.round(i.disponibilidade * 100), barra = Math.min(100, disp);
        mostrarDica(`<b>${i.instalacao}</b><span>${i.tipo || 'Instalação'} · ${i.bacia}</span>
          <dl><div><dt>Petróleo</dt><dd>${n0(i.oleo_bbl_d)} <small>bbl/d</small></dd></div>
          <div><dt>Água (BSW)</dt><dd>${i.bsw == null ? '—' : pct(i.bsw)}</dd></div>
          <div><dt>Do normal</dt><dd>${disp}%</dd></div>
          <div><dt>Poços abaixo</dt><dd>${i.pocos_com_parada} <small>de ${i.pocos}</small></dd></div></dl>
          <i class="dica-medidor"><i class="${i.disponibilidade < 0.5 ? 'critico' : ''}" style="width:${barra}%"></i></i>
          <em>Clique para abrir a ficha</em>`);
        posicionarDica(e.originalEvent.clientX, e.originalEvent.clientY);
      });
      m.getCanvas().addEventListener('mouseleave', esconderDica);
      st.pronto = true;
      const k = st.cap; st.cap = -1; ativar(Math.max(0, k));
    });
  }

  // ---------- Ficha flutuante sobre o globo ----------
  function fecharFicha() {
    if (st.sel) estado(st.sel, { sel: false });
    st.sel = null;
    $('#ficha').hidden = true;
    document.querySelectorAll('[data-nome]').forEach((b) => b.setAttribute('aria-current', 'false'));
  }

  function selecionar(nome, { voar = false } = {}) {
    const i = st.frota.instalacoes.find((x) => x.instalacao === nome);
    if (!i || !st.pronto) return;
    if (st.sel && st.sel !== nome) estado(st.sel, { sel: false });
    st.sel = nome;
    estado(nome, { sel: true, fora: false });
    const demo = st.demo.get(nome);
    const campos = i.campos.length > 3 ? `${i.campos.slice(0, 3).join(', ')} e mais ${i.campos.length - 3}` : i.campos.join(', ');
    const ficha = $('#ficha');
    ficha.innerHTML = `
      <button class="fechar" type="button" aria-label="Fechar ficha">×</button>
      <div><p class="rotulo">${i.tipo || 'Instalação'} · ${i.bacia}</p><h2>${i.instalacao}</h2>
        <p class="descricao">${i.operador} · ${campos}${i.lamina_m ? ` · lâmina d'água ${n0(i.lamina_m)} m` : ''}${i.inicio ? ` · desde ${i.inicio}` : ''}</p></div>
      <dl class="numeros">
        <div><dt>Petróleo</dt><dd>${n0(i.oleo_bbl_d)} <small>bbl/d</small></dd></div>
        <div><dt>Gás</dt><dd>${n0(i.gas_mil_m3_d)} <small>mil m³/d</small></dd></div>
      </dl>
      <div><p class="rotulo-menor">O que sai dos poços · BSW ${i.bsw == null ? '—' : pct(i.bsw)}</p>${empilhada([{ v: i.oleo_bbl_d, cls: 'forte', rot: 'petróleo' }, { v: i.agua_bbl_d, cls: 'agua', rot: 'água' }])}</div>
      <div><p class="rotulo-menor">Produção contra o normal · ${pct(i.disponibilidade)}</p>${medidor(i.disponibilidade)}</div>
      ${i.capacidade_bbl_d ? `<div><p class="rotulo-menor">Uso da capacidade · ${pct(i.oleo_bbl_d / i.capacidade_bbl_d)} de ${n0(i.capacidade_bbl_d)} bbl/d</p>${empilhada([{ v: Math.min(i.oleo_bbl_d, i.capacidade_bbl_d), cls: 'forte', rot: 'produzindo' }, { v: Math.max(0, i.capacidade_bbl_d - i.oleo_bbl_d), cls: 'fraco', rot: 'capacidade livre' }], false)}</div>` : ''}
      <div><p class="rotulo-menor">${i.pocos} ${i.pocos === 1 ? 'poço' : 'poços'} · ${i.pocos_com_parada} abaixo do normal</p>${pontos(i.pocos, i.pocos_com_parada)}</div>
      ${i.pior_poco ? `<p class="descricao">Poço mais abaixo do normal: <b>${i.pior_poco.poco}</b>, ${pct(i.pior_poco.razao)} da própria média</p>` : ''}
      ${demo ? `<div class="demo">
        <p class="rotulo">Replay de demonstração</p>
        <p>${demo.casos.length} ${demo.casos.length === 1 ? 'caso' : 'casos'} do poço ${demo.poco.replace('WELL-', '')} do 3W, com ${demo.alertas} ${demo.alertas === 1 ? 'alerta' : 'alertas'}</p>
        <button class="botao primario" type="button" id="abrir-demo">Abrir na sala de alarmes</button>
        <p class="descricao">Ligação ilustrativa: o 3W é anonimizado e não informa a unidade real de cada poço</p></div>` : ''}`;
    ficha.hidden = false;
    ficha.scrollTop = 0;
    [...ficha.children].forEach((c, k) => c.style.setProperty('--i', k));
    anima(ficha, 'cascata');
    ficha.querySelector('.fechar').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fecharFicha(); });
    if (demo) $('#abrir-demo').addEventListener('click', () => {
      const caso = demo.casos.find((c) => c.alertas) || demo.casos[0];
      location.hash = 'alarmes';
      window.abrir(caso.id);
    });
    document.querySelectorAll('[data-nome]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.nome === nome)));
    // Com a ficha aberta, a câmera desliza para a instalação ficar visível entre o painel e a ficha.
    if (voar) mover({ center: [i.lon, i.lat], zoom: 7.4, pitch: 58, bearing: -15 });
    else st.mapa.easeTo({ center: [i.lon, i.lat], padding: folga(), duration: calmo() ? 0 : 600 });
  }

  function ranking(f) {
    return f.instalacoes.filter((i) => i.oleo_bbl_d > 2000).sort((a, b) => a.disponibilidade - b.disponibilidade).slice(0, 8);
  }

  iniciar();
})();
