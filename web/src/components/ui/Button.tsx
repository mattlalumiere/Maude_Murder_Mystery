import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "lg";
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function Button({ variant = "primary", size = "md", block, loading, disabled, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("mm-btn", variant !== "primary" && `mm-btn--${variant}`, size === "lg" && "mm-btn--lg", block && "mm-btn--block", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="mm-btn__spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
