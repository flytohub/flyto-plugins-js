// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/** Flyto2 dynamic form and approval reference plugin. */

import { createPlugin } from "@flyto2/plugin-sdk";
import type { StepResult, UIStepContext } from "@flyto2/plugin-sdk";

const INTERACTIVE_FIELD_TYPES = new Set([
  "text", "email", "url", "phone", "password", "textarea", "number", "select",
  "multiselect", "radio", "checkbox", "toggle", "date", "time", "datetime",
  "slider", "rating", "color", "file",
]);
const STRUCTURAL_FIELD_TYPES = new Set(["section", "divider", "step_break"]);
const CONDITION_OPERATORS = new Set(["eq", "neq", "gt", "lt", "contains", "not_empty", "empty"]);
const FIELD_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;

/** Return a validation error for malformed field definitions, or null. */
function validateFields(value: unknown): string | null {
  if (!Array.isArray(value)) return "'fields' must be an array";
  const ids = new Set<string>();
  for (const [index, rawField] of value.entries()) {
    if (!rawField || typeof rawField !== "object" || Array.isArray(rawField)) {
      return `fields[${index}] must be an object`;
    }
    const field = rawField as Record<string, unknown>;
    if (typeof field.type !== "string"
      || (!INTERACTIVE_FIELD_TYPES.has(field.type) && !STRUCTURAL_FIELD_TYPES.has(field.type))) {
      return `fields[${index}].type is unsupported`;
    }
    if (INTERACTIVE_FIELD_TYPES.has(field.type)) {
      if (typeof field.id !== "string" || !FIELD_ID_PATTERN.test(field.id)) {
        return `fields[${index}].id must be a safe unique identifier`;
      }
      if (ids.has(field.id)) return `fields[${index}].id is duplicated`;
      ids.add(field.id);
    }
    if (["select", "multiselect", "radio"].includes(field.type)) {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        return `fields[${index}].options must be a non-empty array`;
      }
      for (const option of field.options) {
        if (!option || typeof option !== "object" || Array.isArray(option)
          || typeof (option as Record<string, unknown>).label !== "string"
          || !("value" in option)) {
          return `fields[${index}].options contains an invalid option`;
        }
      }
    }
    if (field.condition !== undefined) {
      if (!field.condition || typeof field.condition !== "object" || Array.isArray(field.condition)) {
        return `fields[${index}].condition must be an object`;
      }
      const condition = field.condition as Record<string, unknown>;
      if (typeof condition.field !== "string" || !FIELD_ID_PATTERN.test(condition.field)
        || (condition.op !== undefined
          && (typeof condition.op !== "string" || !CONDITION_OPERATORS.has(condition.op)))) {
        return `fields[${index}].condition is invalid`;
      }
    }
    if (field.validation !== undefined) {
      if (!field.validation || typeof field.validation !== "object" || Array.isArray(field.validation)) {
        return `fields[${index}].validation must be an object`;
      }
      const pattern = (field.validation as Record<string, unknown>).pattern;
      if (pattern !== undefined) {
        if (typeof pattern !== "string") return `fields[${index}].validation.pattern must be a string`;
        try {
          new RegExp(pattern);
        } catch {
          return `fields[${index}].validation.pattern is not a valid regular expression`;
        }
      }
    }
  }
  return null;
}

/** Validate input, collect a form interaction, and normalize cancellation. */
export async function collectForm(
  input: Record<string, unknown>,
  ctx: UIStepContext,
): Promise<StepResult> {
  const title = input.title;
  const description = input.description;
  const mode = input.mode === undefined ? "single" : input.mode;
  const submitLabel = input.submit_label === undefined ? "Submit" : input.submit_label;
  const fields = input.fields;

  const fieldError = validateFields(fields);
  if (typeof title !== "string" || !title.trim() || fieldError
    || !Array.isArray(fields) || fields.length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_PARAMS",
        message: fieldError || "'title' and a non-empty 'fields' array are required",
      },
    };
  }
  if (description !== undefined && typeof description !== "string") {
    return { ok: false, error: { code: "INVALID_PARAMS", message: "'description' must be a string" } };
  }
  if (mode !== "single" && mode !== "wizard") {
    return {
      ok: false,
      error: { code: "INVALID_PARAMS", message: "'mode' must be single or wizard" },
    };
  }
  if (typeof submitLabel !== "string" || !submitLabel.trim()) {
    return { ok: false, error: { code: "INVALID_PARAMS", message: "'submit_label' must be a string" } };
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
      values: result.data.values && typeof result.data.values === "object"
        && !Array.isArray(result.data.values) ? result.data.values : {},
      metadata: result.data.metadata && typeof result.data.metadata === "object"
        && !Array.isArray(result.data.metadata) ? result.data.metadata : {},
    },
  };
}

/** Validate and collect an approved/rejected human decision. */
export async function approvalForm(
  input: Record<string, unknown>,
  ctx: UIStepContext,
): Promise<StepResult> {
  const title = input.title;
  const context = input.context === undefined ? {} : input.context;
  const fields = input.fields === undefined ? [] : input.fields;
  const requireComment = input.require_comment === undefined ? false : input.require_comment;
  const approveLabel = input.approve_label === undefined ? "Approve" : input.approve_label;
  const rejectLabel = input.reject_label === undefined ? "Reject" : input.reject_label;

  const fieldError = validateFields(fields);
  if (typeof title !== "string" || !title.trim()) {
    return {
      ok: false,
      error: { code: "INVALID_PARAMS", message: "'title' is required" },
    };
  }
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return { ok: false, error: { code: "INVALID_PARAMS", message: "'context' must be an object" } };
  }
  if (fieldError) {
    return { ok: false, error: { code: "INVALID_PARAMS", message: fieldError } };
  }
  if (typeof requireComment !== "boolean") {
    return { ok: false, error: { code: "INVALID_PARAMS", message: "'require_comment' must be boolean" } };
  }
  if (typeof approveLabel !== "string" || !approveLabel.trim()
    || typeof rejectLabel !== "string" || !rejectLabel.trim()) {
    return { ok: false, error: { code: "INVALID_PARAMS", message: "Approval labels must be strings" } };
  }

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

  const decision = result.data.decision;
  const comment = typeof result.data.comment === "string" ? result.data.comment : "";
  if (decision !== "approved" && decision !== "rejected") {
    return {
      ok: false,
      error: { code: "INVALID_UI_RESULT", message: "Approval decision must be approved or rejected" },
    };
  }
  if (requireComment && !comment.trim()) {
    return {
      ok: false,
      error: { code: "INVALID_UI_RESULT", message: "A reviewer comment is required" },
    };
  }

  return {
    ok: true,
    data: {
      decision,
      comment,
      values: result.data.values && typeof result.data.values === "object"
        && !Array.isArray(result.data.values) ? result.data.values : {},
    },
  };
}

/** Registered Form Builder plugin instance used by Core and tests. */
export const plugin = createPlugin({
  id: "flyto-community/form-builder",
  version: "0.1.0",
  name: "Form Builder",
});

plugin.uiStep(
  "collect_form",
  { page: "ui", type: "dialog", width: 720, height: 700, timeoutMs: 1_800_000 },
  collectForm,
);
plugin.uiStep(
  "approval_form",
  { page: "ui", type: "dialog", width: 640, height: 600, timeoutMs: 1_800_000 },
  approvalForm,
);

if (require.main === module) plugin.start();
