export function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/dashboard";
  try {
    const base = "https://dromap.invalid";
    return new URL(value, base).origin === base ? value : "/dashboard";
  } catch { return "/dashboard"; }
}
