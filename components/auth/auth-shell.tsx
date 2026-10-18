"use client";

import type { ReactNode } from "react";
import { ChartLineUpIcon, KanbanIcon, ShieldCheckIcon, WalletIcon } from "@phosphor-icons/react";
import { BrandMark } from "@/components/ui/brand-mark";

const FEATURES = [
  { icon: KanbanIcon, text: "Every deal from lead to delivery" },
  { icon: WalletIcon, text: "Cedi and dollar balances in real time" },
  { icon: ShieldCheckIcon, text: "Role-based access for your team" },
];

/** Split-screen frame for sign-in, forgot and reset password pages. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh p-2 md:p-3">
      {/* Brand panel */}
      <section className="ink hidden w-[46%] max-w-[44rem] flex-col justify-between p-10 lg:flex xl:p-14">
        <div className="relative z-10">
          <BrandMark variant="full" surface="dark" size={84} />
        </div>

        <div className="relative z-10">
          <h2 className="max-w-md font-display text-[40px] font-semibold leading-[1.08] tracking-tight xl:text-[46px]">
            Run the business from one command center.
          </h2>
          <ul className="mt-8 space-y-3.5">
            {FEATURES.map(({ icon: IconCmp, text }) => (
              <li key={text} className="flex items-center gap-3 text-[14px] text-ink-fg/90">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-chip">
                  <IconCmp size={18} weight="duotone" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* Floating preview tile */}
        <div className="relative z-10 flex items-end gap-4">
          <div className="w-64 rounded-[20px] border border-white/10 bg-white/[0.06] p-4 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-ink-muted">Pipeline value</p>
              <ChartLineUpIcon size={16} className="text-cyan" />
            </div>
            <p className="mt-1 font-display text-[26px] font-semibold">GHS 243K</p>
            <div className="mt-3 flex h-8 gap-1">
              <div className="w-[18%] rounded-full bg-white/90" />
              <div className="w-[52%] rounded-full" style={{ background: "var(--brand-gradient)" }} />
              <div className="flex-1 rounded-full border border-white/15 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.12)_0_6px,transparent_6px_12px)]" />
            </div>
          </div>
          <p className="pb-1 text-[12px] text-ink-muted">© {new Date().getFullYear()} OA Digital</p>
        </div>
      </section>

      {/* Form */}
      <section className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <BrandMark variant="full" size={64} />
          </div>
          <h1 className="font-display text-[30px] font-semibold leading-tight text-fg">{title}</h1>
          <p className="mt-2 text-[14px] text-fg-2">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-[13px]">{footer}</div>}
        </div>
      </section>
    </main>
  );
}
