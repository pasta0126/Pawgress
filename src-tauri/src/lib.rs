pub mod activity;
pub mod persistence;
pub mod pet_state;
pub mod progression;

#[tauri::command]
fn get_pet_state() -> pet_state::PetState {
    pet_state::PetState::default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![get_pet_state])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
