# pi-paste-image

Paste clipboard images into your [pi](https://github.com/badlogic/pi) conversations.

## What it does

When you copy an image to your clipboard (screenshot, copied image, etc.), this extension:

1. Uses the original image path when one is available
2. Otherwise saves the clipboard image to a temporary PNG
3. Inserts the file path into your editor
4. You send the message → pi's `read` tool opens the image so the LLM can see it

## Installation

```bash
pi install git:github.com/penniey/pi-paste-image
```

Or install from a local path:

```bash
pi install ./pi-paste-image
```

## Usage

- **Keyboard shortcut**: `Ctrl+Alt+V` (uses Alt instead of Shift to avoid terminal paste conflict)
- **Command**: `/paste-image`

Both methods append the image file path to whatever text you already have in the editor, so you can type your question around it:

```
What do you think about this? C:\Users\hugo2\AppData\Local\Temp\pi_clipboard_12345.png
```

> **Why not Ctrl+V?** Terminals intercept Ctrl+V at a level below pi for raw text paste. When the clipboard contains an image, terminals paste nothing or garbled bytes. A TUI app can't override this, so we use Ctrl+Alt+V instead.

## Platform support

- **Windows**: Uses PowerShell + .NET `System.Windows.Forms.Clipboard` (built-in, no dependencies)
- **macOS**: Uses the built-in AppKit pasteboard through `osascript` (built-in, no dependencies)
- Linux is not supported yet.

## How it works

On Windows, the extension reads the clipboard image with PowerShell and saves it as a PNG in `%TEMP%`.

On macOS, images copied in Finder keep their original file URL, so the extension inserts that path. Screenshots and images copied from apps usually have no source path; the extension reads their PNG or TIFF clipboard data and writes a temporary PNG instead.

The temporary file persists until the operating system cleans it up, giving pi's `read` tool time to open it.
