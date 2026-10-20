import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { ApiError } from "@/lib/api";
import { Button } from "./Button";
import { Card } from "./Card";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function KpiSkeletonRow({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <Card key={i} className="min-h-[96px] p-5">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="mt-3 h-3 w-28" />
        </Card>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action, className = "" }: { icon?: ReactNode; title: string; body: string; action?: ReactNode; className?: string }) {
  return (
    <Card className={`flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`}>
      {icon && <div className="grid h-12 w-12 place-items-center rounded-full bg-tint-accent text-accent">{icon}</div>}
      <h3 className="font-display text-[20px] font-medium">{title}</h3>
      <p className="max-w-md text-[14px] text-muted-strong">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

export function ErrorState({ error, retry, className = "" }: { error: ApiError | Error | null; retry?: () => void; className?: string }) {
  if (!error) return null;
  const status = "status" in error && typeof error.status === "number" && error.status ? ` (HTTP ${error.status})` : "";
  return (
    <Card className={`flex flex-col gap-3 !border-danger/40 px-5 py-4 ${className}`} role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 flex-none text-danger" />
        <div>
          <div className="text-[14px] font-medium">Could not load this screen{status}</div>
          <div className="mt-1 break-words text-[13px] text-muted-strong">{error.message}</div>
        </div>
      </div>
      {retry && (
        <div>
          <Button variant="ghost" size="sm" onClick={retry}>
            <RefreshCw size={14} /> Retry
          </Button>
        </div>
      )}
    </Card>
  );
}

export function InlineError({ error }: { error: ApiError | Error | null }) {
  if (!error) return null;
  return (
    <p className="flex items-center gap-2 text-[13px] text-danger" role="alert">
      <AlertTriangle size={14} /> {error.message}
    </p>
  );
}
