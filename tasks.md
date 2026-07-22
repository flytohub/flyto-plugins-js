# Tasks

## Release Operations

- [ ] Configure this exact GitHub OIDC workflow as a trusted publisher on all
  six npm package pages; then remove or revoke any obsolete npm automation
  token.
- [ ] For the next release, bump every package plus all three manifests and
  runtime identities to `0.1.2` or newer before creating the matching tag.

## Host Integrations

- [ ] Persist authenticated reviewer identity and durable approval evidence in
  the owning host when Form Builder approvals have security impact.
- [ ] Enforce image URL origin, DNS, response-size, and content policy in Core
  or the owning host before opening Image Crop.

## Accessibility And Capability

- [ ] Add semantic roles, keyboard operation, focus management, and browser
  accessibility tests for custom select, multi-select, checkbox, toggle,
  rating, and file controls.
- [ ] Add pointer-event, touch, and keyboard crop movement/resizing.
- [ ] Follow Slack cursors when callers need more than the first channel page.
