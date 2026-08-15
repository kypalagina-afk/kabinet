export const studentAvatarKeys = Array.from({ length: 12 }, (_, index) => `student_${String(index + 1).padStart(2, "0")}`);
export const animalAvatarKeys = Array.from({ length: 12 }, (_, index) => `animal_${String(index + 1).padStart(2, "0")}`);
export const avatarKeys = [...studentAvatarKeys, ...animalAvatarKeys] as const;

export function avatarAssetUrl(key: string) {
  const group = key.startsWith("animal_") ? "animals" : "students";
  return `${import.meta.env.BASE_URL}assets/avatars/${group}/${key}.png`;
}
