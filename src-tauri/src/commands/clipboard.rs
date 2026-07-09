use objc2::rc::autoreleasepool;
use objc2_app_kit::{NSPasteboard, NSPasteboardTypeFileURL};

use super::import::percent_decode;

/// Read file paths from the macOS pasteboard (⌘C on files in Finder).
/// The clipboard-manager plugin only covers text/images; file URLs
/// need NSPasteboard. Returns POSIX paths, or an empty list when the
/// clipboard holds no files.
#[tauri::command]
pub async fn read_clipboard_files() -> Result<Vec<String>, String> {
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

/// "file:///Users/x/My%20File.png" → "/Users/x/My File.png"
fn file_url_to_path(url: &str) -> Option<String> {
    let rest = url.strip_prefix("file://")?;
    // Strip a possible host component (file://localhost/...).
    let path_start = rest.find('/')?;
    let encoded = &rest[path_start..];
    percent_decode(encoded).ok()
}
