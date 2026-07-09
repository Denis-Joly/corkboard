mod commands;
mod paths;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::save::save_board,
            commands::import::import_asset,
            commands::import::import_asset_bytes,
            commands::trash::trash_path,
            commands::clean::clean_board,
            commands::clipboard::read_clipboard_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
