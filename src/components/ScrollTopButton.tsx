"use client";

import React, { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

export const ScrollTopButton: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setShow(window.scrollY > 400);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!show) return null;

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-6 right-6 z-40 p-2.5 rounded-lg bg-surface border border-border text-secondary hover:text-primary hover:bg-surface-elevated transition-colors shadow-lg"
      aria-label="Επιστροφή στην αρχή"
    >
      <ArrowUp className="w-4 h-4" />
    </button>
  );
};
