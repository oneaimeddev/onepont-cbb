import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import postcss from "postcss";
const baseline = "baseline/pre-paleta-2026-11-20";
const files = [
  "src/app/globals.css",
  "src/features/chat/intelligence.css",
  "src/features/documents/documents.css",
];
const pure =
  /^(?:color|background(?:-color)?|border-color|accent-color|-webkit-tap-highlight-color|scrollbar-color)$/;
const strip = (v) =>
  v.replace(
    /#[\da-f]{3,8}\b|rgba?\([^)]*\)|var\(--[\w-]+(?:,[^)]*)?\)|\b(?:white|transparent)\b/gi,
    "<color>",
  );
let declarations = 0;
for (const file of files) {
  const old = postcss.parse(
    execFileSync("git", ["show", `${baseline}:${file}`], { encoding: "utf8" }),
  );
  const current = postcss.parse(readFileSync(file, "utf8"));
  const rules = (root) => {
    const result = [];
    root.walkRules((r) => result.push(r));
    return result;
  };
  const before = rules(old),
    after = rules(current);
  assert(after.length >= before.length);
  before.forEach((r, i) => {
    const n = after[i];
    assert.equal(n.selector, r.selector, `${file}: selector`);
    const decls = n.nodes.filter((d) => d.type === "decl");
    for (const d of r.nodes.filter((d) => d.type === "decl")) {
      const fresh = decls.find((x) => x.prop === d.prop);
      if (d.prop.startsWith("--")) {
        if (!fresh) {
          assert(
            ["--cbb-navy", "--cbb-green", "--green-hover", "--focus"].includes(
              d.prop,
            ),
          );
          continue;
        }
        if (d.value !== fresh.value)
          assert(
            /^(?:#|rgb|var\()/i.test(d.value) &&
              /^(?:#|rgb|var\()/i.test(fresh.value),
            `${d.prop}: non-colour token`,
          );
      } else {
        assert(fresh, `${d.prop} removed`);
        if (d.value !== fresh.value && !pure.test(d.prop))
          assert.equal(
            strip(fresh.value),
            strip(d.value),
            `${file} ${r.selector} ${d.prop}`,
          );
      }
      declarations++;
    }
  });
  after
    .slice(before.length)
    .forEach((r) =>
      r.walkDecls((d) =>
        assert(
          pure.test(d.prop) || d.prop.startsWith("--"),
          `new non-colour declaration ${d.prop}`,
        ),
      ),
    );
}
const css = readFileSync(files[0], "utf8"),
  root = postcss.parse(css).nodes.find((n) => n.selector === ":root");
const tokens = Object.fromEntries(
  root.nodes.filter((n) => n.type === "decl").map((n) => [n.prop, n.value]),
);
assert.equal(tokens["--cbb-navy"], "#161d34");
assert.equal(tokens["--cbb-green"], "#3d7039");
assert.equal(tokens["--cbb-yellow"], "#e0c42d");
for (const [k, v] of Object.entries({
  "--green-soft": "#e6f4ec",
  "--green-ink": "#05652f",
  "--yellow-soft": "#fdf5d3",
  "--yellow-ink": "#6b5400",
  "--danger": "#a32631",
  "--danger-soft": "#fdeef0",
}))
  assert.equal(tokens[k], v);
for (const file of files)
  assert(!readFileSync(file, "utf8").includes("var(--cbb-green-vibrant)"));
const luminance = (hex) => {
  const channels = hex
    .replace("#", "")
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const ratio = (a, b) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const pairs = [
  ["Navy / branco", "#161d34", "#ffffff", 4.5],
  ["Primário / branco", "#3d7039", "#ffffff", 4.5],
  ["Hover / branco", "#325d2f", "#ffffff", 4.5],
  ["Active / branco", "#294d26", "#ffffff", 4.5],
  ["Link / superfície", "#3d7039", "#f4f6fa", 4.5],
  ["Selecionado / fundo suave", "#3d7039", "#edf3ec", 4.5],
  ["Navy / amarelo", "#161d34", "#e0c42d", 4.5],
  ["Foco / branco", "#2366b2", "#ffffff", 3],
  ["Foco / superfície", "#2366b2", "#f4f6fa", 3],
  ["Sucesso / fundo semântico", "#05652f", "#e6f4ec", 4.5],
  ["Rascunho / fundo semântico", "#6b5400", "#fdf5d3", 4.5],
];
const contrast = pairs.map(([label, foreground, background, minimum]) => {
  const value = ratio(foreground, background);
  assert(value >= minimum, `${label}: ${value}`);
  return {
    label,
    foreground,
    background,
    ratio: Number(value.toFixed(2)),
    minimum,
  };
});
contrast.push({
  label: "Branco / amarelo: proibido para texto",
  foreground: "#ffffff",
  background: "#e0c42d",
  ratio: Number(ratio("#ffffff", "#e0c42d").toFixed(2)),
  minimum: 4.5,
  used: false,
});
writeFileSync(
  "docs/visual/handoff-007-10-6c/contrast.json",
  JSON.stringify({ declarations, contrast }, null, 2),
);
console.log(
  `${declarations} declarations checked; ${pairs.length} approved contrast pairs; semantic tokens preserved.`,
);
