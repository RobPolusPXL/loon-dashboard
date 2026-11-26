// Leest een bpost-time statement (PDF, één maand): prestaties per dag, totalen, verlof en rusttellers.
// Werkt op tekstitems { str, x, y, w } per pagina (zie loonfiche.js).

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const DAGEN = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

// "07:46" → minuten; "-" of leeg → null
export function minuten(t) {
  const m = String(t ?? '').match(/^(-?)(\d+):(\d{2})$/);
  return m ? (m[1] ? -1 : 1) * (+m[2] * 60 + +m[3]) : null;
}

// Kolommen; de x-positie komt uit de kop van de tabel. Meer, 6de dag e.d. staan er alleen als ze die maand voorkomen.
const KOLOMMEN = [
  ['contract', /^Contrac/i], ['gepland', /^Geplande/i], ['gepresteerd', /^Gepres/i], ['meer', /^Meer-?$/i],
  ['arab', /^ARAB$/i], ['uitblijven', /^Toelage$/i], ['nacht', /^Nacht-?$/i], ['zesde', /^6de dag$/i], ['afwezig', /^Afwezigheids/i],
];

export function isTimestatement(paginas) {
  return paginas.some((p) => p.some((i) => /Situatie op:/i.test(i.str))) && paginas.some((p) => p.some((i) => /^Afwezigheidsuren/i.test(i.str.trim())));
}

export function parseTimestatement(paginas) {
  const items = paginas.flat().filter((i) => i.str.trim()).map((i) => ({ ...i, str: i.str.trim() }));
  const kopTekst = items.map((i) => i.str).join(' ');
  const mm = kopTekst.match(/(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})\s*-\s*Situatie op:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!mm) throw new Error('Geen bpost-time statement: maand en "Situatie op" ontbreken.');
  const maand = `${mm[2]}-${String(MAANDEN.indexOf(mm[1].toLowerCase()) + 1).padStart(2, '0')}`;
  const situatie = `${mm[5]}-${mm[4]}-${mm[3]}`;

  // Kolomposities: midden van het kopwoord
  const midden = (i) => i.x + (i.w || 0) / 2;
  const kol = KOLOMMEN.map(([k, re]) => {
    const i = items.find((x) => re.test(x.str));
    return i ? { k, x: midden(i) } : null;
  }).filter(Boolean);
  for (const k of ['gepland', 'gepresteerd', 'afwezig']) {
    if (!kol.some((c) => c.k === k)) throw new Error(`Kolom "${k}" niet gevonden in de time statement.`);
  }
  const kolVan = (x) => kol.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a)).k;

  // Regels groeperen
  const rijen = [];
  for (const i of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const r = rijen.find((x) => Math.abs(x.y - i.y) <= 2.5);
    if (r) r.items.push(i); else rijen.push({ y: i.y, items: [i] });
  }
  rijen.forEach((r) => r.items.sort((a, b) => a.x - b.x));

  const dagen = [];
  const res = { maand, situatie, dagen, totalen: {}, verlof: [], rust: [], maaltijdcheques: null, codes: {} };
  // Legende van de afwezigheidscodes rechtsonder ("U51  Wettelijk verlof")
  const legKop = items.find((i) => /^Afwezigheidscodes$/i.test(i.str));
  for (const r of rijen) {
    const t = r.items.map((i) => i.str);
    // Dagregel: "Ma 01 07:46 07:46 …"
    if (DAGEN.includes(t[0]) && /^\d{2}$/.test(t[1] ?? '')) {
      const dag = { d: `${maand}-${t[1]}`, wd: DAGEN.indexOf(t[0]) };
      const afw = [];
      for (const i of r.items.slice(2)) {
        const k = kolVan(midden(i));
        if (k === 'afwezig') { if (i.str !== '-') afw.push(i.str); continue; }
        if (i.str === '-') continue;
        dag[k] = ['contract', 'gepland', 'gepresteerd', 'meer'].includes(k) ? minuten(i.str) ?? i.str : i.str;
      }
      if (afw.length) {
        dag.afwezig = afw.join(' ').replace(/\s+/g, ' ');
        // "U51 - 07:46" → code + uren
        const codes = [...dag.afwezig.matchAll(/([A-Z0-9]{2,4})\s*-\s*(\d+:\d{2})/g)].map((m) => ({ code: m[1], min: minuten(m[2]) }));
        if (codes.length) dag.afwCodes = codes;
      }
      dagen.push(dag);
      continue;
    }
    if (legKop && r.y < legKop.y) {
      const ci = r.items.findIndex((i) => i.x >= legKop.x - 80 && /^[A-Z][A-Z0-9]{2}$/.test(i.str));
      if (ci >= 0) {
        const oms = r.items.slice(ci + 1).map((i) => i.str).join(' ').trim();
        if (oms) res.codes[r.items[ci].str] = oms;
        r.items = r.items.slice(0, ci);
      }
    }
    const regel = r.items.map((i) => i.str).join(' ');
    let m;
    // Totaalregels: waarden per kolom volgens hun x-positie
    if (/^Totaal\s*[-–]\s*(Uren|Dagen)/i.test(regel)) {
      const isUren = /Uren/i.test(regel);
      for (const i of r.items) {
        const w = isUren ? minuten(i.str) : /^\d+$/.test(i.str) ? +i.str : null;
        if (w == null) continue;
        const k = kolVan(midden(i));
        res.totalen[isUren ? k : `${k}Dagen`] = w;
      }
      continue;
    }
    if ((m = regel.match(/Toegekende maaltijdcheques\s+(\d+)/i))) res.maaltijdcheques = +m[1];
    // Verlofregels: "Wettelijk verlof Contractuelen (D) 20 20 0 0"
    if ((m = regel.match(/^(.+?)\s*\((D|U)\)\s+(.+)$/))) {
      const w = m[3].split(/\s+/).map((x) => (x === '-' ? null : m[2] === 'U' ? minuten(x) ?? x : Number(x.replace(',', '.'))));
      if (w.length >= 4) res.verlof.push({ naam: m[1].trim(), eenheid: m[2] === 'D' ? 'dagen' : 'uren', recht: w[0], opgenomen: w[1], aangevraagd: w[2], saldo: w[3] });
      continue;
    }
    // Rusttellers: "Voltijdse Rusttellers 07:46 U 30-09-2022"
    if ((m = regel.match(/^(.+?Rusttellers?)\s+(\S+)\s+(U|D)\s+(\d{2})-(\d{2})-(\d{4})/i))) {
      res.rust.push({ naam: m[1].trim(), hoeveelheid: m[3] === 'U' ? minuten(m[2]) : Number(m[2].replace(',', '.')), eenheid: m[3] === 'U' ? 'uren' : 'dagen', einddatum: `${m[6]}-${m[5]}-${m[4]}` });
    }
  }
  if (!dagen.length) throw new Error('Geen dagen gevonden in de time statement.');

  // Controle: dagen samen = totaal onderaan
  res.controles = [];
  // Contractuele uren niet: bpost rondt die per week af (38:01), dus de som wijkt altijd een paar minuten af.
  for (const k of ['gepland', 'gepresteerd', 'meer']) {
    if (res.totalen[k] == null) continue;
    const som = dagen.reduce((a, d) => a + (typeof d[k] === 'number' ? d[k] : 0), 0);
    if (som !== res.totalen[k]) res.controles.push(`${k}: dagen samen ${som} min, totaal ${res.totalen[k]} min`);
  }
  return res;
}
