use rdev::{listen, Event, EventType};
use std::sync::{Arc, Mutex};
use std::time::Instant;

const IDLE_THRESHOLD_SECS: u64 = 30;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ActivitySnapshot {
    pub keystrokes: u64,
    pub mouse_moves: u64,
    pub mouse_clicks: u64,
    pub idle_secs: u64,
    pub is_idle: bool,
}

#[derive(Debug)]
pub struct ActivityState {
    pub keystrokes: u64,
    pub mouse_moves: u64,
    pub mouse_clicks: u64,
    pub last_activity: Instant,
}

impl Default for ActivityState {
    fn default() -> Self {
        Self {
            keystrokes: 0,
            mouse_moves: 0,
            mouse_clicks: 0,
            last_activity: Instant::now(),
        }
    }
}

impl ActivityState {
    pub fn snapshot(&self) -> ActivitySnapshot {
        let idle_secs = self.last_activity.elapsed().as_secs();
        ActivitySnapshot {
            keystrokes: self.keystrokes,
            mouse_moves: self.mouse_moves,
            mouse_clicks: self.mouse_clicks,
            idle_secs,
            is_idle: idle_secs >= IDLE_THRESHOLD_SECS,
        }
    }

    fn record(&mut self, event_type: &EventType) {
        self.last_activity = Instant::now();
        match event_type {
            EventType::KeyPress(_) => self.keystrokes += 1,
            EventType::MouseMove { .. } => self.mouse_moves += 1,
            EventType::ButtonPress(_) => self.mouse_clicks += 1,
            _ => {}
        }
    }
}

pub fn start(shared: Arc<Mutex<ActivityState>>) {
    std::thread::spawn(move || {
        listen(move |event: Event| {
            if let Ok(mut state) = shared.lock() {
                state.record(&event.event_type);
            }
        })
        .ok();
    });
}
