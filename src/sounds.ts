import key1 from "../sounds/key1.mp3";
import key2 from "../sounds/key2.mp3";
import key3 from "../sounds/key3.mp3";
import key4 from "../sounds/key4.mp3";
import key5 from "../sounds/key5.mp3";
import key6 from "../sounds/key6.mp3";
import key7 from "../sounds/key7.mp3";
import key8 from "../sounds/key8.mp3";
import space1 from "../sounds/space1.mp3";
import space2 from "../sounds/space2.mp3";
import backspace from "../sounds/backspace.mp3";
import carriageReturn from "../sounds/return.mp3";

type Kind = "keys" | "spaces" | "backspaces" | "returns";

const SOURCES: Record<Kind, Uint8Array[]> = {
  keys: [key1, key2, key3, key4, key5, key6, key7, key8],
  spaces: [space1, space2],
  backspaces: [backspace],
  returns: [carriageReturn],
};

/**
 * IBM Selectric II typewriter sounds, played with the Web Audio API.
 * Same rules as omawrite: no sound for auto-repeat or shortcuts, a bell and
 * carriage return on Enter, and key strokes picked so fast typing never
 * sounds looped. Audio is only set up the first time sounds are switched on.
 */
export class TypewriterSounds {
  volume = 0.35;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers: Partial<Record<Kind, AudioBuffer[]>> = {};
  private nextIndex: Record<Kind, number> = { keys: 0, spaces: 0, backspaces: 0, returns: 0 };
  private lastReturn: AudioBufferSourceNode | null = null;

  private async init() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    gain.connect(ctx.destination);
    this.ctx = ctx;
    this.gain = gain;
    for (const kind of Object.keys(SOURCES) as Kind[]) {
      this.buffers[kind] = await Promise.all(
        SOURCES[kind].map((data) =>
          // decodeAudioData takes ownership of the buffer, so give it a copy.
          ctx.decodeAudioData(data.slice().buffer)
        )
      );
    }
  }

  /** Call when sounds are switched on, so the first key press isn't silent. */
  warmUp() {
    void this.init();
    void this.ctx?.resume();
  }

  handleKey(event: KeyboardEvent) {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;

    let kind: Kind;
    if (event.key === "Enter") kind = "returns";
    else if (event.key === "Backspace" || event.key === "Delete") kind = "backspaces";
    else if (event.key === " ") kind = "spaces";
    else if (event.key.length === 1) kind = "keys";
    else return;

    this.play(kind);
  }

  private play(kind: Kind) {
    const ctx = this.ctx;
    const buffers = this.buffers[kind];
    if (!ctx || !this.gain || !buffers?.length) {
      void this.init();
      return;
    }
    if (ctx.state === "suspended") void ctx.resume();

    let index = this.nextIndex[kind];
    index =
      kind === "keys"
        ? (index + 1 + Math.floor(Math.random() * 3)) % buffers.length
        : (index + 1) % buffers.length;
    this.nextIndex[kind] = index;

    const source = ctx.createBufferSource();
    source.buffer = buffers[index];
    source.connect(this.gain);

    // A new carriage return cuts the last one short rather than ringing over it.
    if (kind === "returns") {
      this.lastReturn?.stop();
      this.lastReturn = source;
    }
    source.start();
  }

  destroy() {
    void this.ctx?.close();
    this.ctx = null;
    this.gain = null;
    this.buffers = {};
  }
}
