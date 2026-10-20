"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Share2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { templateByKind } from "@/lib/deliverables";
import { agentByKey } from "@/lib/agents";
import { relTime } from "@/lib/format";
import { TopBar } from "@/components/shell/TopBar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { Markdown } from "@/components/ui/Markdown";

export default function DeliverablePage() {
  const { id } = useParams<{ id: string }>();
  const did = Number(id);
  const d = useAsync(() => api.deliverables.get(did), [did], Number.isFinite(did));

  const title = d.data?.title ?? "Deliverable";
  const subtitle = d.data
    ? `${templateByKind(d.data.kind)?.category ?? "Deliverable"} · generated ${relTime(d.data.created_at)} by ${agentByKey(d.data.generated_by)?.name ?? (d.data.generated_by || "orchestrator")}`
    : undefined;
  return (
    <>
      <TopBar
        title={title}
        subtitle={subtitle}
        actions={d.data && <>
          <Chip tone="accent">Complete</Chip>
          <Button variant="secondary" size="sm" onClick={() => (window.location.href = api.deliverables.exportUrl(d.data!.id, "md"))}><Download size={14} /> Markdown</Button>
          <Button variant="secondary" size="sm" onClick={() => (window.location.href = api.deliverables.exportUrl(d.data!.id, "html"))}><Share2 size={14} /> HTML</Button>
        </>}
      />
      <div className="p-6 md:p-8">
        <Link href="/templates" className="mb-5 inline-flex items-center gap-1 text-[13px] text-muted-strong hover:text-ink"><ArrowLeft size={14} /> All templates</Link>
        {d.loading && <Card className="p-6"><Skeleton className="h-10 w-72" /><Skeleton className="mt-6 h-96" /></Card>}
        {d.error && <ErrorState error={d.error} retry={d.reload} />}
        {d.data && <Card className="mx-auto max-w-[900px] p-6 md:p-10"><Markdown source={d.data.content_md} /></Card>}
      </div>
    </>
  );
}
