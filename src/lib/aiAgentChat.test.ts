import { describe, expect, it } from "vitest";
import { processAgentQuery } from "./aiAgentChat";

// The local engine is what answers when GEMINI_API_KEY is unset (the demo and
// most self-hosted installs). Its keyword branches decide whether a member gets
// injury-specific safe substitutions or a generic reply, so both the accented
// and the unaccented spelling of a body part must reach the same branch.
describe("injury branches", () => {
  it("routes an unaccented shoulder complaint to the shoulder branch", () => {
    const reply = processAgentQuery("εχω πονο στον ωμο");
    expect(reply.text).toContain("στροφικού πετάλου");
    // The whole point of the branch: only shoulder-safe exercises.
    expect(reply.matchedExercises?.every((e) => !e.injuryRisks.includes("shoulders"))).toBe(true);
  });

  it("routes an accented shoulder complaint to the shoulder branch", () => {
    expect(processAgentQuery("έχω πόνο στον ώμο").text).toContain("στροφικού πετάλου");
  });

  it("routes an unaccented knee complaint to the knee branch", () => {
    expect(processAgentQuery("πονος στο γονατο").text).toContain("προστασία των γονάτων");
  });

  it("routes an unaccented lower-back complaint to the back branch", () => {
    expect(processAgentQuery("πονος στη μεση").text).toContain("ευαισθησίας στη μέση");
  });
});

describe("exercise and nutrition branches", () => {
  // "στηθοσ" was written with a non-final sigma, which no Greek word uses, so
  // the chest branch was unreachable from the Greek keyword.
  it("routes the Greek word for chest, written with a final sigma", () => {
    expect(processAgentQuery("θελω ασκησεις για στηθος").text).toContain("κατειλημμένος");
  });

  it("routes an unaccented legs question", () => {
    expect(processAgentQuery("ασκησεις για ποδια").text).toContain("ελεύθερο πλαίσιο");
  });

  it("routes an unaccented back question", () => {
    expect(processAgentQuery("ασκησεις για πλατη").text).toContain("μέγιστη ανάπτυξη πλάτης");
  });

  it("routes an unaccented nutrition question", () => {
    expect(processAgentQuery("τι να τρωω για πρωτεινη").text).toContain("γραμμάρια πρωτεΐνης");
  });

  it("routes an unaccented volume question", () => {
    expect(processAgentQuery("ποσες επαναληψεις να κανω").text).toContain("εβδομαδιαίος όγκος");
  });

  it("falls back to the general answer for an unrelated question", () => {
    expect(processAgentQuery("καλησπερα").text).toContain("άμεση πρόσβαση");
  });
});
