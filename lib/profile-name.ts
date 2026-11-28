export function parseProfileCreateInput(input: unknown): { name: string } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "name" || typeof record.name !== "string") return null;
  const name = record.name.trim();
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return { name };
}
