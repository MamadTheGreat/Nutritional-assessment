import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

// فایل PDF منبع (ذخیره‌شده به‌صورت خصوصی) — لینک موقت برای مشاهده
export default function SourceFileLink({ fileUri }) {
  const [busy, setBusy] = useState(false);
  if (!fileUri) return null;

  async function open() {
    setBusy(true);
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri });
      window.open(signed_url, "_blank", "noopener");
    } catch (error) {
      toast.error("فایل باز نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="mt-1 inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
      متن کامل PDF
    </button>
  );
}
