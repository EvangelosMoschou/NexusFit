"use client";

import React, { useState, useEffect } from "react";
import { MemberUser } from "@/lib/auth";
import { GeneratedWorkoutPlan } from "@/types";
import { useLocalAgentChat } from "@/lib/useLocalAgentChat";
import { ExerciseLog, getExerciseLogs } from "@/lib/storage";
import { WeightLoggerInput } from "@/components/WeightLoggerInput";
import { 
  Send, 
  Bot, 
  Check, 
  ArrowLeft, 
  Dumbbell
} from "lucide-react";

interface GymFloorLiteModeProps {
  member: MemberUser;
  onExitLiteMode: () => void;
  onViewPlan: (plan: GeneratedWorkoutPlan) => void;
}

export const GymFloorLiteMode: React.FC<GymFloorLiteModeProps> = ({
  member,
  onExitLiteMode,
}) => {
  const latestPlan = member.savedPlans[0];
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [completedExercises, setCompletedExercises] = useState<Record<string, boolean>>({});
  const [exerciseWeights, setExerciseWeights] = useState<Record<string, string>>({});
  const [logRefreshTick, setLogRefreshTick] = useState(0);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>(() => getExerciseLogs());

  useEffect(() => {
    setExerciseLogs(getExerciseLogs());
  }, [logRefreshTick]);
  
  // Local Chat state (Runs 100% offline with ZERO network requests)
  const { input: chatInput, setInput: setChatInput, messages, send: sendChat } = useLocalAgentChat(
    "📶 Λειτουργία Χαμηλού Σήματος (Offline Mode): Ο AI Coach εκτελείται τοπικά στη συσκευή σας με μηδενική κατανάλωση δεδομένων. Ρωτήστε για εναλλακτικές ασκήσεων ή οδηγίες.",
    50
  );

  const activeDay = latestPlan?.days[activeDayIdx] || latestPlan?.days[0];
  const isAIActive = member.subscription.hasAIAccess && member.subscription.status === "active";

  const handleToggleCompleted = (id: string) => {
    setCompletedExercises((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setExerciseWeight = (exerciseId: string, value: string) => {
    setExerciseWeights((prev) => ({ ...prev, [exerciseId]: value }));
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    sendChat();
  };

  return (
    <div className="min-h-screen bg-[#111317] text-white p-3 sm:p-5 max-w-4xl mx-auto space-y-4 font-sans antialiased">
      
      {/* Top Banner: Low Bandwidth Status */}
      <div className="p-3 rounded-lg bg-surface border border-border flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-bold text-amber-400">Gym Floor Lite Mode</span>
          <span className="text-secondary hidden sm:inline">• Μηδενική κατανάλωση δικτύου (0 KB)</span>
        </div>

        <button
          onClick={onExitLiteMode}
          className="px-2.5 py-1 rounded bg-surface-elevated hover:bg-border text-white text-[11px] font-semibold border border-border flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          <span>Πλήρης Προβολή</span>
        </button>
      </div>

      {/* Member Fast Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-accent" />
          <span className="font-bold text-sm">{member.fullName}</span>
          <span className="text-xs font-mono text-tertiary">({member.memberCode})</span>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded bg-emerald-950/40">
          {member.subscription.status === "active" ? "Active Member" : "Expired"}
        </span>
      </div>

      {/* SECTION 1: TODAY'S ACTIVE WORKOUT ROUTINE */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div>
            <span className="text-[10px] font-mono uppercase text-accent font-bold">
              Current Workout Split
            </span>
            <h2 className="text-base font-bold text-white mt-0.5">
              {latestPlan ? latestPlan.splitName : "Δεν έχει οριστεί πρόγραμμα"}
            </h2>
          </div>

          {latestPlan && latestPlan.days.length > 1 && (
            <div className="flex items-center gap-1">
              {latestPlan.days.map((d, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveDayIdx(idx)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-colors ${
                    activeDayIdx === idx
                      ? "bg-white text-black"
                      : "bg-surface-elevated text-secondary hover:text-white"
                  }`}
                >
                  D{idx + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        {activeDay ? (
          <div className="space-y-2">
            <div className="text-xs text-secondary font-medium pb-1">
              {activeDay.dayName} — <span className="text-white">{activeDay.focus}</span>
            </div>

            <div className="divide-y divide-border/60 border border-border rounded-lg bg-background overflow-hidden">
              {activeDay.exercises.map((ex, i) => {
                const isDone = Boolean(completedExercises[ex.exerciseId]);
                const prevLog = exerciseLogs.find((l) => l.exerciseId === ex.exerciseId);

                return (
                  <div
                    key={i}
                    className={`p-3 flex items-center justify-between gap-3 text-xs transition-colors ${
                      isDone ? "bg-surface-elevated/40 opacity-70" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleCompleted(ex.exerciseId)}
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                          isDone
                            ? "bg-emerald-500 border-emerald-500 text-black font-bold"
                            : "border-border hover:border-accent text-transparent"
                        }`}
                        title="Σημείωση ως ολοκληρωμένη"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </button>

                      <div>
                        <div className={`font-bold text-white ${isDone ? "line-through text-secondary" : ""}`}>
                          {i + 1}. {ex.greekName}
                        </div>
                        <div className="text-[11px] font-mono text-tertiary">
                          {ex.sets} σετ x {ex.reps} • Rest: {ex.restSeconds}s
                        </div>
                        {prevLog && (
                          <div className="text-[10px] font-mono text-accent mt-0.5">
                            Προηγούμενο: {prevLog.weightKg} kg
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Weight Input (Local storage) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <WeightLoggerInput
                        exerciseId={ex.exerciseId}
                        value={exerciseWeights[ex.exerciseId] || ""}
                        onValueChange={(value) => setExerciseWeight(ex.exerciseId, value)}
                        onLogged={() => setLogRefreshTick((t) => t + 1)}
                        inputClassName="px-2 py-1 text-center font-mono text-xs"
                        buttonClassName="p-1.5 border border-border"
                        title="Αποθήκευση κιλών τοπικά"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-xs text-secondary py-3 text-center">
            Δεν υπάρχει ενεργό split. Μεταβείτε στην πλήρη προβολή για να δημιουργήσετε.
          </div>
        )}
      </div>

      {/* SECTION 2: BAREBONES OFFLINE AI COACH CHAT */}
      {isAIActive ? (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-accent" />
              <h3 className="text-xs font-bold text-white">Offline AI Coach (Zero Latency)</h3>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-surface-elevated px-2 py-0.5 rounded border border-border">
              Local Engine
            </span>
          </div>

          {/* Messages */}
          <div className="max-h-56 overflow-y-auto space-y-2.5 bg-background p-3 rounded-lg border border-border text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-2.5 rounded-lg leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-white text-black font-semibold ml-6"
                    : "bg-surface border border-border text-primary mr-6"
                }`}
              >
                <div>{msg.text}</div>
                {msg.matchedExercises && (
                  <div className="mt-1 pt-1 border-t border-border/60 text-[10px] text-accent font-mono">
                    Προτάσεις: {msg.matchedExercises.map((e) => e.greekName).join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleSendChat} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Ρωτήστε για εναλλακτική άσκηση (π.χ. 'κατειλημμένος πάγκος')..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-white text-xs outline-none focus:border-border-light placeholder:text-tertiary"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="px-3 py-2 rounded-lg bg-white hover:bg-white/90 disabled:opacity-50 text-black font-bold text-xs flex items-center gap-1"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-surface border border-border text-xs text-secondary text-center">
          Standard Pass: Για πρόσβαση στον AI Coach, απευθυνθείτε στη γραμματεία.
        </div>
      )}

    </div>
  );
};
