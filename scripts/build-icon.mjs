// Rasterize the official Friday mark (arc reactor) to a PNG that electron-builder
// turns into the Windows .ico (app + installer icon), and that the README uses.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const svg = readFileSync("web/public/friday-icon.svg", "utf8");
const png = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } }).render().asPng();

mkdirSync("build-resources", { recursive: true });
writeFileSync("build-resources/icon.png", png);
console.log(`✓ wrote build-resources/icon.png (${Math.round(png.length / 1024)} KB)`);
