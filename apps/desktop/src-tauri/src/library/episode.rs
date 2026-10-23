//! Series and episode from a file path (SPEC 3.3): S02E05, 2x05, «Серия 5».
//! The series key ties episodes together for the track memory; it never uses track numbers.

use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EpisodeInfo {
    /// Show name from the file name, if it has one before the episode mark
    pub show: Option<String>,
    pub season: Option<u32>,
    pub episode: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileInfo {
    /// Readable title of the file itself
    pub title: String,
    /// Key and display title of the series; None for a single video (a film)
    pub series: Option<(String, String)>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
}

fn boundary_before(c: &[char], i: usize) -> bool {
    i == 0 || !c[i - 1].is_alphanumeric()
}

fn boundary_after(c: &[char], i: usize) -> bool {
    i >= c.len() || !c[i].is_alphanumeric()
}

/// 1..=max ASCII digits at `i` not followed by another digit
fn digits(c: &[char], i: usize, max: usize) -> Option<(u32, usize)> {
    let mut end = i;
    while end < c.len() && c[end].is_ascii_digit() {
        end += 1;
    }
    let len = end - i;
    if len == 0 || len > max {
        return None;
    }
    let value = c[i..end].iter().collect::<String>().parse().ok()?;
    Some((value, end))
}

fn is_sep(ch: char) -> bool {
    matches!(ch, ' ' | '.' | '_' | '-')
}

fn starts_with_ci(c: &[char], i: usize, word: &str) -> bool {
    let w: Vec<char> = word.chars().collect();
    i + w.len() <= c.len() && c[i..i + w.len()].iter().zip(&w).all(|(a, b)| a.to_lowercase().eq(b.to_lowercase()))
}

pub fn parse_episode(stem: &str) -> Option<EpisodeInfo> {
    let c: Vec<char> = stem.chars().collect();

    // S01E02
    for i in 0..c.len() {
        if !matches!(c[i], 's' | 'S') || !boundary_before(&c, i) {
            continue;
        }
        let Some((season, end)) = digits(&c, i + 1, 2) else { continue };
        if end >= c.len() || !matches!(c[end], 'e' | 'E') {
            continue;
        }
        let Some((episode, end)) = digits(&c, end + 1, 3) else { continue };
        if boundary_after(&c, end) || matches!(c.get(end), Some('e' | 'E')) {
            return Some(EpisodeInfo { show: clean_show(&c[..i]), season: Some(season), episode });
        }
    }

    // 2x05 (not 1920x1080: the season has at most two digits)
    for i in 0..c.len() {
        if !c[i].is_ascii_digit() || !boundary_before(&c, i) {
            continue;
        }
        let Some((season, end)) = digits(&c, i, 2) else { continue };
        if end >= c.len() || !matches!(c[end], 'x' | 'X' | 'х' | 'Х') {
            continue;
        }
        let Some((episode, end)) = digits(&c, end + 1, 3) else { continue };
        if boundary_after(&c, end) {
            return Some(EpisodeInfo { show: clean_show(&c[..i]), season: Some(season), episode });
        }
    }

    // «Серия 5», «Episode 5», «Ep.05»
    for word in ["серия", "episode", "ep"] {
        for i in 0..c.len() {
            if !boundary_before(&c, i) || !starts_with_ci(&c, i, word) {
                continue;
            }
            let mut j = i + word.chars().count();
            while j < c.len() && is_sep(c[j]) {
                j += 1;
            }
            if let Some((episode, end)) = digits(&c, j, 3) {
                if boundary_after(&c, end) {
                    return Some(EpisodeInfo { show: clean_show(&c[..i]), season: None, episode });
                }
            }
        }
    }

    // «05 серия»
    for i in 0..c.len() {
        if !c[i].is_ascii_digit() || !boundary_before(&c, i) {
            continue;
        }
        let Some((episode, mut j)) = digits(&c, i, 3) else { continue };
        while j < c.len() && is_sep(c[j]) {
            j += 1;
        }
        if starts_with_ci(&c, j, "серия") && boundary_after(&c, j + "серия".chars().count()) {
            return Some(EpisodeInfo { show: clean_show(&c[..i]), season: None, episode });
        }
    }
    None
}

/// "The.Sopranos." → "The Sopranos"; release group tags and a trailing year go away
fn clean_show(prefix: &[char]) -> Option<String> {
    let mut s: String = prefix.iter().map(|&ch| if ch == '.' || ch == '_' { ' ' } else { ch }).collect();
    // [Group] at the start
    if s.trim_start().starts_with('[') {
        if let Some(end) = s.find(']') {
            s = s[end + 1..].to_string();
        }
    }
    let mut words: Vec<&str> = s.split_whitespace().collect();
    while let Some(last) = words.last() {
        let trimmed = last.trim_matches(|ch: char| matches!(ch, '-' | '(' | ')' | '[' | ']'));
        let is_year = trimmed.len() == 4 && trimmed.chars().all(|ch| ch.is_ascii_digit()) && (trimmed.starts_with("19") || trimmed.starts_with("20"));
        if trimmed.is_empty() || (is_year && words.len() > 1) {
            words.pop();
        } else {
            break;
        }
    }
    let show = words.join(" ");
    (!show.is_empty()).then_some(show)
}

/// Lower case words without punctuation: "The.Sopranos" and "the sopranos" give the same key
pub fn normalize_name(s: &str) -> String {
    s.split(|ch: char| !ch.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(|w| w.to_lowercase())
        .collect::<Vec<_>>()
        .join(" ")
}

/// «1 Сезон», «Season 01», «S02» — such a folder belongs to the series one level up
fn is_season_dir(name: &str) -> bool {
    let words: Vec<String> = normalize_name(name).split(' ').map(str::to_owned).collect();
    let has_number = words.iter().any(|w| w.chars().all(|ch| ch.is_ascii_digit()));
    let short = words.len() <= 3;
    let marked = words.iter().any(|w| w == "season" || w == "сезон" || w == "s");
    let compact = words.len() == 1 && words[0].len() >= 2 && words[0].starts_with('s') && words[0][1..].chars().all(|ch| ch.is_ascii_digit());
    (short && marked && has_number) || compact
}

fn display_title(stem: &str) -> String {
    if stem.contains(' ') {
        stem.trim().to_string()
    } else {
        stem.replace(['.', '_'], " ").trim().to_string()
    }
}

pub fn describe(path: &Path) -> FileInfo {
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let title = display_title(&stem);
    let Some(ep) = parse_episode(&stem) else {
        return FileInfo { title, series: None, season: None, episode: None };
    };
    let series = match &ep.show {
        Some(show) => Some((format!("show:{}", normalize_name(show)), show.clone())),
        None => series_dir(path).map(|dir| {
            let name = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            (format!("dir:{}", dir.to_string_lossy().to_lowercase()), name)
        }),
    };
    FileInfo { title, series, season: ep.season, episode: Some(ep.episode) }
}

fn series_dir(path: &Path) -> Option<&Path> {
    let parent = path.parent()?;
    let name = parent.file_name()?.to_string_lossy();
    if is_season_dir(&name) {
        parent.parent().filter(|p| p.file_name().is_some())
    } else {
        Some(parent)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ep(stem: &str) -> Option<(Option<String>, Option<u32>, u32)> {
        parse_episode(stem).map(|e| (e.show, e.season, e.episode))
    }

    #[test]
    fn sxxexx_with_show_name() {
        assert_eq!(ep("The.Sopranos.S01E01.720p.BluRay.3xRus.Eng.TeamHD"), Some((Some("The Sopranos".into()), Some(1), 1)));
        assert_eq!(ep("Peacemaker.S02E05.2160p.AMZN.WEB-DL"), Some((Some("Peacemaker".into()), Some(2), 5)));
        assert_eq!(ep("breaking_bad_s1e12"), Some((Some("breaking bad".into()), Some(1), 12)));
        assert_eq!(ep("Doctor.Who.2005.S01E01"), Some((Some("Doctor Who".into()), Some(1), 1)));
        assert_eq!(ep("[Erai-raws] Show Name - S02E03 [1080p]"), Some((Some("Show Name".into()), Some(2), 3)));
    }

    #[test]
    fn season_x_episode_but_not_a_resolution() {
        assert_eq!(ep("Lost 2x05 Orientation"), Some((Some("Lost".into()), Some(2), 5)));
        assert_eq!(ep("Video 1920x1080"), None);
    }

    #[test]
    fn russian_and_english_episode_words() {
        assert_eq!(ep("Серия 5"), Some((None, None, 5)));
        assert_eq!(ep("Ходячие мертвецы - серия 12"), Some((Some("Ходячие мертвецы".into()), None, 12)));
        assert_eq!(ep("05 серия"), Some((None, None, 5)));
        assert_eq!(ep("Show Episode 3"), Some((Some("Show".into()), None, 3)));
    }

    #[test]
    fn a_film_has_no_episode() {
        assert_eq!(ep("Interstellar.2014.2160p.BluRay"), None);
        assert_eq!(ep("Seven Samurai"), None);
    }

    #[test]
    fn series_key_from_the_show_name_is_shared_by_episodes() {
        let a = describe(Path::new(r"E:\Сериалы\Soprano\1  Сезон\The.Sopranos.S01E01.720p.BluRay.mkv"));
        let b = describe(Path::new(r"D:\Other\the sopranos s01e02.mkv"));
        assert_eq!(a.series, Some(("show:the sopranos".into(), "The Sopranos".into())));
        assert_eq!(a.series.as_ref().map(|s| &s.0), b.series.as_ref().map(|s| &s.0));
        assert_eq!((a.season, a.episode), (Some(1), Some(1)));
        assert_eq!(a.title, "The Sopranos S01E01 720p BluRay");
    }

    #[test]
    fn without_a_show_name_the_series_is_the_folder_above_a_season_folder() {
        let info = describe(Path::new(r"D:\Сериалы\Чернобыль\1 Сезон\Серия 3.mkv"));
        assert_eq!(info.series, Some((r"dir:d:\сериалы\чернобыль".into(), "Чернобыль".into())));
        let flat = describe(Path::new(r"D:\Сериалы\Чернобыль\Серия 3.mkv"));
        assert_eq!(flat.series.map(|s| s.1), Some("Чернобыль".into()));
    }

    #[test]
    fn a_film_has_no_series() {
        let info = describe(Path::new(r"D:\Films\Interstellar.2014.2160p.mkv"));
        assert_eq!(info.series, None);
        assert_eq!(info.title, "Interstellar 2014 2160p");
    }

    #[test]
    fn season_folders() {
        for name in ["1  Сезон", "Сезон 2", "Season 01", "S02", "s1"] {
            assert!(is_season_dir(name), "{name}");
        }
        for name in ["Чернобыль", "The.Sopranos.S01.720p.BluRay.3xRus.Eng.TeamHD", "Сериалы"] {
            assert!(!is_season_dir(name), "{name}");
        }
    }
}
