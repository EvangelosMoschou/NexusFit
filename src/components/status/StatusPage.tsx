import React from "react";
import Link from "next/link";
import { ArrowLeft, Dumbbell } from "lucide-react";
import { defaultGymConfig } from "@/config/gymConfig";

interface StatusPageProps {
  code: string;
  title: string;
  description: string;
  tone?: "accent" | "warning" | "danger";
  actions?: React.ReactNode;
}

const toneClasses: Record<NonNullable<StatusPageProps["tone"]>, string> = {
  accent: "bg-accent/10 text-accent border-accent/30",
  warning: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  danger: "bg-red-500/10 text-red-300 border-red-500/30",
};

// Shared shell for branded 401/403/404/500 pages. Keeping it in one place means
// every failure state has the same header, spacing, actions and footer.
export function StatusPage({
  code,
  title,
  description,
  tone = "accent",
  actions,
}: StatusPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 sm:p-6">
      <header className="max-w-6xl mx-auto w-full py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent text-accent-ink font-extrabold flex items-center justify-center text-sm shadow-sm">
            <Dumbbell className="w-4 h-4 stroke-[2.5]" />
          </div>
          <span className="font-bold text-base tracking-tight text-primary uppercase">
            {defaultGymConfig.gymName}
          </span>
        </Link>
      </header>

      <main className="max-w-xl mx-auto w-full text-center space-y-6 py-12">
        <div
          className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl border shadow-lg mb-2 ${toneClasses[tone]}`}
          aria-hidden="true"
        >
          <span className="font-mono text-3xl font-black">{code}</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight">
            {title}
          </h1>
          <p className="text-secondary text-sm leading-relaxed max-w-md mx-auto">{description}</p>
        </div>

        {actions}

        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-btn hover:bg-btn-hover text-btn-ink font-bold text-xs transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Επιστροφή στην αρχική</span>
          </Link>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto w-full py-4 text-center text-xs text-tertiary border-t border-border/50">
        © {new Date().getFullYear()} {defaultGymConfig.legalName} • {defaultGymConfig.address}
      </footer>
    </div>
  );
}
