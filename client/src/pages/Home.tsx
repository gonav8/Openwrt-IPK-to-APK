import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Upload,
  Download,
  FileArchive,
  ArrowRight,
  Package,
  CheckCircle2,
  AlertCircle,
  Info,
  Loader2,
  RefreshCw,
  Github,
  Terminal,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PackageMetadata {
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

interface ConversionResponse {
  metadata: PackageMetadata;
  scripts: string[];
  outputFilename: string;
}

type ConversionState = "idle" | "uploading" | "converting" | "done" | "error";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ConversionState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConversionResponse | null>(null);
  const [apkBlob, setApkBlob] = useState<Blob | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith(".ipk")) {
      setFile(droppedFile);
      setState("idle");
      setError("");
      setResult(null);
      setApkBlob(null);
    } else {
      setError("Please upload a valid .ipk file");
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        setFile(selectedFile);
        setState("idle");
        setError("");
        setResult(null);
        setApkBlob(null);
      }
    },
    []
  );

  const handleConvert = useCallback(async () => {
    if (!file) return;

    setState("uploading");
    setProgress(10);
    setError("");

    try {
      const formData = new FormData();
      formData.append("ipkFile", file);

      setProgress(30);
      setState("converting");

      const response = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });

      setProgress(70);

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Conversion failed");
      }

      // Get metadata from header
      const metadataHeader = response.headers.get("X-Package-Metadata");
      if (metadataHeader) {
        const decoded = JSON.parse(atob(metadataHeader));
        setResult(decoded);
      }

      // Get the APK blob
      const blob = await response.blob();
      setApkBlob(blob);

      setProgress(100);
      setState("done");
    } catch (err: any) {
      setError(err.message || "Conversion failed");
      setState("error");
      setProgress(0);
    }
  }, [file]);

  const handleDownload = useCallback(() => {
    if (!apkBlob || !result) return;
    const url = URL.createObjectURL(apkBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.outputFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [apkBlob, result]);

  const handleReset = useCallback(() => {
    setFile(null);
    setState("idle");
    setProgress(0);
    setError("");
    setResult(null);
    setApkBlob(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                IPK2APK
              </h1>
              <p className="text-xs text-muted-foreground -mt-0.5">
                OpenWrt Package Converter
              </p>
            </div>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="w-5 h-5" />
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 md:py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.72_0.17_190/0.08),transparent_60%)]" />
        <div className="container relative">
          <div className="max-w-3xl mx-auto text-center">
            <Badge
              variant="outline"
              className="mb-6 px-4 py-1.5 text-sm font-medium border-primary/30 text-primary bg-primary/5"
            >
              OpenWrt V24 → V25 Migration Tool
            </Badge>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-5 leading-tight">
              Convert{" "}
              <span className="text-primary">.ipk</span> to{" "}
              <span className="text-primary">.apk</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              OpenWrt V25.xx replaced <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">opkg</code> with{" "}
              <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">apk</code> package manager.
              This tool converts your existing <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">.ipk</code> packages
              to the new <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">.apk</code> (APKv3) format.
            </p>
          </div>
        </div>
      </section>

      {/* Converter Section */}
      <section className="pb-16 md:pb-24">
        <div className="container">
          <div className="max-w-2xl mx-auto">
            {/* Upload Area */}
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
              <CardContent className="p-0">
                {/* Drop Zone */}
                <div
                  className={`relative p-8 md:p-12 transition-all duration-300 ${
                    isDragging
                      ? "bg-primary/10 border-primary"
                      : "hover:bg-muted/30"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ipk"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />

                  <AnimatePresence mode="wait">
                    {!file ? (
                      <motion.div
                        key="upload"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-center"
                      >
                        <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-5">
                          <Upload className="w-7 h-7 text-muted-foreground" />
                        </div>
                        <p className="text-lg font-semibold mb-2">
                          Drop your .ipk file here
                        </p>
                        <p className="text-sm text-muted-foreground mb-5">
                          or click to browse your files
                        </p>
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => fileInputRef.current?.click()}
                          className="bg-muted/30 border-border hover:bg-muted/50"
                        >
                          <FileArchive className="w-4 h-4 mr-2" />
                          Select .ipk File
                        </Button>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="file-selected"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        {/* File Info */}
                        <div className="flex items-center gap-4 mb-6">
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <FileArchive className="w-6 h-6 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">
                              {file.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatBytes(file.size)}
                            </p>
                          </div>
                          <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Package className="w-6 h-6 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-primary">.apk</p>
                            <p className="text-sm text-muted-foreground">
                              APKv3
                            </p>
                          </div>
                        </div>

                        {/* Progress */}
                        {(state === "uploading" || state === "converting") && (
                          <div className="mb-6">
                            <div className="flex justify-between text-sm mb-2">
                              <span className="text-muted-foreground">
                                {state === "uploading"
                                  ? "Uploading..."
                                  : "Converting..."}
                              </span>
                              <span className="text-primary font-mono">
                                {progress}%
                              </span>
                            </div>
                            <Progress value={progress} className="h-2" />
                          </div>
                        )}

                        {/* Error */}
                        {state === "error" && (
                          <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium text-destructive">
                                Conversion Failed
                              </p>
                              <p className="text-sm text-destructive/80 mt-1">
                                {error}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Success */}
                        {state === "done" && result && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-6"
                          >
                            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 flex items-start gap-3 mb-4">
                              <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                              <div>
                                <p className="font-medium text-primary">
                                  Conversion Successful
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                  Package converted to APKv3 format:{" "}
                                  <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                                    {result.outputFilename}
                                  </code>
                                </p>
                              </div>
                            </div>

                            {/* Metadata Table */}
                            <div className="rounded-lg border border-border overflow-hidden">
                              <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
                                <p className="text-sm font-semibold flex items-center gap-2">
                                  <Terminal className="w-4 h-4" />
                                  Package Details
                                </p>
                              </div>
                              <div className="divide-y divide-border text-sm">
                                {result.metadata.package && (
                                  <div className="flex px-4 py-2.5">
                                    <span className="w-32 text-muted-foreground shrink-0">
                                      Name
                                    </span>
                                    <span className="font-mono">
                                      {result.metadata.package}
                                    </span>
                                  </div>
                                )}
                                {result.metadata.version && (
                                  <div className="flex px-4 py-2.5">
                                    <span className="w-32 text-muted-foreground shrink-0">
                                      Version
                                    </span>
                                    <span className="font-mono">
                                      {result.metadata.version}
                                    </span>
                                  </div>
                                )}
                                {result.metadata.architecture && (
                                  <div className="flex px-4 py-2.5">
                                    <span className="w-32 text-muted-foreground shrink-0">
                                      Architecture
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className="font-mono text-xs"
                                    >
                                      {result.metadata.architecture}
                                    </Badge>
                                  </div>
                                )}
                                {result.metadata.description && (
                                  <div className="flex px-4 py-2.5">
                                    <span className="w-32 text-muted-foreground shrink-0">
                                      Description
                                    </span>
                                    <span>{result.metadata.description}</span>
                                  </div>
                                )}
                                {result.metadata.depends && (
                                  <div className="flex px-4 py-2.5">
                                    <span className="w-32 text-muted-foreground shrink-0">
                                      Dependencies
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {result.metadata.depends
                                        .split(",")
                                        .map((dep, i) => (
                                          <Badge
                                            key={i}
                                            variant="secondary"
                                            className="font-mono text-xs"
                                          >
                                            {dep.trim()}
                                          </Badge>
                                        ))}
                                    </div>
                                  </div>
                                )}
                                {result.metadata.maintainer && (
                                  <div className="flex px-4 py-2.5">
                                    <span className="w-32 text-muted-foreground shrink-0">
                                      Maintainer
                                    </span>
                                    <span>{result.metadata.maintainer}</span>
                                  </div>
                                )}
                                {result.scripts &&
                                  result.scripts.length > 0 && (
                                    <div className="flex px-4 py-2.5">
                                      <span className="w-32 text-muted-foreground shrink-0">
                                        Scripts
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {result.scripts.map((s, i) => (
                                          <Badge
                                            key={i}
                                            variant="outline"
                                            className="font-mono text-xs"
                                          >
                                            {s}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                {apkBlob && (
                                  <div className="flex px-4 py-2.5">
                                    <span className="w-32 text-muted-foreground shrink-0">
                                      Output Size
                                    </span>
                                    <span className="font-mono">
                                      {formatBytes(apkBlob.size)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                          {state === "idle" && (
                            <Button
                              size="lg"
                              onClick={handleConvert}
                              className="flex-1"
                            >
                              <ArrowRight className="w-4 h-4 mr-2" />
                              Convert to APK
                            </Button>
                          )}
                          {(state === "uploading" ||
                            state === "converting") && (
                            <Button size="lg" disabled className="flex-1">
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              {state === "uploading"
                                ? "Uploading..."
                                : "Converting..."}
                            </Button>
                          )}
                          {state === "done" && (
                            <Button
                              size="lg"
                              onClick={handleDownload}
                              className="flex-1"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download .apk
                            </Button>
                          )}
                          {(state === "done" || state === "error") && (
                            <Button
                              size="lg"
                              variant="outline"
                              onClick={handleReset}
                              className="bg-muted/20"
                            >
                              <RefreshCw className="w-4 h-4 mr-2" />
                              New File
                            </Button>
                          )}
                          {state === "idle" && (
                            <Button
                              size="lg"
                              variant="outline"
                              onClick={handleReset}
                              className="bg-muted/20"
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>

            {/* Info Section */}
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <Card className="border-border/40 bg-card/30">
                <CardContent className="p-6">
                  <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center mb-4">
                    <FileArchive className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold mb-2">.ipk Format</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Used by <strong>opkg</strong> in OpenWrt V24.xx and earlier.
                    A gzipped tar archive containing{" "}
                    <code className="text-xs font-mono bg-muted px-1 rounded">
                      debian-binary
                    </code>
                    ,{" "}
                    <code className="text-xs font-mono bg-muted px-1 rounded">
                      control.tar.gz
                    </code>
                    , and{" "}
                    <code className="text-xs font-mono bg-muted px-1 rounded">
                      data.tar.gz
                    </code>
                    .
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/40 bg-card/30">
                <CardContent className="p-6">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">.apk Format (APKv3)</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Used by <strong>apk</strong> in OpenWrt V25.xx. An ADB
                    binary format with typed blocks for metadata, signatures,
                    and data. Created using{" "}
                    <code className="text-xs font-mono bg-muted px-1 rounded">
                      apk mkpkg
                    </code>
                    .
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* How it works */}
            <Card className="mt-6 border-border/40 bg-card/30">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Info className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">How It Works</h3>
                </div>
                <div className="grid gap-4 md:grid-cols-3 text-sm">
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                      1
                    </div>
                    <div>
                      <p className="font-medium mb-1">Extract IPK</p>
                      <p className="text-muted-foreground">
                        Parses the gzipped tar to extract control metadata, scripts, and data files.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                      2
                    </div>
                    <div>
                      <p className="font-medium mb-1">Map Metadata</p>
                      <p className="text-muted-foreground">
                        Converts opkg control fields to APK metadata format and maps install scripts.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                      3
                    </div>
                    <div>
                      <p className="font-medium mb-1">Build APK</p>
                      <p className="text-muted-foreground">
                        Uses <code className="font-mono text-xs bg-muted px-1 rounded">apk mkpkg</code> to generate a valid APKv3 package.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Important Note */}
            <Card className="mt-6 border-amber-500/20 bg-amber-500/5">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-amber-400 mb-1">
                      Important Note
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      Converted packages are <strong>unsigned</strong>. To install on OpenWrt V25.xx,
                      you may need to use{" "}
                      <code className="font-mono text-xs bg-muted px-1 rounded">
                        apk add --allow-untrusted
                      </code>{" "}
                      or add the package to a local repository. Some packages may
                      require additional dependencies that have been renamed in V25.xx.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8">
        <div className="container text-center text-sm text-muted-foreground">
          <p>
            IPK2APK Converter — Built for the OpenWrt community.
            Uses <code className="font-mono text-xs">apk-tools 3.x</code> for APKv3 package generation.
          </p>
        </div>
      </footer>
    </div>
  );
}
