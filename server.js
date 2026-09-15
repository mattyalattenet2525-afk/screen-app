const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 10000;

// MIMEタイプの設定
const MIME_TYPES = {
    ".html": "text/html; charset=UTF-8",
    ".css": "text/css; charset=UTF-8",
    ".js": "application/javascript; charset=UTF-8",
    ".json": "application/json; charset=UTF-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav"
};

const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split("?")[0]);
    console.log("Request URL:", url);

    // トップページへのアクセス
    if (url === "/") {
        const indexPath = path.join(process.cwd(), "index.html");

        if (fs.existsSync(indexPath)) {
            console.log("Serving index.html from:", indexPath);
            res.writeHead(200, { "Content-Type": "text/html; charset=UTF-8" });
            fs.createReadStream(indexPath).pipe(res);
        } else {
            console.log("index.html not found at:", indexPath);
            res.writeHead(500, { "Content-Type": "text/plain; charset=UTF-8" });
            res.end("エラー: index.html が見つかりません（パス: " + indexPath + "）");
        }
        return;
    }

    // その他のファイル（CSS, JS, 画像など）
    const fileName = path.basename(url);
    const filePath = path.join(process.cwd(), fileName);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        console.log("Serving file:", filePath);
        res.writeHead(200, { "Content-Type": contentType });
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
        res.end("File Not Found: " + fileName);
    }
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("================================");
    console.log("Server running on port:", PORT);
    console.log("Working Directory:", process.cwd());
    console.log("================================");
});
