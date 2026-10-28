"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export const FAQ: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: "Πώς λειτουργεί το σύστημα NexusFit Ψηφιακός Βοηθός;",
      a: "Το ψηφιακό σύστημα αναλύει το ιστορικό σας, τις διαθέσιμες ημέρες, τη διάρκεια προπόνησης και τυχόν περιορισμούς ή τραυματισμούς (π.χ. μέση, ώμοι) και παράγει ένα ολοκληρωμένο εβδομαδιαίο πλάνο με ακριβή σετ, επαναλήψεις, βαθμό κόπωσης και περιόδους διαλείμματος.",
    },
    {
      q: "Περιλαμβάνονται τα ομαδικά μαθήματα στη συνδρομή;",
      a: "Ναι, η πλήρης συνδρομή περιλαμβάνει απεριόριστη συμμετοχή σε όλα τα ομαδικά προγράμματα (δύναμη, υψηλή ένταση, πιλάτες, γιόγκα, πυγμαχία) χωρίς επιπλέον χρέωση.",
    },
    {
      q: "Υπάρχει δέσμευση συμβολαίου για τη μηνιαία συνδρομή;",
      a: "Όχι. Η μηνιαία συνδρομή δεν έχει ελάχιστη χρονική δέσμευση και μπορείτε να τη διακόψετε οποιαδήποτε στιγμή.",
    },
    {
      q: "Μπορώ να εκτυπώσω ή να εξάγω το πρόγραμμα προπόνησής μου;",
      a: "Ναι, κάθε παραγόμενο πρόγραμμα μπορεί να εκτυπωθεί ή να αντιγραφεί αμέσως ως κείμενο.",
    },
    {
      q: "Πώς εγκαθιστώ την εφαρμογή στο κινητό μου;",
      a: "Μπορείτε να εγκαταστήσετε την εφαρμογή απευθείας από τον περιηγητή του κινητού σας (Safari στο iPhone επιλέγοντας 'Προσθήκη στην οθόνη αφετηρίας', ή Chrome στο Android πατώντας 'Εγκατάσταση') χωρίς να χρειάζεται κατέβασμα από κατάστημα εφαρμογών.",
    },
  ];

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section className="py-16 border-b border-border bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between pb-6 mb-6 border-b border-border gap-2">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Συχνές Ερωτήσεις & Διευκρινίσεις
            </h2>
            <p className="text-secondary text-xs sm:text-sm mt-1">
              Απαντήσεις σχετικά με τις συνδρομές, τις εγκαταστάσεις και το ψηφιακό σύστημα.
            </p>
          </div>
          {/* Last updated date (Item 18) */}
          <div className="text-[11px] font-mono text-tertiary">
            Τελευταία ενημέρωση: Αύγουστος 2026
          </div>
        </div>

        <div className="divide-y divide-border border border-border rounded-lg bg-surface overflow-hidden">
          {faqs.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div key={idx} className="transition-colors">
                <button
                  onClick={() => toggle(idx)}
                  className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 hover:bg-surface-elevated/40 transition-colors"
                >
                  <span className="text-sm font-semibold text-white">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-secondary shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-white" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 sm:px-5 pb-5 pt-1 text-xs text-secondary leading-relaxed bg-background/50 border-t border-border/40">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
