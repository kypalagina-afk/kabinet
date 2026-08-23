import type { User } from "firebase/auth";
import { getFirebaseAuth } from "../firebase/client.js";

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  user?: User | null;
};

function backendBaseUrl(): string {
  const value = import.meta.env.VITE_KABINET_API_BASE?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Защищённый production backend не настроен.");
  return value;
}

export async function backendRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const user = options.user ?? getFirebaseAuth().currentUser;
  if (!user) throw new Error("Требуется вход в аккаунт.");
  const endpoint = new URL(backendBaseUrl());
  endpoint.searchParams.set("path", path);
  const response = await fetch(endpoint, {
    method: options.method ?? "GET",
    headers: {
      authorization: `Bearer ${await user.getIdToken()}`,
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const result = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(result.error ?? "Серверная операция не выполнена.");
  return result;
}
