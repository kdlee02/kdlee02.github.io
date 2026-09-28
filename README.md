# kdlee02.github.io

Personal site — AI engineering projects and notes. Built with
[Astro](https://astro.build) + [AstroWind](https://github.com/arthelokyo/astrowind)
and deployed to GitHub Pages.

```bash
npm install
npm run dev     # http://localhost:4321
npm run build   # static output in dist/
npm run check   # astro check + eslint + prettier
```

## Adding an engineering article

Create `src/data/post/<slug>.md` (or `.mdx`). The file name is the URL slug:
`src/data/post/chunking.md` → `/engineering/chunking`.

```yaml
---
title: 'Post title'
excerpt: 'One or two sentences — used in listings, SEO and RSS.'
publishDate: 2026-01-31T00:00:00Z
category: 'RAG' # RAG | AI Agents | MCP | AI Evaluation | AI Product Engineering
tags:
  - retrieval
draft: false # true hides it from the site entirely, including locally
---
```

Categories and tags are whatever posts declare — the filter strip on `/engineering`
is built from the published posts, so a new category needs no registration.

## Adding a project

Create `src/data/project/<slug>.md`. The file name is the URL slug:
`src/data/project/seoulfit.md` → `/projects/seoulfit`.

```yaml
---
title: 'Project name'
excerpt: 'One or two sentences for the card.'
publishDate: 2026-01-31T00:00:00Z
order: 10 # higher sorts first on /projects and the homepage
stack: ['FastAPI', 'LangGraph']
repo: 'https://github.com/…' # optional
demo: 'https://…' # optional
draft: false
---
```

Body sections used so far: Overview, Problem, Architecture, Implementation,
Evaluation, Results, Lessons learned. They are plain `##` headings, not a schema —
drop the ones a project does not need.

Schemas for both live in `src/content.config.ts`.
