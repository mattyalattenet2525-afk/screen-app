const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 10000;

// ============================================================
// 基本ディレクトリ
// ============================================================

const APP_DIR = __dirname;
const PROJECT_DIR = process.cwd();

const RECORDINGS_DIR = path.join(APP_DIR, "recordings");
const CHUNKS_DIR = path.join(APP_DIR, "chunks");

// ============================================================
// サイズ制限
// ============================================================

const MAX_CHUNK_SIZE_BYTES = 1024 * 1024 * 1024;       // 1GB
const MAX_TOTAL_SESSION_SIZE_BYTES = 20 * 1024 * 1024 * 1024; // 20GB

// ============================================================
// MIME
// ============================================================

const MIME_TYPES = {
    ".html": "text/html; charset=UTF-8",
    ".css": "text/css; charset=UTF-8",
    ".js": "application/javascript; charset=UTF-8",
    ".mjs": "application/javascript; charset=UTF-8",
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
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",

    ".txt": "text/plain; charset=UTF-8"
};

// ============================================================
// セッション
// ============================================================

const sessions = new Map();

// ============================================================
// ディレクトリ作成
// ============================================================

function ensureDirectory(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, {
            recursive: true
        });
    }
}

ensureDirectory(RECORDINGS_DIR);
ensureDirectory(CHUNKS_DIR);

// ============================================================
// ファイルサイズ表示
// ============================================================

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

// ============================================================
// レスポンス
// ============================================================

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

function sendJson(res, statusCode, data) {
    setCommonHeaders(res);

    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=UTF-8"
    });

    res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text) {
    setCommonHeaders(res);

    res.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=UTF-8"
    });

    res.end(text);
}

// ============================================================
// 安全なパス判定
// ============================================================

function isSafeRelativePath(relativePath) {
    if (typeof relativePath !== "string") {
        return false;
    }

    if (relativePath.includes("\0")) {
        return false;
    }

    const normalized = path.normalize(relativePath);

    if (normalized.startsWith("..")) {
        return false;
    }

    if (path.isAbsolute(normalized)) {
        return false;
    }

    return true;
}

// ============================================================
// index.html 自動探索
// ============================================================

function findIndexFile() {

    // 優先的に調べる場所
    const priorityPaths = [
        path.join(APP_DIR, "index.html"),
        path.join(APP_DIR, "public", "index.html"),

        path.join(PROJECT_DIR, "index.html"),
        path.join(PROJECT_DIR, "public", "index.html")
    ];

    for (const filePath of priorityPaths) {
        try {
            if (
                fs.existsSync(filePath) &&
                fs.statSync(filePath).isFile()
            ) {
                console.log(
                    "[INDEX] Found index.html:",
                    filePath
                );

                return filePath;
            }
        } catch (error) {
            console.error(
                "[INDEX] Check error:",
                filePath,
                error.message
            );
        }
    }

    // --------------------------------------------------------
    // 再帰探索
    // --------------------------------------------------------

    const searchRoots = [
        APP_DIR,
        PROJECT_DIR
    ];

    const ignoredDirectories = new Set([
        "node_modules",
        ".git",
        ".cache",
        ".npm",
        "recordings",
        "chunks"
    ]);

    const visited = new Set();

    function searchDirectory(directory) {

        if (visited.has(directory)) {
            return null;
        }

        visited.add(directory);

        let entries;

        try {
            entries = fs.readdirSync(directory, {
                withFileTypes: true
            });
        } catch (error) {
            return null;
        }

        // まずその階層のindex.htmlを確認
        for (const entry of entries) {

            if (
                entry.isFile() &&
                entry.name.toLowerCase() === "index.html"
            ) {
                return path.join(
                    directory,
                    entry.name
                );
            }
        }

        // その後サブフォルダを探索
        for (const entry of entries) {

            if (!entry.isDirectory()) {
                continue;
            }

            if (ignoredDirectories.has(entry.name)) {
                continue;
            }

            const result = searchDirectory(
                path.join(directory, entry.name)
            );

            if (result) {
                return result;
            }
        }

        return null;
    }

    for (const root of searchRoots) {

        const result = searchDirectory(root);

        if (result) {

            console.log(
                "[INDEX] Found index.html by recursive search:",
                result
            );

            return result;
        }
    }

    return null;
}

// ============================================================
// index.html の場所を取得
// ============================================================

function getIndexPath() {
    return findIndexFile();
}

// ============================================================
// 静的ファイルのルートを決定
// ============================================================

function getStaticRoot() {

    const indexPath = getIndexPath();

    if (!indexPath) {
        return null;
    }

    return path.dirname(indexPath);
}

// ============================================================
// ルートページ
// ============================================================

function serveRootPage(res) {

    const indexPath = getIndexPath();

    console.log(
        "[ROOT] index.html:",
        indexPath || "NOT FOUND"
    );

    if (!indexPath) {

        sendText(
            res,
            500,
            [
                "エラー: index.html が見つかりません。",
                "",
                `server.js の場所: ${APP_DIR}`,
                `process.cwd(): ${PROJECT_DIR}`,
                "",
                "自動探索した結果、index.html が見つかりませんでした。",
                "",
                "GitHubのプロジェクト内に index.html が存在するか確認してください。",
                "",
                "デバッグ情報:",
                "/debug-files"
            ].join("\n")
        );

        return;
    }

    setCommonHeaders(res);

    res.writeHead(200, {
        "Content-Type": "text/html; charset=UTF-8"
    });

    fs.createReadStream(indexPath).pipe(res);
}

// ============================================================
// 静的ファイル
// ============================================================

function serveStaticFile(urlPath, res) {

    const staticRoot = getStaticRoot();

    if (!staticRoot) {
        sendText(
            res,
            500,
            "index.html が見つからないため静的ファイルを提供できません。"
        );

        return;
    }

    // URLデコード
    let decodedPath;

    try {
        decodedPath = decodeURIComponent(urlPath);
    } catch (error) {
        sendText(res, 400, "Bad Request");
        return;
    }

    // / を除去
    decodedPath = decodedPath.replace(/^\/+/, "");

    if (!decodedPath) {
        serveRootPage(res);
        return;
    }

    if (!isSafeRelativePath(decodedPath)) {
        sendText(res, 403, "Forbidden");
        return;
    }

    const filePath = path.resolve(
        staticRoot,
        decodedPath
    );

    const rootResolved = path.resolve(
        staticRoot
    );

    // staticRootより外に出ていないことを確認
    if (
        filePath !== rootResolved &&
        !filePath.startsWith(rootResolved + path.sep)
    ) {
        sendText(res, 403, "Forbidden");
        return;
    }

    console.log(
        "[STATIC]",
        decodedPath,
        "=>",
        filePath
    );

    if (
        !fs.existsSync(filePath) ||
        !fs.statSync(filePath).isFile()
    ) {
        sendText(
            res,
            404,
            `File Not Found: ${decodedPath}`
        );

        return;
    }

    const extension = path
        .extname(filePath)
        .toLowerCase();

    const contentType =
        MIME_TYPES[extension] ||
        "application/octet-stream";

    setCommonHeaders(res);

    res.writeHead(200, {
        "Content-Type": contentType
    });

    fs.createReadStream(filePath).pipe(res);
}

// ============================================================
// デバッグ情報
// ============================================================

function handleDebugFiles(res) {

    const indexPath = getIndexPath();
    const staticRoot = getStaticRoot();

    let appFiles = [];
    let projectFiles = [];

    try {
        appFiles = fs.readdirSync(APP_DIR);
    } catch (error) {
        appFiles = [
            `APP_DIR読み込み失敗: ${error.message}`
        ];
    }

    try {
        projectFiles = fs.readdirSync(PROJECT_DIR);
    } catch (error) {
        projectFiles = [
            `PROJECT_DIR読み込み失敗: ${error.message}`
        ];
    }

    sendJson(res, 200, {

        ok: true,

        server: {
            appDirectory: APP_DIR,
            processCwd: PROJECT_DIR,
            port: PORT
        },

        index: {
            found: !!indexPath,
            path: indexPath,
            staticRoot: staticRoot
        },

        directories: {
            recordings: RECORDINGS_DIR,
            chunks: CHUNKS_DIR
        },

        files: {
            appDirectory: appFiles,
            projectDirectory: projectFiles
        },

        sessions: {
            active: sessions.size
        }
    });
}

// ============================================================
// セッションディレクトリ
// ============================================================

function getSessionDirectory(sessionId) {
    return path.join(
        CHUNKS_DIR,
        sessionId
    );
}

// ============================================================
// ディレクトリ削除
// ============================================================

function deleteDirectoryRecursively(directoryPath) {

    if (fs.existsSync(directoryPath)) {

        fs.rmSync(directoryPath, {
            recursive: true,
            force: true
        });
    }
}

// ============================================================
// ファイル名安全確認
// ============================================================

function isSafeFileName(fileName) {

    return (
        typeof fileName === "string" &&
        fileName.length > 0 &&
        !fileName.includes("..") &&
        !fileName.includes("/") &&
        !fileName.includes("\\") &&
        !fileName.includes("\0")
    );
}

// ============================================================
// チャンクアップロード
// ============================================================

function handleUploadChunk(req, res) {

    const sessionId =
        req.headers["x-session-id"];

    const chunkIndex =
        Number(req.headers["x-chunk-index"]);

    if (
        !sessionId ||
        !isSafeFileName(sessionId) ||
        !Number.isInteger(chunkIndex) ||
        chunkIndex < 0
    ) {

        sendJson(res, 400, {
            ok: false,
            error:
                "セッションIDまたはチャンク番号が正しくありません。"
        });

        return;
    }

    if (!sessions.has(sessionId)) {

        const sessionDirectory =
            getSessionDirectory(sessionId);

        ensureDirectory(sessionDirectory);

        sessions.set(sessionId, {

            sessionId,

            createdAt: Date.now(),

            totalBytes: 0,

            chunks: new Map()
        });
    }

    const session =
        sessions.get(sessionId);

    if (session.chunks.has(chunkIndex)) {

        sendJson(res, 409, {
            ok: false,
            error:
                "同じチャンク番号がすでに保存されています。"
        });

        return;
    }

    const sessionDirectory =
        getSessionDirectory(sessionId);

    const chunkFileName =
        `${String(chunkIndex).padStart(8, "0")}.webm.part`;

    const chunkPath =
        path.join(
            sessionDirectory,
            chunkFileName
        );

    const writeStream =
        fs.createWriteStream(chunkPath);

    let receivedBytes = 0;
    let aborted = false;

    req.on("data", (data) => {

        receivedBytes += data.length;

        if (
            receivedBytes > MAX_CHUNK_SIZE_BYTES ||
            session.totalBytes + receivedBytes >
            MAX_TOTAL_SESSION_SIZE_BYTES
        ) {

            aborted = true;

            req.destroy(
                new Error(
                    "Chunk or session size limit exceeded"
                )
            );
        }
    });

    req.on("aborted", () => {
        aborted = true;
    });

    req.on("error", (error) => {

        console.error(
            "[UPLOAD] Request error:",
            error.message
        );
    });

    writeStream.on("error", (error) => {

        console.error(
            "[UPLOAD] Write error:",
            error.message
        );

        if (!res.headersSent) {

            sendJson(res, 500, {
                ok: false,
                error:
                    "チャンクファイルの保存に失敗しました。"
            });
        }
    });

    writeStream.on("finish", () => {

        if (aborted) {

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
                error:
                    "空の録画チャンクは保存できません。"
            });

            return;
        }

        session.chunks.set(
            chunkIndex,
            {
                index: chunkIndex,
                fileName: chunkFileName,
                size: receivedBytes
            }
        );

        session.totalBytes += receivedBytes;

        console.log(
            `[UPLOAD] session=${sessionId} ` +
            `chunk=${chunkIndex} ` +
            `size=${getReadableFileSize(receivedBytes)}`
        );

        sendJson(res, 200, {

            ok: true,

            sessionId,

            chunkIndex,

            size: receivedBytes,

            totalBytes:
                session.totalBytes,

            chunkCount:
                session.chunks.size
        });
    });

    req.pipe(writeStream);
}

// ============================================================
// チャンク結合
// ============================================================

function handleMerge(req, res) {

    const sessionId =
        req.headers["x-session-id"];

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

    const session =
        sessions.get(sessionId);

    const chunks =
        Array.from(
            session.chunks.values()
        ).sort(
            (a, b) =>
                a.index - b.index
        );

    if (chunks.length === 0) {

        sendJson(res, 400, {
            ok: false,
            error:
                "結合する録画チャンクがありません。"
        });

        return;
    }

    const finalFileName =
        `${sessionId}.webm`;

    const finalFilePath =
        path.join(
            RECORDINGS_DIR,
            finalFileName
        );

    const outputStream =
        fs.createWriteStream(
            finalFilePath
        );

    let current = 0;
    let totalBytes = 0;
    let failed = false;

    function failMerge(error) {

        if (failed) {
            return;
        }

        failed = true;

        console.error(
            "[MERGE] Error:",
            error
        );

        if (fs.existsSync(finalFilePath)) {

            fs.unlinkSync(
                finalFilePath
            );
        }

        if (!res.headersSent) {

            sendJson(res, 500, {
                ok: false,
                error:
                    "録画データの結合に失敗しました。"
            });
        }
    }

    function pipeNextChunk() {

        if (current >= chunks.length) {

            outputStream.end();

            return;
        }

        const chunk =
            chunks[current];

        const chunkPath =
            path.join(
                getSessionDirectory(sessionId),
                chunk.fileName
            );

        if (!fs.existsSync(chunkPath)) {

            failMerge(
                new Error(
                    `チャンクがありません: ${chunk.fileName}`
                )
            );

            return;
        }

        const inputStream =
            fs.createReadStream(
                chunkPath
            );

        inputStream.on(
            "data",
            (data) => {
                totalBytes += data.length;
            }
        );

        inputStream.on(
            "error",
            failMerge
        );

        inputStream.on(
            "end",
            () => {

                current++;

                pipeNextChunk();
            }
        );

        inputStream.pipe(
            outputStream,
            {
                end: false
            }
        );
    }

    outputStream.on(
        "error",
        failMerge
    );

    outputStream.on(
        "finish",
        () => {

            if (failed) {
                return;
            }

            deleteDirectoryRecursively(
                getSessionDirectory(sessionId)
            );

            sessions.delete(
                sessionId
            );

            console.log(
                `[MERGE] session=${sessionId} ` +
                `file=${finalFileName} ` +
                `size=${getReadableFileSize(totalBytes)}`
            );

            sendJson(res, 200, {

                ok: true,

                filename:
                    finalFileName,

                size:
                    totalBytes,

                downloadUrl:
                    `/recordings/${encodeURIComponent(finalFileName)}`
            });
        }
    );

    pipeNextChunk();
}

// ============================================================
// 録画ファイル配信
// ============================================================

function serveRecording(
    urlPath,
    res
) {

    let fileName;

    try {

        fileName =
            path.basename(
                decodeURIComponent(
                    urlPath
                )
            );

    } catch (error) {

        sendText(
            res,
            400,
            "Bad Request"
        );

        return;
    }

    if (
        !isSafeFileName(fileName) ||
        !fileName.endsWith(".webm")
    ) {

        sendText(
            res,
            403,
            "Forbidden"
        );

        return;
    }

    const filePath =
        path.join(
            RECORDINGS_DIR,
            fileName
        );

    if (
        !fs.existsSync(filePath) ||
        !fs.statSync(filePath).isFile()
    ) {

        sendText(
            res,
            404,
            "Recording Not Found"
        );

        return;
    }

    setCommonHeaders(res);

    res.writeHead(200, {

        "Content-Type":
            "video/webm",

        "Content-Disposition":
            `inline; filename="${fileName}"`
    });

    fs.createReadStream(
        filePath
    ).pipe(res);
}

// ============================================================
// HTTPサーバー
// ============================================================

const server =
    http.createServer(
        (req, res) => {

            setCommonHeaders(res);

            let urlPath;

            try {

                urlPath =
                    decodeURIComponent(
                        req.url.split("?")[0]
                    );

            } catch (error) {

                sendText(
                    res,
                    400,
                    "Bad Request"
                );

                return;
            }

            console.log(
                `[REQUEST] ${req.method} ${urlPath}`
            );

            // ------------------------------------------------
            // OPTIONS
            // ------------------------------------------------

            if (
                req.method === "OPTIONS"
            ) {

                res.writeHead(
                    204,
                    {
                        "Access-Control-Allow-Methods":
                            "GET, POST, OPTIONS",

                        "Access-Control-Allow-Headers":
                            "Content-Type, X-Session-Id, X-Chunk-Index",

                        "Permissions-Policy":
                            "display-capture=(self)"
                    }
                );

                res.end();

                return;
            }

            // ------------------------------------------------
            // トップページ
            // ------------------------------------------------

            if (
                urlPath === "/" &&
                req.method === "GET"
            ) {

                serveRootPage(res);

                return;
            }

            // ------------------------------------------------
            // デバッグ
            // ------------------------------------------------

            if (
                urlPath === "/debug-files" &&
                req.method === "GET"
            ) {

                handleDebugFiles(res);

                return;
            }

            // ------------------------------------------------
            // チャンクアップロード
            // ------------------------------------------------

            if (
                urlPath === "/upload-chunk" &&
                req.method === "POST"
            ) {

                handleUploadChunk(
                    req,
                    res
                );

                return;
            }

            // ------------------------------------------------
            // 録画結合
            // ------------------------------------------------

            if (
                urlPath === "/merge" &&
                req.method === "POST"
            ) {

                handleMerge(
                    req,
                    res
                );

                return;
            }

            // ------------------------------------------------
            // 録画ファイル
            // ------------------------------------------------

            if (
                urlPath.startsWith(
                    "/recordings/"
                ) &&
                req.method === "GET"
            ) {

                serveRecording(
                    urlPath.replace(
                        "/recordings/",
                        ""
                    ),
                    res
                );

                return;
            }

            // ------------------------------------------------
            // 静的ファイル
            // ------------------------------------------------

            if (
                req.method === "GET"
            ) {

                serveStaticFile(
                    urlPath,
                    res
                );

                return;
            }

            // ------------------------------------------------
            // その他
            // ------------------------------------------------

            sendText(
                res,
                405,
                "Method Not Allowed"
            );
        }
    );

// ============================================================
// サーバー起動
// ============================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "========================================"
        );

        console.log(
            "Screen App Server Started"
        );

        console.log(
            "========================================"
        );

        console.log(
            "Port:",
            PORT
        );

        console.log(
            "server.js directory:",
            APP_DIR
        );

        console.log(
            "process.cwd():",
            PROJECT_DIR
        );

        const indexPath =
            getIndexPath();

        console.log(
            "index.html:",
            indexPath || "NOT FOUND"
        );

        console.log(
            "static root:",
            getStaticRoot() || "NOT FOUND"
        );

        console.log(
            "recordings:",
            RECORDINGS_DIR
        );

        console.log(
            "chunks:",
            CHUNKS_DIR
        );

        console.log(
            "========================================"
        );
    }
);
