import { addIcon, App, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, setIcon } from "obsidian";
import { TypewriterSounds } from "./sounds";

interface MonkModeSettings {
  collapseSidebars: boolean;
  hideRibbon: boolean;
  hideStatusBar: boolean;
  hideTabBar: boolean;
  hideOtherPanes: boolean;
  hideViewHeader: boolean;
  collapseProperties: boolean;
  showFooter: boolean;
  typewriterSounds: boolean; // start each Monk Mode session with sounds on
  volume: number; // typewriter sound volume, 0–100
  hemingwayMode: boolean; // no deleting in Monk Mode
  topSpace: number; // empty space above the note, in % of window height
}

const DEFAULT_SETTINGS: MonkModeSettings = {
  collapseSidebars: true,
  hideRibbon: true,
  hideStatusBar: true,
  hideTabBar: true,
  hideOtherPanes: true,
  hideViewHeader: true,
  collapseProperties: true,
  showFooter: true,
  typewriterSounds: false,
  volume: 35,
  hemingwayMode: false,
  topSpace: 10,
};

const BODY_CLASS = "monk-mode-active";

// Candle icons for the Monk Mode toggle: unlit when off, lit when on. Drawn
// on Lucide's 24px grid and scaled to the 100px box Obsidian's addIcon uses,
// with Obsidian's icon stroke width so they match the built-in icons.
const CANDLE_BODY =
  '<path d="M9 11h6v9a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/><path d="M12 11V8.5"/><path d="M6 21h12"/>';
const CANDLE_FLAME = '<path d="M12 2c1.4 1.7 2.3 3 2.3 4.2a2.3 2.3 0 0 1-4.6 0C9.7 5 10.6 3.7 12 2z"/>';
const candleSvg = (lit: boolean) =>
  '<g transform="scale(4.1667)" fill="none" stroke="currentColor" stroke-linecap="round" ' +
  'stroke-linejoin="round" style="stroke-width: var(--icon-stroke, 2)">' +
  CANDLE_BODY +
  (lit ? CANDLE_FLAME : "") +
  "</g>";
const ICON_CANDLE_LIT = "monk-candle-lit";
const ICON_CANDLE_UNLIT = "monk-candle-unlit";

// Body classes toggled by individual settings while Monk Mode is on.
const SETTING_CLASSES: Partial<Record<keyof MonkModeSettings, string>> = {
  hideRibbon: "monk-hide-ribbon",
  hideStatusBar: "monk-hide-status-bar",
  hideTabBar: "monk-hide-tab-bar",
  hideOtherPanes: "monk-hide-other-panes",
  hideViewHeader: "monk-hide-view-header",
};

export default class MonkModePlugin extends Plugin {
  settings: MonkModeSettings = DEFAULT_SETTINGS;
  private active = false;
  private sidebarState = { left: false, right: false };
  private buttons = new Set<HTMLElement>();
  private viewsWithButton = new WeakSet<MarkdownView>();
  // Properties panels we folded or unfolded, so we can put them back on exit.
  private changedByUs = new Map<HTMLElement, boolean>(); // container -> was collapsed
  private propertiesOpen = false;

  private sounds = new TypewriterSounds();
  // Sounds for this session. The footer button changes this but doesn't save
  // it, so every session starts from the "Typewriter sounds" setting (off).
  private soundsOn = false;
  private footerEl: HTMLElement | null = null;
  private wordCountEl: HTMLElement | null = null;
  private propertiesButton: HTMLElement | null = null;
  private soundButton: HTMLElement | null = null;
  private hemingwayButton: HTMLElement | null = null;
  private wordCountTimer: number | null = null;

  async onload() {
    await this.loadSettings();

    addIcon(ICON_CANDLE_LIT, candleSvg(true));
    addIcon(ICON_CANDLE_UNLIT, candleSvg(false));

    const { workspace } = this.app;

    // Toggle button in each note's header toolbar (next to the reading-view icon).
    workspace.onLayoutReady(() => this.addHeaderButtons());
    this.registerEvent(workspace.on("layout-change", () => this.addHeaderButtons()));

    // As you move between notes in Monk Mode: keep properties as chosen, put
    // the cursor in the body of the note and update the word count.
    this.registerEvent(
      workspace.on("file-open", () => {
        if (this.active) this.settleSoon(true);
      })
    );
    this.registerEvent(
      workspace.on("active-leaf-change", () => {
        if (this.active) this.settleSoon(false);
      })
    );
    this.registerEvent(
      workspace.on("editor-change", () => {
        if (this.active) this.updateWordCountSoon();
      })
    );

    // Keys typed into the note editor: Hemingway mode first (it may swallow the
    // key), then typewriter sounds.
    const inEditor = (event: Event) =>
      this.active && Boolean((event.target as HTMLElement | null)?.closest?.(".cm-editor"));
    const hemingway = () => this.active && this.settings.hemingwayMode;

    this.registerDomEvent(
      document,
      "keydown",
      (event) => {
        if (!inEditor(event)) return;
        if (hemingway() && (event.key === "Backspace" || event.key === "Delete")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (this.soundsOn) this.sounds.handleKey(event);
      },
      { capture: true }
    );

    // Hemingway mode, continued: block deletions that don't come from a key
    // press (mobile keyboards) and cutting text out.
    this.registerDomEvent(
      document,
      "beforeinput",
      (event) => {
        if (hemingway() && inEditor(event) && event.inputType.startsWith("delete")) {
          event.preventDefault();
        }
      },
      { capture: true }
    );
    this.registerDomEvent(
      document,
      "cut",
      (event) => {
        if (hemingway() && inEditor(event)) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      { capture: true }
    );

    this.addCommand({
      id: "toggle",
      name: "Toggle Monk Mode",
      callback: () => this.toggle(),
    });
    this.addCommand({
      id: "toggle-typewriter-sounds",
      name: "Toggle typewriter sounds",
      checkCallback: (checking) => {
        if (!this.active) return false;
        if (!checking) this.toggleSounds();
        return true;
      },
    });
    this.addCommand({
      id: "toggle-hemingway-mode",
      name: "Toggle Hemingway mode (no deleting)",
      callback: () => this.toggleHemingway(true),
    });
    this.addCommand({
      id: "toggle-properties",
      name: "Show or hide properties",
      checkCallback: (checking) => {
        if (!this.active) return false;
        if (!checking) this.toggleProperties();
        return true;
      },
    });

    this.addSettingTab(new MonkModeSettingTab(this.app, this));
  }

  onunload() {
    if (this.active) this.exit();
    this.buttons.forEach((el) => el.remove());
    this.buttons.clear();
    this.sounds.destroy();
  }

  toggle() {
    this.active ? this.exit() : this.enter();
  }

  private enter() {
    const { workspace } = this.app;
    if (this.settings.collapseSidebars) {
      this.sidebarState = {
        left: !workspace.leftSplit.collapsed,
        right: !workspace.rightSplit.collapsed,
      };
      workspace.leftSplit.collapse();
      workspace.rightSplit.collapse();
    }
    this.active = true;
    this.propertiesOpen = !this.settings.collapseProperties;
    this.applyClasses();
    this.renderFooter();
    this.applyPropertiesState();
    this.soundsOn = this.settings.typewriterSounds;
    if (this.soundsOn) this.sounds.warmUp();
    this.settleSoon(true);
    this.refreshButtons();
  }

  private exit() {
    const { workspace } = this.app;
    document.body.classList.remove(BODY_CLASS, ...Object.values(SETTING_CLASSES));
    document.body.style.removeProperty("--monk-top-space");
    if (this.settings.collapseSidebars) {
      if (this.sidebarState.left) workspace.leftSplit.expand();
      if (this.sidebarState.right) workspace.rightSplit.expand();
    }
    document.body.classList.remove("monk-hide-properties");
    this.restoreProperties();
    this.removeFooter();
    this.active = false;
    this.refreshButtons();
  }

  applyClasses() {
    const cl = document.body.classList;
    cl.add(BODY_CLASS);
    for (const [key, cls] of Object.entries(SETTING_CLASSES)) {
      cl.toggle(cls, Boolean(this.settings[key as keyof MonkModeSettings]));
    }
    document.body.style.setProperty("--monk-top-space", `${this.settings.topSpace}vh`);
  }

  // The properties panel renders a moment after a note opens, so wait briefly
  // before folding it and placing the cursor.
  private settleSoon(focusBody: boolean) {
    window.setTimeout(() => {
      if (!this.active) return;
      this.applyPropertiesState();
      if (focusBody) this.focusBody();
      this.updateWordCount();
    }, 50);
  }

  // Focus the editor with the cursor in the note's text, below the properties.
  // If the cursor is already in the text (e.g. restored from last time), keep it.
  private focusBody() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.getMode() !== "source" || !view.file) return;
    const editor = view.editor;
    const fm = this.app.metadataCache.getFileCache(view.file)?.frontmatterPosition;
    const bodyStart = fm ? Math.min(fm.end.line + 1, editor.lastLine()) : 0;
    if (editor.getCursor().line < bodyStart) {
      editor.setCursor({ line: bodyStart, ch: 0 });
    }
    editor.focus();
  }

  // ---------- Properties ----------

  toggleProperties() {
    this.propertiesOpen = !this.propertiesOpen;
    this.applyPropertiesState();
    this.refreshFooter();
  }

  // Off: the properties panel is hidden completely (CSS, via a body class).
  // On: it is shown and unfolded.
  private applyPropertiesState() {
    document.body.classList.toggle("monk-hide-properties", !this.propertiesOpen);
    if (!this.propertiesOpen) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    view.containerEl.querySelectorAll<HTMLElement>(".metadata-container").forEach((container) => {
      const collapsed = container.hasClass("is-collapsed");
      if (!collapsed) return;
      const heading = container.querySelector<HTMLElement>(".metadata-properties-heading");
      if (!heading) return;
      if (!this.changedByUs.has(container)) this.changedByUs.set(container, collapsed);
      heading.click(); // use Obsidian's own toggle so its state stays consistent
    });
  }

  private restoreProperties() {
    for (const [container, wasCollapsed] of this.changedByUs) {
      if (!container.isConnected || container.hasClass("is-collapsed") === wasCollapsed) continue;
      container.querySelector<HTMLElement>(".metadata-properties-heading")?.click();
    }
    this.changedByUs.clear();
  }

  // ---------- Typewriter sounds ----------

  toggleSounds() {
    this.soundsOn = !this.soundsOn;
    if (this.soundsOn) this.sounds.warmUp();
    this.refreshFooter();
  }

  // ---------- Hemingway mode ----------

  async toggleHemingway(notify = false) {
    this.settings.hemingwayMode = !this.settings.hemingwayMode;
    await this.saveData(this.settings);
    this.refreshFooter();
    if (notify) new Notice(`Hemingway mode ${this.settings.hemingwayMode ? "on" : "off"}`);
  }

  // ---------- Footer ----------

  private renderFooter() {
    this.removeFooter();
    if (!this.settings.showFooter) return;

    const footer = document.body.createDiv({ cls: "monk-footer" });
    const left = footer.createDiv({ cls: "monk-footer-left" });

    this.propertiesButton = left.createDiv({ cls: "clickable-icon monk-footer-button" });
    this.propertiesButton.addEventListener("click", () => this.toggleProperties());

    this.soundButton = left.createDiv({ cls: "clickable-icon monk-footer-button" });
    this.soundButton.addEventListener("click", () => this.toggleSounds());

    this.hemingwayButton = left.createDiv({ cls: "clickable-icon monk-footer-button" });
    this.hemingwayButton.addEventListener("click", () => void this.toggleHemingway());

    this.wordCountEl = footer.createDiv({ cls: "monk-footer-words" });

    // Keep the cursor in the note when clicking the footer buttons.
    footer.addEventListener("mousedown", (e) => e.preventDefault());

    this.footerEl = footer;
    this.refreshFooter();
    this.updateWordCount();
  }

  private removeFooter() {
    this.footerEl?.remove();
    this.footerEl = this.wordCountEl = this.propertiesButton = this.soundButton = this.hemingwayButton = null;
  }

  private refreshFooter() {
    if (this.propertiesButton) {
      setIcon(this.propertiesButton, "list");
      this.propertiesButton.setAttr("aria-label", this.propertiesOpen ? "Hide properties" : "Show properties");
      this.propertiesButton.toggleClass("is-active", this.propertiesOpen);
    }
    if (this.soundButton) {
      const on = this.soundsOn;
      setIcon(this.soundButton, on ? "volume-2" : "volume-x");
      this.soundButton.setAttr("aria-label", on ? "Turn typewriter sounds off" : "Turn typewriter sounds on");
      this.soundButton.toggleClass("is-active", on);
    }
    if (this.hemingwayButton) {
      const on = this.settings.hemingwayMode;
      setIcon(this.hemingwayButton, "feather");
      this.hemingwayButton.setAttr(
        "aria-label",
        on ? "Hemingway mode on: no deleting. Click to turn off" : "Turn on Hemingway mode (no deleting)"
      );
      this.hemingwayButton.toggleClass("is-active", on);
    }
  }

  private updateWordCountSoon() {
    if (this.wordCountTimer !== null) window.clearTimeout(this.wordCountTimer);
    this.wordCountTimer = window.setTimeout(() => {
      this.wordCountTimer = null;
      this.updateWordCount();
    }, 200);
  }

  private updateWordCount() {
    if (!this.wordCountEl) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      this.wordCountEl.setText("");
      return;
    }
    const n = countWords(view.editor.getValue());
    this.wordCountEl.setText(`${n.toLocaleString()} ${n === 1 ? "word" : "words"}`);
  }

  // ---------- Header button ----------

  private addHeaderButtons() {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || this.viewsWithButton.has(view)) continue;
      const el = view.addAction(this.buttonIcon(), this.buttonLabel(), () => this.toggle());
      el.addClass("monk-mode-action");
      el.toggleClass("is-active", this.active);
      this.viewsWithButton.add(view);
      this.buttons.add(el);
    }
  }

  private refreshButtons() {
    for (const el of this.buttons) {
      if (!el.isConnected) {
        this.buttons.delete(el);
        continue;
      }
      setIcon(el, this.buttonIcon());
      el.setAttr("aria-label", this.buttonLabel());
      el.toggleClass("is-active", this.active);
    }
  }

  private buttonIcon() {
    return this.active ? ICON_CANDLE_LIT : ICON_CANDLE_UNLIT;
  }

  private buttonLabel() {
    return this.active ? "Exit Monk Mode" : "Enter Monk Mode";
  }

  // ---------- Settings ----------

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.sounds.setVolume(this.settings.volume / 100);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.sounds.setVolume(this.settings.volume / 100);
    if (this.active) {
      this.applyClasses();
      this.renderFooter();
    }
  }
}

/** Count words in a note, leaving out the properties (frontmatter). */
function countWords(text: string): number {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/, "");
  return body.match(/[\p{L}\p{N}]+(?:['’\-_][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

class MonkModeSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MonkModePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    type BoolKey = {
      [K in keyof MonkModeSettings]: MonkModeSettings[K] extends boolean ? K : never;
    }[keyof MonkModeSettings];
    const toggle = (name: string, desc: string, key: BoolKey) =>
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addToggle((t) =>
          t.setValue(this.plugin.settings[key]).onChange(async (v) => {
            this.plugin.settings[key] = v;
            await this.plugin.saveSettings();
          })
        );

    toggle("Collapse sidebars", "Collapse the left and right sidebars.", "collapseSidebars");
    toggle("Hide ribbon", "Hide the left ribbon.", "hideRibbon");
    toggle("Hide tab bar", "Hide the tabs and title bar.", "hideTabBar");
    toggle("Hide other panes", "Show only the active pane when the editor is split.", "hideOtherPanes");
    toggle(
      "Hide note header",
      "Replace the header and big title with a small, faded note name at the top and a faint Monk Mode toggle.",
      "hideViewHeader"
    );
    toggle("Hide status bar", "Hide the bottom status bar.", "hideStatusBar");
    toggle("Hide properties", "Start with the properties panel hidden. The footer button shows it again.", "collapseProperties");
    toggle(
      "Show footer",
      "Show the word count and the properties and typewriter-sound buttons along the bottom.",
      "showFooter"
    );
    toggle(
      "Start with typewriter sounds on",
      "Play IBM Selectric II sounds as you type. Off by default; the footer button turns them on for the current session.",
      "typewriterSounds"
    );

    new Setting(containerEl)
      .setName("Typewriter volume")
      .setDesc("How loud the typewriter sounds are.")
      .addSlider((s) =>
        s
          .setLimits(0, 100, 5)
          .setValue(this.plugin.settings.volume)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.volume = v;
            await this.plugin.saveSettings();
          })
      );

    toggle(
      "Hemingway mode",
      "No deleting in Monk Mode: Backspace, Delete and Cut do nothing, so you can only write forward. Fix it in the edit.",
      "hemingwayMode"
    );

    new Setting(containerEl)
      .setName("Space above note")
      .setDesc(
        "Empty space above the note, as a percentage of the window height. Around 30–40% puts the start of the note near the middle of the screen."
      )
      .addSlider((s) =>
        s
          .setLimits(0, 50, 5)
          .setValue(this.plugin.settings.topSpace)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.topSpace = v;
            await this.plugin.saveSettings();
          })
      );
  }
}
