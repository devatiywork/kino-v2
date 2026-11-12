//! «Проверить камеру» in the settings: is there a camera, and does it see the one checking

use std::time::{Duration, Instant};

use serde::Serialize;

use super::{enter_apartment, open_source, Unavailable};

/// The first frames may take a moment after the camera opens
const CHECK_FOR: Duration = Duration::from_secs(4);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum CameraCheck {
    /// The camera's name and the faces in its frame
    Seen { camera: String, faces: usize },
    Unavailable { reason: Unavailable },
}

/// Opens the camera for a few seconds; a face in any frame is enough
fn check() -> CameraCheck {
    enter_apartment();
    let source = match open_source() {
        Ok(source) => source,
        Err(e) => return CameraCheck::Unavailable { reason: Unavailable::from(&e) },
    };
    let started = Instant::now();
    let mut faces = 0;
    while started.elapsed() < CHECK_FOR && faces == 0 {
        std::thread::sleep(Duration::from_millis(250));
        match source.faces() {
            Ok(Some(found)) => faces = found,
            Ok(None) => {}
            Err(e) => return CameraCheck::Unavailable { reason: Unavailable::from(&e) },
        }
    }
    CameraCheck::Seen { camera: source.name().to_string(), faces }
}

#[tauri::command]
pub async fn presence_check() -> CameraCheck {
    match tauri::async_runtime::spawn_blocking(check).await {
        Ok(result) => result,
        Err(e) => {
            eprintln!("[presence] check: {e}");
            CameraCheck::Unavailable { reason: Unavailable::Other }
        }
    }
}
