use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use crate::paths;

/// Serializes saves process-wide: concurrent invocations would race the
/// rotate/rename dance and can corrupt board.json AND its backup.
static SAVE_LOCK: Mutex<()> = Mutex::new(());
static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Atomically persist a board document.
///
/// Sequence: write a UNIQUE tmp file + fsync → rotate current
/// `board.json` to `board.json.bak` (only if it is valid JSON — never
/// overwrite a good backup with a corrupt current file) → rename tmp
/// over `board.json` (atomic on APFS) → fsync the directory. A crash at
/// any step leaves either board.json or a valid `.bak` loadable.
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

    let _guard = SAVE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    let target = dir.join("board.json");
    let bak = dir.join("board.json.bak");
    let tmp = dir.join(format!(
        ".board.json.tmp-{}-{}",
        std::process::id(),
        TMP_SEQ.fetch_add(1, Ordering::Relaxed)
    ));

    let write_result = (|| -> Result<(), String> {
        let mut f = File::create(&tmp).map_err(|e| format!("cannot create tmp file: {e}"))?;
        f.write_all(json.as_bytes())
            .map_err(|e| format!("cannot write tmp file: {e}"))?;
        f.sync_all()
            .map_err(|e| format!("cannot fsync tmp file: {e}"))?;
        Ok(())
    })();
    if let Err(e) = write_result {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }

    if target.is_file() {
        if is_valid_json(&target) {
            fs::rename(&target, &bak).map_err(|e| format!("cannot rotate backup: {e}"))?;
        } else {
            // The current file is corrupt (e.g. we just recovered from
            // .bak) — dropping it preserves the known-good backup.
            let _ = fs::remove_file(&target);
        }
    }
    fs::rename(&tmp, &target).map_err(|e| format!("cannot move board.json into place: {e}"))?;

    // fsync the directory so the renames themselves are durable.
    if let Ok(d) = File::open(&dir) {
        let _ = d.sync_all();
    }
    Ok(())
}

fn is_valid_json(path: &Path) -> bool {
    fs::read_to_string(path)
        .map(|text| serde_json::from_str::<serde_json::Value>(&text).is_ok())
        .unwrap_or(false)
}
