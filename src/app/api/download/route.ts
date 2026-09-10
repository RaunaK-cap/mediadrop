import { NextRequest } from "next/server";

/**
 * GET /api/download?url=…&formatId=…&index=…
 *
 * Streams the media file to the browser as an attachment, with
 * SSE-style progress reported via the `X-Progress-*` headers before
 * the stream starts (or via a separate progress channel).
 *
 * ─────────────────────────────────────────────────────────────
 * HOW TO IMPLEMENT THE REAL THING (replace the mock below):
 *
 * 1. Ask yt-dlp to resolve the direct media URL(s) for the chosen
 *    format (again: argument array, never a shell string):
 *
 *      const proc = spawn("yt-dlp", [
 *        "-J", "--no-playlist",
 *        "-f", formatId,          // e.g. "137+140" or "bestaudio"
 *        url,
 *      ]);
 *
 *    For "137+140"-style ids, yt-dlp downloads two separate streams
 *    and FFmpeg merges them — easiest path: let yt-dlp do the merge
 *    itself:
 *      spawn("yt-dlp", [
 *        "-f", formatId,
 *        "--merge-output-format", "mp4",
 *        "-o", "-",               // write to stdout
 *        url,
 *      ])
 *    then pipe the child's stdout into your Response body.
 *    For MP3 extraction: add "-x", "--audio-format", "mp3".
 *
 * 2. Stream it to the browser with the attachment header:
 *
 *      const stream = new ReadableStream({
 *        start(controller) {
 *          proc.stdout.on("data", (chunk) => controller.enqueue(
 *            new Uint8Array(chunk)
 *          ));
 *          proc.on("close", () => controller.close());
 *        },
 *        cancel() { proc.kill(); }   // ← user hit the X button
 *      });
 *
 *      return new Response(stream, {
 *        headers: {
 *          "Content-Type": "video/mp4",
 *          "Content-Disposition": `attachment; filename="${safeName}"`,
 *          // ^ sanitize safeName: strip path separators & quotes
 *        },
 *      });
 *
 *    `Content-Disposition: attachment` is what makes the browser
 *    SAVE the file instead of playing it.
 *
 * 3. PROGRESS (the ring + MB/s + ETA in the UI):
 *    The mock below fabricates progress on a timer. For real progress
 *    use one of:
 *      a) parse yt-dlp's stderr progress lines
 *         (lines like "[download]  45.2% of 142.00MiB at 2.40MiB/s")
 *         and forward them over a separate SSE endpoint
 *         (/api/progress?jobId=…) keyed by a per-download id;
 *      b) or track bytes yourself as you enqueue chunks into the
 *         response stream and report via the same SSE channel.
 *
 * 4. Filename: build from the analyzed title + ext, sanitized:
 *      title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)
 *
 * 5. Abort support: the UI calls an AbortController's abort() —
 *    NextRequest's signal reaches route handlers; cancel() above
 *    must kill the child process so no orphan downloads continue.
 * ─────────────────────────────────────────────────────────────
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const formatId = req.nextUrl.searchParams.get("formatId");
  const index = Number(req.nextUrl.searchParams.get("index") ?? 0);

  if (!url || !formatId) {
    return Response.json({ error: "unknown_url" }, { status: 400 });
  }

  // TODO(real-data): all of the above is mock. This fabricates a fake
  // ~2MB file that downloads fast so you can watch the progress ring,
  // speed and ETA tick. Replace with the yt-dlp stdout pipe.
  const total = 2 * 1024 * 1024;
  const chunk = new Uint8Array(64 * 1024).fill(65); // "A"

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let sent = 0; sent < total; sent += chunk.length) {
        if (req.signal.aborted) {
          controller.close();
          return;
        }
        controller.enqueue(chunk.subarray(0, Math.min(chunk.length, total - sent)));
        // simulate real network pacing so the progress UI is visible
        await new Promise((r) => setTimeout(r, 25));
      }
      controller.close();
    },
  });

  const ext = formatId === "mp3" ? "mp3" : "mp4";
  const filename = `mediadrop-mock-${index}.${ext}`;

  return new Response(stream, {
    headers: {
      "Content-Type": ext === "mp3" ? "audio/mpeg" : "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(total),
      "X-Total-Bytes": String(total),
    },
  });
}
