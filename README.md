# IPK to APK Converter (GitHub Pages)

A client-side web tool that converts OpenWrt `.ipk` packages to `.apk` (APKv3) format for OpenWrt V25.xx.

## Live Demo

Visit: **https://gonav8.github.io/Openwrt-IPK-to-APK/**

## How It Works

The converter runs **entirely in your browser** — no files are uploaded to any server. It performs the following steps:

1. **Parses the IPK archive** (gzip + tar format with debian-binary, control.tar.gz, data.tar.gz)
2. **Extracts metadata** from the control file (package name, version, dependencies, scripts)
3. **Builds an ADB binary tree** following the APKv3 specification used by apk-tools 3.x
4. **Computes SHA-256 hashes** for all files and the package unique ID
5. **Assembles the final APK** with deflate compression and the "ADBd" format marker

## Technology

The converter implements the Alpine/OpenWrt APKv3 (ADB) binary format in pure JavaScript, including:

- ADB value serialization (blobs, integers, objects, arrays)
- Package schema encoding (pkginfo, paths, files, scripts, dependencies)
- Block-based file assembly with DATA blocks for file content
- Deflate compression via [pako](https://github.com/nicolo-ribaudo/pako)

## Background

OpenWrt V25.xx migrated from `opkg` (which uses `.ipk` packages) to `apk-tools` (which uses `.apk` packages in APKv3/ADB format). This tool helps users convert existing `.ipk` packages for use on the new system.

## Limitations

- Converted packages are **unsigned** (no cryptographic signatures)
- Architecture-specific binary packages may not work across different architectures
- Some complex dependency version constraints may need manual adjustment
- The converter handles the most common IPK formats (gzip-compressed tar archives)

## License

MIT
