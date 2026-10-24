//! The ad blocker inside the trackers' WebView2. Every request of the page — of its frames and
//! workers too — passes WebResourceRequested; an ad gets an empty 403. When the document is
//! parsed, and once more a moment later for what scripts add, the page gets a style hiding the
//! ad elements. Kino reads the page's classes as ExecuteScript's result: the page itself never
//! gets a way to call Kino.

use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use tauri::{Url, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::*;
use webview2_com::{take_pwstr, DOMContentLoadedEventHandler, ExecuteScriptCompletedHandler, WebResourceRequestedEventHandler};
use windows_core::{Interface, HSTRING, PWSTR};

use super::adblock::AdBlocker;

/// What the blocker needs from the trackers browser
pub struct Context {
    pub blocker: Arc<AdBlocker>,
    /// «Блокировать рекламу» of the settings, read at every request
    pub enabled: Box<dyn Fn() -> bool + Send + Sync>,
    /// The page shown or being opened: its own navigation is never stopped
    pub page: Box<dyn Fn() -> Option<String> + Send + Sync>,
    /// One more request stopped on this page
    pub blocked: Box<dyn Fn() + Send + Sync>,
}

/// What the generic rules look at: the page's classes and ids
const COLLECT: &str = "(() => { const c = new Set(), i = new Set(); \
    for (const el of document.querySelectorAll('[class],[id]')) { for (const n of el.classList) c.add(n); if (el.id) i.add(el.id) } \
    return { c: [...c].slice(0, 20000), i: [...i].slice(0, 20000) } })()";
/// What scripts add after the document: hidden on the second look
const SECOND_LOOK: Duration = Duration::from_millis(2500);
/// How long a page faster than the engine waits for it
const ENGINE_WAIT: Duration = Duration::from_secs(15);

#[derive(Deserialize)]
struct Found {
    c: Vec<String>,
    i: Vec<String>,
}

/// The request's type as the lists name it. A document is a frame: the page's own navigation
/// never comes here (`is_page`)
pub fn kind_of(context: COREWEBVIEW2_WEB_RESOURCE_CONTEXT) -> &'static str {
    match context {
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT => "sub_frame",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_STYLESHEET => "stylesheet",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE => "image",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA => "media",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT => "font",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT => "script",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST | COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH | COREWEBVIEW2_WEB_RESOURCE_CONTEXT_EVENT_SOURCE => {
            "xmlhttprequest"
        }
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_WEBSOCKET => "websocket",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_PING => "ping",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_CSP_VIOLATION_REPORT => "csp_report",
        _ => "other",
    }
}

/// The page's own document: the address being opened or shown, or its site. A click on a link
/// to another site is that site's navigation, also never stopped
pub fn is_page(url: &str, page: Option<&str>) -> bool {
    let (Ok(url), Some(Ok(page))) = (Url::parse(url), page.map(Url::parse)) else { return false };
    url == page || url.host_str() == page.host_str()
}

pub fn attach(webview: &Webview, context: Context) -> tauri::Result<()> {
    let context = Arc::new(context);
    let for_loaded = webview.clone();
    webview.with_webview(move |platform| {
        // SAFETY: the controller belongs to this webview; with_webview runs on the main thread
        let result = unsafe { platform.controller().CoreWebView2().and_then(|core| watch(&core, context, for_loaded)) };
        if let Err(e) = result {
            eprintln!("[adblock] attach: {e}");
        }
    })
}

/// SAFETY: on the main thread, with the webview's live ICoreWebView2
unsafe fn watch(core: &ICoreWebView2, context: Arc<Context>, webview: Webview) -> windows_core::Result<()> {
    let any = HSTRING::from("*");
    // Frames' and workers' requests too (runtime 1.0.2478+); an older one sees the page's own
    match core.cast::<ICoreWebView2_22>() {
        Ok(core) => unsafe {
            core.AddWebResourceRequestedFilterWithRequestSourceKinds(&any, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL, COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL)?
        },
        Err(_) => unsafe { core.AddWebResourceRequestedFilter(&any, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL)? },
    }
    let core2 = core.cast::<ICoreWebView2_2>()?;
    let environment = unsafe { core2.Environment()? };
    let (mut requested_token, mut loaded_token) = (0, 0);
    unsafe {
        core.add_WebResourceRequested(&on_request(context.clone(), environment), &mut requested_token)?;
        core2.add_DOMContentLoaded(&on_loaded(context, webview), &mut loaded_token)
    }
}

/// An ad request gets an empty 403
fn on_request(context: Arc<Context>, environment: ICoreWebView2Environment) -> ICoreWebView2WebResourceRequestedEventHandler {
    WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
        let Some(args) = args else { return Ok(()) };
        if !(context.enabled)() {
            return Ok(());
        }
        let (mut uri, mut resource) = (PWSTR::null(), COREWEBVIEW2_WEB_RESOURCE_CONTEXT_OTHER);
        // SAFETY: the event's own arguments, during the event, on the main thread
        unsafe {
            args.Request()?.Uri(&mut uri)?;
            args.ResourceContext(&mut resource)?;
        }
        let url = take_pwstr(uri);
        let page = (context.page)();
        if resource == COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT && is_page(&url, page.as_deref()) {
            return Ok(());
        }
        if context.blocker.blocks(&url, page.as_deref().unwrap_or(&url), kind_of(resource)) {
            // SAFETY: as above; the environment is the webview's own
            unsafe {
                let response = environment.CreateWebResourceResponse(None, 403, &HSTRING::from("Blocked by Kino"), &HSTRING::new())?;
                args.SetResponse(&response)?;
            }
            (context.blocked)();
        }
        Ok(())
    }))
}

/// The parsed document gets its hiding style; a second look a moment later. A page faster than
/// the engine (the first one after Kino starts) gets it as soon as the engine is ready
fn on_loaded(context: Arc<Context>, webview: Webview) -> ICoreWebView2DOMContentLoadedEventHandler {
    DOMContentLoadedEventHandler::create(Box::new(move |sender, _| {
        let Some(core) = sender else { return Ok(()) };
        if !(context.enabled)() {
            return Ok(());
        }
        if context.blocker.is_ready() {
            // SAFETY: the sender of the event, on the main thread
            return unsafe { hide(&core, &context.blocker, &webview) };
        }
        let (webview, blocker) = (webview.clone(), context.blocker.clone());
        std::thread::spawn(move || {
            if blocker.wait_ready(ENGINE_WAIT) {
                later(&webview, move |core, webview| unsafe { hide(core, &blocker, webview) });
            }
        });
        Ok(())
    }))
}

/// The style of the page shown now: its site's rules and the generic ones, again a moment later
/// SAFETY: on the main thread, with the webview's live ICoreWebView2
unsafe fn hide(core: &ICoreWebView2, blocker: &Arc<AdBlocker>, webview: &Webview) -> windows_core::Result<()> {
    let mut source = PWSTR::null();
    unsafe { core.Source(&mut source)? };
    let Some(style) = blocker.page_style(&take_pwstr(source)) else { return Ok(()) };
    unsafe { inject(core, &style.css)? };
    let Some(exceptions) = style.generic else { return Ok(()) };
    let exceptions = Arc::new(exceptions);
    unsafe { hide_generic(core, blocker.clone(), exceptions.clone())? };
    let (webview, blocker) = (webview.clone(), blocker.clone());
    std::thread::spawn(move || {
        std::thread::sleep(SECOND_LOOK);
        later(&webview, move |core, _| unsafe { hide_generic(core, blocker, exceptions) });
    });
    Ok(())
}

/// `work` on the main thread with the webview's ICoreWebView2, from any thread
fn later(webview: &Webview, work: impl FnOnce(&ICoreWebView2, &Webview) -> windows_core::Result<()> + Send + 'static) {
    let target = webview.clone();
    let result = webview.with_webview(move |platform| {
        // SAFETY: with_webview runs on the main thread with the live controller
        let result = unsafe { platform.controller().CoreWebView2() }.and_then(|core| work(&core, &target));
        if let Err(e) = result {
            eprintln!("[adblock] style: {e}");
        }
    });
    if let Err(e) = result {
        eprintln!("[adblock] style: {e}");
    }
}

/// The generic rules for the classes and ids the page has now
unsafe fn hide_generic(core: &ICoreWebView2, blocker: Arc<AdBlocker>, exceptions: Arc<std::collections::HashSet<String>>) -> windows_core::Result<()> {
    let target = core.clone();
    let collected = ExecuteScriptCompletedHandler::create(Box::new(move |result, json| {
        result?;
        let Ok(found) = serde_json::from_str::<Found>(&json) else { return Ok(()) };
        // SAFETY: the completion comes on the main thread, the webview is alive
        unsafe { inject(&target, &blocker.generic_style(&found.c, &found.i, &exceptions)) }
    }));
    unsafe { core.ExecuteScript(&HSTRING::from(COLLECT), &collected) }
}

/// A style in the page; nothing when there is nothing to hide
unsafe fn inject(core: &ICoreWebView2, css: &str) -> windows_core::Result<()> {
    if css.is_empty() {
        return Ok(());
    }
    let css = serde_json::to_string(css).unwrap_or_default();
    let script = format!(
        "(() => {{ const s = document.createElement('style'); s.dataset.kino = 'adblock'; s.textContent = {css}; (document.head || document.documentElement).appendChild(s) }})()"
    );
    unsafe { core.ExecuteScript(&HSTRING::from(script), None) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_pages_own_document_is_never_stopped() {
        let page = Some("https://rutracker.org/forum/viewtopic.php?t=1");
        assert!(is_page("https://rutracker.org/forum/viewtopic.php?t=1", page));
        assert!(is_page("https://rutracker.org/forum/index.php", page), "its own site");
        assert!(!is_page("https://ads.example/frame.html", page), "a frame of another site is checked");
        assert!(!is_page("https://ads.example/", None));
    }

    #[test]
    fn webview2s_resource_contexts_as_the_lists_name_them() {
        assert_eq!(kind_of(COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT), "sub_frame");
        assert_eq!(kind_of(COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH), "xmlhttprequest");
        assert_eq!(kind_of(COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE), "image");
        assert_eq!(kind_of(COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MANIFEST), "other");
    }
}
