# BudgetApp brand assets

Place the final logo files in this folder using these exact names:

- `logo-primary.png` — the full horizontal logo/wordmark for login, registration, and other large brand surfaces.
- `logo-mark.png` — the compact square symbol for navigation headers and small spaces.

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

The React components fall back to the existing BudgetApp letter mark until these
files are present. Replacing either file does not require a code change.

The square mark can later be exported separately as favicon and installable-app
icons once the final design is approved.
