import type { AuthUser, UpdateProfileInput, ChangePasswordInput, UpdateOrganizationInput, UpdatePreferencesInput, SubmitFeedbackInput, SubmitBugReportInput } from "@application/shared";

const API_URL = import.meta.env.VITE_API_URL || "/api/v1";

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

const DEFAULT_TIMEOUT_MS = 15_000;
let requestIdCounter = 0;
const nextRequestId = () => `req-${Date.now()}-${++requestIdCounter}`;
let lastRequestId: string | null = null;

const fetchWithAuth = async (
  path: string,
  init?: RequestInit,
  retry = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> => {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  headers["x-request-id"] = headers["x-request-id"] ?? lastRequestId ?? nextRequestId();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  const responseRequestId = res.headers.get("x-request-id");
  if (responseRequestId) lastRequestId = responseRequestId;

  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    const newToken = await refreshOnce();
    if (newToken) return fetchWithAuth(path, init, false, timeoutMs);
    onUnauthorized?.();
  }

  return res;
};

const request = async <T = void>(
  method: string,
  path: string,
  body?: Body,
  retry = true,
): Promise<T> => {
  const res = await fetchWithAuth(
    path,
    {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
    retry,
  );

  // Return null safely for 204 No Content (cast to T safely)
  if (res.status === 204) return null as unknown as T;

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
  get: <T = unknown>(path: string) => request<T>("GET", path),
  post: <T = void>(path: string, body?: Body) => request<T>("POST", path, body),
  put: <T = void>(path: string, body?: Body) => request<T>("PUT", path, body),
  patch: <T = void>(path: string, body?: Body) => request<T>("PATCH", path, body),
  delete: <T = void>(path: string, body?: Body) => request<T>("DELETE", path, body),
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
  forgotPassword: (email: string) => api.post<void>("/auth/forgot-password", { email }),
  resetPassword: (body: ResetPasswordInput) => api.post<void>("/auth/reset-password", body),
  verifyEmail: (token: string) => api.post<AuthSuccess>("/auth/verify-email", { token }),
  completeOnboarding: (body: OnboardingInput) => api.post<AuthSuccess>("/auth/onboarding", body),
  updateProfile: (body: UpdateProfileInput) => api.patch<{ user: AuthUser }>("/auth/profile", body),
  changePassword: (body: ChangePasswordInput) => api.post<{ message: string }>("/auth/change-password", body),
};

import type {
  AssignEventAdminInput,
  AttendanceEntry,
  BrandingUploadRequestInput,
  CreateOrgUserInput,
  EventAdminAssignment,
  CreateRoomInput,
  EventRoom,
  FormDefinition,
  FormDefinitionInput,
  LiveTokenResponse,
  OrgUserSummary,
  ActivityDefinition,
  ActivityPhotoUploadRequestInput,
  SubmitActivityPhotoInput,
  ActivitySubmission,
  PhotoUploadRequestInput,
  PhotoUploadResponse,
  PresenceSnapshot,
  SharedRoom,
  SubmitAttendanceInput,
  UpdateEventAdminAssignmentInput,
  UpdateRoomInput,
  ResetPasswordInput,
  OnboardingInput,
} from "@application/shared";

export const roomsApi = {
  list: () => api.get<{ items: EventRoom[] }>("/rooms"),
  get: (id: string) => api.get<EventRoom>(`/rooms/${id}`),
  create: (body: CreateRoomInput) => api.post<EventRoom>("/rooms", body),
  update: (id: string, body: UpdateRoomInput) => api.patch<EventRoom>(`/rooms/${id}`, body),
  delete: (id: string) => api.delete<void>(`/rooms/${id}`),
  setYouTubeFallback: (id: string, youtubeWatchUrl: string) =>
    api.post<EventRoom>(`/rooms/${id}/fallback/youtube`, { youtubeWatchUrl }),
  clearFallback: (id: string) => api.post<EventRoom>(`/rooms/${id}/fallback/clear`),
  downloadReportPdf: async (id: string): Promise<Blob> => {
    const res = await fetchWithAuth(`/rooms/${id}/report/pdf`, { method: "GET" });
    if (!res.ok) {
      throw new ApiClientError(res.status, "PDF_DOWNLOAD_FAILED", "Failed to download PDF report");
    }
    return res.blob();
  },
};

export const formsApi = {
  get: (roomId: string) => api.get<FormDefinition | null>(`/rooms/${roomId}/form`),
  save: (roomId: string, body: FormDefinitionInput) =>
    api.put<FormDefinition>(`/rooms/${roomId}/form`, body),
};

export const shareApi = {
  get: (token: string) => api.get<SharedRoom>(`/share/${token}`),
  getToken: (token: string, name?: string) =>
    api.post<LiveTokenResponse>(`/share/${token}/live-token`, name ? { name } : undefined),
  presence: (token: string) =>
    api.get<PresenceSnapshot>(`/share/${token}/presence`),
};

export const presenceApi = {
  get: (roomId: string) =>
    api.get<PresenceSnapshot>(`/rooms/${roomId}/presence`),
};

export const liveApi = {
  getToken: (roomId: string) =>
    api.post<LiveTokenResponse>(`/rooms/${roomId}/live-token`),
  start: (roomId: string) => api.post<EventRoom>(`/rooms/${roomId}/start`),
  stop: (roomId: string) => api.post<EventRoom>(`/rooms/${roomId}/stop`),
  startRecording: (roomId: string) => api.post<{ egressId: string }>(`/rooms/${roomId}/recording/start`),
  stopRecording: (roomId: string, egressId: string) => api.post<{ egressId: string }>(`/rooms/${roomId}/recording/stop`, { egressId }),
  getActiveRecording: (roomId: string) => api.get<{ egressId: string } | null>(`/rooms/${roomId}/recording/active`),
};

export const attendanceApi = {
  list: (roomId: string, opts?: { liveOnly?: boolean }) => {
    const params = new URLSearchParams();
    if (opts?.liveOnly) params.set("liveOnly", "true");
    const queryString = params.toString();
    const query = queryString ? `?${queryString}` : "";
    return api.get<{ items: AttendanceEntry[] }>(`/rooms/${roomId}/attendance${query}`);
  },
  submit: (roomId: string, body: SubmitAttendanceInput) =>
    api.post<AttendanceEntry>(`/rooms/${roomId}/attendance`, body),
  presignPhoto: (roomId: string, body: PhotoUploadRequestInput) =>
    api.post<PhotoUploadResponse>(`/rooms/${roomId}/attendance/photo-upload`, body),
};

export const activitiesApi = {
  list: (roomId: string) =>
    api.get<{ activityDefinitions: ActivityDefinition[]; submissions: ActivitySubmission[] }>(`/rooms/${roomId}/activities`),
  presignPhoto: (roomId: string, body: ActivityPhotoUploadRequestInput) =>
    api.post<PhotoUploadResponse>(`/rooms/${roomId}/activities/photo-upload`, body),
  submitPhoto: (roomId: string, body: SubmitActivityPhotoInput) =>
    api.post<ActivitySubmission>(`/rooms/${roomId}/activities/submission`, body),
};

export const eventAssignmentsApi = {
  listUsers: () => api.get<{ items: OrgUserSummary[] }>("/event-assignments/users"),
  listAssignments: () => api.get<{ items: EventAdminAssignment[] }>("/event-assignments"),
  create: (body: AssignEventAdminInput) =>
    api.post<EventAdminAssignment>("/event-assignments", body),
  update: (id: string, body: UpdateEventAdminAssignmentInput) =>
    api.patch<EventAdminAssignment>(`/event-assignments/${id}`, body),
  revoke: (id: string) => api.delete<void>(`/event-assignments/${id}`),
};

export const settingsApi = {
  updateOrganization: (body: UpdateOrganizationInput) =>
    api.patch<{ organization: { logoUrl: string | null } }>("/organizations", body),
  presignOrganizationLogo: (body: BrandingUploadRequestInput) =>
    api.post<PhotoUploadResponse>("/organizations/logo-upload", body),
  presignAvatar: (body: BrandingUploadRequestInput) =>
    api.post<PhotoUploadResponse>("/auth/avatar-upload", body),
  updatePreferences: (body: UpdatePreferencesInput) => api.patch("/auth/preferences", body),
};

export const feedbackApi = {
  submit: (body: SubmitFeedbackInput) => api.post("/feedback", body),
};

export const bugReportsApi = {
  submit: (body: SubmitBugReportInput) => api.post("/bug-reports", body),
};

export const adminApi = {
  listUsers: () => api.get<{ items: OrgUserSummary[] }>("/admin/users"),
  createUser: (body: CreateOrgUserInput) =>
    api.post<OrgUserSummary>("/admin/users", body),
  deleteUser: (userId: string, confirmEmail: string) =>
    api.delete<{ success: boolean; message: string }>(`/admin/users/${userId}`, { confirmEmail }),
};

export const uploadToPresignedUrl = async (
  url: string,
  blob: Blob,
): Promise<void> => {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": blob.type },
    body: blob,
  });
  if (!res.ok) {
    throw new ApiClientError(res.status, "UPLOAD_FAILED", `Upload failed: ${res.status}`);
  }
};
