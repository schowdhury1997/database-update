use crate::error::AppError;
use crate::progress::{Phase, ProgressTracker};
use flate2::read::GzDecoder;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub fn extract_gz(gz_path: &Path, app: &AppHandle) -> Result<PathBuf, AppError> {
    let file = std::fs::File::open(gz_path)?;
    let compressed_size = file.metadata()?.len();

    // Output file: strip .gz extension
    let output_path = gz_path.with_extension("");
    if output_path == gz_path {
        return Err(AppError::InvalidInput(
            "File does not have a .gz extension".to_string(),
        ));
    }

    let reader = BufReader::with_capacity(8 * 1024 * 1024, file);
    let counting_reader = CountingReader::new(reader);
    let counter = counting_reader.counter();
    let decoder = GzDecoder::new(counting_reader);
    let mut buffered_decoder = BufReader::with_capacity(8 * 1024 * 1024, decoder);

    let output_file = std::fs::File::create(&output_path)?;
    let mut writer = BufWriter::with_capacity(8 * 1024 * 1024, output_file);

    let mut tracker = ProgressTracker::new(Phase::Extracting, compressed_size);
    let mut buf = vec![0u8; 8 * 1024 * 1024];

    loop {
        let bytes_read = buffered_decoder.read(&mut buf)?;
        if bytes_read == 0 {
            break;
        }
        writer.write_all(&buf[..bytes_read])?;

        let compressed_read = counter.get();
        if tracker.should_emit(compressed_read) {
            tracker.emit(
                app,
                compressed_read,
                &format!(
                    "Decompressing: {:.1} GB / {:.1} GB compressed read",
                    compressed_read as f64 / 1_073_741_824.0,
                    compressed_size as f64 / 1_073_741_824.0
                ),
            );
        }
    }

    writer.flush()?;
    tracker.emit_complete(app, "Extraction complete.");

    Ok(output_path)
}

/// A reader wrapper that counts bytes read from the inner reader.
struct CountingReader<R> {
    inner: R,
    counter: std::sync::Arc<std::sync::atomic::AtomicU64>,
}

impl<R> CountingReader<R> {
    fn new(inner: R) -> Self {
        Self {
            inner,
            counter: std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0)),
        }
    }

    fn counter(&self) -> ByteCounter {
        ByteCounter {
            inner: self.counter.clone(),
        }
    }
}

impl<R: Read> Read for CountingReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.counter
            .fetch_add(n as u64, std::sync::atomic::Ordering::Relaxed);
        Ok(n)
    }
}

struct ByteCounter {
    inner: std::sync::Arc<std::sync::atomic::AtomicU64>,
}

impl ByteCounter {
    fn get(&self) -> u64 {
        self.inner.load(std::sync::atomic::Ordering::Relaxed)
    }
}
