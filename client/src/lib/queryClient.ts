import { QueryClient, QueryFunction } from "@tanstack/react-query";

let _shareBaseUrl: string | null = null;
let _shareBaseUrlPromise: Promise<string> | null = null;
export async function getShareBaseUrl(): Promise<string> {
  if (_shareBaseUrl) return _shareBaseUrl;
  if (_shareBaseUrlPromise) return _shareBaseUrlPromise;
  _shareBaseUrlPromise = fetch("/api/share-base-url")
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      _shareBaseUrl = d?.url || window.location.origin;
      return _shareBaseUrl;
    })
    .catch(() => {
      _shareBaseUrl = window.location.origin;
      return _shareBaseUrl;
    });
  return _shareBaseUrlPromise;
}

export type UpgradeCallback = (message: string) => void;
let upgradeCallback: UpgradeCallback | null = null;
export function setUpgradeCallback(cb: UpgradeCallback) { upgradeCallback = cb; }

const SESSION_TOKEN_KEY = "etax_session_token";

export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function setSessionToken(token: string) {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function clearSessionToken() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = getSessionToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    if (res.status === 403 && text.includes("กรุณาอัพเกรดแพ็คเกจ")) {
      try {
        const parsed = JSON.parse(text);
        if (upgradeCallback) upgradeCallback(parsed.message || text);
      } catch {
        if (upgradeCallback) upgradeCallback(text);
      }
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const contentHeaders = data ? { "Content-Type": "application/json" } : {};
  const res = await fetch(url, {
    method,
    headers: authHeaders(contentHeaders),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      headers: authHeaders(),
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

const originalFetch = window.fetch;
window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  if (url.startsWith("/api/")) {
    const token = getSessionToken();
    if (token) {
      const headers = new Headers(init?.headers);
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      init = { ...init, headers };
    }
  }
  return originalFetch.call(window, input, init);
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export async function downloadFile(url: string, filename?: string): Promise<void> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  if (filename) a.download = filename;
  else {
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename=([^;]+)/);
    a.download = match ? match[1].replace(/['"]/g, "").trim() : "download";
  }
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}
