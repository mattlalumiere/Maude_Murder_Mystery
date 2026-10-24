import type { CSSProperties } from "react";

export interface CandleProps {
  /** Scale factor, 1 is 24x56 px. */
  scale?: number;
}

/** Decorative CSS-only candle with a flickering flame. */
export function Candle({ scale = 1 }: CandleProps) {
  const style = { "--s": scale } as CSSProperties;
  return (
    <span className="mm-candle" style={style} aria-hidden="true">
      <span className="mm-candle__flame" />
      <span className="mm-candle__body" />
    </span>
  );
}
