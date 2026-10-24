# Списки блокировки рекламы

`ruadlist+easylist.txt` — RU AdList и EasyList одним файлом, с https://easylist-downloads.adblockplus.org/ruadlist+easylist.txt.

- Kino встраивает список в программу (`src/trackers/adblock.rs`) и сам за ним в сеть не ходит (ТЗ 4.7).
- Обновить перед выпуском версии: `bun scripts/fetch-filters.ts`.

Авторы — RU AdList (https://forums.lanik.us/viewforum.php?f=102) и EasyList (https://easylist.to). Условия:
- RU AdList — CC BY 3.0;
- EasyList — GPL v3 или CC BY-SA 3.0, на выбор (https://easylist.to/pages/licence.html).
