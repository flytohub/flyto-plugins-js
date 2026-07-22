# @flyto2/plugin-image-crop

Interactive image cropping for Flyto2 workflows.

## Install

```bash
npm install @flyto2/plugin-image-crop
```

## Step

`crop_image` accepts an HTTPS, HTTP, image data, or blob URL; an optional aspect
ratio; PNG, JPEG, or WebP output; and quality from `0.1` through `1`. It returns
the cropped data URL, crop rectangle, and original dimensions. Cancellation is
reported as `USER_CANCELLED`.

The returned data URL must use the requested MIME type; crop coordinates must
be finite and nonnegative, and crop/original dimensions must be positive.

See the [generated input/output contract](https://github.com/flytohub/flyto-plugins-js/blob/main/docs/generated/plugin-contracts.md#image-crop).

## Security

The handler rejects script and local-file schemes and validates UI output. The
host should still apply image-origin allowlists, fetch-size limits, content
inspection, and data-retention rules. Cross-origin images must permit canvas
use or browser export will fail.

Licensed under Apache-2.0. Report vulnerabilities to `security@flyto2.com`.
