const {
  Plugin,
  PluginSettingTab,
  Setting,
  editorLivePreviewField,
} = require("obsidian");
const { ViewPlugin, Decoration, WidgetType } = require("@codemirror/view");
const { RangeSetBuilder } = require("@codemirror/state");
const { syntaxTree } = require("@codemirror/language");

const DEFAULT_SETTINGS = {
  separator: " > ",
};

// Module-level reference the editor extension reads from.
// Set in onload, updated whenever settings change.
let currentSeparator = DEFAULT_SETTINGS.separator;

class SepWidget extends WidgetType {
  constructor(sep) {
    super();
    this.sep = sep;
  }
  toDOM() {
    const outer = document.createElement("span");
    outer.className = "cm-hmd-internal-link";
    outer.createSpan({ cls: "cm-underline", text: this.sep });
    return outer;
  }
  // Compare by separator so decorations refresh when the setting changes
  eq(other) {
    return other.sep === this.sep;
  }
}

const LINK_RE = /\[\[([^\[\]|#]+)((?:#[^\[\]|#]+)+)\]\]/g;

const linkSeparator = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = this.build(view); }
    update(u) {
      if (u.docChanged || u.selectionSet || u.viewportChanged)
        this.decorations = this.build(u.view);
    }
    build(view) {
      if (!view.state.field(editorLivePreviewField)) return Decoration.none;

      const builder = new RangeSetBuilder();
      const tree = syntaxTree(view.state);

      for (const { from, to } of view.visibleRanges) {
        const text = view.state.sliceDoc(from, to);
        let m;
        LINK_RE.lastIndex = 0;
        while ((m = LINK_RE.exec(text)) !== null) {
          const start = from + m.index;
          const end = start + m[0].length;

          if (view.state.selection.ranges.some(r => r.from <= end && r.to >= start))
            continue;

          const node = tree.resolveInner(start + 2, 1);
          if (!node.type.name.includes("hmd-internal-link")) continue;

          const inner = m[0];
          for (let i = inner.indexOf("#"); i !== -1; i = inner.indexOf("#", i + 1)) {
            builder.add(
              start + i,
              start + i + 1,
              Decoration.replace({ widget: new SepWidget(currentSeparator) })
            );
          }
        }
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations }
);

class SepSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Separator")
      .setDesc("Text shown in place of '#' in section links in Live Preview. Include spaces if you want them, e.g. ' > ' or ' § '.")
      .addText((text) =>
        text
          .setPlaceholder(" > ")
          .setValue(this.plugin.settings.separator)
          .onChange(async (value) => {
            this.plugin.settings.separator = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

module.exports = class LpSepPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.registerEditorExtension(linkSeparator);
    this.addSettingTab(new SepSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    currentSeparator = this.settings.separator;
  }

  async saveSettings() {
    await this.saveData(this.settings);
    currentSeparator = this.settings.separator;
    // Force all open editors to rebuild their decorations
    this.app.workspace.updateOptions();
  }
};