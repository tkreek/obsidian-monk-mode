# Monk Mode

A distraction-free focus mode for [Obsidian](https://obsidian.md). Run **Toggle Monk Mode** from the command palette (or click the eye icon in the note header, next to the reading-view toggle) to hide everything except the note you are on: sidebars, ribbon, tabs, title bar, other split panes, the note header and the status bar. The properties panel is folded too. A faint eye icon stays in the top-right corner to switch it off. Each of these can be turned off in settings.

## Development

```bash
npm install
npm run dev     # watch build -> main.js
npm run build   # production build
```

To test it in a vault, symlink this folder into `<vault>/.obsidian/plugins/monk-mode`, then enable the plugin under **Settings → Community plugins**.
