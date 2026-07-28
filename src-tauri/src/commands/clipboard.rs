use objc2::rc::autoreleasepool;
use objc2_app_kit::{NSPasteboard, NSPasteboardTypeFileURL};

use super::import::percent_decode;

/// Read file paths from the macOS pasteboard (⌘C on files in Finder).
/// The clipboard-manager plugin only covers text/images; file URLs
/// need NSPasteboard — and AppKit pasteboard access must happen on the
/// MAIN thread (worker-thread reads silently return nothing).
#[tauri::command]
pub async fn read_clipboard_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(read_files_from_pasteboard());
    })
    .map_err(|e| format!("cannot reach main thread: {e}"))?;
    rx.recv().map_err(|e| format!("pasteboard read did not complete: {e}"))?
}

fn read_files_from_pasteboard() -> Result<Vec<String>, String> {
    autoreleasepool(|_| unsafe {
        let pasteboard = NSPasteboard::generalPasteboard();
        let Some(items) = pasteboard.pasteboardItems() else {
            return Ok(vec![]);
        };
        let mut paths = Vec::new();
        for item in items.iter() {
            let Some(url_string) = item.stringForType(NSPasteboardTypeFileURL) else {
                continue;
            };
            if let Some(path) = file_url_to_path(&url_string.to_string()) {
                paths.push(path);
            }
        }
        Ok(paths)
    })
}

/// "file:///Users/x/My%20File.png" → "/Users/x/My File.png".
/// Finder often hands out file-reference URLs ("/.file/id=…") — those
/// resolve to the real file when canonicalized, so resolve here.
fn file_url_to_path(url: &str) -> Option<String> {
    let rest = url.strip_prefix("file://")?;
    // Strip a possible host component (file://localhost/...).
    let path_start = rest.find('/')?;
    let encoded = &rest[path_start..];
    let decoded = percent_decode(encoded).ok()?;
    let resolved = std::path::Path::new(&decoded)
        .canonicalize()
        .map(|p| p.display().to_string())
        .unwrap_or(decoded);
    Some(resolved)
}
