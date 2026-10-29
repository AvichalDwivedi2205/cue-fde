import type { ButtonHTMLAttributes, ReactNode } from "react";
import { designIcons } from "@/lib/ui/design-icons";
export function Icon({
  name,
  size = 16,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "cue" ? 3.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{
        __html: designIcons[name] || designIcons.file,
      }}
    />
  );
}
export function Button({
  children,
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger" | "ghost";
}) {
  return (
    <button
      {...props}
      className={`ui-button ${variant === "primary" ? "ui-primary" : variant === "danger" ? "ui-danger" : variant === "ghost" ? "ui-ghost" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-0.5 text-[11px] leading-tight ${tone === "green" ? "border-cue-green/15 bg-cue-green-soft text-cue-green" : tone === "amber" ? "border-amber-600/15 bg-amber-50 text-amber-800" : tone === "red" ? "border-red-600/15 bg-red-50 text-red-700" : "border-cue-line bg-cue-sunken text-cue-muted"}`}
    >
      {children}
    </span>
  );
}
export function EmptyState({
  icon = "book",
  title,
  children,
  action,
}: {
  icon?: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-14 text-center">
      <span className="mb-4 rounded-xl bg-cue-sunken p-3 text-cue-subtle">
        <Icon name={icon} size={22} />
      </span>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-cue-muted">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`my-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${error ? "border-red-200 bg-red-50 text-red-800" : "border-cue-line bg-cue-panel text-cue-muted"}`}
    >
      <Icon name={error ? "alert" : "info"} size={14} />
      <div>{children}</div>
    </div>
  );
}
