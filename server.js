const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 10000;

const MIME_TYPES = {
    ".html": "text/html; charset=UTF-8",
    ".css": "text/css; charset=UTF-8",
    ".js": "application/javascript; charset=UTF-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {

    let requestedPath = decodeURIComponent(
        req.url.split("?")[0]
    );

    // "/" にアクセスされたら index.html
    if (requestedPath === "/") {
        requestedPath = "/index.html";
    }

    const filePath = path.join(
        __dirname,
        requestedPath
    );

    // ファイルが存在するか確認
    fs.stat(filePath, (error, stats) => {

        if (error || !stats.isFile()) {

            res.writeHead(404, {
                "Content-Type": "text/plain; charset=UTF-8"
            });

            res.end("Not Found");

            return;
        }

        const extension =
            path.extname(filePath).toLowerCase();

        const contentType =
            MIME_TYPES[extension] ||
            "application/octet-stream";

        res.writeHead(200, {
            "Content-Type": contentType
        });

        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Server started on port ${PORT}`
        );
    }
);
