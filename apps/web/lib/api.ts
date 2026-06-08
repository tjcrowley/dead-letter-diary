const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface ApiError extends Error {
  status: number;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      (body as Record<string, unknown>).message?.toString() ||
        (body as Record<string, unknown>).error?.toString() ||
        `Request failed with status ${res.status}`
    ) as ApiError;
    err.status = res.status;
    throw err;
  }
  return body as T;
}

export const api = {
  async get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    return handleResponse<T>(res);
  },

  async post<T = unknown>(path: string, data?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: data !== undefined ? { "Content-Type": "application/json" } : {},
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(res);
  },

  async patch<T = unknown>(path: string, data?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "PATCH",
      credentials: "include",
      headers: data !== undefined ? { "Content-Type": "application/json" } : {},
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(res);
  },

  async delete<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    return handleResponse<T>(res);
  },
};
