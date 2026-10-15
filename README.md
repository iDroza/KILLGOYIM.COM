# Homepage reading view

The homepage fills the available viewport immediately, with its header and footer hidden. Each rotating message is centered and fitted to the available space, including phone landscape layouts and viewport changes.

The page requests native browser fullscreen on arrival. Most browsers require user activation and reject that initial request; the first click or tap on the reading area then enters fullscreen. The full-viewport layout continues to work if fullscreen is unavailable or denied.

- Use the Fullscreen button or **F** to toggle native fullscreen.
- Use **Escape** or the Exit fullscreen button to leave it.
- Controls fade after 2.2 seconds of inactivity and return on pointer or keyboard activity. Keyboard focus keeps the control visible.
- Leaving fullscreen does not cause subsequent reading-area clicks to enter it again. The button and F remain available.
- Selecting text does not activate fullscreen.

The implementation lives in `index.html` and adds no dependencies. The rotating message order, timing, accents, and final message retain their existing behavior.

## Local verification

Serve the repository with `python -m http.server 8768` and open `http://localhost:8768/`.

Check initial viewport coverage, idle controls, first-click/tap fullscreen, F and button toggles, Escape, and no automatic reentry after exit. Test a narrow portrait screen and a short landscape screen, including the longest messages. Browsers without the Fullscreen API should keep displaying the words and hide the unavailable button.

Validated in Chromium and Firefox, with Chromium touch emulation and all 600 messages fitted at 1440x900, 768x1024, 375x812, 320x568, 812x375, and 568x320. Rejected and unavailable Fullscreen API cases were also checked.
