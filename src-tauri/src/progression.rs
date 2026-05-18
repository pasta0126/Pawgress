use crate::pet_state::PetStats;

const XP_PER_LEVEL: u32 = 100;

pub fn xp_for_next_level(level: u32) -> u32 {
    level * XP_PER_LEVEL
}

pub fn try_level_up(stats: &mut PetStats) -> bool {
    let threshold = xp_for_next_level(stats.level);
    if stats.xp >= threshold {
        stats.xp -= threshold;
        stats.level += 1;
        return true;
    }
    false
}
