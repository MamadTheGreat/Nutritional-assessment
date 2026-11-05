import { Camera, FileUp, Loader2, X } from "lucide-react";
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { extractLabs } from "@/lib/server-fns";

const MAX_FILES = 6;

// چند عکس برگه آزمایش: آپلود خصوصی، استخراج نتایج و نگه‌داشتن تصاویر در بخش آزمایش‌ها
export default function LabImport({ value = [], onChange, onExtracted }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function handleFiles(event) {
    const picked = Array.from(event.target.files || []);
    if (!picked.length) return;
    const batch = picked.slice(0, Math.max(0, MAX_FILES - value.length));
    if (!batch.length) {
      setStatus(`حداکثر ${MAX_FILES} تصویر`);
      event.target.value = "";
      return;
    }
    setBusy(true);
    setStatus("");
    const added = [];
    const collected = [];
    try {
      for (const file of batch) {
        const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
        const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 3600 });
        added.push({ uri: file_uri, url: signed_url, name: file.name });
        onChange([...value, ...added]);
        const res = await extractLabs({ data: { fileUrl: signed_url } });
        if (res.error) setStatus(res.error);
        collected.push(...(res.labs || []));
      }
      const flagged = collected.filter((l) => l.abnormal);
      const chosen = flagged.length ? flagged : collected;
      if (chosen.length) {
        const text = chosen
          .map((l) => {
            const val = [l.value, l.unit].filter(Boolean).join(" ");
            return `${l.name}: ${val}${l.reference ? ` (نرمال: ${l.reference})` : ""}`;
          })
          .join("\n");
        onExtracted(text);
        setStatus(`${chosen.length} مورد استخراج شد — بررسی و تأیید کنید`);
      } else {
        setStatus("موردی استخراج نشد؛ دستی وارد کنید");
      }
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  function remove(uri) {
    onChange(value.filter((f) => f.uri !== uri));
  }

  const inputClass = "hidden";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          عکس برگه آزمایش
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className={inputClass}
            onChange={handleFiles}
            disabled={busy}
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted">
          <FileUp className="h-3.5 w-3.5" />
          فایل / گالری
          <input
            type="file"
            accept="image/*,.pdf,.csv"
            multiple
            className={inputClass}
            onChange={handleFiles}
            disabled={busy}
          />
        </label>
        <span className="num text-[10px] text-muted-foreground">
          {value.length}/{MAX_FILES}
        </span>
        {status ? <span className="text-[10.5px] text-muted-foreground">{status}</span> : null}
      </div>

      {value.length ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((f) => (
            <li key={f.uri} className="relative">
              {/\.pdf$/i.test(f.name || "") ? (
                <div className="grid h-16 w-16 place-items-center rounded-lg border border-border bg-muted text-[9px] text-muted-foreground">
                  PDF
                </div>
              ) : (
                <Image
                  src={f.url}
                  alt={f.name || "برگه آزمایش"}
                  className="h-16 w-16 rounded-lg border border-border"
                  fittingType="fill"
                />
              )}
              <button
                type="button"
                onClick={() => remove(f.uri)}
                aria-label="حذف تصویر"
                className="absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
