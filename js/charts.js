// Kleine grafiekbouwstenen in HTML/SVG. Tooltips via data-tip (zie app.js).
// Kleuren: gevalideerd voor kleurenblindheid op de donkere achtergrond (dataviz-validator).

export const KLEUR = {
  // Loon en Jaren: elke betekenis een eigen kleur
  netto: '#338ced', rsz: '#e76624', bv: '#00a888', inh: '#d28e05', // bruto → netto
  verg: '#0aac23', andere: '#eb6263', regul: '#9887ef', cheques: '#e24d8b', // fietsvergoeding, andere vergoedingen, regularisatie, maaltijd- en ecocheques
  eigen: '#7A828F', // eigen bijdrage maaltijdcheques (neutraal: een kost)
  enkel: '#338ced', // één reeks
  // Werk: gewerkt neutraal, meerprestaties groen (oranje is "overig" bij de afwezigheden)
  werk: '#7A828F', meer: '#0aac23',
};
// Afwezigheden: stapelvolgorde = validatievolgorde
export const GROEP_KLEUR = { loopbaan: '#338ced', andere: '#e76624', ziekte: '#00a888', verlof: '#d28e05', feestdag: '#e24d8b', rust: '#9887ef', ongeval: '#eb6263' };
export const GROEP_VOLGORDE = ['loopbaan', 'andere', 'ziekte', 'verlof', 'feestdag', 'rust', 'ongeval'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Mooie asverdeling: 0 tot max in 3–5 stappen
export function ticks(max, n = 4) {
  if (!(max > 0)) return [0, 1];
  const ruw = max / n;
  const mag = 10 ** Math.floor(Math.log10(ruw));
  const stap = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= ruw);
  const t = [];
  for (let v = 0; v <= max + stap * 0.001; v += stap) t.push(Math.round(v * 1000) / 1000);
  if (t[t.length - 1] < max) t.push(Math.round((t[t.length - 1] + stap) * 1000) / 1000);
  return t;
}

export function legende(items) {
  return `<div class="g-leg">${items.map((i) => `<span><i style="background:${i.kleur}"></i>${esc(i.naam)}</span>`).join('')}</div>`;
}

// Gestapelde kolommen. labels: [..], reeksen: [{ naam, kleur, waarden: [..] }], opties: { fmt, hoogte, hrefs, tipExtra, kort }
// gedimd: [true/false] per kolom, bv. voor onvolledige jaren (lichter getekend)
export function kolommen(labels, reeksen, { fmt = String, asFmt = fmt, hoogte = 170, hrefs = [], tipKop = labels, tipExtra = [], legendeTonen = reeksen.length > 1, topLabel = null, gedimd = [] } = {}) {
  const totalen = labels.map((_, i) => reeksen.reduce((a, r) => a + Math.max(0, r.waarden[i] ?? 0), 0));
  const t = ticks(Math.max(...totalen, 0));
  const max = t[t.length - 1] || 1;
  const kol = labels.map((lab, i) => {
    const segs = reeksen.map((r) => ({ r, v: Math.max(0, r.waarden[i] ?? 0) })).filter((s) => s.v > 0);
    const tip = [tipKop[i], ...reeksen.filter((r) => (r.waarden[i] ?? 0) !== 0).map((r) => `${r.naam}: ${fmt(r.waarden[i])}`),
      ...(reeksen.length > 1 && totalen[i] ? [`Totaal: ${fmt(totalen[i])}`] : []), ...(tipExtra[i] ? [tipExtra[i]] : [])].join('\n');
    const h = (totalen[i] / max) * 100;
    return `<div class="g-kol${hrefs[i] ? ' klik' : ''}${gedimd[i] ? ' gedimd' : ''}"${hrefs[i] ? ` data-href="${esc(hrefs[i])}"` : ''} data-tip="${esc(totalen[i] ? tip : `${tipKop[i]}: geen gegevens`)}" tabindex="0">
      <div class="g-stapel" style="height:${h.toFixed(2)}%">${[...segs].reverse().map((s) => `<i style="flex:${s.v};background:${s.r.kleur}"></i>`).join('')}</div>
      ${topLabel && topLabel[i] != null ? `<b class="g-top" style="bottom:${h.toFixed(2)}%">${esc(topLabel[i])}</b>` : ''}
    </div>`;
  }).join('');
  return `<figure class="g">
    ${legendeTonen ? legende(reeksen) : ''}
    <div class="g-vlak${topLabel ? ' met-top' : ''}" style="height:${hoogte}px">
      ${t.map((v) => `<div class="g-lijn" style="bottom:${(v / max * 100).toFixed(2)}%"><span>${esc(asFmt(v))}</span></div>`).join('')}
      <div class="g-kols">${kol}</div>
    </div>
    <div class="g-as">${labels.map((l) => `<span>${esc(l)}</span>`).join('')}</div>
  </figure>`;
}

// Lijn over veel punten (bv. elke maand sinds 2019). punten: [{ label, v, tip, href, scheiding }]
// nul: false → de as begint niet bij 0 maar net onder de laagste waarde (alleen voor lijnen, bv. de index)
export function lijn(punten, { fmt = String, asFmt = fmt, hoogte = 170, kleur = KLEUR.enkel, asLabels = null, nul = true } = {}) {
  const geldig = punten.filter((p) => p.v != null);
  if (!geldig.length) return '';
  const hoog = Math.max(...geldig.map((p) => p.v)), laag = Math.min(...geldig.map((p) => p.v));
  let t, min = 0;
  if (nul) t = ticks(hoog);
  else {
    const r = ticks(Math.max(hoog - laag, 1));
    const stap = r[1] - r[0];
    min = Math.floor(laag / stap) * stap;
    t = []; for (let v = min; v < hoog + stap; v += stap) t.push(Math.round(v * 1000) / 1000);
  }
  const max = t[t.length - 1] || 1;
  const n = punten.length;
  const x = (i) => (n === 1 ? 500 : (i / (n - 1)) * 1000);
  const y = (v) => 100 - ((v - min) / (max - min || 1)) * 100;
  // pad met onderbrekingen bij ontbrekende maanden
  let d = '', open = false;
  punten.forEach((p, i) => {
    if (p.v == null) { open = false; return; }
    d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(2)}`;
    open = true;
  });
  const vlak = geldig.length > 1 ? `<path d="${d}" fill="none" stroke="${kleur}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>` : '';
  return `<figure class="g">
    <div class="g-vlak" style="height:${hoogte}px">
      ${t.map((v) => `<div class="g-lijn" style="bottom:${((v - min) / (max - min || 1) * 100).toFixed(2)}%"><span>${esc(asFmt(v))}</span></div>`).join('')}
      <svg class="g-svg" viewBox="0 0 1000 100" preserveAspectRatio="none">${vlak}</svg>
      <div class="g-punten">${punten.map((p, i) => `<div class="g-pt${p.href ? ' klik' : ''}${p.scheiding ? ' sch' : ''}"${p.href ? ` data-href="${esc(p.href)}"` : ''} data-tip="${esc(p.tip ?? `${p.label}: ${p.v == null ? 'geen gegevens' : fmt(p.v)}`)}">
        ${p.v != null ? `<i style="bottom:${(100 - y(p.v)).toFixed(2)}%;background:${kleur}"></i>` : ''}</div>`).join('')}</div>
    </div>
    ${asLabels ? `<div class="g-as vrij">${asLabels.map((a) => `<span style="left:${(n === 1 ? 50 : (a.i / (n - 1)) * 100).toFixed(2)}%">${esc(a.label)}</span>`).join('')}</div>` : ''}
  </figure>`;
}

// Horizontale gestapelde balken (één rij per categorie, bv. per jaar). rijen: [{ label, waarden: {k: v}, href }]
export function balken(rijen, reeksen, { fmt = String, procent = false, rechts = null } = {}) {
  const totaal = (r) => reeksen.reduce((a, s) => a + Math.max(0, r.waarden[s.k] ?? 0), 0);
  const max = procent ? 1 : Math.max(...rijen.map(totaal), 1);
  return `<figure class="g">${legende(reeksen)}
    <div class="g-balken">${rijen.map((r) => {
      const tot = totaal(r);
      const tip = [r.label, ...reeksen.filter((s) => r.waarden[s.k]).map((s) => `${s.naam}: ${fmt(r.waarden[s.k])}${procent && tot ? ` (${Math.round(r.waarden[s.k] / tot * 100)}%)` : ''}`)].join('\n');
      const breedte = procent ? 100 : (tot / max) * 100;
      return `<div class="g-brij${r.href ? ' klik' : ''}${r.gedimd ? ' gedimd' : ''}"${r.href ? ` data-href="${esc(r.href)}"` : ''} data-tip="${esc(tip)}">
        <span>${esc(r.label)}</span>
        <div class="g-bbak"><div class="g-bvul" style="width:${breedte.toFixed(2)}%">${reeksen.map((s) => { const v = Math.max(0, r.waarden[s.k] ?? 0); return v ? `<i style="flex:${v};background:${s.kleur}"></i>` : ''; }).join('')}</div></div>
        <b>${esc(rechts ? rechts(r, tot) : fmt(tot))}</b></div>`;
    }).join('')}</div></figure>`;
}

// Verdeelbalk (één geheel in delen), met aandeel in het blok als het past.
export function verdeelbalk(delen, { fmt = String } = {}) {
  const tot = delen.reduce((a, d) => a + Math.max(0, d.v), 0) || 1;
  return `<figure class="g">
    <div class="g-verdeel">${delen.filter((d) => d.v > 0).map((d) => {
      const p = d.v / tot * 100;
      return `<div style="flex:${d.v};background:${d.kleur}" data-tip="${esc(`${d.naam}: ${fmt(d.v)} (${Math.round(p)}%)`)}">${p >= 9 ? `<span>${Math.round(p)}%</span>` : ''}</div>`;
    }).join('')}</div>
    <div class="g-leg">${delen.map((d) => `<span><i style="background:${d.kleur}"></i>${esc(d.naam)} <b>${esc(fmt(d.v))}</b></span>`).join('')}</div>
  </figure>`;
}
