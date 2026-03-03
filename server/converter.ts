import { execFile } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { createGunzip } from "zlib";
import path from "path";
import { pipeline } from "stream/promises";
import { randomUUID } from "crypto";
import tar from "tar-stream";
import { Readable } from "stream";

// Path to apk.static binary
const APK_STATIC = path.resolve(
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), "server", "bin", "apk.static")
    : path.join(import.meta.dirname, "bin", "apk.static")
);

export interface IpkMetadata {
  package: string;
  version: string;
  depends: string;
  description: string;
  architecture: string;
  installedSize: string;
  section: string;
  maintainer: string;
  source: string;
  license: string;
  sourceUrl: string;
  [key: string]: string;
}

export interface ConversionResult {
  success: boolean;
  outputPath?: string;
  outputFilename?: string;
  metadata?: IpkMetadata;
  error?: string;
  scripts?: string[];
}

/**
 * Extract a tar.gz buffer into a directory
 */
async function extractTarGz(
  buffer: Buffer,
  destDir: string
): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const extract = tar.extract();

  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    extract.on("entry", (header: any, stream: any, next: () => void) => {
      const entryChunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => entryChunks.push(chunk));
      stream.on("end", () => {
        const name = header.name.replace(/^\.\//, "").replace(/^\./, "");
        if (name && header.type === "file") {
          files.set(name || header.name, Buffer.concat(entryChunks));
        }
        next();
      });
      stream.resume();
    });

    extract.on("finish", () => resolve(files));
    extract.on("error", reject);

    // Decompress gzip then pipe to tar extract
    const gunzip = createGunzip();
    gunzip.on("error", reject);

    const readable = Readable.from(buffer);
    readable.pipe(gunzip).pipe(extract);
  });
}

/**
 * Parse IPK control file into metadata
 */
function parseControlFile(content: string): IpkMetadata {
  const metadata: IpkMetadata = {
    package: "",
    version: "",
    depends: "",
    description: "",
    architecture: "",
    installedSize: "",
    section: "",
    maintainer: "",
    source: "",
    license: "",
    sourceUrl: "",
  };

  const lines = content.split("\n");
  let currentKey = "";

  for (const line of lines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      // Continuation of previous field
      if (currentKey) {
        metadata[currentKey] += "\n" + line.trim();
      }
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim();
    const value = line.substring(colonIdx + 1).trim();

    switch (key.toLowerCase()) {
      case "package":
        metadata.package = value;
        currentKey = "package";
        break;
      case "version":
        metadata.version = value;
        currentKey = "version";
        break;
      case "depends":
        metadata.depends = value;
        currentKey = "depends";
        break;
      case "description":
        metadata.description = value;
        currentKey = "description";
        break;
      case "architecture":
        metadata.architecture = value;
        currentKey = "architecture";
        break;
      case "installed-size":
        metadata.installedSize = value;
        currentKey = "installedSize";
        break;
      case "section":
        metadata.section = value;
        currentKey = "section";
        break;
      case "maintainer":
        metadata.maintainer = value;
        currentKey = "maintainer";
        break;
      case "source":
        metadata.source = value;
        currentKey = "source";
        break;
      case "license":
        metadata.license = value;
        currentKey = "license";
        break;
      case "url":
        metadata.sourceUrl = value;
        currentKey = "sourceUrl";
        break;
      default:
        metadata[key.toLowerCase()] = value;
        currentKey = key.toLowerCase();
    }
  }

  return metadata;
}

/**
 * Map IPK architecture to APK architecture
 */
function mapArchitecture(ipkArch: string): string {
  const archMap: Record<string, string> = {
    all: "noarch",
    aarch64: "aarch64",
    arm_cortex_a7_neon_vfpv4: "armv7",
    arm_cortex_a9: "armv7",
    arm_cortex_a9_vfpv3_d16: "armv7",
    arm_cortex_a15_neon_vfpv4: "armv7",
    arm_cortex_a53_neon_vfpv4: "aarch64",
    mipsel_24kc: "mipsel",
    mips_24kc: "mips",
    x86_64: "x86_64",
    i386_pentium4: "x86",
  };

  return archMap[ipkArch] || ipkArch;
}

/**
 * Convert IPK version to APK-compatible version
 * APK versions need a revision suffix like -r0
 */
function convertVersion(version: string): string {
  // If version already has -r suffix, keep it
  if (/-r\d+$/.test(version)) return version;
  // Add -r0 revision
  return `${version}-r0`;
}

/**
 * Script type mapping from IPK to APK
 */
const SCRIPT_MAP: Record<string, string> = {
  preinst: "pre-install",
  postinst: "post-install",
  prerm: "pre-deinstall",
  postrm: "post-deinstall",
  "preinst-pkg": "pre-install",
  "postinst-pkg": "post-install",
  "prerm-pkg": "pre-deinstall",
  "postrm-pkg": "post-deinstall",
};

/**
 * Main conversion function: IPK buffer → APK file
 */
export async function convertIpkToApk(
  ipkBuffer: Buffer,
  originalFilename: string
): Promise<ConversionResult> {
  const workDir = path.join("/tmp", `ipk2apk-${randomUUID()}`);

  try {
    // Create work directories
    await mkdir(path.join(workDir, "ipk"), { recursive: true });
    await mkdir(path.join(workDir, "data"), { recursive: true });
    await mkdir(path.join(workDir, "scripts"), { recursive: true });
    await mkdir(path.join(workDir, "output"), { recursive: true });

    // Step 1: Extract outer tar.gz (the IPK file itself)
    const outerFiles = await extractTarGz(ipkBuffer, workDir);

    // Verify it's a valid IPK
    const debianBinary = outerFiles.get("debian-binary");
    if (!debianBinary) {
      return {
        success: false,
        error:
          "Invalid IPK file: missing debian-binary. This does not appear to be a valid OpenWrt .ipk package.",
      };
    }

    const controlTarGz = outerFiles.get("control.tar.gz");
    if (!controlTarGz) {
      return {
        success: false,
        error:
          "Invalid IPK file: missing control.tar.gz. Package metadata not found.",
      };
    }

    const dataTarGz = outerFiles.get("data.tar.gz");
    if (!dataTarGz) {
      return {
        success: false,
        error:
          "Invalid IPK file: missing data.tar.gz. Package data not found.",
      };
    }

    // Step 2: Extract control.tar.gz
    const controlFiles = await extractTarGz(controlTarGz, workDir);

    // Step 3: Parse control file
    const controlContent = controlFiles.get("control");
    if (!controlContent) {
      return {
        success: false,
        error: "Invalid IPK file: missing control file in control.tar.gz.",
      };
    }

    const metadata = parseControlFile(controlContent.toString("utf-8"));

    if (!metadata.package) {
      return {
        success: false,
        error:
          "Invalid IPK file: Package name not found in control file.",
      };
    }

    // Step 4: Extract data.tar.gz to filesystem
    const dataDir = path.join(workDir, "data");
    const dataFiles = await extractTarGz(dataTarGz, dataDir);

    // Write data files to disk preserving directory structure
    for (const [filePath, content] of Array.from(dataFiles.entries())) {
      if (!filePath) continue;
      const fullPath = path.join(dataDir, filePath);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content);
    }

    // Step 5: Prepare scripts
    const scriptArgs: string[] = [];
    const foundScripts: string[] = [];

    for (const [ipkName, apkType] of Object.entries(SCRIPT_MAP)) {
      const scriptContent = controlFiles.get(ipkName);
      if (scriptContent) {
        const scriptPath = path.join(workDir, "scripts", apkType);
        // Clean up the script - remove opkg-specific parts
        let scriptText = scriptContent.toString("utf-8");
        // Make it a proper shell script
        if (!scriptText.startsWith("#!")) {
          scriptText = "#!/bin/sh\n" + scriptText;
        }
        await writeFile(scriptPath, scriptText, { mode: 0o755 });
        scriptArgs.push("--script", `${apkType}:${scriptPath}`);
        foundScripts.push(`${ipkName} → ${apkType}`);
      }
    }

    // Step 6: Build apk mkpkg command
    const apkVersion = convertVersion(metadata.version);
    const apkArch = mapArchitecture(metadata.architecture);
    const outputFilename = `${metadata.package}-${apkVersion}.apk`;
    const outputPath = path.join(workDir, "output", outputFilename);

    const args = [
      "mkpkg",
      "--info",
      `name:${metadata.package}`,
      "--info",
      `version:${apkVersion}`,
      "--info",
      `arch:${apkArch}`,
    ];

    if (metadata.description) {
      args.push("--info", `description:${metadata.description}`);
    }

    if (metadata.license) {
      args.push("--info", `license:${metadata.license}`);
    } else {
      args.push("--info", `license:Unknown`);
    }

    if (metadata.maintainer) {
      args.push("--info", `maintainer:${metadata.maintainer}`);
    }

    if (metadata.sourceUrl) {
      args.push("--info", `url:${metadata.sourceUrl}`);
    }

    if (metadata.source) {
      args.push("--info", `origin:${metadata.source}`);
    }

    // Handle dependencies
    if (metadata.depends) {
      const deps = metadata.depends
        .split(",")
        .map((d) => d.trim())
        .filter((d) => d && d !== "libc");

      if (deps.length > 0) {
        args.push("--info", `depends:${deps.join(" ")}`);
      }
    }

    // Add files and scripts
    args.push("--files", dataDir);
    args.push(...scriptArgs);
    args.push("--output", outputPath);

    // Step 7: Run apk mkpkg
    await new Promise<void>((resolve, reject) => {
      execFile(APK_STATIC, args, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `apk mkpkg failed: ${error.message}\nstderr: ${stderr}\nstdout: ${stdout}`
            )
          );
          return;
        }
        resolve();
      });
    });

    // Verify output exists
    try {
      await stat(outputPath);
    } catch {
      return {
        success: false,
        error: "Conversion completed but output file was not created.",
      };
    }

    return {
      success: true,
      outputPath,
      outputFilename,
      metadata,
      scripts: foundScripts,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Conversion failed: ${err.message}`,
    };
  }
}

/**
 * Clean up temporary work directory
 */
export async function cleanupWorkDir(outputPath: string): Promise<void> {
  try {
    // The outputPath is like /tmp/ipk2apk-UUID/output/file.apk
    // We want to remove /tmp/ipk2apk-UUID/
    const workDir = path.dirname(path.dirname(outputPath));
    if (workDir.startsWith("/tmp/ipk2apk-")) {
      await rm(workDir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}
