# IPK2APK — OpenWrt Package Converter

Convert `.ipk` packages (OpenWrt V24.xx / opkg) to `.apk` packages (OpenWrt V25.xx / APKv3) with a simple web interface.

## Why This Tool?

OpenWrt V25.xx introduced a major change: the package manager switched from **opkg** (using `.ipk` files) to **apk** (using `.apk` files in APKv3/ADB format). This means existing `.ipk` packages built for V24.xx and earlier **cannot be installed** on V25.xx systems.

This tool bridges that gap by converting your existing `.ipk` packages into the new `.apk` format.

## How It Works

The conversion follows three steps:

| Step | Description |
|------|-------------|
| **1. Extract IPK** | Parses the gzipped tar archive to extract `debian-binary`, `control.tar.gz` (metadata + scripts), and `data.tar.gz` (package files) |
| **2. Map Metadata** | Converts opkg control fields to APK info format and maps install scripts (`postinst` → `post-install`, `prerm` → `pre-deinstall`, etc.) |
| **3. Build APK** | Uses `apk mkpkg` (apk-tools 3.x) to generate a valid APKv3 package with proper ADB block structure |

## Format Comparison

| Feature | `.ipk` (opkg) | `.apk` (APKv3) |
|---------|---------------|-----------------|
| Archive format | Gzipped tar (`.tar.gz`) | ADB binary format |
| Magic bytes | `1f 8b` (gzip) | `ADBd` |
| Metadata | `control` file (Debian-style) | ADB info block |
| Scripts | `postinst`, `prerm`, `postrm`, `preinst` | `post-install`, `pre-deinstall`, `post-deinstall`, `pre-install` |
| Package manager | opkg | apk |
| OpenWrt version | V24.xx and earlier | V25.xx and later |

## Quick Start

### Use the Web App

Visit the hosted version and upload your `.ipk` file — no installation required.

### Run Locally

```bash
# Clone the repository
git clone https://github.com/gonav8/Openwrt-IPK-to-APK.git
cd Openwrt-IPK-to-APK

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

The app will be available at `http://localhost:3000`.

### API Usage

You can also use the conversion API directly:

```bash
curl -X POST -F "ipkFile=@your-package.ipk" \
  -o converted-package.apk \
  http://localhost:3000/api/convert
```

The response includes an `X-Package-Metadata` header (Base64-encoded JSON) with package details.

## Installing Converted Packages

Since converted packages are **unsigned**, you need to allow untrusted packages when installing on OpenWrt V25.xx:

```bash
# Copy the .apk to your OpenWrt device
scp converted-package.apk root@192.168.1.1:/tmp/

# Install with --allow-untrusted flag
apk add --allow-untrusted /tmp/converted-package.apk
```

## Script Mapping

The converter maps opkg install scripts to their APK equivalents:

| IPK Script | APK Script | Trigger |
|------------|------------|---------|
| `preinst` | `pre-install` | Before package files are extracted |
| `postinst` | `post-install` | After package files are installed |
| `prerm` | `pre-deinstall` | Before package files are removed |
| `postrm` | `post-deinstall` | After package files are removed |

## Tech Stack

- **Frontend:** React 19, Tailwind CSS 4, Framer Motion, shadcn/ui
- **Backend:** Express 4, tRPC 11, Node.js
- **Conversion:** apk-tools 3.x static binary (`apk mkpkg`)
- **Testing:** Vitest (10 tests covering conversion logic)

## Limitations

- Converted packages are **unsigned** — use `--allow-untrusted` when installing
- Some packages may have dependencies that were **renamed** in V25.xx
- Binary packages compiled for a specific architecture must match the target device
- The converter handles metadata and file structure; it does not recompile binaries

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## License

MIT
