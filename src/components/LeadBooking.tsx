"use client";

import React, { useState } from "react";
import { useGymConfig } from "@/lib/useGymConfig";
import { MapPin, Mail, Clock } from "lucide-react";
import { postJson } from "@/lib/apiClient";

interface LeadBookingProps {
  preselectedPlan?: string;
  onOpenLegal: (type: "tos" | "privacy") => void;
}

export const LeadBooking: React.FC<LeadBookingProps> = ({ preselectedPlan, onOpenLegal }) => {
  const { config } = useGymConfig();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(preselectedPlan ? `Ενδιαφέρον για: ${preselectedPlan}` : "Πληροφορίες Συνδρομής");
  const [message, setMessage] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !acceptedTerms) return;

    setLoading(true);
    setSubmitError(null);

    const result = await postJson("/api/leads", {
      fullName,
      email,
      preferredPlan: subject,
      notes: message,
    });

    setLoading(false);
    if (result.ok) {
      setSubmitted(true);
    } else {
      // Previously the form reported success even when the request failed.
      setSubmitError("Η αποστολή απέτυχε. Δοκιμάστε ξανά ή επικοινωνήστε μαζί μας τηλεφωνικά.");
    }
  };

  return (
    <section id="contact" className="py-16 border-b border-border bg-surface">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          
          {/* Left Col: Physical Gym Info */}
          <div className="md:col-span-5 space-y-6">
            <div>
              <span className="text-[11px] font-mono uppercase text-accent font-bold">
                Front Desk & Location
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
                Επίσκεψη & Γραμματεία
              </h2>
              <p className="text-secondary text-xs sm:text-sm mt-2 leading-relaxed">
                Οι εγγραφές και η παραλαβή της κάρτας μέλους γίνονται αυτοπροσώπως στο γυμναστήριο. Ελάτε να δείτε από κοντά τους χώρους και τα μηχανήματά μας.
              </p>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex items-start gap-3 p-3 rounded bg-background border border-border">
                <MapPin className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Διεύθυνση</div>
                  <div className="text-secondary text-[11px]">{config.address}</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded bg-background border border-border">
                <Clock className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Ωράριο Γραμματείας</div>
                  <div className="text-secondary text-[11px]">Δευτ - Παρ: {config.workingHours.weekdays}</div>
                  <div className="text-secondary text-[11px]">Σαβ: {config.workingHours.saturday} | Κυρ: {config.workingHours.sunday}</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded bg-background border border-border">
                <Mail className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Email Επικοινωνίας</div>
                  <div className="text-secondary text-[11px]">{config.email}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Col: Contact & Inquiries Form */}
          <div className="md:col-span-7">
            <div className="bg-background p-6 sm:p-7 rounded-lg border border-border">
              {submitted ? (
                <div className="py-8 text-center space-y-3">
                  <div className="text-xs font-mono text-accent uppercase">
                    Επιτυχής Αποστολή
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    Το μήνυμά σας παραλήφθηκε
                  </h3>
                  <p className="text-xs text-secondary max-w-sm mx-auto">
                    Ευχαριστούμε <span className="text-white font-semibold">{fullName}</span>. Θα λάβετε απάντηση στο email <span className="text-white font-mono">{email}</span> εντός 24 ωρών.
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="mt-4 px-4 py-1.5 rounded bg-surface-elevated text-xs font-medium text-white hover:bg-border transition-colors"
                  >
                    Νέο Μήνυμα
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="pb-3 border-b border-border">
                    <h3 className="text-sm font-bold text-white">
                      Φόρμα Επικοινωνίας & Ερωτήσεων
                    </h3>
                    <p className="text-xs text-secondary">
                      Στείλτε μας το μήνυμά σας και θα επικοινωνήσουμε άμεσα μαζί σας
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label
                        htmlFor="lead-full-name"
                        className="block text-[11px] font-semibold text-secondary mb-1"
                      >
                        Ονοματεπώνυμο *
                      </label>
                      <input
                        id="lead-full-name"
                        type="text"
                        required
                        placeholder="π.χ. Γιώργος Παπαδόπουλος"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-3 py-2 rounded bg-surface border border-border text-white text-xs outline-none focus:border-border-light"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="lead-email"
                        className="block text-[11px] font-semibold text-secondary mb-1"
                      >
                        Email Επικοινωνίας *
                      </label>
                      <input
                        id="lead-email"
                        type="email"
                        required
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 rounded bg-surface border border-border text-white text-xs outline-none focus:border-border-light"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="lead-subject"
                      className="block text-[11px] font-semibold text-secondary mb-1"
                    >
                      Θέμα Μηνύματος
                    </label>
                    <input
                      id="lead-subject"
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-surface border border-border text-white text-xs outline-none focus:border-border-light"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="lead-message"
                      className="block text-[11px] font-semibold text-secondary mb-1"
                    >
                      Μήνυμα / Ερώτηση
                    </label>
                    <textarea
                      id="lead-message"
                      rows={3}
                      placeholder="Γράψτε τυχόν απορίες για τα μαθήματα, τον εξοπλισμό ή το AI σύστημα..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-surface border border-border text-white text-xs outline-none focus:border-border-light resize-none"
                    />
                  </div>

                  {/* Terms Consent */}
                  <div className="flex items-start gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="terms-contact"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      required
                      className="mt-0.5 rounded border-border bg-surface text-accent focus:ring-0"
                    />
                    <label htmlFor="terms-contact" className="text-[11px] text-secondary leading-snug cursor-pointer">
                      Συναινώ στην επεξεργασία των στοιχείων μου βάσει της{" "}
                      <button
                        type="button"
                        onClick={() => onOpenLegal("privacy")}
                        className="text-white underline hover:text-accent"
                      >
                        Πολιτικής Απορρήτου
                      </button>{" "}
                      του {config.legalName}.
                    </label>
                  </div>

                  {submitError && (
                    <div className="p-2.5 rounded bg-red-950/40 border border-red-800/60 text-[11px] text-red-300">
                      {submitError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !acceptedTerms}
                    className="w-full py-2.5 rounded bg-white hover:bg-white/90 disabled:opacity-50 text-black font-bold text-xs tracking-tight transition-colors text-center"
                  >
                    {loading ? "Αποστολή..." : "Αποστολή Μηνύματος"}
                  </button>
                </form>
              )}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
