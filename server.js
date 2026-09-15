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
        let indexPath = null;

        try {
            const files = fs.readdirSync(process.cwd());
            
            // 1. "index" を含む .html ファイルを優先的に探す（大文字小文字無視）
            for (const f of files) {
                if (f.toLowerCase().includes("index") && f.toLowerCase().endsWith(".html")) {
                    indexPath = path.join(process.cwd(), f);
                    break;
                }
            }

            // 2. なければ、フォルダ内にある最初の .html ファイルを使う
            if (!indexPath) {
                for (const f of files) {
                    if (f.toLowerCase().endsWith(".html")) {
                        indexPath = path.join(process.cwd(), f);
                        break;
                    }
                }
            }
        } catch (e) {
            console.error("Directory read error:", e);
        }

        if (indexPath && fs.existsSync(indexPath)) {
            console.log("Serving HTML file from:", indexPath);
            res.writeHead(200, { "Content-Type": "text/html; charset=UTF-8" });
            fs.createReadStream(indexPath).pipe(res);
        } else {
            res.writeHead(500, { "Content-Type": "text/plain; charset=UTF-8" });
            res.end("エラー: フォルダ内にHTMLファイルが見つかりません。");
        }
        return;
    }

    // その他のファイル（CSS, JS, 画像など）を柔軟に探す
    const fileName = path.basename(url).toLowerCase();
    let targetFilePath = null;

    try {
        const files = fs.readdirSync(process.cwd());
        for (const f of files) {
            if (f.toLowerCase() === fileName) {
                targetFilePath = path.join(process.cwd(), f);
                break;
            }
        }
    } catch (e) {}

    if (targetFilePath && fs.existsSync(targetFilePath) && fs.statSync(targetFilePath).isFile()) {
        const ext = path.extname(targetFilePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        console.log("Serving file:", targetFilePath);
        res.writeHead(200, { "Content-Type": contentType });
        fs.createReadStream(targetFilePath).pipe(res);
    } else {
        res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
        res.end("File Not Found: " + path.basename(url));
    }
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("================================");
    console.log("Server running on port:", PORT);
    console.log("Working Directory:", process.cwd());
    console.log("================================");
});
