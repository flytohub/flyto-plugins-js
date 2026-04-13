// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Flyto2 Image Crop Plugin
 *
 * Interactive image cropping tool — opens a UI page where the user
 * can crop an image, then returns the cropped result to the workflow.
 */

import { createPlugin } from "@flyto/plugin-sdk";

const plugin = createPlugin({
  id: "flyto-community/image-crop",
  version: "0.1.0",
  name: "Image Crop",
});

// ── crop_image (UI step) ─────────────────────────────────

plugin.uiStep(
  "crop_image",
  {
    page: "ui",
    type: "dialog",
    width: 900,
    height: 650,
    timeoutMs: 600_000, // 10 min — user needs time to crop
  },
  async (input, ctx) => {
    const imageUrl = input.image_url as string;
    const aspectRatio = (input.aspect_ratio as string) || "free";
    const outputFormat = (input.output_format as string) || "image/png";
    const quality = (input.quality as number) || 0.92;

    if (!imageUrl) {
      return {
        ok: false,
        error: {
          code: "INVALID_PARAMS",
          message: "'image_url' is required",
        },
      };
    }

    // Open the UI and wait for the user to crop
    const result = await ctx.waitForUI({
      page: "ui",
      type: "dialog",
      width: 900,
      height: 650,
      props: {
        imageUrl,
        aspectRatio,
        outputFormat,
        quality,
      },
    });

    if (!result.submitted) {
      return {
        ok: false,
        error: {
          code: "USER_CANCELLED",
          message: "User cancelled the crop operation",
        },
      };
    }

    return {
      ok: true,
      data: {
        cropped_data_url: result.data.croppedDataUrl,
        crop_rect: result.data.cropRect,
        original_size: result.data.originalSize,
      },
    };
  }
);

// ── Start plugin ─────────────────────────────────────────

plugin.start();
