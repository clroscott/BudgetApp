# BudgetApp brand assets

Place the final logo files in this folder using these exact names:

- `logo-primary.png` — the full horizontal logo/wordmark for login, registration, and other large brand surfaces.
- `logo-mark.png` — the canonical square symbol used by navigation, browser tabs,
  installed apps, taskbar shortcuts, and touch icons.

## Export recommendations

### `logo-primary.png`

- Transparent background.
- Crop tightly around the logo; do not include the surrounding presentation canvas.
- Recommended width: 1200–1600 px.
- Horizontal layout is preferred.
- Keep important content away from the outer 5% of the image.

### `logo-mark.png`

- Transparent background.
- Square 1:1 canvas.
- Recommended size: 512×512 or 1024×1024 px.
- Keep the design readable at 40×40 px.
- Do not include the full product name or tagline.

The React components fall back to the existing letter mark until these files are
present. Replacing either file does not require a code change. Keep
`logo-mark.png` at 512×512 so browsers and operating systems can safely scale the
same source image for every icon surface.

Running the development server or production build automatically creates the
192×192 and 512×512 install icons required by Chromium browsers. Do not edit the
files under `public/generated`; replace `logo-mark.png` instead.
