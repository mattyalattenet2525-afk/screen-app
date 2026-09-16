const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 10000;

// recordings フォルダがなければ作成
const RECORDINGS_DIR = path.join(process.cwd(), "recordings");
if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// MIME タイプの設定
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

function generateFilename() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return (
        "rec-" +
        now.getFullYear() +
        pad(now.getMonth() + 1) +
        pad(now.getDate()) +
        "-" +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds()) +
        ".webm"
    );
}

const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split("?")[0]);
    console.log("Request URL:", url, "Method:", req.method);

    // トップページへのアクセス
    if (url === "/" && req.method === "GET") {
        let indexPath = null;

        try {
            const files = fs.readdirSync(process.cwd());
            
            for (const f of files) {
                if (f.toLowerCase().includes("index") && f.toLowerCase().endsWith(".html")) {
                    indexPath = path.join(process.cwd(), f);
                    break;
                }
            }

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
            res.end("エラー: フォルダ内に HTML ファイルが見つかりません。");
        }
        return;
    }

    // 録画データアップロード受け口
    if (url === "/upload" && req.method === "POST") {
        const filename = generateFilename();
        const filePath = path.join(RECORDINGS_DIR, filename);
        const writeStream = fs.createWriteStream(filePath);
        let receivedBytes = 0;

        req.on("data", (chunk) => {
            receivedBytes += chunk.length;
        });

        req.on("end", () => {
            writeStream.end();
            console.log("Upload complete:", filename, receivedBytes, "bytes");
            res.writeHead(200, { "Content-Type": "application/json; charset=UTF-8" });
            res.end(JSON.stringify({
                ok: true,
                filename: filename,
                size: receivedBytes
            }));
        });

        req.on("error", (err) => {
            console.error("Upload error:", err);
            writeStream.end();
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            res.writeHead(500, { "Content-Type": "application/json; charset=UTF-8" });
            res.end(JSON.stringify({ ok: false, error: "upload failed" }));
        });

        req.pipe(writeStream);
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
