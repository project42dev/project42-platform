# Brand sources

Replace every file in this directory with your own artwork before you launch.
These are neutral placeholders so that a freshly scaffolded repository builds;
they are not a brand.

| File | Used for |
| --- | --- |
| `mark.svg` | The square mark. |
| `mark-mono.svg` | Single-colour mark; the Safari pinned-tab icon. |
| `mark-reversed.svg` | The mark on a light ground. |
| `wordmark.svg` | The organisation name set beside the mark. |
| `social.svg` | Rasterised to `og.png` (1200x630) by `npm run brand:generate`. |

Favicons, app icons and the maskable icon are **not** authored here. They are
rasterised from the active theme bundle's `mark.svg` by `npm run brand:generate`,
so changing the configured theme changes them. Only `og.png` comes from
`social.svg`.

The filenames above are the defaults. If yours differ, declare them under
`branding` in `project42.config.json` rather than renaming files to match.
