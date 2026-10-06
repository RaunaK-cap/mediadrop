import { NextRequest, NextResponse } from "next/server";
import { ytdlp, classifyError, mapInfoToResponse, safeUrl } from "@/lib/ytdlp";

/**
 * POST /api/analyze
 * Body: { url: string }
 * Returns: AnalyzeResponse — media info + every available format.
 *
 * Uses ytdlp-nodejs to extract metadata. Playlists and carousel posts
 * are limited to the first 12 items to keep analysis fast. The builder
 * form is used so a timed-out extraction can be killed instead of
 * leaking a running yt-dlp process.
 */

const ANALYZE_TIMEOUT_MS = 30_000;
const MAX_PLAYLIST_ITEMS = 12;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const url = safeUrl(body?.url ?? "");

  if (!url) {
    return NextResponse.json({ error: "unknown_url" }, { status: 400 });
  }

  const builder = ytdlp.exec(url, {
    dumpSingleJson: true,
    noWarnings: true,
    playlistEnd: MAX_PLAYLIST_ITEMS,
    skipDownload: true,
    socketTimeout: 10,
    retries: 3,
    extractorRetries: 2,
  });

  try {
    const result = await Promise.race([
      builder.exec(),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          builder.kill();
          reject(new Error("Analysis timed out"));
        }, ANALYZE_TIMEOUT_MS)
      ),
    ]);

    const info = JSON.parse(result.output) as Parameters<typeof mapInfoToResponse>[0] | undefined;
    if (!info || typeof info !== "object") {
      return NextResponse.json({ error: "extraction_broke" }, { status: 422 });
    }

    const response = mapInfoToResponse(info, url);
    return NextResponse.json(response);
  } catch (error) {
    const code = classifyError(error);
    return NextResponse.json({ error: code }, { status: code === "unknown_url" ? 400 : 422 });
  }
}
