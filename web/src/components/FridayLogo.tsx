// Friday's mark: a stylised Iron-Man arc reactor. Uses the live accent colour
// (currentColor / hsl(var(--accent))) so it recolours with the theme.

export function FridayLogo({ className, glow = true }: { className?: string; glow?: boolean }) {
  return (
    <span className={`relative inline-flex items-center justify-center ${className ?? ""}`}>
      <svg viewBox="0 0 100 100" className={`h-full w-full ${glow ? "animate-pulse-ring" : ""}`} style={{ color: "hsl(var(--accent))" }} aria-label="Friday">
        <defs>
          <radialGradient id="frCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="1" />
            <stop offset="55%" stopColor="hsl(var(--accent))" stopOpacity="0.85" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.15" />
          </radialGradient>
        </defs>
        {/* outer ring */}
        <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.55" />
        <circle cx="50" cy="50" r="37" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
        {/* coil segments */}
        <g stroke="currentColor" strokeWidth="3.2" opacity="0.85" strokeLinecap="round">
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i * Math.PI * 2) / 8 - Math.PI / 2;
            const r1 = 23, r2 = 33;
            const x1 = 50 + Math.cos(a) * r1, y1 = 50 + Math.sin(a) * r1;
            const x2 = 50 + Math.cos(a) * r2, y2 = 50 + Math.sin(a) * r2;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>
        <circle cx="50" cy="50" r="22" fill="none" stroke="currentColor" strokeWidth="2.4" opacity="0.7" />
        {/* triangular core */}
        <polygon points="50,36 62,57 38,57" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.9" />
        <circle cx="50" cy="50" r="11" fill="url(#frCore)" />
        <circle cx="50" cy="50" r="4.5" fill="#fff" opacity="0.92" />
      </svg>
    </span>
  );
}
