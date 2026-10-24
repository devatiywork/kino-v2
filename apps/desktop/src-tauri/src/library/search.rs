//! The library's part of the title bar search (SPEC 2, Ctrl K): series by title, played files by
//! title, series or file name. Every word of the query must match; case is ignored for any
//! alphabet (SQLite's LIKE folds only ASCII), so the matching is done here.

use std::path::Path;

use serde::Serialize;

use super::series::SeriesSummary;
use super::{Library, LibraryFile, FILE_COLUMNS};

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearch {
    pub series: Vec<SeriesSummary>,
    /// Played films and episodes, the latest first
    pub files: Vec<LibraryFile>,
}

/// Lower-cased words of a query
fn words(query: &str) -> Vec<String> {
    query.split_whitespace().map(str::to_lowercase).collect()
}

fn matches(words: &[String], text: &str) -> bool {
    let text = text.to_lowercase();
    words.iter().all(|w| text.contains(w.as_str()))
}

impl Library {
    pub fn search(&self, query: &str, limit: usize) -> rusqlite::Result<LibrarySearch> {
        let words = words(query);
        if words.is_empty() {
            return Ok(LibrarySearch::default());
        }
        let series = self.series_list()?.into_iter().filter(|s| matches(&words, &s.title)).take(limit).collect();
        let conn = self.conn();
        let sql = format!(
            "SELECT {FILE_COLUMNS}, f.series_title FROM player_files f
             WHERE f.last_played_at IS NOT NULL ORDER BY f.last_played_at DESC"
        );
        let mut stmt = conn.prepare(&sql)?;
        let mut files = Vec::new();
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            let file = self.file_from_row(row)?;
            let name = Path::new(&file.path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let series_title: Option<String> = row.get(11)?;
            if matches(&words, &format!("{} {} {name}", file.title, series_title.unwrap_or_default())) {
                files.push(file);
                if files.len() == limit {
                    break;
                }
            }
        }
        Ok(LibrarySearch { series, files })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::episode::describe;
    use crate::library::now_ms;

    #[test]
    fn finds_series_and_played_files_by_every_word_in_any_case() {
        let lib = Library::in_memory();
        for (path, at) in [(r"D:\S\Тед.Лассо.S01E01.mkv", 1), (r"D:\S\Тед.Лассо.S01E02.mkv", 2), (r"D:\F\Interstellar.2014.mkv", 3)] {
            let file = lib.register(path, &describe(Path::new(path)), Some(1000.0)).unwrap();
            lib.save_progress(file.id, 100.0 * at as f64, Some(1000.0), &mut None, now_ms()).unwrap();
            // last_played_at is the save's time: keep them apart
            std::thread::sleep(std::time::Duration::from_millis(3));
        }
        let found = lib.search("лассо", 10).unwrap();
        assert_eq!(found.files.iter().map(|f| f.episode).collect::<Vec<_>>(), [Some(2), Some(1)], "the latest first");
        assert!(found.series.is_empty(), "the files are not on disk: no series card");

        let film = lib.search("INTERSTELLAR 2014", 10).unwrap();
        assert_eq!(film.files.len(), 1);
        assert!(lib.search("interstellar лассо", 10).unwrap().files.is_empty(), "every word must match");
        assert_eq!(lib.search("   ", 10).unwrap(), LibrarySearch::default());
        assert_eq!(lib.search("лассо", 1).unwrap().files.len(), 1);
    }
}
