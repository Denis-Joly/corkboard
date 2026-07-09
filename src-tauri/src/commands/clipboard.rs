/// Read file paths from the macOS pasteboard (⌘C on files in Finder).
/// The clipboard-manager plugin only handles text/images; file URLs
/// need NSPasteboard.
///
/// TODO(M8): implement via objc2-app-kit (NSPasteboard readObjects
/// forClasses: [NSURL], options: {NSPasteboardURLReadingFileURLsOnly}).
/// Stubbed empty so the paste chain can fall through to image/text.
#[tauri::command]
pub async fn read_clipboard_files() -> Result<Vec<String>, String> {
    Ok(vec![])
}
