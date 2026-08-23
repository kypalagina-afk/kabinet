import { FirebaseError } from "firebase/app";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usernameToTechnicalEmail } from "../../lib/firebase/authAlias";
import { getFirebaseAuth, getFirebaseDb } from "../../lib/firebase/client";
import type { UserProfile } from "../../lib/firebase/types";

export type ThemePreference = UserProfile["preferences"]["theme"];
export type AuthStatus = "loading" | "anonymous" | "authenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  profile: UserProfile | null;
  error: string | null;
  theme: ThemePreference;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  setTheme(theme: ThemePreference): Promise<void>;
  setAvatar(avatarKey: string): Promise<void>;
  setTimezone(iana: string): Promise<void>;
  clearError(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const THEME_STORAGE_KEY = "kabinet-theme";

function storedTheme(): ThemePreference {
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<UserProfile>;
  return (
    (candidate.role === "teacher" || candidate.role === "student") &&
    typeof candidate.username === "string" &&
    !!candidate.preferences &&
    (candidate.preferences.theme === "light" ||
      candidate.preferences.theme === "dark" ||
      candidate.preferences.theme === "system")
  );
}

function friendlyAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (
      error.code === "auth/invalid-credential" ||
      error.code === "auth/user-not-found" ||
      error.code === "auth/wrong-password"
    ) {
      return "Неверный логин или пароль.";
    }
    if (error.code === "auth/too-many-requests") {
      return "Слишком много попыток. Попробуйте позже.";
    }
    if (error.code === "auth/network-request-failed") {
      return "Не удалось связаться с сервисом входа.";
    }
  }

  return "Не удалось выполнить вход. Проверьте данные и попробуйте снова.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setThemeState] = useState<ThemePreference>(storedTheme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolvedTheme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    let stopProfile: (() => void) | null = null;

    const stopAuth = onAuthStateChanged(auth, (nextUser) => {
      stopProfile?.();
      stopProfile = null;

      if (!nextUser) {
        setUser(null);
        setProfile(null);
        setStatus("anonymous");
        return;
      }

      setStatus("loading");
      setUser(nextUser);
      stopProfile = onSnapshot(
        doc(db, "users", nextUser.uid),
        (snapshot) => {
          if (!snapshot.exists() && snapshot.metadata.fromCache) {
            return;
          }
          const profileData = snapshot.data();
          if (!snapshot.exists() || !isUserProfile(profileData)) {
            setError("Профиль пользователя не найден или повреждён.");
            void signOut(auth);
            return;
          }

          setProfile(profileData);
          setThemeState(profileData.preferences.theme);
          window.localStorage.setItem(
            THEME_STORAGE_KEY,
            profileData.preferences.theme,
          );
          setStatus("authenticated");
        },
        () => {
          setError("Не удалось загрузить профиль пользователя.");
          void signOut(auth);
        },
      );
    });

    return () => {
      stopProfile?.();
      stopAuth();
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    try {
      const auth = getFirebaseAuth();
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(
        auth,
        usernameToTechnicalEmail(username),
        password,
      );
    } catch (loginError) {
      setError(friendlyAuthError(loginError));
      throw loginError;
    }
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    await signOut(getFirebaseAuth());
  }, []);

  const setTheme = useCallback(
    async (nextTheme: ThemePreference) => {
      const previousTheme = theme;
      setThemeState(nextTheme);
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);

      if (!user || !profile) {
        return;
      }

      setProfile({
        ...profile,
        preferences: { ...profile.preferences, theme: nextTheme },
      });

      try {
        await updateDoc(doc(getFirebaseDb(), "users", user.uid), {
          preferences: { ...profile.preferences, theme: nextTheme },
          updatedAt: serverTimestamp(),
        });
      } catch (updateError) {
        setThemeState(previousTheme);
        window.localStorage.setItem(THEME_STORAGE_KEY, previousTheme);
        setProfile(profile);
        setError("Не удалось сохранить тему. Попробуйте ещё раз.");
        throw updateError;
      }
    },
    [profile, theme, user],
  );

  const clearError = useCallback(() => setError(null), []);
  const setAvatar = useCallback(async (avatarKey: string) => {
    if (!user || !profile) return;
    setProfile({ ...profile, avatarKey });
    try {
      await updateDoc(doc(getFirebaseDb(), "users", user.uid), { avatarKey, updatedAt: serverTimestamp() });
    } catch (updateError) {
      setProfile(profile);
      setError("Не удалось сохранить аватар.");
      throw updateError;
    }
  }, [profile, user]);

  const setTimezone = useCallback(async (iana: string) => {
    if (!user || !profile) return;
    try {
      new Intl.DateTimeFormat("ru-RU", { timeZone: iana }).format(new Date());
    } catch {
      throw new Error("Неизвестный часовой пояс");
    }
    const previousProfile = profile;
    const timezone = { ...profile.timezone, iana };
    setProfile({ ...profile, timezone });
    try {
      await updateDoc(doc(getFirebaseDb(), "users", user.uid), {
        timezone,
        updatedAt: serverTimestamp(),
      });
    } catch (updateError) {
      setProfile(previousProfile);
      setError("Не удалось сохранить часовой пояс.");
      throw updateError;
    }
  }, [profile, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      profile,
      error,
      theme,
      login,
      logout,
      setTheme,
      setAvatar,
      setTimezone,
      clearError,
    }),
    [clearError, error, login, logout, profile, setAvatar, setTheme, setTimezone, status, theme, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The hook intentionally shares the provider context defined in this module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
