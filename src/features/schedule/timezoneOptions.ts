export const russianTimezoneOptions = [
  ["Europe/Kaliningrad", "МСК−1 · Калининград", 120],
  ["Europe/Moscow", "МСК · Москва", 180],
  ["Europe/Samara", "МСК+1 · Самара", 240],
  ["Asia/Yekaterinburg", "МСК+2 · Екатеринбург", 300],
  ["Asia/Omsk", "МСК+3 · Омск", 360],
  ["Asia/Novosibirsk", "МСК+4 · Новосибирск", 420],
  ["Asia/Irkutsk", "МСК+5 · Иркутск", 480],
  ["Asia/Yakutsk", "МСК+6 · Якутск", 540],
  ["Asia/Vladivostok", "МСК+7 · Владивосток", 600],
  ["Asia/Magadan", "МСК+8 · Магадан", 660],
  ["Asia/Kamchatka", "МСК+9 · Камчатка", 720],
] as const;

export function timezoneOffsetMinutes(iana: string) {
  return russianTimezoneOptions.find(([value]) => value === iana)?.[2] ?? null;
}
