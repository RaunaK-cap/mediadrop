import { NextRequest } from "next/server";
import { PassThrough } from "node:stream";
import {
  ytdlp,
  ensureFfmpeg,
  classifyError,
  parseFormatId,
  sanitizeFilename,
  nodeStreamToWebStream,
  safeUrl,
} from "@/lib/ytdlp";
import type { VideoInfo } from "ytdlp-nodejs";

/**
 * GET /api/download?url=…&formatId=…&index=…
 *
 * Streams the media file to the browser as an attachment using
 * ytdlp-nodejs. Playlist/carousel items are resolved to their own
 * URLs before streaming because the stream builder treats every URL
 * as a single video.
 */

export async function GET(req: NextRequest) {
  const url = safeUrl(req.nextUrl.searchParams.get("url") ?? "");
  const formatId = req.nextUrl.searchParams.get("formatId");
  const index = Math.max(0, Number(req.nextUrl.searchParams.get("index") ?? 0));

  if (!url || !formatId) {
    return Response.json({ error: "unknown_url" }, { status: 400 });
  }

  const spec = parseFormatId(formatId);
  if (!spec) {
    return Response.json({ error: "extraction_broke" }, { status: 422 });
  }

  const ffmpegOk = await ensureFfmpeg();
  if (!ffmpegOk) {
    return Response.json({ error: "server" }, { status: 503 });
  }

  try {
    let itemUrl = url;
    let title = "mediadrop";

    if (index > 0) {
      const itemResult = await ytdlp.execAsync(url, {
        dumpSingleJson: true,
        noWarnings: true,
        playlistItems: String(index + 1),
      });
      const itemInfo = JSON.parse(itemResult.output) as VideoInfo | undefined;
      if (itemInfo && typeof itemInfo === "object") {
        itemUrl =
          itemInfo.original_url ??
          itemInfo.webpage_url ??
          itemUrl;
        title = itemInfo.title ?? title;
      }
    } else {
      try {
        title = (await ytdlp.getTitleAsync(url)) || title;
      } catch {
        // ignore: title is only used for filename
      }
    }

    const streamBuilder = ytdlp.stream(itemUrl).format({
      filter: spec.filter,
      quality: spec.quality,
      type: spec.type,
    } as NonNullable<NonNullable<Parameters<typeof ytdlp.stream>[1]>["format"]>);

    const nodeStream = streamBuilder.getStream();
    const passThrough = new PassThrough();
    nodeStream.pipe(passThrough);

    const webStream = nodeStreamToWebStream(passThrough, (err) => {
      console.error("[download] stream error:", err);
      try {
        passThrough.destroy(err);
      } catch {
        // ignore
      }
    });

    const filename = sanitizeFilename(title, spec.ext);
    const contentType = spec.ext === "mp3" ? "audio/mpeg" : spec.ext === "jpg" ? "image/jpeg" : "video/mp4";

    return new Response(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const code = classifyError(error);
    return Response.json({ error: code }, { status: code === "unknown_url" ? 400 : 422 });
  }
}
