#!/usr/bin/env python3
"""
Calculator test — har page ka calculator asli browser jaisa (jsdom) chala kar dekhta hai.
14 Oct 2026 ko 13 calculator live par toote mile the jabki audit.py pass tha.
Deploy me audit ke baad chalta hai — ek bhi toota calculator mila to deploy ruk jaata hai.

Ye .py file isliye hai kyunki Telegram bot .js file ko site/ me daal deta hai;
asli jaanch neeche likhi JavaScript karti hai (Node + jsdom@24.1.3).
Usage: python3 scripts/calc_test.py site
"""
import os, sys, subprocess, tempfile

JS = r'''#!/usr/bin/env node
/*
 Calculator test — har page ka calculator asli browser jaisa chala kar dekhta hai.
 14 Oct 2026 ko 13 calculator live site par toote mile the ("Sahi value daalein"),
 jabki audit.py pass tha — kyunki audit calculator ko chala kar nahi dekhta.
 Ye script wahi galti deploy se PEHLE pakad leti hai.

 Kya jaanchta hai (har page jisme id="res" hai):
   * page ki script load hote waqt koi JavaScript error to nahi
   * "Hisaab lagao" (run) chalane par jawab me NaN / Infinity / undefined /
     "Sahi value daalein" to nahi aaya
   * tools.js ke har card ka modal calculator (index.html par) bhi
 Koi bhi page fail -> exit 1 -> deploy ruk jaata hai.
 Usage: python3 scripts/calc_test.py site
 Zaroorat: jsdom@24.1.3 (deploy.yml khud install karta hai, kuch store nahi hota)
*/
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const dir = process.argv[2] || "site";
const BAD = /NaN|Infinity|undefined|Sahi value daalein/;
const SKIP = new Set(["404.html"]);
const fails = [];

function makeDom(html, url, errs) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errs.push(String(e.message || e).slice(0, 160)));
  return new JSDOM(html, {
    runScripts: "dangerously", virtualConsole: vc, url, pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
      w.scrollTo = () => {};
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.fetch = () => Promise.reject(new Error("test me network band"));
      w.navigator.clipboard = { writeText: () => Promise.resolve() };
    },
  });
}
const strip = h => h.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");

const files = fs.readdirSync(dir).filter(f => f.endsWith(".html") && !SKIP.has(f));
const toolsjs = fs.readFileSync(path.join(dir, "tools.js"), "utf8");
let checked = 0;
for (const f of files) {
  const raw = fs.readFileSync(path.join(dir, f), "utf8");
  const errs = [];
  let dom;
  try { dom = makeDom(strip(raw), "https://sabhisaab.com/" + f.replace(/\.html$/, ""), errs); }
  catch (e) { fails.push([f, "page load nahi hua: " + e.message]); continue; }
  const w = dom.window, d = w.document;
  if (/src="\/tools\.js"/.test(raw)) { try { w.eval(toolsjs); } catch (e) { errs.push("tools.js: " + e.message); } }
  const res = d.getElementById("res");
  if (res && typeof w.run === "function") {
    checked++;
    try { w.run(); } catch (e) { errs.push("run(): " + e.message); }
    const t = res.textContent.replace(/\s+/g, " ").trim();
    if (!t) fails.push([f, "jawab khaali aaya"]);
    else if (BAD.test(t)) fails.push([f, "jawab galat: " + t.slice(0, 90)]);
  }
  if (errs.length) fails.push([f, "JS error: " + errs[0]]);
  w.close();
}

// tools.js ke modal calculator (homepage cards)
const idx = fs.readFileSync(path.join(dir, "index.html"), "utf8");
const errs = [];
const dom = makeDom(strip(idx), "https://sabhisaab.com/", errs);
const w = dom.window;
let tools = [];
try { w.eval(toolsjs + ";window.__t=tools;"); tools = w.__t || []; }
catch (e) { fails.push(["tools.js", "load nahi hua: " + e.message]); }
const box = w.document.createElement("div"); w.document.body.appendChild(box);
let tchecked = 0;
for (const t of tools) {
  if (typeof t.calc !== "function" || !t.fields) continue;   // live/link wale card
  box.innerHTML = t.fields;
  let r;
  try { r = t.calc(); } catch (e) { fails.push(["tools.js:" + t.id, "calc() error: " + e.message]); continue; }
  if (r && typeof r.then === "function") continue;            // live data wale
  const tmp = w.document.createElement("div"); tmp.innerHTML = r || "";
  const tx = tmp.textContent;
  tchecked++;
  if (!tx.trim() || BAD.test(tx)) fails.push(["tools.js:" + t.id, "jawab galat: " + tx.slice(0, 90)]);
}
box.innerHTML = "";

console.log(`Calculator test: ${checked} page + ${tchecked} card chalaye`);
if (fails.length) {
  console.log(`\nFAIL — ${fails.length} jagah calculator toota hai:`);
  for (const [f, why] of fails.slice(0, 40)) console.log(` - ${f}: ${why}`);
  try { fs.writeFileSync("calc_fail.txt", fails.slice(0, 15).map(x => x.join(" — ")).join("\n")); } catch (e) {}
  process.exit(1);
}
console.log("SAB CALCULATOR THEEK CHAL RAHE HAIN.");
'''

def main():
    site = sys.argv[1] if len(sys.argv) > 1 else "site"
    fd, path = tempfile.mkstemp(suffix=".js")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(JS)
    try:
        return subprocess.call(["node", path, site])
    finally:
        os.remove(path)

if __name__ == "__main__":
    sys.exit(main())
