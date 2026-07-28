use std::fs::{self, File};
use std::io::{BufReader, Read, Write};
use std::path::Path;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::paths;

/// How much of the sha256 hex digest becomes the asset filename prefix.
const HASH_PREFIX_LEN: usize = 16;
/// Byte cap (not chars — CJK/emoji names must stay under the macOS
/// 255-byte filename limit even with the hash prefix added).
const MAX_NAME_BYTES: usize = 120;

static TMP_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetMeta {
    /// Board-relative POSIX path, e.g. "assets/3f9a1c07e2b44d10_diagram.png".
    pub path: String,
    pub original_name: String,
    pub byte_size: u64,
    pub sha256: String,
    /// Present only when the file is a decodable image.
    pub natural_w: Option<u32>,
    pub natural_h: Option<u32>,
}

/// Copy a file from anywhere on disk into a board's assets folder,
/// content-addressed as `{sha256-16}_{sanitized name}` with dedup.
#[tauri::command]
pub async fn import_asset(
    app: tauri::AppHandle,
    src_path: String,
    board_dir: String,
) -> Result<AssetMeta, String> {
    let src = Path::new(&src_path)
        .canonicalize()
        .map_err(|e| format!("source file not readable: {src_path} ({e})"))?;
    if !src.is_file() {
        return Err(format!("not a file: {}", src.display()));
    }
    let original_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();

    let hash = hash_file(&src)?;
    store_asset(&app, &board_dir, &original_name, &hash, |dest| {
        fs::copy(&src, dest)
            .map(|_| ())
            .map_err(|e| format!("cannot copy file: {e}"))
    })
}

/// Same as `import_asset` but for in-memory bytes (clipboard images).
/// Called with a raw IPC body; the file name and board dir arrive as
/// percent-encoded headers so binary data never round-trips through JSON.
#[tauri::command]
pub async fn import_asset_bytes(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<AssetMeta, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected a raw body".into());
    };
    let name = header(&request, "x-file-name")?;
    let board_dir = header(&request, "x-board-dir")?;

    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let hash = hex(&hasher.finalize());

    store_asset(&app, &board_dir, &name, &hash, |dest| {
        let mut f = File::create(dest).map_err(|e| format!("cannot create asset: {e}"))?;
        f.write_all(bytes)
            .map_err(|e| format!("cannot write asset: {e}"))?;
        f.sync_all().map_err(|e| format!("cannot fsync asset: {e}"))
    })
}

/// Shared tail of both import paths: dedup by hash prefix, write via
/// `persist` to a unique tmp file (fsync + atomic rename — a failed
/// copy must never become the canonical content-addressed asset),
/// probe image dimensions, return metadata.
fn store_asset(
    app: &tauri::AppHandle,
    board_dir: &str,
    original_name: &str,
    hash: &str,
    persist: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<AssetMeta, String> {
    let dir = paths::validate_under_root(app, Path::new(board_dir))?;
    fs::create_dir_all(dir.join("assets")).map_err(|e| format!("cannot create assets dir: {e}"))?;
    // Re-validate AFTER resolving: assets/ could be a symlink escaping
    // the boards root (custom commands bypass plugin scopes).
    let assets = paths::validate_under_root(app, &dir.join("assets"))?;

    let prefix = &hash[..HASH_PREFIX_LEN];
    let file_name = match find_by_prefix(&assets, prefix)? {
        Some(existing) => existing,
        None => {
            let name = format!("{prefix}_{}", sanitize_name(original_name));
            let tmp = assets.join(format!(
                ".import-tmp-{}-{}",
                std::process::id(),
                TMP_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            let result = persist(&tmp)
                .and_then(|()| {
                    File::open(&tmp)
                        .and_then(|f| f.sync_all())
                        .map_err(|e| format!("cannot fsync asset: {e}"))
                })
                .and_then(|()| {
                    fs::rename(&tmp, assets.join(&name))
                        .map_err(|e| format!("cannot finalize asset: {e}"))
                });
            if let Err(e) = result {
                let _ = fs::remove_file(&tmp);
                return Err(e);
            }
            name
        }
    };

    let full = assets.join(&file_name);
    let byte_size = fs::metadata(&full)
        .map_err(|e| format!("cannot stat asset: {e}"))?
        .len();
    let dims = image::image_dimensions(&full).ok();

    Ok(AssetMeta {
        path: format!("assets/{file_name}"),
        original_name: original_name.to_string(),
        byte_size,
        sha256: hash.to_string(),
        natural_w: dims.map(|d| d.0),
        natural_h: dims.map(|d| d.1),
    })
}

fn find_by_prefix(assets: &Path, prefix: &str) -> Result<Option<String>, String> {
    let marker = format!("{prefix}_");
    let entries = fs::read_dir(assets).map_err(|e| format!("cannot read assets dir: {e}"))?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        if let Some(name) = name.to_str() {
            if name.starts_with(&marker) && entry.path().is_file() {
                return Ok(Some(name.to_string()));
            }
        }
    }
    Ok(None)
}

fn hash_file(path: &Path) -> Result<String, String> {
    let f = File::open(path).map_err(|e| format!("cannot open file: {e}"))?;
    let mut reader = BufReader::new(f);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("cannot read file: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex(&hasher.finalize()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Keep asset filenames filesystem- and URL-friendly while staying
/// recognizable: whitelist common characters, forbid a leading dot,
/// and cap the BYTE length preserving the extension.
fn sanitize_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || " ._-()".contains(c) {
                c
            } else {
                '_'
            }
        })
        .collect();
    let cleaned = cleaned.trim_start_matches(['.', ' ']).trim_end();
    let cleaned = if cleaned.is_empty() { "file" } else { cleaned };

    if cleaned.len() <= MAX_NAME_BYTES {
        return cleaned.to_string();
    }
    let (stem, ext) = match cleaned.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() && e.len() <= 16 => (s, format!(".{e}")),
        _ => (cleaned, String::new()),
    };
    let keep = MAX_NAME_BYTES.saturating_sub(ext.len());
    let stem = truncate_at_char_boundary(stem, keep);
    let result = format!("{stem}{ext}");
    if result.trim_start_matches(['.', ' ']).is_empty() {
        "file".to_string()
    } else {
        result
    }
}

fn truncate_at_char_boundary(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

fn header(request: &tauri::ipc::Request<'_>, key: &str) -> Result<String, String> {
    let raw = request
        .headers()
        .get(key)
        .ok_or_else(|| format!("missing header: {key}"))?
        .to_str()
        .map_err(|e| format!("invalid header {key}: {e}"))?;
    percent_decode(raw)
}

/// Minimal percent-decoding (frontend encodes with encodeURIComponent;
/// also used for file:// URLs from the pasteboard).
pub(crate) fn percent_decode(s: &str) -> Result<String, String> {
    let mut out = Vec::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return Err("truncated percent escape".into());
            }
            let h = std::str::from_utf8(&bytes[i + 1..i + 3])
                .ok()
                .and_then(|h| u8::from_str_radix(h, 16).ok())
                .ok_or("invalid percent escape")?;
            out.push(h);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|e| format!("invalid utf8 after decode: {e}"))
}
