#!/usr/bin/env node
// AitM Block – Build Script
// Generates 4 dist variants: community-chrome, community-firefox, pro-chrome, pro-firefox
//
// Usage:
//   node build.js              — build all 4 variants
//   node build.js community    — build only community variants
//   node build.js pro          — build only pro variants
//   node build.js community chrome — build only community-chrome

const fs   = require("fs");
const path = require("path");

const ROOT    = __dirname;
const DIST    = path.join(ROOT, "dist");
const SHARED  = path.join(ROOT, "shared");
const ASSETS  = path.join(ROOT, "assets");

const EDITIONS = ["community", "pro"];
const BROWSERS = ["chrome", "firefox"];

const filter = process.argv.slice(2);

function shouldBuild(edition, browser) {
    if (!filter.length) return true;
    if (filter.length === 1) return edition === filter[0] || browser === filter[0];
    return filter.includes(edition) && filter.includes(browser);
}

// ── File copy helpers ─────────────────────────────────────────────────────────
function cp(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

function cpDir(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) return;
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const s = path.join(srcDir, entry.name);
        const d = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            cpDir(s, d);
        } else {
            cp(s, d);
        }
    }
}

// ── Build one variant ─────────────────────────────────────────────────────────
function buildVariant(edition, browser) {
    const outDir = path.join(DIST, `${edition}-${browser}`);
    const srcDir = path.join(ROOT, edition);

    // Clean output
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });

    // 1. Shared detection engine
    cp(path.join(SHARED, "detection.js"), path.join(outDir, "detection.js"));

    // 2. Edition source files (everything except manifests and README)
    const skipFiles = new Set(["README.md"]);
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        if (entry.name.startsWith("manifest.")) continue; // handled separately
        if (skipFiles.has(entry.name)) continue;           // handled separately
        const s = path.join(srcDir, entry.name);
        const d = path.join(outDir, entry.name);
        if (entry.isDirectory()) {
            cpDir(s, d);
        } else {
            cp(s, d);
        }
    }

    // 2b. README — community edition gets its own README, pro gets the root README
    const editionReadme = path.join(srcDir, "README.md");
    const rootReadme    = path.join(ROOT, "README.md");
    if (fs.existsSync(editionReadme)) {
        cp(editionReadme, path.join(outDir, "README.md"));
    } else if (fs.existsSync(rootReadme)) {
        cp(rootReadme, path.join(outDir, "README.md"));
    }

    // 3. Manifest — pick correct browser variant and rename to manifest.json
    const manifestSrc = path.join(srcDir, `manifest.${browser}.json`);
    if (!fs.existsSync(manifestSrc)) {
        console.error(`  ✗ Missing ${manifestSrc}`);
        return;
    }
    cp(manifestSrc, path.join(outDir, "manifest.json"));

    // 4. Assets — copy shared assets folder
    if (fs.existsSync(ASSETS)) {
        cpDir(ASSETS, path.join(outDir, "assets"));
    }

    // 5. Validate: check required files exist
    const required = ["manifest.json", "background.js", "content.js", "detection.js"];
    const missing = required.filter(f => !fs.existsSync(path.join(outDir, f)));
    if (missing.length) {
        console.warn(`  ⚠ Missing files in ${edition}-${browser}: ${missing.join(", ")}`);
    }

    console.log(`  ✓ dist/${edition}-${browser}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log("AitM Block – Build\n");

let built = 0;
for (const edition of EDITIONS) {
    for (const browser of BROWSERS) {
        if (!shouldBuild(edition, browser)) continue;
        process.stdout.write(`Building ${edition}-${browser}… `);
        try {
            buildVariant(edition, browser);
            built++;
        } catch (e) {
            console.error(`FAILED\n  ${e.message}`);
        }
    }
}

console.log(`\nDone — ${built} variant(s) written to dist/`);
console.log("\nNext steps:");
console.log("  Chrome:  Load dist/<edition>-chrome as unpacked extension");
console.log("  Firefox: Load dist/<edition>-firefox as temporary add-on (about:debugging)");
console.log("           or sign with: web-ext sign --source-dir dist/<edition>-firefox");
