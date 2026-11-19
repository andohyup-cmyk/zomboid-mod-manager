import type { ProfileModSelection } from "./profile-mod-id-state";
import {
  recommendProfileModOrder,
  type ProfileOrderRecommendation,
  type ProfileOrderWarning
} from "./profile-mod-recommended-order";

export type ProfileOrderPreviewOptions = Parameters<typeof recommendProfileModOrder>[1] & {
  readonly exampleRules?: boolean;
};

export type ProfileOrderPreview = {
  readonly selections: readonly ProfileModSelection[];
  readonly options: ProfileOrderPreviewOptions;
  readonly result: ProfileOrderRecommendation<ProfileModSelection>;
};

export function calculateProfileOrderPreview(
  selections: readonly ProfileModSelection[],
  options: ProfileOrderPreviewOptions
): ProfileOrderPreview {
  return { selections, options, result: recommendProfileModOrder(selections, options) };
}

export function isCurrentProfileOrderPreview(
  preview: ProfileOrderPreview,
  selections: readonly ProfileModSelection[],
  options: ProfileOrderPreviewOptions
): boolean {
  return preview.selections === selections && preview.options === options;
}

export function getApplicableProfileOrder(
  preview: ProfileOrderPreview,
  selections: readonly ProfileModSelection[],
  options: ProfileOrderPreviewOptions
): readonly ProfileModSelection[] | null {
  if (!isCurrentProfileOrderPreview(preview, selections, options) || !preview.result.changes.length) return null;
  return preview.result.recommendedOrder;
}

export function isBlockingProfileOrderWarning(warning: ProfileOrderWarning): boolean {
  if (warning.code === "cycle" || warning.code === "duplicate-selection") return true;
  return (warning.code === "missing-target" || warning.code === "disabled-target"
    || warning.code === "ambiguous-reference") && warning.rule.kind === "requires";
}
