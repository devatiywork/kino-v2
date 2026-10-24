"""A libtorrent peer on the loopback for the MSE/PE interop test of Kino's engine
(src-tauri/src/torrent/engine.rs, `encryption_interop_with_libtorrent`, ignored by default).

libtorrent is what qBittorrent runs on. Its encryption is forced, RC4 only: a peer that gets the
encrypted handshake or the RC4 stream wrong is not connected at all.

    python libtorrent-peer.py seed  <file.torrent> <folder> <port>
    python libtorrent-peer.py leech <file.torrent> <folder> <port> <peer port>

Prints a line of state a second. A leecher exits 0 once it has the whole torrent from
encrypted peers only, 1 after 60 s; a seeder runs until it is killed.
"""

import json
import os
import sys
import time

import libtorrent as lt


def main() -> int:
    role, torrent, folder, port = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    peer = int(sys.argv[5]) if len(sys.argv) > 5 else None
    session = lt.session({
        'listen_interfaces': f'127.0.0.1:{port}',
        'enable_dht': False,
        'enable_lsd': False,
        'enable_upnp': False,
        'enable_natpmp': False,
        # LT_ENCRYPTION=disabled — plain, to tell the transport from the encryption
        'out_enc_policy': int(lt.enc_policy.disabled if os.environ.get('LT_ENCRYPTION') == 'disabled' else lt.enc_policy.forced),
        'in_enc_policy': int(lt.enc_policy.disabled if os.environ.get('LT_ENCRYPTION') == 'disabled' else lt.enc_policy.forced),
        'allowed_enc_level': int(lt.enc_level.rc4),
        'prefer_rc4': True,
        'allow_multiple_connections_per_ip': True,
        # LT_TRANSPORT=tcp|utp — one of them only (the default: both, libtorrent tries uTP first)
        'enable_outgoing_utp': os.environ.get('LT_TRANSPORT', 'utp') == 'utp',
        'enable_outgoing_tcp': os.environ.get('LT_TRANSPORT', 'tcp') == 'tcp' or 'LT_TRANSPORT' not in os.environ,
        'alert_mask': int(lt.alert.category_t.error_notification | lt.alert.category_t.peer_notification | lt.alert.category_t.connect_notification
                          | (lt.alert.category_t.peer_log_notification if os.environ.get('LT_PEER_LOG') else 0)),
    })
    handle = session.add_torrent({'ti': lt.torrent_info(torrent), 'save_path': folder})
    if peer:
        handle.connect_peer(('127.0.0.1', peer))
    started = time.time()
    while True:
        for alert in session.pop_alerts():
            if isinstance(alert, (lt.peer_disconnected_alert, lt.peer_error_alert)) or (os.environ.get('LT_PEER_LOG') and isinstance(alert, lt.peer_log_alert)):
                print(json.dumps({'alert': alert.what(), 'message': alert.message()}), flush=True)
        status = handle.status()
        peers = handle.get_peer_info()
        encrypted = sum(1 for p in peers if p.flags & lt.peer_info.rc4_encrypted)
        print(json.dumps({
            'role': role,
            'state': str(status.state),
            'progress': round(status.progress, 3),
            'peers': len(peers),
            'rc4': encrypted,
        }), flush=True)
        if role == 'leech' and status.is_seeding:
            print('DONE', flush=True)
            return 0
        if role == 'leech' and time.time() - started > 60:
            return 1
        if role == 'leech' and peer and not peers:
            handle.connect_peer(('127.0.0.1', peer))
        time.sleep(1)


if __name__ == '__main__':
    sys.exit(main())
