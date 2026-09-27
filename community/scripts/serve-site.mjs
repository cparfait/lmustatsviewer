// Aperçu local du site sans reconstruire l'image Docker : sert `community/site` et les
// visuels de l'app (`public/`), relaie `/api/*` vers une API existante (lecture seule).
//   node community/scripts/serve-site.mjs                      → API locale (127.0.0.1:3080)
//   API=https://lmu.cparfait.ovh node community/scripts/serve-site.mjs  → données de prod
// Site sur http://127.0.0.1:5190 (PORT pour changer).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SITE = join(here, "..", "site");
const PUBLIC = join(here, "..", "..", "public");
const API = (process.env.API || "http://127.0.0.1:3080").replace(/\/$/, "");
const PORT = Number(process.env.PORT || 5190);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp" };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/")) {
    if (req.method !== "GET") { res.writeHead(405).end(); return; }
    try {
      const r = await fetch(API + url.pathname + url.search);
      res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") || "application/json" });
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(502).end(String(e));
    }
    return;
  }
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  const root = /^(logos|flags|data)[/\\]/.test(path) ? PUBLIC : SITE;
  const file = join(root, path || "index.html");
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("404");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Site : http://127.0.0.1:${PORT}  (API : ${API})`));
