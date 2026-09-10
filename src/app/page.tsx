"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ToolCard } from "@/components/tool-card";
import { useTheme } from "@/components/theme-provider";

export default function Home() {
  const reduced = useReducedMotion();
  const { theme, toggle } = useTheme();

  return (
    <main className="min-h-dvh ">
      {/* ---------- nav + hero sit directly on the sky field ---------- */}
      <div
        className={
          "sky-field px-5 pb-24 md:pb-70 " +
            "bg-[url('/BACKGROUND.png')] bg-no-repeat bg-cover " +
          "bg-[position:center_50%]"
        }
      >
        <nav className="mx-auto flex h-14 max-w-[640px] items-center justify-between ">
          <motion.div
            initial={{ opacity: 0, ...(reduced ? {} : { y: 12 }) }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-1.75 text-sm font-semibold tracking-tight "
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2v9m0 0l-3.5-3.5M8 11l3.5-3.5M3 13.5h10"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            mediadrop
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.48 }}
            className="flex items-center gap-3.5"
          >
            
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="grid size-8 place-items-center rounded-lg sky-ink transition-colors duration-100 hover:bg-white/35 dark:hover:bg-white/10"
            >
              {theme === "dark" ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              )}
            </button>
          </motion.div>
        </nav>

        <div className="mx-auto max-w-[640px] px-2 pt-11 pb-2 text-center">
          
          <motion.h1
            initial={{ opacity: 0, ...(reduced ? {} : { y: 12 }) }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
            className="mt-3.5 text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sky-ink md:text-[44px]"
          >
            Paste. Choose. Download.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, ...(reduced ? {} : { y: 12 }) }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
            className="mx-auto mt-3 max-w-[44ch] text-sm leading-relaxed sky-ink-2"
          >
            Grab video or audio from YouTube, Instagram, X and 1000+ other sites. No ads, no redirects, no
            waiting rooms.
          </motion.p>
        </div>
      </div>

      {/* ---------- the tool card, floating over the sky's edge ---------- */}
      <div className="mx-auto max-w-[640px] px-5">
        <ToolCard />
      </div>

      {/* ---------- feature strip ---------- */}
      <div className="mx-auto max-w-[640px] px-5  pt-14">
        <div className="grid grid-cols-2 gap-7 gap-y-7 md:grid-cols-4">
          {[
            ["No ads, ever", "The page has nothing to sell you."],
            ["Real progress", "MB, speed and ETA — not a spinner."],
            ["Audio too", "Any video, one tap to MP3."],
            ["Nothing stored", "No accounts. Files are streamed and forgotten."],
          ].map(([h, p], i) => (
            <motion.div
              key={h}
              initial={{ opacity: 0, ...(reduced ? {} : { y: 10 }) }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -20px 0px" }}
              transition={{ duration: 0.32, delay: i * 0.07 }}
            >
              <h3 className="text-[13px] font-semibold tracking-tight">{h}</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">{p}</p>
            </motion.div>
          ))}
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.32, delay: 0.28 }}
          className="pt-12 text-center text-xs leading-relaxed text-ink-3"
        >
          Works with YouTube · Instagram · X · TikTok · Reddit · Vimeo · and 1000+ more
        </motion.p>
      </div>

      <footer className="px-5 pb-[calc(28px+env(safe-area-inset-bottom))] text-center text-[11px] text-ink-3">
        mediadrop — a personal-use tool. Please respect creators and platform terms. Nothing is stored.
      </footer>
    </main>
  );
}
