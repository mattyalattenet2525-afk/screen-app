const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 10000;

const ROOT = __dirname;

// ファイルを再帰的に探す
function findFile(dir, targetName) {
    try {
        const items = fs.readdirSync(dir, {
            withFileTypes: true
        });

        for (const item of items) {

            // node_modulesなどは検索しない
            if (
                item.name === "node_modules" ||
                item.name === ".git"
            ) {
                continue;
            }

            const fullPath =
                path.join(dir, item.name);

            if (item.isFile()) {

                if (
                    item.name.toLowerCase() ===
                    targetName.toLowerCase()
                ) {
                    return fullPath;
                }

            } else if (item.isDirectory()) {

                const result =
                    findFile(fullPath, targetName);

                if (result) {
                    return result;
                }
            }
        }

    } catch (error) {
        return null;
    }

    return null;
}


// MIMEタイプ
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


// HTTPサーバー
const server = http.createServer((req, res) => {

    let requestedPath =
        decodeURIComponent(
            req.url.split("?")[0]
        );

    console.log(
        "Request:",
        requestedPath
    );


    // トップページ
    if (requestedPath === "/") {

        const indexFile =
            findFile(ROOT, "index.html");

        if (!indexFile) {

            res.writeHead(404, {
                "Content-Type":
                    "text/plain; charset=UTF-8"
            });

            res.end(
                "index.html が見つかりません。"
            );

            return;
        }

        sendFile(indexFile, res);

        return;
    }


    // URLからファイル名を取得
    const fileName =
        path.basename(requestedPath);


    // GitHub内を再帰的に検索
    const filePath =
        findFile(ROOT, fileName);


    if (!filePath) {

        res.writeHead(404, {
            "Content-Type":
                "text/plain; charset=UTF-8"
        });

        res.end(
            "File Not Found: " + fileName
        );

        return;
    }


    sendFile(filePath, res);
});


// ファイルをブラウザへ送信
function sendFile(filePath, res) {

    const extension =
        path.extname(filePath).toLowerCase();

    const contentType =
        MIME_TYPES[extension] ||
        "application/octet-stream";


    res.writeHead(200, {
        "Content-Type": contentType
    });


    fs.createReadStream(filePath)
        .pipe(res);
}


// Renderで使用するポート
server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "================================"
        );

        console.log(
            "Screen App Server Started"
        );

        console.log(
            "Port:",
            PORT
        );

        console.log(
            "Root:",
            ROOT
        );

        console.log(
            "================================"
        );
    }
);
