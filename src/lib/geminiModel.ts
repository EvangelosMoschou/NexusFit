// Which Gemini model the chat route calls.
//
// The model id is interpolated into the Gemini URL path, so it is validated
// rather than trusted: a value containing `/`, `?`, `#` or whitespace could
// escape the path segment and change which endpoint is called. An invalid or
// missing value falls back to the default instead of failing the request — a
// typo in an env var should not take the copilot down.

export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-lite";

// Gemini model ids look like `gemini-2.0-flash-lite`, `gemini-2.5-pro` or a
// tuned `tunedModels/...` slug. Only the first shape is accepted here: letters,
// digits, dots, hyphens and underscores, starting with an alphanumeric.
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export function resolveGeminiModel(raw: string | undefined = process.env.GEMINI_MODEL): string {
  const value = (raw ?? "").trim();
  return MODEL_ID_PATTERN.test(value) ? value : DEFAULT_GEMINI_MODEL;
}

export function geminiEndpoint(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}
