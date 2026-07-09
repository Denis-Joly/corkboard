use std::collections::HashSet;
use std::fs;
use std::path::Path;

use crate::paths;

/// Manual orphan sweep: move every file in `<board>/assets/` that is not
/// referenced by the document to the system Trash. Never automatic —
/// a sync service can deliver an asset before the board.json that
/// references it, so only the user triggers this.
#[tauri::command]
pub async fn clean_board(
    app: tauri::AppHandle,
    board_dir: String,
    referenced: Vec<String>,
) -> Result<Vec<String>, String> {
    let dir = paths::validate_under_root(&app, Path::new(&board_dir))?;
    let assets = dir.join("assets");
    if !assets.is_dir() {
        return Ok(vec![]);
    }

    let keep: HashSet<&str> = referenced
        .iter()
        .filter_map(|p| p.strip_prefix("assets/"))
        .collect();

    let mut removed = Vec::new();
    let entries = fs::read_dir(&assets).map_err(|e| format!("cannot read assets dir: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = entry.file_name().to_str().map(String::from) else {
            continue;
        };
        if !keep.contains(name.as_str()) {
            trash::delete(&path).map_err(|e| format!("cannot trash {name}: {e}"))?;
            removed.push(name);
        }
    }
    Ok(removed)
}
