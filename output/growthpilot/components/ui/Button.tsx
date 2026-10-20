import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "link";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  href?: string;
  size?: "sm" | "md";
  children: ReactNode;
}

export function Button({ variant = "primary", href, size = "md", className = "", children, type = "button", ...rest }: Props) {
  const base = variant === "link" ? "btn-link" : `btn btn-${variant} ${size === "sm" ? "!h-9 px-4 text-[13px]" : ""}`;
  const cls = `${base} ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className = "",
  outline = false,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; outline?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} className={`icon-btn ${outline ? "icon-btn-outline" : ""} ${className}`} {...rest}>
      {children}
    </button>
  );
}
