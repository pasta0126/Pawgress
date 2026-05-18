use crate::pet_state::PetState;

pub const STORE_KEY: &str = "pet_state";

pub fn serialize(state: &PetState) -> Result<String, serde_json::Error> {
    serde_json::to_string(state)
}

pub fn deserialize(raw: &str) -> Result<PetState, serde_json::Error> {
    serde_json::from_str(raw)
}
