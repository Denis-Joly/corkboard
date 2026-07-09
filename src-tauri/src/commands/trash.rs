use std::path::Path;

use crate::paths;

/// Move a file or folder under the boards root to the system Trash.
/// The app never permanently deletes user data.
#[tauri::command]
pub async fn trash_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = paths::validate_under_root(&app, Path::new(&path))?;
    trash::delete(&target).map_err(|e| format!("cannot move to Trash: {e}"))
}
