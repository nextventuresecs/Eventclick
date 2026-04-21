import type { AuthUser } from "@application/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let onUnauthorized: (() => void) | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

export const setOnUnauthorized = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface AuthSuccess {
  user: AuthUser;
  accessToken: string;
}

const doRefresh = async (): Promise<string | null> => {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as AuthSuccess;
    accessToken = body.accessToken;
    return body.accessToken;
  } catch {
    return null;
  }
};

const refreshOnce = (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

type Body = Record<string, unknown> | undefined;

const request = async <T>(
  method: string,
  path: string,
  body?: Body,
  retry = true,
): Promise<T> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    const newToken = await refreshOnce();
    if (newToken) return request<T>(method, path, body, false);
    onUnauthorized?.();
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = data as ApiErrorBody | null;
    throw new ApiClientError(
      res.status,
      err?.error ?? "UNKNOWN",
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return data as T;
};

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: Body) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: Body) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export const authApi = {
  register: (body: { email: string; password: string; fullName: string; organizationName?: string }) =>
    api.post<AuthSuccess>("/auth/register", body),
  login: (body: { email: string; password: string }) =>
    api.post<AuthSuccess>("/auth/login", body),
  google: (idToken: string) => api.post<AuthSuccess>("/auth/google", { idToken }),
  logout: () => api.post<void>("/auth/logout"),
  me: () => api.get<{ user: AuthUser }>("/auth/me"),
  refresh: () => refreshOnce(),
};

import type { EventRoom, CreateRoomInput, UpdateRoomInput } from "@application/shared";

export const roomsApi = {
  list: () => api.get<{ items: EventRoom[] }>("/rooms"),
  get: (id: string) => api.get<EventRoom>(`/rooms/${id}`),
  create: (body: CreateRoomInput) => api.post<EventRoom>("/rooms", body),
  update: (id: string, body: UpdateRoomInput) => api.patch<EventRoom>(`/rooms/${id}`, body),
  delete: (id: string) => api.delete<void>(`/rooms/${id}`),
};
