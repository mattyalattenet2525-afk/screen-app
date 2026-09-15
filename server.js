const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 10000;

// Renderで実際にアプリが起動している場所
const ROOTS = [
    process.cwd(),
    __dirname,
    "/opt/render/project/src"
];


// ================================
// ファイルを探す
// ================================

function findFile(fileName) {

    for (const root of ROOTS) {

        const directPath =
            path.join(root, fileName);

        if (
            fs.existsSync(directPath) &&
            fs.statSync(directPath).isFile()
        ) {
            return directPath;
        }
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

    const extension =
        path.extname(filePath).toLowerCase();

    const contentType =
        MIME_TYPES[extension] ||
        "application/octet-stream";

    res.writeHead(200, {
        "Content-Type": contentType
    });

    fs.createReadStream(filePath).pipe(res);
}


// ================================
// サーバー
// ================================

const server = http.createServer((req, res) => {

    let url =
        decodeURIComponent(
            req.url.split("?")[0]
        );

    console.log("Request:", url);


    // ================================
    // トップページ
    // ================================

    if (url === "/") {

        const indexFile =
            findFile("index.html");

        if (!indexFile) {

            res.writeHead(500, {
                "Content-Type":
                    "text/plain; charset=UTF-8"
            });

            res.end(
                "index.html が見つかりません。\n\n" +
                "process.cwd(): " +
                process.cwd() +
                "\n\n" +
                "__dirname: " +
                __dirname
            );

            return;
        }

        console.log(
            "index.html:",
            indexFile
        );

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

    const fileName =
        path.basename(url);


    const filePath =
        findFile(fileName);


    if (!filePath) {

        res.writeHead(404, {
            "Content-Type":
                "text/plain; charset=UTF-8"
        });

        res.end(
            "File Not Found: " +
            fileName
        );

        return;
    }


    console.log(
        "File:",
        filePath
    );

    sendFile(filePath, res);
});


// ================================
// Render用サーバー起動
// ================================

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
            "process.cwd():",
            process.cwd()
        );

        console.log(
            "__dirname:",
            __dirname
        );

        console.log(
            "================================"
        );
    }
);
