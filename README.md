# ChessMaster

A polished chess game with a premium gaming UI, AI and local play, dashboards, daily challenges, and practice tools.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000

## GitHub Pages deployment

This project is configured for static export so it can be published to GitHub Pages.

1. Create a GitHub repository.
2. Add the remote:

```bash
git remote add origin https://github.com/<your-user>/<your-repo>.git
```

3. Commit and push:

```bash
git add .
git commit -m "Initial ChessMaster release"
git push -u origin master
```

4. In GitHub, enable GitHub Pages for the repository and select the GitHub Actions deployment workflow.

## Deploy workflow

The repository already contains a GitHub Actions workflow in `.github/workflows/deploy.yml` to build the static output and publish it to GitHub Pages.

## Notes

- The app is optimized for static export using Next.js `output: "export"`.
- This keeps it compatible with GitHub Pages hosting for a client-side chess experience.
