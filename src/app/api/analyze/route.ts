import { NextRequest, NextResponse } from "next/server";
import type { AnalyzeResponse } from "@/types";

/**
 * POST /api/analyze
 * Body: { url: string }
 * Returns: AnalyzeResponse — media info + every available format.
 *
 * ─────────────────────────────────────────────────────────────
 * HOW TO IMPLEMENT THE REAL THING (replace the mock below):
 *
 * 1. Install the binary (not the npm package):
 *      bunx pip install yt-dlp        # or: brew install yt-dlp
 *    Pin the version in a setup script so builds are reproducible.
 *
 * 2. Spawn it with an ARGUMENT ARRAY (never a shell string —
 *    a pasted URL must never reach a shell):
 *
 *      import { spawn } from "node:child_process";
 *      const proc = spawn("yt-dlp", [
 *        "-J",               // dump metadata as JSON, download nothing
 *        "--no-playlist",
 *        "--no-warnings",
 *        url,                // ← safe: it's one argv element, not interpolated
 *      ]);
 *
 * 3. Collect stdout, JSON.parse it, then map yt-dlp's JSON into
 *    the `AnalyzeResponse` shape from src/types/index.ts:
 *      - info.title            → title
 *      - info.uploader         → uploader
 *      - info.extractor_key    → platform (e.g. "Instagram")
 *      - info.thumbnail        → thumbnail
 *      - info.entries          → items[] (playlists / carousels;
 *                                for a single video, wrap info itself)
 *      - info.formats[]        → formats[] per item:
 *          filter to ~3 best options (best MP4, smaller MP4, audio),
 *          format.height/abr/format_id/filesize → Format fields
 *
 * 4. Timeout after 30s (proc.kill()) and classify failures:
 *      "is not a valid URL"                  → unknown_url
 *      "requested format is not available"   → extraction_broke
 *      "login required" / "cookies"          → login_required
 *      ENOTFOUND / ETIMEDOUT                 → network
 *
 * 5. Rate-limit this route before deploying publicly (it spawns
 *    a process per request — bots will find it).
 *
 * The mock below returns a 3-item carousel so you can develop the
 * full UI before touching yt-dlp.
 * ─────────────────────────────────────────────────────────────
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PLATFORM_MAP: Record<string, string> = {
  youtube: "YouTube",
  "youtu.be": "YouTube",
  instagram: "Instagram",
  twitter: "X",
  "x.com": "X",
  tiktok: "TikTok",
  reddit: "Reddit",
  vimeo: "Vimeo",
};

// placeholder SVG thumbnails so the mock needs no network
const thumb = (fill: string, inner: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="${fill}"/>${inner}</svg>`
  )}`;

const MOCK: AnalyzeResponse = {
  sourceUrl: "",
  platform: "YouTube",
  title: "Sunrise over the western ridge — a timelapse",
  uploader: "@wanderinglens",
  uploadedAt: new Date(Date.now() - 3 * 864e5).toISOString(),
  thumbnail: thumb(
    "#8A9A8B",
    `<circle cx="320" cy="180" r="58" fill="#F2F0EA" opacity="0.9"/><path d="M305 155l45 25-45 25z" fill="#8A9A8B"/>`
  ),
  items: [
    {
      index: 0,
      thumbnail: thumb(
        "#8A9A8B",
        `<circle cx="320" cy="180" r="58" fill="#F2F0EA" opacity="0.9"/><path d="M305 155l45 25-45 25z" fill="#8A9A8B"/>`
      ),
      duration: "12:34",
      isImage: false,
      formats: [
        { id: "137+140", label: "1080p — MP4", ext: "mp4", bytes: 142 * 1024 * 1024, audioOnly: false },
        { id: "22", label: "720p — MP4", ext: "mp4", bytes: 68 * 1024 * 1024, audioOnly: false },
        { id: "mp3", label: "Audio only — MP3", ext: "mp3", bytes: 4.1 * 1024 * 1024, audioOnly: true },
      ],
    },
    {
      index: 1,
      thumbnail: thumb(
        "#B8A88F",
        `<rect x="80" y="90" width="200" height="180" rx="12" fill="#FAFAF9" opacity="0.85"/><rect x="330" y="130" width="230" height="140" rx="12" fill="#1B1B19" opacity="0.75"/>`
      ),
      duration: "0:48",
      isImage: false,
      formats: [
        { id: "137+140", label: "1080p — MP4", ext: "mp4", bytes: 96 * 1024 * 1024, audioOnly: false },
        { id: "22", label: "720p — MP4", ext: "mp4", bytes: 44 * 1024 * 1024, audioOnly: false },
        { id: "mp3", label: "Audio only — MP3", ext: "mp3", bytes: 3.2 * 1024 * 1024, audioOnly: true },
      ],
    },
    {
      index: 2,
      thumbnail: thumb(
        "#6E7B8B",
        `<path d="M0 300 Q160 220 320 270 T640 230 V360 H0 Z" fill="#F2F0EA" opacity="0.7"/>`
      ),
      duration: "3:05",
      isImage: false,
      formats: [
        { id: "137+140", label: "1080p — MP4", ext: "mp4", bytes: 58 * 1024 * 1024, audioOnly: false },
        { id: "22", label: "720p — MP4", ext: "mp4", bytes: 27 * 1024 * 1024, audioOnly: false },
        { id: "mp3", label: "Audio only — MP3", ext: "mp3", bytes: 2.6 * 1024 * 1024, audioOnly: true },
      ],
    },
  ],
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const url = body?.url?.trim();

  if (!url || !/^(https?:\/\/)?\w+\.\w+/.test(url)) {
    return NextResponse.json({ error: "unknown_url" }, { status: 400 });
  }

  // TODO(real-data): replace with the real platform detection —
  // with yt-dlp -J you get info.extractor_key directly; this regex
  // version is only here so the mock can say "Talking to YouTube…"
  const platform =
    Object.entries(PLATFORM_MAP).find(([host]) => url.toLowerCase().includes(host))?.[1] ?? "that site";

  // TODO(real-data): replace this setTimeout + mock return with the
  // yt-dlp spawn described in the comment block above. Keep the same
  // response shape (AnalyzeResponse) and the card UI keeps working.
  await new Promise((r) => setTimeout(r, 1200));

  // demo affordances: URLs containing these words trigger the error paths
  if (/login/i.test(url)) {
    return NextResponse.json({ error: "login_required" }, { status: 422 });
  }
  if (/broke/i.test(url)) {
    return NextResponse.json({ error: "extraction_broke" }, { status: 422 });
  }

  return NextResponse.json({ ...MOCK, sourceUrl: url, platform });
}
