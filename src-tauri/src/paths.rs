use std::path::{Path, PathBuf};
use tauri::Manager;

pub const BOARDS_DIR_NAME: &str = "CorkBoards";

/// Resolve (and create if missing) the boards root: `$HOME/CorkBoards`.
pub fn boards_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("cannot resolve home dir: {e}"))?;
    let root = home.join(BOARDS_DIR_NAME);
    if !root.exists() {
        std::fs::create_dir_all(&root).map_err(|e| format!("cannot create boards root: {e}"))?;
    }
    Ok(root)
}

/// Canonicalize `path` and require it to live under the boards root.
/// Custom commands bypass plugin scopes, so every command must funnel
/// path arguments through here before touching the filesystem.
pub fn validate_under_root(app: &tauri::AppHandle, path: &Path) -> Result<PathBuf, String> {
    let root = boards_root(app)?;
    let root = root
        .canonicalize()
        .map_err(|e| format!("cannot canonicalize boards root: {e}"))?;
    let canonical = path.canonicalize().map_err(|e| {
        format!(
            "path does not exist or is unreadable: {} ({e})",
            path.display()
        )
    })?;
    if canonical.starts_with(&root) {
        Ok(canonical)
    } else {
        Err(format!("path escapes the boards root: {}", path.display()))
    }
}
