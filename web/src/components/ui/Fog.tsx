import type { CSSProperties } from "react";

export interface FogProps {
  /** 0 to 1, default 0.22. */
  opacity?: number;
}

/** Decorative drifting fog. Place inside a position:relative parent. Static under reduced motion. */
export function Fog({ opacity = 0.22 }: FogProps) {
  const style = { "--fog-opacity": opacity } as CSSProperties;
  return (
    <div className="mm-fog" style={style} aria-hidden="true">
      <div className="mm-fog__layer mm-fog__layer--a" />
      <div className="mm-fog__layer mm-fog__layer--b" />
    </div>
  );
}
