import { App, MarkdownView, Plugin, PluginSettingTab, Setting, setIcon } from "obsidian";

interface MonkModeSettings {
  collapseSidebars: boolean;
  hideRibbon: boolean;
  hideStatusBar: boolean;
  hideTabBar: boolean;
  hideOtherPanes: boolean;
  hideViewHeader: boolean;
  collapseProperties: boolean;
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
  topSpace: 30,
};

const BODY_CLASS = "monk-mode-active";

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
  // Properties panels we collapsed, so we can re-expand them on exit.
  private collapsedByUs = new Set<HTMLElement>();

  async onload() {
    await this.loadSettings();

    const { workspace } = this.app;

    // Toggle button in each note's header toolbar (next to the reading-view icon).
    workspace.onLayoutReady(() => this.addHeaderButtons());
    this.registerEvent(workspace.on("layout-change", () => this.addHeaderButtons()));

    // As you move between notes in Monk Mode: keep properties folded and put
    // the cursor in the body of the note.
    this.registerEvent(workspace.on("file-open", () => {
      if (this.active) this.settleSoon(true);
    }));
    this.registerEvent(workspace.on("active-leaf-change", () => {
      if (this.active) this.settleSoon(false);
    }));

    this.addCommand({
      id: "toggle",
      name: "Toggle Monk Mode",
      callback: () => this.toggle(),
    });

    this.addSettingTab(new MonkModeSettingTab(this.app, this));
  }

  onunload() {
    if (this.active) this.exit();
    this.buttons.forEach((el) => el.remove());
    this.buttons.clear();
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
    this.applyClasses();
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
    this.restoreProperties();
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
      if (this.settings.collapseProperties) this.collapseProperties();
      if (focusBody) this.focusBody();
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

  private collapseProperties() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    view.containerEl.querySelectorAll<HTMLElement>(".metadata-container").forEach((container) => {
      if (container.hasClass("is-collapsed")) return;
      const heading = container.querySelector<HTMLElement>(".metadata-properties-heading");
      if (!heading) return;
      heading.click(); // use Obsidian's own toggle so its state stays consistent
      this.collapsedByUs.add(container);
    });
  }

  private restoreProperties() {
    for (const container of this.collapsedByUs) {
      if (!container.isConnected || !container.hasClass("is-collapsed")) continue;
      container.querySelector<HTMLElement>(".metadata-properties-heading")?.click();
    }
    this.collapsedByUs.clear();
  }

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
    return this.active ? "eye" : "eye-off";
  }

  private buttonLabel() {
    return this.active ? "Exit Monk Mode" : "Enter Monk Mode";
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.active) this.applyClasses();
  }
}

class MonkModeSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MonkModePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    type BoolKey = { [K in keyof MonkModeSettings]: MonkModeSettings[K] extends boolean ? K : never }[keyof MonkModeSettings];
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
    toggle("Hide note header", "Replace the header and big title with a small, faded note name at the top and a faint Monk Mode toggle.", "hideViewHeader");
    toggle("Hide status bar", "Hide the bottom status bar.", "hideStatusBar");
    toggle("Collapse properties", "Fold the properties panel of each note you open.", "collapseProperties");

    new Setting(containerEl)
      .setName("Space above note")
      .setDesc("Empty space above the note, as a percentage of the window height. Around 30–40% puts the start of the note near the middle of the screen.")
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
