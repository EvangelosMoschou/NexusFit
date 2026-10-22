// Minimal client-side fetch helper.
//
// It normalises the API's `{ success, error }` envelope into a discriminated
// result so a caller cannot accidentally treat a failed request as a success
// (the previous hand-rolled try/catch blocks swallowed errors entirely).
export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

async function readResponse<T>(res: Response): Promise<ApiResult<T>> {
  let data: (T & { success?: boolean; error?: string }) | null = null;
  try {
    data = await res.json();
  } catch {}

  const ok = res.ok && data?.success !== false;
  return {
    ok,
    status: res.status,
    data,
    error: ok ? null : data?.error ?? `http_${res.status}`,
  };
}

export async function request<T = unknown>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    return await readResponse<T>(await fetch(url, init));
  } catch {
    return { ok: false, status: 0, data: null, error: "network_error" };
  }
}

export function postJson<T = unknown>(url: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
