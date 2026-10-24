import { cloneElement, isValidElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** A single input, select or textarea. Field wires id and aria attributes onto it. */
  children: ReactElement<Record<string, unknown>>;
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        className: ["mm-field__input", children.props.className].filter(Boolean).join(" "),
        required: required || undefined,
        "aria-required": required || undefined,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })
    : children;
  return (
    <div className="mm-field">
      <label className="mm-field__label" htmlFor={id}>
        {label}
        {required ? <span className="mm-field__req" aria-hidden="true"> *</span> : null}
      </label>
      {control}
      {hint ? <p id={hintId} className="mm-field__hint">{hint}</p> : null}
      {error ? <p id={errId} className="mm-field__error" role="alert">{error}</p> : null}
    </div>
  );
}
