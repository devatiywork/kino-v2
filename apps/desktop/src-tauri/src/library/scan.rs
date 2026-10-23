//! Finding video files in library folders (SPEC 3.3) and ordering episodes like a person
//! would: 2 before 10

use std::cmp::Ordering;
use std::path::{Path, PathBuf};

/// Same list as the renderer's VIDEO_EXTENSIONS (src/shared/lib/media.ts)
pub const VIDEO_EXTENSIONS: &[&str] =
    &["mkv", "mp4", "m4v", "avi", "mov", "webm", "wmv", "flv", "ts", "m2ts", "mts", "mpg", "mpeg", "vob", "ogv", "3gp"];

/// Series folders are shallow; a deeper tree is someone's whole disk
const MAX_DEPTH: usize = 6;

pub fn is_video(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| VIDEO_EXTENSIONS.iter().any(|v| v.eq_ignore_ascii_case(e)))
}

/// Video files under `root`, skipping hidden folders and samples/extras
pub fn video_files(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    walk(root, 0, &mut found);
    found.sort_by(|a, b| natural_cmp(&a.to_string_lossy(), &b.to_string_lossy()));
    found
}

fn skip_dir(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.starts_with('.') || lower.starts_with('$') || matches!(lower.as_str(), "sample" | "samples" | "extras" | "featurettes" | "system volume information")
}

fn walk(dir: &Path, depth: usize, found: &mut Vec<PathBuf>) {
    if depth > MAX_DEPTH {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => return eprintln!("[library] read {}: {e}", dir.display()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_dir() {
            if !skip_dir(&entry.file_name().to_string_lossy()) {
                walk(&path, depth + 1, found);
            }
        } else if kind.is_file() && is_video(&path) {
            found.push(path);
        }
    }
}

/// Text compare where runs of digits compare as numbers, case-insensitive: "2" < "10"
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (mut a, mut b) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (a.peek().copied(), b.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let take = |it: &mut std::iter::Peekable<std::str::Chars>| {
                    let mut s = String::new();
                    while let Some(c) = it.peek().copied().filter(char::is_ascii_digit) {
                        s.push(c);
                        it.next();
                    }
                    s
                };
                let (na, nb) = (take(&mut a), take(&mut b));
                let (ta, tb) = (na.trim_start_matches('0'), nb.trim_start_matches('0'));
                let order = ta.len().cmp(&tb.len()).then_with(|| ta.cmp(tb)).then_with(|| na.len().cmp(&nb.len()));
                if order != Ordering::Equal {
                    return order;
                }
            }
            (Some(x), Some(y)) => {
                let order = x.to_lowercase().cmp(y.to_lowercase());
                if order != Ordering::Equal {
                    return order;
                }
                a.next();
                b.next();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn natural_order() {
        let mut names = vec!["Серия 10.mkv", "Серия 2.mkv", "серия 1.mkv", "Серия 02b.mkv", "S01E100", "S01E09"];
        names.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(names, ["S01E09", "S01E100", "серия 1.mkv", "Серия 2.mkv", "Серия 02b.mkv", "Серия 10.mkv"]);
        assert_eq!(natural_cmp("a2", "a02"), Ordering::Less, "equal numbers: shorter first, stable");
    }

    #[test]
    fn video_extensions() {
        assert!(is_video(Path::new(r"D:\a\b.MKV")));
        assert!(is_video(Path::new("x.m2ts")));
        assert!(!is_video(Path::new("x.srt")));
        assert!(!is_video(Path::new("x.mka")));
        assert!(!is_video(Path::new("mkv")));
    }

    #[test]
    fn walks_folders_skipping_samples_and_hidden() {
        let root = std::env::temp_dir().join(format!("kino-scan-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        for p in ["Show/Season 1/Show.S01E02.mkv", "Show/Season 1/Show.S01E10.mkv", "Show/Season 1/Show.S01E01.mkv", "Show/Sample/sample.mkv", "Show/.hidden/x.mkv", "Show/notes.txt"] {
            let path = root.join(p);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, b"").unwrap();
        }
        let files: Vec<String> = video_files(&root).iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect();
        assert_eq!(files, ["Show.S01E01.mkv", "Show.S01E02.mkv", "Show.S01E10.mkv"]);
        std::fs::remove_dir_all(&root).unwrap();
    }
}
