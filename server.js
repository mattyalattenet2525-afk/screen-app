const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 10000;

// recordings フォルダがなければ作成
const RECORDINGS_DIR = path.join(process.cwd(), "recordings");
if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// chunks フォルダ（一時保存用）
const CHUNKS_DIR = path.join(process.cwd(), "chunks");
if (!fs.existsSync(CHUNKS_DIR)) {
    fs.mkdirSync(CHUNKS_DIR, { recursive: true });
}

// クラウドストレージ容量管理（例：10GB を 100% とする）
const CLOUD_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10GB
const CLOUD_STORAGE_WARNING_PERCENT = 50; // 50% で警告

// 現在の使用量を管理（簡易実装）
let currentCloudUsage = 0;

function getCloudUsagePercent() {
    return (currentCloudUsage / CLOUD_STORAGE_LIMIT_BYTES) * 100;
}

function updateCloudUsage(delta) {
    currentCloudUsage = Math.max(0, currentCloudUsage + delta);
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

function generateSessionId() {
    return (
        "session-" +
        Date.now() +
        "-" +
        Math.random().toString(36).substring(2, 8)
    );
}

// セッション管理（メモリ上）
const sessions = new Map();

const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split("?")[0]);
    console.log("Request URL:", url, "Method:", req.method);

    // CORS ヘッダー（必要に応じて）
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Id, X-Chunk-Index");

    // OPTIONS リクエスト（CORS プリフライト）
    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

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

    // チャンクアップロード受け口
    if (url === "/upload-chunk" && req.method === "POST") {
        const sessionId = req.headers["x-session-id"];
        const chunkIndex = parseInt(req.headers["x-chunk-index"] || "0");
        
        if (!sessionId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Missing session ID" }));
            return;
        }

        // クラウド容量チェック（50% 超えは拒否）
        if (getCloudUsagePercent() >= CLOUD_STORAGE_WARNING_PERCENT) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ 
                ok: false, 
                error: "Cloud storage limit exceeded (50%)",
                usagePercent: getCloudUsagePercent()
            }));
            return;
        }

        // セッション初期化
        if (!sessions.has(sessionId)) {
            sessions.set(sessionId, {
                chunks: [],
                startTime: Date.now(),
                totalBytes: 0
            });
        }

        const session = sessions.get(sessionId);
        const chunks = [];
        let receivedBytes = 0;

        req.on("data", (chunk) => {
            receivedBytes += chunk.length;
            chunks.push(chunk);
        });

        req.on("end", () => {
            const buffer = Buffer.concat(chunks);
            const chunkFilename = `${sessionId}-chunk-${chunkIndex}.dat`;
            const chunkPath = path.join(CHUNKS_DIR, chunkFilename);

            // チャンクを保存
            fs.writeFileSync(chunkPath, buffer);

            // セッション情報更新
            session.chunks.push({ index: chunkIndex, filename: chunkFilename, size: buffer.length });
            session.totalBytes += buffer.length;

            // クラウド使用量更新
            updateCloudUsage(buffer.length);

            console.log(`Chunk ${chunkIndex} saved: ${chunkFilename} (${buffer.length} bytes)`);

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                ok: true,
                chunkIndex: chunkIndex,
                size: buffer.length,
                cloudUsagePercent: getCloudUsagePercent()
            }));
        });

        req.on("error", (err) => {
            console.error("Chunk upload error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "upload failed" }));
        });

        return;
    }

    // 結合エンドポイント
    if (url === "/merge" && req.method === "POST") {
        const sessionId = req.headers["x-session-id"];
        
        if (!sessionId || !sessions.has(sessionId)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Invalid session ID" }));
            return;
        }

        const session = sessions.get(sessionId);
        const chunkFiles = session.chunks.sort((a, b) => a.index - b.index);

        // チャンクを読み込んで結合
        const buffers = chunkFiles.map(c => 
            fs.readFileSync(path.join(CHUNKS_DIR, c.filename))
        );
        const combined = Buffer.concat(buffers);

        // 1 つのファイルとして保存
        const finalFilename = `${sessionId}.webm`;
        const finalPath = path.join(RECORDINGS_DIR, finalFilename);
        fs.writeFileSync(finalPath, combined);

        // クラウド使用量更新（チャンク削除分を減算）
        updateCloudUsage(-session.totalBytes);

        // チャンクファイルを削除
        chunkFiles.forEach(c => {
            const chunkPath = path.join(CHUNKS_DIR, c.filename);
            if (fs.existsSync(chunkPath)) {
                fs.unlinkSync(chunkPath);
            }
        });

        // セッション削除
        sessions.delete(sessionId);

        console.log(`Merged: ${finalFilename} (${combined.length} bytes)`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            ok: true,
            filename: finalFilename,
            size: combined.length
        }));
        return;
    }

    // 録画データアップロード受け口（旧）
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
