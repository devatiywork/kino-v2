// Kino: Message Stream Encryption / Protocol Encryption (MSE/PE) — not in upstream librqbit.
//
// The obfuscation libtorrent, µTorrent, qBittorrent and Transmission speak (the Vuze/Azureus spec):
// a Diffie-Hellman exchange over a 768-bit prime, then RC4 keyed by the shared secret S and the
// torrent's info hash (SKEY). Peers that require it refuse a plain handshake; providers that
// throttle BitTorrent see random bytes.
//
//   A → B  Ya, PadA
//   B → A  Yb, PadB
//   A → B  HASH('req1', S), HASH('req2', SKEY) xor HASH('req3', S),
//          ENCRYPT(VC, crypto_provide, len(PadC), PadC, len(IA)), ENCRYPT(IA)
//   B → A  ENCRYPT(VC, crypto_select, len(padD), padD), ENCRYPT2(payload)
//
// keyA = HASH('keyA', S, SKEY) encrypts A → B, keyB = HASH('keyB', S, SKEY) B → A; the first 1024
// bytes of each RC4 stream are discarded. Everything above the handshake (the BitTorrent protocol)
// goes through `MseRead` / `MseWrite` unchanged.

use std::io::IoSliceMut;
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};

use anyhow::{Context as _, bail};
use librqbit_core::hash_id::Id20;
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};
use sha1w::ISha1;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadBuf};

use crate::type_aliases::{BoxAsyncReadVectored, BoxAsyncWrite};
use crate::vectored_traits::AsyncReadVectored;

/// How peer connections are encrypted — qBittorrent's «Режим шифрования»
#[derive(Default, Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Encryption {
    /// Outgoing: encrypted first, plain if the peer cannot; incoming: either
    #[default]
    Prefer,
    /// Encrypted only, both ways
    Require,
    /// Plain only
    Disable,
}

/// The spec's prime; the generator is 2
const PRIME_HEX: &[u8] = b"FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A63A36210000000000090563";
const KEY_LEN: usize = 96;
const VC: [u8; 8] = [0; 8];
const CRYPTO_PLAIN: u32 = 0x01;
const CRYPTO_RC4: u32 = 0x02;
/// The longest padding a side may send
const PAD_MAX: usize = 512;
/// What a plain BitTorrent handshake starts with
const PLAIN_START: &[u8; 20] = b"\x13BitTorrent protocol";
/// A whole plain handshake: librqbit reads it in one go
const HANDSHAKE_LEN: usize = 68;

fn prime() -> &'static BigUint {
    static PRIME: OnceLock<BigUint> = OnceLock::new();
    PRIME.get_or_init(|| BigUint::parse_bytes(PRIME_HEX, 16).expect("the spec's prime"))
}

fn sha1(parts: &[&[u8]]) -> [u8; 20] {
    let mut h = sha1w::Sha1::new();
    for part in parts {
        h.update(part);
    }
    h.finish()
}

fn xor20(a: [u8; 20], b: [u8; 20]) -> [u8; 20] {
    std::array::from_fn(|i| a[i] ^ b[i])
}

/// A private key of 160 random bits and its public key G^X mod P, 96 bytes big-endian
fn keypair() -> (BigUint, [u8; KEY_LEN]) {
    let mut bytes = [0u8; 20];
    rand::fill(&mut bytes[..]);
    let private = BigUint::from_bytes_be(&bytes);
    let public = BigUint::from(2u32).modpow(&private, prime());
    (private, padded(&public))
}

fn padded(n: &BigUint) -> [u8; KEY_LEN] {
    let bytes = n.to_bytes_be();
    let mut out = [0u8; KEY_LEN];
    out[KEY_LEN - bytes.len()..].copy_from_slice(&bytes);
    out
}

/// S = Y^X mod P; a public key out of range is refused (it would make S guessable)
fn shared_secret(private: &BigUint, theirs: &[u8]) -> anyhow::Result<[u8; KEY_LEN]> {
    let y = BigUint::from_bytes_be(theirs);
    if y <= BigUint::from(1u32) || &y >= prime() {
        bail!("bad public key");
    }
    Ok(padded(&y.modpow(private, prime())))
}

fn random_pad() -> Vec<u8> {
    use rand::RngExt;
    let mut pad = vec![0u8; rand::rng().random_range(0..=PAD_MAX)];
    rand::fill(&mut pad[..]);
    pad
}

#[derive(Clone)]
struct Rc4 {
    s: [u8; 256],
    i: u8,
    j: u8,
}

impl Rc4 {
    fn new(key: &[u8]) -> Self {
        let mut s: [u8; 256] = std::array::from_fn(|i| u8::try_from(i).expect("below 256"));
        let mut j = 0u8;
        for i in 0..256 {
            j = j.wrapping_add(s[i]).wrapping_add(key[i % key.len()]);
            s.swap(i, j as usize);
        }
        Self { s, i: 0, j: 0 }
    }

    /// The spec's: keyed by HASH('keyA' | 'keyB', S, SKEY), the first 1024 bytes discarded
    fn keyed(label: &[u8], secret: &[u8], skey: &[u8]) -> Self {
        let mut rc4 = Self::new(&sha1(&[label, secret, skey]));
        rc4.skip(1024);
        rc4
    }

    fn apply(&mut self, data: &mut [u8]) {
        for byte in data {
            self.i = self.i.wrapping_add(1);
            self.j = self.j.wrapping_add(self.s[self.i as usize]);
            self.s.swap(self.i as usize, self.j as usize);
            let k = self.s[self.s[self.i as usize].wrapping_add(self.s[self.j as usize]) as usize];
            *byte ^= k;
        }
    }

    fn skip(&mut self, mut n: usize) {
        let mut scratch = [0u8; 1024];
        while n > 0 {
            let k = n.min(scratch.len());
            self.apply(&mut scratch[..k]);
            n -= k;
        }
    }
}

/// The handshake's reading: what came is kept until it is taken
struct Incoming {
    raw: BoxAsyncReadVectored,
    buf: Vec<u8>,
}

impl Incoming {
    fn new(raw: BoxAsyncReadVectored) -> Self {
        Self { raw, buf: Vec::new() }
    }

    /// One more read; false — the peer closed the connection
    async fn more(&mut self) -> anyhow::Result<bool> {
        let mut chunk = [0u8; 4096];
        let n = self.raw.read(&mut chunk).await.context("reading")?;
        self.buf.extend_from_slice(&chunk[..n]);
        Ok(n > 0)
    }

    async fn fill_to(&mut self, n: usize) -> anyhow::Result<()> {
        while self.buf.len() < n {
            if !self.more().await? {
                bail!("the peer closed the connection");
            }
        }
        Ok(())
    }

    async fn take(&mut self, n: usize) -> anyhow::Result<Vec<u8>> {
        self.fill_to(n).await?;
        Ok(self.buf.drain(..n).collect())
    }

    /// Where `pattern` starts, after at most `skip` bytes of padding
    async fn find(&mut self, pattern: &[u8], skip: usize) -> anyhow::Result<usize> {
        loop {
            match self.buf.windows(pattern.len()).position(|w| w == pattern) {
                Some(at) if at <= skip => return Ok(at),
                _ => {}
            }
            if self.buf.len() >= skip + pattern.len() {
                bail!("no synchronization within the padding");
            }
            if !self.more().await? {
                bail!("the peer closed the connection");
            }
        }
    }

    fn into_parts(self) -> (BoxAsyncReadVectored, Vec<u8>) {
        (self.raw, self.buf)
    }
}

/// The connecting side (A): RC4 offered only — a plain stream after an obfuscated handshake would
/// not hide anything from a throttling provider
pub(crate) async fn initiate(
    read: BoxAsyncReadVectored,
    write: BoxAsyncWrite,
    info_hash: Id20,
) -> anyhow::Result<(BoxAsyncReadVectored, BoxAsyncWrite)> {
    initiate_with(read, write, info_hash, CRYPTO_RC4, &[]).await
}

async fn initiate_with(
    read: BoxAsyncReadVectored,
    mut write: BoxAsyncWrite,
    info_hash: Id20,
    provide: u32,
    initial_payload: &[u8],
) -> anyhow::Result<(BoxAsyncReadVectored, BoxAsyncWrite)> {
    let (private, public) = keypair();
    write.write_all(&[&public[..], &random_pad()].concat()).await.context("sending the key")?;

    let mut incoming = Incoming::new(read);
    let theirs = incoming.take(KEY_LEN).await.context("no key from the peer")?;
    let secret = shared_secret(&private, &theirs)?;
    let skey = &info_hash.0[..];
    let mut encrypt = Rc4::keyed(b"keyA", &secret, skey);
    let mut decrypt = Rc4::keyed(b"keyB", &secret, skey);

    let payload_len = u16::try_from(initial_payload.len()).context("initial payload too long")?;
    let mut tail = [&VC[..], &provide.to_be_bytes(), &0u16.to_be_bytes(), &payload_len.to_be_bytes(), initial_payload].concat();
    encrypt.apply(&mut tail);
    let request = [&sha1(&[b"req1", &secret])[..], &xor20(sha1(&[b"req2", skey]), sha1(&[b"req3", &secret])), &tail].concat();
    write.write_all(&request).await.context("sending the request")?;

    // PadB, then ENCRYPT(VC): found by encrypting VC ahead with a copy of the stream
    let mut vc = VC;
    decrypt.clone().apply(&mut vc);
    let at = incoming.find(&vc, PAD_MAX).await.context("the peer does not encrypt")?;
    incoming.take(at).await?;
    let mut head = incoming.take(8 + 4 + 2).await?;
    decrypt.apply(&mut head);
    let select = u32::from_be_bytes(head[8..12].try_into().expect("4 bytes"));
    let pad_d = u16::from_be_bytes(head[12..14].try_into().expect("2 bytes")) as usize;
    if pad_d > PAD_MAX {
        bail!("padding too long: {pad_d}");
    }
    let mut pad = incoming.take(pad_d).await?;
    decrypt.apply(&mut pad);

    let (raw, rest) = incoming.into_parts();
    match select {
        CRYPTO_RC4 if provide & CRYPTO_RC4 != 0 => Ok((Box::new(MseRead::new(raw, Some(decrypt), Vec::new(), rest)), Box::new(MseWrite::new(write, encrypt)))),
        CRYPTO_PLAIN if provide & CRYPTO_PLAIN != 0 => Ok((Box::new(MseRead::new(raw, None, Vec::new(), rest)), write)),
        other => bail!("the peer chose {other:#x}"),
    }
}

/// The accepting side: a plain handshake or the other side's key, told by the first bytes.
/// `torrents` — the info hashes of ours; the handshake that follows is read whole in one go
pub(crate) async fn accept(
    read: BoxAsyncReadVectored,
    write: BoxAsyncWrite,
    torrents: &[Id20],
    mode: Encryption,
) -> anyhow::Result<(BoxAsyncReadVectored, BoxAsyncWrite)> {
    let mut incoming = Incoming::new(read);
    incoming.fill_to(PLAIN_START.len()).await?;
    if incoming.buf.starts_with(PLAIN_START) {
        if mode == Encryption::Require {
            bail!("a plain handshake, and encryption is required");
        }
        // The whole handshake if it comes: librqbit reads it in one go
        while incoming.buf.len() < HANDSHAKE_LEN && incoming.more().await? {}
        let (raw, rest) = incoming.into_parts();
        return Ok((Box::new(MseRead::new(raw, None, rest, Vec::new())), write));
    }
    if mode == Encryption::Disable {
        bail!("not a BitTorrent handshake, and encryption is off");
    }
    let (mut read, write) = accept_encrypted(incoming, write, torrents, mode == Encryption::Prefer).await?;
    read.prefill(HANDSHAKE_LEN).await?;
    Ok((Box::new(read), write))
}

async fn accept_encrypted(
    mut incoming: Incoming,
    mut write: BoxAsyncWrite,
    torrents: &[Id20],
    allow_plain: bool,
) -> anyhow::Result<(MseRead, BoxAsyncWrite)> {
    let theirs = incoming.take(KEY_LEN).await.context("no key from the peer")?;
    let (private, public) = keypair();
    write.write_all(&[&public[..], &random_pad()].concat()).await.context("sending the key")?;
    let secret = shared_secret(&private, &theirs)?;

    let req1 = sha1(&[b"req1", &secret]);
    let at = incoming.find(&req1, PAD_MAX).await.context("no request from the peer")?;
    incoming.take(at + req1.len()).await?;
    let asked = incoming.take(20).await?;
    let req3 = sha1(&[b"req3", &secret]);
    let skey = torrents
        .iter()
        .find(|ih| xor20(sha1(&[b"req2", &ih.0]), req3)[..] == asked[..])
        .context("not a torrent of ours")?;
    let mut decrypt = Rc4::keyed(b"keyA", &secret, &skey.0);
    let mut encrypt = Rc4::keyed(b"keyB", &secret, &skey.0);

    let mut head = incoming.take(8 + 4 + 2).await?;
    decrypt.apply(&mut head);
    if head[..8] != VC {
        bail!("bad verification constant");
    }
    let provide = u32::from_be_bytes(head[8..12].try_into().expect("4 bytes"));
    let pad_c = u16::from_be_bytes(head[12..14].try_into().expect("2 bytes")) as usize;
    if pad_c > PAD_MAX {
        bail!("padding too long: {pad_c}");
    }
    let mut pad = incoming.take(pad_c).await?;
    decrypt.apply(&mut pad);
    let mut len = incoming.take(2).await?;
    decrypt.apply(&mut len);
    let mut initial_payload = incoming.take(u16::from_be_bytes([len[0], len[1]]) as usize).await?;
    decrypt.apply(&mut initial_payload);

    let select = if provide & CRYPTO_RC4 != 0 {
        CRYPTO_RC4
    } else if allow_plain && provide & CRYPTO_PLAIN != 0 {
        CRYPTO_PLAIN
    } else {
        bail!("no method in common: the peer offers {provide:#x}");
    };
    let mut reply = [&VC[..], &select.to_be_bytes(), &0u16.to_be_bytes()].concat();
    encrypt.apply(&mut reply);
    write.write_all(&reply).await.context("sending the choice")?;

    let (raw, rest) = incoming.into_parts();
    Ok(if select == CRYPTO_RC4 {
        (MseRead::new(raw, Some(decrypt), initial_payload, rest), Box::new(MseWrite::new(write, encrypt)))
    } else {
        // From here on plain: only the handshake was hidden
        (MseRead::new(raw, None, initial_payload, rest), write)
    })
}

/// The stream above the handshake: what already came (the initial payload, bytes read ahead) is
/// served first, then the connection, decrypted when RC4 was chosen
pub(crate) struct MseRead {
    inner: BoxAsyncReadVectored,
    rc4: Option<Rc4>,
    ready: Vec<u8>,
    pos: usize,
}

impl MseRead {
    /// `plain` — already plain; `ahead` — read from the connection but not decrypted yet
    fn new(inner: BoxAsyncReadVectored, mut rc4: Option<Rc4>, mut plain: Vec<u8>, mut ahead: Vec<u8>) -> Self {
        if let Some(rc4) = rc4.as_mut() {
            rc4.apply(&mut ahead);
        }
        plain.append(&mut ahead);
        Self { inner, rc4, ready: plain, pos: 0 }
    }

    /// At least `n` bytes ready, unless the peer closes first
    async fn prefill(&mut self, n: usize) -> anyhow::Result<()> {
        let mut chunk = [0u8; 4096];
        while self.ready.len() - self.pos < n {
            let got = self.inner.read(&mut chunk).await.context("reading")?;
            if got == 0 {
                break;
            }
            let fresh = &mut chunk[..got];
            if let Some(rc4) = self.rc4.as_mut() {
                rc4.apply(fresh);
            }
            self.ready.extend_from_slice(fresh);
        }
        Ok(())
    }

    fn serve(&mut self, out: &mut [u8]) -> usize {
        let n = out.len().min(self.ready.len() - self.pos);
        out[..n].copy_from_slice(&self.ready[self.pos..self.pos + n]);
        self.pos += n;
        if self.pos == self.ready.len() {
            self.ready = Vec::new();
            self.pos = 0;
        }
        n
    }
}

impl AsyncRead for MseRead {
    fn poll_read(mut self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<std::io::Result<()>> {
        let this = &mut *self;
        if this.pos < this.ready.len() {
            let n = this.serve(buf.initialize_unfilled());
            buf.advance(n);
            return Poll::Ready(Ok(()));
        }
        let before = buf.filled().len();
        std::task::ready!(Pin::new(&mut this.inner).poll_read(cx, buf))?;
        if let Some(rc4) = this.rc4.as_mut() {
            rc4.apply(&mut buf.filled_mut()[before..]);
        }
        Poll::Ready(Ok(()))
    }
}

impl AsyncReadVectored for MseRead {
    fn poll_read_vectored(mut self: Pin<&mut Self>, cx: &mut Context<'_>, vec: &mut [IoSliceMut<'_>]) -> Poll<std::io::Result<usize>> {
        let this = &mut *self;
        if this.pos < this.ready.len() {
            let mut total = 0;
            for slice in vec.iter_mut() {
                let n = this.serve(slice);
                total += n;
                if n < slice.len() {
                    break;
                }
            }
            return Poll::Ready(Ok(total));
        }
        // uTP's reader advances the slices it fills (IoSliceMut::advance): it gets its own views of
        // them, so that `vec` still points where the data went
        let n = {
            let mut views: Vec<IoSliceMut<'_>> = vec.iter_mut().map(|slice| IoSliceMut::new(&mut slice[..])).collect();
            std::task::ready!(Pin::new(&mut this.inner).poll_read_vectored(cx, &mut views))?
        };
        if let Some(rc4) = this.rc4.as_mut() {
            let mut left = n;
            for slice in vec.iter_mut() {
                if left == 0 {
                    break;
                }
                let k = left.min(slice.len());
                rc4.apply(&mut slice[..k]);
                left -= k;
            }
        }
        Poll::Ready(Ok(n))
    }
}

/// The stream above the handshake, encrypted. RC4 moves on only by what the connection took:
/// each write encrypts with a copy, and the real stream skips as many bytes as were written —
/// a partial write never puts the two sides out of step
pub(crate) struct MseWrite {
    inner: BoxAsyncWrite,
    rc4: Rc4,
    scratch: Vec<u8>,
}

impl MseWrite {
    fn new(inner: BoxAsyncWrite, rc4: Rc4) -> Self {
        Self { inner, rc4, scratch: Vec::new() }
    }
}

/// The most encrypted at once: the copy's work is redone for what the connection did not take
const WRITE_CHUNK: usize = 64 * 1024;

impl AsyncWrite for MseWrite {
    fn poll_write(mut self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &[u8]) -> Poll<std::io::Result<usize>> {
        let this = &mut *self;
        let chunk = &buf[..buf.len().min(WRITE_CHUNK)];
        this.scratch.clear();
        this.scratch.extend_from_slice(chunk);
        this.rc4.clone().apply(&mut this.scratch);
        let n = std::task::ready!(Pin::new(&mut this.inner).poll_write(cx, &this.scratch))?;
        this.rc4.skip(n);
        Poll::Ready(Ok(n))
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vectored_traits::AsyncReadVectoredIntoCompat;

    fn streams(stream: tokio::io::DuplexStream) -> (BoxAsyncReadVectored, BoxAsyncWrite) {
        let (read, write) = tokio::io::split(stream);
        (Box::new(read.into_vectored_compat()), Box::new(write))
    }

    fn id(byte: u8) -> Id20 {
        Id20::new([byte; 20])
    }

    fn plain_handshake(info_hash: Id20) -> Vec<u8> {
        [&PLAIN_START[..], &[0u8; 8], &info_hash.0, &[7u8; 20]].concat()
    }

    #[test]
    fn rc4_test_vectors() {
        for (key, plain, cipher) in [
            (&b"Key"[..], &b"Plaintext"[..], &[0xBB, 0xF3, 0x16, 0xE8, 0xD9, 0x40, 0xAF, 0x0A, 0xD3][..]),
            (b"Wiki", b"pedia", &[0x10, 0x21, 0xBF, 0x04, 0x20]),
            (b"Secret", b"Attack at dawn", &[0x45, 0xA0, 0x1F, 0x64, 0x5F, 0xC3, 0x5B, 0x38, 0x35, 0x52, 0x54, 0x4B, 0x9B, 0xF5]),
        ] {
            let mut data = plain.to_vec();
            Rc4::new(key).apply(&mut data);
            assert_eq!(data, cipher);
        }
    }

    #[test]
    fn both_sides_reach_the_same_secret() {
        let (a, ya) = keypair();
        let (b, yb) = keypair();
        assert_eq!(shared_secret(&a, &yb).unwrap(), shared_secret(&b, &ya).unwrap());
        assert!(shared_secret(&a, &[0u8; KEY_LEN]).is_err(), "0 is not a key");
        assert!(shared_secret(&a, &padded(prime())).is_err(), "P is not a key");
    }

    /// A writer that takes at most 3 bytes a call: partial writes must not break the stream
    struct Trickle(BoxAsyncWrite);

    impl AsyncWrite for Trickle {
        fn poll_write(mut self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &[u8]) -> Poll<std::io::Result<usize>> {
            let n = buf.len().min(3);
            Pin::new(&mut self.0).poll_write(cx, &buf[..n])
        }
        fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
            Pin::new(&mut self.0).poll_flush(cx)
        }
        fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
            Pin::new(&mut self.0).poll_shutdown(cx)
        }
    }

    #[tokio::test]
    async fn an_encrypted_connection_carries_the_handshake_and_data_both_ways() {
        let (a, b) = tokio::io::duplex(1 << 16);
        let ((a_read, a_write), (b_read, b_write)) = (streams(a), streams(b));
        let torrent = id(9);
        let (hello, ours) = (plain_handshake(torrent), [id(1), torrent, id(3)]);
        let (initiator, acceptor) = tokio::join!(
            // As librqbit does: the BitTorrent handshake right after, without waiting for the peer
            async {
                let (read, mut write) = initiate(a_read, Box::new(Trickle(a_write)), torrent).await?;
                write.write_all(&hello).await?;
                anyhow::Ok((read, write))
            },
            // The acceptor learns which torrent from the request only
            accept(b_read, b_write, &ours, Encryption::Prefer)
        );
        let ((mut a_read, _), (mut b_read, mut b_write)) = (initiator.unwrap(), acceptor.unwrap());

        let mut first = [0u8; 4096];
        let n = b_read.read(&mut first).await.unwrap();
        assert_eq!(&first[..n], &hello[..], "the whole handshake in the first read");

        // More than the pipe holds: written and read at once
        let data: Vec<u8> = (0..100_000u32).map(|i| (i % 251) as u8).collect();
        let mut back = vec![0u8; data.len()];
        let (sent, got) = tokio::join!(b_write.write_all(&data), a_read.read_exact(&mut back));
        sent.unwrap();
        got.unwrap();
        assert_eq!(back, data);
    }

    /// A reader that, like uTP's, advances the slices it fills
    struct Advancing(Vec<u8>);

    impl AsyncRead for Advancing {
        fn poll_read(self: Pin<&mut Self>, _: &mut Context<'_>, _: &mut ReadBuf<'_>) -> Poll<std::io::Result<()>> {
            unreachable!("read vectored")
        }
    }

    impl AsyncReadVectored for Advancing {
        fn poll_read_vectored(mut self: Pin<&mut Self>, _: &mut Context<'_>, vec: &mut [IoSliceMut<'_>]) -> Poll<std::io::Result<usize>> {
            let mut written = 0;
            for slice in vec.iter_mut() {
                let n = slice.len().min(self.0.len());
                slice[..n].copy_from_slice(&self.0[..n]);
                self.0.drain(..n);
                slice.advance(n);
                written += n;
            }
            Poll::Ready(Ok(written))
        }
    }

    #[tokio::test]
    async fn a_reader_that_advances_its_slices_is_decrypted_where_the_data_went() {
        use crate::vectored_traits::AsyncReadVectoredExt;
        let plain: Vec<u8> = (0..300u32).map(|i| (i % 251) as u8).collect();
        let mut cipher = plain.clone();
        Rc4::new(b"key").apply(&mut cipher);
        let mut read = MseRead::new(Box::new(Advancing(cipher)), Some(Rc4::new(b"key")), Vec::new(), Vec::new());
        // Two slices, as librqbit's ring buffer gives them
        let (mut first, mut second) = (vec![0u8; 100], vec![0u8; 200]);
        let n = read.read_vectored(&mut [IoSliceMut::new(&mut first), IoSliceMut::new(&mut second)]).await.unwrap();
        assert_eq!(n, 300);
        assert_eq!([first, second].concat(), plain);
    }

    #[tokio::test]
    async fn the_handshake_as_initial_payload_comes_whole_in_the_first_read() {
        let (a, b) = tokio::io::duplex(1 << 16);
        let ((a_read, a_write), (b_read, b_write)) = (streams(a), streams(b));
        let torrent = id(5);
        let (hello, ours) = (plain_handshake(torrent), [torrent]);
        let (initiator, acceptor) = tokio::join!(
            initiate_with(a_read, a_write, torrent, CRYPTO_RC4 | CRYPTO_PLAIN, &hello),
            accept(b_read, b_write, &ours, Encryption::Prefer)
        );
        initiator.unwrap();
        let (mut b_read, _) = acceptor.unwrap();
        let mut first = [0u8; 4096];
        let n = b_read.read(&mut first).await.unwrap();
        assert_eq!(&first[..n], &hello[..]);
    }

    #[tokio::test]
    async fn plain_offered_and_allowed_leaves_the_stream_plain_after_the_handshake() {
        let (a, b) = tokio::io::duplex(1 << 16);
        let ((a_read, a_write), (b_read, b_write)) = (streams(a), streams(b));
        let (torrent, ours) = (id(4), [id(4)]);
        let hello = plain_handshake(torrent);
        let (initiator, acceptor) = tokio::join!(
            async {
                let (read, mut write) = initiate_with(a_read, a_write, torrent, CRYPTO_PLAIN, &[]).await?;
                write.write_all(&hello).await?;
                anyhow::Ok((read, write))
            },
            accept(b_read, b_write, &ours, Encryption::Prefer)
        );
        initiator.unwrap();
        let (mut b_read, _) = acceptor.unwrap();
        let mut got = vec![0u8; hello.len()];
        b_read.read_exact(&mut got).await.unwrap();
        assert_eq!(got, hello);
    }

    #[tokio::test]
    async fn a_plain_handshake_passes_unless_encryption_is_required() {
        for (mode, passes) in [(Encryption::Prefer, true), (Encryption::Disable, true), (Encryption::Require, false)] {
            let (mut a, b) = tokio::io::duplex(1 << 16);
            let (b_read, b_write) = streams(b);
            let hello = plain_handshake(id(2));
            a.write_all(&hello).await.unwrap();
            let accepted = accept(b_read, b_write, &[id(2)], mode).await;
            assert_eq!(accepted.is_ok(), passes, "{mode:?}");
            if let Ok((mut read, _)) = accepted {
                let mut first = [0u8; 4096];
                let n = read.read(&mut first).await.unwrap();
                assert_eq!(&first[..n], &hello[..], "the whole handshake at once");
            }
        }
    }

    #[tokio::test]
    async fn refused_when_off_or_the_torrent_is_not_ours() {
        for (mode, ours) in [(Encryption::Disable, id(8)), (Encryption::Prefer, id(6))] {
            let (a, b) = tokio::io::duplex(1 << 16);
            let ((a_read, a_write), (b_read, b_write)) = (streams(a), streams(b));
            let (_, acceptor) = tokio::join!(
                async {
                    // the other side gives up once refused
                    let _ = initiate(a_read, a_write, id(8)).await;
                },
                async {
                    let accepted = accept(b_read, b_write, &[ours], mode).await;
                    accepted.map(|_| ())
                }
            );
            assert!(acceptor.is_err(), "{mode:?}");
        }
    }
}
