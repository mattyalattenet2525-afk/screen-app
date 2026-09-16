const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 10000;

const ROOT_DIR = process.cwd();
const RECORDINGS_DIR = path.join(ROOT_DIR, "recordings");
const CHUNKS_DIR = path.join(ROOT_DIR, "chunks");

const MAX_CHUNK_SIZE_BYTES = 1024 * 1024 * 1024;
const MAX_TOTAL_SESSION_SIZE_BYTES = 20 * 1024 * 1024 * 1024;

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

const sessions = new Map();

function ensureDirectory(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, {
            recursive: true
        });
    }
}

ensureDirectory(RECORDINGS_DIR);
ensureDirectory(CHUNKS_DIR);

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=UTF-8",
        "Permissions-Policy": "display-capture=(self)"
    });

    res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text) {
    res.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=UTF-8",
        "Permissions-Policy": "display-capture=(self)"
    });

    res.end(text);
}

function setCommonHeaders(res) {
    res.setHeader(
        "Permissions-Policy",
        "display-capture=(self)"
    );

    res.setHeader(
        "X-Content-Type-Options",
        "nosniff"
    );
}

function isSafeFileName(fileName) {
    return (
        typeof fileName === "string" &&
        !fileName.includes("..") &&
        !fileName.includes("/") &&
        !fileName.includes("\\")
    );
}

function getSessionDirectory(sessionId) {
    return path.join(CHUNKS_DIR, sessionId);
}

function deleteDirectoryRecursively(directoryPath) {
    if (fs.existsSync(directoryPath)) {
        fs.rmSync(directoryPath, {
            recursive: true,
            force: true
        });
    }
}

function getReadableFileSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} bytes`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(2)} KB`;
    }

    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    }

    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function serveRootPage(res) {
    const indexPath = path.join(ROOT_DIR, "index.html");

    if (!fs.existsSync(indexPath)) {
        sendText(
            res,
            500,
            "エラー: index.html が見つかりません。"
        );
        return;
    }

    res.writeHead(200, {
        "Content-Type": "text/html; charset=UTF-8",
        "Permissions-Policy": "display-capture=(self)",
        "X-Content-Type-Options": "nosniff"
    });

    fs.createReadStream(indexPath).pipe(res);
}

function serveStaticFile(urlPath, res) {
    const requestedName = path.basename(urlPath);

    if (!isSafeFileName(requestedName)) {
        sendText(res, 403, "Forbidden");
        return;
    }

    const filePath = path.join(ROOT_DIR, requestedName);

    if (
        !fs.existsSync(filePath) ||
        !fs.statSync(filePath).isFile()
    ) {
        sendText(
            res,
            404,
            `File Not Found: ${requestedName}`
        );
        return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType =
        MIME_TYPES[extension] || "application/octet-stream";

    res.writeHead(200, {
        "Content-Type": contentType,
        "Permissions-Policy": "display-capture=(self)",
        "X-Content-Type-Options": "nosniff"
    });

    fs.createReadStream(filePath).pipe(res);
}

function handleUploadChunk(req, res) {
    const sessionId = req.headers["x-session-id"];
    const chunkIndexText = req.headers["x-chunk-index"];
    const chunkIndex = Number(chunkIndexText);

    if (
        !sessionId ||
        !isSafeFileName(sessionId) ||
        !Number.isInteger(chunkIndex) ||
        chunkIndex < 0
    ) {
        sendJson(res, 400, {
            ok: false,
            error: "セッションIDまたはチャンク番号が正しくありません。"
        });
        return;
    }

    if (!sessions.has(sessionId)) {
        const sessionDirectory = getSessionDirectory(sessionId);

        ensureDirectory(sessionDirectory);

        sessions.set(sessionId, {
            sessionId,
            createdAt: Date.now(),
            totalBytes: 0,
            chunks: new Map()
        });
    }

    const session = sessions.get(sessionId);

    if (session.chunks.has(chunkIndex)) {
        sendJson(res, 409, {
            ok: false,
            error: "同じチャンク番号がすでに保存されています。"
        });
        return;
    }

    const sessionDirectory = getSessionDirectory(sessionId);
    const chunkFileName = `${String(chunkIndex).padStart(8, "0")}.webm.part`;
    const chunkPath = path.join(sessionDirectory, chunkFileName);

    const writeStream = fs.createWriteStream(chunkPath);

    let receivedBytes = 0;
    let requestAborted = false;

    req.on("data", (data) => {
        receivedBytes += data.length;

        if (
            receivedBytes > MAX_CHUNK_SIZE_BYTES ||
            session.totalBytes + receivedBytes >
                MAX_TOTAL_SESSION_SIZE_BYTES
        ) {
            requestAborted = true;

            req.destroy(
                new Error("Chunk or session size limit exceeded")
            );
        }
    });

    req.on("aborted", () => {
        requestAborted = true;
    });

    req.on("error", (error) => {
        console.error("アップロード受信エラー:", error.message);
    });

    writeStream.on("error", (error) => {
        console.error("チャンク書き込みエラー:", error.message);

        if (!res.headersSent) {
            sendJson(res, 500, {
                ok: false,
                error: "チャンクファイルの保存に失敗しました。"
            });
        }
    });

    writeStream.on("finish", () => {
        if (requestAborted) {
            if (fs.existsSync(chunkPath)) {
                fs.unlinkSync(chunkPath);
            }

            if (!res.headersSent) {
                sendJson(res, 413, {
                    ok: false,
                    error:
                        "チャンクまたは録画全体のサイズが上限を超えました。"
                });
            }

            return;
        }

        if (receivedBytes === 0) {
            if (fs.existsSync(chunkPath)) {
                fs.unlinkSync(chunkPath);
            }

            sendJson(res, 400, {
                ok: false,
                error: "空の録画チャンクは保存できません。"
            });

            return;
        }

        session.chunks.set(chunkIndex, {
            index: chunkIndex,
            fileName: chunkFileName,
            size: receivedBytes
        });

        session.totalBytes += receivedBytes;

        console.log(
            `[UPLOAD] session=${sessionId} chunk=${chunkIndex} size=${getReadableFileSize(receivedBytes)} total=${getReadableFileSize(session.totalBytes)}`
        );

        sendJson(res, 200, {
            ok: true,
            sessionId,
            chunkIndex,
            size: receivedBytes,
            totalBytes: session.totalBytes,
            chunkCount: session.chunks.size
        });
    });

    req.pipe(writeStream);
}

function handleMerge(req, res) {
    const sessionId = req.headers["x-session-id"];

    if (
        !sessionId ||
        !isSafeFileName(sessionId) ||
        !sessions.has(sessionId)
    ) {
        sendJson(res, 400, {
            ok: false,
            error:
                "結合対象の録画セッションが見つかりません。"
        });

        return;
    }

    const session = sessions.get(sessionId);

    const chunkList = Array.from(session.chunks.values())
        .sort((a, b) => a.index - b.index);

    if (chunkList.length === 0) {
        sendJson(res, 400, {
            ok: false,
            error: "結合する録画チャンクがありません。"
        });

        return;
    }

    const finalFileName = `${sessionId}.webm`;
    const finalFilePath = path.join(
        RECORDINGS_DIR,
        finalFileName
    );

    const outputStream = fs.createWriteStream(finalFilePath);

    let currentIndex = 0;
    let totalMergedBytes = 0;
    let finished = false;

    function failMerge(error) {
        console.error("結合エラー:", error);

        if (fs.existsSync(finalFilePath)) {
            fs.unlinkSync(finalFilePath);
        }

        if (!res.headersSent) {
            sendJson(res, 500, {
                ok: false,
                error: "録画データの結合に失敗しました。"
            });
        }
    }

    function pipeNextChunk() {
        if (currentIndex >= chunkList.length) {
            outputStream.end();
            return;
        }

        const chunk = chunkList[currentIndex];
        const chunkPath = path.join(
            getSessionDirectory(sessionId),
            chunk.fileName
        );

        if (!fs.existsSync(chunkPath)) {
            failMerge(
                new Error(
                    `チャンクが見つかりません: ${chunk.fileName}`
                )
            );

            return;
        }

        const inputStream = fs.createReadStream(chunkPath);

        inputStream.on("data", (buffer) => {
            totalMergedBytes += buffer.length;
        });

        inputStream.on("error", failMerge);

        inputStream.on("end", () => {
            currentIndex += 1;
            pipeNextChunk();
        });

        inputStream.pipe(outputStream, {
            end: false
        });
    }

    outputStream.on("error", failMerge);

    outputStream.on("finish", () => {
        if (finished) {
            return;
        }

        finished = true;

        deleteDirectoryRecursively(
            getSessionDirectory(sessionId)
        );

        sessions.delete(sessionId);

        console.log(
            `[MERGE] session=${sessionId} file=${finalFileName} size=${getReadableFileSize(totalMergedBytes)}`
        );

        sendJson(res, 200, {
            ok: true,
            filename: finalFileName,
            size: totalMergedBytes,
            downloadUrl: `/recordings/${encodeURIComponent(finalFileName)}`
        });
    });

    pipeNextChunk();
}

function serveRecording(urlPath, res) {
    const requestedName = path.basename(
        decodeURIComponent(urlPath)
    );

    if (
        !isSafeFileName(requestedName) ||
        !requestedName.endsWith(".webm")
    ) {
        sendText(res, 403, "Forbidden");
        return;
    }

    const filePath = path.join(
        RECORDINGS_DIR,
        requestedName
    );

    if (!fs.existsSync(filePath)) {
        sendText(res, 404, "Recording Not Found");
        return;
    }

    res.writeHead(200, {
        "Content-Type": "video/webm",
        "Content-Disposition":
            `inline; filename="${requestedName}"`,
        "Permissions-Policy": "display-capture=(self)",
        "X-Content-Type-Options": "nosniff"
    });

    fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
    setCommonHeaders(res);

    const urlPath = decodeURIComponent(
        req.url.split("?")[0]
    );

    console.log(
        `[REQUEST] ${req.method} ${urlPath}`
    );

    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Methods":
                "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers":
                "Content-Type, X-Session-Id, X-Chunk-Index",
            "Permissions-Policy": "display-capture=(self)"
        });

        res.end();
        return;
    }

    if (urlPath === "/" && req.method === "GET") {
        serveRootPage(res);
        return;
    }

    if (
        urlPath === "/upload-chunk" &&
        req.method === "POST"
    ) {
        handleUploadChunk(req, res);
        return;
    }

    if (
        urlPath === "/merge" &&
        req.method === "POST"
    ) {
        handleMerge(req, res);
        return;
    }

    if (
        urlPath.startsWith("/recordings/") &&
        req.method === "GET"
    ) {
        const filePart = urlPath.replace(
            "/recordings/",
            ""
        );

        serveRecording(filePart, res);
        return;
    }

    if (req.method === "GET") {
        serveStaticFile(urlPath, res);
        return;
    }

    sendText(res, 405, "Method Not Allowed");
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("================================");
    console.log(`Server running on port: ${PORT}`);
    console.log(`Working Directory: ${ROOT_DIR}`);
    console.log(`Recordings directory: ${RECORDINGS_DIR}`);
    console.log(`Chunks directory: ${CHUNKS_DIR}`);
    console.log("================================");
});
