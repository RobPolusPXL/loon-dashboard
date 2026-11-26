import { kolommen, balken, GROEP_KLEUR, GROEP_VOLGORDE, KLEUR } from './charts.js';
// Tabblad Werk: overzichten uit de time statements.

const MND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MAAND_VOL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const WD = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const WD_VOL = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const maandVol = (ym) => `${MAAND_VOL[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const maandKort = (ym) => `${MND[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const uren = (min) => (min == null ? '—' : `${min < 0 ? '−' : ''}${Math.floor(Math.abs(min) / 60)}:${String(Math.abs(min) % 60).padStart(2, '0')}`);
const n = (v) => (v == null ? '—' : String(v));
const datumBE = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

// Afwezigheden indelen op basis van de omschrijving in de legende van de time statement.
// Volgorde telt: "arbeidsongeval" vóór de rest, "inhaalrust" is rust en geen verlof.
export const GROEPEN = [
  { k: 'ongeval', naam: 'Arbeidsongeval', re: /ongeval/i },
  { k: 'ziekte', naam: 'Ziekte', re: /ziek/i },
  { k: 'loopbaan', naam: 'Loopbaanonderbreking', re: /loopbaan|tijdskrediet|ouderschap/i },
  { k: 'rust', naam: 'Rust', re: /rust|compensatie|recup/i },
  { k: 'feestdag', naam: 'Feestdag', re: /feestdag/i },
  { k: 'verlof', naam: 'Verlof', re: /verlof|vakantie/i },
  { k: 'andere', naam: 'Overig', re: /.*/ },
];
// Codes waarvan de omschrijving de groep niet verraadt (UB1 = gewaarborgd maandloon bij ziekte).
const VASTE_CODES = { UB1: 'ziekte' };
export const groepVan = (code, codes) => VASTE_CODES[code]
  ?? (GROEPEN.find((g) => codes[code] && g.re.test(codes[code])) ?? GROEPEN[GROEPEN.length - 1]).k;
// Groep van een dag: de code met de meeste uren
function dagGroep(d, codes) {
  if (!d.afwCodes?.length) return d.afwezig ? 'andere' : null;
  const c = [...d.afwCodes].sort((a, b) => (b.min ?? 0) - (a.min ?? 0))[0];
  return groepVan(c.code, codes);
}

// Belgische wettelijke feestdagen. Die staan op de time statement zonder afwezigheidscode
// (alleen de vrije wettelijke feestdagen hebben er een, U24).
function pasen(j) { // anonieme Gregoriaanse berekening
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(Date.UTC(j, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
}
const feestCache = {};
export function feestdagNaam(iso) {
  const j = +iso.slice(0, 4);
  if (!feestCache[j]) {
    const p = pasen(j), plus = (n) => new Date(p.getTime() + n * 864e5).toISOString().slice(0, 10);
    feestCache[j] = {
      [`${j}-01-01`]: 'Nieuwjaar', [plus(1)]: 'Paasmaandag', [`${j}-05-01`]: 'Dag van de Arbeid', [plus(39)]: 'O.L.H. Hemelvaart',
      [plus(50)]: 'Pinkstermaandag', [`${j}-07-21`]: 'Nationale feestdag', [`${j}-08-15`]: 'O.L.V. Hemelvaart',
      [`${j}-11-01`]: 'Allerheiligen', [`${j}-11-11`]: 'Wapenstilstand', [`${j}-12-25`]: 'Kerstmis',
    };
  }
  return feestCache[j][iso] ?? null;
}
// Niet gewerkt, geen code, wel een werkdag volgens het rooster, en een wettelijke feestdag
const isGepland = (d) => (typeof d.gepland === 'number' && d.gepland > 0) || (typeof d.contract === 'number' && d.contract > 0);
const wettelijkeFeestdag = (d) => (!gewerkt(d) && !d.afwezig && isGepland(d) ? feestdagNaam(d.d) : null);
// Groep van een hele afwezige dag (of null)
function afwezigGroep(d, codes) {
  if (d.afwezig && !gewerkt(d)) return dagGroep(d, codes);
  return wettelijkeFeestdag(d) ? 'feestdag' : null;
}

const afwTekst = (d, codes) => (d.afwCodes?.length
  ? d.afwCodes.map((c) => `${codes[c.code] ?? c.code} (${uren(c.min)})`).join(', ')
  : `afwezig (${d.afwezig})`);

// Afwezigheden per code optellen
function perGroep(maanden, codes) {
  const t = {};
  for (const m of maanden) for (const d of m.dagen) for (const c of d.afwCodes || []) {
    const g = groepVan(c.code, codes);
    t[g] ||= { dagen: 0, min: 0, codes: {} };
    t[g].dagen++; t[g].min += c.min ?? 0;
    t[g].codes[c.code] ||= { dagen: 0, min: 0 };
    t[g].codes[c.code].dagen++; t[g].codes[c.code].min += c.min ?? 0;
  }
  for (const m of maanden) for (const d of m.dagen) {
    if (!wettelijkeFeestdag(d)) continue;
    const min = typeof d.gepland === 'number' ? d.gepland : 0;
    t.feestdag ||= { dagen: 0, min: 0, codes: {} };
    t.feestdag.dagen++; t.feestdag.min += min;
    t.feestdag.codes['—'] ||= { dagen: 0, min: 0 };
    t.feestdag.codes['—'].dagen++; t.feestdag.codes['—'].min += min;
  }
  return GROEPEN.filter((g) => t[g.k]).map((g) => ({ ...g, ...t[g.k] }));
}

const gewerkt = (d) => typeof d.gepresteerd === 'number' && d.gepresteerd > 0;

function maandCijfers(m) {
  const dagen = m.dagen;
  const tel = (k, w) => dagen.filter((d) => (w ? d[k] === w : d[k] != null)).length;
  return {
    dagen: dagen.filter(gewerkt).length,
    uren: m.totalen.gepresteerd ?? dagen.reduce((a, d) => a + (gewerkt(d) ? d.gepresteerd : 0), 0),
    meer: m.totalen.meer ?? dagen.reduce((a, d) => a + (typeof d.meer === 'number' ? d.meer : 0), 0),
    meerDagen: dagen.filter((d) => typeof d.meer === 'number' && d.meer > 0).length,
    nacht: tel('nacht'), zesde: tel('zesde'), arab: tel('arab'),
    s: tel('uitblijven', 'S'), l: tel('uitblijven', 'L'),
    afwezig: dagen.filter((d) => d.afwezig).length,
    cheques: m.maaltijdcheques,
  };
}

const som = (lijst, k) => lijst.reduce((a, x) => a + (x[k] ?? 0), 0);

// Jaaroverzicht: 12 maandkalenders (ma–zo) met een gekleurd bolletje per afwezigheid.
function kalender(maanden, codes, jaar) {
  const perYm = Object.fromEntries(maanden.map((m) => [m.maand, m]));
  const gebruikt = new Set();
  let meer = false;
  const maandBlok = (i) => {
    const ym = `${jaar}-${String(i + 1).padStart(2, '0')}`;
    const m = perYm[ym];
    const aantal = new Date(jaar, i + 1, 0).getDate();
    const start = (new Date(jaar, i, 1).getDay() + 6) % 7; // ma = 0
    const cellen = [];
    for (let j = 0; j < start; j++) cellen.push('<span></span>');
    for (let dag = 1; dag <= aantal; dag++) {
      const wd = (start + dag - 1) % 7;
      const d = m?.dagen.find((x) => +x.d.slice(8, 10) === dag);
      const datum = `${WD_VOL[wd]} ${dag} ${MND[i]}`;
      let klasse = 'k-leeg', tip = `${datum}: geen time statement`;
      if (d) {
        const gepland = typeof d.gepland === 'number' && d.gepland > 0;
        if (d.afwezig && !gewerkt(d)) { klasse = `k-${dagGroep(d, codes)}`; tip = `${datum}: ${afwTekst(d, codes)}`; }
        else if (gewerkt(d)) {
          const m2 = typeof d.meer === 'number' && d.meer > 0;
          klasse = m2 ? 'k-werk k-meer' : 'k-werk';
          if (m2) meer = true;
          const extra = [d.afwezig ? afwTekst(d, codes) : '', m2 ? `meerprestatie ${uren(d.meer)}` : '', d.nacht ? 'nachttoelage' : '', d.zesde ? '6de dag' : ''].filter(Boolean).join(', ');
          tip = `${datum}: ${uren(d.gepresteerd)} gewerkt${extra ? `, ${extra}` : ''}`;
        } else if (wettelijkeFeestdag(d)) { klasse = 'k-feestdag'; tip = `${datum}: ${wettelijkeFeestdag(d)} (wettelijke feestdag)`; }
        else if (gepland) { klasse = 'k-niet'; tip = `${datum}: niet gewerkt, geen afwezigheidscode`; }
        else { klasse = 'k-vrij'; tip = `${datum}: rustdag`; }
        if (!['k-werk', 'k-werk k-meer', 'k-vrij', 'k-leeg'].includes(klasse)) gebruikt.add(klasse.slice(2));
      }
      cellen.push(`<span class="d ${klasse}" title="${esc(tip)}">${dag}</span>`);
    }
    return `<a class="mk${m ? '' : ' zonder'}"${m ? ` href="#/werk/${ym}"` : ''}><b>${MAAND_VOL[i]}</b>
      <div class="mk-rooster">${['m', 'd', 'w', 'd', 'v', 'z', 'z'].map((x) => `<i>${x}</i>`).join('')}${cellen.join('')}</div></a>`;
  };
  const blokken = MND.map((_, i) => maandBlok(i)).join('');
  const leg = [
    ...GROEPEN.filter((g) => gebruikt.has(g.k)).map((g) => `<span><i class="d k-${g.k}"></i>${g.naam}</span>`),
    meer ? '<span><i class="d k-werk k-meer"></i>Meerprestatie</span>' : '',
    '<span><i class="d k-vrij"></i>Rustdag</span>',
    gebruikt.has('niet') ? '<span><i class="d k-niet"></i>Niet gewerkt, zonder code</span>' : '',
  ].join('');
  return `<div class="jaarkal">${blokken}</div><p class="legende">${leg}</p>`;
}

function groepDagenJaar(maanden, codes) {
  const g = {};
  for (const m of maanden) for (const d of m.dagen) { const k = afwezigGroep(d, codes); if (k) g[k] = (g[k] ?? 0) + 1; }
  return g;
}

function perWeekdag(maanden) {
  const tel = Array(7).fill(0);
  for (const m of maanden) for (const d of m.dagen) if (gewerkt(d)) tel[d.wd]++;
  const max = Math.max(...tel, 1);
  return `<div class="balken wd">${tel.map((t, i) => `<div><span>${WD[i]}</span><i style="width:${(t / max * 100).toFixed(1)}%"></i><b>${t}</b></div>`).join('')}</div>`;
}

export function werkScherm(state) {
  const alles = state.werk || [];
  if (!alles.length) {
    return `<section class="leeg"><h1>Werk</h1><p>Nog geen time statements ingelezen.</p><a class="knop primair" href="#/gegevens">Time statements inlezen</a></section>`;
  }
  const jaren = [...new Set(alles.map((m) => +m.maand.slice(0, 4)))].sort();
  const jaar = jaren.includes(state.werkJaar) ? state.werkJaar : jaren[jaren.length - 1];
  const maanden = alles.filter((m) => +m.maand.slice(0, 4) === jaar).sort((a, b) => a.maand.localeCompare(b.maand));
  const codes = Object.assign({}, ...[...alles].sort((a, b) => (a.situatie || '').localeCompare(b.situatie || '')).map((m) => m.codes || {}));
  const c = maanden.map((m) => {
    const g = {};
    for (const d of m.dagen) { const k = afwezigGroep(d, codes); if (k) g[k] = (g[k] ?? 0) + 1; }
    return { ym: m.maand, ...maandCijfers(m), g };
  });
  const sorteer = (lijst) => GROEP_VOLGORDE.map((k) => GROEPEN.find((g) => g.k === k)).filter((g) => lijst.has(g.k));
  const groepenJaar = sorteer(new Set(c.flatMap((x) => Object.keys(x.g))));
  const groepenAlle = sorteer(new Set(jaren.flatMap((j) => Object.keys(groepDagenJaar(alles.filter((m) => +m.maand.slice(0, 4) === j), codes)))));
  const perMaand = MND.map((_, i) => c.find((x) => +x.ym.slice(5, 7) === i + 1) ?? null);
  const laatste = [...alles].filter((m) => m.verlof?.length).sort((a, b) => (a.situatie || '').localeCompare(b.situatie || '')).pop();
  const ontbreekt = MND.filter((_, i) => !maanden.some((m) => +m.maand.slice(5, 7) === i + 1) && (jaar < new Date().getFullYear() || i < new Date().getMonth()));

  return `
    <header class="kop"><h1>Werk</h1>
      ${jaren.length > 1 ? `<div class="jaren" role="group" aria-label="Jaar">${jaren.map((j) => `<button type="button" data-werkjaar="${j}" class="${j === jaar ? 'aan' : ''}" aria-pressed="${j === jaar}">${j}</button>`).join('')}</div>` : `<p class="sub">${jaar}</p>`}
    </header>
    <dl class="kern">
      <div><dt>Gewerkte dagen</dt><dd>${som(c, 'dagen')}</dd></div>
      <div><dt>Gepresteerde uren</dt><dd>${uren(som(c, 'uren'))}</dd></div>
      <div><dt>Meerprestaties</dt><dd>${uren(som(c, 'meer'))} <small>${som(c, 'meerDagen')} d</small></dd></div>
      <div><dt>Nachttoelage</dt><dd>${som(c, 'nacht')} <small>dagen</small></dd></div>
      <div><dt>6de dag</dt><dd>${som(c, 'zesde')} <small>dagen</small></dd></div>
      <div><dt>Afwezig</dt><dd>${som(c, 'afwezig')} <small>dagen</small></dd></div>
    </dl>
    ${kalender(maanden, codes, jaar)}
    ${ontbreekt.length ? `<p class="noot">Geen time statement voor ${ontbreekt.join(', ')} ${jaar}.</p>` : ''}
    <h2>Dagen per maand</h2>
    ${kolommen(MND, [
      { naam: 'Gewerkt', kleur: KLEUR.werk, waarden: perMaand.map((x) => (x ? x.dagen : null)) },
      ...groepenJaar.map((g) => ({ naam: g.naam, kleur: GROEP_KLEUR[g.k], waarden: perMaand.map((x) => (x ? x.g[g.k] ?? 0 : null)) })),
    ], { fmt: (v) => `${v} ${v === 1 ? 'dag' : 'dagen'}`, asFmt: (v) => String(v), hrefs: perMaand.map((x) => (x ? `#/werk/${x.ym}` : null)), tipKop: MAAND_VOL.map((m) => `${m} ${jaar}`) })}
    <h2>Uren per maand</h2>
    ${kolommen(MND, [
      { naam: 'Gewone uren', kleur: KLEUR.werk, waarden: perMaand.map((x) => (x ? (x.uren - x.meer) / 60 : null)) },
      { naam: 'Meerprestaties', kleur: KLEUR.meer, waarden: perMaand.map((x) => (x ? x.meer / 60 : null)) },
    ], { fmt: (v) => uren(Math.round(v * 60)), asFmt: (v) => `${v} u`, hrefs: perMaand.map((x) => (x ? `#/werk/${x.ym}` : null)), tipKop: MAAND_VOL.map((m) => `${m} ${jaar}`) })}
    ${(() => { const pg = perGroep(maanden, codes); return pg.length ? `<h2>Afwezigheden in ${jaar}</h2>
      <table class="lijst">${pg.map((g) => `<tr class="sectie"><th><i class="stip" style="background:${GROEP_KLEUR[g.k]}"></i>${g.naam}</th><td>${g.dagen} ${g.dagen === 1 ? 'dag' : 'dagen'} · ${uren(g.min)}</td></tr>
        ${Object.entries(g.codes).sort((a, b) => b[1].min - a[1].min).map(([code, v]) => `<tr class="lijn"><th><span class="code">${esc(code)}</span>${esc(code === '—' ? 'Wettelijke feestdag (zonder code op de time statement)' : codes[code] ?? 'geen omschrijving op de time statement')}</th><td>${v.dagen} · ${uren(v.min)}</td></tr>`).join('')}`).join('')}</table>` : ''; })()}
    ${jaren.length > 1 ? `<h2>Afwezigheden per jaar</h2>
      ${balken(jaren.map((j) => ({ label: String(j), waarden: groepDagenJaar(alles.filter((m) => +m.maand.slice(0, 4) === j), codes) })),
        groepenAlle.map((g) => ({ k: g.k, naam: g.naam, kleur: GROEP_KLEUR[g.k] })), { fmt: (v) => `${v} ${v === 1 ? 'dag' : 'dagen'}` })}` : ''}
    <h2>Gewerkt per weekdag</h2>
    ${perWeekdag(maanden)}
    <h2>Per maand</h2>
    <div class="scroll"><table class="tabel">
      <thead><tr><th>Maand</th><th>Gewerkt</th><th>Uren</th><th>Meer</th><th>Nacht</th><th>6de dag</th><th>Afwezig</th></tr></thead>
      <tbody>${c.map((x) => `<tr data-href="#/werk/${x.ym}"><th><a href="#/werk/${x.ym}">${maandKort(x.ym)}</a></th><td>${x.dagen}</td><td>${uren(x.uren)}</td>
        <td>${x.meer ? uren(x.meer) : ''}</td><td>${x.nacht || ''}</td><td>${x.zesde || ''}</td>
        <td class="chips">${groepenJaar.filter((g) => x.g[g.k]).map((g) => `<span title="${g.naam}"><i style="background:${GROEP_KLEUR[g.k]}"></i>${x.g[g.k]}</span>`).join('')}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Totaal</th><td>${som(c, 'dagen')}</td><td>${uren(som(c, 'uren'))}</td><td>${uren(som(c, 'meer'))}</td><td>${som(c, 'nacht')}</td><td>${som(c, 'zesde')}</td>
        <td class="chips">${groepenJaar.map((g) => `<span title="${g.naam}"><i style="background:${GROEP_KLEUR[g.k]}"></i>${c.reduce((a, x) => a + (x.g[g.k] ?? 0), 0)}</span>`).join('')}</td></tr></tfoot>
    </table></div>
    <p class="noot">Afwezig: hele dagen per groep. ARAB en toelage uitblijven ongevallen staan per dag in de maanddetails.</p>
    ${laatste?.verlof?.length ? `<h2>Verlof op ${datumBE(laatste.situatie)}</h2>
      <div class="scroll"><table class="tabel"><thead><tr><th>Soort</th><th>Recht op</th><th>Opgenomen</th><th>Aangevraagd</th><th>Saldo</th></tr></thead>
      <tbody>${laatste.verlof.map((v) => { const f = v.eenheid === 'uren' ? uren : n; return `<tr><th>${esc(v.naam)} <small>(${v.eenheid})</small></th><td>${f(v.recht)}</td><td>${f(v.opgenomen)}</td><td>${f(v.aangevraagd)}</td><td><b>${f(v.saldo)}</b></td></tr>`; }).join('')}
      ${(laatste.rust || []).map((r) => `<tr><th>${esc(r.naam)} <small>(tot ${datumBE(r.einddatum)})</small></th><td></td><td></td><td></td><td><b>${r.eenheid === 'uren' ? uren(r.hoeveelheid) : n(r.hoeveelheid)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}`;
}

export function werkMaandScherm(state, ym) {
  const m = (state.werk || []).find((x) => x.maand === ym);
  if (!m) return `<p class="noot">Geen time statement voor deze maand. <a href="#/werk">Terug</a></p>`;
  const c = maandCijfers(m);
  const cel = (v) => (v == null ? '' : esc(v));
  return `
    <header class="kop rij"><a class="terug" href="#/werk" data-werkjaar="${ym.slice(0, 4)}" aria-label="Terug">←</a><h1>${maandVol(ym)}</h1></header>
    <dl class="kern">
      <div><dt>Gewerkte dagen</dt><dd>${c.dagen}</dd></div>
      <div><dt>Gepresteerde uren</dt><dd>${uren(c.uren)}</dd></div>
      <div><dt>Meerprestaties</dt><dd>${uren(c.meer)}</dd></div>
      <div><dt>Maaltijdcheques</dt><dd>${n(c.cheques)}</dd></div>
    </dl>
    ${m.controles?.length ? `<p class="let-op">Bij het inlezen klopten deze totalen niet: ${m.controles.map(esc).join('; ')}.</p>` : ''}
    <div class="scroll"><table class="tabel dagen">
      <thead><tr><th>Dag</th><th>Gepland</th><th>Gepresteerd</th><th>Meer</th><th>ARAB</th><th>Uitbl.</th><th>Nacht</th><th>6de dag</th><th>Afwezig</th></tr></thead>
      <tbody>${m.dagen.map((d) => `<tr class="${gewerkt(d) ? '' : 'vrij'}${d.wd >= 5 ? ' weekend' : ''}"><th>${WD[d.wd]} ${+d.d.slice(8, 10)}</th>
        <td>${typeof d.gepland === 'number' ? uren(d.gepland) : cel(d.gepland)}</td><td>${typeof d.gepresteerd === 'number' ? uren(d.gepresteerd) : cel(d.gepresteerd)}</td>
        <td>${typeof d.meer === 'number' ? uren(d.meer) : cel(d.meer)}</td><td>${cel(d.arab)}</td><td>${cel(d.uitblijven)}</td><td>${cel(d.nacht)}</td><td>${cel(d.zesde)}</td><td>${d.afwezig ? esc(afwTekst(d, m.codes || {})) : wettelijkeFeestdag(d) ? esc(`${wettelijkeFeestdag(d)} (wettelijke feestdag)`) : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Totaal</th><td>${uren(m.totalen.gepland)}</td><td>${uren(m.totalen.gepresteerd)}</td><td>${uren(m.totalen.meer)}</td><td colspan="5"></td></tr></tfoot>
    </table></div>
    <p class="acties">${state.wisWerk === ym
      ? `Time statement van ${maandVol(ym)} verwijderen? <button type="button" class="link gevaar" data-wiswerk-ja="${ym}">Ja, verwijderen</button> <button type="button" class="link" data-wis-nee>Annuleren</button>`
      : `<button type="button" class="link" data-wiswerk="${ym}">Time statement verwijderen</button>`}</p>`;
}
