import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../features/auth/AuthProvider";
import { Avatar, AvatarPicker } from "../features/avatar/Avatar";
import { calculateGamificationSummary } from "../features/gamification/gamification";
import { useStudentGamification } from "../features/gamification/hooks";
import { useStudentWorkspace } from "../features/vertical-slice/hooks";

const iconByKey: Record<string, string> = {
  spark: "✦", shield: "◆", clock: "◷", flame: "♨", rocket: "↑", target: "◎",
  trend: "↗", return: "↺", trophy: "♛", star: "★", route: "◇", badge: "✧", crown: "♕",
};

export function StudentProfilePage() {
  const { profile, setAvatar } = useAuth();
  const studentId = profile?.studentId ?? "";
  const workspace = useStudentWorkspace(studentId);
  const gamification = useStudentGamification(studentId);
  const summary = useMemo(
    () =>
      calculateGamificationSummary({
        ...gamification.data,
        submissions: workspace.data.homeworkSubmissions,
        homeworks: workspace.data.homeworks,
        mockExams: workspace.data.mockExams,
      }),
    [gamification.data, workspace.data.homeworkSubmissions, workspace.data.homeworks, workspace.data.mockExams],
  );
  const latest = summary.earned[0];
  const [popupOpen, setPopupOpen] = useState(false);
  useEffect(() => {
    if (!latest) return;
    const key = `achievement-seen:${latest.achievement.id}`;
    if (!sessionStorage.getItem(key)) {
      // The persisted session marker is the external source of truth for this one-time UI.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPopupOpen(true);
      sessionStorage.setItem(key, "1");
    }
  }, [latest]);

  return (
    <section className="shell-content profile-page" aria-labelledby="profile-title">
      <header className="profile-hero">
        <Avatar avatarKey={profile?.avatarKey} label={workspace.data.student?.data.displayName ?? "Ученик"} size="large" />
        <div><p className="eyebrow">Профиль</p><h1 id="profile-title">{workspace.data.student?.data.displayName ?? profile?.username}</h1><p>{workspace.data.programProfile?.data.title}</p></div>
        <div className="level-badge"><span>Уровень</span><strong>{summary.level}</strong></div>
      </header>
      <section className="profile-avatar-picker"><p className="eyebrow">Мой аватар</p><AvatarPicker value={profile?.avatarKey} onChange={(key) => void setAvatar(key)} /></section>
      <section className="xp-panel">
        <div><strong>{summary.totalXp} XP</strong><span>До следующего уровня: {summary.xpToNextLevel} XP</span></div>
        <span className="xp-bar"><i style={{ width: `${(summary.levelXp / 500) * 100}%` }} /></span>
        <span className="streak-chip">♨ Серия: {summary.streak}</span>
      </section>
      <section className="achievement-section">
        <div className="panel-heading"><div><p className="eyebrow">Мои награды</p><h2>Достижения</h2></div><span>{summary.earned.length} получено</span></div>
        <div className="achievement-grid" data-testid="achievement-grid">
          {summary.earned.map(({ achievement, definition }) => (
            <article className="achievement-badge" key={achievement.id}>
              <span className="achievement-badge__icon">{iconByKey[definition?.data.iconKey ?? "star"] ?? "★"}</span>
              <strong>{definition?.data.title ?? achievement.data.achievementDefinitionId}</strong>
              <small>{definition?.data.description ?? "Новое достижение"}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="analytics-panel">
        <p className="eyebrow">История XP</p>
        <div className="xp-history">
          {[...gamification.data.events].sort((left, right) => right.data.createdAt.toMillis() - left.data.createdAt.toMillis()).map(({ id, data }) => (
            <div key={id}><span>{data.eventType === "homework_completed" ? "Домашнее задание проверено" : data.eventType}</span><strong>+{data.xpDelta} XP</strong></div>
          ))}
        </div>
      </section>
      {popupOpen && latest ? (
        <div className="achievement-popup" role="dialog" aria-label="Новое достижение">
          <span className="achievement-badge__icon">{iconByKey[latest.definition?.data.iconKey ?? "star"] ?? "★"}</span>
          <p className="eyebrow">Новое достижение</p>
          <h2>{latest.definition?.data.title ?? "Новая награда"}</h2>
          <button className="primary-button" onClick={() => setPopupOpen(false)} type="button">Отлично!</button>
        </div>
      ) : null}
    </section>
  );
}
