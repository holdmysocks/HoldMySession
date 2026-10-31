# The classic theme

Before the Focus redesign, the app had two looks, dark and light, both built from one warm gray scale and a terracotta accent. They are kept here so they can be brought back.

- `classic-theme.css` is `apps/web/src/styles/app.css` as it was at version 0.7.1: the gray scale, the inverted gray scale for light, and the status pulse animations.
- The git branch `backup/classic-theme` and the tag `classic-theme-backup` point at the last commit with the classic look and its sidebar layout.

To look at it again:

```bash
git checkout backup/classic-theme
```

To bring the colours back into the current app, copy the two blocks from `classic-theme.css` into a new theme in `apps/web/src/styles/themes.css` and add it to `apps/web/src/features/theme/themes.ts`.
