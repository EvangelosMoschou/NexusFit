import { exercisesDatabase } from "@/data/exercisesData";
import { Exercise } from "@/types";
import { normalizeGreekText } from "./aiSafetyHarness";

export interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: string;
  matchedExercises?: Exercise[];
}

export function processAgentQuery(query: string): ChatMessage {
  // Keywords below are Greek, so they only match real input once both sides are
  // normalised: "πονο στον ωμο" (no accents) and "πόνο στον ώμο" must land on the
  // same branch, and a keyword ending in a plain sigma ("στηθοσ") must match the
  // final-sigma spelling a member actually types ("στήθος").
  const lower = normalizeGreekText(query.toLowerCase().trim());
  const has = (...keywords: string[]): boolean =>
    keywords.some((keyword) => lower.includes(normalizeGreekText(keyword)));
  let responseText = "";
  let matchedExercises: Exercise[] = [];

  // 1. Check for Injury / Joint Pain / Shoulder / Back / Knee queries
  if (has("ώμο", "ωμοσ", "στροφικ")) {
    const safeShoulder = exercisesDatabase.filter(
      (e) => (e.muscleGroup === "chest" || e.muscleGroup === "shoulders") && !e.injuryRisks.includes("shoulders")
    );
    matchedExercises = safeShoulder.slice(0, 3);
    responseText = 
      "Για προστασία του ώμου και του στροφικού πετάλου, συνιστάται να αποφύγετε βαριές πιέσεις με ίσια μπάρα (Barbell Bench Press) και βαθιές βυθίσεις (Dips). " +
      "Αντικαταστήστε με Dumbbell Bench Press σε κλίση 30° με ουδέτερη λαβή και εντάξτε Face Pulls με σκοινί στην τροχαλία για ενδυνάμωση των σταθεροποιητών μυών.";
  } 
  else if (has("μέση", "μεση", "σπονδυλ", "δισκο")) {
    const safeBack = exercisesDatabase.filter(
      (e) => (e.muscleGroup === "back" || e.muscleGroup === "legs") && !e.injuryRisks.includes("lower_back")
    );
    matchedExercises = safeBack.slice(0, 3);
    responseText = 
      "Σε περίπτωση ευαισθησίας στη μέση, αποκλείουμε ασκήσεις με υψηλή αξονική φόρτιση (Heavy Deadlifts, Barbell Back Squats και Bent-Over Rows). " +
      "Προτείνουμε Leg Press 45° με σταθερή λεκάνη, Chest-Supported Row στο μηχάνημα και Lying Leg Curls για ασφαλή εκγύμναση χωρίς καταπόνηση των σπονδύλων.";
  }
  else if (has("γόνατ", "γονατο", "χιαστό")) {
    const safeLegs = exercisesDatabase.filter(
      (e) => e.muscleGroup === "legs" && !e.injuryRisks.includes("knees")
    );
    matchedExercises = safeLegs.slice(0, 3);
    responseText = 
      "Για προστασία των γονάτων, εστιάστε στην οπίσθια κινητική αλυσίδα (ρουμανικές άρσεις θανάτου, κάμψεις ποδιών ξαπλωμένος) και σε ελεγχόμενες κινήσεις στην πρέσα ποδιών χωρίς πλήρες κλείδωμα των αρθρώσεων στην κορυφή.";
  }
  // 2. Alternative exercise replacement queries
  else if (has("πάγκο", "bench press", "στηθοσ", "στήθος")) {
    matchedExercises = exercisesDatabase.filter((e) => e.muscleGroup === "chest").slice(0, 3);
    responseText = 
      "Αν ο ίσιος πάγκος είναι κατειλημμένος, οι κορυφαίες εναλλακτικές με ισοδύναμη μυϊκή ενεργοποίηση είναι: 1) πιέσεις με αλτήρες σε κλίση 30°, 2) πιέσεις στήθους στο μηχάνημα και 3) ανοίγματα στην τροχαλία για συνεχή τάση.";
  }
  else if (has("squat", "καθισμα", "πόδια", "ποδια")) {
    matchedExercises = exercisesDatabase.filter((e) => e.muscleGroup === "legs").slice(0, 3);
    responseText = 
      "Αν δεν υπάρχει ελεύθερο πλαίσιο για κάθισμα, μπορείτε να εκτελέσετε πρέσα ποδιών 45° (4 σετ x 10-12 επαναλήψεις) ή βουλγαρικά καθίσματα με αλτήρες για εξαιρετική ενεργοποίηση τετρακεφάλων και γλουτών.";
  }
  else if (has("πλάτη", "πλατη", "έλξεις", "row")) {
    matchedExercises = exercisesDatabase.filter((e) => e.muscleGroup === "back").slice(0, 3);
    responseText = 
      "Για μέγιστη ανάπτυξη πλάτης (πλάτος και πάχος), συνδυάστε μία κάθετη έλξη (τροχαλία ή έλξεις) με μία οριζόντια κωπηλατική (σε τροχαλία ή με στήριξη στήθους) για 3-4 σετ των 8-12 επαναλήψεων.";
  }
  // 3. Nutrition & Protein queries
  else if (has("διατροφή", "πρωτεΐνη", "πρωτεινη", "φαγητό", "θερμίδες")) {
    responseText = 
      "Για βέλτιστη μυϊκή υπερτροφία και ανάρρωση, στοχεύστε σε 1,6 έως 2,0 γραμμάρια πρωτεΐνης ανά κιλό σωματικού βάρους ημερησίως. Καταναλώστε ένα ισορροπημένο γεύμα με σύνθετους υδατάνθρακες 2 ώρες πριν την προπόνηση και επαρκή ενυδάτωση (30-40 ml νερό ανά κιλό βάρους).";
  }
  // 4. Sets / Reps / Volume guidance
  else if (has("σετ", "επαναλήψεις", "reps", "rpe")) {
    responseText = 
      "Ο βέλτιστος εβδομαδιαίος όγκος για υπερτροφία είναι 10-20 ποιοτικά σετ ανά μυϊκή ομάδα την εβδομάδα. Για κύριες ασκήσεις στοχεύστε σε ένταση 8 (να σας μένουν 2 επαναλήψεις πριν την αποτυχία), με διαλείμματα 90-120 δευτερολέπτων.";
  }
  // 5. General intelligent response
  else {
    matchedExercises = exercisesDatabase.slice(0, 2);
    responseText = 
      `Ως ψηφιακός προπονητής του γυμναστηρίου, έχω άμεση πρόσβαση στη βάση δεδομένων ${exercisesDatabase.length} πιστοποιημένων ασκήσεων. Μπορείτε να με ρωτήσετε για εναλλακτικές ασκήσεων, προσαρμογές για τραυματισμούς, σετ και επαναλήψεις ή διατροφική καθοδήγηση.`;
  }

  return {
    id: `msg-${Date.now()}`,
    sender: "agent",
    text: responseText,
    timestamp: new Date().toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" }),
    matchedExercises: matchedExercises.length > 0 ? matchedExercises : undefined,
  };
}
