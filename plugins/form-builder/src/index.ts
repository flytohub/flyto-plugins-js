// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Flyto2 Form Builder Plugin
 *
 * Two UI steps:
 *   1. collect_form  — dynamic form with any field types, single or wizard mode
 *   2. approval_form — context display + approve/reject + optional fields
 */

import { createPlugin } from "@flyto/plugin-sdk";
import type { StepResult } from "@flyto/plugin-sdk";

const plugin = createPlugin({
  id: "flyto-community/form-builder",
  version: "0.1.0",
  name: "Form Builder",
});

// ── collect_form ─────────────────────────────────────────

plugin.uiStep(
  "collect_form",
  {
    page: "ui",
    type: "dialog",
    width: 720,
    height: 700,
    timeoutMs: 1_800_000,
  },
  async (input, ctx): Promise<StepResult> => {
    const title = (input.title as string) || "Form";
    const description = input.description as string | undefined;
    const mode = (input.mode as string) || "single";
    const submitLabel = (input.submit_label as string) || "Submit";
    const fields = input.fields as unknown[];

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return {
        ok: false,
        error: {
          code: "INVALID_PARAMS",
          message: "'fields' must be a non-empty array of field definitions",
        },
      };
    }

    const result = await ctx.waitForUI({
      page: "ui",
      type: "dialog",
      width: 720,
      height: 700,
      props: {
        stepType: "collect_form",
        title,
        description,
        mode,
        submitLabel,
        fields,
      },
    });

    if (!result.submitted) {
      return {
        ok: true,
        data: {
          submitted: false,
          values: {},
          metadata: { cancelled: true },
        },
      };
    }

    return {
      ok: true,
      data: {
        submitted: true,
        values: result.data.values || {},
        metadata: result.data.metadata || {},
      },
    };
  }
);

// ── approval_form ────────────────────────────────────────

plugin.uiStep(
  "approval_form",
  {
    page: "ui",
    type: "dialog",
    width: 640,
    height: 600,
    timeoutMs: 1_800_000,
  },
  async (input, ctx): Promise<StepResult> => {
    const title = (input.title as string) || "Approval Required";
    const context = (input.context as Record<string, unknown>) || {};
    const fields = (input.fields as unknown[]) || [];
    const requireComment = (input.require_comment as boolean) || false;
    const approveLabel = (input.approve_label as string) || "Approve";
    const rejectLabel = (input.reject_label as string) || "Reject";

    const result = await ctx.waitForUI({
      page: "ui",
      type: "dialog",
      width: 640,
      height: 600,
      props: {
        stepType: "approval_form",
        title,
        context,
        fields,
        requireComment,
        approveLabel,
        rejectLabel,
      },
    });

    if (!result.submitted) {
      return {
        ok: true,
        data: {
          decision: "rejected",
          comment: "User closed the dialog",
          values: {},
        },
      };
    }

    return {
      ok: true,
      data: {
        decision: result.data.decision || "approved",
        comment: result.data.comment || "",
        values: result.data.values || {},
      },
    };
  }
);

// ── Start ────────────────────────────────────────────────

plugin.start();
