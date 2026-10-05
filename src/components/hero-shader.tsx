"use client";

import { CloudShader } from "@/components/ui/cloud-shader";
import { useTheme } from "@/components/theme-provider";

/* Palette per theme, tuned so the shader stays minimal in both modes:
   light = airy pastel sky, dark ink reads on it.
   dark  = deep night, moonlit slate clouds. */
const DAY = {
  cloudColor: "#ffffff",
  skyTopColor: "#5f9bdc",
  skyBottomColor: "#d8ecfb",
};
const NIGHT = {
  cloudColor: "#3d4d6b",
  skyTopColor: "#04060c",
  skyBottomColor: "#101c34",
};

/**
 * Full-bleed hero background. The canvas is absolutely positioned by the
 * parent; a CSS gradient (hero-fallback) shows before hydration and when
 * WebGL is unavailable, so the page never flashes unstyled.
 */
export function HeroShader({ className }: { className?: string }) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  return (
    <div aria-hidden className={`hero-fallback absolute inset-0 overflow-hidden ${className ?? ""}`}>
      <CloudShader
        className="absolute inset-0 h-full w-full"
        speed={0.7}
        count={4}
        cloudColor={dark ? NIGHT.cloudColor : DAY.cloudColor}
        skyTopColor={dark ? NIGHT.skyTopColor : DAY.skyTopColor}
        skyBottomColor={dark ? NIGHT.skyBottomColor : DAY.skyBottomColor}
      />
    </div>
  );
}
