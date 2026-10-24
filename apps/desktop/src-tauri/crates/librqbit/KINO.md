# librqbit 9.0.1 for Kino

A copy of [librqbit](https://github.com/ikatson/rqbit) 9.0.1 (Apache-2.0, © Igor Katson and the
rqbit contributors), taken from crates.io as is and patched in through `[patch.crates-io]` in
`../../Cargo.toml`. The rest of the rqbit crates stay from crates.io.

## Why

Upstream (up to 9.0.1, August 2026) has no protocol encryption. Peers that require it — common on
Russian trackers, which advise it against ISP throttling — refuse a plain handshake, so Kino got a
fraction of the peers qBittorrent gets on the same torrent.

## What differs from upstream

- `src/mse.rs` — new: Message Stream Encryption / Protocol Encryption (the Vuze/Azureus spec that
  libtorrent, µTorrent, qBittorrent and Transmission speak): a Diffie-Hellman exchange over the
  768-bit prime, RC4 keyed by the shared secret and the info hash, the receiving side finding the
  torrent by `HASH('req2', SKEY)`; the stream wrappers.
- `PeerConnectionOptions::encryption` — `prefer` (default: encrypted first, plain if the peer cannot),
  `require` or `disable`.
- `peer_connection.rs` — an outgoing connection runs the encrypted handshake first.
- `session.rs` — an incoming connection is told by its first bytes: a plain handshake or the other
  side's DH key.
- `torrent_state` — `ManagedTorrentOptions::peer_encryption`: a torrent builds its connections'
  options itself and would otherwise take the default.
- `Cargo.toml` — `num-bigint` for the 768-bit arithmetic; `sqlx` (the `postgres` feature) dropped:
  its sqlite links clash with Kino's rusqlite once the crate is a workspace member.

## Worth knowing

- uTP's reader advances the `IoSliceMut`s it fills: `MseRead` hands it its own views, or it would
  decrypt where the slices point afterwards (the regression test `a_reader_that_advances…`).
- librqbit reads the BitTorrent handshake in one read: the accepting side prefills its 68 bytes.
- Checked against libtorrent 2.1 (qBittorrent's engine) with its encryption forced, RC4 only, both
  ways, over TCP and uTP: `apps/desktop/scripts/libtorrent-peer.py` and the ignored test
  `encryption_interop_with_libtorrent` in `src/torrent/engine.rs`.

Every change is marked `// Kino:` in the source. To move to a newer librqbit: take it from
crates.io, carry these over, run `cargo test -p librqbit mse` and the engine tests.
