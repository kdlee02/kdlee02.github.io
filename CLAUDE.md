# Claude Code Configuration

See [AGENTS.md](./AGENTS.md) for the stack, directory layout, components and verification checklist. This file only
covers how this blog's content is written and shipped.

## What this site is

A personal blog about LLM engineering (RAG, agents, evals). Posts live in `src/data/post/*.md` and publish at
`/engineering/<slug>`. `content/` holds source notebooks and notes used to write posts; it is not published.

## Writing posts

- **Replace, don't add.** When asked to rewrite a post, edit the existing file so its slug and URL stay the same. Never
  create or delete post files unless asked. Other posts link to these slugs.
- **Audience:** write for a curious high-school reader. Explain ideas with everyday comparisons, lead with concepts
  rather than code, define each term once in plain words.
- **Sources:** posts are built from course lessons, videos and notebooks. Use real numbers from the notebook outputs
  (not just the video), and never claim a result the notebook didn't produce. If a cell errored, say so or leave it out.
- **Don't republish third-party material.** No course screenshots or other people's documents. Describe them in words
  and draw original diagrams.
- **Frontmatter:** `title`, `excerpt`, `publishDate`, `category` (`RAG` or `LLM Engineering`), `tags`, `draft`.
  - Tags are few and generic (2 to 4), lowercase and hyphenated. Reuse existing tags before inventing one. Check with
    `grep -h -A8 '^tags:' src/data/post/*.md`.
  - Dates are the user's choice. Don't change `publishDate` or `draft` unprompted. The list sorts newest first, 10 per
    page, so an older date lands on page 2.

## Diagrams

- Hand-written SVG in `src/assets/images/<post-topic>/`, referenced with a relative path and descriptive alt text.
- White card background (`#fff` with a light border) so it reads in light and dark mode. Put text and shapes in
  `viewBox` coordinates and keep labels inside their boxes.
- Render each one to PNG and look at it before publishing (`qlmanage -t -s 1100 -o <dir> file.svg` on macOS).

## Before pushing

- Run `npm run check` and `npm run build`. A Prettier warning in `content/componentlevel.md` already existed; ignore it.
- Commit and push to `main` only when asked. Pushing to `main` deploys to GitHub Pages (about a minute), and a browser
  may show a cached older page, so hard refresh before assuming it failed.
