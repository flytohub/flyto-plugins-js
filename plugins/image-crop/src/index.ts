// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/** Flyto2 interactive image-crop reference plugin. */

import { createPlugin } from "@flyto2/plugin-sdk";
import type { StepResult, UIStepContext } from "@flyto2/plugin-sdk";

const ASPECT_RATIOS = new Set(["free", "1:1", "16:9", "4:3", "9:16"]);
const OUTPUT_FORMATS = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Accept browser-loadable image locations, never script or local-file URLs. */
function isAllowedImageUrl(value: string): boolean {
  if (value.startsWith("data:image/") || value.startsWith("blob:")) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Validate crop parameters, open the UI, and normalize its result. */
export async function cropImage(
  input: Record<string, unknown>,
  ctx: UIStepContext,
): Promise<StepResult> {
  const imageUrl = input.image_url;
  const aspectRatio = input.aspect_ratio === undefined ? "free" : input.aspect_ratio;
  const outputFormat = input.output_format === undefined ? "image/png" : input.output_format;
  const quality = input.quality === undefined ? 0.92 : input.quality;

  if (typeof imageUrl !== "string" || !imageUrl || !isAllowedImageUrl(imageUrl)) {
    return {
      ok: false,
      error: {
        code: "INVALID_PARAMS",
        message: "'image_url' must use https, http, blob, or an image data URL",
      },
    };
  }
  if (typeof aspectRatio !== "string" || !ASPECT_RATIOS.has(aspectRatio)) {
    return {
      ok: false,
      error: { code: "INVALID_PARAMS", message: "Unsupported aspect_ratio" },
    };
  }
  if (typeof outputFormat !== "string" || !OUTPUT_FORMATS.has(outputFormat)) {
    return {
      ok: false,
      error: { code: "INVALID_PARAMS", message: "Unsupported output_format" },
    };
  }
  if (typeof quality !== "number" || !Number.isFinite(quality) || quality < 0.1 || quality > 1) {
    return {
      ok: false,
      error: { code: "INVALID_PARAMS", message: "'quality' must be from 0.1 through 1" },
    };
  }

  const result = await ctx.waitForUI({
    page: "ui",
    type: "dialog",
    width: 900,
    height: 650,
    props: { imageUrl, aspectRatio, outputFormat, quality },
  });

  if (!result.submitted) {
    return {
      ok: false,
      error: { code: "USER_CANCELLED", message: "User cancelled the crop operation" },
    };
  }

  const cropRect = result.data.cropRect as Record<string, unknown> | undefined;
  const originalSize = result.data.originalSize as Record<string, unknown> | undefined;
  const cropRectValid = !!cropRect && !Array.isArray(cropRect)
    && [cropRect.x, cropRect.y, cropRect.width, cropRect.height].every(Number.isFinite)
    && Number(cropRect.x) >= 0 && Number(cropRect.y) >= 0
    && Number(cropRect.width) > 0 && Number(cropRect.height) > 0;
  const originalSizeValid = !!originalSize && !Array.isArray(originalSize)
    && [originalSize.width, originalSize.height].every(Number.isFinite)
    && Number(originalSize.width) > 0 && Number(originalSize.height) > 0;
  if (typeof result.data.croppedDataUrl !== "string"
    || !result.data.croppedDataUrl.startsWith(`data:${outputFormat};`)
    || !cropRectValid || !originalSizeValid) {
    return {
      ok: false,
      error: { code: "INVALID_UI_RESULT", message: "Crop UI returned an invalid result" },
    };
  }

  return {
    ok: true,
    data: {
      cropped_data_url: result.data.croppedDataUrl,
      crop_rect: cropRect,
      original_size: originalSize,
    },
  };
}

/** Registered Image Crop plugin instance used by Core and tests. */
export const plugin = createPlugin({
  id: "flyto-community/image-crop",
  version: "0.1.0",
  name: "Image Crop",
});

plugin.uiStep(
  "crop_image",
  { page: "ui", type: "dialog", width: 900, height: 650, timeoutMs: 600_000 },
  cropImage,
);

if (require.main === module) plugin.start();
