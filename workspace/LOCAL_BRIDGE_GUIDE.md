# LOCAL DESKTOP CONTROL (MAC BRIDGE)

You can now interact with the User's local Mac (to run Android Studio, local browsers, etc.) by communicating with the **Local Bridge**.

## CONNECTION INFO

- **Host**: User's Mac Tailscale IP (Find via `tailscale status`)
- **Port**: `5555`
- **Auth**: `Bearer ${LOCAL_BRIDGE_TOKEN}`

## ENDPOINTS

### 1. `POST /exec`

Run a shell command on the Mac.

- **Body**: `{"cmd": "git clone ..."}`
- **Note**: Commands run inside `~/OpenClawSpace` for security.

### 2. `GET /screenshot`

Get a PNG of the User's entire desktop. Use this to:

- Verify Android Studio screens.
- Check GUI test results.
- Let the user watch you work.

### 3. `POST /gui/click`

Automated mouse control.

- **Body**: `{"x": 100, "y": 250}`

### 4. `POST /gui/type`

Automated keyboard input.

- **Body**: `{"text": "Hello World"}`

### 5. `POST /fs/write`

Save code directly to the Mac.

- **Body**: `{"filename": "app.js", "content": "..."}`

## GUIDELINES

1. **Always use Screenshots**: After a significant GUI action (like opening a repo in Android Studio), take a screenshot to confirm it worked.
2. **Autonomy vs Safety**: Do not run commands outside the sandbox.
3. **No Graphical Server Blocks**: Executing via the bridge solves the "No Graphical Server" error because it runs in the User's live macOS session.
4. **GUI Coordination**: Use screenshots to find coordinates (x, y) for buttons in Android Studio before clicking.
