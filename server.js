const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 10000;

// ================================
// ファイルを探す（柔軟検索版）
// ================================

function findFile(fileName) {
    const ROOTS = [
        process.cwd(),
        __dirname,
        path.join(process.cwd(), "src"),
        path.join(__dirname, "src"),
        "/opt/render/project/src",
        "/opt/render/project/src/src"
    ];

    const targetName = fileName.toLowerCase();

    for (const root of ROOTS) {
        if (!fs.existsSync(root)) continue;

        try {
            const files = fs.readdirSync(root);
            for (const file of files) {
                if (file.toLowerCase() === targetName) {
                    const fullPath = path.join(root, file);
                    if (fs.statSync(fullPath).isFile()) {
                        return fullPath;
                    }
                }
            }
        } catch (e) {
            // 読み込みエラーはスキップ
        }
    }

    // 再帰的検索
    for (const root of ROOTS) {
        if (fs.existsSync(root)) {
            const found = searchRecursive(root, targetName);
            if (found) return found;
        }
    }

    return null;
}

function searchRecursive(dir, targetName) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === "node_modules" || entry.name === ".git") continue;
                const result = searchRecursive(fullPath, targetName);
                if (result) return result;
            } else if (entry.name.toLowerCase() === targetName) {
                return fullPath;
            }
        }
    } catch (e) {
        // エラー無視
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
        const indexFile = findFile("index.html");

        if (!indexFile) {
            res.writeHead(500, {
                "Content-Type": "text/plain; charset=UTF-8"
            });

            res.end("index.html が見つかりません。");
            return;
        }

        console.log("index.html:", indexFile);
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
