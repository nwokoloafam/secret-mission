// Drawings for the "How to play" page. Plain SVG so they stay sharp on any
// phone and pick up the site's colors.

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const GOLD = "var(--accent)";
const OK = "var(--ok)";
const BAD = "var(--danger)";
const PANEL = "var(--panel-2)";
const LINE = "var(--line)";

function Person({ x, y, color = MUTED, scale = 1, label }: { x: number; y: number; color?: string; scale?: number; label?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle cx="0" cy="-22" r="11" fill={color} />
      <path d="M-17 14 C-17 -4 -9 -9 0 -9 C9 -9 17 -4 17 14 Z" fill={color} />
      {label && (
        <text x="0" y="32" textAnchor="middle" fontSize="11" fill={MUTED}>
          {label}
        </text>
      )}
    </g>
  );
}

function Phone({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width="92" height="150" rx="14" fill={PANEL} stroke={LINE} strokeWidth="2" />
      <rect x="34" y="7" width="24" height="5" rx="2.5" fill={LINE} />
      {children}
    </g>
  );
}

const frame = { width: "100%", height: "auto", display: "block" } as const;

/** 1. Sign up with a photo, then tap "I'm here" at the party. */
export function CheckInArt() {
  return (
    <svg viewBox="0 0 300 170" style={frame} role="img" aria-label="Sign up with a photo, then check in at the party">
      <Phone x={30} y={10}>
        <circle cx="46" cy="52" r="22" fill={LINE} />
        <Person x={46} y={66} color={MUTED} scale={0.7} />
        <rect x="16" y="88" width="60" height="7" rx="3.5" fill={LINE} />
        <rect x="16" y="102" width="44" height="7" rx="3.5" fill={LINE} />
      </Phone>
      <path d="M135 85 h26" stroke={MUTED} strokeWidth="3" strokeLinecap="round" markerEnd="url(#arrowA)" />
      <Phone x={178} y={10}>
        <circle cx="46" cy="58" r="24" fill={OK} opacity="0.18" />
        <path d="M34 58 l9 9 l17 -19" stroke={OK} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="14" y="104" width="64" height="24" rx="8" fill={GOLD} />
        <text x="46" y="120" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--accent-ink)">
          I&apos;m here
        </text>
      </Phone>
      <defs>
        <marker id="arrowA" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill={MUTED} />
        </marker>
      </defs>
    </svg>
  );
}

/** 2. Your phone shows a target and a secret task. */
export function TargetArt() {
  return (
    <svg viewBox="0 0 300 170" style={frame} role="img" aria-label="Your phone shows who to find and a sneaky task">
      <Phone x={104} y={10}>
        <rect x="12" y="20" width="68" height="62" rx="8" fill={LINE} />
        <Person x={46} y={70} color={MUTED} scale={0.9} />
        <rect x="12" y="90" width="44" height="8" rx="4" fill={INK} opacity="0.85" />
        <rect x="12" y="106" width="68" height="30" rx="7" fill="none" stroke={GOLD} strokeWidth="2" strokeDasharray="4 3" />
        <text x="46" y="125" textAnchor="middle" fontSize="9.5" fill={GOLD}>
          secret task
        </text>
      </Phone>
      <g transform="translate(18 40)">
        <text x="0" y="0" fontSize="11" fill={MUTED}>
          who to find
        </text>
        <path d="M60 4 C80 10 92 22 104 34" stroke={MUTED} strokeWidth="1.5" fill="none" strokeDasharray="3 3" />
      </g>
      <g transform="translate(206 112)">
        <text x="0" y="0" fontSize="11" fill={MUTED}>
          e.g. get them
        </text>
        <text x="0" y="14" fontSize="11" fill={MUTED}>
          to say
        </text>
        <text x="0" y="28" fontSize="11" fill={MUTED}>
          &quot;pineapple&quot;
        </text>
        <path d="M-4 4 C-10 8 -12 10 -14 12" stroke={MUTED} strokeWidth="1.5" fill="none" strokeDasharray="3 3" />
      </g>
    </svg>
  );
}

/** 3. Do the task, say "got you", get their 4-digit stamp, type it in. */
export function CatchArt() {
  return (
    <svg viewBox="0 0 300 170" style={frame} role="img" aria-label="Do the task, say got you, and enter their 4-digit code">
      <Person x={58} y={110} color={GOLD} label="you" />
      <Person x={150} y={110} color={MUTED} label="target" />
      <g transform="translate(18 22)">
        <rect x="0" y="0" width="74" height="30" rx="10" fill={GOLD} />
        <path d="M30 30 l6 10 l6 -10 z" fill={GOLD} />
        <text x="37" y="20" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--accent-ink)">
          Got you!
        </text>
      </g>
      <g transform="translate(176 60) rotate(-8)">
        <rect x="0" y="0" width="58" height="32" rx="5" fill={PANEL} stroke={GOLD} strokeWidth="2" strokeDasharray="5 3" />
        <text x="29" y="21" textAnchor="middle" fontSize="14" fontWeight="700" fill={GOLD} fontFamily="ui-monospace, monospace">
          4821
        </text>
      </g>
      <path d="M232 92 C250 110 255 120 255 132" stroke={MUTED} strokeWidth="2" fill="none" markerEnd="url(#arrowC)" />
      <g transform="translate(222 136)">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * 17} y="0" width="14" height="20" rx="3" fill={PANEL} stroke={LINE} />
        ))}
        {"4821".split("").map((c, i) => (
          <text key={i} x={i * 17 + 7} y="15" textAnchor="middle" fontSize="11" fill={INK} fontFamily="ui-monospace, monospace">
            {c}
          </text>
        ))}
      </g>
      <defs>
        <marker id="arrowC" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill={MUTED} />
        </marker>
      </defs>
    </svg>
  );
}

/** 4. Everyone hunts the next person in a circle; catch yours and you take over their target. */
export function LoopArt() {
  const n = 6;
  const cx = 150;
  const cy = 86;
  const r = 62;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  const arc = (a: { x: number; y: number }, b: { x: number; y: number }, shrink = 16) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    const ux = dx / d;
    const uy = dy / d;
    return `M${a.x + ux * shrink} ${a.y + uy * shrink} L${b.x - ux * shrink} ${b.y - uy * shrink}`;
  };
  return (
    <svg viewBox="0 0 300 168" style={frame} role="img" aria-label="Everyone hunts the next person in a circle; catch yours and inherit their target">
      <defs>
        <marker id="arrowL" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill={MUTED} />
        </marker>
        <marker id="arrowG" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill={GOLD} />
        </marker>
      </defs>
      {pts.map((p, i) => {
        if (i === 0 || i === 1) return null; // drawn specially below
        return <path key={i} d={arc(p, pts[(i + 1) % n])} stroke={MUTED} strokeWidth="2" markerEnd="url(#arrowL)" />;
      })}
      {/* you (0) used to hunt 1; 1 is out; now you hunt 2 */}
      <path d={arc(pts[0], pts[1])} stroke={MUTED} strokeWidth="2" strokeDasharray="3 4" opacity="0.5" />
      <path d={arc(pts[1], pts[2])} stroke={MUTED} strokeWidth="2" strokeDasharray="3 4" opacity="0.5" />
      <path
        d={`M${pts[0].x + 14} ${pts[0].y + 8} Q ${cx + r + 34} ${cy - 30} ${pts[2].x + 10} ${pts[2].y - 14}`}
        stroke={GOLD}
        strokeWidth="3"
        fill="none"
        markerEnd="url(#arrowG)"
      />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="12" fill={i === 0 ? GOLD : i === 1 ? PANEL : MUTED} stroke={i === 1 ? BAD : "none"} strokeWidth="2" />
          {i === 1 && <path d={`M${p.x - 6} ${p.y - 6} L${p.x + 6} ${p.y + 6} M${p.x + 6} ${p.y - 6} L${p.x - 6} ${p.y + 6}`} stroke={BAD} strokeWidth="2.5" strokeLinecap="round" />}
        </g>
      ))}
      <text x={pts[0].x} y={pts[0].y - 18} textAnchor="middle" fontSize="11" fill={GOLD} fontWeight="700">
        you
      </text>
    </svg>
  );
}

/** 5. Someone is hunting you. Guess who: right = they're out; wrong = nothing (bonus action spent). */
export function AccuseArt() {
  return (
    <svg viewBox="0 0 300 180" style={frame} role="img" aria-label="Guess who is hunting you. Right: they are out. Wrong: nothing happens.">
      <Person x={150} y={60} color={GOLD} label="you" />
      <g transform="translate(150 60)">
        <circle cx="-62" cy="-14" r="16" fill={PANEL} stroke={MUTED} strokeDasharray="3 3" />
        <text x="-62" y="-8" textAnchor="middle" fontSize="16" fontWeight="700" fill={MUTED}>
          ?
        </text>
        <path d="M-44 -10 L-22 -8" stroke={MUTED} strokeWidth="2" strokeDasharray="3 3" />
      </g>
      <g transform="translate(14 112)">
        <rect x="0" y="0" width="128" height="58" rx="10" fill={PANEL} stroke={OK} />
        <path d="M14 30 l7 7 l13 -15" stroke={OK} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="42" y="25" fontSize="11" fontWeight="700" fill={OK}>
          Right guess
        </text>
        <text x="42" y="41" fontSize="11" fill={INK}>
          they&apos;re out
        </text>
      </g>
      <g transform="translate(158 112)">
        <rect x="0" y="0" width="128" height="58" rx="10" fill={PANEL} stroke={BAD} />
        <path d="M16 20 l14 14 M30 20 l-14 14" stroke={BAD} strokeWidth="3.5" strokeLinecap="round" />
        <text x="42" y="25" fontSize="11" fontWeight="700" fill={BAD}>
          Wrong guess
        </text>
        <text x="42" y="41" fontSize="11" fill={INK}>
          no effect
        </text>
      </g>
    </svg>
  );
}

/** 6. Caught? Become a ghost: bet on the winner and send one anonymous tip. */
export function GhostArt() {
  return (
    <svg viewBox="0 0 300 150" style={frame} role="img" aria-label="If you are out you become a ghost: bet on the winner and send one anonymous tip">
      <g transform="translate(150 70)">
        <path d="M-26 34 V-6 A26 26 0 0 1 26 -6 V34 l-9 -8 l-8 8 l-9 -8 l-9 8 l-8 -8 z" fill={INK} opacity="0.9" />
        <circle cx="-9" cy="-4" r="4" fill="var(--bg)" />
        <circle cx="9" cy="-4" r="4" fill="var(--bg)" />
      </g>
      <g transform="translate(30 44)">
        <circle cx="26" cy="26" r="26" fill={PANEL} stroke={GOLD} strokeWidth="2" />
        <text x="26" y="33" textAnchor="middle" fontSize="20">
          🔮
        </text>
        <text x="26" y="72" textAnchor="middle" fontSize="11" fill={MUTED}>
          bet on a winner
        </text>
      </g>
      <g transform="translate(218 44)">
        <rect x="0" y="6" width="52" height="38" rx="5" fill={PANEL} stroke={GOLD} strokeWidth="2" />
        <path d="M0 8 L26 28 L52 8" stroke={GOLD} strokeWidth="2" fill="none" />
        <text x="26" y="72" textAnchor="middle" fontSize="11" fill={MUTED}>
          1 secret tip
        </text>
      </g>
    </svg>
  );
}

/** 7. When time's up, the most catches wins the green card. */
export function WinArt() {
  return (
    <svg viewBox="0 0 300 150" style={frame} role="img" aria-label="When time runs out, the survivor with the most catches wins the green card">
      <g transform="translate(70 30)">
        <circle cx="30" cy="30" r="30" fill={PANEL} stroke={MUTED} strokeWidth="2" />
        <path d="M30 12 V30 L42 38" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
        <text x="30" y="84" textAnchor="middle" fontSize="11" fill={MUTED}>
          time&apos;s up
        </text>
      </g>
      <path d="M140 60 h16" stroke={MUTED} strokeWidth="3" strokeLinecap="round" />
      <path d="M154 53 l8 7 l-8 7" stroke={MUTED} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(168 22)">
        <rect x="0" y="0" width="96" height="62" rx="8" fill={OK} opacity="0.9" />
        <rect x="8" y="10" width="24" height="30" rx="3" fill="var(--bg)" opacity="0.35" />
        <rect x="40" y="12" width="46" height="6" rx="3" fill="var(--bg)" opacity="0.5" />
        <rect x="40" y="24" width="34" height="6" rx="3" fill="var(--bg)" opacity="0.5" />
        <text x="48" y="54" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--bg)" letterSpacing="1">
          GREEN CARD
        </text>
        <text x="48" y="92" textAnchor="middle" fontSize="11" fill={MUTED}>
          most catches wins
        </text>
      </g>
    </svg>
  );
}
