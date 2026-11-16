/* Add tab: quick add (default), paste bank SMS, or import a bank statement. */
import { esc } from "../format.js";
import { $ } from "../ui.js";
import quick from "./quick.js";
import paste from "./paste.js";
import importer from "./importer.js";

const MODES = [
  ["quick", "Quick add", quick],
  ["sms", "Paste SMS", paste],
  ["statement", "Statement", importer]
];

export default {
  render(root, ctx) {
    const mode = MODES.find((m) => m[0] === ctx.params.m) || MODES[0];
    root.innerHTML = `
      <div class="seg2 three" role="tablist" aria-label="How to add">
        ${MODES.map(([id, label]) => `<button type="button" role="tab" aria-selected="${id === mode[0]}" data-go="#add${id === "quick" ? "" : "?m=" + esc(id)}">${esc(label)}</button>`).join("")}
      </div>
      <div id="add-body" class="stack ${mode[0] === "quick" ? "qa" : ""}"></div>`;
    mode[2].render($("#add-body", root), ctx);
  }
};
