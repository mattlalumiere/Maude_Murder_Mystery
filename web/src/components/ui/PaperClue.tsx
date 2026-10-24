import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

export interface PaperClueProps {
  title: string;
  /** Small caps label, for example "Exhibit A". */
  label?: string;
  /** Red stamp text, for example "NEW". */
  stamp?: string;
  /** Rotation in degrees, keep within -3..3. */
  tilt?: number;
  animateIn?: boolean;
  className?: string;
  children?: ReactNode;
}

export function PaperClue({ title, label, stamp, tilt = -0.8, animateIn, className, children }: PaperClueProps) {
  const style = { "--tilt": `${Math.max(-3, Math.min(3, tilt))}deg` } as CSSProperties;
  return (
    <article className={cx("mm-paper", animateIn && "mm-paper--in", className)} style={style}>
      {stamp ? <span className="mm-paper__stamp">{stamp}</span> : null}
      {label ? <p className="mm-paper__label">{label}</p> : null}
      <h3 className="mm-paper__title">{title}</h3>
      <div className="mm-paper__body">{children}</div>
    </article>
  );
}
