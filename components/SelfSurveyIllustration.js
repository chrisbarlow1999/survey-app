// Placeholder "example photos" for the self survey: simple line drawings of
// what a good photo or measurement looks like. Replace with real photos by
// setting `exampleImage` on a step in lib/selfSurveyGuide.js.
//
// Colours come from CSS classes (.ssi-*) rather than attributes so they follow
// the light/dark theme.

function Frame({ children, label }) {
  return (
    <svg className="ssi" viewBox="0 0 240 150" role="img" aria-label={label}>
      <rect className="ssi-bg" x="0" y="0" width="240" height="150" rx="10" />
      {children}
    </svg>
  );
}

const DRAWINGS = {
  name: (
    <Frame label="Example: a floor plan with the screen location marked">
      <rect className="ssi-line" x="30" y="25" width="180" height="100" />
      <line className="ssi-line" x1="110" y1="25" x2="110" y2="80" />
      <line className="ssi-line" x1="30" y1="80" x2="85" y2="80" />
      <rect className="ssi-accent-fill" x="150" y="25" width="40" height="8" />
      <circle className="ssi-accent-fill" cx="170" cy="50" r="10" />
      <text className="ssi-text" x="170" y="54" textAnchor="middle">1</text>
      <text className="ssi-text-muted" x="60" y="105" textAnchor="middle">Reception</text>
    </Frame>
  ),
  wide: (
    <Frame label="Example: whole wall in frame, floor and ceiling visible">
      <line className="ssi-line" x1="20" y1="22" x2="220" y2="22" />
      <line className="ssi-line" x1="20" y1="128" x2="220" y2="128" />
      <rect className="ssi-accent-fill" x="85" y="45" width="70" height="40" rx="2" />
      <rect className="ssi-line" x="30" y="95" width="30" height="33" />
      <rect className="ssi-line" x="185" y="70" width="18" height="12" />
      <text className="ssi-text-muted" x="120" y="16" textAnchor="middle">ceiling</text>
      <text className="ssi-text-muted" x="120" y="143" textAnchor="middle">floor</text>
      <path className="ssi-corner" d="M8 30 V8 H30 M210 8 H232 V30 M232 120 V142 H210 M30 142 H8 V120" />
    </Frame>
  ),
  wall: (
    <Frame label="Example: close-up of the wall surface">
      {[0, 1, 2, 3].map((r) => (
        <g key={r}>
          {[0, 1, 2, 3, 4].map((c) => (
            <rect
              key={c}
              className="ssi-line"
              x={20 + c * 42 + (r % 2 ? 21 : 0)}
              y={25 + r * 26}
              width="40"
              height="24"
            />
          ))}
        </g>
      ))}
      <circle className="ssi-accent-fill" cx="120" cy="75" r="18" />
      <text className="ssi-text" x="120" y="79" textAnchor="middle">knock</text>
    </Frame>
  ),
  measure: (
    <Frame label="Example: measuring clear width and height on the wall">
      <rect className="ssi-line" x="20" y="20" width="200" height="110" />
      <rect className="ssi-accent-fill" x="70" y="45" width="100" height="56" rx="2" />
      <line className="ssi-dim" x1="40" y1="34" x2="200" y2="34" />
      <text className="ssi-text" x="120" y="30" textAnchor="middle">width</text>
      <line className="ssi-dim" x1="200" y1="45" x2="200" y2="120" />
      <text className="ssi-text" x="207" y="86">height</text>
      <line className="ssi-dim" x1="55" y1="101" x2="55" y2="130" />
      <text className="ssi-text-muted" x="28" y="120">from floor</text>
    </Frame>
  ),
  power: (
    <Frame label="Example: double power socket on the wall">
      <rect className="ssi-line" x="70" y="40" width="100" height="62" rx="6" />
      <g>
        <rect className="ssi-accent-fill" x="84" y="56" width="30" height="30" rx="3" />
        <rect className="ssi-accent-fill" x="126" y="56" width="30" height="30" rx="3" />
        <line className="ssi-line" x1="99" y1="62" x2="99" y2="70" />
        <line className="ssi-line" x1="92" y1="76" x2="96" y2="76" />
        <line className="ssi-line" x1="102" y1="76" x2="106" y2="76" />
        <line className="ssi-line" x1="141" y1="62" x2="141" y2="70" />
        <line className="ssi-line" x1="134" y1="76" x2="138" y2="76" />
        <line className="ssi-line" x1="144" y1="76" x2="148" y2="76" />
      </g>
      <text className="ssi-text-muted" x="120" y="125" textAnchor="middle">include some wall around it</text>
    </Frame>
  ),
  data: (
    <Frame label="Example: a network wall point, Wi-Fi and phone signal">
      <rect className="ssi-line" x="25" y="45" width="56" height="56" rx="5" />
      <rect className="ssi-accent-fill" x="40" y="62" width="26" height="20" rx="2" />
      <text className="ssi-text-muted" x="53" y="118" textAnchor="middle">network point</text>
      <path className="ssi-line" d="M100 70 q20 -20 40 0 M108 78 q12 -12 24 0" />
      <circle className="ssi-accent-fill" cx="120" cy="86" r="4" />
      <text className="ssi-text-muted" x="120" y="118" textAnchor="middle">Wi-Fi</text>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} className="ssi-accent-fill" x={170 + i * 10} y={90 - i * 10} width="6" height={10 + i * 10} />
      ))}
      <text className="ssi-text-muted" x="185" y="118" textAnchor="middle">4G / 5G</text>
    </Frame>
  ),
  obstructions: (
    <Frame label="Example: radiator and pipe below the screen position">
      <rect className="ssi-line ssi-dashed" x="80" y="25" width="80" height="45" />
      <text className="ssi-text-muted" x="120" y="52" textAnchor="middle">screen here?</text>
      <rect className="ssi-accent-fill" x="70" y="90" width="100" height="32" rx="3" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <line key={i} className="ssi-line" x1={82 + i * 13} y1="94" x2={82 + i * 13} y2="118" />
      ))}
      <line className="ssi-line" x1="40" y1="20" x2="40" y2="130" />
      <text className="ssi-text-muted" x="120" y="140" textAnchor="middle">radiator</text>
    </Frame>
  ),
  screens: (
    <Frame label="Example: landscape and portrait screens">
      <rect className="ssi-accent-fill" x="35" y="45" width="90" height="52" rx="3" />
      <text className="ssi-text-muted" x="80" y="118" textAnchor="middle">landscape</text>
      <rect className="ssi-accent-fill" x="160" y="30" width="44" height="78" rx="3" />
      <text className="ssi-text-muted" x="182" y="128" textAnchor="middle">portrait</text>
    </Frame>
  ),
};

export function SelfSurveyIllustration({ kind, image, alt }) {
  if (image) {
    return <img className="ssi ssi-photo" src={image} alt={alt || 'Example photo'} />;
  }
  return DRAWINGS[kind] || null;
}
