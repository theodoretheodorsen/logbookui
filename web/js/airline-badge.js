// Mobile card view only: infers an airline from a flight's free-text
// remarks field so its logo can be shown on the card's summary row.
// Logo URLs point directly at each airline's own official site (hotlinked,
// not downloaded/self-hosted - this repo never stores or redistributes the
// actual logo files) - unlike every other icon in this app, these are real
// trademarked brand assets. If a URL ever breaks, the badge just silently
// stops showing (see renderAirlineBadge's onerror) rather than erroring.
const AIRLINES = [
  { name: 'Iberia', logoUrl: 'https://www.iberia.com//wcs/imagenes/iconos/favicon.ico', prefixes: ['IB', 'IBE'] },
  { name: 'Luxair', logoUrl: 'https://www.luxair.lu/themes/luxair/favicon.ico', prefixes: ['LG', 'LGL'] },
];

// Returns the matching airline entry, or undefined if remarks is
// null/empty or matches no known prefix. Case-insensitive.
export function detectAirline(remarks) {
  if (!remarks) return undefined;
  const trimmed = remarks.trimStart().toUpperCase();
  if (!trimmed) return undefined;
  return AIRLINES.find(({ prefixes }) => prefixes.some((prefix) => trimmed.startsWith(prefix)));
}

// Renders nothing (hides itself) if the logo URL 404s/fails to load,
// rather than a broken-image icon - keeps this safe even if a hotlinked
// URL breaks later.
export function renderAirlineBadge({ name, logoUrl }) {
  return `<img class="airline-badge" src="${logoUrl}" alt="${name}" title="${name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
}
