# TOOLS

- bash (Execute arbitrary shell commands)
- bmad (Collective Intelligence CLI) -> `/home/droid/openclaw-control/proxy/bmad-cli.js`. Use this for Shared Memory and Task Tracking.
  - `bmad memo get <key>` / `bmad memo set <key> <val>`
  - `bmad task start/update/done`
- mac (Remote macOS Bridge) -> `/home/droid/openclaw-control/proxy/mac-cli.js`. Use this to control the user's host machine.
  - `mac screenshot` (Captures Mac screen to VPS /tmp)
  - `mac exec <cmd>` (Runs terminal command on Mac)
  - `mac delegate "<task message>"` (FALLBACK: If a task needs GUI/Mac context and you are on VPS, hand off the ENTIRE task to the Mac worker here. Use this when the user asks for things involving Android Studio, browsers, or physical files on Mac.)
- Playwright (Node.js web automation via bash) -> You MUST read `workspace/BROWSER_GUIDE.md` before doing any web browsing, scraping or screenshots.
- Image Processor (Visual Design / Editing) -> Use the Mac Bridge `/img/process` endpoint. It leverages native macOS `sips` for zero-bloat resizing and formatting. Perfect for poster editing and asset generation.
- Mac Bridge (Remote Desktop / Local Execution) -> Connects to your Mac via Tailscale. Use this to bypass "Graphical Server" blockers and interact with local apps like Android Studio. Read `workspace/LOCAL_BRIDGE_GUIDE.md`.
