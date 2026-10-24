import type { CSSProperties } from "react";
import { cx } from "./cx";

export interface WaxSealProps {
  /** One or two characters shown in the seal. */
  mark?: string;
  size?: number;
  color?: "red" | "gold";
  /** Plays the stamp animation once. */
  press?: boolean;
  /** Accessible name. Decorative when omitted. */
  label?: string;
  /** Renders a button when provided. */
  onPress?: () => void;
  className?: string;
}

export function WaxSeal({ mark = "M", size = 64, color = "red", press, label, onPress, className }: WaxSealProps) {
  const style = { "--size": `${Math.max(44, size)}px` } as CSSProperties;
  const cls = cx("mm-seal", color === "gold" && "mm-seal--gold", press && "mm-seal--press", className);
  if (onPress) {
    return (
      <button type="button" className={cls} style={style} onClick={onPress} aria-label={label ?? mark}>
        <span aria-hidden="true">{mark}</span>
      </button>
    );
  }
  return (
    <span className={cls} style={style} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span aria-hidden="true">{mark}</span>
    </span>
  );
}
