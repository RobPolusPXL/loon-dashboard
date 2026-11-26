import * as store from './store.js';
import { leesItems, parseLoonfiche } from './loonfiche.js';
import { isTimestatement, parseTimestatement } from './timestatement.js';
import { werkScherm, werkMaandScherm } from './werk.js';
import { kolommen, lijn as lijnGrafiek, balken, verdeelbalk, KLEUR } from './charts.js';

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
// Gewerkte dagen: uit de time statement van die maand als die er is (oudere fiches hebben geen prestaties), anders van de fiche.
const werkDagen = (ym) => {
  const w = state.werk?.find((x) => x.maand === ym);
  return w ? w.dagen.filter((d) => typeof d.gepresteerd === 'number' && d.gepresteerd > 0).length : null;
};
const gewerkteDagen = (f) => werkDagen(f.maand) ?? prestatie(f, 'dagen', /^Gewerkte dagen/i);
// Som over een lijst fiches, elke maand maar één keer (twee fiches in één maand = één keer dagen)
const somDagen = (lijst) => som([...new Map(lijst.map((f) => [f.maand, f])).values()], gewerkteDagen);
const gewerkteUren = (f) => prestatie(f, 'uren', /^Gewerkte uren/i);
const loopbaanDagen = (f) => prestatie(f, 'dagen', /Loopbaan/i);
const lijn = (f, re) => som(f.secties.flatMap((s) => s.lijnen).filter((l) => re.test(l.omschrijving)), (l) => l.bedrag);

const $view = document.getElementById('view');
const state = { user: null, gestart: false, fiches: null, werk: [], fout: null, imports: [], bezig: false, melding: null, jaar: null, wis: null };

// ---------- Jaar ----------
function jarenVan(fiches) { return [...new Set(fiches.map((f) => +f.maand.slice(0, 4)))].sort(); }

// Afgeleide bedragen per fiche
const brutoTot = (f) => (f.totalen.bruto ?? 0) + (f.totalen.brutoNiet ?? 0);
const verg = (f) => f.totalen.vergoedingen ?? 0;
const nettoLoon = (f) => (f.totalen.netto ?? 0) - verg(f); // nettoloon zonder vergoedingen
const regul = (f) => f.totalen.regularisatie ?? 0;
const ingehouden = (f) => -((f.totalen.sociale ?? 0) + (f.totalen.voorheffing ?? 0) + (f.totalen.inhoudingen ?? 0));
const eurK = (v) => { if (Math.abs(v) < 1000) return `€ ${f0(v)}`; const k = v / 1000; return `€ ${Math.abs(k) >= 10 || Number.isInteger(k) ? f0(k) : nf(1).format(k)}K`; };

function maandFiches(lijst, m) { return lijst.filter((f) => +f.maand.slice(5, 7) === m); }

function jaarScherm() {
  const fiches = state.fiches;
  if (!fiches.length) return leeg();
  const jaren = jarenVan(fiches);
  const jaar = jaren.includes(state.jaar) ? state.jaar : jaren[jaren.length - 1];
  const lijst = fiches.filter((f) => +f.maand.slice(0, 4) === jaar).sort((a, b) => a.maand.localeCompare(b.maand) || a.id.localeCompare(b.id));
  const aanwezig = new Set(lijst.map((f) => +f.maand.slice(5, 7)));
  const laatsteMaand = jaar === new Date().getFullYear() ? Math.max(...aanwezig) : 12;
  const ontbreekt = MND.filter((_, i) => i + 1 <= laatsteMaand && !aanwezig.has(i + 1));
  const uit = som(lijst, uitbetaald);
  const nMaanden = aanwezig.size;

  const perMaand = Array.from({ length: 12 }, (_, i) => maandFiches(lijst, i + 1));
  const reeks = (fn) => perMaand.map((l) => (l.length ? som(l, fn) : null));
  const grafiek = kolommen(MND, [
    { naam: 'Netto loon', kleur: KLEUR.netto, waarden: reeks(nettoLoon) },
    { naam: 'Vergoedingen', kleur: KLEUR.verg, waarden: reeks(verg) },
    { naam: 'Regularisatie', kleur: KLEUR.regul, waarden: reeks(regul) },
  ], { fmt: eur, asFmt: eurK, hrefs: perMaand.map((l) => (l.length ? `#/fiche/${l[0].id}` : null)), tipKop: MAAND_VOL.map((m) => `${m} ${jaar}`) });

  const verdeel = verdeelbalk([
    { naam: 'Netto loon', v: som(lijst, nettoLoon) ?? 0, kleur: KLEUR.netto },
    { naam: 'RSZ', v: -(som(lijst, (f) => f.totalen.sociale) ?? 0), kleur: KLEUR.rsz },
    { naam: 'Bedrijfsvoorheffing', v: -(som(lijst, (f) => f.totalen.voorheffing) ?? 0), kleur: KLEUR.bv },
    { naam: 'Inhoudingen', v: -(som(lijst, (f) => f.totalen.inhoudingen) ?? 0), kleur: KLEUR.inh },
  ], { fmt: eur0 });

  return `
    <header class="kop">
      <h1>Loon</h1>
      ${jaren.length > 1 ? `<div class="jaren" role="group" aria-label="Jaar">${jaren.map((j) => `<button type="button" data-jaar="${j}" class="${j === jaar ? 'aan' : ''}" aria-pressed="${j === jaar}">${j}</button>`).join('')}</div>` : `<p class="sub">${jaar}</p>`}
    </header>
    <div class="held"><span>Uitbetaald in ${jaar}</span><b>${eur0(uit)}</b><small>${nMaanden} ${nMaanden === 1 ? 'maand' : 'maanden'} · gemiddeld ${eur0(uit / nMaanden)} per maand</small></div>
    <dl class="kern">
      <div><dt>Bruto</dt><dd>${eur0(som(lijst, brutoTot))}</dd></div>
      <div><dt>Ingehouden</dt><dd>${eur0(som(lijst, ingehouden))}</dd></div>
      <div><dt>Vergoedingen</dt><dd>${eur0(som(lijst, verg))}</dd></div>
      <div><dt>Gewerkte dagen</dt><dd>${getal(somDagen(lijst))}</dd></div>
      <div><dt>Maaltijdcheques</dt><dd>${getal(som(lijst, (f) => f.maaltijdcheques))}</dd></div>
    </dl>
    <h2>Uitbetaald per maand</h2>
    ${grafiek}
    ${ontbreekt.length ? `<p class="noot">Geen fiche voor ${ontbreekt.join(', ')} ${jaar}.</p>` : ''}
    <h2>Waar gaat je bruto naartoe</h2>
    ${verdeel}
    <h2>Per maand</h2>
    <div class="scroll"><table class="tabel">
      <thead><tr><th>Maand</th><th>Bruto</th><th>Ingehouden</th><th>Vergoedingen</th><th>Uitbetaald</th><th>Dagen</th></tr></thead>
      <tbody>${lijst.map((f) => `<tr data-href="#/fiche/${esc(f.id)}">
        <th><a href="#/fiche/${esc(f.id)}">${maandKort(f.maand)}</a>${f.controles?.length ? ' <span class="slecht" title="Totalen kloppen niet">•</span>' : ''}</th>
        <td>${eur0(brutoTot(f))}</td><td>${eur0(ingehouden(f))}</td><td>${verg(f) ? eur0(verg(f)) : ''}</td>
        <td><b>${eur(uitbetaald(f))}</b>${regul(f) ? `<small>incl. ${eur0(regul(f))} regularisatie</small>` : ''}</td><td>${getal(gewerkteDagen(f))}</td></tr>`).join('')}</tbody>
    </table></div>`;
}

// ---------- Alle jaren ----------
function jarenScherm() {
  const fiches = state.fiches;
  if (!fiches.length) return leeg();
  const jaren = jarenVan(fiches);
  const perJaar = jaren.map((j) => ({ j, l: fiches.filter((f) => +f.maand.slice(0, 4) === j) }));
  const n = (l) => new Set(l.map((f) => f.maand)).size;
  const jl = jaren.map(String);
  const tipExtra = perJaar.map(({ l }) => `${n(l)} ${n(l) === 1 ? 'maand' : 'maanden'} ingelezen`);

  const uitPerJaar = kolommen(jl, [
    { naam: 'Netto loon', kleur: KLEUR.netto, waarden: perJaar.map(({ l }) => som(l, nettoLoon)) },
    { naam: 'Vergoedingen', kleur: KLEUR.verg, waarden: perJaar.map(({ l }) => som(l, verg)) },
    { naam: 'Regularisatie', kleur: KLEUR.regul, waarden: perJaar.map(({ l }) => som(l, regul)) },
  ], { fmt: eur0, asFmt: eurK, tipExtra, hrefs: jaren.map((j) => `#/jaar/${j}`), topLabel: perJaar.map(({ l }) => eurK(som(l, uitbetaald))) });

  // Netto loon per maand, alle maanden van de eerste tot de laatste fiche
  const eerste = fiches.reduce((a, f) => (f.maand < a ? f.maand : a), '9999');
  const laatste = fiches.reduce((a, f) => (f.maand > a ? f.maand : a), '0000');
  const maanden = [];
  for (let y = +eerste.slice(0, 4), m = +eerste.slice(5, 7); `${y}-${String(m).padStart(2, '0')}` <= laatste; m === 12 ? (y++, m = 1) : m++) maanden.push(`${y}-${String(m).padStart(2, '0')}`);
  const punt = (fn, fmt) => maanden.map((ym) => {
    const l = fiches.filter((f) => f.maand === ym);
    const v = l.length ? som(l, fn) : null;
    return { label: maandKort(ym), v, href: l[0] ? `#/fiche/${l[0].id}` : null, tip: `${maandVol(ym)}: ${v == null ? 'geen fiche' : fmt(v)}` };
  });
  const asLabels = maanden.map((ym, i) => ({ ym, i })).filter((x) => x.ym.endsWith('-01') || x.i === 0).map((x) => ({ i: x.i, label: x.ym.slice(0, 4) }));
  const nettoLijn = lijnGrafiek(punt(nettoLoon, eur), { fmt: eur, asFmt: eurK, asLabels });
  const indexLijn = lijnGrafiek(punt((f) => f.gegevens?.index ?? null, (v) => f2(v)), { fmt: (v) => f2(v), asFmt: (v) => f0(v), asLabels, hoogte: 120, nul: false });

  const pct = balken(perJaar.map(({ j, l }) => ({
    label: String(j), href: `#/jaar/${j}`,
    waarden: { netto: som(l, nettoLoon) ?? 0, rsz: -(som(l, (f) => f.totalen.sociale) ?? 0), bv: -(som(l, (f) => f.totalen.voorheffing) ?? 0), inh: -(som(l, (f) => f.totalen.inhoudingen) ?? 0) },
  })), [
    { k: 'netto', naam: 'Netto loon', kleur: KLEUR.netto }, { k: 'rsz', naam: 'RSZ', kleur: KLEUR.rsz },
    { k: 'bv', naam: 'Bedrijfsvoorheffing', kleur: KLEUR.bv }, { k: 'inh', naam: 'Inhoudingen', kleur: KLEUR.inh },
  ], { fmt: eur0, procent: true, rechts: (r, tot) => (tot ? `${Math.round(r.waarden.netto / tot * 100)}% netto` : '') });

  // kort: compacte notatie boven de kolommen en op de as; fmt: volledig in de tooltip
  const enkelL = (lfn, kort) => kolommen(jl, [{ naam: '', kleur: KLEUR.enkel, waarden: perJaar.map(({ l }) => lfn(l)) }], { fmt: kort, hoogte: 120, tipExtra, topLabel: perJaar.map(({ l }) => { const v = lfn(l); return v == null ? null : kort(v); }) });
  const enkel = (fn, kort, fmt = kort) => kolommen(jl, [{ naam: '', kleur: KLEUR.enkel, waarden: perJaar.map(({ l }) => som(l, fn)) }], { fmt, asFmt: kort, hoogte: 120, tipExtra, topLabel: perJaar.map(({ l }) => { const v = som(l, fn); return v == null ? null : kort(v); }) });

  return `
    <header class="kop"><h1>Per jaar</h1></header>
    <h2>Uitbetaald per jaar</h2>
    ${uitPerJaar}
    <h2>Netto loon per maand</h2>
    <p class="noot">Zonder vergoedingen en regularisaties. Klik op een punt om die fiche te openen.</p>
    ${nettoLijn}
    <h2>Van bruto naar netto</h2>
    ${pct}
    <div class="duo">
      <section><h2>Gewerkte dagen</h2>${enkelL(somDagen, (v) => f0(v))}</section>
      <section><h2>Maaltijdcheques</h2>${enkel((f) => f.maaltijdcheques, (v) => f0(v))}</section>
      <section><h2>Fietsvergoeding</h2>${enkel((f) => lijn(f, /Fietsvergoeding/i), eurK, eur0)}</section>
      <section><h2>Index</h2>${indexLijn}</section>
    </div>
    <h2>Overzicht</h2>
    <div class="scroll"><table class="tabel">
      <thead><tr><th>Jaar</th><th>Maanden</th><th>Bruto</th><th>Ingehouden</th><th>Uitbetaald</th><th>Dagen</th></tr></thead>
      <tbody>${perJaar.map(({ j, l }) => `<tr data-href="#/jaar/${j}"><th>${j}</th><td>${n(l)}</td><td>${eur0(som(l, brutoTot))}</td><td>${eur0(som(l, ingehouden))}</td>
        <td><b>${eur0(som(l, uitbetaald))}</b></td><td>${getal(somDagen(l))}</td></tr>`).join('')}</tbody>
    </table></div>`;
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
  const ok = state.imports.filter((x) => x.fiche || (x.werk && !x.ouder));
  return `
    <header class="kop"><h1>Gegevens</h1><p class="sub">Aangemeld als ${esc(state.user.email || state.user.displayName)}</p></header>
    <h2>PDF's inlezen</h2>
    <p class="uitleg">Loonfiches en time statements uit bpost4me, door elkaar. Ze worden in je browser gelezen; de PDF zelf wordt niet opgeslagen.
      Rijksregisternummer, IBAN, stamnummer en adres worden overgeslagen. Een bestand dat je opnieuw inleest, overschrijft de vorige versie.</p>
    <label class="knop">PDF's kiezen<input id="bestanden" type="file" accept="application/pdf,.pdf" multiple hidden></label>
    ${state.imports.length ? `<ul class="import">${state.imports.map((x) => x.fiche
      ? `<li><span>${maandVol(x.fiche.maand)}</span><span>Loonfiche</span><span>${eur(uitbetaald(x.fiche))}</span>${x.bestaat ? '<small>vervangt bestaande</small>' : ''}${x.fiche.controles.length ? `<small class="slecht">totalen kloppen niet: ${esc(x.fiche.controles.join('; '))}</small>` : ''}</li>`
      : x.werk
        ? `<li${x.ouder ? ' class="ouder"' : ''}><span>${maandVol(x.werk.maand)}</span><span>Time statement</span><span>situatie ${x.werk.situatie.split('-').reverse().join('/')}</span><span>${x.werk.dagen.filter((d) => d.gepresteerd > 0).length} dagen</span>${x.ouder ? '<small>overgeslagen: er is een recentere versie van deze maand</small>' : x.bestaat ? '<small>vervangt bestaande</small>' : ''}${x.werk.controles.length ? `<small class="slecht">totalen kloppen niet: ${esc(x.werk.controles.join('; '))}</small>` : ''}</li>`
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
    a.classList.toggle('actief', r === '/' ? route === '/' || route.startsWith('/fiche/') || route.startsWith('/jaar/') : route === r || route.startsWith(r + '/'));
  });
  document.querySelector('nav').hidden = !state.user;
  if (!state.gestart) { $view.innerHTML = '<p class="laden">Laden…</p>'; return; }
  if (!state.user) { $view.innerHTML = loginScherm(); return; }
  if (!state.fiches) { $view.innerHTML = state.fout ? `<p class="slecht">${esc(state.fout)}</p>` : '<p class="laden">Laden…</p>'; return; }
  if (route.startsWith('/fiche/')) $view.innerHTML = ficheScherm(decodeURIComponent(route.slice(7)));
  else if (route.startsWith('/werk/')) $view.innerHTML = werkMaandScherm(state, decodeURIComponent(route.slice(6)));
  else if (route === '/werk') $view.innerHTML = werkScherm(state);
  else if (route === '/jaren') $view.innerHTML = jarenScherm();
  else if (route.startsWith('/jaar/')) { state.jaar = +route.slice(6); $view.innerHTML = jaarScherm(); }
  else if (route === '/gegevens') $view.innerHTML = gegevensScherm();
  else $view.innerHTML = jaarScherm();
}

async function laad() {
  try { [state.fiches, state.werk, state.correcties] = await Promise.all([store.laad(state.user), store.laad(state.user, 'werk'), store.laadCorrecties(state.user)]); state.fout = null; }
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
      const items = state.imports.filter((x) => x.fiche || (x.werk && !x.ouder)).map((x) => (x.fiche
        ? { col: 'loonfiches', id: store.ficheId(x.fiche), data: x.fiche }
        : { col: 'werk', id: x.werk.maand, data: x.werk }));
      const n = await store.bewaar(state.user, items);
      state.imports = []; state.melding = `${n} ${n === 1 ? 'bestand' : 'bestanden'} opgeslagen.`;
      await laad();
    } catch (err) { state.melding = 'Opslaan mislukt: ' + err.message; }
    state.bezig = false; render();
  } else if (t.dataset.wis) { state.wis = t.dataset.wis; render(); }
  else if (t.hasAttribute('data-wis-nee')) { state.wis = null; state.wisWerk = null; render(); }
  else if (t.dataset.wiscorr) {
    const [van, tot] = t.dataset.wiscorr.split('|');
    const lijst = (state.correcties || []).filter((c) => !(c.van === van && c.tot === tot));
    try { await store.bewaarCorrecties(state.user, lijst); state.correcties = lijst; render(); }
    catch (err) { state.fout = 'Correctie verwijderen mislukt: ' + err.message; render(); }
  }
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

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'correctie') return;
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target).entries());
  if (!fd.van || !fd.tot) return;
  const [van, tot] = fd.van <= fd.tot ? [fd.van, fd.tot] : [fd.tot, fd.van];
  const lijst = (state.correcties || []).filter((c) => c.tot < van || c.van > tot); // overlappende vervangen
  lijst.push({ van, tot, groep: fd.groep });
  try { await store.bewaarCorrecties(state.user, lijst); state.correcties = lijst; render(); }
  catch (err) { state.fout = 'Correctie opslaan mislukt: ' + err.message; render(); }
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
        const oud = state.werk.find((w) => w.id === werk.maand);
        state.imports.push({ naam: b.name, werk, bestaat: bestaandWerk.has(werk.maand), ouder: oud && (oud.situatie || '') > werk.situatie });
      } else {
        const fiche = parseLoonfiche(paginas);
        fiche.ingelezen = new Date().toISOString();
        state.imports.push({ naam: b.name, fiche, bestaat: bestaand.has(store.ficheId(fiche)) });
      }
    } catch (err) { state.imports.push({ naam: b.name, fout: err.message }); }
  }
  // Van dezelfde maand kan er een time statement met een latere "situatie op" zijn: alleen de laatste telt.
  for (const x of state.imports) {
    if (!x.werk || x.ouder) continue;
    const later = state.imports.find((y) => y !== x && y.werk && y.werk.maand === x.werk.maand && y.werk.situatie > x.werk.situatie);
    if (later) x.ouder = true;
  }
  for (const x of state.imports) {
    if (!x.werk || x.ouder) continue;
    const zelfde = state.imports.filter((y) => y.werk && !y.ouder && y.werk.maand === x.werk.maand);
    if (zelfde.length > 1 && zelfde[0] !== x) x.ouder = true; // exact dubbel bestand
  }
  const sleutel = (x) => (x.fiche ? `${x.fiche.maand}a` : x.werk ? `${x.werk.maand}b${x.werk.situatie}` : '');
  state.imports.sort((a, b) => sleutel(a).localeCompare(sleutel(b)));
  state.melding = null; render();
});

// Tooltip bij aanraken of muis (data-tip)
const tip = document.getElementById('tip');
function toonTip(e) {
  const el = e.target.closest?.('[data-tip]');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
  const y = e.clientY - tip.offsetHeight - 14;
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = (y < 8 ? e.clientY + 18 : y) + 'px';
}
document.addEventListener('pointermove', toonTip);
document.addEventListener('pointerdown', toonTip);
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (!el) return;
  const r = el.getBoundingClientRect();
  toonTip({ target: el, clientX: r.left + r.width / 2, clientY: r.top });
});
document.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

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
