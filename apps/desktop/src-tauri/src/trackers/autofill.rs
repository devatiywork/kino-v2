//! «Сохранять пароли сайтов»: WebView2's own password manager in the trackers browser. After a
//! login it offers to save the password, next time it fills the form in. The passwords stay in
//! WebView2's profile inside Kino's data folder, encrypted by Windows for this user: Kino never
//! sees them. The profile is shared with Kino's own window, so they can be deleted from there too.

use std::sync::{Arc, Mutex};

use tauri::Webview;
use webview2_com::ClearBrowsingDataCompletedHandler;
use webview2_com::Microsoft::Web::WebView2::Win32::*;
use windows_core::{Interface, BOOL};

/// Saving on or off for this webview; filling in forms stays on
pub fn set_saving(webview: &Webview, on: bool) -> tauri::Result<()> {
    webview.with_webview(move |platform| {
        // SAFETY: the controller belongs to this webview; with_webview runs on the main thread
        let result = unsafe {
            platform.controller().CoreWebView2().and_then(|core| core.Settings()).and_then(|settings| settings.cast::<ICoreWebView2Settings4>()).and_then(
                |settings| {
                    settings.SetIsPasswordAutosaveEnabled(on)?;
                    settings.SetIsGeneralAutofillEnabled(true)
                },
            )
        };
        if let Err(e) = result {
            eprintln!("[trackers] password saving: {e}");
        }
    })
}

/// Whether this webview offers to save passwords now
pub async fn is_saving(webview: &Webview) -> tauri::Result<bool> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    webview.with_webview(move |platform| {
        let mut value = BOOL::default();
        // SAFETY: as in `set_saving`
        let result = unsafe {
            platform
                .controller()
                .CoreWebView2()
                .and_then(|core| core.Settings())
                .and_then(|settings| settings.cast::<ICoreWebView2Settings4>())
                .and_then(|settings| settings.IsPasswordAutosaveEnabled(&mut value))
        };
        let _ = sender.send(result.map(|()| value.as_bool()));
    })?;
    receiver.await.map_err(|e| tauri::Error::Anyhow(e.into()))?.map_err(|e| tauri::Error::Anyhow(e.into()))
}

/// The saved passwords and the form data of every site — of the profile this webview shares
pub async fn clear(webview: &Webview) -> tauri::Result<()> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let reply = Arc::new(Mutex::new(Some(sender)));
    let answer = move |reply: &Reply, result: windows_core::Result<()>| {
        if let Some(sender) = reply.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).take() {
            let _ = sender.send(result);
        }
    };
    webview.with_webview(move |platform| {
        let on_done = reply.clone();
        let handler = ClearBrowsingDataCompletedHandler::create(Box::new(move |result| {
            answer(&on_done, result);
            Ok(())
        }));
        let kinds = COREWEBVIEW2_BROWSING_DATA_KINDS(COREWEBVIEW2_BROWSING_DATA_KINDS_PASSWORD_AUTOSAVE.0 | COREWEBVIEW2_BROWSING_DATA_KINDS_GENERAL_AUTOFILL.0);
        // SAFETY: as in `set_saving`; the completion comes back on the main thread
        let started = unsafe {
            platform
                .controller()
                .CoreWebView2()
                .and_then(|core| core.cast::<ICoreWebView2_13>())
                .and_then(|core| core.Profile())
                .and_then(|profile| profile.cast::<ICoreWebView2Profile2>())
                .and_then(|profile| profile.ClearBrowsingData(kinds, &handler))
        };
        if let Err(e) = started {
            answer(&reply, Err(e));
        }
    })?;
    receiver.await.map_err(|e| tauri::Error::Anyhow(e.into()))?.map_err(|e| tauri::Error::Anyhow(e.into()))
}

type Reply = Arc<Mutex<Option<tokio::sync::oneshot::Sender<windows_core::Result<()>>>>>;
