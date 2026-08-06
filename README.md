# Ora Digital Media — Website

Marketing site for **Ora Digital Media**, a creative and strategy-driven team based in Sharjah / Abu Dhabi. Built with [Astro](https://astro.build/) for zero-JS-by-default performance and shipped as a fully static site.

Live site: _to be added after deploy_

---

## Quick start

Requires **Node.js 20+**.

```bash
npm install         # install deps
npm run dev         # local dev server (default: http://localhost:4321)
npm run build       # static production build → ./dist
npm run preview     # serve the built site locally
```

---

## Project structure

```
.
├── astro.config.mjs           # Astro config
├── package.json
├── tsconfig.json
├── public/                    # served as-is at the site root
│   ├── favicon.svg
│   ├── fonts/                 # WOFF2 (Madani Arabic + Alumni Sans Inline One)
│   └── images/                # WebP + JPG assets, organised by section
│       ├── astronaut.webp
│       ├── who-showcase.webp
│       ├── retro-*.png        # hero floating props
│       ├── services/          # What We Do panel icons
│       └── work/              # Work page photo tiles + banners
└── src/
    ├── layouts/
    │   └── BaseLayout.astro   # HTML shell, background layers, global scripts
    ├── components/
    │   ├── Nav.astro          # Sticky nav with scroll-hide + glass pills
    │   ├── OraLogo.astro
    │   ├── Hero.astro         # Astronaut, ring, floating props, scroll parallax
    │   ├── WhoWeAre.astro
    │   ├── Stats.astro        # Auto-scrolling stat carousel
    │   ├── WorkGrid.astro     # 6×3 portfolio grid with flashlight cursor
    │   ├── ProblemThink.astro # The Problem ↔ How We Think toggle
    │   ├── HowWeWork.astro    # Sun + snake path + 4 lighting stops
    │   ├── WhatWeDo.astro     # 4 clickable service panels with float icons
    │   ├── Footer.astro
    │   └── GetStartedModal.astro
    ├── pages/
    │   ├── index.astro        # Homepage
    │   └── work.astro         # /work — Creative Work page
    └── styles/
        └── global.css         # @font-face, resets, keyframes, shared utils
```

---

## Design system

### Type
- **Madani Arabic** — body / headings. Variable font (`MadaniArabic-Variable.woff2`) covers weights 100–900 in one file; static fallbacks for 400/500/600/700/800/900 also declared.
- **Alumni Sans Inline One** — display face for large numerals (stats), step titles (How We Work), and service numbers (What We Do). Loaded as `Alumni`.

### Palette
- Background: pure black `#050308` with a subtle purple → warm-red gradient overlay (12% opacity).
- Warm accent: `#ff8a3a` (orange), `#df5435` (deep coral), `#ffb066` (peach).
- Cool accent: `#51459b` / `#7a4bb0` (purple, appears in ring gradient).
- Text: `#F3EDE4` on dark, `#a49a90` for muted, `#df5435` for the "punch line" red.

### Layout
- Container width: `max-width: 1400px`, `padding: 0 44px` (20px on ≤900px).
- Section rhythm: 130px vertical padding.

---

## Key interactions

| Section | Behavior |
|---|---|
| **Nav** | Fixed, hides on scroll-down / reappears on scroll-up. Pill items materialise a translucent "liquid glass" background on hover or when they're the active section. |
| **Hero** | Astronaut and floating retro props fly in from the top-right as the user scrolls into the hero; the ring's colour rotates continuously. |
| **Stats carousel** | Auto-advances every 2.6s; centred stat scales up and its gradient brightens. Pauses on hover. Runs only when in viewport. |
| **Work grid** | Dim by default; flashlight cursor cuts a bright hole in the vignette. Tiles brighten and slightly zoom on hover. |
| **Problem ↔ Think** | Single section, two views. Toggle button cross-fades between them with a blur + translateY transition. |
| **How We Work** | SVG snake path draws in as user scrolls; each ball + step title lights up when the line passes it. |
| **What We Do** | 4 clickable service tiles. Selected tile scales/glows; a detail panel with bullets + a giant glowing number + floating icons cross-fades in. |
| **Get Started modal** | Global CTA opens a frosted-glass modal with a contact form. Esc / backdrop click closes. |

---

## Assets

- All photography and Mahrouseh social designs were extracted from the source `Work copy.pdf` and are stored under `public/images/work/`.
- Service panel icons (headphones + clapper + phone / social platforms / analytics / AI cubes) live in `public/images/services/`.
- Fonts: WOFF2 only, ~600 KB total. TTFs and unused weights were pruned to keep font payload minimal.

---

## Deploy — Cloudflare Pages

The site is a fully static Astro build, ideal for Cloudflare Pages' free tier.

1. Push the repo to GitHub.
2. Cloudflare Pages → **Create application → Pages → Connect to Git** → pick this repo.
3. **Framework preset:** `Astro` (auto-detected).
4. **Build command:** `npm run build`
5. **Build output directory:** `dist`
6. Ensure `NODE_VERSION` env var is set to `20`.

Every push to `main` triggers a redeploy; PRs get preview URLs.

---

## Notes

- No client-side framework — every component is server-rendered by Astro. Client JS is only the small handful of interaction scripts (`<script>` blocks inside components), and total is ~12 KB uncompressed across the whole site.
- All images are WebP where possible; the astronaut hero image is preloaded with `fetchpriority="high"` to keep LCP fast.
- Layout is fully responsive with breakpoints at 900px (tablet) and 780px (mobile).
