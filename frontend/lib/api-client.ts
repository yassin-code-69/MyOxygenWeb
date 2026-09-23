const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: any;

  constructor(message: string, status: number, code?: string, details?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("my_oxygen_token");
  } catch {
    return null;
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = new URL(
    path.startsWith("http") ? path : `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`
  );

  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const token = getStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url.toString(), {
    ...options,
    headers,
  });

  let data: any;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    data = await response.json().catch(() => null);
  } else {
    data = await response.text().catch(() => null);
  }

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && (data.error?.message || data.error || data.message)) ||
      `Request failed with status ${response.status}`;
    const code = data?.error?.code || data?.code;
    const details = data?.error?.details || data?.details;
    throw new ApiError(message, response.status, code, details);
  }

  return data as T;
}

export async function apiGet<T = any>(
  path: string,
  params?: Record<string, any>
): Promise<T> {
  let fullPath = path;
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      fullPath += (fullPath.includes("?") ? "&" : "?") + queryString;
    }
  }

  return apiRequest<T>(fullPath, { method: "GET" });
}

export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiPatch<T = any>(path: string, body?: any): Promise<T> {
  return apiRequest<T>(path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiPut<T = any>(path: string, body?: any): Promise<T> {
  return apiRequest<T>(path, {
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  return apiRequest<T>(path, {
    method: "DELETE",
  });
}


