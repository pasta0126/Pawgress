use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetStats {
    pub hunger: f32,
    pub mood: f32,
    pub energy: f32,
    pub xp: u32,
    pub level: u32,
    pub last_updated: DateTime<Utc>,
}

impl Default for PetStats {
    fn default() -> Self {
        Self {
            hunger: 80.0,
            mood: 80.0,
            energy: 80.0,
            xp: 0,
            level: 1,
            last_updated: Utc::now(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum EmotionalState {
    Happy,
    Neutral,
    Tired,
    Excited,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetState {
    pub stats: PetStats,
    pub emotion: EmotionalState,
}

impl Default for PetState {
    fn default() -> Self {
        Self {
            stats: PetStats::default(),
            emotion: EmotionalState::Neutral,
        }
    }
}

impl PetState {
    pub fn apply_activity(&mut self) {
        // TODO: increase xp and mood on activity events
    }

    pub fn apply_decay(&mut self, _elapsed_secs: f32) {
        // TODO: time-based stat decay (issue #7)
    }

    pub fn resolve_emotion(&mut self) {
        self.emotion = match self.stats.mood {
            m if m >= 80.0 => EmotionalState::Happy,
            m if m >= 60.0 => EmotionalState::Neutral,
            m if m >= 40.0 => EmotionalState::Tired,
            _ => EmotionalState::Tired,
        };
    }
}
