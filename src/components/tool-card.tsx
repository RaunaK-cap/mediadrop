"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { AnalyzeResponse } from "@/types";

/* ================================================================
   MediaDrop — the tool card (full state machine from the PRD §5)
   idle → analyzing → result → downloading → done, + error
   ================================================================ */

type CardState =
  | { state: "idle" }
  | { state: "analyzing"; url: string }
  | { state: "result"; data: AnalyzeResponse; itemIdx: number; fmtIdx: number }
  | { state: "downloading"; data: AnalyzeResponse; itemIdx: number; fmtIdx: number }
  | { state: "done"; data: AnalyzeResponse; itemIdx: number; fmtIdx: number }
  | { state: "error"; code: string; platform?: string };

type Action =
  | { type: "ANALYZE"; url: string }
  | { type: "ANALYZE_OK"; data: AnalyzeResponse }
  | { type: "ANALYZE_FAIL"; code: string; platform?: string }
  | { type: "SELECT_ITEM"; idx: number }
  | { type: "SELECT_FMT"; idx: number }
  | { type: "DOWNLOAD" }
  | { type: "DOWNLOAD_DONE"; data: AnalyzeResponse; itemIdx: number; fmtIdx: number }
  | { type: "DOWNLOAD_FAIL"; code: string }
  | { type: "RESET" };

function reducer(s: CardState, a: Action): CardState {
  switch (a.type) {
    case "ANALYZE":
      return { state: "analyzing", url: a.url };
    case "ANALYZE_OK":
      return { state: "result", data: a.data, itemIdx: 0, fmtIdx: 0 };
    case "ANALYZE_FAIL":
      return { state: "error", code: a.code, platform: a.platform };
    case "SELECT_ITEM":
      return s.state === "result" || s.state === "downloading"
        ? { ...s, itemIdx: a.idx, fmtIdx: 0 }
        : s;
    case "SELECT_FMT":
      return s.state === "result" ? { ...s, fmtIdx: a.idx } : s;
    case "DOWNLOAD":
      if (s.state === "result") return { ...s, state: "downloading" };
      return s;
    case "DOWNLOAD_DONE":
      return { state: "done", data: a.data, itemIdx: a.itemIdx, fmtIdx: a.fmtIdx };
    case "DOWNLOAD_FAIL":
      return { state: "error", code: a.code };
    case "RESET":
      return { state: "idle" };
    default:
      return s;
  }
}

/* ---------- friendly error copy (PRD §5.6) ---------- */
const ERROR_COPY: Record<string, (platform?: string) => string> = {
  unknown_url: () => "That doesn't look like a link we know. Double-check it and try again.",
  login_required: (p) => `${p ?? "That platform"} is asking for a login for this content — we can't reach it.`,
  extraction_broke: () => "We couldn't get this one — the site recently changed something. We're on it.",
  network: () => "We couldn't reach the site. Check the link or try again in a moment.",
  server: () => "Something went wrong on our side. Give it another try.",
};

/* ---------- helpers ---------- */
const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function platformOf(url: string): string {
  const u = url.toLowerCase();
  for (const p of ["instagram", "youtube", "youtu.be", "tiktok", "reddit", "vimeo", "twitter", "x.com"]) {
    if (u.includes(p)) return p === "x.com" ? "X" : p === "youtu.be" ? "YouTube" : p[0].toUpperCase() + p.slice(1);
  }
  return "that site";
}

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* ================================================================ */

export function ToolCard() {
  const [card, dispatch] = useReducer(reducer, { state: "idle" } as CardState);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reduced = useReducedMotion();

  const isIdle = card.state === "idle";
  const isDesktop = useRef(false);
  useEffect(() => {
    isDesktop.current = window.matchMedia("(hover: hover)").matches;
    if (isDesktop.current) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const analyze = useCallback(async (url: string) => {
    dispatch({ type: "ANALYZE", url });
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(30_000),
      });
      const json = await res.json();
      if (!res.ok) {
        dispatch({ type: "ANALYZE_FAIL", code: json.error ?? "server", platform: platformOf(url) });
        return;
      }
      dispatch({ type: "ANALYZE_OK", data: json as AnalyzeResponse });
    } catch (e) {
      dispatch({ type: "ANALYZE_FAIL", code: "network", platform: platformOf(url) });
    }
  }, []);

  /* ---------- download with real progress ---------- */
  const download = useCallback(
    async (data: AnalyzeResponse, itemIdx: number, fmtIdx: number) => {
      dispatch({ type: "DOWNLOAD" });
      const item = data.items[itemIdx];
      const fmt = item.formats[fmtIdx];
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `/api/download?url=${encodeURIComponent(data.sourceUrl)}&formatId=${encodeURIComponent(fmt.id)}&index=${itemIdx}`,
          { signal: controller.signal }
        );
        if (!res.ok || !res.body) {
          dispatch({ type: "DOWNLOAD_FAIL", code: "server" });
          return;
        }

        const reader = res.body.getReader();
        const total = Number(res.headers.get("X-Total-Bytes") ?? 0) || fmt.bytes || 0;
        let received = 0;
        const t0 = performance.now();
        let lastUi = 0;

        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          chunks.push(value);

          // throttle UI updates to ~2/s per PRD §8
          const now = performance.now();
          if (now - lastUi > 500) {
            lastUi = now;
            setProgress(received, total, (now - t0) / 1000);
          }
        }
        setProgress(received, total, (performance.now() - t0) / 1000, true);

        // hand the assembled blob to the browser as a saved file
        const blob = new Blob(chunks, { type: res.headers.get("Content-Type") ?? "application/octet-stream" });
        const cd = res.headers.get("Content-Disposition") ?? "";
        const nameMatch = /filename="?([^";]+)"?/.exec(cd);
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = nameMatch?.[1] ?? `download.${fmt.ext}`;
        a.click();
        URL.revokeObjectURL(blobUrl);

        dispatch({ type: "DOWNLOAD_DONE", data, itemIdx, fmtIdx });
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          dispatch({ type: "RESET" });
        } else {
          dispatch({ type: "DOWNLOAD_FAIL", code: "network" });
        }
      } finally {
        abortRef.current = null;
      }
    },
    []
  );

  const [progress, setProgressState] = useReducer(
    (
      _: Progress | null,
      p: Progress | null
    ) => p,
    null
  );
  type Progress = { received: number; total: number; speed: number; eta: number; done: boolean };
  function setProgress(received: number, total: number, elapsed: number, done = false) {
    const speed = elapsed > 0 ? received / elapsed : 0;
    const eta = speed > 0 && total > received ? (total - received) / speed : 0;
    setProgressState({ received, total, speed, eta, done });
  }

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  /* ---------- global paste-to-input (PRD §5.1) ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && document.activeElement !== inputRef.current) {
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- derived ---------- */
  const currentItem = useMemo(
    () => (card.state !== "idle" && card.state !== "analyzing" && card.state !== "error" ? card.data.items[card.itemIdx] : null),
    [card]
  );
  const currentFmt = useMemo(() => (currentItem ? currentItem.formats[card.state === "idle" ? 0 : ("fmtIdx" in card ? card.fmtIdx : 0)] : null), [card, currentItem]);

  const onPasteBtn = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && inputRef.current) {
        inputRef.current.value = text.trim();
        inputRef.current.focus();
      }
    } catch {
      inputRef.current?.focus();
    }
  }, []);

  return (
    <motion.section
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
      className={cn(
        "relative z-10 -mt-16 rounded-xs border border-hairline bg-card p-4 card-shadow md:-mt-50 md:p-5",
        "transition-transform duration-150",
        isIdle && "md:hover:-translate-y-0.5"
      )}
      aria-label="Media downloader"
    >
      {/* ---------- input row — persistent across all states ---------- */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (card.state === "idle" || card.state === "error") {
            const v = inputRef.current?.value.trim();
            if (v) analyze(v);
          }
        }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          spellCheck={false}
          placeholder="Paste a video or post URL"
          aria-label="Media URL"
          disabled={card.state === "analyzing" || card.state === "downloading"}
          className="tnums h-9.5 min-w-0 flex-1 rounded-lg border border-hairline bg-background px-3.5 text-[13px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-3 focus:border-ink disabled:text-ink-2"
        />
        <PasteButton onPaste={onPasteBtn} />
        <button
          type="submit"
          disabled={card.state === "analyzing" || card.state === "downloading"}
          className="flex h-9.5 items-center gap-2 rounded-lg bg-btn-ink px-4 text-[13px] font-semibold text-btn-text transition-[transform,opacity] duration-100 active:scale-95 hover:opacity-88 disabled:cursor-default disabled:opacity-50"
        >
          {card.state === "analyzing" ? <Spinner /> : "Go"}
        </button>
      </form>
      <p className="mt-2.5 text-xs text-ink-3">
        {card.state === "idle" ? "Works with YouTube, Instagram, X and 1000+ more sites" : "\u00A0"}
      </p>

      {/* ---------- state area ---------- */}
      <div className="mt-4">
        {card.state === "idle" && <IdleHint />}

        {card.state === "analyzing" && (
          <div aria-busy="true">
            <p className="mb-3 text-xs text-ink-3">Talking to {platformOf(card.url)}…</p>
            <div className="skeleton aspect-video max-h-[180px] w-full rounded-lg" />
            <div className="skeleton mt-3 h-3.5 w-3/5 rounded" />
            <div className="skeleton mt-3 h-3.5 w-1/3 rounded" />
          </div>
        )}

        {card.state === "result" && card.data && currentItem && (
          <motion.div
            key="result"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <MediaHeader data={card.data} item={currentItem} />
            {card.data.items.length > 1 && (
              <Carousel
                items={card.data.items}
                selected={card.itemIdx}
                onSelect={(i) => dispatch({ type: "SELECT_ITEM", idx: i })}
              />
            )}
            <FormatList
              formats={currentItem.formats}
              selected={card.fmtIdx}
              onSelect={(i) => dispatch({ type: "SELECT_FMT", idx: i })}
            />
            <div className="mt-3.5 flex items-center gap-2">
              <button
                onClick={() => download(card.data, card.itemIdx, card.fmtIdx)}
                className="flex h-9.5 flex-1 items-center justify-center gap-2 rounded-lg bg-btn-ink px-4 text-[13px] font-semibold text-btn-text transition-[transform,opacity] duration-100 active:scale-95 hover:opacity-88"
              >
                <DownloadIcon /> Download
              </button>
              <IconAction label="Save thumbnail" onClick={() => void 0}>
                <ImageIcon />
              </IconAction>
              <IconAction label="Copy direct link" onClick={() => void 0}>
                <LinkIcon />
              </IconAction>
            </div>
            <ResetLink onClick={() => reset(dispatch, inputRef)}>Analyze another</ResetLink>
          </motion.div>
        )}

        {card.state === "downloading" && card.data && currentFmt && (
          <div>
            <ProgressView progress={progress} total={currentFmt.bytes} onCancel={cancel} />
          </div>
        )}

        {card.state === "done" && card.data && (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.24 }}>
            <div className="flex items-center gap-4 px-0.5 pb-3.5 pt-2">
              <DoneRing />
              <div className="min-w-0">
                <p className="tnums text-sm font-semibold">
                  Saved — <span className="font-normal text-ink-2">{doneFilename(card, currentFmt)}</span>
                </p>
                <p className="tnums mt-0.5 text-xs text-ink-3">Downloaded from {card.data.platform}</p>
              </div>
            </div>
            <div className="mt-1 flex">
              <button
                onClick={() => reset(dispatch, inputRef)}
                className="h-9.5 flex-1 rounded-lg bg-btn-ink text-[13px] font-semibold text-btn-text transition-[transform,opacity] duration-100 active:scale-95 hover:opacity-88"
              >
                Download another
              </button>
            </div>
          </motion.div>
        )}

        {card.state === "error" && (
          <div role="alert">
            <div className="flex items-start gap-2.5 px-0.5 pb-1.5 pt-1">
              <AlertIcon />
              <p className="text-xs leading-relaxed text-danger">
                {(ERROR_COPY[card.code] ?? ERROR_COPY.server)(card.platform)}
              </p>
            </div>
            <ResetLink onClick={() => reset(dispatch, inputRef)}>Try again</ResetLink>
          </div>
        )}
      </div>
    </motion.section>
  );
}

/* ================================================================
   subcomponents
   ================================================================ */

function reset(dispatch: React.Dispatch<Action>, inputRef: React.RefObject<HTMLInputElement | null>) {
  dispatch({ type: "RESET" });
  requestAnimationFrame(() => inputRef.current?.select());
}

function doneFilename(card: CardState, fmt: { ext: string } | null) {
  if (card.state !== "done" || !fmt) return "";
  const base = card.data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${base}.${fmt.ext}`;
}

function IdleHint() {
  return null; // helper text lives under the input row
}

function Spinner() {
  return (
    <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-btn-text border-t-transparent opacity-90" />
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" />
    </svg>
  );
}
function ImageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 text-danger">
      <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
    </svg>
  );
}

function PasteButton({ onPaste }: { onPaste: () => void }) {
  const [ok, setOk] = useStateSafe(false);
  return (
    <button
      type="button"
      onClick={() => {
        onPaste();
        setOk(true);
        setTimeout(() => setOk(false), 1000);
      }}
      aria-label="Paste from clipboard"
      title="Paste"
      className={cn(
        "grid size-9.5 shrink-0 place-items-center rounded-lg border border-hairline text-ink-2 transition-[border-color,color,transform] duration-100 active:scale-95",
        ok ? "border-accent text-accent" : "hover:border-ink-2 hover:text-ink"
      )}
    >
      {ok ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 13 2 2 4-4" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        </svg>
      )}
    </button>
  );
}

// tiny useState wrapper so the file stays import-light
import { useState } from "react";
function useStateSafe(initial: boolean) {
  const [v, setV] = useState(initial);
  return [v, setV] as const;
}

function MediaHeader({ data, item }: { data: AnalyzeResponse; item: AnalyzeResponse["items"][number] }) {
  return (
    <div>
      <div className="relative aspect-video max-h-[180px] w-full overflow-hidden rounded-lg bg-tint">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.thumbnail} alt="" width={640} height={360} className="h-full w-full object-cover" />
        {item.duration && (
          <span className="tnums absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {item.duration}
          </span>
        )}
      </div>
      <p className="mt-3 line-clamp-2 text-sm font-semibold tracking-tight">{data.title}</p>
      <p className="tnums mt-1 text-xs text-ink-3">
        {[data.uploader, relativeDate(data.uploadedAt), data.platform].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

function Carousel({
  items,
  selected,
  onSelect,
}: {
  items: AnalyzeResponse["items"];
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="mt-3.5 flex items-center gap-2.5">
      <span className="tnums shrink-0 text-xs text-ink-3">
        {selected + 1}/{items.length}
      </span>
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            aria-label={`Media item ${i + 1}`}
            aria-current={i === selected}
            className={cn(
              "h-8.5 w-[52px] shrink-0 overflow-hidden rounded-md border transition-colors duration-100",
              i === selected ? "border-ink shadow-[inset_0_0_0_1px_var(--ink)]" : "border-hairline"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.thumbnail} alt="" width={52} height={34} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function FormatList({
  formats,
  selected,
  onSelect,
}: {
  formats: AnalyzeResponse["items"][number]["formats"];
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Choose a format" className="mt-3.5 flex flex-col gap-1.5"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const dir = e.key === "ArrowDown" ? 1 : -1;
          const next = (selected + dir + formats.length) % formats.length;
          onSelect(next);
          (e.currentTarget.querySelector(`[data-idx="${next}"]`) as HTMLButtonElement | null)?.focus();
        }
      }}
    >
      {formats.map((f, i) => (
        <button
          key={f.id}
          data-idx={i}
          role="radio"
          aria-checked={i === selected}
          tabIndex={i === selected ? 0 : -1}
          onClick={() => onSelect(i)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-left text-[13px] text-ink transition-colors duration-100 hover:bg-tint",
            i === selected ? "border-ink" : "border-hairline"
          )}
        >
          <span className={cn("grid size-3.5 shrink-0 place-items-center rounded-full border", i === selected ? "border-ink" : "border-ink-3")}>
            <span className={cn("size-[7px] rounded-full bg-ink transition-transform duration-100", i === selected ? "scale-100" : "scale-0")} />
          </span>
          <span className="min-w-0 flex-1">{f.label}</span>
          {f.bytes > 0 && <span className="tnums shrink-0 text-xs text-ink-3">{mb(f.bytes)}</span>}
        </button>
      ))}
    </div>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  const [ok, setOk] = useStateSafe(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        onClick();
        setOk(true);
        setTimeout(() => setOk(false), 1000);
      }}
      className={cn(
        "grid size-9.5 shrink-0 place-items-center rounded-lg border border-hairline text-ink-2 transition-[border-color,color,transform] duration-100 active:scale-95",
        ok ? "border-accent text-accent" : "hover:border-ink-2 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

function ResetLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="mx-auto mt-2.5 block px-1 py-2 text-xs text-ink-3 transition-colors duration-100 hover:text-ink-2"
    >
      {children}
    </button>
  );
}

/* ---------- downloading: ring + readout + track ---------- */

type Progress = { received: number; total: number; speed: number; eta: number; done: boolean };

function ProgressView({ progress, total, onCancel }: { progress: Progress | null; total: number; onCancel: () => void }) {
  const p = progress;
  const totalBytes = p?.total || total || 0;
  const pct = totalBytes > 0 ? Math.min(100, ((p?.received ?? 0) / totalBytes) * 100) : 0;
  const C = 2 * Math.PI * 15.5;

  return (
    <div>
      <div className="flex items-center gap-4 px-0.5 pb-3.5 pt-2">
        <div className="relative size-9 shrink-0">
          <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-hairline" />
            <circle
              cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round"
              className="stroke-accent transition-[stroke-dashoffset] duration-200"
              strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-ink-2">
            <DownloadIcon />
          </div>
        </div>
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="tnums text-sm font-semibold">
            {mb(p?.received ?? 0)} / {totalBytes > 0 ? mb(totalBytes) : "…"}
          </p>
          <p className="tnums mt-0.5 text-xs text-ink-3">
            {p && p.speed > 0
              ? `${mb(p.speed)}/s · ${p.eta > 0 ? `${Math.ceil(p.eta)}s left` : "finishing"} · ${Math.round(pct)}%`
              : "starting…"}
          </p>
        </div>
        <button
          onClick={onCancel}
          aria-label="Cancel download"
          className="grid size-9.5 shrink-0 place-items-center rounded-lg border border-hairline text-ink-2 transition-[border-color,color,transform] duration-100 hover:border-ink-2 hover:text-ink active:scale-95"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="h-[3px] overflow-hidden rounded-full bg-tint">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        />
      </div>
    </div>
  );
}

function DoneRing() {
  return (
    <div className="size-9 shrink-0">
      <svg width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--accent)" strokeWidth="3" />
        <motion.path
          d="M12 18.5l4 4 8-9"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ strokeDashoffset: 24, strokeDasharray: 24 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </svg>
    </div>
  );
}
