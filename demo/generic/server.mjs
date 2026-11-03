import { createServer } from "node:http";
import { saveNote } from "./lib/notes.mjs";
const notes = [];
createServer((req, res) => {
  if (req.method === "POST" && req.url === "/notes") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const input = JSON.parse(raw || "{}");
      notes.push(saveNote(input));
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, app: "generic-notes" }));
    return;
  }
  res.writeHead(404).end();
}).listen(process.env.PORT || 4322);
