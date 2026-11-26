import * as store from './store.js';
import { leesItems, parseLoonfiche } from './loonfiche.js';
import { isTimestatement, parseTimestatement } from './timestatement.js';
import { werkScherm, werkMaandScherm } from './werk.js';

const MND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MAAND_VOL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const nf = (d) => new Intl.NumberFormat('nl-BE', { minimumFractionDigits: d, maximumFractionDigits: d });
const f0 = nf(0).format, f2 = nf(2).format;
const eur = (v) => (v == null ? '—' : `€ ${f2(v)}`);
const eur0 = (v) => (v == null ? '—' : `€ ${f0(v)}`);
const getal = (v, f = f0) => (v == null ? '—' : f(v));
const maandKort = (ym) => `${MND[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const maandVol = (ym) => `${MAAND_VOL[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const som = (lijst, fn) => { const w = lijst.map(fn).filter((x) => x != null); return w.length ? Math.round(w.reduce((a, b) => a + b, 0) * 100) / 100 : null; };

// Waarden uit één fiche
const uitbetaald = (f) => f.totalen.totaal ?? f.totalen.netto ?? null;
const prestatie = (f, soort, re) => f.prestaties?.[soort]?.find((p) => re.test(p.omschrijving))?.waarde ?? null;
const gewerkteDagen = (f) => prestatie(f, 'dagen', /^Gewerkte dagen/i);
const gewerkteUren = (f) => prestatie(f, 'uren', /^Gewerkte uren/i);
const loopbaanDagen = (f) => prestatie(f, 'dagen', /Loopbaan/i);
const lijn = (f, re) => som(f.secties.flatMap((s) => s.lijnen).filter((l) => re.test(l.omschrijving)), (l) => l.bedrag);

const $view = document.getElementById('view');
const state = { user: null, gestart: false, fiches: null, werk: [], fout: null, imports: [], bezig: false, melding: null, jaar: null, wis: null };

// ---------- Jaar ----------
function jarenVan(fiches) { return [...new Set(fiches.map((f) => +f.maand.slice(0, 4)))].sort(); }

function jaarScherm() {
  const fiches = state.fiches;
  if (!fiches.length) return leeg();
  const jaren = jarenVan(fiches);
  const jaar = jaren.includes(state.jaar) ? state.jaar : jaren[jaren.length - 1];
  const lijst = fiches.filter((f) => +f.maand.slice(0, 4) === jaar).sort((a, b) => a.maand.localeCompare(b.maand) || a.id.localeCompare(b.id));
  const aanwezig = new Set(lijst.map((f) => +f.maand.slice(5, 7)));
  const laatsteMaand = jaar === new Date().getFullYear() ? Math.max(...aanwezig) : 12;
  const ontbreekt = MND.filter((_, i) => i + 1 <= laatsteMaand && !aanwezig.has(i + 1));

  const kerncijfers = [
    ['Uitbetaald', eur0(som(lijst, uitbetaald))],
    ['Bruto', eur0(som(lijst, (f) => f.totalen.bruto))],
    ['RSZ', eur0(som(lijst, (f) => f.totalen.sociale))],
    ['Bedrijfsvoorheffing', eur0(som(lijst, (f) => f.totalen.voorheffing))],
    ['Gewerkte dagen', getal(som(lijst, gewerkteDagen))],
    ['Maaltijdcheques', getal(som(lijst, (f) => f.maaltijdcheques))],
  ];

  return `
    <header class="kop">
      <h1>Loon</h1>
      ${jaren.length > 1 ? `<div class="jaren" role="group" aria-label="Jaar">${jaren.map((j) => `<button type="button" data-jaar="${j}" class="${j === jaar ? 'aan' : ''}" aria-pressed="${j === jaar}">${j}</button>`).join('')}</div>` : `<p class="sub">${jaar}</p>`}
    </header>
    <dl class="kern">${kerncijfers.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${maandGrafiek(lijst)}
    ${ontbreekt.length ? `<p class="noot">Geen fiche voor ${ontbreekt.join(', ')} ${jaar}.</p>` : ''}
    <div class="scroll"><table class="tabel">
      <thead><tr><th>Maand</th><th>Bruto</th><th>RSZ</th><th>Voorheffing</th><th>Netto</th><th>Regularisatie</th><th>Uitbetaald</th><th>Dagen</th><th>Cheques</th></tr></thead>
      <tbody>${lijst.map((f) => `<tr data-href="#/fiche/${esc(f.id)}">
        <th><a href="#/fiche/${esc(f.id)}">${maandKort(f.maand)}</a></th>
        <td>${eur(f.totalen.bruto)}</td><td>${eur(f.totalen.sociale)}</td><td>${eur(f.totalen.voorheffing)}</td>
        <td>${eur(f.totalen.netto)}</td><td>${f.totalen.regularisatie ? eur(f.totalen.regularisatie) : ''}</td>
        <td><b>${eur(uitbetaald(f))}</b></td><td>${getal(gewerkteDagen(f))}</td><td>${getal(f.maaltijdcheques)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Totaal</th><td>${eur(som(lijst, (f) => f.totalen.bruto))}</td><td>${eur(som(lijst, (f) => f.totalen.sociale))}</td>
        <td>${eur(som(lijst, (f) => f.totalen.voorheffing))}</td><td>${eur(som(lijst, (f) => f.totalen.netto))}</td>
        <td>${eur(som(lijst, (f) => f.totalen.regularisatie))}</td><td><b>${eur(som(lijst, uitbetaald))}</b></td>
        <td>${getal(som(lijst, gewerkteDagen))}</td><td>${getal(som(lijst, (f) => f.maaltijdcheques))}</td></tr></tfoot>
    </table></div>`;
}

// Staafjes per maand: netto (wit) met de regularisatie erbovenop (grijs).
function maandGrafiek(lijst) {
  const perMaand = Array.from({ length: 12 }, (_, i) => {
    const m = lijst.filter((f) => +f.maand.slice(5, 7) === i + 1);
    return { netto: som(m, (f) => f.totalen.netto) ?? 0, regul: som(m, (f) => f.totalen.regularisatie) ?? 0, id: m[0]?.id };
  });
  const max = Math.max(...perMaand.map((p) => p.netto + Math.max(0, p.regul)), 1);
  const W = 120, H = 100, b = W / 12, h = (v) => (Math.max(0, v) / max) * (H - 4);
  return `<figure class="grafiek"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Uitbetaald per maand">
    ${perMaand.map((p, i) => {
      const x = i * b + b * 0.22, w = b * 0.56, hn = h(p.netto), hr = h(p.regul);
      const tip = p.id ? `${MND[i]}: netto ${eur(p.netto)}${p.regul ? `, regularisatie ${eur(p.regul)}` : ''}` : `${MND[i]}: geen fiche`;
      return `<g${p.id ? ` data-href="#/fiche/${esc(p.id)}" class="klik"` : ''}><title>${esc(tip)}</title>
        <rect x="${i * b}" y="0" width="${b}" height="${H}" fill="transparent"/>
        ${p.id ? `<rect x="${x}" y="${H - hn}" width="${w}" height="${hn}" class="b-netto"/>` : `<rect x="${x}" y="${H - 0.6}" width="${w}" height="0.6" class="b-leeg"/>`}
        ${hr ? `<rect x="${x}" y="${H - hn - hr - 0.8}" width="${w}" height="${hr}" class="b-regul"/>` : ''}</g>`;
    }).join('')}
  </svg><figcaption>${MND.map((m) => `<span>${m}</span>`).join('')}</figcaption></figure>`;
}

// ---------- Alle jaren ----------
function jarenScherm() {
  const fiches = state.fiches;
  if (!fiches.length) return leeg();
  const rijen = jarenVan(fiches).map((j) => {
    const l = fiches.filter((f) => +f.maand.slice(0, 4) === j);
    return {
      j, n: new Set(l.map((f) => f.maand)).size, bruto: som(l, (f) => f.totalen.bruto), rsz: som(l, (f) => f.totalen.sociale),
      bv: som(l, (f) => f.totalen.voorheffing), verg: som(l, (f) => f.totalen.vergoedingen), uit: som(l, uitbetaald),
      dagen: som(l, gewerkteDagen), uren: som(l, gewerkteUren), lb: som(l, loopbaanDagen), mc: som(l, (f) => f.maaltijdcheques),
      fiets: lijn({ secties: l.flatMap((f) => f.secties) }, /Fietsvergoeding/i),
    };
  });
  const max = Math.max(...rijen.map((r) => r.uit ?? 0), 1);
  return `
    <header class="kop"><h1>Per jaar</h1></header>
    <div class="balken">${rijen.map((r) => `<button type="button" data-jaar="${r.j}" data-naar="#/"><span>${r.j}</span>
      <i style="width:${((r.uit ?? 0) / max * 100).toFixed(1)}%"></i><b>${eur0(r.uit)}</b></button>`).join('')}</div>
    <div class="scroll"><table class="tabel">
      <thead><tr><th>Jaar</th><th>Maanden</th><th>Bruto</th><th>RSZ</th><th>Voorheffing</th><th>Vergoedingen</th><th>Uitbetaald</th><th>Dagen</th><th>Uren</th><th>Loopbaanond.</th><th>Cheques</th><th>Fiets</th></tr></thead>
      <tbody>${rijen.map((r) => `<tr><th>${r.j}</th><td>${r.n}</td><td>${eur(r.bruto)}</td><td>${eur(r.rsz)}</td><td>${eur(r.bv)}</td>
        <td>${eur(r.verg)}</td><td><b>${eur(r.uit)}</b></td><td>${getal(r.dagen)}</td><td>${getal(r.uren)}</td><td>${getal(r.lb)}</td>
        <td>${getal(r.mc)}</td><td>${eur(r.fiets)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="noot">Een jaar met minder dan 12 maanden is onvolledig ingelezen.</p>`;
}

// ---------- Eén fiche ----------
function ficheScherm(id) {
  const f = state.fiches.find((x) => x.id === id);
  if (!f) return `<p class="noot">Deze fiche bestaat niet (meer). <a href="#/">Terug</a></p>`;
  const g = f.gegevens || {};
  const secties = (lijst) => lijst.map((s) => `
    <tr class="sectie"><th>${esc(s.naam)}</th><td>${eur(s.bedrag)}</td></tr>
    ${s.lijnen.map((l) => `<tr class="lijn"><th><span class="code">${esc(l.code)}</span>${esc(l.omschrijving)}</th><td>${eur(l.bedrag)}</td></tr>`).join('')}`).join('');
  const gegevens = [
    ['Index', g.index != null ? f2(g.index) : null], ['Jaarwedde geïndexeerd', g.jaarwedde != null ? eur(g.jaarwedde) : null],
    ['Geldelijk statuut 100%', g.geldelijkStatuut != null ? eur(g.geldelijkStatuut) : null], ['Barema', g.barema],
    ['Werkregime', g.werkregime != null ? `${f2(g.werkregime)} u/week` : null], ['Contractueel stelsel', g.contractueelStelsel != null ? `${f2(g.contractueelStelsel)} u/week` : null],
    ['Statuut', g.statuut], ['Functie', g.functie], ['Burgerlijke staat', g.burgerlijkeStaat], ['Personen ten laste', g.personenTenLaste],
  ].filter(([, v]) => v != null && v !== '');
  const prest = [...(f.prestaties?.dagen || []).map((p) => [p, 'dagen']), ...(f.prestaties?.uren || []).map((p) => [p, 'uren'])];

  return `
    <header class="kop rij"><a class="terug" href="#/" data-jaar="${f.maand.slice(0, 4)}" aria-label="Terug">←</a><h1>${maandVol(f.maand)}</h1></header>
    <dl class="kern"><div><dt>Uitbetaald</dt><dd>${eur(uitbetaald(f))}</dd></div>
      <div><dt>Gewerkt</dt><dd>${getal(gewerkteDagen(f))} <small>dagen</small></dd></div>
      <div><dt>Maaltijdcheques</dt><dd>${getal(f.maaltijdcheques)}</dd></div></dl>
    ${f.controles?.length ? `<p class="let-op">Bij het inlezen klopten deze totalen niet: ${f.controles.map(esc).join('; ')}. Vergelijk met de PDF.</p>` : ''}
    <h2>Van bruto naar netto</h2>
    <table class="lijst">${secties(f.secties)}
      <tr class="totaal"><th>Nettoloon van de maand</th><td>${eur(f.totalen.netto)}</td></tr>
      ${f.totalen.regularisatie != null ? `<tr class="sectie"><th>Regularisatie</th><td>${eur(f.totalen.regularisatie)}</td></tr>` : ''}
      <tr class="totaal"><th>Totaal netto bedrag</th><td>${eur(f.totalen.totaal)}</td></tr>
    </table>
    ${f.herberekeningen?.length ? `<h2>Herberekeningen</h2>${f.herberekeningen.map((h) => `
      <details><summary><span>${h.maand ? maandVol(h.maand) : 'Onbekende maand'}</span><b>${eur(h.totaal)}</b></summary>
        <table class="lijst">${secties(h.secties)}</table></details>`).join('')}` : ''}
    ${prest.length ? `<h2>Prestaties</h2><table class="lijst">${prest.map(([p, s]) => `<tr><th><span class="code">${esc(p.code)}</span>${esc(p.omschrijving)}</th><td>${esc(p.tekst)} ${s === 'uren' ? 'u' : ''}</td></tr>`).join('')}</table>` : ''}
    ${gegevens.length ? `<h2>Loongegevens</h2><table class="lijst">${gegevens.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}
    <p class="acties">${state.wis === f.id
      ? `Fiche van ${maandVol(f.maand)} verwijderen? <button type="button" class="link gevaar" data-wis-ja="${esc(f.id)}">Ja, verwijderen</button> <button type="button" class="link" data-wis-nee>Annuleren</button>`
      : `<button type="button" class="link" data-wis="${esc(f.id)}">Fiche verwijderen</button>`}</p>`;
}

// ---------- Gegevens ----------
function gegevensScherm() {
  const ok = state.imports.filter((x) => x.fiche || x.werk);
  return `
    <header class="kop"><h1>Gegevens</h1><p class="sub">Aangemeld als ${esc(state.user.email || state.user.displayName)}</p></header>
    <h2>PDF's inlezen</h2>
    <p class="uitleg">Loonfiches en time statements uit bpost4me, door elkaar. Ze worden in je browser gelezen; de PDF zelf wordt niet opgeslagen.
      Rijksregisternummer, IBAN, stamnummer en adres worden overgeslagen. Een bestand dat je opnieuw inleest, overschrijft de vorige versie.</p>
    <label class="knop">PDF's kiezen<input id="bestanden" type="file" accept="application/pdf,.pdf" multiple hidden></label>
    ${state.imports.length ? `<ul class="import">${state.imports.map((x) => x.fiche
      ? `<li><span>${maandVol(x.fiche.maand)}</span><span>Loonfiche</span><span>${eur(uitbetaald(x.fiche))}</span>${x.bestaat ? '<small>vervangt bestaande</small>' : ''}${x.fiche.controles.length ? `<small class="slecht">totalen kloppen niet: ${esc(x.fiche.controles.join('; '))}</small>` : ''}</li>`
      : x.werk
        ? `<li><span>${maandVol(x.werk.maand)}</span><span>Time statement</span><span>${x.werk.dagen.filter((d) => d.gepresteerd > 0).length} dagen</span>${x.bestaat ? '<small>vervangt bestaande</small>' : ''}${x.werk.controles.length ? `<small class="slecht">totalen kloppen niet: ${esc(x.werk.controles.join('; '))}</small>` : ''}</li>`
        : `<li class="slecht"><span>${esc(x.naam)}</span><small>${esc(x.fout)}</small></li>`).join('')}</ul>
      ${ok.length ? `<button type="button" class="knop primair" id="opslaan"${state.bezig ? ' disabled' : ''}>${ok.length} ${ok.length === 1 ? 'bestand' : 'bestanden'} opslaan</button>` : ''}` : ''}
    ${state.melding ? `<p class="melding">${esc(state.melding)}</p>` : ''}
    <h2>Exporteren</h2>
    <p class="uitleg">Alle fiches als CSV (één regel per fiche).</p>
    <button type="button" class="knop" id="export"${state.fiches.length ? '' : ' disabled'}>CSV downloaden</button>
    <h2>Account</h2>
    <button type="button" class="knop" id="afmelden">Afmelden</button>`;
}

function leeg() {
  return `<section class="leeg"><h1>Loon</h1><p>Nog geen loonfiches ingelezen.</p><a class="knop primair" href="#/gegevens">Loonfiches inlezen</a></section>`;
}

function loginScherm() {
  return `<section class="leeg"><h1>Loon</h1><p>Je loonfiches, per maand en per jaar.</p>
    <button type="button" class="knop primair" id="aanmelden">Aanmelden met Google</button>
    ${state.fout ? `<p class="slecht">${esc(state.fout)}</p>` : ''}</section>`;
}

// ---------- Render ----------
function render() {
  const route = location.hash.replace(/^#/, '') || '/';
  document.querySelectorAll('nav a').forEach((a) => {
    const r = a.getAttribute('href').slice(1);
    a.classList.toggle('actief', r === '/' ? route === '/' || route.startsWith('/fiche/') : route === r || route.startsWith(r + '/'));
  });
  document.querySelector('nav').hidden = !state.user;
  if (!state.gestart) { $view.innerHTML = '<p class="laden">Laden…</p>'; return; }
  if (!state.user) { $view.innerHTML = loginScherm(); return; }
  if (!state.fiches) { $view.innerHTML = state.fout ? `<p class="slecht">${esc(state.fout)}</p>` : '<p class="laden">Laden…</p>'; return; }
  if (route.startsWith('/fiche/')) $view.innerHTML = ficheScherm(decodeURIComponent(route.slice(7)));
  else if (route.startsWith('/werk/')) $view.innerHTML = werkMaandScherm(state, decodeURIComponent(route.slice(6)));
  else if (route === '/werk') $view.innerHTML = werkScherm(state);
  else if (route === '/jaren') $view.innerHTML = jarenScherm();
  else if (route === '/gegevens') $view.innerHTML = gegevensScherm();
  else $view.innerHTML = jaarScherm();
}

async function laad() {
  try { [state.fiches, state.werk] = await Promise.all([store.laad(state.user), store.laad(state.user, 'werk')]); state.fout = null; }
  catch (e) { state.fout = 'Gegevens laden mislukt: ' + e.message; }
  render();
}

function exporteer() {
  const kol = ['maand', 'bruto', 'rsz', 'belastbaar', 'voorheffing', 'inhoudingen', 'vergoedingen', 'netto', 'regularisatie', 'uitbetaald',
    'gewerkte_dagen', 'gewerkte_uren', 'loopbaanonderbreking_dagen', 'maaltijdcheques', 'fietsvergoeding', 'index', 'jaarwedde'];
  const n = (v) => (v == null ? '' : String(v).replace('.', ','));
  const rijen = [...state.fiches].sort((a, b) => a.maand.localeCompare(b.maand)).map((f) => [f.maand, f.totalen.bruto, f.totalen.sociale,
    f.totalen.belastbaar, f.totalen.voorheffing, f.totalen.inhoudingen, f.totalen.vergoedingen, f.totalen.netto, f.totalen.regularisatie,
    uitbetaald(f), gewerkteDagen(f), gewerkteUren(f), loopbaanDagen(f), f.maaltijdcheques, lijn(f, /Fietsvergoeding/i),
    f.gegevens?.index, f.gegevens?.jaarwedde].map(n).join(';'));
  const blob = new Blob(['﻿' + [kol.join(';'), ...rijen].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'loonfiches.csv' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-href], a[data-jaar], a[data-werkjaar]');
  if (!t) return;
  if (t.dataset.werkjaar) { state.werkJaar = +t.dataset.werkjaar; render(); return; }
  if (t.dataset.jaar) { state.jaar = +t.dataset.jaar; if (t.dataset.naar) location.hash = t.dataset.naar; render(); if (t.tagName !== 'A') return; }
  if (t.dataset.href && !e.target.closest('a')) { location.hash = t.dataset.href; return; }
  if (t.id === 'aanmelden') { try { await store.login(); } catch (err) { state.fout = 'Aanmelden mislukt: ' + err.message; render(); } }
  else if (t.id === 'afmelden') await store.logout();
  else if (t.id === 'export') exporteer();
  else if (t.id === 'opslaan') {
    state.bezig = true; render();
    try {
      const items = state.imports.filter((x) => x.fiche || x.werk).map((x) => (x.fiche
        ? { col: 'loonfiches', id: store.ficheId(x.fiche), data: x.fiche }
        : { col: 'werk', id: x.werk.maand, data: x.werk }));
      const n = await store.bewaar(state.user, items);
      state.imports = []; state.melding = `${n} ${n === 1 ? 'bestand' : 'bestanden'} opgeslagen.`;
      await laad();
    } catch (err) { state.melding = 'Opslaan mislukt: ' + err.message; }
    state.bezig = false; render();
  } else if (t.dataset.wis) { state.wis = t.dataset.wis; render(); }
  else if (t.hasAttribute('data-wis-nee')) { state.wis = null; state.wisWerk = null; render(); }
  else if (t.dataset.wiswerk) { state.wisWerk = t.dataset.wiswerk; render(); }
  else if (t.dataset.wiswerkJa) {
    try { await store.verwijder(state.user, t.dataset.wiswerkJa, 'werk'); state.wisWerk = null; location.hash = '#/werk'; await laad(); }
    catch (err) { state.fout = 'Verwijderen mislukt: ' + err.message; render(); }
  }
  else if (t.dataset.wisJa) {
    try { await store.verwijder(state.user, t.dataset.wisJa); state.wis = null; location.hash = '#/'; await laad(); }
    catch (err) { state.fout = 'Verwijderen mislukt: ' + err.message; render(); }
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.id !== 'bestanden') return;
  const bestanden = [...e.target.files];
  state.melding = 'Lezen…'; state.imports = []; render();
  const bestaand = new Set(state.fiches.map((f) => f.id));
  const bestaandWerk = new Set(state.werk.map((w) => w.id));
  state.imports = [];
  for (const b of bestanden) {
    try {
      const paginas = await leesItems(b);
      if (isTimestatement(paginas)) {
        const werk = parseTimestatement(paginas);
        werk.ingelezen = new Date().toISOString();
        state.imports.push({ naam: b.name, werk, bestaat: bestaandWerk.has(werk.maand) });
      } else {
        const fiche = parseLoonfiche(paginas);
        fiche.ingelezen = new Date().toISOString();
        state.imports.push({ naam: b.name, fiche, bestaat: bestaand.has(store.ficheId(fiche)) });
      }
    } catch (err) { state.imports.push({ naam: b.name, fout: err.message }); }
  }
  const sleutel = (x) => (x.fiche ? `${x.fiche.maand}a` : x.werk ? `${x.werk.maand}b` : '');
  state.imports.sort((a, b) => sleutel(a).localeCompare(sleutel(b)));
  state.melding = null; render();
});

window.addEventListener('hashchange', () => { state.wis = null; state.wisWerk = null; render(); window.scrollTo(0, 0); });

store.init((u) => {
  state.user = u; state.gestart = true; state.fiches = null;
  if (u) laad(); else render();
}).catch((err) => { state.gestart = true; state.fout = err.message; render(); });

render();

if ('serviceWorker' in navigator && !location.search.includes('demo')) {
  const hadController = !!navigator.serviceWorker.controller;
  let herladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !herladen) { herladen = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {});
}
