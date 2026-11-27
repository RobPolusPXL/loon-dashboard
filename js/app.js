import * as store from './store.js';
import { leesItems, parseLoonfiche } from './loonfiche.js';
import { isTimestatement, parseTimestatement } from './timestatement.js';
import { werkScherm, werkMaandScherm } from './werk.js';
import { kolommen, lijn as lijnGrafiek, balken, verdeelbalk, KLEUR } from './charts.js';
import { tegels, kaart, raster, terugKnop } from './ui.js';

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
// Maaltijdcheques: het aantal van de fiche; ontbreekt dat (oudere fiches die vóór een aanpassing ingelezen zijn),
// dan uitgerekend uit je eigen bijdrage (4MCO: € 1,09 of vroeger € 1,34 per cheque), anders uit de time statement.
const BIJDRAGE_PER_CHEQUE = [1.09, 1.34, 1.00];
function cheques(f) {
  if (f.maaltijdcheques != null) return f.maaltijdcheques;
  const l = f.secties.flatMap((x) => x.lijnen).find((x) => x.code === '4MCO' || /Maaltijd/i.test(x.omschrijving));
  if (l && l.bedrag < 0) {
    for (const r of BIJDRAGE_PER_CHEQUE) {
      const n = -l.bedrag / r;
      if (n >= 1 && Math.abs(n - Math.round(n)) < 0.02) return Math.round(n);
    }
  }
  return state.werk?.find((w) => w.maand === f.maand)?.maaltijdcheques ?? null;
}

// Waarde van een cheque: van de fiche zelf, anders de dichtstbijzijnde fiche waarop ze staat,
// anders € 8 (de waarde op alle fiches van 2017–2025 die gecontroleerd zijn). eigen: je bijdrage (4MCO) op de fiche.
const CHEQUE_STANDAARD = 8;
function chequeWaarde(f) {
  if (f.chequeWaarde != null) return { waarde: f.chequeWaarde, aangenomen: false };
  const met = state.fiches.filter((x) => x.chequeWaarde != null);
  if (met.length) {
    const best = [...met].sort((a, b) => Math.abs(maandIndex(a.maand) - maandIndex(f.maand)) - Math.abs(maandIndex(b.maand) - maandIndex(f.maand)))[0];
    return { waarde: best.chequeWaarde, aangenomen: true };
  }
  return { waarde: CHEQUE_STANDAARD, aangenomen: true };
}
const maandIndex = (ym) => +ym.slice(0, 4) * 12 + +ym.slice(5, 7);
function chequeGeld(f) {
  const n = cheques(f);
  if (!n) return { n: n ?? null, waarde: 0, eigen: 0, voordeel: 0, aangenomen: false };
  const { waarde, aangenomen } = chequeWaarde(f);
  const l = f.secties.flatMap((x) => x.lijnen).find((x) => x.code === '4MCO' || /Maaltijd/i.test(x.omschrijving));
  const eigen = l && l.bedrag < 0 ? -l.bedrag : n * (f.chequeBijdrage ?? 1.09);
  const bruto = Math.round(n * waarde * 100) / 100;
  return { n, waarde: bruto, eigen: Math.round(eigen * 100) / 100, voordeel: Math.round((bruto - eigen) * 100) / 100, aangenomen };
}

// Som over een lijst fiches, elke maand maar één keer (twee fiches in één maand = één keer dagen)
const somDagen = (lijst) => som([...new Map(lijst.map((f) => [f.maand, f])).values()], gewerkteDagen);
const gewerkteUren = (f) => prestatie(f, 'uren', /^Gewerkte uren/i);
const loopbaanDagen = (f) => prestatie(f, 'dagen', /Loopbaan/i);
const lijn = (f, re) => som(f.secties.flatMap((s) => s.lijnen).filter((l) => re.test(l.omschrijving)), (l) => l.bedrag);

const $view = document.getElementById('view');
const state = { user: null, gestart: false, fiches: null, werk: [], fout: null, imports: [], bezig: false, melding: null, jaar: null, wis: null };

// ---------- Jaar ----------
const jaarChips = (jaren, jaar, attr = 'data-jaar') => (jaren.length > 1
  ? `<div class="jaren" role="group" aria-label="Jaar">${jaren.map((j) => `<button type="button" ${attr}="${j}" class="${j === jaar ? 'aan' : ''}" aria-pressed="${j === jaar}">${j}</button>`).join('')}</div>` : '');

function jarenVan(fiches) { return [...new Set(fiches.map((f) => +f.maand.slice(0, 4)))].sort(); }

// Afgeleide bedragen per fiche
const brutoTot = (f) => (f.totalen.bruto ?? 0) + (f.totalen.brutoNiet ?? 0);
const verg = (f) => f.totalen.vergoedingen ?? 0;
const nettoLoon = (f) => (f.totalen.netto ?? 0) - verg(f); // nettoloon zonder vergoedingen
const regul = (f) => f.totalen.regularisatie ?? 0;
// Vergoedingen opgesplitst: fietsvergoeding apart, de rest (indien aanwezig) als andere vergoedingen
const fiets = (f) => (f.secties.find((x) => x.sleutel === 'vergoedingen')?.lijnen || []).filter((l) => /Fietsvergoeding/i.test(l.omschrijving)).reduce((a, l) => a + l.bedrag, 0);
const andereVerg = (f) => Math.round((verg(f) - fiets(f)) * 100) / 100;
// Reeksen voor "uitbetaald": andere vergoedingen alleen als ze voorkomen
const uitReeksen = (waarde) => [
  { naam: 'Netto loon', kleur: KLEUR.netto, waarden: waarde(nettoLoon) },
  { naam: 'Fietsvergoeding', kleur: KLEUR.verg, waarden: waarde(fiets) },
  { naam: 'Andere vergoedingen', kleur: KLEUR.andere, waarden: waarde(andereVerg) },
  { naam: 'Regularisatie', kleur: KLEUR.regul, waarden: waarde(regul) },
].filter((r) => r.naam === 'Netto loon' || r.waarden.some((v) => v && Math.abs(v) >= 0.01));
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
  const grafiek = kolommen(MND, uitReeksen(reeks), { fmt: eur, asFmt: eurK, hrefs: perMaand.map((l) => (l.length ? `#/fiche/${l[0].id}` : null)), tipKop: MAAND_VOL.map((m) => `${m} ${jaar}`) });

  const verdeel = verdeelbalk([
    { naam: 'Netto loon', v: som(lijst, nettoLoon) ?? 0, kleur: KLEUR.netto },
    { naam: 'RSZ', v: -(som(lijst, (f) => f.totalen.sociale) ?? 0), kleur: KLEUR.rsz },
    { naam: 'Bedrijfsvoorheffing', v: -(som(lijst, (f) => f.totalen.voorheffing) ?? 0), kleur: KLEUR.bv },
    { naam: 'Inhoudingen', v: -(som(lijst, (f) => f.totalen.inhoudingen) ?? 0), kleur: KLEUR.inh },
  ], { fmt: eur0 });

  const tabel = `<div class="scroll"><table class="tabel">
      <thead><tr><th>Maand</th><th>Bruto</th><th>Ingehouden</th><th>Vergoedingen</th><th>Uitbetaald</th><th>Dagen</th></tr></thead>
      <tbody>${lijst.map((f) => `<tr data-href="#/fiche/${esc(f.id)}">
        <th><a href="#/fiche/${esc(f.id)}">${maandKort(f.maand)}</a>${f.controles?.length ? ' <span class="slecht" title="Totalen kloppen niet">•</span>' : ''}</th>
        <td>${eur0(brutoTot(f))}</td><td>${eur0(ingehouden(f))}</td><td>${verg(f) ? eur0(verg(f)) : ''}</td>
        <td><b>${eur(uitbetaald(f))}</b>${regul(f) ? `<small>incl. ${eur0(regul(f))} regularisatie</small>` : ''}</td><td>${getal(gewerkteDagen(f))}</td></tr>`).join('')}</tbody>
    </table></div>`;
  const nettoPct = som(lijst, brutoTot) ? Math.round((som(lijst, nettoLoon) / som(lijst, brutoTot)) * 100) : null;
  return `
    <header class="kop"><p class="sub">${nMaanden} ${nMaanden === 1 ? 'maand' : 'maanden'} ingelezen</p><h1>Loon ${jaar}</h1></header>
    ${jaarChips(jaren, jaar)}
    ${tegels([
      { label: 'Uitbetaald', waarde: eur0(uit), detail: `gemiddeld ${eur0(uit / nMaanden)} per maand`, kleur: KLEUR.netto, hoofd: true },
      { label: 'Bruto', waarde: eur0(som(lijst, brutoTot)), detail: nettoPct != null ? `${nettoPct}% blijft netto over` : '' },
      { label: 'Ingehouden', waarde: eur0(som(lijst, ingehouden)), detail: 'RSZ, voorheffing en inhoudingen', kleur: KLEUR.rsz },
      { label: 'Gewerkt', waarde: `${getal(somDagen(lijst))}<small>dagen</small>`, detail: `${getal(som(lijst, cheques))} maaltijdcheques`, href: '#/werk' },
    ])}
    ${raster(
      kaart('Uitbetaald per maand', grafiek + (ontbreekt.length ? `<p class="noot">Geen fiche voor ${ontbreekt.join(', ')} ${jaar}.</p>` : ''), { breed: true, sub: 'klik op een maand voor de fiche' }),
      kaart('Waar gaat je bruto naartoe', `<div class="groot">${eur0(som(lijst, brutoTot))}<small>bruto</small></div>${verdeel}`),
      kaart('Vergoedingen', `<div class="groot">${eur0(som(lijst, verg))}</div>
        <table class="lijst">${Object.entries(lijst.flatMap((f) => (f.secties.find((x) => x.sleutel === 'vergoedingen')?.lijnen || [])).reduce((a, l) => { a[l.omschrijving] = (a[l.omschrijving] ?? 0) + l.bedrag; return a; }, {}))
          .sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${eur0(v)}</td></tr>`).join('')}
          ${som(lijst, regul) ? `<tr><th>Regularisaties</th><td>${eur0(som(lijst, regul))}</td></tr>` : ''}</table>`),
      chequeKaart(lijst),
      kaart('Per maand', tabel, { breed: true }),
    )}`;
}

function chequeKaart(lijst) {
  const g = lijst.map(chequeGeld).filter((x) => x.n);
  if (!g.length) return '';
  const tot = (k) => g.reduce((a, x) => a + x[k], 0);
  const aangenomen = g.some((x) => x.aangenomen);
  return kaart('Maaltijdcheques', `<div class="groot">${eur0(tot('voordeel'))}<small>extra opbrengst</small></div>
    ${verdeelbalk([{ naam: 'Netto voordeel', v: tot('voordeel'), kleur: KLEUR.netto }, { naam: 'Eigen bijdrage', v: tot('eigen'), kleur: KLEUR.inh }], { fmt: eur })}
    <div class="scroll"><table class="tabel">
      <thead><tr><th>Maand</th><th>Cheques</th><th>Per cheque</th><th>Op je kaart</th><th>Eigen bijdrage</th><th>Voordeel</th></tr></thead>
      <tbody>${lijst.map((f) => ({ f, c: chequeGeld(f) })).filter((x) => x.c.n).map(({ f, c }) => `<tr data-href="#/fiche/${esc(f.id)}">
        <th>${maandKort(f.maand)}</th><td>${c.n}</td><td>${eur(c.waarde / c.n)}${c.aangenomen ? '*' : ''}</td><td>${eur(c.waarde)}</td><td>− ${eur(c.eigen)}</td><td><b>${eur(c.voordeel)}</b></td></tr>`).join('')}</tbody>
    </table></div>
    <table class="lijst">
      <tr><th>Aantal cheques</th><td>${f0(tot('n'))}</td></tr>
      <tr><th>Waarde op je kaart</th><td>${eur(tot('waarde'))}</td></tr>
      <tr><th>Eigen bijdrage (van je loon)</th><td>− ${eur(tot('eigen'))}</td></tr>
      <tr class="totaal"><th>Wat het je extra opbrengt</th><td>${eur(tot('voordeel'))}</td></tr>
    </table>
    ${aangenomen ? `<p class="noot">* Op die fiche staat de waarde per cheque niet. Daar rekent de app met de waarde van de dichtstbijzijnde fiche waarop ze wel staat.</p>` : ''}`, { breed: true });
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

  const uitPerJaar = kolommen(jl, uitReeksen((fn) => perJaar.map(({ l }) => som(l, fn))), { fmt: eur0, asFmt: eurK, tipExtra, hrefs: jaren.map((j) => `#/jaar/${j}`), topLabel: perJaar.map(({ l }) => eurK(som(l, uitbetaald))) });

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

  const totaal = som(fiches, uitbetaald);
  const volle = perJaar.filter(({ l }) => n(l) === 12);
  const besteJaar = [...perJaar].sort((a, b) => som(b.l, uitbetaald) - som(a.l, uitbetaald))[0];
  const laatsteIndex = [...fiches].sort((a, b) => b.maand.localeCompare(a.maand)).find((f) => f.gegevens?.index != null);
  const eersteIndex = [...fiches].sort((a, b) => a.maand.localeCompare(b.maand)).find((f) => f.gegevens?.index != null);
  return `
    <header class="kop"><p class="sub">${jaren[0]} – ${jaren[jaren.length - 1]} · ${fiches.length} fiches</p><h1>Per jaar</h1></header>
    ${tegels([
      { label: 'Uitbetaald in totaal', waarde: eurK(totaal), detail: `${jaren.length} jaar`, kleur: KLEUR.netto, hoofd: true },
      volle.length ? { label: 'Gemiddeld per vol jaar', waarde: eur0(som(volle.flatMap((x) => x.l), uitbetaald) / volle.length), detail: `${volle.length} volledige jaren` } : null,
      besteJaar ? { label: 'Hoogste jaar', waarde: String(besteJaar.j), detail: eur0(som(besteJaar.l, uitbetaald)), href: `#/jaar/${besteJaar.j}` } : null,
      laatsteIndex ? { label: 'Index', waarde: f2(laatsteIndex.gegevens.index), detail: eersteIndex && eersteIndex !== laatsteIndex ? `was ${f2(eersteIndex.gegevens.index)} in ${eersteIndex.maand.slice(0, 4)}` : '' } : null,
    ])}
    ${raster(
      kaart('Uitbetaald per jaar', uitPerJaar, { breed: true, sub: 'klik op een jaar' }),
      kaart('Netto loon per maand', nettoLijn + '<p class="noot">Zonder vergoedingen en regularisaties. Klik op een punt voor die fiche.</p>', { breed: true }),
      kaart('Van bruto naar netto', pct, { breed: true }),
      kaart('Gewerkte dagen', enkelL(somDagen, (v) => f0(v))),
      kaart('Maaltijdcheques', kolommen(jl, [
        { naam: 'Netto voordeel', kleur: KLEUR.netto, waarden: perJaar.map(({ l }) => som(l, (f) => chequeGeld(f).voordeel || null)) },
        { naam: 'Eigen bijdrage', kleur: KLEUR.inh, waarden: perJaar.map(({ l }) => som(l, (f) => chequeGeld(f).eigen || null)) },
      ], { fmt: eur0, asFmt: eurK, hoogte: 120, tipExtra: perJaar.map(({ l }) => `${f0(som(l, cheques) ?? 0)} cheques`), topLabel: perJaar.map(({ l }) => { const v = som(l, (f) => chequeGeld(f).voordeel || null); return v == null ? null : eurK(v); }) }), { sub: 'boven: wat het netto opbrengt' }),
      kaart('Fietsvergoeding', enkel((f) => lijn(f, /Fietsvergoeding/i), eurK, eur0)),
      kaart('Index', indexLijn),
      kaart('Overzicht', `<div class="scroll"><table class="tabel">
        <thead><tr><th>Jaar</th><th>Maanden</th><th>Bruto</th><th>Ingehouden</th><th>Uitbetaald</th><th>Dagen</th></tr></thead>
        <tbody>${perJaar.map(({ j, l }) => `<tr data-href="#/jaar/${j}"><th>${j}</th><td>${n(l)}</td><td>${eur0(som(l, brutoTot))}</td><td>${eur0(som(l, ingehouden))}</td>
          <td><b>${eur0(som(l, uitbetaald))}</b></td><td>${getal(somDagen(l))}</td></tr>`).join('')}</tbody>
      </table></div>`, { breed: true }),
    )}`;
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

  const brutoNaarNetto = `<table class="lijst">${secties(f.secties)}
      <tr class="totaal"><th>Nettoloon van de maand</th><td>${eur(f.totalen.netto)}</td></tr>
      ${f.totalen.regularisatie != null ? `<tr class="sectie"><th>Regularisatie</th><td>${eur(f.totalen.regularisatie)}</td></tr>` : ''}
      <tr class="totaal"><th>Totaal netto bedrag</th><td>${eur(f.totalen.totaal)}</td></tr>
    </table>`;
  return `
    <header class="kop rij">${terugKnop(`#/jaar/${f.maand.slice(0, 4)}`)}<div><p class="sub">Loonfiche</p><h1>${maandVol(f.maand)}</h1></div></header>
    ${tegels([
      { label: 'Uitbetaald', waarde: eur(uitbetaald(f)), kleur: KLEUR.netto, hoofd: true, detail: regul(f) ? `incl. ${eur(regul(f))} regularisatie` : '' },
      { label: 'Bruto', waarde: eur0(brutoTot(f)) },
      { label: 'Ingehouden', waarde: eur0(ingehouden(f)), kleur: KLEUR.rsz },
      { label: 'Gewerkt', waarde: `${getal(gewerkteDagen(f))}<small>dagen</small>`, detail: `${getal(cheques(f))} maaltijdcheques` },
    ])}
    ${f.controles?.length ? kaart('Totalen kloppen niet', `<p class="let-op-tekst">${f.controles.map(esc).join('; ')}. Vergelijk met de PDF.</p>`, { extra: 'let-op' }) : ''}
    ${raster(
      kaart('Van bruto naar netto', `${verdeelbalk([
        { naam: 'Netto loon', v: Math.max(0, nettoLoon(f)), kleur: KLEUR.netto }, { naam: 'RSZ', v: -(f.totalen.sociale ?? 0), kleur: KLEUR.rsz },
        { naam: 'Voorheffing', v: -(f.totalen.voorheffing ?? 0), kleur: KLEUR.bv }, { naam: 'Inhoudingen', v: -(f.totalen.inhoudingen ?? 0), kleur: KLEUR.inh },
      ], { fmt: eur })}${brutoNaarNetto}`),
      `<div class="stapel">${[
        f.herberekeningen?.length ? kaart('Herberekeningen', f.herberekeningen.map((h) => `
          <details><summary><span>${h.maand ? maandVol(h.maand) : 'Onbekende maand'}</span><b>${eur(h.totaal)}</b></summary>
            <table class="lijst">${secties(h.secties)}</table></details>`).join(''), { sub: `samen ${eur(regul(f))}` }) : '',
        prest.length ? kaart('Prestaties', `<table class="lijst">${prest.map(([p, s]) => `<tr><th><span class="code">${esc(p.code)}</span>${esc(p.omschrijving)}</th><td>${esc(p.tekst)} ${s === 'uren' ? 'u' : ''}</td></tr>`).join('')}</table>`) : '',
        gegevens.length ? kaart('Loongegevens', `<table class="lijst">${gegevens.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table>`) : '',
      ].join('')}</div>`,
    )}
    <p class="acties">${state.wis === f.id
      ? `Fiche van ${maandVol(f.maand)} verwijderen? <button type="button" class="link gevaar" data-wis-ja="${esc(f.id)}">Ja, verwijderen</button> <button type="button" class="link" data-wis-nee>Annuleren</button>`
      : `<button type="button" class="link" data-wis="${esc(f.id)}">Fiche verwijderen</button>`}</p>`;
}

// ---------- Gegevens ----------
function gegevensScherm() {
  const ok = state.imports.filter((x) => x.fiche || (x.werk && !x.ouder));
  const lijstImport = state.imports.length ? `<ul class="import">${state.imports.map((x) => x.fiche
      ? `<li><span>${maandVol(x.fiche.maand)}</span><span>Loonfiche</span><span>${eur(uitbetaald(x.fiche))}</span>${x.bestaat ? '<small>vervangt bestaande</small>' : ''}${x.fiche.controles.length ? `<small class="slecht">totalen kloppen niet: ${esc(x.fiche.controles.join('; '))}</small>` : ''}</li>`
      : x.werk
        ? `<li${x.ouder ? ' class="ouder"' : ''}><span>${maandVol(x.werk.maand)}</span><span>Time statement</span><span>situatie ${x.werk.situatie.split('-').reverse().join('/')}</span><span>${x.werk.dagen.filter((d) => d.gepresteerd > 0).length} dagen</span>${x.ouder ? '<small>overgeslagen: er is een recentere versie van deze maand</small>' : x.bestaat ? '<small>vervangt bestaande</small>' : ''}${x.werk.controles.length ? `<small class="slecht">totalen kloppen niet: ${esc(x.werk.controles.join('; '))}</small>` : ''}</li>`
        : `<li class="slecht"><span>${esc(x.naam)}</span><small>${esc(x.fout)}</small></li>`).join('')}</ul>
      ${ok.length ? `<button type="button" class="knop primair" id="opslaan"${state.bezig ? ' disabled' : ''}>${ok.length} ${ok.length === 1 ? 'bestand' : 'bestanden'} opslaan</button>` : ''}` : '';
  return `
    <header class="kop"><p class="sub">Aangemeld als ${esc(state.user.email || state.user.displayName)}</p><h1>Gegevens</h1></header>
    ${tegels([
      { label: 'Loonfiches', waarde: String(state.fiches.length), detail: state.fiches.length ? `${state.fiches.reduce((a, f) => (f.maand < a ? f.maand : a), '9999').slice(0, 4)} – ${state.fiches.reduce((a, f) => (f.maand > a ? f.maand : a), '0').slice(0, 4)}` : '', kleur: KLEUR.netto },
      { label: 'Time statements', waarde: String(state.werk.length), detail: state.werk.length ? `${state.werk.reduce((a, w) => (w.maand < a ? w.maand : a), '9999').slice(0, 4)} – ${state.werk.reduce((a, w) => (w.maand > a ? w.maand : a), '0').slice(0, 4)}` : '', kleur: KLEUR.verg },
    ])}
    ${raster(
      kaart('PDF\'s inlezen', `<p class="uitleg">Loonfiches, weddefiches en time statements uit bpost4me, door elkaar (ook oude fiches met de extensie .JPG). Ze worden in je browser gelezen; de PDF zelf wordt niet opgeslagen.
        Rijksregisternummer, IBAN, stamnummer en adres worden overgeslagen. Een bestand dat je opnieuw inleest, overschrijft de vorige versie.</p>
        <label class="knop primair">PDF's kiezen<input id="bestanden" type="file" accept="application/pdf,.pdf,.jpg,.jpeg,image/jpeg" multiple hidden></label>
        ${lijstImport}${state.melding ? `<p class="melding">${esc(state.melding)}</p>` : ''}`, { breed: true }),
      kaart('Exporteren', `<p class="uitleg">Alle fiches als CSV, één regel per fiche.</p>
        <button type="button" class="knop" id="export"${state.fiches.length ? '' : ' disabled'}>CSV downloaden</button>`),
      kaart('Account', `<p class="uitleg">Je gegevens staan in je eigen Firebase-database, alleen zichtbaar voor jou.</p>
        <button type="button" class="knop" id="afmelden">Afmelden</button>`),
    )}`;
}

function leeg() {
  return `<section class="leeg"><h2>Nog geen loonfiches</h2><p>Lees je loonfiches uit bpost4me in om je overzicht te zien.</p><a class="knop primair" href="#/gegevens">Loonfiches inlezen</a></section>`;
}

function loginScherm() {
  return `<section class="leeg login"><div class="logo" aria-hidden="true"><svg viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#161A21"/><rect x="16" y="34" width="8" height="14" rx="2" fill="#00a888"/><rect x="28" y="26" width="8" height="22" rx="2" fill="#9887ef"/><rect x="40" y="16" width="8" height="32" rx="2" fill="#338ced"/></svg></div>
    <h1>Loon</h1><p>Je loonfiches en werkdagen in één overzicht.</p>
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
    'gewerkte_dagen', 'gewerkte_uren', 'loopbaanonderbreking_dagen', 'maaltijdcheques', 'cheques_waarde', 'cheques_eigen_bijdrage', 'cheques_voordeel', 'fietsvergoeding', 'index', 'jaarwedde'];
  const n = (v) => (v == null ? '' : String(v).replace('.', ','));
  const rijen = [...state.fiches].sort((a, b) => a.maand.localeCompare(b.maand)).map((f) => [f.maand, f.totalen.bruto, f.totalen.sociale,
    f.totalen.belastbaar, f.totalen.voorheffing, f.totalen.inhoudingen, f.totalen.vergoedingen, f.totalen.netto, f.totalen.regularisatie,
    uitbetaald(f), gewerkteDagen(f), gewerkteUren(f), loopbaanDagen(f), cheques(f), chequeGeld(f).waarde, chequeGeld(f).eigen, chequeGeld(f).voordeel, lijn(f, /Fietsvergoeding/i),
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
  if (t.dataset.href && !e.target.closest('a')) {
    // Aanraakscherm: eerste tik toont de tooltip, tweede tik op hetzelfde element opent het
    if (laatsteAanwijzer === 'touch' && t.dataset.tip && tipDoel !== t) { tipDoel = t; return; }
    tipDoel = null;
    location.hash = t.dataset.href; return;
  }
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
let laatsteAanwijzer = 'mouse';
let tipDoel = null; // element waarvan de tooltip na een tik openstaat
document.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') toonTip(e); });
document.addEventListener('pointerdown', (e) => {
  laatsteAanwijzer = e.pointerType;
  if (!e.target.closest?.('[data-tip]')) tipDoel = null;
  toonTip(e);
});
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (!el) return;
  const r = el.getBoundingClientRect();
  toonTip({ target: el, clientX: r.left + r.width / 2, clientY: r.top });
});
document.addEventListener('scroll', () => { tip.hidden = true; tipDoel = null; }, { passive: true });

window.addEventListener('hashchange', () => { tip.hidden = true; tipDoel = null; state.wis = null; state.wisWerk = null; render(); window.scrollTo(0, 0); });

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
