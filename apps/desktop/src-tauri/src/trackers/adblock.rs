//! «Блокировать рекламу» (SPEC 4.5): the trackers' pages without their ads. RU AdList with
//! EasyList — a snapshot shipped inside Kino (filters/, refreshed for a release by
//! `bun scripts/fetch-filters.ts`): Kino never goes online for its lists (SPEC 4.7). Brave's
//! adblock engine decides which requests to stop and which elements to hide; blocking.rs puts it
//! into WebView2.

use std::collections::HashSet;
use std::sync::{Arc, OnceLock};

use adblock::lists::{FilterSet, ParseOptions};
use adblock::request::Request;
use adblock::Engine;

const LIST: &str = include_str!("../../filters/ruadlist+easylist.txt");

pub struct AdBlocker {
    engine: OnceLock<Engine>,
}

/// A page's own hiding rules and, unless the site excepts them, what the generic ones must skip
pub struct PageStyle {
    pub css: String,
    pub generic: Option<HashSet<String>>,
}

impl AdBlocker {
    /// The engine is made on a thread of its own (the list is ~110 000 lines): until it is ready
    /// nothing is blocked, the pages just load
    pub fn start() -> Arc<Self> {
        let blocker = Arc::new(Self { engine: OnceLock::new() });
        let filling = blocker.clone();
        let spawned = std::thread::Builder::new().name("adblock".into()).spawn(move || {
            // KINO_ADBLOCK_LIST — the tests' own rules instead of the shipped list
            let own = std::env::var_os("KINO_ADBLOCK_LIST").and_then(|path| std::fs::read_to_string(path).ok());
            let _ = filling.engine.set(engine_of(own.as_deref().unwrap_or(LIST)));
        });
        if let Err(e) = spawned {
            eprintln!("[adblock] thread: {e}");
        }
        blocker
    }

    #[cfg(test)]
    pub fn with_list(list: &str) -> Self {
        let engine = OnceLock::new();
        let _ = engine.set(engine_of(list));
        Self { engine }
    }

    pub fn is_ready(&self) -> bool {
        self.engine.get().is_some()
    }

    /// Waits up to `limit` for the engine (on a thread of its own, never the main one)
    pub fn wait_ready(&self, limit: std::time::Duration) -> bool {
        let deadline = std::time::Instant::now() + limit;
        while !self.is_ready() {
            if std::time::Instant::now() > deadline {
                return false;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        true
    }

    /// `kind` — the request's type as the lists name it: script, image, sub_frame…
    pub fn blocks(&self, url: &str, page: &str, kind: &str) -> bool {
        let Some(engine) = self.engine.get() else { return false };
        Request::new(url, page, kind, "get").is_ok_and(|request| engine.check_network_request(&request).should_block())
    }

    /// The style hiding this page's ad elements by the rules of its site
    pub fn page_style(&self, url: &str) -> Option<PageStyle> {
        let engine = self.engine.get()?;
        let resources = engine.url_cosmetic_resources(url);
        Some(PageStyle { css: css_of(resources.hide_selectors), generic: (!resources.generichide).then_some(resources.exceptions) })
    }

    /// The generic rules for the classes and ids the page has
    pub fn generic_style(&self, classes: &[String], ids: &[String], exceptions: &HashSet<String>) -> String {
        let Some(engine) = self.engine.get() else { return String::new() };
        css_of(engine.hidden_class_id_selectors(classes, ids, exceptions))
    }
}

fn engine_of(list: &str) -> Engine {
    let mut set = FilterSet::new(false);
    set.add_filter_list(list.to_string(), ParseOptions::default());
    Engine::new_with_filter_set(set)
}

/// One rule per selector: a selector Chromium does not know spoils only its own rule. A brace
/// would end the rule early — such a selector is dropped
pub fn css_of(selectors: impl IntoIterator<Item = String>) -> String {
    let mut selectors: Vec<String> = selectors.into_iter().filter(|s| !s.trim().is_empty() && !s.contains(['{', '}'])).collect();
    selectors.sort();
    selectors.iter().map(|selector| format!("{selector}{{display:none!important}}\n")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIST: &str = "\
||ads.example^
||cdn.example/banner/*$image
@@||ads.example/ok.js
tracker.example##.top-banner
##.adsbox
##div[data-ad-slot]
";

    #[test]
    fn requests_of_ad_servers_are_stopped_their_exceptions_pass() {
        let blocker = AdBlocker::with_list(LIST);
        let page = "https://tracker.example/topic/1";
        assert!(blocker.blocks("https://ads.example/show.js", page, "script"));
        assert!(blocker.blocks("https://ads.example/frame.html", page, "sub_frame"));
        assert!(!blocker.blocks("https://ads.example/ok.js", page, "script"), "an exception");
        assert!(blocker.blocks("https://cdn.example/banner/1.png", page, "image"));
        assert!(!blocker.blocks("https://cdn.example/banner/1.js", page, "script"), "only images there");
        assert!(!blocker.blocks("https://tracker.example/style.css", page, "stylesheet"));
        // A port is a separator of `^`
        let local = AdBlocker::with_list("||127.0.0.2^$image");
        assert!(local.blocks("http://127.0.0.2:51234/ads/banner.png", "http://127.0.0.1:51233/topic/1", "image"));
    }

    #[test]
    fn a_page_hides_its_sites_and_the_generic_ad_elements() {
        let blocker = AdBlocker::with_list(LIST);
        let style = blocker.page_style("https://tracker.example/topic/1").unwrap();
        assert!(style.css.contains(".top-banner{display:none!important}"), "{}", style.css);
        assert!(!blocker.page_style("https://other.example/").unwrap().css.contains(".top-banner"));
        let generic = blocker.generic_style(&["adsbox".into(), "post".into()], &[], &style.generic.unwrap());
        assert_eq!(generic, ".adsbox{display:none!important}\n");
    }

    #[test]
    fn a_selector_cannot_break_out_of_its_rule() {
        assert_eq!(css_of(["b".to_string(), "a }body{x".to_string(), " ".to_string()]), "b{display:none!important}\n");
    }

    #[test]
    fn the_shipped_list_knows_the_trackers_ads() {
        let blocker = AdBlocker::with_list(super::LIST);
        // A plain ad network from the list on any page
        assert!(blocker.blocks("https://an.yandex.ru/meta/1", "https://rutracker.org/forum/index.php", "script"));
        assert!(!blocker.blocks("https://rutracker.org/forum/dl.php?t=1", "https://rutracker.org/forum/viewtopic.php?t=1", "document"));
        // The tracker's own ad places
        let style = blocker.page_style("https://rutracker.org/forum/index.php").unwrap();
        assert!(style.css.contains("#idx-sidebar2 > div:not([id]):not([class]){display:none!important}"));
    }
}
