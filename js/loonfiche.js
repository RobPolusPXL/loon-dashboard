// Leest een bpost-loonfiche (PDF) uit tot één object.
// Werkt op tekstitems { str, x, y, w } per pagina, zodat het zowel in de browser (pdf.js) als in tests draait.
// Bewust NIET bewaard: rijksregisternummer, IBAN, stamnummer en adres.

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const BEDRAG = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
const CODE = /^(\/?[0-9A-Z]{3,4})\s+(.+)$/;
const getal = (s) => parseFloat(s.replace(/\./g, '').replace(',', '.'));
const r2 = (x) => Math.round(x * 100) / 100;

// Tekstitems → regels → segmenten (stukken tekst met een grote horizontale tussenruimte ertussen).
function regels(items) {
  const lijst = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const rijen = [];
  for (const i of lijst) {
    const rij = rijen.find((r) => Math.abs(r.y - i.y) <= 2.5);
    if (rij) rij.items.push(i); else rijen.push({ y: i.y, items: [i] });
  }
  rijen.sort((a, b) => b.y - a.y);
  return rijen.map((r) => {
    const its = r.items.sort((a, b) => a.x - b.x);
    const segs = [];
    let huidig = null, eind = 0;
    for (const i of its) {
      const gat = i.x - eind;
      if (!huidig || gat > 30) { huidig = { x: i.x, t: i.str }; segs.push(huidig); }
      else huidig.t += (gat > 1.5 ? ' ' : '') + i.str;
      eind = i.x + (i.w || 0);
    }
    for (const s of segs) s.t = s.t.replace(/\s+/g, ' ').trim();
    return segs.filter((s) => s.t);
  });
}

// "€ 2.083,91", "2.083,91 €" of "1.972,76" → getal; anders null.
function bedragVan(t) {
  if (/[a-z]/i.test(t)) return null;
  const s = t.replace(/[^\d.,-]/g, ''); // ook een €-teken dat in oudere PDF's als vreemd teken staat
  return BEDRAG.test(s) ? getal(s) : null;
}

// Regel met een bedrag op het einde → { tekst, bedrag }.
function bedragRegel(segs) {
  if (segs.length < 2) return null;
  const b = bedragVan(segs[segs.length - 1].t);
  if (b == null) return null;
  const tekst = segs.slice(0, -1).map((s) => s.t).join(' ').replace(/€/g, '').replace(/[^\p{L}\p{N}\s.,:;()\/%'+&-]/gu, '').replace(/\s+/g, ' ').trim();
  return tekst ? { tekst, bedrag: b } : null;
}

const SLEUTELS = {
  'Statuut': 'statuut', 'Functie': 'functie', 'Vervang. functie': 'vervangFunctie', 'Burgerlijke staat': 'burgerlijkeStaat',
  'Personen ten laste': 'personenTenLaste', 'Bedrijfsanciënniteit': 'anciënniteit', 'Geldelijk statuut 100%': 'geldelijkStatuut',
  'Contractueel stelsel': 'contractueelStelsel', 'Werkregime': 'werkregime', 'Index': 'index', 'Betalingsbarema': 'barema',
  'Jaarwedde geïndexeerd': 'jaarwedde', 'Jaarwedde aan 100 %': 'geldelijkStatuut',
};
const GETALLEN = new Set(['geldelijkStatuut', 'contractueelStelsel', 'werkregime', 'index', 'jaarwedde', 'personenTenLaste']);

// Vaste totalen op de fiche → korte sleutel.
const TOTALEN = [
  [/^Bruto onderworpen/i, 'bruto'], [/^Bruto niet onderworpen/i, 'brutoNiet'], [/^Sociale bijdragen$/i, 'sociale'], [/^Belastbaar$/i, 'belastbaar'],
  [/^Bedrijfsvoorheffing$/i, 'voorheffing'], [/^Inhoudingen$/i, 'inhoudingen'], [/^Vergoedingen$/i, 'vergoedingen'],
  [/^Nettoloon van de maand$/i, 'netto'], [/^Regularisatie$/i, 'regularisatie'], [/^Totaal netto bedrag$/i, 'totaal'],
];
const totaalSleutel = (t) => TOTALEN.find(([re]) => re.test(t))?.[1] ?? null;
// Op oudere fiches staat "Regularisatie" soms op dezelfde regel als de maaltijdcheques: alleen het laatste stuk telt.
const EIND = [[/Nettoloon van de maand$/i, 'netto'], [/Regularisatie$/i, 'regularisatie'], [/Totaal netto bedrag$/i, 'totaal']];

function maandVan(tekst) {
  const m = tekst.match(/(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})/i);
  return m ? `${m[2]}-${String(MAANDEN.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}` : null;
}

// Secties (Bruto, Sociale bijdragen, …) met hun lijnen opbouwen uit bedragregels.
function nieuwBlok() { return { secties: [], totalen: {} }; }
function voegToe(blok, br) {
  const c = br.tekst.match(CODE);
  if (c && blok.secties.length) {
    blok.secties[blok.secties.length - 1].lijnen.push({ code: c[1], omschrijving: c[2], bedrag: br.bedrag });
    return;
  }
  const k = totaalSleutel(br.tekst) ?? EIND.find(([re]) => re.test(br.tekst))?.[1] ?? null;
  if (k) blok.totalen[k] = br.bedrag;
  if (k === 'netto' || k === 'regularisatie' || k === 'totaal') return;
  blok.secties.push({ naam: br.tekst, sleutel: k, bedrag: br.bedrag, lijnen: [] });
}

export function parseLoonfiche(paginas) {
  const fiche = {
    maand: null, gegevens: {}, secties: [], totalen: {}, maaltijdcheques: null,
    prestaties: { dagen: [], uren: [] }, herberekeningen: [], controles: [],
  };
  const hoofd = nieuwBlok();
  let herb = null; // huidig herberekeningsblok
  let prest = null; // 'dagen' | 'uren' | 'oud'
  let oudeMaanden = 0;

  paginas.forEach((items) => {
    // Pagina 1 heeft twee kolommen (gegevens links, bedragen rechts): apart lezen zodat regels niet samensmelten.
    const kop = items.find((i) => /^Loon en bedragen betaald/i.test(i.str.trim()))
      ?? items.find((i) => /^Rubriek$/i.test(i.str.trim()) && i.x > 150); // oudere weddefiche
    const grens = kop ? kop.x - 5 : null;
    const blokken = grens == null ? [items] : [items.filter((i) => i.x < grens), items.filter((i) => i.x >= grens)];
    for (const segs of blokken.flatMap(regels)) {
      const alles = segs.map((s) => s.t).join(' ');

      const titel = alles.match(/^(?:Loonfiche|Weddefiche) van (.+)$/i);
      if (titel) { fiche.maand ||= maandVan(titel[1]); continue; }

      const h = alles.match(/^Herberekening van (.+)$/i) ?? alles.match(/^Regularisatie ((?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4})$/i);
      if (h) { herb = { maand: maandVan(h[1]), ...nieuwBlok(), totaal: null }; fiche.herberekeningen.push(herb); prest = null; continue; }

      // Oudere fiches: "Overzicht betaalde en onbetaalde uren | … dagen", met de huidige maand en de vorige naast elkaar
      if (/^Overzicht betaalde en onbetaalde/i.test(alles)) { prest = 'oud'; oudeMaanden = 0; continue; }
      if (prest === 'oud') {
        if (/^(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}/i.test(alles)) {
          if (++oudeMaanden > 1) prest = null; // alleen de eerste (huidige) maand
          continue;
        }
        if (/^Maaltijdcheques|^Op te nemen/i.test(alles)) { prest = null; }
        else {
          for (let k = 0; k < segs.length - 1; k++) {
            const pc = segs[k].t.match(/^(8([A-Z])\w{2})\s+(.+)$/);
            const w = segs[k + 1].t;
            if (!pc || !/^\d+(?:[.,]\d+)?$/.test(w)) continue;
            const waarde = parseFloat(w.replace(',', '.'));
            const soort = pc[2] === 'D' || /\(dg\)|dagen/i.test(pc[3]) ? 'dagen' : 'uren';
            const tekst = soort === 'uren' ? `${Math.floor(waarde)}:${String(Math.round((waarde % 1) * 60)).padStart(2, '0')}` : w;
            fiche.prestaties[soort].push({ code: pc[1], omschrijving: pc[3], waarde: r2(waarde), tekst });
          }
          continue;
        }
      }
      if (/^Prestatie \(Dagen\)/i.test(alles)) { prest = 'dagen'; continue; }
      if (/^Prestatie \(Uren\)/i.test(alles)) { prest = 'uren'; continue; }

      // Linkerkolom: "Label : waarde"
      let kvGevonden = false;
      for (const s of segs) {
        const kv = s.t.match(/^(.+?)\s*:\s*(.*)$/);
        if (!kv) continue;
        const label = kv[1].trim();
        const waarde = kv[2].replace(/€|u\/week/g, '').trim();
        if (/maaltijdcheques|kaart$/i.test(label)) {
          const n = (waarde || segs[segs.indexOf(s) + 1]?.t || '').match(/^\d+$/);
          if (n) fiche.maaltijdcheques = +n[0];
          kvGevonden = true;
          continue;
        }
        const k = SLEUTELS[label];
        if (!k) continue;
        kvGevonden = true;
        if (!waarde) continue;
        fiche.gegevens[k] = GETALLEN.has(k) ? getal(waarde) : waarde;
      }
      if (kvGevonden) continue;

      // Prestatietabellen: "8D00 Gewerkte dagen | 18,00" of "8U00 Gewerkte uren | 136:48"
      const pc = segs[0].t.match(/^(8[A-Z]\w{2})\s+(.+)$/);
      if (prest && pc && segs.length >= 2) {
        const w = segs[segs.length - 1].t;
        const u = w.match(/^(\d+):(\d{2})$/);
        const waarde = u ? +u[1] + +u[2] / 60 : getal(w);
        if (!Number.isNaN(waarde)) fiche.prestaties[prest].push({ code: pc[1], omschrijving: pc[2], waarde: r2(waarde), tekst: w });
        continue;
      }

      // Oudere fiches hebben geen aantal op pagina 1, alleen "Maaltijdcheque €8,00-1,34   3" op pagina 2.
      const mc = segs[0].t.match(/^Maaltijdcheque\s*€?\s*[\d,]+\s*-\s*[\d,]+(?:\s+(\d+))?$/i);
      if (mc && !herb) {
        const n = mc[1] ?? segs[1]?.t.match(/^\d+$/)?.[0];
        if (n != null && fiche.maaltijdcheques == null) fiche.maaltijdcheques = +n;
        if (segs.length <= 2) continue;
      }

      const br = bedragRegel(segs);
      if (!br) continue;
      if (/IBAN/i.test(br.tekst)) continue;
      if (/^Bedrag/i.test(br.tekst)) continue;
      if (!herb && hoofd.totalen.totaal != null) continue; // na "Totaal netto bedrag": geen bedragen van de hoofdfiche meer (bv. overuren op pagina 2)
      if (herb) {
        const t = br.tekst.match(/^Totaal\s+(.+)$/i);
        if (t && maandVan(t[1])) { herb.totaal = br.bedrag; herb = null; continue; }
        voegToe(herb, br);
      } else {
        voegToe(hoofd, br);
      }
    }
  });

  fiche.secties = hoofd.secties;
  fiche.totalen = hoofd.totalen;
  if (!fiche.maand) throw new Error('Geen bpost-loonfiche: de titel "Loonfiche van …" of "Weddefiche van …" ontbreekt.');
  if (fiche.totalen.netto == null && fiche.totalen.totaal == null) throw new Error('Geen nettobedrag gevonden op de fiche.');

  // Controles: kloppen de getallen onderling? Zo niet, dan is er iets verkeerd gelezen.
  const t = fiche.totalen;
  for (const s of fiche.secties) {
    if (!s.lijnen.length) continue;
    const som = r2(s.lijnen.reduce((a, l) => a + l.bedrag, 0));
    if (Math.abs(som - s.bedrag) > 0.011) fiche.controles.push(`${s.naam}: lijnen samen ${som}, totaal op de fiche ${s.bedrag}`);
  }
  if (t.netto != null) {
    const som = r2(fiche.secties.filter((s) => s.sleutel && s.sleutel !== 'belastbaar').reduce((a, s) => a + s.bedrag, 0));
    if (Math.abs(som - t.netto) > 0.011) fiche.controles.push(`Alle bedragen op de fiche samen ${som}, nettoloon op de fiche ${t.netto} (verschil ${r2(t.netto - som)})`);
  }
  if (t.regularisatie != null && fiche.herberekeningen.length) {
    const som = r2(fiche.herberekeningen.reduce((a, h) => a + (h.totaal ?? 0), 0));
    if (Math.abs(som - t.regularisatie) > 0.011) fiche.controles.push(`Herberekeningen samen ${som}, regularisatie op de fiche ${t.regularisatie}`);
  }
  if (t.totaal != null && t.netto != null) {
    const som = r2(t.netto + (t.regularisatie ?? 0));
    if (Math.abs(som - t.totaal) > 0.011) fiche.controles.push(`Netto + regularisatie ${som}, totaal netto op de fiche ${t.totaal}`);
  }
  return fiche;
}

// Browser: PDF-bestand → tekstitems per pagina (pdf.js van een CDN, alleen geladen als je een PDF inleest).
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build';
export async function leesItems(bestand) {
  const pdfjs = await import(`${PDFJS}/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
  const data = new Uint8Array(await bestand.arrayBuffer());
  // Sommige oude fiches van bpost hebben de extensie .JPG maar zijn eigenlijk PDF's: kijk naar de inhoud.
  if (String.fromCharCode(...data.slice(0, 5)) !== '%PDF-') throw new Error('Geen PDF. Een echte foto of scan bevat geen tekst die de app kan lezen.');
  const doc = await pdfjs.getDocument({ data }).promise;
  const paginas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const c = await (await doc.getPage(p)).getTextContent();
    paginas.push(c.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
  }
  return paginas;
}
