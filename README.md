# Monk Mode

Distraction-free writing for [Obsidian](https://obsidian.md). Monk Mode hides everything except the note you're writing, and leaves a quiet footer with the few things you still need.

## Using it

Click the flame icon in a note's header (next to the reading-view button), or run **Monk Mode: Toggle** from the command palette. Click the faint flame in the top-right corner, or run the command again, to leave.

While Monk Mode is on:

- **Only the note is shown.** Sidebars, ribbon, tabs, title bar, other split panes, the status bar and the note header are hidden. The note's name sits small and faded at the top.
- **The note sits lower on the page**, with room to scroll the last line up to the middle of the screen.
- **Properties are hidden.** When you show them, they're faded until you hover over them.
- **The cursor starts in the text**, below the properties.

The footer has the word count on the right and three buttons on the left:

- **Properties:** show or hide the properties panel.
- **Typewriter sounds:** an IBM Selectric II as you type, with a bell on Enter. Off each time you start Monk Mode.
- **Hemingway mode:** no deleting. Backspace, Delete and Cut do nothing, so you can only write forward.

Every part of this can be switched off or adjusted in the plugin's settings, including the space above the note and the typewriter volume. The sounds and Hemingway mode also have commands, so you can give them hotkeys.

## Privacy

Monk Mode makes no network requests and doesn't read or change your files. To play typewriter sounds and run Hemingway mode it listens to key presses in the note editor, but it only looks at which kind of key was pressed (letter, space, Backspace, Enter) and never records or sends what you type.

## Credits

The typewriter sounds are public domain (CC0) recordings from Freesound. See [sounds/README.md](sounds/README.md).

## Development

```bash
npm install
npm run dev     # rebuild main.js on every change
npm run build   # production build
```

To try it in a vault, symlink this folder to `<vault>/.obsidian/plugins/monk-mode` and enable it under **Settings → Community plugins**.

To release, set the version with `npm version <x.y.z>` (this updates `manifest.json` and `versions.json`), then push the tag. GitHub Actions builds the plugin and creates a draft release with `main.js`, `manifest.json` and `styles.css` attached.
