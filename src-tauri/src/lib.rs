use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tauri_plugin_store::StoreExt;

pub mod activity;
pub mod persistence;
pub mod pet_state;
pub mod progression;

pub struct ActivityShared(pub Arc<Mutex<activity::ActivityState>>);
pub struct PetStateShared(pub Arc<Mutex<pet_state::PetState>>);

const STORE_FILE: &str = "pawgress.json";
const STORE_KEY: &str = "pet_state";

#[tauri::command]
fn get_activity(state: tauri::State<ActivityShared>) -> activity::ActivitySnapshot {
    state.0.lock().unwrap().snapshot()
}

#[tauri::command]
fn get_pet_state(state: tauri::State<PetStateShared>) -> pet_state::PetState {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn reset_pet_state(state: tauri::State<PetStateShared>, app: tauri::AppHandle) {
    let fresh = pet_state::PetState::default();
    *state.0.lock().unwrap() = fresh.clone();
    if let Ok(store) = app.store(STORE_FILE) {
        if let Ok(value) = serde_json::to_value(&fresh) {
            store.set(STORE_KEY, value);
            store.save().ok();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_activity = Arc::new(Mutex::new(activity::ActivityState::default()));
    let shared_pet = Arc::new(Mutex::new(pet_state::PetState::default()));

    let activity_for_monitor = shared_activity.clone();
    let activity_for_tick = shared_activity.clone();
    let pet_for_setup = shared_pet.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(ActivityShared(shared_activity))
        .manage(PetStateShared(shared_pet))
        .setup(move |app| {
            // Restore persisted pet state on startup
            if let Ok(store) = app.store(STORE_FILE) {
                if let Some(saved) = store
                    .get(STORE_KEY)
                    .and_then(|v| serde_json::from_value::<pet_state::PetState>(v).ok())
                {
                    *pet_for_setup.lock().unwrap() = saved;
                }
            }

            activity::start(activity_for_monitor);

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval =
                    tokio::time::interval(std::time::Duration::from_secs(1));
                let mut prev_clicks: u64 = 0;
                let mut prev_moves: u64 = 0;
                let mut tick_count: u32 = 0;

                loop {
                    interval.tick().await;
                    tick_count += 1;

                    let snapshot = activity_for_tick.lock().unwrap().snapshot();
                    let cl_delta = snapshot.mouse_clicks.saturating_sub(prev_clicks);
                    let mv_delta = snapshot.mouse_moves.saturating_sub(prev_moves);
                    prev_clicks = snapshot.mouse_clicks;
                    prev_moves = snapshot.mouse_moves;

                    {
                        let mut pet = pet_for_setup.lock().unwrap();
                        if cl_delta > 0 || mv_delta > 0 {
                            pet.apply_activity(cl_delta, mv_delta);
                        }
                        pet.apply_decay(1.0, snapshot.is_idle);
                        progression::try_level_up(&mut pet.stats);
                        pet.resolve_emotion();
                    }

                    // Persist every 30 seconds
                    if tick_count % 30 == 0 {
                        let pet_snap = pet_for_setup.lock().unwrap().clone();
                        if let Ok(store) = handle.store(STORE_FILE) {
                            if let Ok(value) = serde_json::to_value(&pet_snap) {
                                store.set(STORE_KEY, value);
                                store.save().ok();
                            }
                        }
                    }

                    let pet_snapshot = pet_for_setup.lock().unwrap().clone();
                    handle.emit("activity-update", &snapshot).ok();
                    handle.emit("pet-state-update", &pet_snapshot).ok();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_activity, get_pet_state, reset_pet_state])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
