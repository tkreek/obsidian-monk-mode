# Typewriter sounds

These clips are copied from the omawrite project. They were cut from two recordings released under
Creative Commons 0 (public domain) on Freesound:

- [Typewriter, IBM Selectric II](https://freesound.org/people/secretmojo/sounds/224012/)
  by secretmojo: `key*.mp3`, `space*.mp3`, and `backspace.mp3`
- [Typewriter bell & carriage reset](https://freesound.org/people/knufds/sounds/345955/)
  by knufds: `return.mp3`

They were converted from the original WAV files to MP3 (LAME VBR, `-q:a 2`)
to keep the plugin small. MP3 is used rather than Opus or Ogg because it plays
everywhere Obsidian runs, including iOS:

```bash
for f in *.wav; do ffmpeg -i "$f" -codec:a libmp3lame -q:a 2 "${f%.wav}.mp3"; done
```
