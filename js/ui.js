// Bouwstenen in de stijl van Verbruik thuis: tegels en kaarten.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// t: { label, waarde (HTML), detail, kleur, hoofd, href }
export function tegels(lijst) {
  return `<div class="tegels">${lijst.filter(Boolean).map((t) => {
    const tag = t.href ? 'a' : 'div';
    return `<${tag} class="tegel${t.hoofd ? ' hoofd' : ''}"${t.href ? ` href="${esc(t.href)}"` : ''}>
      <div class="tl">${t.kleur ? `<i style="background:${t.kleur}"></i>` : ''}${esc(t.label)}</div>
      <div class="tw">${t.waarde}</div>${t.detail ? `<div class="td">${t.detail}</div>` : ''}</${tag}>`;
  }).join('')}</div>`;
}

// Kaart met titel; opties: { sub, breed, href, id, extra }
export function kaart(titel, inhoud, { sub = '', breed = false, href = '', extra = '' } = {}) {
  if (!inhoud) return '';
  const tag = href ? 'a' : 'section';
  return `<${tag} class="kaart${breed ? ' breed' : ''}${extra ? ` ${extra}` : ''}"${href ? ` href="${esc(href)}"` : ''}>
    ${titel ? `<div class="kaart-kop"><h2>${esc(titel)}</h2>${sub ? `<span>${sub}</span>` : ''}</div>` : ''}
    ${inhoud}</${tag}>`;
}

export const raster = (...kaarten) => `<div class="raster">${kaarten.filter(Boolean).join('')}</div>`;

export const terugKnop = (href, extra = '') => `<a class="terug" href="${esc(href)}" aria-label="Terug"${extra}>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></a>`;
