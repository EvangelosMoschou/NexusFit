"use client";

import React from "react";
import { Save } from "lucide-react";
import { logExercisePerformance } from "@/lib/storage";

interface WeightLoggerInputProps {
  exerciseId: string;
  value: string;
  onValueChange: (value: string) => void;
  onLogged?: () => void;
  inputClassName?: string;
  buttonClassName?: string;
  title?: string;
}

// Shared progressive-overload logger: kg input + save button. Persists via
// logExercisePerformance (localStorage); onLogged lets the parent refresh its
// "last logged weight" display after a save.
export const WeightLoggerInput: React.FC<WeightLoggerInputProps> = ({
  exerciseId,
  value,
  onValueChange,
  onLogged,
  inputClassName = "",
  buttonClassName = "",
  title = "Καταγραφή κιλών",
}) => {
  const handleSave = () => {
    const val = parseFloat(value);
    if (isNaN(val) || val <= 0) return;
    logExercisePerformance({
      exerciseId,
      weightKg: val,
      repsAchieved: 8,
      date: new Date().toLocaleDateString("el-GR"),
    });
    onValueChange("");
    onLogged?.();
  };

  return (
    <>
      <input
        type="number"
        placeholder="kg"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={`w-14 rounded bg-surface border border-border text-white outline-none ${inputClassName}`}
      />
      <button
        onClick={handleSave}
        aria-label="Αποθήκευση βάρους"
        className={`rounded bg-surface-elevated hover:bg-border text-secondary hover:text-white ${buttonClassName}`}
        title={title}
      >
        <Save className="w-3.5 h-3.5" />
      </button>
    </>
  );
};
