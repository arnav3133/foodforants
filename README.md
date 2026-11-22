# Natural Decay

A static typography and image feeding simulation. Your text, images, and custom ant stay in the current browser session. Typefaces load from Google Fonts when online and fall back to system fonts offline.

## Run locally

Extract the ZIP and open **`natural-decay.html`** in a modern browser. This version includes the app, icons, and default ant and needs no local server. If the browser blocks clipboard access, use **Select** to choose an image.

To run the editable source, keep `index.html`, `styles.css`, `js`, and `assets` together. On Windows, double-click **`run-local.bat`** with Python installed, or run `py -m http.server 8000 --bind 127.0.0.1` from this folder and open `http://127.0.0.1:8000/`. On macOS or Linux, use `python3` instead of `py`. The source version uses JavaScript modules, which browsers typically block when opened directly from disk.

## Use

- The bottom toolbar starts with Play/Pause, Reset, and Scrap, followed by **Text**, **Images**, and **Draw**. Use the fullscreen button to collapse the toolbar, and the restore button or Escape to bring it back. Press **Enter** in the text editor to feed or **Shift+Enter** to add a line.
- Text and images can share one composition before feeding starts. Type your text, switch to **Images**, and add one or several PNG, JPEG, or SVG files; the text stays visible above the collage while you arrange it. Switch back to **Text** to edit the wording, then press Enter or Play to start the combined scene. Drag files from your computer onto the stage or use **Paste** / Ctrl+V. Drag an image to move it and use a corner handle to resize it; select an image and use Remove to take it out.
- **Draw** lets you sketch with textured chalk. Open **Brush** to adjust its size and color. Use **Undo** to remove the last stroke.
- The bottom dock keeps composition tools on one row and play, reset, and fullscreen controls on a second. Use the fullscreen icon to hide the interface; its small restore button stays at the bottom of the screen. Press Escape to restore the controls.
- In **Images**, select an image and open the palette to shift its hue. **No hue** returns that image to its original colors. The image itself is never changed, so reset remains immediate.
- Release the pointer to add a chalk stroke during playback. Undo removes the most recent stroke in the draft or live run.
- **Add text** is available in Text mode before and during playback. Type in the box, drag its Move handle, resize it from a corner, then confirm or cancel the layer. Click any box in Edit to change its wording or style. Font and Color show which box is selected, and each box keeps its own settings.
- **Stain duration** in Tweak controls the faint outline left behind by eaten material. **Off** hides it. A duration from 10 seconds to 2 minutes fades each eaten area, including after the ants finish. **Session** keeps the original silhouettes until the run is reset.
- The timer beside the theme switch counts active playback. It stops when paused or finished and resets when you reset or scrap the session.
- Use **Reset** to return to Edit and change the original wording. During playback, Font, Size, and Color update the original text while keeping earlier bites. When a new text layer is open, those controls change that layer. To place an image during playback, use its **check** button or click outside it. The **cross** discards it.
- Use **Play/Pause** to pause or resume. **Reset** asks for confirmation, removes decay, and returns to Edit with the composition intact. **Scrap** asks for confirmation and clears the composition and session. In Edit, use the corner cross to remove a text, image, or drawing layer.
- Text stays crisp by keeping a high-resolution text layer for display while the ants eat a matching simulation mask. The simulation targets 60 frames per second on desktop and mobile. On narrower screens it keeps a smaller colony, fewer footprint points, a 1.25× canvas scale, and cheaper bite edges to balance smoothness and sharpness with battery and processor load. Canvas rendering uses one opaque background paint per frame, and pauses completely while hidden or paused.
- The interface stays grayscale; text and source images keep their own colors.
- Use the sun/moon switch at the upper left to change between light and dark mode. Light mode is the default.
- Choose **Add images** for one or several PNG, JPEG, or SVG files. You can also drag files from your computer onto the stage, or use **Paste** / Ctrl+V for clipboard images. Images are kept as pasted, including solid white or black backgrounds. Drag an image to move it and pull any corner handle to resize it; select an image and use Remove to take it out. Text spacing stays matched between the edit preview and feeding scene.
- **Tweak** has ant speed (up to 5×), ant count (up to 64), decay speed (up to 10×), ant chaos, eating frequency (up to 10×), material response, text size, resistance, deformation, and custom ant settings. Decay time varies with the shape, size, and material. Ants stay on food patches for several bites and reroute when they stop making progress.
- **Ant trails** is in Tweak settings. It starts Off. Set it up to 10 seconds to show spaced dots that fade as the ants move on.
- **Download frame** sits beside Tweak on the main screen. It creates a higher-resolution PNG (up to four times the display scale) without the old interface rule.

The text limit is 500 grapheme clusters. Text scales down to fit the composition when needed. The font panel shows the preferred and fitted sizes when they differ. Reloading clears the composition and custom ant selection.

## Replace or customize the ant

The default ant is based on the supplied `ant3.svg` artwork. The untouched source is preserved as **`assets/ant3-original.svg`**. Its top edge is the head; the app rotates that original orientation to match each ant's travel direction. The animated body and shortened antennae are in **`assets/ant-default.svg`**. Six legs are drawn as separate moving limbs, each with its own phase and pace, so their steps are staggered instead of moving together. PNG and SVG custom ants use the same top-is-head orientation. Walking ants bob, rock, and gently squash in time with their movement. All ant art is normalized into small light and dark sprites once when loaded, so the animation doesn't repeatedly filter the source image. Ants have no drop shadow, and the dark theme inverts their sprites so they stay visible. Replace `assets/ant-default.svg` with your own top-facing, body-only SVG to change the default; the app supplies the moving legs.

You can also choose a PNG or SVG under **Tweak â†’ Custom ant** for the current browser session. **Use default ant** restores `assets/ant-default.svg`. A custom file stays on your device and is not saved after reloading.

## Publish with GitHub Pages

1. Put the contents of this folder at the root of a GitHub repository (or configure Pages to publish this folder).
2. In the repository, open **Settings â†’ Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**, choose the branch and `/(root)`, then save.
4. Open the published address GitHub Pages provides.

This project has not been published. Publishing a repository makes its committed files public; do not include private text, photos, or custom ant artwork unless you intend to share them.

## Files

- `natural-decay.html`: standalone app for opening directly.
- `index.html` and `styles.css`: interface and visual design.
- `js/main.js`: editing, image input, settings, and exports.
- `js/simulation.js`: canvas mask, ants, trails, feeding, rendering, and PNG output.
- `assets/ant-default.svg`: the default ant body artwork; dynamic legs are rendered by the simulation.
- `assets/ant3-original.svg`: the original supplied ant SVG.
- `run-local.bat`: Windows local-server launcher (requires Python).

## Verification

The standalone build was exercised in Microsoft Edge at phone and desktop viewport widths, including with system fonts in place of the online typefaces.
