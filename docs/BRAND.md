# NovelStudio visual identity

<img src="../public/icons/icon-512.png" alt="A girl at a warmly lit street corner beneath a crescent moon." width="256" />

*Somewhere, a story begins. / 某个地方，故事正要开始。*

## Primary icon: Around the Corner / 转角女孩

The owner selected the girl at the street corner as NovelStudio's primary icon. Her movement, the warm window and the quiet blue evening suggest a story about to unfold. Use this image consistently for the app, browser tab, installed app, README and project website. The door is a supporting illustration, not an alternative app icon.

Keep the whole square composition visible. Do not crop out the girl, recolor the image, add lettering, or stretch it. The original already contains rounded corners on white; CSS rounds its outer box on dark surfaces. The manifest uses `purpose: any` because this artwork was not designed for arbitrary maskable-icon crops.

## Supporting illustrations

| Illustration | Placement | Purpose |
|---|---|---|
| <img src="../public/brand/beyond-the-page.jpg" alt="A page becomes a road to a distant castle." width="200" /> | User guide opening, README documentation section, website guide invitation | A page becomes a world; an invitation to start writing and explore the guide. |
| <img src="../public/brand/door-ajar.jpg" alt="A half-open door casts warm light onto the floor." width="200" /> | Empty library and website getting-started section | A quiet welcome before the first book. |

Keep illustrations outside the manuscript editor. They belong to the application's identity, never to the writer's saved book or backup.

## Assets and delivery

The three original PNGs supplied by the owner are preserved in `public/brand/`. They were generated in the referenced ChatGPT design conversation and supplied here by the owner; no generation model or extra licensing terms are asserted.

- `around-the-corner.png`: original of **Dusk Walk Beneath the Crescent Moon**.
- `door-ajar.png`: original door illustration.
- `beyond-the-page.png`: original paper-and-road illustration.
- JPEG display copies: 960 px (corner), 640 px (page), 384 px (door), encoded at quality 85.
- `public/icons/`: 512 px and 192 px PNG app icons plus a 32 px PNG favicon, all resized from the corner original without cropping.

Display derivatives are made with macOS `sips` (no new project dependency). For example:

```sh
sips -z 512 512 public/brand/around-the-corner.png --out public/icons/icon-512.png
sips -s format jpeg -s formatOptions 85 -Z 960 public/brand/around-the-corner.png --out public/brand/around-the-corner.jpg
```

Vite bundles `public/` for the local app. `scripts/build-site.mjs` copies the same `brand/` and `icons/` folders into the GitHub Pages build. The Pages workflow watches both directories. All images load from the same origin; no external image host, runtime fetch, database migration or backup-format change is involved.
