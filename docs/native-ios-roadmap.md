# Native iPhone Roadmap

The current app is a static PWA. It is intentionally structured so the product flow and fermentation logic can move to a native iPhone app later.

## Current Boundaries

- `index.html` owns the app shell and accessible markup.
- `styles.css` owns visual design and responsive layout.
- `app.js` owns browser interaction, file capture, local persistence, and rendering.
- `analysis.js` owns versioning and fermentation readiness logic.
- `sw.js` owns offline caching and update behavior.

The most important future-friendly boundary is `analysis.js`: it has no DOM dependencies and can be ported to Swift, wrapped in JavaScriptCore, or replaced by a real model-backed service.

## Xcode Options

### Option 1: Capacitor Wrapper

Use this when the goal is to get the PWA into an iOS shell quickly.

1. Add a JavaScript build stack later if the app grows beyond static files.
2. Add Capacitor.
3. Configure iOS camera and photo-library permissions.
4. Open the generated iOS project in Xcode.
5. Submit as a normal iOS app after testing install, camera capture, and offline behavior.

This path keeps the web UI and most app code.

### Option 2: SwiftUI Rebuild

Use this when the goal is a more native camera and image-analysis experience.

1. Recreate the three-step flow in SwiftUI.
2. Port `evaluateBulkFermentation` and supporting helpers from `analysis.js`.
3. Use AVFoundation or PhotosUI for capture/import.
4. Use Vision/Core Image for more reliable dough height and bubble analysis.
5. Preserve the same readiness language: green check or red X with one short explanation and one suggestion.

This path takes longer but gives better access to iPhone-native image processing.

## Future Analysis Improvements

- Ask users to mark the container bottom and target rise line.
- Track elapsed bulk time and dough temperature.
- Compare multiple video frames for jiggle and gas movement.
- Add a small labeled dataset for real model training.
- Keep every result explainable so the app remains useful when confidence is low.
