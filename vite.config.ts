import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const aliasDomain = "kabinet25.example.com";
const usernamePattern = /^[a-z0-9._-]+$/;

async function bodyOf(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}

function reply(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function localProvisioningPlugin(): Plugin {
  return {
    name: "kabinet-local-provisioning",
    configureServer(server) {
      server.middlewares.use(
        "/__emulator/student-provisioning",
        async (request, response) => {
          if (
            process.env.VITE_FIREBASE_TARGET !== "emulator" ||
            request.method !== "POST"
          ) {
            reply(response, 404, { error: "Not available" });
            return;
          }
          try {
            process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
            process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
            const projectId =
              process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-kabinet-25";
            const app =
              getApps()[0] ??
              initializeApp({ projectId }, "vite-local-provisioning");
            const token = request.headers.authorization?.replace(
              /^Bearer\s+/i,
              "",
            );
            if (!token) throw new Error("Teacher token is required");
            const decoded = await getAuth(app).verifyIdToken(token);
            const db = getFirestore(app);
            const teacherProfile = await db.doc(`users/${decoded.uid}`).get();
            if (teacherProfile.data()?.role !== "teacher")
              throw new Error("Teacher role is required");
            const body = await bodyOf(request);
            const action = String(body.action ?? "create");
            if (action === "reset-password") {
              const studentId = String(body.studentId ?? "");
              const password = String(body.password ?? "");
              const student = await db.doc(`students/${studentId}`).get();
              if (
                student.data()?.teacherId !== decoded.uid ||
                password.length < 6
              )
                throw new Error("Invalid reset request");
              await getAuth(app).updateUser(studentId, { password });
              await db
                .collection("teacherAuditEvents")
                .add({
                  teacherId: decoded.uid,
                  studentId,
                  entityType: "student",
                  entityId: studentId,
                  action: "password_reset",
                  summary: "Пароль ученика сброшен",
                  createdAt: FieldValue.serverTimestamp(),
                  schemaVersion: 1,
                });
              reply(response, 200, { status: "reset" });
              return;
            }
            const username = String(body.username ?? "")
              .trim()
              .toLowerCase();
            const password = String(body.password ?? "");
            if (!usernamePattern.test(username) || password.length < 6)
              throw new Error("Invalid login or password");
            const programProfileId = String(body.programProfileId ?? "");
            const programProfile = await db
              .doc(`programProfiles/${programProfileId}`)
              .get();
            if (!programProfile.exists || programProfile.data()?.active === false)
              throw new Error("Selected program is not available");
            const user = await getAuth(app).createUser({
              email: `${username}@${aliasDomain}`,
              password,
              displayName: String(body.displayName ?? ""),
            });
            try {
              const now = Timestamp.now();
              const studentId = user.uid;
              const batch = db.batch();
              const avatar = body.avatarKey
                ? { avatarKey: String(body.avatarKey) }
                : {};
              batch.set(db.doc(`users/${studentId}`), {
              role: "student",
              displayName: String(body.displayName ?? "Ученик"),
              username,
              usernameNormalized: username,
              teacherId: decoded.uid,
              studentId,
              ...avatar,
              preferences: { theme: "light" },
              timezone: {
                iana: String(body.timezone ?? "Europe/Moscow"),
                moscowOffsetMinutes: null,
              },
              createdAt: now,
              updatedAt: now,
              schemaVersion: 1,
              });
              batch.set(db.doc(`students/${studentId}`), {
              teacherId: decoded.uid,
              displayName: String(body.displayName ?? "Ученик"),
              classGrade: Number(body.classGrade) || null,
              ...avatar,
              status: "active",
              defaultConference: {
                provider: "other",
                joinUrl: String(body.conferenceUrl ?? "") || null,
                meetingId: null,
                passcode: null,
                chatUrl: null,
              },
              archivedAt: null,
              createdAt: now,
              updatedAt: now,
              schemaVersion: 1,
              });
              const programId = `student-program__${studentId}`;
              batch.set(db.doc(`studentPrograms/${programId}`), {
              teacherId: decoded.uid,
              studentId,
              programProfileId,
              status: "active",
              goal: {
                type: "custom",
                targetGrade: null,
                targetScore: null,
                displayText: String(body.goal ?? ""),
              },
              startedAt: now,
              completedAt: null,
              createdAt: now,
              updatedAt: now,
              schemaVersion: 1,
              });
              batch.set(db.doc(`studentPaymentAccounts/${studentId}`), {
                teacherId: decoded.uid,
                studentId,
                balanceLessons: 0,
                lessonPrice: null,
                currency: "RUB",
                updatedAt: now,
                createdAt: now,
                schemaVersion: 1,
              });
              if (body.scheduleWeekday && body.scheduleTime) {
              const startsOn = new Date().toISOString().slice(0, 10);
              const time = String(body.scheduleTime);
              const weekday = Number(body.scheduleWeekday);
              const seriesId = `${studentId}__${startsOn}__w${weekday}__${time.replace(":", "")}__i1`;
                batch.set(db.doc(`lessonSeries/${seriesId}`), {
                teacherId: decoded.uid,
                studentId,
                studentProgramId: programId,
                frequency: "weekly",
                weekdays: [weekday],
                interval: 1,
                startLocalTime: time,
                durationMinutes: Number(body.scheduleDuration) || 60,
                baseTimezone: "Europe/Moscow",
                active: true,
                startsOn,
                endsOn: null,
                cancelledAt: null,
                cancelledBy: null,
                createdAt: now,
                updatedAt: now,
                schemaVersion: 1,
                });
              }
              await batch.commit();
              reply(response, 200, { studentId, username });
            } catch (error) {
              await getAuth(app).deleteUser(user.uid).catch(() => undefined);
              throw error;
            }
          } catch (error) {
            reply(response, 400, {
              error:
                error instanceof Error ? error.message : "Provisioning failed",
            });
          }
        },
      );
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "./",
  plugins: [react(), localProvisioningPlugin()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "firebase",
              test: /node_modules[\\/](@firebase|firebase)[\\/]/,
              priority: 20,
            },
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
