'use strict';
const $ = (s) => document.querySelector(s);
const fmt = (n, d = 1) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const hora = (iso) => iso.slice(11, 16);
// Tempo do caso (desde o início do replay), em vez do relógio da data original.
const tempo = (seg) => { const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = Math.floor(seg % 60); return `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; };

// Ícones em traço sólido, na cor da tinta.
const ICONE = {
  alerta: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.312 10.762C8.23 5.587 9.689 3 12 3s3.77 2.587 6.688 7.762l.364.644c2.425 4.3 3.638 6.45 2.542 8.022S17.786 21 12.364 21h-.728c-5.422 0-8.134 0-9.23-1.572s.117-3.722 2.542-8.022zM12 7.25a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0V8a.75.75 0 0 1 .75-.75M12 17a1 1 0 1 0 0-2a1 1 0 0 0 0 2" clip-rule="evenodd"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2s10 4.477 10 10m-5.97-3.03a.75.75 0 0 1 0 1.06l-5 5a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 1 1 1.06-1.06l1.47 1.47l2.235-2.235L14.97 8.97a.75.75 0 0 1 1.06 0" clip-rule="evenodd"/></svg>',
};

// Reinicia uma classe de movimento (app.css) para rodar uma vez.
function anima(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  const fim = (e) => { if (e.target !== el) return; el.classList.remove(cls); el.removeEventListener('animationend', fim); };
  el.addEventListener('animationend', fim);
}

const st = { idx: null, dado: null, ordem: -1, pos: 0, tocando: false, timer: null, mostrado: null, feedback: [], vel: 120 };
// Geometria do gráfico. No desktop: 760 de largura com os nomes numa coluna à esquerda.
// No celular: largura real da tela (texto em tamanho real), nome em cima de cada linha e valor à direita.
let W = 760, ROW = 46, PAD_L = 170, PAD_R = 70, TOPO = 8, ESTREITO = false;
function geometria() {
  const larg = Math.round($('#graficos').clientWidth || 760);
  ESTREITO = larg < 600;
  if (ESTREITO) { W = larg; ROW = 58; PAD_L = 0; PAD_R = 0; TOPO = 22; } else { W = 760; ROW = 46; PAD_L = 170; PAD_R = 70; TOPO = 8; }
}
const rotY = (y0) => (ESTREITO ? y0 + 15 : y0 + ROW / 2 + 4);
const valX = () => (ESTREITO ? W : W - PAD_R + 8);
const valAnc = () => (ESTREITO ? ' text-anchor="end"' : '');

function lerLocal() { try { return JSON.parse(localStorage.getItem('console3w-feedback') || '[]'); } catch { return []; } }
function gravarLocal(lista) { try { localStorage.setItem('console3w-feedback', JSON.stringify(lista)); } catch {} }

async function json(url, opt) { const r = await fetch(url, opt); if (!r.ok) throw new Error(r.status); return r.json(); }

async function iniciar() {
  st.idx = await json('data/index.json');
  // Com o servidor local, o retorno vai para feedback.jsonl; publicado como site estático (GitHub Pages),
  // fica guardado no próprio navegador.
  try { st.feedback = await json('api/feedback'); st.local = false; } catch { st.local = true; st.feedback = lerLocal(); }
  const ol = $('#instancias');
  // Mais recentes primeiro: os casos de 2020 a 2023 abrem a lista.
  st.idx.instancias.sort((a, b) => b.inicio.localeCompare(a.inicio));
  st.idx.instancias.forEach((it) => {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" data-id="${it.id}">
      <span class="nome">Poço ${it.poco.replace('WELL-', '')}</span>
      <span class="selo ${it.alertas ? '' : 'zero'}">${it.alertas} ${it.alertas === 1 ? 'alerta' : 'alertas'}</span>
      <span class="quando">${it.duracao_min} min de sinais · registro de ${it.inicio.slice(0, 4)}</span>
      <span class="gab">Rótulo da base: ${it.evento_rotulado}</span></button>`;
    li.querySelector('button').addEventListener('click', () => abrir(it.id));
    ol.appendChild(li);
  });
  $('#mostrar-gabarito').addEventListener('change', (e) => document.body.classList.toggle('com-gabarito', e.target.checked));
  $('#play').addEventListener('click', alternar);
  $('#cursor').addEventListener('input', (e) => { st.pos = +e.target.value; desenhar(); });
  document.querySelectorAll('.velocidade button').forEach((b) => b.addEventListener('click', () => {
    st.vel = +b.dataset.vel;
    document.querySelectorAll('.velocidade button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    tracoVelocidade(false);
  }));
  // Traço sob a velocidade escolhida: desliza como o do menu; na primeira pintura, sem animação.
  tracoVelocidade(true);
  window.addEventListener('resize', () => {
    tracoVelocidade(true);
    // Redesenha o gráfico na largura nova (girar o celular, redimensionar a janela).
    clearTimeout(st.redim);
    st.redim = setTimeout(() => { if (st.dado && !$('#tela-alarmes').hidden) { montar(); desenhar(true); } }, 150);
  });
  window.addEventListener('hashchange', () => setTimeout(() => tracoVelocidade(true), 0));
  placar(false);
  if (!st.dado) { const primeiro = st.idx.instancias.find((i) => i.alertas && i.inicio >= '2023') || st.idx.instancias.find((i) => i.alertas) || st.idx.instancias[0]; abrir(primeiro.id); }
}

async function abrir(id) {
  parar();
  const ordem = st.idx.instancias.findIndex((i) => i.id === id);
  const antes = st.ordem;
  document.querySelectorAll('#instancias button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
  st.dado = await json(`data/${id}.json`);
  st.ordem = ordem;
  // Começa 10 min antes do primeiro alerta: ao apertar Reproduzir, o alerta chega logo.
  const prim = st.dado.alertas[0];
  st.pos = prim ? Math.max(0, prim.i - 1 - 60) : Math.min(st.dado.score.length - 1, 200);
  st.mostrado = null;
  fecharAlerta();
  $('#p-rotulo').textContent = `Replay · caso real do 3W · registro de ${st.dado.inicio.slice(0, 4)}`;
  $('#p-titulo').textContent = `Poço ${st.dado.poco.replace('WELL-', '')}`;
  const c = $('#cursor'); c.max = st.dado.score.length - 1; c.disabled = false; $('#play').disabled = false;
  montar();
  desenhar(true);
  // Troca de poço é troca de estado: os sinais novos assentam no lugar (360 ms).
  if (antes >= 0 && antes !== ordem) anima($('#graficos'), 'troca');
}

function escala(arr) {
  const v = arr.filter((x) => x != null); let lo = Math.min(...v), hi = Math.max(...v);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  return { lo, hi };
}

function caminho(arr, a, b, sc, y0) {
  const n = arr.length; let d = '';
  for (let i = a; i < b; i += 1) {
    const x = arr[i]; if (x == null) continue;
    const px = PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
    const py = y0 + ROW - 6 - ((x - sc.lo) / (sc.hi - sc.lo)) * (ROW - 6 - TOPO);
    d += (d ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
  }
  return d;
}

function montar() {
  geometria();
  const d = st.dado, vars = d.variaveis, n = d.score.length;
  const H = (vars.length + 1) * ROW + 10;
  const xOf = (i) => PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
  let rot = '', ini = null;
  d.rotulo.forEach((r, i) => {
    const ev = r != null && r !== 0;
    if (ev && ini == null) ini = i;
    if ((!ev || i === n - 1) && ini != null) { rot += `<rect class="rot" x="${xOf(ini)}" y="0" width="${Math.max(1, xOf(i) - xOf(ini))}" height="${H - 10}"/>`; ini = null; }
  });
  let linhas = '';
  vars.forEach((v, k) => {
    const y0 = k * ROW;
    linhas += `<line class="regua" x1="0" x2="${W}" y1="${y0 + ROW}" y2="${y0 + ROW}"/>
      <text class="nome-var" x="0" y="${rotY(y0)}">${v.nome}</text>
      <path class="linha futuro" data-v="${v.var}" data-f="1"/><path class="linha" data-v="${v.var}"/>
      <text class="valor" data-val="${v.var}" x="${valX()}" y="${rotY(y0)}"${valAnc()}></text>`;
  });
  const ys = vars.length * ROW;
  const max = Math.max(d.limiar * 2, ...d.score.filter((x) => x != null));
  const yS = (s) => ys + ROW - 6 - (Math.min(s, max) / max) * (ROW - 6 - TOPO);
  const marcas = d.alertas.map((a, j) => `<circle class="marca" data-a="${j}" cx="${xOf(a.i - 1)}" cy="${yS(a.score)}" r="5"/>`).join('');
  $('#graficos').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sinais do poço e índice de anomalia">
    ${rot}${linhas}
    <text class="nome-var nome-score" x="0" y="${rotY(ys)}">Índice de anomalia</text>
    <line class="limiar" x1="${PAD_L}" x2="${W - PAD_R}" y1="${yS(d.limiar)}" y2="${yS(d.limiar)}"/>
    <path class="score" id="p-score"/>${marcas}
    <text class="valor" id="v-score" x="${valX()}" y="${rotY(ys)}"${valAnc()}></text>
    <line class="cursor" id="cur" y1="0" y2="${H - 10}"/></svg>`;
  st.geo = { xOf, yS, ys, H };
}

function desenhar(silencioso = false) {
  const d = st.dado; if (!d) return;
  const n = d.score.length, p = st.pos, { xOf, yS } = st.geo;
  d.variaveis.forEach((v, k) => {
    const arr = d.series[v.var], sc = escala(arr);
    document.querySelector(`path[data-v="${v.var}"][data-f]`).setAttribute('d', caminho(arr, p, n, sc, k * ROW));
    document.querySelector(`path[data-v="${v.var}"]:not([data-f])`).setAttribute('d', caminho(arr, 0, p + 1, sc, k * ROW));
    const val = arr[p];
    document.querySelector(`[data-val="${v.var}"]`).textContent = val == null ? '—' : `${fmt(val, v.unidade === 'bar' ? 1 : 2)} ${v.unidade}`;
  });
  let ds = `M${xOf(0)} ${yS(0)}`, ult = 0;
  for (let i = 0; i <= p; i += 1) if (d.score[i] != null) { ult = d.score[i]; ds += `L${xOf(i).toFixed(1)} ${yS(ult).toFixed(1)}`; }
  ds += `L${xOf(p)} ${yS(0)}Z`;
  $('#p-score').setAttribute('d', ds);
  $('#v-score').textContent = fmt(ult);
  const cur = $('#cur'); cur.setAttribute('x1', xOf(p)); cur.setAttribute('x2', xOf(p));
  document.querySelectorAll('.marca').forEach((m) => { m.style.display = d.alertas[+m.dataset.a].i - 1 <= p ? '' : 'none'; });
  $('#cursor').value = p;
  $('#relogio').textContent = tempo(p * d.passo_s);
  $('#restante').textContent = `${Math.round(p / 6)} / ${Math.round((n - 1) / 6)} min`;
  const vistos = d.alertas.map((a, j) => [a, j]).filter(([a]) => a.i - 1 <= p);
  const atual = vistos.length ? vistos[vistos.length - 1][1] : null;
  if (atual !== st.mostrado) {
    const novo = atual != null && (st.mostrado == null || atual > st.mostrado);
    st.mostrado = atual;
    if (atual == null) fecharAlerta();
    else {
      mostrarAlerta(d.alertas[atual]);
      // Alerta que acabou de disparar no replay: o ponto no gráfico pulsa uma vez e o replay pausa.
      if (novo && !silencioso) anima(document.querySelector(`.marca[data-a="${atual}"]`), 'pulso');
      if (st.tocando) parar();
    }
  }
}

function frase(m) {
  const partes = [];
  if (Math.abs(m.desvio) >= 1.5) partes.push(`${m.desvio > 0 ? 'subiu' : 'caiu'} ${fmt(Math.abs(m.desvio))} desvios em relação ao normal deste poço`);
  if (m.oscilacao >= 0.4) partes.push(`oscila ${fmt(Math.exp(m.oscilacao))}× mais que o normal`);
  if (Math.abs(m.tendencia) >= 2) partes.push(`em tendência de ${m.tendencia > 0 ? 'alta' : 'queda'}`);
  return partes.length ? partes.join(', ') : 'variação pequena';
}

// Antes do alerta, o espaço da decisão já aparece e explica o que fazer.
function fecharAlerta() {
  const el = $('#alerta'), d = st.dado;
  el.classList.add('aguardando');
  el.innerHTML = d && d.alertas.length
    ? `<div class="topo-alerta"><span class="rotulo">Decisão do operador</span><h3>Ainda sem alerta neste trecho</h3>
        <p class="descricao">Aperte <b>Reproduzir</b>: o replay para quando o detector alertar. Aí aparecem por que alertou, o que pode ser e os botões <b>Confirmo</b> e <b>Alarme falso</b>.</p></div>
       <div class="decisao"><button class="botao primario" id="b-ate" type="button">Reproduzir até o alerta</button></div>`
    : `<div class="topo-alerta"><span class="rotulo">Decisão do operador</span><h3>Este caso não gerou alerta</h3>
        <p class="descricao">O detector viu o poço dentro do próprio normal o tempo todo. Escolha na lista um caso com alertas.</p></div>`;
  $('#alerta-wrap').dataset.open = 'true';
  const b = $('#b-ate'); if (b) b.addEventListener('click', () => { if (!st.tocando) tocar(); });
}

function mostrarAlerta(a) {
  const d = st.dado, el = $('#alerta');
  el.classList.remove('aguardando');
  const fb = st.feedback.find((f) => f.instancia === d.id && f.alerta_t === a.t);
  const opcoes = Object.entries(st.idx.eventos).filter(([k]) => k !== '0')
    .map(([, v]) => `<option value="${v}" ${a.sugestao[0].evento === v ? 'selected' : ''}>${v}</option>`).join('');
  el.innerHTML = `
    <div class="topo-alerta">
      <span class="selo selo-alerta">${ICONE.alerta} Alerta em ${tempo((a.i - 1) * st.dado.passo_s)} · índice ${fmt(a.score)}</span>
      <h3>O poço saiu do próprio normal. Pode ser ${a.sugestao[0].evento.toLowerCase()}</h3>
    </div>
    <div class="bloco"><h4 class="rotulo">Por que alertou</h4><ul>${a.motivos.map((m) => `<li><strong>${m.nome}</strong>${frase(m)}</li>`).join('')}</ul></div>
    <div class="bloco"><h4 class="rotulo">O que pode ser</h4><ul>${a.sugestao.map((s, i) => `<li class="prob" style="--i:${i}"><span>${s.evento}</span><span class="barra-prob"><i style="width:${Math.round(s.prob * 100)}%"></i></span><b>${Math.round(s.prob * 100)}%</b></li>`).join('')}</ul>
      <h4 class="rotulo segundo" style="margin-top:16px">Parecidos no histórico</h4><ul>${a.similares.map((s) => `<li><strong>${s.evento}</strong>Poço ${s.poco.replace('WELL-', '')} · registro de ${s.quando.slice(0, 4)}</li>`).join('')}</ul></div>
    <div class="decisao" id="decisao">${fb ? retorno(fb) : `
      <button class="botao primario" id="b-conf" type="button">Confirmo</button>
      <select id="s-ev" aria-label="Evento confirmado">${opcoes}</select>
      <button class="botao" id="b-falso" type="button">Alarme falso</button>
      <input id="nota" placeholder="Observação do operador (opcional)" maxlength="500">
      <p class="simulacao">Simulação com caso histórico: em operação, esta resposta viraria rótulo para o próximo treino do detector.</p>`}</div>`;
  // O alerta entra assentando de baixo para cima, bloco a bloco.
  [...el.children].forEach((c, i) => c.style.setProperty('--i', i));
  $('#alerta-wrap').dataset.open = 'true';
  anima(el, 'cascata');
  if (!fb) {
    $('#b-conf').addEventListener('click', () => enviar(a, 'confirmado', $('#s-ev').value));
    $('#b-falso').addEventListener('click', () => enviar(a, 'falso', ''));
  } else ligarMudar(a);
}

// "Mudar resposta" devolve os botões para o operador responder de novo (a resposta nova substitui a antiga).
function ligarMudar(a) {
  const b = $('#b-mudar'); if (!b) return;
  b.addEventListener('click', () => {
    st.feedback = st.feedback.filter((x) => !(x.instancia === st.dado.id && x.alerta_t === a.t));
    if (st.local) gravarLocal(st.feedback);
    mostrarAlerta(a);
    placar(false);
  });
}

function retorno(f) {
  return `<span class="registrado">${ICONE.ok} ${f.veredito === 'confirmado' ? `Confirmado como ${f.evento.toLowerCase()}` : 'Marcado como alarme falso'}</span>${f.nota ? `<span class="descricao">“${f.nota}”</span>` : ''}<span class="descricao">Entra no próximo treino do detector</span><button class="botao" id="b-mudar" type="button">Mudar resposta</button>`;
}

async function enviar(a, veredito, evento) {
  const corpo = { instancia: st.dado.id, alerta_t: a.t, veredito, evento, nota: $('#nota').value };
  try {
    const f = st.local ? { ...corpo, registrado_em: new Date().toISOString() }
      : await json('api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    st.feedback = st.feedback.filter((x) => !(x.instancia === f.instancia && x.alerta_t === f.alerta_t)).concat(f);
    if (st.local) gravarLocal(st.feedback);
    $('#decisao').innerHTML = retorno(f);
    ligarMudar(a);
    placar(true);
  } catch {
    let aviso = $('#decisao .falhou');
    if (!aviso) { aviso = document.createElement('span'); aviso.className = 'falhou'; $('#decisao').appendChild(aviso); }
    aviso.textContent = 'Não consegui salvar. Tente de novo.';
    anima(aviso, 'troca');
  }
}

function placar(mudou) {
  const n = st.feedback.length; if (!n) { $('#placar').textContent = 'Nenhum alerta avaliado ainda'; return; }
  const c = st.feedback.filter((f) => f.veredito === 'confirmado').length;
  $('#placar').innerHTML = `<span class="num" id="placar-n">${n}</span> ${n === 1 ? 'alerta avaliado' : 'alertas avaliados'}: ${c} ${c === 1 ? 'confirmado' : 'confirmados'}, ${n - c} ${n - c === 1 ? 'alarme falso' : 'alarmes falsos'}`;
  if (mudou) anima($('#placar-n'), 'troca');
}

function tracoVelocidade(primeira) {
  const g = $('.velocidade'), b = g && g.querySelector('[aria-pressed="true"]'), t = g && g.querySelector('.velocidade-traco');
  if (!b || !t || !b.offsetWidth) return;
  if (primeira) g.classList.add('sem-transicao');
  t.style.width = `${b.offsetWidth - 16}px`;
  t.style.transform = `translateX(${b.offsetLeft + 8}px)`;
  if (primeira) requestAnimationFrame(() => requestAnimationFrame(() => g.classList.remove('sem-transicao')));
}

function alternar() { if (st.tocando) parar(); else tocar(); }
function tocar() {
  if (st.pos >= st.dado.score.length - 1) st.pos = 0;
  st.tocando = true; $('#play').textContent = 'Pausar';
  let ultimo = performance.now(), acum = 0;
  const passo = (agora) => {
    if (!st.tocando) return;
    acum += ((agora - ultimo) / 1000) * st.vel / st.dado.passo_s; ultimo = agora;
    if (acum >= 1) { st.pos = Math.min(st.dado.score.length - 1, st.pos + Math.floor(acum)); acum %= 1; desenhar(); }
    if (st.pos >= st.dado.score.length - 1) return parar();
    st.timer = requestAnimationFrame(passo);
  };
  st.timer = requestAnimationFrame(passo);
}
function parar() { st.tocando = false; cancelAnimationFrame(st.timer); const b = $('#play'); if (b) b.textContent = 'Reproduzir'; }

iniciar();
