import { Navigate, Outlet } from "react-router-dom";
import type { UserRole } from "../../lib/firebase/types";
import { useAuth } from "./AuthProvider";

function roleHome(role: UserRole): string {
  return role === "teacher" ? "/teacher" : "/student";
}

export function AuthLoadingScreen() {
  return (
    <main className="state-screen" aria-live="polite" aria-busy="true">
      <div className="loading-indicator" aria-hidden="true" />
      <p>Загружаем кабинет…</p>
    </main>
  );
}

export function GuestOnlyRoute() {
  const { status, profile } = useAuth();

  if (status === "loading") {
    return <AuthLoadingScreen />;
  }
  if (status === "authenticated" && profile) {
    return <Navigate to={roleHome(profile.role)} replace />;
  }
  return <Outlet />;
}

export function RoleRoute({ role }: { role: UserRole }) {
  const { status, profile } = useAuth();

  if (status === "loading") {
    return <AuthLoadingScreen />;
  }
  if (status === "anonymous" || !profile) {
    return <Navigate to="/login" replace />;
  }
  if (profile.role !== role) {
    return <Navigate to={roleHome(profile.role)} replace />;
  }
  return <Outlet />;
}

export function AuthHomeRedirect() {
  const { status, profile } = useAuth();

  if (status === "loading") {
    return <AuthLoadingScreen />;
  }
  if (status === "authenticated" && profile) {
    return <Navigate to={roleHome(profile.role)} replace />;
  }
  return <Navigate to="/login" replace />;
}
