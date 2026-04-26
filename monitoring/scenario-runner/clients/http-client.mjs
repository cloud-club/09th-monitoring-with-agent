import { config } from "../lib/config.mjs";

export async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(options.timeoutMs || 30_000),
    });
    const bodyText = await response.text();
    const body = bodyText.length > 0 ? JSON.parse(bodyText) : null;
    return { ok: response.ok, status: response.status, body, headers: response.headers };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: error.message, headers: new Headers() };
  }
}

export async function requestBackend(method, path, options = {}) {
  const headers = {
    Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    "x-request-id": `runner-${Date.now()}`,
    ...(options.headers || {}),
  };
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${config.backendBaseUrl}${path}`, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    text,
    body: text.length > 0 && response.headers.get("content-type")?.includes("application/json")
      ? JSON.parse(text)
      : null,
  };
}
