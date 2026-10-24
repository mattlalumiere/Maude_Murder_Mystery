import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "gold" | "ghost" | "blood" | "good";
}

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return <span className={cx("mm-badge", tone !== "neutral" && `mm-badge--${tone}`, className)} {...rest} />;
}
