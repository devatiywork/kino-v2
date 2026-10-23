//! Series built from the files of the library: seasons, the episode to watch next,
//! neighbours for «next / previous episode» and autoplay (SPEC 3.3)

use std::collections::BTreeMap;

use serde::Serialize;

use super::scan::natural_cmp;
use super::LibraryFile;

/// A file of some series with what the series list needs
#[derive(Debug, Clone)]
pub struct Episode {
    pub file: LibraryFile,
    pub series_key: String,
    pub series_title: String,
    pub series_dir: Option<String>,
    /// Found by scanning a library folder (not only opened once)
    pub in_folder: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Season {
    /// None — the files have no season number («Серия 5»)
    pub season: Option<u32>,
    pub episodes: Vec<LibraryFile>,
}

/// A card on «Сериалы» and the home screen
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesSummary {
    pub key: String,
    pub title: String,
    pub dir: Option<String>,
    pub seasons: u32,
    pub episodes: u32,
    pub watched: u32,
    /// The episode to watch next: unfinished, or the one after the last watched
    pub next_up: Option<LibraryFile>,
    /// Season of next_up (or the last one): per episode 0…1 for the progress strip
    pub season_progress: Vec<f64>,
    pub season_watched: u32,
    pub last_played_at: Option<i64>,
    pub thumb: Option<String>,
}

/// Order of episodes: season, episode, then file name naturally
pub fn order(episodes: &mut [LibraryFile]) {
    episodes.sort_by(|a, b| {
        a.season
            .unwrap_or(0)
            .cmp(&b.season.unwrap_or(0))
            .then(a.episode.unwrap_or(u32::MAX).cmp(&b.episode.unwrap_or(u32::MAX)))
            .then_with(|| natural_cmp(&a.path, &b.path))
    });
}

/// Index of the episode to watch next in an ordered list
pub fn next_up(episodes: &[LibraryFile]) -> Option<usize> {
    let last = episodes.iter().enumerate().filter(|(_, e)| e.last_played_at.is_some()).max_by_key(|(_, e)| e.last_played_at);
    match last {
        Some((i, e)) if !e.watched => Some(i),
        Some((i, _)) => (i + 1..episodes.len()).find(|&j| !episodes[j].watched && episodes[j].exists),
        None => episodes.iter().position(|e| !e.watched && e.exists),
    }
}

/// The episode `step` places away (skipping missing files); `same_season` stops at the season's end
pub fn neighbor(episodes: &[LibraryFile], current: i64, step: i32, same_season: bool) -> Option<&LibraryFile> {
    let index = episodes.iter().position(|e| e.id == current)?;
    let here = episodes[index].season;
    let mut i = index as i64;
    loop {
        i += step.signum() as i64;
        let candidate = episodes.get(usize::try_from(i).ok()?)?;
        if same_season && candidate.season != here {
            return None;
        }
        if candidate.exists {
            return Some(candidate);
        }
    }
}

pub fn seasons(mut episodes: Vec<LibraryFile>) -> Vec<Season> {
    order(&mut episodes);
    let mut groups: Vec<Season> = Vec::new();
    for e in episodes {
        match groups.last_mut() {
            Some(g) if g.season == e.season => g.episodes.push(e),
            _ => groups.push(Season { season: e.season, episodes: vec![e] }),
        }
    }
    groups
}

fn ratio(file: &LibraryFile) -> f64 {
    if file.watched {
        return 1.0;
    }
    match file.duration {
        Some(d) if d > 0.0 => (file.position / d).clamp(0.0, 1.0),
        _ => 0.0,
    }
}

/// Group files into series; a series shows when it has a file found in a library folder
/// or ever played, and at least one file still on disk
pub fn summaries(episodes: Vec<Episode>) -> Vec<SeriesSummary> {
    let mut by_key: BTreeMap<String, Vec<Episode>> = BTreeMap::new();
    for e in episodes {
        by_key.entry(e.series_key.clone()).or_default().push(e);
    }
    let mut list: Vec<SeriesSummary> = by_key
        .into_iter()
        .filter(|(_, eps)| eps.iter().any(|e| e.in_folder || e.file.last_played_at.is_some()) && eps.iter().any(|e| e.file.exists))
        .map(|(key, eps)| {
            let title = eps[0].series_title.clone();
            let dir = eps.iter().find_map(|e| e.series_dir.clone());
            let mut files: Vec<LibraryFile> = eps.into_iter().map(|e| e.file).filter(|f| f.exists || f.last_played_at.is_some()).collect();
            order(&mut files);
            let up = next_up(&files);
            let season = up.map(|i| files[i].season).or_else(|| files.last().map(|f| f.season)).flatten();
            let in_season: Vec<&LibraryFile> = files.iter().filter(|f| f.season == season).collect();
            let mut distinct: Vec<Option<u32>> = files.iter().map(|f| f.season).collect();
            distinct.dedup();
            SeriesSummary {
                key,
                title,
                dir,
                seasons: distinct.len() as u32,
                episodes: files.len() as u32,
                watched: files.iter().filter(|f| f.watched).count() as u32,
                season_progress: in_season.iter().map(|f| ratio(f)).collect(),
                season_watched: in_season.iter().filter(|f| f.watched).count() as u32,
                last_played_at: files.iter().filter_map(|f| f.last_played_at).max(),
                thumb: up
                    .and_then(|i| files[i].thumb.clone())
                    .or_else(|| files.iter().filter(|f| f.thumb.is_some()).max_by_key(|f| f.last_played_at).and_then(|f| f.thumb.clone())),
                next_up: up.map(|i| files[i].clone()),
            }
        })
        .collect();
    // Recently watched first, then by name
    list.sort_by(|a, b| b.last_played_at.cmp(&a.last_played_at).then_with(|| natural_cmp(&a.title, &b.title)));
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ep(id: i64, season: Option<u32>, episode: u32) -> LibraryFile {
        LibraryFile {
            id,
            path: format!(r"D:\Show\Show.S{:02}E{episode:02}.mkv", season.unwrap_or(0)),
            title: format!("Show {episode}"),
            series_title: Some("Show".into()),
            season,
            episode: Some(episode),
            duration: Some(1000.0),
            position: 0.0,
            watched: false,
            last_played_at: None,
            thumb: None,
            exists: true,
        }
    }

    fn played(mut f: LibraryFile, at: i64, position: f64, watched: bool) -> LibraryFile {
        f.last_played_at = Some(at);
        f.position = position;
        f.watched = watched;
        f
    }

    #[test]
    fn episodes_are_ordered_by_season_episode_and_name() {
        let mut list = vec![ep(1, Some(2), 1), ep(2, Some(1), 10), ep(3, Some(1), 2)];
        order(&mut list);
        assert_eq!(list.iter().map(|e| e.id).collect::<Vec<_>>(), [3, 2, 1]);
    }

    #[test]
    fn next_up_is_the_unfinished_or_the_one_after_the_last_watched() {
        let fresh = vec![ep(1, Some(1), 1), ep(2, Some(1), 2)];
        assert_eq!(next_up(&fresh), Some(0), "nothing played — the first");

        let unfinished = vec![played(ep(1, Some(1), 1), 10, 1000.0, true), played(ep(2, Some(1), 2), 20, 300.0, false), ep(3, Some(1), 3)];
        assert_eq!(next_up(&unfinished), Some(1));

        let done = vec![played(ep(1, Some(1), 1), 10, 1000.0, true), played(ep(2, Some(1), 2), 20, 990.0, true), ep(3, Some(1), 3)];
        assert_eq!(next_up(&done), Some(2));

        let finished = vec![played(ep(1, Some(1), 1), 10, 1000.0, true)];
        assert_eq!(next_up(&finished), None);
    }

    #[test]
    fn neighbours_skip_missing_files_and_autoplay_stops_at_the_season_end() {
        let mut gone = ep(2, Some(1), 2);
        gone.exists = false;
        let list = vec![ep(1, Some(1), 1), gone, ep(3, Some(1), 3), ep(4, Some(2), 1)];
        assert_eq!(neighbor(&list, 1, 1, true).map(|e| e.id), Some(3));
        assert_eq!(neighbor(&list, 3, 1, true).map(|e| e.id), None, "end of season 1");
        assert_eq!(neighbor(&list, 3, 1, false).map(|e| e.id), Some(4), "N goes on to season 2");
        assert_eq!(neighbor(&list, 3, -1, false).map(|e| e.id), Some(1));
        assert_eq!(neighbor(&list, 1, -1, false).map(|e| e.id), None);
    }

    #[test]
    fn seasons_group_ordered_episodes() {
        let groups = seasons(vec![ep(1, Some(2), 1), ep(2, Some(1), 2), ep(3, Some(1), 1)]);
        assert_eq!(groups.iter().map(|g| (g.season, g.episodes.len())).collect::<Vec<_>>(), [(Some(1), 2), (Some(2), 1)]);
    }

    #[test]
    fn summary_counts_and_progress_of_the_current_season() {
        let make = |file: LibraryFile, in_folder: bool| Episode {
            file,
            series_key: "show:show".into(),
            series_title: "Show".into(),
            series_dir: Some(r"D:\Show".into()),
            in_folder,
        };
        let list = summaries(vec![
            make(played(ep(1, Some(1), 1), 10, 1000.0, true), true),
            make(played(ep(2, Some(1), 2), 20, 500.0, false), true),
            make(ep(3, Some(1), 3), true),
            make(ep(4, Some(2), 1), true),
        ]);
        assert_eq!(list.len(), 1);
        let s = &list[0];
        assert_eq!((s.seasons, s.episodes, s.watched, s.season_watched), (2, 4, 1, 1));
        assert_eq!(s.next_up.as_ref().map(|f| f.id), Some(2));
        assert_eq!(s.season_progress, [1.0, 0.5, 0.0]);
    }

    #[test]
    fn a_series_only_seen_in_passing_is_not_listed() {
        let list = summaries(vec![Episode {
            file: ep(1, Some(1), 1),
            series_key: "show:x".into(),
            series_title: "X".into(),
            series_dir: None,
            in_folder: false,
        }]);
        assert!(list.is_empty());
    }
}
