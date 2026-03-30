use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Downloading,
    Extracting,
    Scanning,
    Condensing,
    Importing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub phase: Phase,
    pub bytes_processed: u64,
    pub bytes_total: u64,
    pub percent: f64,
    pub speed_mbps: f64,
    pub eta_seconds: Option<u64>,
    pub message: String,
}

pub struct ProgressTracker {
    phase: Phase,
    bytes_total: u64,
    last_emit_time: Instant,
    last_emit_bytes: u64,
    start_time: Instant,
    emit_interval_bytes: u64,
}

impl ProgressTracker {
    pub fn new(phase: Phase, bytes_total: u64) -> Self {
        let emit_interval_bytes = match &phase {
            Phase::Downloading => 10 * 1024 * 1024,  // 10MB
            _ => 100 * 1024 * 1024,                   // 100MB
        };
        Self {
            phase,
            bytes_total,
            last_emit_time: Instant::now(),
            last_emit_bytes: 0,
            start_time: Instant::now(),
            emit_interval_bytes,
        }
    }

    pub fn should_emit(&self, bytes_processed: u64) -> bool {
        let time_elapsed = self.last_emit_time.elapsed().as_secs_f64() >= 2.0;
        let bytes_elapsed = bytes_processed - self.last_emit_bytes >= self.emit_interval_bytes;
        time_elapsed || bytes_elapsed
    }

    pub fn emit(&mut self, app: &AppHandle, bytes_processed: u64, message: &str) {
        let elapsed = self.start_time.elapsed().as_secs_f64();
        let speed_mbps = if elapsed > 0.0 {
            (bytes_processed as f64) / (1024.0 * 1024.0) / elapsed
        } else {
            0.0
        };

        let percent = if self.bytes_total > 0 {
            (bytes_processed as f64 / self.bytes_total as f64) * 100.0
        } else {
            0.0
        };

        let eta_seconds = if speed_mbps > 0.0 && self.bytes_total > bytes_processed {
            let remaining_mb = (self.bytes_total - bytes_processed) as f64 / (1024.0 * 1024.0);
            Some((remaining_mb / speed_mbps) as u64)
        } else {
            None
        };

        let event = ProgressEvent {
            phase: self.phase.clone(),
            bytes_processed,
            bytes_total: self.bytes_total,
            percent,
            speed_mbps,
            eta_seconds,
            message: message.to_string(),
        };

        let _ = app.emit("progress", &event);
        self.last_emit_time = Instant::now();
        self.last_emit_bytes = bytes_processed;
    }

    pub fn emit_complete(&mut self, app: &AppHandle, message: &str) {
        self.emit(app, self.bytes_total, message);
    }
}
