use rdev::{listen, Event, EventType};
use std::sync::{Arc, Mutex};
use std::time::Instant;

const IDLE_THRESHOLD_SECS: u64 = 30;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ActivitySnapshot {
    pub mouse_moves: u64,
    pub mouse_clicks: u64,
    pub mouse_scrolls: u64,
    pub idle_secs: u64,
    pub is_idle: bool,
}

#[derive(Debug)]
pub struct ActivityState {
    pub mouse_moves: u64,
    pub mouse_clicks: u64,
    pub mouse_scrolls: u64,
    pub last_activity: Instant,
}

impl Default for ActivityState {
    fn default() -> Self {
        Self {
            mouse_moves: 0,
            mouse_clicks: 0,
            mouse_scrolls: 0,
            last_activity: Instant::now(),
        }
    }
}

impl ActivityState {
    pub fn snapshot(&self) -> ActivitySnapshot {
        let idle_secs = self.last_activity.elapsed().as_secs();
        ActivitySnapshot {
            mouse_moves: self.mouse_moves,
            mouse_clicks: self.mouse_clicks,
            mouse_scrolls: self.mouse_scrolls,
            idle_secs,
            is_idle: idle_secs >= IDLE_THRESHOLD_SECS,
        }
    }

    fn record(&mut self, event_type: &EventType) {
        self.last_activity = Instant::now();
        // Privacy: only mouse event COUNTS are tracked — position and button
        // identity are intentionally discarded (.. and _ patterns).
        // No keyboard events are monitored.
        match event_type {
            EventType::MouseMove { .. }  => self.mouse_moves += 1,
            EventType::ButtonPress(_)    => self.mouse_clicks += 1,
            EventType::Wheel { .. }      => self.mouse_scrolls += 1,
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
