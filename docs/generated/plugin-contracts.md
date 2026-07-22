# Generated Plugin Contracts

> Generated from `plugins/*/plugin.yaml`. Do not edit by hand.

## Form Builder

Runtime ID: `flyto-community/form-builder`. Version: `0.1.0`. Minimum Flyto2 Core: `2.25.0`.

Runtime entry: `dist/index.js` (built from [`src/index.ts`](https://github.com/flytohub/flyto-plugins-js/blob/main/plugins/form-builder/src/index.ts)). Required secrets: none.

### `collect_form`

Display a dynamic form and collect user input

Category: `human-in-the-loop`. Runtime: interactive `dialog`, 720 x 700, timeout 1800000 ms.

**Inputs**

| Name | Type | Required | Default | Constraints | Description |
| --- | --- | --- | --- | --- | --- |
| `title` | `string` | yes | - | - | Form Title |
| `description` | `string` | no | - | - | Optional description shown above the form |
| `mode` | `string` | no | `"single"` | single, wizard | Mode |
| `submit_label` | `string` | no | `"Submit"` | - | Submit Button Text |
| `fields` | `array` | yes | - | - | JSON array of field definitions |

**Outputs**

| Name | Type | Description |
| --- | --- | --- |
| `submitted` | `boolean` | Whether the user submitted (true) or cancelled (false) |
| `values` | `object` | Key-value map of field_id → submitted value |
| `metadata` | `object` | Submission metadata: timestamp, duration_ms |

### `approval_form`

Display context + approval form with approve/reject actions

Category: `human-in-the-loop`. Runtime: interactive `dialog`, 640 x 600, timeout 1800000 ms.

**Inputs**

| Name | Type | Required | Default | Constraints | Description |
| --- | --- | --- | --- | --- | --- |
| `title` | `string` | yes | - | - | Title |
| `context` | `object` | no | - | - | Data to display for review (key-value pairs shown as read-only) |
| `fields` | `array` | no | - | - | Optional fields to collect alongside the decision |
| `require_comment` | `boolean` | no | `false` | - | Require Comment |
| `approve_label` | `string` | no | `"Approve"` | - | Approve Button Text |
| `reject_label` | `string` | no | `"Reject"` | - | Reject Button Text |

**Outputs**

| Name | Type | Description |
| --- | --- | --- |
| `decision` | `string` | 'approved' or 'rejected' |
| `comment` | `string` | Reviewer comment |
| `values` | `object` | Additional field values |

## Image Crop

Runtime ID: `flyto-community/image-crop`. Version: `0.1.0`. Minimum Flyto2 Core: `2.25.0`.

Runtime entry: `dist/index.js` (built from [`src/index.ts`](https://github.com/flytohub/flyto-plugins-js/blob/main/plugins/image-crop/src/index.ts)). Required secrets: none.

### `crop_image`

Open an interactive image cropping tool

Category: `media`. Runtime: interactive `dialog`, 900 x 650, timeout 600000 ms.

**Inputs**

| Name | Type | Required | Default | Constraints | Description |
| --- | --- | --- | --- | --- | --- |
| `image_url` | `string` | yes | - | - | URL or data URL of the image to crop |
| `aspect_ratio` | `string` | no | `"free"` | free, 1:1, 16:9, 4:3, 9:16 | Constrain crop to a specific ratio |
| `output_format` | `string` | no | `"image/png"` | image/png, image/jpeg, image/webp | Output Format |
| `quality` | `number` | no | `0.92` | min 0.1; max 1 | Output quality (0.1 - 1.0, for JPEG/WebP) |

**Outputs**

| Name | Type | Description |
| --- | --- | --- |
| `cropped_data_url` | `string` | Base64 data URL of the cropped image |
| `crop_rect` | `object` | Crop coordinates: { x, y, width, height } |
| `original_size` | `object` | Original image size: { width, height } |

## Slack

Runtime ID: `flyto-community/slack`. Version: `0.1.0`. Minimum Flyto2 Core: `2.25.0`.

Runtime entry: `dist/index.js` (built from [`src/index.ts`](https://github.com/flytohub/flyto-plugins-js/blob/main/plugins/slack/src/index.ts)). Required secrets: `SLACK_BOT_TOKEN`.

### `send_message`

Send a message to a Slack channel

Category: `notification`. Runtime: headless.

**Inputs**

| Name | Type | Required | Default | Constraints | Description |
| --- | --- | --- | --- | --- | --- |
| `channel` | `string` | yes | - | - | Slack channel name or ID |
| `message` | `string` | yes | - | - | Message text (supports Slack markdown) |
| `thread_ts` | `string` | no | - | - | Reply in a thread (optional) |

**Outputs**

| Name | Type | Description |
| --- | --- | --- |
| `ts` | `string` | Message timestamp ID |
| `channel` | `string` | Channel where message was posted |

### `list_channels`

List all public channels in the workspace

Category: `notification`. Runtime: headless.

**Inputs**

| Name | Type | Required | Default | Constraints | Description |
| --- | --- | --- | --- | --- | --- |
| `limit` | `number` | no | `100` | min 1; max 200 | Maximum number of channels to return (1-200) |

**Outputs**

| Name | Type | Description |
| --- | --- | --- |
| `channels` | `array` | List of channel objects |
