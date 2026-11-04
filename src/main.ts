import { App, MarkdownView, Plugin, PluginSettingTab, Setting, setIcon } from "obsidian";

interface MonkModeSettings {
  hideRibbon: boolean;
  hideStatusBar: boolean;
  hideTabBar: boolean;
  collapseSidebars: boolean;
}

const DEFAULT_SETTINGS: MonkModeSettings = {
  hideRibbon: true,
  hideStatusBar: true,
  hideTabBar: true,
  collapseSidebars: true,
};

const BODY_CLASS = "monk-mode-active";

export default class MonkModePlugin extends Plugin {
  settings: MonkModeSettings = DEFAULT_SETTINGS;
  private active = false;
  private sidebarState = { left: false, right: false };
  private buttons = new Set<HTMLElement>();
  private viewsWithButton = new WeakSet<MarkdownView>();

  async onload() {
    await this.loadSettings();

    // Toggle button in each note's header toolbar (next to the reading-view icon).
    this.app.workspace.onLayoutReady(() => this.addHeaderButtons());
    this.registerEvent(this.app.workspace.on("layout-change", () => this.addHeaderButtons()));

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
    this.applyClasses();
    this.active = true;
    this.refreshButtons();
  }

  private exit() {
    const { workspace } = this.app;
    document.body.classList.remove(
      BODY_CLASS,
      "monk-hide-ribbon",
      "monk-hide-status-bar",
      "monk-hide-tab-bar"
    );
    if (this.settings.collapseSidebars) {
      if (this.sidebarState.left) workspace.leftSplit.expand();
      if (this.sidebarState.right) workspace.rightSplit.expand();
    }
    this.active = false;
    this.refreshButtons();
  }

  applyClasses() {
    const cl = document.body.classList;
    cl.add(BODY_CLASS);
    cl.toggle("monk-hide-ribbon", this.settings.hideRibbon);
    cl.toggle("monk-hide-status-bar", this.settings.hideStatusBar);
    cl.toggle("monk-hide-tab-bar", this.settings.hideTabBar);
  }

  get isActive() {
    return this.active;
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

    const toggle = (name: string, desc: string, key: keyof MonkModeSettings) =>
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addToggle((t) =>
          t.setValue(this.plugin.settings[key]).onChange(async (v) => {
            this.plugin.settings[key] = v;
            await this.plugin.saveSettings();
          })
        );

    toggle("Collapse sidebars", "Collapse left and right sidebars when entering Monk Mode.", "collapseSidebars");
    toggle("Hide ribbon", "Hide the left ribbon.", "hideRibbon");
    toggle("Hide status bar", "Hide the bottom status bar.", "hideStatusBar");
    toggle("Hide tab bar", "Hide the tab header strip.", "hideTabBar");
  }
}
