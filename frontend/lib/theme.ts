export type ThemePreference = "LIGHT" | "DARK";

export function nextTheme(theme: ThemePreference): ThemePreference {
  return theme === "DARK" ? "LIGHT" : "DARK";
}