import type { CSSProperties, HTMLAttributes } from "react";
import { cx } from "./cx";

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  /** Spacing step 1 to 6, maps to --space-N. */
  gap?: 1 | 2 | 3 | 4 | 5 | 6;
  direction?: "column" | "row";
}

export function Stack({ gap = 3, direction = "column", className, style, ...rest }: StackProps) {
  const s = { "--gap": `var(--space-${gap})`, ...style } as CSSProperties;
  return <div className={cx("mm-stack", direction === "row" && "mm-stack--row", className)} style={s} {...rest} />;
}
