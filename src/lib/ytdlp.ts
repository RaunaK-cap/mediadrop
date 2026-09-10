import { YtDlp, type VideoInfo, type PlaylistInfo, type VideoFormat } from "ytdlp-nodejs";
import type { AnalyzeResponse, DownloadError, Format, MediaItem } from "@/types";

export let ytdlp = new YtDlp();

let ffmpegPromise: Promise<boolean> | null = null;

export function ensureFfmpeg(): Promise<boolean> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ok = await ytdlp.checkInstallationAsync({ ffmpeg: true }).catch(() => false);
      if (ok) return true;
      try {
        const ffmpegPath = await ytdlp.downloadFFmpeg();
        if (!ffmpegPath) return false;
        ytdlp = new YtDlp({ ffmpegPath });
        return await ytdlp.checkInstallationAsync({ ffmpeg: true }).catch(() => false);
      } catch {
        return false;
      }
    })();
  }
  return ffmpegPromise;
}

void ensureFfmpeg();

export function classifyError(error: unknown): DownloadError {
  const msg = String(error instanceof Error ? error.message : error).toLowerCase();
  const stderr = String((error as { stderr?: string }).stderr ?? "").toLowerCase();
  const combined = `${msg} ${stderr}`;

  if (
    /unsupported url|not a valid url|is not a valid url|invalid url|url is invalid|no suitable extractor/i.test(
      combined
    )
  ) {
    return "unknown_url";
  }
  if (
    /sign in to|login required|log in|cookies|authentication|private video|subscriber|members only|premium/i.test(
      combined
    )
  ) {
    return "login_required";
  }
  if (
    /unable to extract|extraction|format not available|requested format|no video formats found|this video is unavailable|video unavailable|not available in your country|geo-blocked/i.test(
      combined
    )
  ) {
    return "extraction_broke";
  }
  if (
    /enotfound|etimedout|econnrefused|network is unreachable|temporary failure in name resolution|getaddrinfo/i.test(
      combined
    )
  ) {
    return "network";
  }
  return "server";
}

export function normalizePlatform(info: VideoInfo | PlaylistInfo): string {
  const key = (info.extractor_key ?? info.extractor ?? "").toLowerCase();
  const map: Record<string, string> = {
    youtube: "YouTube",
    youtubetab: "YouTube",
    instagram: "Instagram",
    twitter: "X",
    x: "X",
    tiktok: "TikTok",
    reddit: "Reddit",
    vimeo: "Vimeo",
    twitch: "Twitch",
    facebook: "Facebook",
    soundcloud: "SoundCloud",
    dailymotion: "Dailymotion",
    pornhub: "Pornhub",
  };
  return map[key] ?? info.extractor_key ?? info.webpage_url_domain ?? "that site";
}

export function parseDuration(seconds: number | undefined): string | null {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseUploadDate(date: string | undefined): string | null {
  if (!date || date.length !== 8) return null;
  const y = date.slice(0, 4);
  const m = date.slice(4, 6);
  const d = date.slice(6, 8);
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

function pickThumbnail(info: VideoInfo | PlaylistInfo): string {
  const thumbs = "thumbnails" in info && Array.isArray(info.thumbnails) ? info.thumbnails : [];
  const last = thumbs[thumbs.length - 1];
  if (last && typeof last.url === "string") return last.url;
  if ("thumbnail" in info && typeof info.thumbnail === "string") return info.thumbnail;
  return "";
}

function bestAudio(formats: VideoFormat[]): VideoFormat | undefined {
  return formats
    .filter((f) => f.acodec !== "none" && f.vcodec === "none")
    .sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0];
}

function bestVideoAtOrBelow(formats: VideoFormat[], maxHeight: number): VideoFormat | undefined {
  return formats
    .filter((f) => f.vcodec !== "none" && (f.height ?? 0) > 0 && (f.height ?? 0) <= maxHeight)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0))[0];
}

function estimateBytes(
  entry: VideoInfo,
  spec: { filter: "mergevideo" | "audioonly"; height?: number; audioType?: string }
): number {
  const duration = entry.duration ?? 0;
  if (spec.filter === "audioonly") {
    const audio = bestAudio(entry.formats);
    return (
      audio?.filesize ??
      audio?.filesize_approx ??
      (duration > 0 ? duration * (audio?.abr ?? 128) * 1000 / 8 : 4 * 1024 * 1024)
    );
  }

  const height = spec.height ?? 1080;
  const video = bestVideoAtOrBelow(entry.formats, height);
  const audio = bestAudio(entry.formats);

  if (!video) {
    const fallback = entry.formats.find(
      (f) => f.vcodec !== "none" && f.acodec !== "none" && (f.height ?? 0) <= height
    );
    if (fallback?.filesize) return fallback.filesize;
    if (fallback?.filesize_approx) return fallback.filesize_approx;
    return duration > 0 ? duration * 2_000_000 / 8 : 0;
  }

  const vBytes =
    video.filesize ??
    video.filesize_approx ??
    (duration > 0 && video.tbr ? duration * video.tbr * 1000 / 8 : 0);
  const aBytes =
    audio?.filesize ??
    audio?.filesize_approx ??
    (duration > 0 ? duration * (audio?.abr ?? 128) * 1000 / 8 : 0);

  return vBytes + aBytes;
}

function buildFormats(entry: VideoInfo): Format[] {
  const videoFormats = entry.formats.filter((f) => f.vcodec !== "none" && (f.height ?? 0) > 0);
  const maxHeight = Math.max(0, ...videoFormats.map((f) => f.height ?? 0));

  const formats: Format[] = [];

  if (maxHeight >= 1080) {
    formats.push({
      id: "mp4-1080",
      label: "1080p — MP4",
      ext: "mp4",
      bytes: estimateBytes(entry, { filter: "mergevideo", height: 1080 }),
      audioOnly: false,
    });
  }

  if (maxHeight >= 720) {
    formats.push({
      id: "mp4-720",
      label: "720p — MP4",
      ext: "mp4",
      bytes: estimateBytes(entry, { filter: "mergevideo", height: 720 }),
      audioOnly: false,
    });
  } else if (maxHeight >= 480) {
    formats.push({
      id: "mp4-480",
      label: "480p — MP4",
      ext: "mp4",
      bytes: estimateBytes(entry, { filter: "mergevideo", height: 480 }),
      audioOnly: false,
    });
  } else if (maxHeight > 0) {
    formats.push({
      id: `mp4-${maxHeight}`,
      label: `${maxHeight}p — MP4`,
      ext: "mp4",
      bytes: estimateBytes(entry, { filter: "mergevideo", height: maxHeight }),
      audioOnly: false,
    });
  }

  if (formats.length < 2 && maxHeight > 0) {
    const lowerHeight = Math.floor(maxHeight * 0.6);
    if (lowerHeight >= 144 && !formats.some((f) => f.id === `mp4-${lowerHeight}`)) {
      formats.push({
        id: `mp4-${lowerHeight}`,
        label: `${lowerHeight}p — MP4`,
        ext: "mp4",
        bytes: estimateBytes(entry, { filter: "mergevideo", height: lowerHeight }),
        audioOnly: false,
      });
    }
  }

  formats.push({
    id: "mp3",
    label: "Audio only — MP3",
    ext: "mp3",
    bytes: estimateBytes(entry, { filter: "audioonly", audioType: "mp3" }),
    audioOnly: true,
  });

  return formats;
}

function mapEntryToItem(entry: VideoInfo, idx: number): MediaItem {
  const isImage =
    entry.duration === 0 ||
    entry.formats.length === 0 ||
    entry.formats.every((f) => f.vcodec === "none" && f.acodec === "none");

  return {
    index: idx,
    thumbnail: pickThumbnail(entry) || "",
    duration: parseDuration(entry.duration),
    isImage,
    formats: isImage
      ? [
          {
            id: "image",
            label: "Image — JPG",
            ext: "jpg",
            bytes: entry.filesize_approx ?? 0,
            audioOnly: false,
          },
        ]
      : buildFormats(entry),
  };
}

export function mapInfoToResponse(
  info: VideoInfo | PlaylistInfo,
  sourceUrl: string
): AnalyzeResponse {
  if (info._type === "playlist") {
    return {
      sourceUrl,
      platform: normalizePlatform(info),
      title: info.title ?? "",
      uploader: ((info as PlaylistInfo & { uploader?: string }).uploader) ?? null,
      uploadedAt: parseUploadDate((info as PlaylistInfo & { upload_date?: string }).upload_date),
      thumbnail: pickThumbnail(info),
      items: info.entries.map((entry, idx) => mapEntryToItem(entry as VideoInfo, idx)),
    };
  }

  return {
    sourceUrl,
    platform: normalizePlatform(info),
    title: info.title ?? "",
    uploader: info.uploader ?? null,
    uploadedAt: parseUploadDate(info.upload_date),
    thumbnail: pickThumbnail(info),
    items: [mapEntryToItem(info, 0)],
  };
}

export interface FormatSpec {
  filter: "mergevideo" | "audioonly";
  quality: string | number;
  type: string;
  ext: string;
  label: string;
}

export function parseFormatId(id: string): FormatSpec | null {
  if (id === "mp3") {
    return { filter: "audioonly", quality: 5, type: "mp3", ext: "mp3", label: "Audio only — MP3" };
  }
  if (id === "image") {
    return { filter: "mergevideo", quality: "highest", type: "mp4", ext: "jpg", label: "Image — JPG" };
  }

  const match = /^mp4-(\d+)$/.exec(id);
  if (match) {
    const height = match[1];
    return {
      filter: "mergevideo",
      quality: `${height}p`,
      type: "mp4",
      ext: "mp4",
      label: `${height}p — MP4`,
    };
  }

  return null;
}

export function sanitizeFilename(name: string, ext: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "mediadrop"}.${ext}`;
}

export function nodeStreamToWebStream(
  nodeStream: NodeJS.ReadableStream,
  onError?: (err: Error) => void
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer | string) => {
        controller.enqueue(typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => {
        onError?.(err);
        controller.error(err);
      });
    },
    cancel() {
      if ("destroy" in nodeStream && typeof nodeStream.destroy === "function") {
        nodeStream.destroy();
      }
    },
  });
}

export function safeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}
