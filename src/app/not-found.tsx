import React from "react";
import Link from "next/link";
import { defaultGymConfig } from "@/config/gymConfig";
import { Dumbbell, Home, ArrowLeft, Calendar } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 sm:p-6">
      {/* Header Logo */}
      <header className="max-w-6xl mx-auto w-full py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent text-black font-extrabold flex items-center justify-center text-sm shadow-sm">
            <Dumbbell className="w-4 h-4 stroke-[2.5]" />
          </div>
          <span className="font-bold text-base tracking-tight text-white uppercase">
            {defaultGymConfig.gymName}
          </span>
        </Link>
      </header>

      {/* Main 404 Content */}
      <main className="max-w-xl mx-auto w-full text-center space-y-6 py-12">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-surface border border-border text-accent shadow-lg mb-2">
          <span className="font-mono text-3xl font-black">404</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Η σελίδα δεν βρέθηκε
          </h1>
          <p className="text-secondary text-sm leading-relaxed max-w-md mx-auto">
            Φαίνεται ότι η διεύθυνση που αναζητάτε δεν υπάρχει ή έχει μετακινηθεί. Μην ανησυχείτε, η προπόνηση συνεχίζεται!
          </p>
        </div>

        {/* Quick Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 text-left">
          <Link
            href="/"
            className="p-4 rounded-xl bg-surface border border-border hover:border-border-light transition-colors group flex items-start gap-3"
          >
            <div className="p-2 rounded-lg bg-surface-elevated text-accent group-hover:bg-accent group-hover:text-black transition-colors">
              <Home className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-white">Αρχική Σελίδα</div>
              <div className="text-[11px] text-secondary">Επιστροφή στο κεντρικό portal</div>
            </div>
          </Link>

          <Link
            href="/#schedule"
            className="p-4 rounded-xl bg-surface border border-border hover:border-border-light transition-colors group flex items-start gap-3"
          >
            <div className="p-2 rounded-lg bg-surface-elevated text-accent group-hover:bg-accent group-hover:text-black transition-colors">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-white">Πρόγραμμα Ομαδικών</div>
              <div className="text-[11px] text-secondary">Δείτε το εβδομαδιαίο ωρολόγιο</div>
            </div>
          </Link>
        </div>

        {/* Direct Action */}
        <div className="pt-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white hover:bg-white/90 text-black font-bold text-xs transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Επιστροφή στο Nexus Athletics</span>
          </Link>
        </div>
      </main>

      {/* Footer info */}
      <footer className="max-w-6xl mx-auto w-full py-4 text-center text-xs text-tertiary border-t border-border/50">
        © {new Date().getFullYear()} {defaultGymConfig.legalName} • {defaultGymConfig.address}
      </footer>
    </div>
  );
}
