/**
 * pi-paste-image
 *
 * Ctrl+Alt+V or /paste-image saves clipboard image and inserts path.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { execFile } from "child_process";
import { promisify } from "util";
import { platform, tmpdir } from "os";
import { join } from "path";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);

const macOSClipboardScript = String.raw`
ObjC.import("AppKit")
ObjC.import("Foundation")

function run(argv) {
  const outputPath = argv[0]
  const pasteboard = $.NSPasteboard.generalPasteboard

  // Finder puts the original file URL on the clipboard. Reuse it when Pi can
  // read that image format directly.
  const fileURL = ObjC.unwrap(pasteboard.stringForType("public.file-url"))
  if (typeof fileURL === "string" && fileURL.startsWith("file:")) {
    const path = ObjC.unwrap($.NSURL.URLWithString(fileURL).path)
    if (typeof path === "string" && $.NSFileManager.defaultManager.fileExistsAtPath(path)) {
      const extension = path.split(".").pop().toLowerCase()
      if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(extension)) {
        return path
      }
    }
  }

  // Screenshots and images copied from apps usually have no original path.
  // Save their clipboard bytes as a temporary PNG instead.
  const pngData = pasteboard.dataForType("public.png")
  if (ObjC.unwrap(pngData) !== undefined) {
    return pngData.writeToFileAtomically(outputPath, true) ? outputPath : ""
  }

  const tiffData = pasteboard.dataForType("public.tiff")
  if (ObjC.unwrap(tiffData) === undefined) return ""

  const bitmap = $.NSBitmapImageRep.imageRepWithData(tiffData)
  if (ObjC.unwrap(bitmap) === undefined) return ""

  // NSBitmapImageFileTypePNG is 4 on macOS.
  const convertedPNG = bitmap.representationUsingTypeProperties(4, $({}))
  if (ObjC.unwrap(convertedPNG) === undefined) return ""

  return convertedPNG.writeToFileAtomically(outputPath, true) ? outputPath : ""
}
`;

async function readWindowsClipboardImage(tempFile: string): Promise<string | null> {
  const psTempFile = tempFile.replace(/\\/g, "\\\\");
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    $img = [System.Windows.Forms.Clipboard]::GetImage()
    if ($img -eq $null) { exit 1 }
    $img.Save("${psTempFile}", [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "${tempFile}"
  `;
  const encodedCommand = Buffer.from(psScript, "utf16le").toString("base64");

  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-EncodedCommand", encodedCommand],
      { timeout: 10000 }
    );
    const path = stdout.trim();
    return path && existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

async function readMacOSClipboardImage(tempFile: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/osascript",
      ["-l", "JavaScript", "-e", macOSClipboardScript, tempFile],
      { timeout: 10000 }
    );
    const path = stdout.trim();
    return path && existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

async function readClipboardImage(): Promise<string | null> {
  const tempFile = join(tmpdir(), `pi_clipboard_${Date.now()}.png`);

  if (platform() === "win32") {
    return readWindowsClipboardImage(tempFile);
  }
  if (platform() === "darwin") {
    return readMacOSClipboardImage(tempFile);
  }
  return null;
}

function insertImagePath(ctx: ExtensionContext, filePath: string): void {
  const existingText = ctx.ui.getEditorText();
  ctx.ui.setEditorText(existingText ? `${existingText} ${filePath}` : filePath);
}

async function pasteClipboardImage(ctx: ExtensionContext): Promise<void> {
  ctx.ui.setStatus("paste-image", "Reading clipboard...");
  try {
    const filePath = await readClipboardImage();
    if (!filePath) {
      ctx.ui.notify("No image found in clipboard", "warning");
      return;
    }
    insertImagePath(ctx, filePath);
    ctx.ui.notify("Image ready. File path inserted.", "success");
  } catch (error: any) {
    ctx.ui.notify(`Failed: ${error.message}`, "error");
  } finally {
    ctx.ui.setStatus("paste-image", undefined);
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerShortcut("ctrl+alt+v", {
    description: "Paste image from clipboard",
    handler: pasteClipboardImage,
  });

  pi.registerCommand("paste-image", {
    description: "Save clipboard image and insert file path into editor",
    handler: async (_args, ctx) => pasteClipboardImage(ctx),
  });
}
