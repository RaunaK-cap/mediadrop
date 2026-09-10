/**
 * MediaDrop shared types.
 *
 * These define the data contract between the API routes and the UI.
 * When you wire up real yt-dlp extraction, your backend code should
 * produce `AnalyzeResponse` — the UI already consumes it.
 */

/** One downloadable format option for a media item. */
export interface Format {
  /** Stable id for this format (yt-dlp format_id, e.g. "137+140") */
  id: string;
  /** Human label, e.g. "1080p — MP4" or "Audio only — MP3" */
  label: string;
  /** Container/extension, e.g. "mp4" | "mp3" */
  ext: string;
  /** Filesize in bytes (0 if unknown) */
  bytes: number;
  /** True when this is an audio-only option */
  audioOnly: boolean;
}

/** One media item in a post (a carousel post yields several). */
export interface MediaItem {
  /** Index of this item within the post */
  index: number;
  /** Thumbnail URL (proxied or direct) */
  thumbnail: string;
  /** Duration like "12:34"; null for images */
  duration: string | null;
  /** Whether this item is a static image */
  isImage: boolean;
  formats: Format[];
}

/** Response shape of POST /api/analyze */
export interface AnalyzeResponse {
  /** Original URL that was analyzed */
  sourceUrl: string;
  /** Normalized platform name, e.g. "YouTube" */
  platform: string;
  title: string;
  uploader: string | null;
  /** ISO date or null */
  uploadedAt: string | null;
  /** Cover image for the post */
  thumbnail: string;
  items: MediaItem[];
}

/** SSE progress event pushed by /api/download */
export interface DownloadProgress {
  type: "progress" | "done" | "error";
  /** Bytes transferred so far */
  transferred: number;
  /** Total bytes (0 if unknown) */
  total: number;
  /** Bytes per second */
  speed: number;
  /** Seconds remaining */
  eta: number;
  message?: string;
}

/** Union of friendly error codes the UI knows how to phrase. */
export type DownloadError =
  | "unknown_url"
  | "login_required"
  | "extraction_broke"
  | "network"
  | "server";
