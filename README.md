# Sourdough

A mobile-first PWA for checking sourdough bulk fermentation readiness from a start sample and a current photo or video.

## What It Does

- Captures a start photo/video at the beginning of bulk fermentation.
- Captures a current photo/video when you want to check readiness.
- Compares the two samples locally in the browser.
- Shows a large green check when ready or a red X when not ready.
- Gives a one- or two-sentence explanation with a direct next step.
- Works as an installable PWA on iPhone through Safari.

The first version is heuristic guidance, not a lab-grade fermentation model. It works best when both samples are taken from the same side angle in a clear, straight-sided container.

## Run Locally

This app has no build step.

```bash
python3 -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

## Install On iPhone

1. Open the hosted app in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Launch Sourdough from the home screen.

Camera capture requires HTTPS on deployed hosting, which GitHub Pages provides.

## GitHub Pages

The repo includes `.github/workflows/pages.yml`. After the repo is pushed:

1. Create a private GitHub repo named `sourdough`.
2. Add it as `origin`.
3. Push `main`.
4. Open the GitHub repo settings.
5. Go to Pages.
6. Set Source to GitHub Actions.
7. Push to `main` or run the workflow manually.

```bash
git remote add origin git@github.com:asre1212/sourdough.git
git push -u origin main
```

If you use GitHub CLI on this machine later, this one command can create the private repo and push it:

```bash
gh repo create sourdough --private --source . --remote origin --push
```

Private repository Pages support depends on the GitHub account or organization plan.

## Versioning Updates

The current app version is `0.1.7`.

For every shipped update, bump both:

- `APP_VERSION` in `analysis.js`
- `CACHE_VERSION` in `sw.js`

The service worker cache name uses `CACHE_VERSION`, so changing it causes old cached files to be replaced after the next install/activate cycle.

## Native iPhone Path

See `docs/native-ios-roadmap.md` for the planned transition to Xcode, either through Capacitor or a later SwiftUI rebuild.
