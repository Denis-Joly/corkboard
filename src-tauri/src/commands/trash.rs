use std::path::Path;

use crate::paths;

/// Move a file or folder under the boards root to the system Trash.
/// The app never permanently deletes user data.
#[tauri::command]
pub async fn trash_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = paths::validate_under_root(&app, Path::new(&path))?;
    let root = paths::boards_root(&app)?
        .canonicalize()
        .map_err(|e| format!("cannot canonicalize boards root: {e}"))?;
    if target == root {
        return Err("refusing to trash the boards root itself".into());
    }
    trash::delete(&target).map_err(|e| format!("cannot move to Trash: {e}"))
}
