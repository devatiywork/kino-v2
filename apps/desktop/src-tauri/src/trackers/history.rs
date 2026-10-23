//! Back and forward through WebView2's own history: across sites, whatever the page does with
//! `history`, and the toolbar knows whether there is a way back at all. Tauri exposes no history
//! of its own, so this goes to the WebView2 controller under the webview.

use tauri::Webview;
use webview2_com::HistoryChangedEventHandler;
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
use windows_core::BOOL;

/// (back, forward): is there a page to go to
fn can_go(core: &ICoreWebView2) -> windows_core::Result<(bool, bool)> {
    let (mut back, mut forward) = (BOOL::default(), BOOL::default());
    // SAFETY: plain property reads of a live ICoreWebView2 on its own (the main) thread
    unsafe {
        core.CanGoBack(&mut back)?;
        core.CanGoForward(&mut forward)?;
    }
    Ok((back.as_bool(), forward.as_bool()))
}

/// `changed(back, forward)` after every change of the history (each navigation, back, forward)
pub fn watch(webview: &Webview, changed: impl Fn(bool, bool) + Send + 'static) -> tauri::Result<()> {
    webview.with_webview(move |platform| {
        let handler = HistoryChangedEventHandler::create(Box::new(move |sender, _| {
            if let Some(core) = sender {
                let (back, forward) = can_go(&core)?;
                changed(back, forward);
            }
            Ok(())
        }));
        let mut token = 0;
        // SAFETY: the controller belongs to this webview; with_webview runs on the main thread
        let result = unsafe { platform.controller().CoreWebView2().and_then(|core| core.add_HistoryChanged(&handler, &mut token)) };
        if let Err(e) = result {
            eprintln!("[trackers] history: {e}");
        }
    })
}

/// One page back (`true`) or forward
pub fn step(webview: &Webview, back: bool) -> tauri::Result<()> {
    webview.with_webview(move |platform| {
        // SAFETY: as in `watch`
        let result = unsafe {
            platform.controller().CoreWebView2().and_then(|core| if back { core.GoBack() } else { core.GoForward() })
        };
        if let Err(e) = result {
            eprintln!("[trackers] {}: {e}", if back { "back" } else { "forward" });
        }
    })
}
