use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use crate::paths;

/// Atomically persist a board document.
///
/// Sequence: write `board.json.tmp` + fsync → rotate current `board.json`
/// to `board.json.bak` → rename tmp over `board.json` (atomic on APFS)
/// → fsync the directory. A crash at any step leaves either the old
/// `board.json` or a valid `.bak` loadable.
#[tauri::command]
pub async fn save_board(
    app: tauri::AppHandle,
    board_dir: String,
    json: String,
) -> Result<(), String> {
    let dir = paths::validate_under_root(&app, Path::new(&board_dir))?;
    if !dir.is_dir() {
        return Err(format!("not a board directory: {}", dir.display()));
    }

    let target = dir.join("board.json");
    let tmp = dir.join("board.json.tmp");
    let bak = dir.join("board.json.bak");

    {
        let mut f = File::create(&tmp).map_err(|e| format!("cannot create tmp file: {e}"))?;
        f.write_all(json.as_bytes())
            .map_err(|e| format!("cannot write tmp file: {e}"))?;
        f.sync_all().map_err(|e| format!("cannot fsync tmp file: {e}"))?;
    }

    if target.exists() {
        fs::rename(&target, &bak).map_err(|e| format!("cannot rotate backup: {e}"))?;
    }
    fs::rename(&tmp, &target).map_err(|e| format!("cannot move board.json into place: {e}"))?;

    // fsync the directory so the renames themselves are durable.
    if let Ok(d) = File::open(&dir) {
        let _ = d.sync_all();
    }
    Ok(())
}
