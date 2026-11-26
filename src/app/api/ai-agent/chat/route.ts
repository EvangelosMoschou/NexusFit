import { NextRequest, NextResponse } from "next/server";
import { processAgentQuery } from "@/lib/aiAgentChat";
import { analyzeQuerySafety, buildSafetySystemPrompt } from "@/lib/aiSafetyHarness";
import { getRepository } from "@/lib/db";
import { geminiEndpoint, geminiHeaders, resolveGeminiModel } from "@/lib/geminiModel";
import { authenticateMemberSession } from "@/lib/memberSessions";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isPremiumSubscriptionActive } from "@/lib/subscription";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

const MAX_QUERY_CHARS = 1000;
const MAX_HISTORY_ITEMS = 6;
const GEMINI_TIMEOUT_MS = 15_000;

interface HistoryTurn {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

function sanitizeHistory(raw: unknown): HistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: HistoryTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const role = entry.role === "user" || entry.role === "model" ? entry.role : null;
    const text = typeof entry.text === "string" ? entry.text.trim().slice(0, MAX_QUERY_CHARS) : "";
    if (!role || !text) continue;
    turns.push({ role, parts: [{ text }] });
  }
  return turns.slice(-MAX_HISTORY_ITEMS);
}

export async function POST(req: NextRequest) {
  try {
    // Rate limits are per tenant *and* per IP, so one gym's traffic cannot
    // consume another gym's allowance.
    const tenantId = resolveTenantIdFromHeaders(req.headers);
    const session = await authenticateMemberSession(req, tenantId);
    if (!session) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const repo = getRepository(tenantId);
    const member = await repo.getMemberAccess(session.memberId);
    if (!member) {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
    }
    if (!isPremiumSubscriptionActive(member.subscription_status, member.expires_at, member.has_ai_access)) {
      return NextResponse.json(
        { success: false, error: "Απαιτείται ενεργή συνδρομή Ψηφιακού Βοηθού." },
        { status: 403 }
      );
    }

    const ipLimit = checkRateLimit(`ai:ip:${tenantId}:${getClientIp(req.headers)}`, 20, 60_000);
    const memberLimit = checkRateLimit(`ai:member:${tenantId}:${session.memberId}`, 15, 60_000);
    if (!ipLimit.allowed || !memberLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, memberLimit.retryAfterSeconds, 1);
      return NextResponse.json(
        {
          success: false,
          error: "Πολλές αιτήσεις. Δοκιμάστε ξανά σε λίγα δευτερόλεπτα.",
          retryAfter,
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await req.json().catch(() => null);
    const rawQuery = body && typeof body === "object" ? (body as { query?: unknown }).query : undefined;
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";

    if (!query || query.length > MAX_QUERY_CHARS) {
      return NextResponse.json(
        {
          success: false,
          error: `Το ερώτημα πρέπει να είναι μεταξύ 1 και ${MAX_QUERY_CHARS} χαρακτήρων.`,
        },
        { status: 400 }
      );
    }

    const config = await repo.getGymConfig();

    // 1. SAFETY HARNESS PRE-FLIGHT CHECK
    const harness = analyzeQuerySafety(query, config.gymName);

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

    // 2. SINGLE DEFAULT MODEL: Google Gemini 2.0 Flash-Lite, overridable with
    // GEMINI_MODEL. resolveGeminiModel() validates the id because it becomes a
    // URL path segment; a malformed value falls back to the default.
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const systemPrompt = buildSafetySystemPrompt(harness.matchedLocalExercises, config.gymName);
        const endpoint = geminiEndpoint(resolveGeminiModel());
        const history = sanitizeHistory(
          body && typeof body === "object" ? (body as { history?: unknown }).history : undefined
        );

        const payload: {
          contents: HistoryTurn[];
          systemInstruction: { parts: Array<{ text: string }> };
          tools?: Array<{ googleSearch?: Record<string, never> }>;
        } = {
          contents: [
            ...history,
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
          headers: geminiHeaders(apiKey),
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
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
        // Graceful fallback to local engine on connection error or timeout
      }
    }

    // 3. ZERO-COST LOCAL DETERMINISTIC ENGINE (Runs if no key is set or offline)
    const agentResponse = processAgentQuery(query);
    return NextResponse.json({ success: true, ...agentResponse });
  } catch {
    return NextResponse.json({ success: false, error: "Internal AI Engine Error" }, { status: 500 });
  }
}
