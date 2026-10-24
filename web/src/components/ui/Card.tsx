import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  /** "secret" gets the gold border used for private role cards. */
  tone?: "default" | "secret" | "glow";
  as?: "section" | "article" | "div";
}

export function Card({ title, tone = "default", as: Tag = "section", className, children, ...rest }: CardProps) {
  return (
    <Tag className={cx("mm-card", tone !== "default" && `mm-card--${tone}`, className)} {...rest}>
      {title ? <h2 className="mm-card__title">{title}</h2> : null}
      {children}
    </Tag>
  );
}
