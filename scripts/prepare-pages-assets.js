// Cloudflare Pages excludes any directory named node_modules from static uploads.
// Expo's web export places package fonts under dist/assets/node_modules, so move
// those assets and update the exported JavaScript before generating the PWA cache.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const dist = path.join(__dirname, "..", "dist");
const source = path.join(dist, "assets", "node_modules");
const target = path.join(dist, "assets", "vendor");
const bundleDir = path.join(dist, "_expo", "static", "js", "web");
const htmlPath = path.join(dist, "index.html");

if (!fs.existsSync(source) || !fs.existsSync(bundleDir) || !fs.existsSync(htmlPath)) {
  throw new Error("Expected Expo web export files are missing; run expo export first.");
}
if (fs.existsSync(target)) {
  throw new Error("dist/assets/vendor already exists; use a fresh Expo export.");
}

fs.renameSync(source, target);

let html = fs.readFileSync(htmlPath, "utf8");
let rewritten = 0;
for (const filename of fs.readdirSync(bundleDir)) {
  if (!filename.endsWith(".js")) continue;
  const oldPath = path.join(bundleDir, filename);
  const original = fs.readFileSync(oldPath, "utf8");
  const updated = original.replaceAll("assets/node_modules/", "assets/vendor/");
  if (updated === original) continue;

  // The exported bundle name is content-addressed. Rename it too so a browser
  // with the previous build cached cannot reuse JavaScript with old font URLs.
  const digest = crypto.createHash("md5").update(updated).digest("hex");
  const nextFilename = filename.replace(/-[a-f0-9]{32}\.js$/, `-${digest}.js`);
  if (nextFilename === filename) {
    throw new Error(`Unrecognised Expo bundle filename: ${filename}`);
  }
  fs.writeFileSync(path.join(bundleDir, nextFilename), updated);
  fs.unlinkSync(oldPath);
  html = html.replaceAll(filename, nextFilename);
  rewritten += 1;
}

if (!rewritten || html.includes("assets/node_modules/")) {
  throw new Error("No Expo bundle asset URLs were updated.");
}
fs.writeFileSync(htmlPath, html);
console.log(`Moved package assets and updated ${rewritten} web bundle(s) for Cloudflare Pages.`);
