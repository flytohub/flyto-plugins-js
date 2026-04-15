# plugin.yaml Specification

Every Flyto2 plugin must include a `plugin.yaml` at the package root.

## Naming Convention

A plugin has two identifiers:

| Identifier | Where | Example | Purpose |
|---|---|---|---|
| **npm package name** | `package.json` `"name"` | `@flyto2/plugin-slack` | npm install/publish |
| **plugin runtime ID** | `plugin.yaml` `id` | `flyto-community/slack` | Runtime dispatch, module registry |

- npm name uses `@flyto2/plugin-*` scope for official plugins
- Runtime ID uses `vendor/name` format (e.g., `flyto-community/slack`, `acme-corp/custom-tool`)
- The module registry key becomes `plugin.{runtime_id}/{step_id}`

## Schema

```yaml
# ── Plugin identity ──────────────────────────────────────
id: string              # Runtime ID — "vendor/name" format (e.g., "flyto-community/slack")
name: string            # Display name
version: string         # SemVer
description: string     # One-line description

# ── Runtime ──────────────────────────────────────────────
runtime:
  language: node                    # "node" (future: "deno", "bun")
  entry_point: dist/index.js       # Compiled entry
  min_flyto_version: "2.25.0"      # Minimum flyto-core version

# ── Steps ────────────────────────────────────────────────
steps:
  - id: string                     # Step identifier
    label: string                  # Display label
    description: string            # What this step does
    category: string               # Category for grouping
    icon: string                   # Icon name (Lucide icons)
    color: string                  # Hex color for the node

    # Connection rules
    can_receive_from: ["*"]        # Which step types can connect to this
    can_connect_to: ["*"]          # Which step types this can connect to

    # Input parameters
    params_schema:
      param_name:
        type: string | number | boolean | array | object
        label: string
        description: string
        required: boolean          # default: false
        default: any               # default value
        placeholder: string        # input placeholder
        options:                   # for select/enum types
          - value: string
            label: string

    # Output schema
    output_schema:
      field_name:
        type: string | number | boolean | array | object
        description: string

    # ── UI Configuration (optional) ──────────────────────
    # When present, this step opens an interactive UI page
    # instead of running headlessly.
    ui:
      type: page | panel | dialog  # How the UI is displayed
                                   #   page   — full-screen overlay
                                   #   panel  — side panel (default 400px)
                                   #   dialog — centered modal
      page: string                 # Path to UI directory (relative to plugin root)
                                   # Must contain index.html
      width: number                # Default width in pixels (optional)
      height: number               # Default height in pixels (optional)
      timeout_ms: number           # Max wait time in ms (default: 300000)

# ── Secrets ──────────────────────────────────────────────
required_secrets:                  # List of secret names the plugin needs
  - SECRET_NAME
```

## UI Step Lifecycle

```
flyto-core                  Plugin SDK                  Plugin UI (iframe)
    │                           │                             │
    ├── invoke(step) ──────────>│                             │
    │                           ├── start HTTP server         │
    │                           ├── ui.open {url} ──────────> │
    │                           │                             ├── render UI
    │                           │                             ├── user interacts
    │                           │   <── POST /callback ───────┤ flyto.submit(data)
    │                           ├── ui.close ────────────────>│
    │   <── result ─────────────┤                             │
    │                           │                             │
```

## Example: UI Step in plugin.yaml

```yaml
steps:
  - id: crop_image
    label: Crop Image
    description: Interactive image cropping tool
    category: media
    icon: Crop
    color: "#10B981"
    params_schema:
      image_url:
        type: string
        label: Image URL
        required: true
      aspect_ratio:
        type: string
        label: Aspect Ratio
        options:
          - { value: "free", label: "Free" }
          - { value: "1:1", label: "Square" }
          - { value: "16:9", label: "Widescreen" }
          - { value: "4:3", label: "Standard" }
    output_schema:
      cropped_data_url:
        type: string
        description: Base64 data URL of the cropped image
      crop_rect:
        type: object
        description: "{ x, y, width, height } of the crop area"
    ui:
      type: dialog
      page: ui/dist
      width: 900
      height: 650
```
