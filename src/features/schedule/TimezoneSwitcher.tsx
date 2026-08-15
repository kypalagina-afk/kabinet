import type { TimeDisplayMode } from "./timezone";

const options: Array<{ value: TimeDisplayMode; label: string }> = [
  { value: "mine", label: "Моё время" },
  { value: "moscow", label: "Москва" },
  { value: "student", label: "Время ученика" },
];

export function TimezoneSwitcher({
  value,
  onChange,
  studentDisabled = false,
}: {
  value: TimeDisplayMode;
  onChange(value: TimeDisplayMode): void;
  studentDisabled?: boolean;
}) {
  return (
    <div className="timezone-switcher" aria-label="Часовой пояс календаря" role="group">
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={value === option.value ? "timezone-option timezone-option--active" : "timezone-option"}
          disabled={option.value === "student" && studentDisabled}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
