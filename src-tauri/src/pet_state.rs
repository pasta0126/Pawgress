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
    Excited,
    Happy,
    Neutral,
    Tired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetState {
    pub stats: PetStats,
    pub emotion: EmotionalState,
}

impl Default for PetState {
    fn default() -> Self {
        let mut s = Self {
            stats: PetStats::default(),
            emotion: EmotionalState::Neutral,
        };
        s.resolve_emotion();
        s
    }
}

impl PetState {
    // clicks_delta: mouse button presses since last tick
    // moves_delta:  mouse movement events since last tick (sampled at 1Hz)
    pub fn apply_activity(&mut self, clicks_delta: u64, moves_delta: u64) {
        let cl = clicks_delta as f32;
        let mv = moves_delta as f32;

        // Clicks earn more XP than passive movement
        self.stats.xp += clicks_delta as u32 * 3 + (moves_delta / 20) as u32;
        // Active mouse use boosts mood (capped per tick)
        self.stats.mood = (self.stats.mood + (cl * 0.8 + mv * 0.01).min(4.0)).min(100.0);
        // Working makes the gotchi hungry
        self.stats.hunger = (self.stats.hunger - (cl * 0.15 + mv * 0.005).min(2.0)).max(0.0);
        self.stats.last_updated = Utc::now();
    }

    pub fn feed(&mut self) {
        self.stats.hunger = (self.stats.hunger + 25.0).min(100.0);
        self.stats.energy = (self.stats.energy + 10.0).min(100.0);
        self.stats.mood   = (self.stats.mood   + 5.0).min(100.0);
        self.stats.last_updated = Utc::now();
        self.resolve_emotion();
    }

    pub fn apply_decay(&mut self, elapsed_secs: f32, is_idle: bool) {
        // Hunger always drains (~33 min from full to empty at rest)
        self.stats.hunger = (self.stats.hunger - elapsed_secs * 0.05).max(0.0);

        if is_idle {
            // Resting recovers energy but boredom erodes mood
            self.stats.energy = (self.stats.energy + elapsed_secs * 0.3).min(100.0);
            self.stats.mood = (self.stats.mood - elapsed_secs * 0.08).max(0.0);
        } else {
            // Working slowly drains energy
            self.stats.energy = (self.stats.energy - elapsed_secs * 0.04).max(0.0);
        }

        self.stats.last_updated = Utc::now();
    }

    pub fn resolve_emotion(&mut self) {
        self.emotion = if self.stats.mood >= 85.0 && self.stats.energy > 60.0 {
            EmotionalState::Excited
        } else if self.stats.mood >= 65.0 {
            EmotionalState::Happy
        } else if self.stats.mood >= 40.0 {
            EmotionalState::Neutral
        } else {
            EmotionalState::Tired
        };
    }
}
