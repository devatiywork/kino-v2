//! Tauri commands of the torrents; the renderer calls them through src/shared/ipc/torrents.ts

use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::backup::RestoreReport;
use super::store::Seeding;
use super::{AddRequest, ArchiveEntry, CategoryView, Finished, Preview, PreviewSource, Tick, TorrentDetails, Torrents, TorrentsUpdate};
use crate::error::{AppError, AppResult};

/// Every second: the downloads with their numbers
pub const UPDATE_EVENT: &str = "torrents://update";
/// The archive or the categories changed: read them again
pub const CHANGED_EVENT: &str = "torrents://changed";
/// A torrent finished (and maybe went to the archive)
pub const NOTICE_EVENT: &str = "torrents://notice";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum TorrentNotice {
    Finished { name: String, archived: bool },
    /// Its own ratio is reached: to the archive
    Seeded { name: String, ratio: f64 },
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Torrent(format!("{e:#}"))
    }
}

impl From<super::store::StoreError> for AppError {
    fn from(e: super::store::StoreError) -> Self {
        AppError::Torrent(e.to_string())
    }
}

type Service<'a> = State<'a, Arc<Torrents>>;

fn changed(app: &AppHandle) {
    if let Err(e) = app.emit(CHANGED_EVENT, ()) {
        eprintln!("[torrents] emit: {e}");
    }
}

/// The update loop: numbers every second, finished torrents announced. `on_update` — the app's
/// own use of the numbers (the tray), `on_finished` — what the app does with a torrent's files on
/// disk (the torrents know nothing of the player)
pub fn spawn_updates(
    app: AppHandle,
    torrents: Arc<Torrents>,
    on_update: impl Fn(&TorrentsUpdate) + Send + 'static,
    on_finished: impl Fn(&Finished) + Send + 'static,
) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            match torrents.tick().await {
                Ok(Tick { update, finished, seeded }) => {
                    on_update(&update);
                    if let Err(e) = app.emit(UPDATE_EVENT, update) {
                        eprintln!("[torrents] emit: {e}");
                    }
                    for (name, ratio) in seeded {
                        if let Err(e) = app.emit(NOTICE_EVENT, TorrentNotice::Seeded { name, ratio }) {
                            eprintln!("[torrents] emit: {e}");
                        }
                        changed(&app);
                    }
                    for done in finished {
                        on_finished(&done);
                        let notice = TorrentNotice::Finished { name: done.item.name.clone(), archived: done.archived };
                        if let Err(e) = app.emit(NOTICE_EVENT, notice) {
                            eprintln!("[torrents] emit: {e}");
                        }
                        changed(&app);
                    }
                }
                Err(e) => eprintln!("[torrents] update: {e:#}"),
            }
        }
    });
}

/// The downloads now; finishing is left to the update loop, so no notice is lost
#[tauri::command]
pub fn torrent_list(torrents: Service<'_>) -> AppResult<TorrentsUpdate> {
    Ok(torrents.snapshot()?)
}

#[tauri::command]
pub fn torrent_categories(torrents: Service<'_>) -> AppResult<Vec<CategoryView>> {
    Ok(torrents.categories()?)
}

#[tauri::command]
pub fn torrent_category_create(app: AppHandle, torrents: Service<'_>, name: String, folder: Option<String>) -> AppResult<CategoryView> {
    let created = torrents.store().create_category(&name, folder.as_deref())?;
    changed(&app);
    Ok(torrents.categories()?.into_iter().find(|c| c.id == created.id).expect("the new category"))
}

#[tauri::command]
pub fn torrent_category_update(app: AppHandle, torrents: Service<'_>, id: i64, name: String, folder: Option<String>) -> AppResult<()> {
    torrents.store().update_category(id, &name, folder.as_deref())?;
    changed(&app);
    Ok(())
}

/// Its torrents go to «Без категории»
#[tauri::command]
pub fn torrent_category_delete(app: AppHandle, torrents: Service<'_>, id: i64) -> AppResult<()> {
    torrents.store().delete_category(id)?;
    changed(&app);
    Ok(())
}

/// The add dialog: a .torrent file or a magnet link (its files come from the peers)
#[tauri::command]
pub async fn torrent_preview(torrents: Service<'_>, source: PreviewSource) -> AppResult<Preview> {
    Ok(torrents.preview(source).await?)
}

#[tauri::command]
pub async fn torrent_add(app: AppHandle, torrents: Service<'_>, request: AddRequest) -> AppResult<i64> {
    let id = torrents.add(request).await?;
    changed(&app);
    Ok(id)
}

#[tauri::command]
pub async fn torrent_pause(torrents: Service<'_>, id: i64) -> AppResult<()> {
    Ok(torrents.pause(id).await?)
}

#[tauri::command]
pub async fn torrent_resume(torrents: Service<'_>, id: i64) -> AppResult<()> {
    Ok(torrents.resume(id).await?)
}

/// The header's button: everything on pause (`paused`) or everything back
#[tauri::command]
pub async fn torrent_pause_all(torrents: Service<'_>, paused: bool) -> AppResult<()> {
    Ok(torrents.pause_all(paused).await?)
}

/// «Убрать из загрузок» / «Удалить с файлами»: the archive keeps the record
#[tauri::command]
pub async fn torrent_remove(app: AppHandle, torrents: Service<'_>, id: i64, delete_files: bool) -> AppResult<()> {
    torrents.remove(id, delete_files).await?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn torrent_archive_seeding(app: AppHandle, torrents: Service<'_>) -> AppResult<usize> {
    let moved = torrents.archive_seeding().await?;
    changed(&app);
    Ok(moved)
}

#[tauri::command]
pub fn torrent_set_category(app: AppHandle, torrents: Service<'_>, id: i64, category_id: Option<i64>) -> AppResult<()> {
    torrents.store().set_category(id, category_id)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub fn torrent_set_source(app: AppHandle, torrents: Service<'_>, id: i64, url: Option<String>) -> AppResult<()> {
    torrents.store().set_source(id, url.as_deref())?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn torrent_set_files(torrents: Service<'_>, id: i64, files: Vec<usize>) -> AppResult<()> {
    Ok(torrents.set_files(id, files).await?)
}

#[tauri::command]
pub fn torrent_details(torrents: Service<'_>, id: i64) -> AppResult<TorrentDetails> {
    Ok(torrents.details(id)?)
}

#[tauri::command]
pub fn torrent_archive(torrents: Service<'_>, query: String) -> AppResult<Vec<ArchiveEntry>> {
    Ok(torrents.archive(&query)?)
}

#[tauri::command]
pub async fn torrent_download_again(app: AppHandle, torrents: Service<'_>, id: i64, save_dir: Option<String>, start: bool) -> AppResult<()> {
    torrents.download_again(id, save_dir, start).await?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn torrent_seed_again(app: AppHandle, torrents: Service<'_>, id: i64) -> AppResult<()> {
    torrents.seed_again(id).await?;
    changed(&app);
    Ok(())
}

/// «Удалить из архива» — the renderer asks for a confirmation first
#[tauri::command]
pub fn torrent_delete_record(app: AppHandle, torrents: Service<'_>, id: i64) -> AppResult<()> {
    torrents.delete_record(id)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub fn torrent_magnet(torrents: Service<'_>, id: i64) -> AppResult<String> {
    Ok(torrents.magnet(id)?)
}

/// The default folder for «Без категории» and for categories without their own
#[tauri::command]
pub fn torrent_downloads_folder(torrents: Service<'_>) -> String {
    torrents.downloads_folder().to_string_lossy().into_owned()
}

/// SPEC 4.4 «Резервная копия»: the whole archive with its .torrent files into one file
#[tauri::command]
pub async fn torrent_export_archive(torrents: Service<'_>, path: String) -> AppResult<usize> {
    Ok(torrents.export_archive(std::path::Path::new(&path))?)
}

/// What the archive lacks comes back from a backup; nothing it has changes
#[tauri::command]
pub async fn torrent_restore_archive(app: AppHandle, torrents: Service<'_>, path: String) -> AppResult<RestoreReport> {
    let report = torrents.restore_archive(std::path::Path::new(&path))?;
    changed(&app);
    Ok(report)
}

/// SPEC 4.3 «Параметры торрента»: «Раздача: как в настройках / до рейтинга / не раздавать»
#[tauri::command]
pub fn torrent_set_seeding(torrents: Service<'_>, id: i64, seeding: Seeding) -> AppResult<()> {
    Ok(torrents.set_seeding(id, seeding)?)
}

/// «Проверить файлы»: every piece on disk is checked again
#[tauri::command]
pub async fn torrent_recheck(app: AppHandle, torrents: Service<'_>, id: i64) -> AppResult<()> {
    torrents.recheck(id).await?;
    changed(&app);
    Ok(())
}

/// «Переобъявить»: trackers, DHT and LSD are asked for peers now
#[tauri::command]
pub async fn torrent_reannounce(torrents: Service<'_>, id: i64) -> AppResult<()> {
    Ok(torrents.reannounce(id).await?)
}

/// «Сохранить .torrent»: the archive's copy into a chosen file
#[tauri::command]
pub fn torrent_save_file(torrents: Service<'_>, id: i64, path: String) -> AppResult<()> {
    Ok(torrents.save_torrent_file(id, std::path::Path::new(&path))?)
}

/// The «Скорость» tab: a sample a second for the last 30 minutes, [download, upload]
#[tauri::command]
pub fn torrent_speed_history(torrents: Service<'_>, id: i64) -> Vec<[u64; 2]> {
    torrents.speed_history(id)
}
