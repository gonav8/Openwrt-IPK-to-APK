import { describe, expect, it, beforeAll } from "vitest";
import { convertIpkToApk, cleanupWorkDir } from "./converter";
import { readFile, stat } from "fs/promises";
import path from "path";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { Readable, PassThrough } from "stream";
import tar from "tar-stream";

/**
 * Helper: create a minimal valid .ipk buffer for testing.
 * An IPK is a gzipped tar containing:
 *   - debian-binary (text: "2.0\n")
 *   - control.tar.gz (gzipped tar with "control" file)
 *   - data.tar.gz (gzipped tar with package files)
 */
async function createTestIpk(opts: {
  packageName?: string;
  version?: string;
  arch?: string;
  description?: string;
  depends?: string;
  includePostinst?: boolean;
  dataFiles?: Array<{ name: string; content: string }>;
}): Promise<Buffer> {
  const {
    packageName = "test-package",
    version = "1.0.0",
    arch = "all",
    description = "Test package",
    depends = "",
    includePostinst = false,
    dataFiles = [{ name: "usr/share/test/hello.txt", content: "hello world\n" }],
  } = opts;

  // Build control.tar.gz
  const controlTarGz = await buildTarGz([
    {
      name: "./control",
      content: [
        `Package: ${packageName}`,
        `Version: ${version}`,
        `Architecture: ${arch}`,
        `Description: ${description}`,
        depends ? `Depends: ${depends}` : "",
        `Maintainer: Test Maintainer`,
        `Section: utils`,
        "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    ...(includePostinst
      ? [
          {
            name: "./postinst",
            content: "#!/bin/sh\necho 'Post-install script'\nexit 0\n",
          },
        ]
      : []),
  ]);

  // Build data.tar.gz
  const dataTarGz = await buildTarGz(
    dataFiles.map((f) => ({ name: `./${f.name}`, content: f.content }))
  );

  // Build outer IPK (tar.gz with debian-binary, control.tar.gz, data.tar.gz)
  const ipk = await buildTarGz([
    { name: "./debian-binary", content: "2.0\n" },
    { name: "./control.tar.gz", buffer: controlTarGz },
    { name: "./data.tar.gz", buffer: dataTarGz },
  ]);

  return ipk;
}

async function buildTarGz(
  entries: Array<{ name: string; content?: string; buffer?: Buffer }>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pack = tar.pack();
    const gzip = createGzip();
    const chunks: Buffer[] = [];

    gzip.on("data", (chunk: Buffer) => chunks.push(chunk));
    gzip.on("end", () => resolve(Buffer.concat(chunks)));
    gzip.on("error", reject);

    pack.pipe(gzip);

    for (const entry of entries) {
      const data = entry.buffer || Buffer.from(entry.content || "");
      pack.entry({ name: entry.name, size: data.length }, data);
    }

    pack.finalize();
  });
}

describe("convertIpkToApk", () => {
  it("converts a minimal valid IPK to APK", async () => {
    const ipkBuffer = await createTestIpk({
      packageName: "my-test-pkg",
      version: "2.1.0",
      description: "A test package",
    });

    const result = await convertIpkToApk(ipkBuffer, "my-test-pkg_2.1.0_all.ipk");

    expect(result.success).toBe(true);
    expect(result.outputFilename).toBe("my-test-pkg-2.1.0-r0.apk");
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.package).toBe("my-test-pkg");
    expect(result.metadata!.version).toBe("2.1.0");
    expect(result.metadata!.description).toBe("A test package");

    // Verify the output file exists and starts with ADBd magic
    expect(result.outputPath).toBeDefined();
    const apkData = await readFile(result.outputPath!);
    expect(apkData.length).toBeGreaterThan(0);
    // ADBd magic bytes: 0x41 0x44 0x42 0x64
    expect(apkData[0]).toBe(0x41); // A
    expect(apkData[1]).toBe(0x44); // D
    expect(apkData[2]).toBe(0x42); // B
    expect(apkData[3]).toBe(0x64); // d

    // Cleanup
    await cleanupWorkDir(result.outputPath!);
  });

  it("handles dependencies correctly", async () => {
    const ipkBuffer = await createTestIpk({
      packageName: "dep-test",
      version: "1.0",
      depends: "libc, luci-base, luci-compat",
    });

    const result = await convertIpkToApk(ipkBuffer, "dep-test_1.0_all.ipk");

    expect(result.success).toBe(true);
    expect(result.metadata!.depends).toBe("libc, luci-base, luci-compat");

    if (result.outputPath) await cleanupWorkDir(result.outputPath);
  });

  it("includes scripts when present", async () => {
    const ipkBuffer = await createTestIpk({
      packageName: "script-test",
      version: "1.0",
      includePostinst: true,
    });

    const result = await convertIpkToApk(ipkBuffer, "script-test_1.0_all.ipk");

    expect(result.success).toBe(true);
    expect(result.scripts).toBeDefined();
    expect(result.scripts!.length).toBeGreaterThan(0);
    expect(result.scripts!.some((s) => s.includes("post-install"))).toBe(true);

    if (result.outputPath) await cleanupWorkDir(result.outputPath);
  });

  it("maps architecture correctly", async () => {
    const ipkBuffer = await createTestIpk({
      packageName: "arch-test",
      version: "1.0",
      arch: "x86_64",
    });

    const result = await convertIpkToApk(ipkBuffer, "arch-test_1.0_x86_64.ipk");

    expect(result.success).toBe(true);
    expect(result.metadata!.architecture).toBe("x86_64");

    if (result.outputPath) await cleanupWorkDir(result.outputPath);
  });

  it("adds -r0 revision to version without revision", async () => {
    const ipkBuffer = await createTestIpk({
      packageName: "ver-test",
      version: "3.5.2",
    });

    const result = await convertIpkToApk(ipkBuffer, "ver-test_3.5.2_all.ipk");

    expect(result.success).toBe(true);
    expect(result.outputFilename).toBe("ver-test-3.5.2-r0.apk");

    if (result.outputPath) await cleanupWorkDir(result.outputPath);
  });

  it("preserves existing -r revision in version", async () => {
    const ipkBuffer = await createTestIpk({
      packageName: "rev-test",
      version: "1.0-r3",
    });

    const result = await convertIpkToApk(ipkBuffer, "rev-test_1.0-r3_all.ipk");

    expect(result.success).toBe(true);
    expect(result.outputFilename).toBe("rev-test-1.0-r3.apk");

    if (result.outputPath) await cleanupWorkDir(result.outputPath);
  });

  it("rejects invalid (non-IPK) files", async () => {
    const fakeBuffer = Buffer.from("this is not a valid ipk file");

    const result = await convertIpkToApk(fakeBuffer, "fake.ipk");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("handles multiple data files", async () => {
    const ipkBuffer = await createTestIpk({
      packageName: "multi-file",
      version: "1.0",
      dataFiles: [
        { name: "usr/lib/lua/luci/view/test.htm", content: "<h1>Test</h1>" },
        { name: "usr/lib/lua/luci/controller/test.lua", content: "module(...)" },
        { name: "etc/config/test", content: "config test\n" },
      ],
    });

    const result = await convertIpkToApk(ipkBuffer, "multi-file_1.0_all.ipk");

    expect(result.success).toBe(true);
    expect(result.outputPath).toBeDefined();

    // Verify APK was created
    const apkStat = await stat(result.outputPath!);
    expect(apkStat.size).toBeGreaterThan(0);

    if (result.outputPath) await cleanupWorkDir(result.outputPath);
  });
});

describe("cleanupWorkDir", () => {
  it("does not throw on non-existent path", async () => {
    await expect(
      cleanupWorkDir("/tmp/ipk2apk-nonexistent/output/test.apk")
    ).resolves.not.toThrow();
  });
});
