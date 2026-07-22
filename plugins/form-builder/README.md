# @flyto2/plugin-form-builder

Interactive form and approval steps for Flyto2 workflows.

## Install

```bash
npm install @flyto2/plugin-form-builder
```

## Steps

- `collect_form` opens a single-page or wizard form and returns `submitted`,
  `values`, and timing metadata. Closing the dialog is a successful,
  explicitly marked cancellation.
- `approval_form` displays review context and returns `approved` or `rejected`,
  a comment, and optional field values. Closing the dialog maps to rejected.

Both steps require a title. `collect_form` also requires at least one field.
The handler validates supported types, unique safe IDs, choice options,
conditions, and regular-expression syntax before opening the UI.
See [the field contract](https://github.com/flytohub/flyto-plugins-js/blob/main/docs/FORM_FIELDS.md)
and the [generated step schema](https://github.com/flytohub/flyto-plugins-js/blob/main/docs/generated/plugin-contracts.md#form-builder).

## Security

UI results are untrusted input. The plugin validates decision state and required
comments, while the host remains responsible for reviewer identity,
authorization, durable evidence, and retention policy. Do not place secrets in
form props or fields.

Licensed under Apache-2.0. Report vulnerabilities to `security@flyto2.com`.
