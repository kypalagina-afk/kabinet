import { useState, type CSSProperties } from "react";
import { CheckIcon } from "../../components/Icons";
import { animalAvatarKeys, avatarAssetUrl, avatarKeys, studentAvatarKeys } from "./avatarCatalog";

export function Avatar({ avatarKey, label, size = "medium", scale, shape = "round", selected = false }: { avatarKey?: string | null; label: string; size?: "small" | "medium" | "large" | number; scale?: number; shape?: "round" | "rounded-square" | "square"; selected?: boolean }) {
  const valid = avatarKey && avatarKeys.includes(avatarKey as typeof avatarKeys[number]);
  const sizeClass = typeof size === "number" ? "avatar--custom" : `avatar--${size}`;
  const style = {
    ...(typeof size === "number" ? { "--avatar-size": `${size}px` } : {}),
    "--avatar-scale": String(scale ?? (avatarKey?.startsWith("animal_") ? 1.18 : 1.34)),
  } as CSSProperties;
  return (
    <span aria-label={`Аватар: ${label}`} aria-selected={selected} className={`avatar ${sizeClass} avatar--${shape}${selected ? " avatar--selected" : ""}`} role="img" style={style}>
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
        {keys.map((key) => <button aria-label={`Выбрать аватар ${key}`} aria-pressed={value === key} key={key} onClick={() => onChange(key)} role="listitem" type="button"><Avatar avatarKey={key} label={key} selected={value === key} shape="rounded-square" size={68} />{value === key ? <span className="avatar-picker__check"><CheckIcon /></span> : null}</button>)}
      </div>
    </div>
  );
}
