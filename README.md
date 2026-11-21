# Natural Decay

A static, browser-based typography and image-feeding simulation. There is no build step. Your text, images, and custom ant stay in the current browser session; the app does not upload them. Google Fonts and Material Symbols load from online Google Fonts, so those need an internet connection. System fonts are used if you are offline.

## Run on Windows

1. Keep the `outputs` folder intact; `index.html` needs the neighboring `js`, `assets`, and `styles.css` files.
2. If Python is not installed, install it once from [python.org](https://www.python.org/downloads/windows/) and select **Add python.exe to PATH** in the installer. The app itself needs no install.
3. Double-click **`run-local.bat`**.
4. Your browser opens `http://127.0.0.1:8000`. Leave the black command window open while using the app; it is the small local web server. Close that window when you are finished.

Or open PowerShell in this folder and run `py -m http.server 8000 --bind 127.0.0.1`, then visit `http://127.0.0.1:8000`. If Python is already installed but the `py` command is unavailable, use `python -m http.server 8000 --bind 127.0.0.1`. On macOS or Linux, use `python3 -m http.server 8000 --bind 127.0.0.1`. If you prefer, open this folder in VS Code and run it with the Live Server extension.

### Why double-clicking `index.html` does not work

Double-clicking opens a `file:///.../index.html` address. This app loads its JavaScript as browser modules from separate files. Browsers restrict those module requests when a page is opened directly from disk, so the controls and simulation may not start. A local server gives the files a normal `http://localhost` address without putting them on the public internet. This launcher binds to this computer only.

## Use

- Use the two-row dock at the bottom: style and choose **Text** or **Images** on the top row, then start, pause, replay, or edit on the lower row. Only one panel or dialog stays open at once. Font choices scroll inside the panel, and the color panel uses in-page swatches plus a hex field rather than a separate system picker. Press **Enter** to feed; **Shift+Enter** adds a line. Double-click the scene or use the edit icon to return to editing.
- Text and images can share one composition before feeding starts. Type your text, switch to **Images**, and add one or several PNG, JPEG, or SVG files; the text stays visible above the collage while you arrange it. Switch back to **Text** to edit the wording, then press Enter or Play to start the combined scene. Drag files from your computer onto the stage or use **Paste** / Ctrl+V. Drag an image to move it and use a corner handle to resize it; select an image and use Remove to take it out.
- Text is fixed for one simulation run. To change it, pause with Edit and start another run. You can add images to an active run: position each pending image, then use the **check** or **cross** attached to that imageâ€™s upper corner to commit or discard it. Existing material keeps its current decay, and eating edges have a light feather.
- Click the open scene to pause or resume feeding. The play/pause control does the same thing.
- Text stays crisp by keeping a high-resolution text layer for display while the ants eat a matching simulation mask. The simulation targets 60 frames per second on desktop and mobile. On narrower screens it keeps a smaller colony, fewer footprint points, a 1.25× canvas scale, and cheaper bite edges to balance smoothness and sharpness with battery and processor load. Canvas rendering uses one opaque background paint per frame, and pauses completely while hidden or paused.
- The interface stays grayscale; text and source images keep their own colors.
- Use the sun/moon switch at the upper left to change between light and dark mode. Light mode is the default.
- Choose **Add images** for one or several PNG, JPEG, or SVG files. You can also drag files from your computer onto the stage, or use **Paste** / Ctrl+V for clipboard images. Images are kept as pasted, including solid white or black backgrounds. Drag an image to move it and pull any corner handle to resize it; select an image and use Remove to take it out. Text spacing stays matched between the edit preview and feeding scene.
- **Tweak** has ant speed, ant amount, decay speed, ant chaos, eating frequency, material response, text size, Auto fit, resistance, deformation, and custom ant settings. Ant speed changes walking; ant amount sets the colony size (up to 12 on phones and 24 on desktop); decay speed changes how much material each bite removes; eating frequency changes how often ants bite. Ants take a few randomized bites per patch, avoid their recent meal, and reroute after persistent circling or when they stop making progress toward food.
- **Ant trails** is in Tweak settings. It starts Off; set it from 0 to 10 seconds to control how long footprints linger.
- **Download frame** sits beside Tweak on the main screen. It creates a higher-resolution PNG (up to four times the display scale) without the old interface rule.

The text limit is 500 grapheme clusters. Auto fit is on by default. Turn it off to use the selected pixel size; an overflowing composition asks you to reduce the size. Reloading clears the current composition and custom ant selection.

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

- `index.html` and `styles.css`: interface and visual design.
- `js/main.js`: editing, image input, settings, and exports.
- `js/simulation.js`: canvas mask, ants, trails, feeding, rendering, and PNG output.
- `assets/ant-default.svg`: the default ant body artwork; dynamic legs are rendered by the simulation.
- `assets/ant3-original.svg`: the original supplied ant SVG.
- `run-local.bat`: Windows local-server launcher (requires Python).

## Verification

The live page was reviewed in the browser after serving it with correct JavaScript module content types. The font list scrolls in an in-page panel; the color swatches and hex field stay in-page; and opening one style panel closes the previous one. The app also stops its animation loop when paused or backgrounded to reduce idle CPU use. Google Fonts require internet access.
