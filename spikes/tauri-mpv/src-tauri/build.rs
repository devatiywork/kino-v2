use std::path::PathBuf;

fn main() {
    // libmpv: import library for the linker and the dll next to the exe
    let vendor = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../vendor/libmpv");
    let vendor = vendor.canonicalize().expect("vendor/libmpv not found — run scripts/fetch-libmpv.ps1");
    println!("cargo:rustc-link-search=native={}", vendor.display());

    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    // OUT_DIR = target/<profile>/build/<pkg>/out → target/<profile>
    let profile_dir = out.ancestors().nth(3).unwrap().to_path_buf();
    let dll = vendor.join("libmpv-2.dll");
    let dst = profile_dir.join("libmpv-2.dll");
    if !dst.exists() {
        std::fs::copy(&dll, &dst).expect("copy libmpv-2.dll");
    }
    println!("cargo:rerun-if-changed={}", dll.display());

    tauri_build::build();
}
