/* eslint-disable @next/next/no-img-element -- small static logo files; no optimisation needed */
import { cn } from "@/lib/utils";

/*
 * The OA Digital logo, from public/oa-logo.jpeg with the white background removed.
 * Each file has a "-dark" twin with lifted navy for dark surfaces.
 *   mark – the "OA" monogram (about 2:1), for tight spots like the sidebar
 *   full – the whole lockup with the wordmark and shield
 */
const FILES = {
  mark: { src: "/oa-mark", ratio: 320 / 161 },
  full: { src: "/oa-logo", ratio: 600 / 338 },
} as const;

export function BrandMark({
  size = 36,
  variant = "mark",
  surface = "auto",
  className,
}: {
  /** Height in px. */
  size?: number;
  variant?: keyof typeof FILES;
  /** "dark" always uses the light-on-dark file (e.g. on the navy sign-in panel); "auto" follows the theme. */
  surface?: "auto" | "dark";
  className?: string;
}) {
  const { src, ratio } = FILES[variant];
  const width = Math.round(size * ratio);
  const img = (file: string, extra?: string) => (
    <img src={file} alt="OA Digital" width={width} height={size} className={cn("shrink-0 object-contain", extra, className)} draggable={false} />
  );
  if (surface === "dark") return img(`${src}-dark.png`);
  return (
    <>
      {img(`${src}.png`, "dark:hidden")}
      {img(`${src}-dark.png`, "hidden dark:block")}
    </>
  );
}
