import { Router, Request, Response } from "express";
import multer from "multer";
import { readFile } from "fs/promises";
import { convertIpkToApk, cleanupWorkDir } from "./converter";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.originalname.endsWith(".ipk")) {
      cb(null, true);
    } else {
      cb(new Error("Only .ipk files are accepted"));
    }
  },
});

const router = Router();

router.post("/api/convert", upload.single("ipkFile"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No file uploaded" });
      return;
    }

    const result = await convertIpkToApk(req.file.buffer, req.file.originalname);

    if (!result.success || !result.outputPath) {
      res.status(400).json({
        success: false,
        error: result.error || "Conversion failed",
      });
      return;
    }

    // Read the converted file
    const apkBuffer = await readFile(result.outputPath);

    // Send metadata as JSON headers
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.outputFilename}"`
    );
    res.setHeader(
      "X-Package-Metadata",
      Buffer.from(
        JSON.stringify({
          metadata: result.metadata,
          scripts: result.scripts,
          outputFilename: result.outputFilename,
        })
      ).toString("base64")
    );

    res.send(apkBuffer);

    // Cleanup temp files
    await cleanupWorkDir(result.outputPath);
  } catch (err: any) {
    console.error("Conversion error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Internal server error",
    });
  }
});

// Metadata-only endpoint (no file download)
router.post("/api/convert/info", upload.single("ipkFile"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No file uploaded" });
      return;
    }

    const result = await convertIpkToApk(req.file.buffer, req.file.originalname);

    if (!result.success || !result.outputPath) {
      res.status(400).json({
        success: false,
        error: result.error || "Conversion failed",
      });
      return;
    }

    // Read file size
    const apkBuffer = await readFile(result.outputPath);

    res.json({
      success: true,
      metadata: result.metadata,
      scripts: result.scripts,
      outputFilename: result.outputFilename,
      outputSize: apkBuffer.length,
    });

    // Cleanup
    await cleanupWorkDir(result.outputPath);
  } catch (err: any) {
    console.error("Info error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Internal server error",
    });
  }
});

export default router;
