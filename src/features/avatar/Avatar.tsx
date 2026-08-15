import { useState } from "react";
import { CheckIcon } from "../../components/Icons";
import { animalAvatarKeys, avatarAssetUrl, avatarKeys, studentAvatarKeys } from "./avatarCatalog";

export function Avatar({ avatarKey, label, size = "medium", shape = "round" }: { avatarKey?: string | null; label: string; size?: "small" | "medium" | "large"; shape?: "round" | "square" }) {
  const valid = avatarKey && avatarKeys.includes(avatarKey as typeof avatarKeys[number]);
  return (
    <span aria-label={`Аватар: ${label}`} className={`avatar avatar--${size} avatar--${shape}`} role="img">
      {valid ? <img alt="" draggable={false} src={avatarAssetUrl(avatarKey)} /> : <span aria-hidden="true">{label.trim().slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

export function AvatarPicker({ value, onChange }: { value?: string | null; onChange(key: string): void }) {
  const [tab, setTab] = useState<"students" | "animals">(value?.startsWith("animal_") ? "animals" : "students");
  const keys = tab === "students" ? studentAvatarKeys : animalAvatarKeys;
  return (
    <div className="avatar-picker-panel">
      <div aria-label="Категория аватаров" className="segmented-control avatar-picker-tabs">
        <button aria-pressed={tab === "students"} onClick={() => setTab("students")} type="button">Ребята</button>
        <button aria-pressed={tab === "animals"} onClick={() => setTab("animals")} type="button">Животные</button>
      </div>
      <div aria-label="Выбор аватара" className="avatar-picker" role="list">
        {keys.map((key) => <button aria-label={`Выбрать аватар ${key}`} aria-pressed={value === key} key={key} onClick={() => onChange(key)} role="listitem" type="button"><Avatar avatarKey={key} label={key} size="small" />{value === key ? <span className="avatar-picker__check"><CheckIcon /></span> : null}</button>)}
      </div>
    </div>
  );
}
