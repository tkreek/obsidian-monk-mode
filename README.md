# Monk Mode

A distraction-free focus mode for [Obsidian](https://obsidian.md). Run **Toggle Monk Mode** from the command palette (or click the eye icon in the note header, next to the reading-view toggle) to collapse the sidebars and hide the ribbon, status bar and tab bar. That leaves only the note.

## Development

```bash
npm install
npm run dev     # watch build -> main.js
npm run build   # production build
```

To test it in a vault, symlink this folder into `<vault>/.obsidian/plugins/monk-mode`, then enable the plugin under **Settings → Community plugins**.
