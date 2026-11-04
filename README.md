# Monk Mode

A distraction-free focus mode for [Obsidian](https://obsidian.md). Run **Toggle Monk Mode** from the command palette (or click the flame icon in the note header, next to the reading-view toggle) to hide everything except the note you are on: sidebars, ribbon, tabs, title bar, other split panes, the note header and the status bar. The properties panel is hidden too. A faint flame stays in the top-right corner to switch it off. Each of these can be turned off in settings.

A faint footer shows the word count on the right. On the left are two buttons: one shows or hides the properties panel, and one turns typewriter sounds (an IBM Selectric II, with a bell on Enter) on or off. The sounds are public domain; see `sounds/README.md`.

Settings also have a volume slider for the typewriter sounds, and **Hemingway mode**: while Monk Mode is on, Backspace, Delete and Cut do nothing, so you can only write forward. It also has a command, "Toggle Hemingway mode", so you can bind it to a hotkey.

## Development

```bash
npm install
npm run dev     # watch build -> main.js
npm run build   # production build
```

To test it in a vault, symlink this folder into `<vault>/.obsidian/plugins/monk-mode`, then enable the plugin under **Settings → Community plugins**.
