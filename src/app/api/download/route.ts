import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ytdlp,
  ensureFfmpeg,
  classifyError,
  parseFormatId,
  nodeStreamToWebStream,
  safeUrl,
  DOWNLOAD_ACCEL,
} from "@/lib/ytdlp";

/**
 * GET /api/download?url=…&formatId=…&index=…&filename=…
 *
 * Downloads with yt-dlp into a private temp dir (so mp3 extraction and
 * mp4 merging actually run — yt-dlp skips post-processing when piping
 * to stdout) and then streams the finished file to the browser with an
 * exact Content-Length. The temp dir is removed as soon as the file
 * stream closes or the client aborts.
 *
 * The filename comes from the client (it already ran the analysis, so
 * no extra yt-dlp spawn is needed for the title). Playlist and carousel
 * items are resolved to their own URL via a flat playlist dump because
 * downloads run with --no-playlist.
 */

interface FlatEntry {
  url?: string;
  webpage_url?: string;
  title?: string;
}

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  png: "image/png",
  m4a: "audio/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
};

export async function GET(req: NextRequest) {
  const url = safeUrl(req.nextUrl.searchParams.get("url") ?? "");
  const formatId = req.nextUrl.searchParams.get("formatId");
  const index = Math.max(0, Number(req.nextUrl.searchParams.get("index") ?? 0));
  const requestedName = (req.nextUrl.searchParams.get("filename") ?? "").trim();

  if (!url || !formatId) {
    return Response.json({ error: "unknown_url" }, { status: 400 });
  }

  const spec = parseFormatId(formatId);
  if (!spec) {
    return Response.json({ error: "extraction_broke" }, { status: 422 });
  }

  // Start the (cached) ffmpeg check immediately so it overlaps the
  // playlist flat-dump below instead of running sequentially before it.
  const ffmpegPromise = ensureFfmpeg();

  try {
    let itemUrl = url;

    if (index > 0) {
      // flat dump: entries carry their own url + title without fetching
      // full metadata for every item before the one we want
      const result = await ytdlp.execAsync(url, {
        dumpSingleJson: true,
        flatPlaylist: true,
        playlistItems: String(index + 1),
        noWarnings: true,
        skipDownload: true,
        noCheckFormats: true,
        socketTimeout: 10,
      });
      const info = JSON.parse(result.output) as
        | (FlatEntry & { _type?: string; entries?: FlatEntry[] })
        | undefined;

      const entry =
        info?._type === "playlist" && Array.isArray(info.entries) && info.entries.length > 0
          ? info.entries[info.entries.length - 1]
          : info;
      itemUrl = entry?.url ?? entry?.webpage_url ?? itemUrl;

      if (!/^https?:\/\//i.test(itemUrl)) {
        return Response.json({ error: "extraction_broke" }, { status: 422 });
      }
    }

    const ffmpegOk = await ffmpegPromise;
    if (!ffmpegOk) {
      return Response.json({ error: "server" }, { status: 503 });
    }

    const dir = await mkdtemp(join(tmpdir(), "mediadrop-"));
    try {
      const builder = ytdlp.download(itemUrl, {
        output: join(dir, "media.%(ext)s"),
        format: spec.format,
        mergeOutputFormat: spec.mergeOutputFormat,
        formatSort: spec.formatSort,
        extractAudio: spec.extractAudio,
        audioFormat: spec.audioFormat,
        audioQuality: spec.audioQuality,
        noPlaylist: true,
        noWarnings: true,
        noProgress: true,
        ...DOWNLOAD_ACCEL,
      });

      // stop the yt-dlp process if the client hangs up mid-download
      const onAbort = () => builder.kill();
      req.signal.addEventListener("abort", onAbort);

      let filePath: string;
      try {
        const result = await builder.run();
        filePath = result.filePaths?.[0] ?? "";
        if (!filePath) {
          throw new Error("yt-dlp produced no file");
        }
      } finally {
        req.signal.removeEventListener("abort", onAbort);
      }

      const { size } = await stat(filePath);
      const ext = (filePath.split(".").pop() ?? spec.ext).toLowerCase();
      const contentType = MIME[ext] ?? "application/octet-stream";

      // keep the client's base name, but trust the actual container
      const base = requestedName.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^a-z0-9-]/gi, "-").replace(/^-+|-+$/g, "");
      const filename = `${base || "mediadrop"}.${ext}`;

      const fileStream = createReadStream(filePath, { highWaterMark: 1024 * 1024 });
      // 'close' fires on normal end AND on destroy() (client abort)
      fileStream.on("close", () => {
        rm(dir, { recursive: true, force: true }).catch(() => {});
      });

      const webStream = nodeStreamToWebStream(fileStream);

      return new Response(webStream, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(size),
          "X-Total-Bytes": String(size),
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  } catch (error) {
    const code = classifyError(error);
    return Response.json({ error: code }, { status: code === "unknown_url" ? 400 : 422 });
  }
}
