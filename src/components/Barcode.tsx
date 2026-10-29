import React from "react";

// Minimal Code 39 renderer (no dependency). It encodes exactly what a gym card
// needs: uppercase letters, digits and the `-`, `.`, `$`, `/`, `+`, `%` and
// space characters. The member code is the barcode value, so no new database
// column is required.

const PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  $: "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};

const NARROW = 1;
const WIDE = 3;
const GAP = 1;
const QUIET = 10;

export function normalizeBarcodeValue(value: string): string {
  const normalized = [...value.trim().toUpperCase()]
    .filter((char) => char !== "*" && Boolean(PATTERNS[char]))
    .join("");
  return normalized || "MEMBER";
}

interface BarcodeProps {
  value: string;
  height?: number;
  showValue?: boolean;
  className?: string;
}

export const Barcode: React.FC<BarcodeProps> = ({
  value,
  height = 64,
  showValue = true,
  className = "",
}) => {
  const normalized = normalizeBarcodeValue(value);
  const characters = `*${normalized}*`;

  const bars: Array<{ x: number; width: number }> = [];
  let cursor = QUIET;

  for (const character of characters) {
    const pattern = PATTERNS[character];
    if (!pattern) continue;

    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === "w" ? WIDE : NARROW;
      // Even indexes are bars, odd indexes are spaces.
      if (index % 2 === 0) bars.push({ x: cursor, width });
      cursor += width;
    }
    cursor += GAP;
  }

  const viewWidth = cursor + QUIET;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${viewWidth} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        role="img"
        aria-label={`Barcode ${normalized}`}
        className="text-primary"
      >
        <title>{`Barcode ${normalized}`}</title>
        {bars.map((bar, index) => (
          <rect
            key={index}
            x={bar.x}
            y={0}
            width={bar.width}
            height={height}
            fill="currentColor"
          />
        ))}
      </svg>
      {showValue && (
        <div className="text-center font-mono text-[11px] tracking-[0.35em] text-primary mt-1">
          {normalized}
        </div>
      )}
    </div>
  );
};
