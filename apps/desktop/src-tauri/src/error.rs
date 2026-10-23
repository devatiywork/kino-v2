use serde::{Serialize, Serializer};

/// Error of a Tauri command; reaches the renderer as a plain message
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("mpv: {0}")]
    Mpv(#[from] libmpv2::Error),
    #[error("window: {0}")]
    Window(#[from] windows::core::Error),
    #[error("database: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("not a folder: {0}")]
    NotAFolder(String),
    #[error("background task: {0}")]
    Task(String),
    #[error("settings: {0}")]
    Settings(#[from] crate::settings::SettingsError),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Tauri(#[from] tauri::Error),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
