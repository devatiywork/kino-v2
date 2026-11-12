//! The webcam as a face counter: Windows' own capture (Media Foundation through WinRT) and its
//! built-in face detector (Windows.Media.FaceAnalysis) — no model to ship, nothing leaves the
//! process, no frame is kept. Shared read-only when it can, so a video call keeps the camera.
//! Lives on one thread: WinRT here wants the thread in the multithreaded apartment

use windows::core::{Error, HSTRING};
use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Capture::Frames::{
    MediaFrameReader, MediaFrameReaderAcquisitionMode, MediaFrameReaderStartStatus, MediaFrameSourceGroup, MediaFrameSourceKind,
};
use windows::Media::Capture::{
    MediaCapture, MediaCaptureInitializationSettings, MediaCaptureMemoryPreference, MediaCaptureSharingMode, MediaStreamType,
    StreamingCaptureMode,
};
use windows::Media::FaceAnalysis::FaceDetector;
use windows::Media::MediaProperties::MediaEncodingSubtypes;

/// Why there is no camera to look through
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CameraError {
    /// No webcam at all
    NoCamera,
    /// Windows' privacy settings keep desktop apps away from the camera
    Denied,
    /// Windows has no face detector here
    NoDetector,
    Other(String),
}

impl std::fmt::Display for CameraError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CameraError::NoCamera => write!(f, "no camera"),
            CameraError::Denied => write!(f, "camera access denied"),
            CameraError::NoDetector => write!(f, "no face detector"),
            CameraError::Other(e) => write!(f, "{e}"),
        }
    }
}

impl From<Error> for CameraError {
    fn from(e: Error) -> Self {
        // E_ACCESSDENIED: «Разрешить классическим приложениям доступ к камере» is off
        if e.code().0 == 0x8007_0005_u32 as i32 {
            CameraError::Denied
        } else {
            CameraError::Other(format!("{e}"))
        }
    }
}

pub struct FaceCamera {
    name: String,
    capture: MediaCapture,
    reader: MediaFrameReader,
    detector: FaceDetector,
}

impl FaceCamera {
    /// The first webcam with a colour stream, its frames on the CPU
    pub fn open() -> Result<Self, CameraError> {
        if !FaceDetector::IsSupported()? {
            return Err(CameraError::NoDetector);
        }
        let (group, source_id) = color_source()?.ok_or(CameraError::NoCamera)?;
        let name = group.DisplayName().map(|n| n.to_string()).unwrap_or_default();
        let capture = initialize(&group, MediaCaptureSharingMode::SharedReadOnly)
            .or_else(|_| initialize(&group, MediaCaptureSharingMode::ExclusiveControl))?;
        let source = capture.FrameSources()?.Lookup(&source_id)?;
        let reader = capture.CreateFrameReaderWithSubtypeAsync(&source, &MediaEncodingSubtypes::Nv12()?)?.get()?;
        reader.SetAcquisitionMode(MediaFrameReaderAcquisitionMode::Realtime)?;
        let status = reader.StartAsync()?.get()?;
        if status != MediaFrameReaderStartStatus::Success {
            let _ = capture.Close();
            return Err(match status {
                MediaFrameReaderStartStatus::DeviceNotAvailable => CameraError::NoCamera,
                other => CameraError::Other(format!("frame reader: {}", other.0)),
            });
        }
        let detector = FaceDetector::CreateAsync()?.get()?;
        Ok(Self { name, capture, reader, detector })
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    /// Faces in the newest frame; None — no new frame yet
    pub fn faces(&self) -> Result<Option<usize>, CameraError> {
        let Ok(frame) = self.reader.TryAcquireLatestFrame() else { return Ok(None) };
        let Ok(bitmap) = frame.VideoMediaFrame().and_then(|v| v.SoftwareBitmap()) else { return Ok(None) };
        let bitmap = if FaceDetector::IsBitmapPixelFormatSupported(bitmap.BitmapPixelFormat()?)? {
            bitmap
        } else {
            SoftwareBitmap::Convert(&bitmap, BitmapPixelFormat::Gray8)?
        };
        let faces = self.detector.DetectFacesAsync(&bitmap)?.get()?;
        Ok(Some(faces.Size()? as usize))
    }
}

impl Drop for FaceCamera {
    fn drop(&mut self) {
        if let Ok(stop) = self.reader.StopAsync() {
            let _ = stop.get();
        }
        if let Err(e) = self.capture.Close() {
            eprintln!("[presence] close the camera: {e}");
        }
    }
}

/// The first group with a colour source (a webcam; an IR sensor alone is no use here)
fn color_source() -> Result<Option<(MediaFrameSourceGroup, HSTRING)>, CameraError> {
    for group in MediaFrameSourceGroup::FindAllAsync()?.get()? {
        for info in group.SourceInfos()? {
            let stream = info.MediaStreamType()?;
            if info.SourceKind()? == MediaFrameSourceKind::Color && (stream == MediaStreamType::VideoPreview || stream == MediaStreamType::VideoRecord) {
                let id = info.Id()?;
                return Ok(Some((group, id)));
            }
        }
    }
    Ok(None)
}

fn initialize(group: &MediaFrameSourceGroup, sharing: MediaCaptureSharingMode) -> Result<MediaCapture, CameraError> {
    let settings = MediaCaptureInitializationSettings::new()?;
    settings.SetSourceGroup(group)?;
    settings.SetSharingMode(sharing)?;
    settings.SetMemoryPreference(MediaCaptureMemoryPreference::Cpu)?;
    settings.SetStreamingCaptureMode(StreamingCaptureMode::Video)?;
    let capture = MediaCapture::new()?;
    capture.InitializeWithSettingsAsync(&settings)?.get()?;
    Ok(capture)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    /// The owner's own webcam, with the owner in front of it: faces each second for 10 s.
    /// cargo test --lib presence::camera -- --ignored --nocapture
    #[test]
    #[ignore]
    fn the_webcam_sees_a_face() {
        // SAFETY: this test's own thread joins the multithreaded apartment
        unsafe { windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED) }.unwrap();
        let started = Instant::now();
        let camera = FaceCamera::open().unwrap();
        println!("camera «{}» open in {:?}", camera.name(), started.elapsed());
        let mut seen = 0;
        for second in 0..10 {
            std::thread::sleep(Duration::from_secs(1));
            let at = Instant::now();
            let faces = camera.faces().unwrap();
            println!("{second:>2} s: faces {faces:?} ({:?})", at.elapsed());
            if faces.unwrap_or(0) > 0 {
                seen += 1;
            }
        }
        drop(camera);
        assert!(seen > 0, "no face in 10 seconds");
    }
}
