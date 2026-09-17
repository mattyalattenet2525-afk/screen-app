import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");
const mergedDir = path.join(__dirname, "merged");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(mergedDir)) {
    fs.mkdirSync(mergedDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const sessionId = req.headers["x-session-id"] || "default";
        const sessionDir = path.join(uploadDir, sessionId);

        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        cb(null, sessionDir);
    },
    filename: (req, file, cb) => {
        const chunkIndex = req.headers["x-chunk-index"] || "0";
        const timestamp = Date.now();
        const ext = path.extname(file.originalname) || ".webm";

        cb(null, `chunk-${chunkIndex}-${timestamp}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

app.post("/upload", upload.single("chunk"), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                ok: false,
                error: "ファイルがアップロードされていません"
            });
        }

        res.json({
            ok: true,
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size
        });

    } catch (error) {
        console.error("アップロードエラー:", error);

        res.status(500).json({
            ok: false,
            error: error.message
        });
    }
});

app.post("/merge", async (req, res) => {
    try {
        const sessionId = req.headers["x-session-id"];

        if (!sessionId) {
            return res.status(400).json({
                ok: false,
                error: "セッション ID が必要です"
            });
        }

        const sessionDir = path.join(uploadDir, sessionId);

        if (!fs.existsSync(sessionDir)) {
            return res.status(404).json({
                ok: false,
                error: "セッションが見つかりません"
            });
        }

        const files = fs.readdirSync(sessionDir);
        const chunkFiles = files
            .filter((file) => file.startsWith("chunk-") && file.endsWith(".webm"))
            .sort((a, b) => {
                const aIndex = parseInt(a.split("-")[1]);
                const bIndex = parseInt(b.split("-")[1]);

                return aIndex - bIndex;
            });

        if (chunkFiles.length === 0) {
            return res.status(400).json({
                ok: false,
                error: "結合するファイルがありません"
            });
        }

        const mergedFilename = `merged-${sessionId}-${Date.now()}.webm`;
        const mergedPath = path.join(mergedDir, mergedFilename);

        const writeStream = fs.createWriteStream(mergedPath);

        for (const file of chunkFiles) {
            const filePath = path.join(sessionDir, file);
            const data = fs.readFileSync(filePath);

            writeStream.write(data);
        }

        writeStream.end();

        await new Promise((resolve, reject) => {
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
        });

        const stats = fs.statSync(mergedPath);

        res.json({
            ok: true,
            filename: mergedFilename,
            path: mergedPath,
            size: stats.size,
            chunkCount: chunkFiles.length
        });

    } catch (error) {
        console.error("結合エラー:", error);

        res.status(500).json({
            ok: false,
            error: error.message
        });
    }
});

app.get("/download/:filename", (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(mergedDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                ok: false,
                error: "ファイルが見つかりません"
            });
        }

        res.download(filePath, (err) => {
            if (err) {
                console.error("ダウンロードエラー:", err);
            }
        });

    } catch (error) {
        console.error("ダウンロードエラー:", error);

        res.status(500).json({
            ok: false,
            error: error.message
        });
    }
});

app.delete("/cleanup/:sessionId", (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const sessionDir = path.join(uploadDir, sessionId);

        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }

        res.json({
            ok: true,
            message: "クリーンアップ完了"
        });

    } catch (error) {
        console.error("クリーンアップエラー:", error);

        res.status(500).json({
            ok: false,
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 サーバー起動中: http://localhost:${PORT}`);
    console.log(`📁 アップロード先: ${uploadDir}`);
    console.log(`📁 結合先：${mergedDir}`);
});
