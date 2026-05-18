use tokio::sync::mpsc;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum ActivityEvent {
    KeyPress,
    MouseMove,
    MouseClick,
}

pub struct ActivityMonitor {
    #[allow(dead_code)]
    tx: mpsc::Sender<ActivityEvent>,
}

impl ActivityMonitor {
    pub fn new(tx: mpsc::Sender<ActivityEvent>) -> Self {
        Self { tx }
    }

    pub fn start(&self) {
        // TODO: wire up rdev global listener
    }
}
