# Landing page

Static landing page for GitHub Pages.

## Local preview

Open `landing/index.html` directly in the browser.

## Publish to GitHub Pages

This repo uses a dedicated branch for landing page deploys:

- Push the `landing-pages` branch.
- GitHub Pages should be set to **Source: GitHub Actions** in repo settings.
- The workflow at `.github/workflows/landing-pages.yml` publishes `landing/`.
