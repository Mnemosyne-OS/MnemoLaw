/**
 * Flags — the flags of the countries MnemoLaw has sources for, drawn in SVG.
 *
 * 🪤 NOT emoji: Windows renders 🇺🇸 and 🇫🇷 as the letters "US" and "FR",
 * so a flag grid built on regional-indicator emoji is a grid of letters on the
 * machines most people use. The US flag is simplified (stripes and a plain
 * canton) because at 48 px fifty stars are a grey smudge.
 */

/** The French tricolour. Colours are the flag's own, not theme tokens: a flag is not themed. */
export function FlagFR({ width = 48 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 2) / 3} viewBox="0 0 3 2" role="img" aria-hidden="true" style={{ borderRadius: 3, display: 'block' }}>
      <rect width="1" height="2" x="0" fill="#0055A4" />
      <rect width="1" height="2" x="1" fill="#FFFFFF" />
      <rect width="1" height="2" x="2" fill="#EF4135" />
    </svg>
  );
}

/** The Colombian flag: yellow on the top half, then blue and red. */
export function FlagCO({ width = 48 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 2) / 3} viewBox="0 0 3 2" role="img" aria-hidden="true" style={{ borderRadius: 3, display: 'block' }}>
      <rect width="3" height="1" y="0" fill="#FCD116" />
      <rect width="3" height="0.5" y="1" fill="#003893" />
      <rect width="3" height="0.5" y="1.5" fill="#CE1126" />
    </svg>
  );
}

/** The Spanish flag without its coat of arms: red, a yellow band twice as tall, red. */
export function FlagES({ width = 48 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 2) / 3} viewBox="0 0 3 2" role="img" aria-hidden="true" style={{ borderRadius: 3, display: 'block' }}>
      <rect width="3" height="2" fill="#AA151B" />
      <rect width="3" height="1" y="0.5" fill="#F1BF00" />
    </svg>
  );
}

/** The Argentine flag: sky blue, white, sky blue, with a plain sun. */
export function FlagAR({ width = 48 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 2) / 3} viewBox="0 0 3 2" role="img" aria-hidden="true" style={{ borderRadius: 3, display: 'block' }}>
      <rect width="3" height="2" fill="#74ACDF" />
      <rect width="3" height="0.667" y="0.667" fill="#FFFFFF" />
      <circle cx="1.5" cy="1" r="0.18" fill="#F6B40E" />
    </svg>
  );
}

/** The Italian tricolour. */
export function FlagIT({ width = 48 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 2) / 3} viewBox="0 0 3 2" role="img" aria-hidden="true" style={{ borderRadius: 3, display: 'block' }}>
      <rect width="1" height="2" x="0" fill="#009246" />
      <rect width="1" height="2" x="1" fill="#FFFFFF" />
      <rect width="1" height="2" x="2" fill="#CE2B37" />
    </svg>
  );
}

/** The Portuguese flag without its coat of arms: green at the hoist, red, a plain sphere on the seam. */
export function FlagPT({ width = 48 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 2) / 3} viewBox="0 0 3 2" role="img" aria-hidden="true" style={{ borderRadius: 3, display: 'block' }}>
      <rect width="3" height="2" fill="#DA291C" />
      <rect width="1.2" height="2" fill="#046A38" />
      <circle cx="1.2" cy="1" r="0.3" fill="#FFE900" />
    </svg>
  );
}

/** The Union Jack, simplified: the crosses of St George and St Andrew on blue. */
export function FlagGB({ width = 48 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 2) / 3} viewBox="0 0 30 20" role="img" aria-hidden="true" style={{ borderRadius: 3, display: 'block' }}>
      <rect width="30" height="20" fill="#012169" />
      <path d="M0,0 L30,20 M30,0 L0,20" stroke="#FFFFFF" strokeWidth="4" />
      <path d="M0,0 L30,20 M30,0 L0,20" stroke="#C8102E" strokeWidth="1.6" />
      <path d="M15,0 V20 M0,10 H30" stroke="#FFFFFF" strokeWidth="6" />
      <path d="M15,0 V20 M0,10 H30" stroke="#C8102E" strokeWidth="3.6" />
    </svg>
  );
}

/** The Canadian flag, simplified: red bands and a red diamond for the maple leaf. */
export function FlagCA({ width = 48 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 2) / 3} viewBox="0 0 4 2" role="img" aria-hidden="true" style={{ borderRadius: 3, display: 'block' }}>
      <rect width="4" height="2" fill="#FFFFFF" />
      <rect width="1" height="2" fill="#D52B1E" />
      <rect width="1" height="2" x="3" fill="#D52B1E" />
      <path d="M2,0.45 L2.45,1 L2,1.45 L1.55,1 Z" fill="#D52B1E" />
    </svg>
  );
}

/** The flag of Europe: a circle of twelve gold stars on blue, drawn as dots. */
export function FlagEU({ width = 48 }: { width?: number }) {
  const stars = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * 2 * Math.PI;
    return <circle key={i} cx={1.5 + 0.6 * Math.sin(a)} cy={1 - 0.6 * Math.cos(a)} r="0.08" fill="#FFCC00" />;
  });
  return (
    <svg width={width} height={(width * 2) / 3} viewBox="0 0 3 2" role="img" aria-hidden="true" style={{ borderRadius: 3, display: 'block' }}>
      <rect width="3" height="2" fill="#003399" />
      {stars}
    </svg>
  );
}

/** International treaties: a globe in white lines on UN blue (no state's flag). */
export function FlagINT({ width = 48 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 2) / 3} viewBox="0 0 3 2" role="img" aria-hidden="true" style={{ borderRadius: 3, display: 'block' }}>
      <rect width="3" height="2" fill="#4B92DB" />
      <g fill="none" stroke="#FFFFFF" strokeWidth="0.06">
        <circle cx="1.5" cy="1" r="0.62" />
        <ellipse cx="1.5" cy="1" rx="0.28" ry="0.62" />
        <path d="M0.88,1 H2.12 M0.98,0.68 H2.02 M0.98,1.32 H2.02" />
      </g>
    </svg>
  );
}

/** The flag of a country MnemoLaw has a source for. */
export function FlagOf({ country, width = 48 }: { country: 'us' | 'fr' | 'co' | 'es' | 'ar' | 'it' | 'pt' | 'uk' | 'ca' | 'eu' | 'int'; width?: number }) {
  if (country === 'int') return <FlagINT width={width} />;
  if (country === 'eu') return <FlagEU width={width} />;
  if (country === 'ca') return <FlagCA width={width} />;
  if (country === 'pt') return <FlagPT width={width} />;
  if (country === 'uk') return <FlagGB width={width} />;
  if (country === 'it') return <FlagIT width={width} />;
  if (country === 'fr') return <FlagFR width={width} />;
  if (country === 'co') return <FlagCO width={width} />;
  if (country === 'es') return <FlagES width={width} />;
  if (country === 'ar') return <FlagAR width={width} />;
  return <FlagUS width={width} />;
}

/** The US flag, simplified: 13 stripes and the blue canton. */
export function FlagUS({ width = 48 }: { width?: number }) {
  const stripes = Array.from({ length: 13 }, (_, i) => i);
  return (
    <svg width={width} height={(width * 10) / 19} viewBox="0 0 19 10" role="img" aria-hidden="true" style={{ borderRadius: 3, display: 'block' }}>
      {stripes.map((i) => (
        <rect key={i} x="0" y={(i * 10) / 13} width="19" height={10 / 13} fill={i % 2 === 0 ? '#B22234' : '#FFFFFF'} />
      ))}
      <rect x="0" y="0" width="7.6" height={(7 * 10) / 13} fill="#3C3B6E" />
    </svg>
  );
}
