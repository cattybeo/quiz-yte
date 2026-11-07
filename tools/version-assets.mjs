// Gắn hash nội dung vào URL của CSS/JS trong index.html (cache busting).
// File đổi -> URL đổi -> trình duyệt bỏ qua bản cache cũ.
// Chạy tự động qua git pre-commit hook (.githooks/pre-commit).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const htmlUrl = new URL("index.html", root);
const html = readFileSync(htmlUrl, "utf8");

const out = html.replace(
  /(href|src)="(styles\.css|app\.js|data\.js)(\?v=\w+)?"/g,
  (_, attr, file) => {
    const hash = createHash("sha1").update(readFileSync(new URL(file, root))).digest("hex").slice(0, 8);
    return `${attr}="${file}?v=${hash}"`;
  }
);

if (out !== html) {
  writeFileSync(htmlUrl, out);
  console.log("index.html: đã cập nhật version cho CSS/JS");
}
