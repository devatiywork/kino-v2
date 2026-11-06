#[cfg(windows)]
pub fn mark_file_sparse(f: &std::fs::File) -> bool {
    use std::os::windows::io::AsRawHandle;
    use windows::{
        Win32::Foundation::HANDLE, Win32::System::IO::DeviceIoControl,
        Win32::System::Ioctl::FSCTL_SET_SPARSE,
    };

    let handle = HANDLE(f.as_raw_handle());
    // Kino: a synchronous call must get lpBytesReturned, says its documentation
    let mut returned = 0u32;

    unsafe {
        DeviceIoControl(
            handle,
            FSCTL_SET_SPARSE,
            None,
            0,
            None,
            0,
            Some(&mut returned),
            None,
        )
        .is_ok()
    }
}
