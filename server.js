const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 10000;

// ================================
// ファイルを探す（直接指定＋柔軟検索）
// ================================

function findFile(fileName) {
    const cleanName = fileName.trim();
    
    // 1. まず現在地周辺を直接チェック
    const directPaths = [
        path.join(process.cwd(), cleanName),
        path.join(__dirname, cleanName),
        path.join("/opt/render/project/src", cleanName)
    ];

    for (const p of directPaths) {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            return p;
        }
    }

    // 2. フォルダ内のファイル名トリム比較
    const ROOTS = [process.cwd(), __dirname, "/opt/render/project/src"];
    for (const root of ROOTS) {
        if (!fs.existsSync(root)) continue;
        try {
            const files = fs.readdirSync(root);
            for (const file of files) {
                if (file.trim().toLowerCase() === cleanName.toLowerCase()) {
                    const fullPath = path.join(root, file);
                    if (fs.statSync(fullPath).isFile()) {
                        return fullPath;
                    }
                }
            }
        } catch (e) {}
    }

    return null;
}


// ================================
// MIMEタイプ
// ================================

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


// ================================
// ファイルを送信
// ================================

function sendFile(filePath, res) {
    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";

    res.writeHead(200, {
        "Content-Type": contentType
    });

    fs.createReadStream(filePath).pipe(res);
}


// ================================
// サーバー
// ================================

const server = http.createServer((req, res) => {

    let url = decodeURIComponent(req.url.split("?")[0]);

    console.log("Request:", url);


    // ================================
    // トップページ
    // ================================

    if (url === "/") {
        let indexFile = findFile("index.html");

        // 万が一見つからない場合の強行突破フォールバック
        if (!indexFile) {
            const fallbackPath = path.join(process.cwd(), "index.html");
            if (fs.existsSync(fallbackPath)) {
                indexFile = fallbackPath;
            }
        }

        if (!indexFile) {
            res.writeHead(500, {
                "Content-Type": "text/plain; charset=UTF-8"
            });
            res.end("index.html が見つかりません。");
            return;
        }

        console.log("index.html found:", indexFile);
        sendFile(indexFile, res);
        return;
    }


    // ================================
    // faviconなど
    // ================================

    if (url === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
    }


    // ================================
    // URLからファイル名を取得
    // ================================

    const fileName = path.basename(url);
    const filePath = findFile(fileName);

    if (!filePath) {
        res.writeHead(404, {
            "Content-Type": "text/plain; charset=UTF-8"
        });
        res.end("File Not Found: " + fileName);
        return;
    }

    console.log("File:", filePath);
    sendFile(filePath, res);
});


// ================================
// Render用サーバー起動
// ================================

server.listen(PORT, "0.0.0.0", () => {
    console.log("================================");
    console.log("Screen App Server Started");
    console.log("Port:", PORT);
    console.log("================================");
});
