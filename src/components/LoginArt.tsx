// A small, abstract ERD floating behind the sign-in card. Purely decorative and hidden from assistive
// tech. All motion is CSS (see .auth .art rules in globals.css): entrance, float, line draw-in and the
// packets travelling along the links via offset-path. No JavaScript ticker, so it never stalls.
const NODES = [
  { id: "a", x: 120, y: 140, w: 150, c: "#4c6fe8", rows: 3 },
  { id: "b", x: 420, y: 80, w: 150, c: "#15a393", rows: 2 },
  { id: "c", x: 760, y: 150, w: 150, c: "#d97b14", rows: 4 },
  { id: "d", x: 1080, y: 90, w: 150, c: "#9d5be0", rows: 3 },
  { id: "e", x: 1120, y: 520, w: 150, c: "#2aa35f", rows: 2 },
  { id: "f", x: 300, y: 560, w: 150, c: "#9d5be0", rows: 3 },
  { id: "g", x: 720, y: 600, w: 150, c: "#4c6fe8", rows: 2 },
];
const EDGES: [string, string][] = [
  ["a", "b"],
  ["b", "c"],
  ["c", "d"],
  ["c", "e"],
  ["a", "f"],
  ["f", "g"],
  ["g", "e"],
];

type Node = (typeof NODES)[number];
const byId: Record<string, Node> = Object.fromEntries(NODES.map((n) => [n.id, n]));

function center(n: Node) {
  return { x: n.x + n.w / 2, y: n.y + 14 + n.rows * 7 };
}
function edgePath([s, t]: [string, string]) {
  const a = center(byId[s]);
  const b = center(byId[t]);
  const k = Math.abs(b.x - a.x) * 0.5;
  return `M${a.x},${a.y} C${a.x + k},${a.y} ${b.x - k},${b.y} ${b.x},${b.y}`;
}

export default function LoginArt() {
  return (
    <svg className="art" viewBox="0 0 1300 760" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {EDGES.map((e, i) => (
        <path
          key={i}
          className="e"
          d={edgePath(e)}
          pathLength={1}
          fill="none"
          stroke="url(#lg)"
          strokeWidth="1.6"
          style={{ animationDelay: `${400 + i * 140}ms` }}
        />
      ))}
      {EDGES.slice(0, 4).map((e, i) => (
        <circle
          key={i}
          className="p"
          r="3.5"
          fill="#fff"
          style={{ offsetPath: `path("${edgePath(e)}")`, animationDuration: `${3.2 + i * 0.5}s`, animationDelay: `${0.9 + i * 0.3}s` }}
        />
      ))}
      {NODES.map((n, i) => (
        <g key={n.id} className="n" style={{ animationDelay: `${i * 110}ms, ${i * 240}ms` }}>
          <rect x={n.x} y={n.y} width={n.w} height={28 + n.rows * 14} rx="9" fill="rgba(16,22,42,.9)" stroke="rgba(255,255,255,.14)" />
          <rect x={n.x} y={n.y} width={n.w} height="22" rx="9" fill={n.c} />
          <rect x={n.x} y={n.y + 13} width={n.w} height="9" fill={n.c} />
          <rect x={n.x + 10} y={n.y + 8} width={n.w * 0.45} height="6" rx="3" fill="rgba(255,255,255,.85)" />
          {Array.from({ length: n.rows }).map((_, r) => (
            <g key={r}>
              <rect x={n.x + 10} y={n.y + 32 + r * 14} width={n.w * 0.5 - r * 10} height="5" rx="2.5" fill="rgba(255,255,255,.28)" />
              <rect x={n.x + n.w * 0.62} y={n.y + 32 + r * 14} width={n.w * 0.26} height="5" rx="2.5" fill="rgba(255,255,255,.14)" />
            </g>
          ))}
        </g>
      ))}
      <defs>
        <linearGradient id="lg" x1="0" x2="1">
          <stop offset="0" stopColor="#8b93ff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
    </svg>
  );
}
