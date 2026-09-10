import { NextRequest, NextResponse } from "next/server";
import { ytdlp, ensureFfmpeg, classifyError, safeUrl } from "@/lib/ytdlp";

/**
 * POST /api/test-dlp
 * Body: { url: string }
 *
 * Quick health check that yt-dlp and FFmpeg are reachable and can
 * resolve a title from the provided URL.
 */

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const url = safeUrl(body?.url ?? "");

  if (!url) {
    return NextResponse.json({ error: "unknown_url" }, { status: 400 });
  }

  try {
    const [title, version, ffmpegOk] = await Promise.all([
      ytdlp.getTitleAsync(url),
      ytdlp.getVersionAsync(),
      ensureFfmpeg(),
    ]);

    return NextResponse.json({
      ok: true,
      title,
      version,
      ffmpeg: ffmpegOk,
    });
  } catch (error) {
    const code = classifyError(error);
    return NextResponse.json({ ok: false, error: code }, { status: code === "unknown_url" ? 400 : 500 });
  }
}
