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
  { k: 'verlof', naam: 'Verlof', re: /verlof|feestdag|vakantie/i },
  { k: 'andere', naam: 'Andere', re: /.*/ },
];
export const groepVan = (code, codes) => (GROEPEN.find((g) => codes[code] && g.re.test(codes[code])) ?? GROEPEN[GROEPEN.length - 1]).k;
// Groep van een dag: de code met de meeste uren
function dagGroep(d, codes) {
  if (!d.afwCodes?.length) return d.afwezig ? 'andere' : null;
  const c = [...d.afwCodes].sort((a, b) => (b.min ?? 0) - (a.min ?? 0))[0];
  return groepVan(c.code, codes);
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

function kalender(maanden, codes) {
  const perYm = Object.fromEntries(maanden.map((m) => [m.maand, m]));
  const gebruikt = new Set();
  for (const m of maanden) for (const d of m.dagen) {
    if (d.afwezig && !gewerkt(d)) gebruikt.add(dagGroep(d, codes));
    else if (!gewerkt(d) && typeof d.gepland === 'number' && d.gepland > 0) gebruikt.add('niet');
  }
  const jaar = maanden[0].maand.slice(0, 4);
  const rijen = MND.map((naam, i) => {
    const ym = `${jaar}-${String(i + 1).padStart(2, '0')}`;
    const m = perYm[ym];
    const aantal = new Date(+jaar, i + 1, 0).getDate();
    const cellen = Array.from({ length: 31 }, (_, j) => {
      if (j >= aantal) return '<i class="k-geen"></i>';
      const d = m?.dagen.find((x) => +x.d.slice(8, 10) === j + 1);
      const datum = `${j + 1} ${naam}`;
      if (!m || !d) return `<i class="k-leeg" title="${datum}: geen gegevens"></i>`;
      const wd = WD_VOL[d.wd];
      if (d.afwezig && !gewerkt(d)) return `<i class="k-${dagGroep(d, codes)}" title="${esc(`${wd} ${datum}: ${afwTekst(d, codes)}`)}"></i>`;
      if (!gewerkt(d)) {
        const gepland = typeof d.gepland === 'number' && d.gepland > 0;
        return `<i class="${gepland ? 'k-niet' : 'k-vrij'}" title="${esc(`${wd} ${datum}: ${gepland ? 'niet gewerkt, geen afwezigheidscode' : 'rustdag (geen uren gepland)'}`)}"></i>`;
      }
      const extra = [d.afwezig ? afwTekst(d, codes) : '', typeof d.meer === 'number' && d.meer > 0 ? `meerprestatie ${uren(d.meer)}` : '', d.nacht ? 'nachttoelage' : '', d.zesde ? '6de dag' : ''].filter(Boolean).join(', ');
      const klasse = typeof d.meer === 'number' && d.meer > 0 ? 'k-meer' : 'k-werk';
      return `<i class="${klasse}" style="opacity:${Math.min(1, 0.45 + d.gepresteerd / 480 * 0.55).toFixed(2)}" title="${esc(`${wd} ${datum}: ${uren(d.gepresteerd)} gewerkt${extra ? `, ${extra}` : ''}`)}"></i>`;
    }).join('');
    return `<a class="k-rij" ${m ? `href="#/werk/${ym}"` : ''}><span>${naam}</span><div class="k-cellen">${cellen}</div></a>`;
  }).join('');
  return `<div class="kalender">${rijen}<div class="k-rij k-as"><span></span><div class="k-cellen">${Array.from({ length: 31 }, (_, j) => `<b>${(j + 1) % 5 === 0 || j === 0 ? j + 1 : ''}</b>`).join('')}</div></div></div>
    <p class="legende"><span><i class="k-werk"></i>gewerkt</span><span><i class="k-meer"></i>meerprestatie</span>${GROEPEN.filter((g) => gebruikt.has(g.k)).map((g) => `<span><i class="k-${g.k}"></i>${g.naam.toLowerCase()}</span>`).join('')}<span><i class="k-vrij"></i>rustdag</span>${gebruikt.has('niet') ? '<span><i class="k-niet"></i>niet gewerkt, zonder code</span>' : ''}<span><i class="k-leeg"></i>geen time statement</span></p>`;
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
    for (const d of m.dagen) if (d.afwezig && !gewerkt(d)) { const k = dagGroep(d, codes); g[k] = (g[k] ?? 0) + 1; }
    return { ym: m.maand, ...maandCijfers(m), g };
  });
  const groepKol = GROEPEN.filter((gr) => c.some((x) => x.g[gr.k]));
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
    ${kalender(maanden, codes)}
    ${ontbreekt.length ? `<p class="noot">Geen time statement voor ${ontbreekt.join(', ')} ${jaar}.</p>` : ''}
    ${(() => { const pg = perGroep(maanden, codes); return pg.length ? `<h2>Afwezigheden</h2>
      <table class="lijst">${pg.map((g) => `<tr class="sectie"><th><i class="stip k-${g.k}"></i>${g.naam}</th><td>${g.dagen} ${g.dagen === 1 ? 'dag' : 'dagen'} · ${uren(g.min)}</td></tr>
        ${Object.entries(g.codes).sort((a, b) => b[1].min - a[1].min).map(([code, v]) => `<tr class="lijn"><th><span class="code">${esc(code)}</span>${esc(codes[code] ?? 'geen omschrijving op de time statement')}</th><td>${v.dagen} · ${uren(v.min)}</td></tr>`).join('')}`).join('')}</table>` : ''; })()}
    <h2>Gewerkt per weekdag</h2>
    ${perWeekdag(maanden)}
    <h2>Per maand</h2>
    <div class="scroll"><table class="tabel">
      <thead><tr><th>Maand</th><th>Dagen</th><th>Uren</th><th>Meer</th><th>Nacht</th><th>6de dag</th><th>ARAB</th><th>Uitbl. S</th><th>Uitbl. L</th>${groepKol.map((g) => `<th>${g.naam}</th>`).join('')}<th>Cheques</th></tr></thead>
      <tbody>${c.map((x) => `<tr data-href="#/werk/${x.ym}"><th><a href="#/werk/${x.ym}">${maandKort(x.ym)}</a></th><td>${x.dagen}</td><td>${uren(x.uren)}</td>
        <td>${x.meer ? uren(x.meer) : ''}</td><td>${x.nacht || ''}</td><td>${x.zesde || ''}</td><td>${x.arab || ''}</td><td>${x.s || ''}</td><td>${x.l || ''}</td>${groepKol.map((g) => `<td>${x.g[g.k] || ''}</td>`).join('')}<td>${n(x.cheques)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Totaal</th><td>${som(c, 'dagen')}</td><td>${uren(som(c, 'uren'))}</td><td>${uren(som(c, 'meer'))}</td><td>${som(c, 'nacht')}</td><td>${som(c, 'zesde')}</td>
        <td>${som(c, 'arab')}</td><td>${som(c, 's')}</td><td>${som(c, 'l')}</td>${groepKol.map((g) => `<td>${c.reduce((a, x) => a + (x.g[g.k] ?? 0), 0)}</td>`).join('')}<td>${som(c, 'cheques')}</td></tr></tfoot>
    </table></div>
    <p class="noot">ARAB, uitblijven S/L, nacht en 6de dag: het aantal dagen met een waarde in die kolom. Afwezigheden: hele dagen, ingedeeld volgens de omschrijving van de code.</p>
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
        <td>${typeof d.meer === 'number' ? uren(d.meer) : cel(d.meer)}</td><td>${cel(d.arab)}</td><td>${cel(d.uitblijven)}</td><td>${cel(d.nacht)}</td><td>${cel(d.zesde)}</td><td>${d.afwezig ? esc(afwTekst(d, m.codes || {})) : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Totaal</th><td>${uren(m.totalen.gepland)}</td><td>${uren(m.totalen.gepresteerd)}</td><td>${uren(m.totalen.meer)}</td><td colspan="5"></td></tr></tfoot>
    </table></div>
    <p class="acties">${state.wisWerk === ym
      ? `Time statement van ${maandVol(ym)} verwijderen? <button type="button" class="link gevaar" data-wiswerk-ja="${ym}">Ja, verwijderen</button> <button type="button" class="link" data-wis-nee>Annuleren</button>`
      : `<button type="button" class="link" data-wiswerk="${ym}">Time statement verwijderen</button>`}</p>`;
}
