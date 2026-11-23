/** Display-only labels/styles for verification states. Unknown values stay visible as-is. */
export const STATUS_LABEL: Record<string, string> = {
  unverified: "미확인", confirmed: "확인", reported_issue: "문제 제보"
};
export const STATUS_STYLE: Record<string, string> = {
  unverified: "bg-[#2a3441] text-[#c3d0dc]",
  confirmed: "bg-[#294535] text-[#b9efb0]",
  reported_issue: "bg-[#4a2b2b] text-[#ffc9c9]"
};
export function statusLabel(value: string): string {
  return STATUS_LABEL[value] ?? value;
}
export function statusStyle(value: string): string {
  return STATUS_STYLE[value] ?? STATUS_STYLE.unverified;
}
