# Homepage reading view

The homepage fills the available viewport immediately, with its header and footer hidden. Each rotating message is centered and fitted to the available space, including phone landscape layouts and viewport changes.

The page requests native browser fullscreen on arrival. Most browsers require user activation and reject that initial request; the first click or tap on the reading area then enters fullscreen. The full-viewport layout continues to work if fullscreen is unavailable or denied.

- Use the Fullscreen button or **F** to toggle native fullscreen.
- Use **Escape** or the Exit fullscreen button to leave it.
- Use **Pause / Resume**, **Space**, or click/tap the reading area to pause or resume. Highlighting a message pauses it immediately and keeps the text readable until you explicitly resume.
- Use **Left arrow** to go back one message and **Right arrow** to skip forward one. The page shuffles once on load, then keeps that exact order in both directions. Left stops at the first message; right stops at the final message. You can go back from the final message too.
- Arrow navigation preserves pause/resume and gives the selected message a fresh reading interval. Repeated presses or holding an arrow move one message per key event. Modified arrows and arrows in editable fields keep their normal behavior.
- Controls fade after 0.7 seconds of inactivity (plus a 0.15-second fade) and return on pointer or keyboard activity. Keyboard focus keeps its control visible. Resume stays visible while paused; Fullscreen still fades.
- Leaving fullscreen does not cause subsequent reading-area clicks to enter it again. The button and F remain available.
- Selecting text does not activate fullscreen.

The implementation lives in `index.html` and adds no dependencies. The rotating message order, timing, accents, and final message retain their existing behavior.

## Local verification

Serve the repository with `python -m http.server 8768` and open `http://localhost:8768/`.

Check initial viewport coverage, idle controls, first-click/tap fullscreen, F and button toggles, Escape, and no automatic reentry after exit. Test a narrow portrait screen and a short landscape screen, including the longest messages. Browsers without the Fullscreen API should keep displaying the words, hide the unavailable Fullscreen button, and retain working playback controls.

Check that button, Space, desktop clicks, and mobile taps pause and resume without skipping a message. Drag-select text during a transition and confirm it stays selected and readable beyond the normal rotation interval. Check keyboard activation of both buttons, control fade timing, and a pause during the final transition.

Run `node --test tests/reading-navigation.test.cjs` for the navigation regression checks. They exercise the actual inline playback script with a controlled clock: fixed order, full rewind, boundaries, repeated keys, pause/resume, cancelled fades, and the final transition. In a browser, also check arrows while a control has focus and that going back from the final message restores normal message styling.

The original viewport/fullscreen behavior was validated in Chromium and Firefox, with Chromium touch emulation and all 600 messages fitted at 1440x900, 768x1024, 375x812, 320x568, 812x375, and 568x320. Rejected and unavailable Fullscreen API cases were also checked.

The playback update was checked in Chromium with desktop input and mobile touch emulation: button/Space/click/tap toggles, real drag selection, remaining-time resume, unavailable fullscreen, idle control visibility, 320px/375px portrait and phone landscape layouts, and pauses during fade-out and the final message transition.

The arrow-navigation update passes 10 dependency-free regression tests, including rewind and replay through all 643 messages. Browser checks passed in Firefox, Chromium, and Chromium with phone touch emulation, including focused controls, paused navigation, cancelled transitions, full rewind, and the final-message boundaries, with no page errors.
