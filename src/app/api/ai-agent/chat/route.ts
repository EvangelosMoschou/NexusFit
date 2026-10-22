import { NextRequest, NextResponse } from "next/server";
import { processAgentQuery } from "@/lib/aiAgentChat";
import { analyzeQuerySafety, buildSafetySystemPrompt } from "@/lib/aiSafetyHarness";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

export async function POST(req: NextRequest) {
  try {
    // Rate limits are per tenant *and* per IP, so one gym's traffic cannot
    // consume another gym's allowance.
    const tenantId = resolveTenantIdFromHeaders(req.headers);
    const rl = checkRateLimit(`${tenantId}:${getClientIp(req.headers)}`);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Πολλές αιτήσεις. Δοκιμάστε ξανά σε λίγα δευτερόλεπτα.", retryAfter: rl.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json({ success: false, error: "Missing or invalid query parameter" }, { status: 400 });
    }

    // 1. SAFETY HARNESS PRE-FLIGHT CHECK
    const harness = analyzeQuerySafety(query);

    // 1A. Persona Lock & Out-of-Scope Blocker (Coding, Homework, Jailbreaks) -> 0€ Token Cost
    if (harness.isOutOfScope && harness.scopeRefusalMessage) {
      return NextResponse.json({
        success: true,
        id: `agent-scope-${Date.now()}`,
        sender: "agent",
        text: harness.scopeRefusalMessage,
        timestamp: new Date().toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" }),
      });
    }

    // 1B. Medical / Steroids Red-Flag Blocker -> 0€ Token Cost
    if (harness.isMedicalRedFlag) {
      return NextResponse.json({
        success: true,
        id: `agent-safety-${Date.now()}`,
        sender: "agent",
        text: `⚠️ **Προειδοποίηση Ασφαλείας & Πολιτική Γυμναστηρίου**:\n\n${harness.safetyWarnings.join("\n\n")}\n\n*Για την προσωπική σας υγεία, συμβουλευτείτε γιατρό, φυσικοθεραπευτή ή τον επικεφαλής προπονητή του γυμναστηρίου.*`,
        timestamp: new Date().toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" }),
      });
    }

    // 2. SINGLE DEFAULT MODEL: Google Gemini 2.0 Flash-Lite
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const systemPrompt = buildSafetySystemPrompt(harness.matchedLocalExercises);
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

        const payload: {
          contents: Array<{ role: string; parts: Array<{ text: string }> }>;
          systemInstruction: { parts: Array<{ text: string }> };
          tools?: Array<{ googleSearch?: Record<string, never> }>;
        } = {
          contents: [
            {
              role: "user",
              parts: [{ text: query }],
            },
          ],
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
        };

        // Enable Google Search Grounding if scientific / web search is required
        if (harness.requiresWebSearch) {
          payload.tools = [{ googleSearch: {} }];
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            return NextResponse.json({
              success: true,
              id: `gemini-${Date.now()}`,
              sender: "agent",
              text: candidateText,
              matchedExercises: harness.matchedLocalExercises,
              timestamp: new Date().toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" }),
            });
          }
        }
      } catch {
        // Graceful fallback to local engine on connection error
      }
    }

    // 3. ZERO-COST LOCAL DETERMINISTIC ENGINE (Runs if no key is set or offline)
    const agentResponse = processAgentQuery(query);
    return NextResponse.json({ success: true, ...agentResponse });
  } catch {
    return NextResponse.json({ success: false, error: "Internal AI Engine Error" }, { status: 500 });
  }
}
