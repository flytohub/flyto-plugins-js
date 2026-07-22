# Form Field Contract

`collect_form.fields` and `approval_form.fields` are arrays of field objects.
Every interactive field needs a unique `id` matching
`[A-Za-z][A-Za-z0-9_.-]{0,127}` and a supported `type`; reserved underscore-led
IDs are rejected. `label`, `description`, `hint`, `placeholder`, `default`,
`required`, and `condition` are optional.

## Field Types

| Type | Value | Additional options |
| --- | --- | --- |
| `text`, `email`, `url`, `phone`, `password` | string | `placeholder` |
| `textarea` | string | `rows`, `placeholder` |
| `number` | number | `min`, `max`, `step` |
| `select`, `radio` | selected option value | nonempty `options: [{value, label}]` |
| `multiselect` | option-value array | nonempty `options: [{value, label}]` |
| `checkbox`, `toggle` | boolean | `default` |
| `date`, `time`, `datetime` | browser-formatted string | none |
| `slider` | number | `min` (0), `max` (100), `step` (1) |
| `rating` | number | `max` (5) |
| `color` | hex color string | default `#8b5cf6` |
| `file` | name, size, MIME type, and data URL | `accept` |
| `section` | no value | `label`, `description` |
| `divider` | no value | none |
| `step_break` | no value | next wizard-page `label` |

## Validation

Set `required: true` for presence. A `validation` object supports `min_length`,
`max_length`, numeric `min`/`max`, `pattern`, and `pattern_message`. Email, URL,
and phone fields also receive built-in format checks. Pattern values compile as
JavaScript regular expressions; only trusted workflow authors should define
them, and patterns should avoid catastrophic backtracking.

The handler rejects malformed field objects, unknown types, duplicate IDs,
invalid choice options, malformed condition objects, and regular expressions
that do not compile before opening a browser UI.

## Conditional Visibility

`condition` has `field`, `op`, and optional `value`. Supported operations are
`eq`, `neq`, `gt`, `lt`, `contains`, `not_empty`, and `empty`. Hidden fields are
not validated, but previously entered values remain in submission data. Hosts
must ignore values they are not authorized to consume.

## Files And Limits

Files are read entirely into browser memory and returned as data URLs. The SDK
callback body is capped at 10 MiB, so hosts should set stricter size/MIME rules
before allowing upload fields. Form definitions and submitted values are
untrusted and require server-side validation before persistence or side effects.
