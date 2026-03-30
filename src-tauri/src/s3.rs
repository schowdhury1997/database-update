use crate::error::AppError;
use crate::progress::{Phase, ProgressTracker};
use aws_config::BehaviorVersion;
use aws_credential_types::provider::ProvideCredentials;
use aws_credential_types::Credentials;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone)]
pub struct S3Uri {
    pub bucket: String,
    pub key: String,
    pub filename: String,
}

impl S3Uri {
    pub fn parse(uri: &str) -> Result<Self, AppError> {
        let uri = uri.trim();
        if !uri.starts_with("s3://") {
            return Err(AppError::InvalidInput(
                "Invalid S3 URI. Expected format: s3://bucket-name/path/to/file.sql.gz".into(),
            ));
        }
        let rest = &uri[5..];
        let slash_pos = rest.find('/').ok_or_else(|| {
            AppError::InvalidInput(
                "Invalid S3 URI. Expected format: s3://bucket-name/path/to/file.sql.gz".into(),
            )
        })?;
        let bucket = rest[..slash_pos].to_string();
        let key = rest[slash_pos + 1..].to_string();
        if key.is_empty() {
            return Err(AppError::InvalidInput(
                "Invalid S3 URI. Key path is empty.".into(),
            ));
        }
        let filename = key
            .rsplit('/')
            .next()
            .unwrap_or(&key)
            .to_string();
        Ok(Self {
            bucket,
            key,
            filename,
        })
    }
}

/// Resolve AWS credentials: .env file first, then AWS profile chain.
async fn resolve_aws_config(
    profile: Option<&str>,
    app_support_dir: &Path,
) -> Result<aws_config::SdkConfig, AppError> {
    let env_path = app_support_dir.join(".env");

    // Try .env file first
    if env_path.exists() {
        if let Ok(entries) = dotenvy::from_path_iter(&env_path) {
            let mut access_key = None;
            let mut secret_key = None;
            let mut region = None;

            for entry in entries.flatten() {
                match entry.0.as_str() {
                    "AWS_ACCESS_KEY_ID" if !entry.1.is_empty() => access_key = Some(entry.1),
                    "AWS_SECRET_ACCESS_KEY" if !entry.1.is_empty() => secret_key = Some(entry.1),
                    "AWS_REGION" | "AWS_DEFAULT_REGION" if !entry.1.is_empty() => {
                        region = Some(entry.1)
                    }
                    _ => {}
                }
            }

            if let (Some(ak), Some(sk)) = (access_key, secret_key) {
                let region_str = region.unwrap_or_else(|| "us-east-1".to_string());
                let creds = Credentials::new(ak, sk, None, None, "dotenv");
                let config = aws_config::defaults(BehaviorVersion::latest())
                    .credentials_provider(creds)
                    .region(aws_config::Region::new(region_str))
                    .load()
                    .await;
                return Ok(config);
            }
        }
    }

    // Fall back to AWS profile chain
    let mut loader = aws_config::defaults(BehaviorVersion::latest());
    if let Some(profile_name) = profile {
        loader = loader.profile_name(profile_name);
    }
    let config = loader.load().await;
    Ok(config)
}

pub async fn download_from_s3(
    s3_uri: &str,
    download_dir: &Path,
    profile: Option<&str>,
    app_support_dir: &Path,
    app: &AppHandle,
) -> Result<PathBuf, AppError> {
    let parsed = S3Uri::parse(s3_uri)?;
    let config = resolve_aws_config(profile, app_support_dir).await?;
    let client = aws_sdk_s3::Client::new(&config);

    // HEAD request for file size
    let head = client
        .head_object()
        .bucket(&parsed.bucket)
        .key(&parsed.key)
        .send()
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("NoSuchBucket") {
                AppError::S3(format!(
                    "S3 bucket '{}' not found. Check the URI and your permissions.",
                    parsed.bucket
                ))
            } else if msg.contains("AccessDenied") || msg.contains("Forbidden") {
                AppError::S3(format!(
                    "Access denied to '{}'. Check that your credentials have s3:GetObject permission.",
                    s3_uri
                ))
            } else if msg.contains("NoSuchKey") || msg.contains("NotFound") {
                AppError::S3(format!("Object '{}' not found in bucket '{}'.", parsed.key, parsed.bucket))
            } else {
                AppError::S3(format!("S3 error: {}", msg))
            }
        })?;

    let total_bytes = head.content_length().unwrap_or(0) as u64;

    // Ensure download directory exists
    std::fs::create_dir_all(download_dir)?;

    let output_path = download_dir.join(&parsed.filename);
    let part_path = download_dir.join(format!("{}.part", &parsed.filename));

    // Check for resume
    let mut start_byte: u64 = 0;
    if part_path.exists() {
        let part_size = std::fs::metadata(&part_path)?.len();
        if part_size >= total_bytes && total_bytes > 0 {
            // Already complete
            std::fs::rename(&part_path, &output_path)?;
            return Ok(output_path);
        }
        if part_size > 0 {
            start_byte = part_size;
        }
    }

    // Download
    let mut get_req = client
        .get_object()
        .bucket(&parsed.bucket)
        .key(&parsed.key);

    if start_byte > 0 {
        get_req = get_req.range(format!("bytes={}-", start_byte));
    }

    let resp = get_req.send().await.map_err(|e| {
        AppError::S3(format!("Network error during download. {}", e))
    })?;

    let mut stream = resp.body.into_async_read();
    let file = if start_byte > 0 {
        tokio::fs::OpenOptions::new()
            .append(true)
            .open(&part_path)
            .await?
    } else {
        tokio::fs::File::create(&part_path).await?
    };

    let mut writer = tokio::io::BufWriter::new(file);
    let mut tracker = ProgressTracker::new(Phase::Downloading, total_bytes);
    let mut downloaded = start_byte;
    let mut buf = vec![0u8; 1024 * 1024]; // 1MB chunks

    loop {
        let n = tokio::io::AsyncReadExt::read(&mut stream, &mut buf).await?;
        if n == 0 {
            break;
        }
        writer.write_all(&buf[..n]).await?;
        downloaded += n as u64;

        if tracker.should_emit(downloaded) {
            tracker.emit(
                app,
                downloaded,
                &format!(
                    "Downloading from S3... {:.1} GB / {:.1} GB",
                    downloaded as f64 / 1_073_741_824.0,
                    total_bytes as f64 / 1_073_741_824.0
                ),
            );
        }
    }

    writer.flush().await?;
    writer.shutdown().await?;

    // Rename .part to final
    std::fs::rename(&part_path, &output_path)?;
    tracker.emit_complete(app, "Download complete.");

    Ok(output_path)
}

/// Check if valid AWS credentials are available.
pub async fn check_credentials(
    profile: Option<&str>,
    app_support_dir: &Path,
) -> Result<bool, AppError> {
    let config = resolve_aws_config(profile, app_support_dir).await?;
    let provider = config.credentials_provider();
    match provider {
        Some(p) => {
            match p
                .provide_credentials()
                .await
            {
                Ok(_) => Ok(true),
                Err(_) => Ok(false),
            }
        }
        None => Ok(false),
    }
}

/// List AWS profiles from ~/.aws/credentials and ~/.aws/config
pub fn list_aws_profiles() -> Vec<String> {
    let mut profiles = vec!["default".to_string()];

    let home = dirs::home_dir().unwrap_or_default();
    for path in [
        home.join(".aws/credentials"),
        home.join(".aws/config"),
    ] {
        if let Ok(content) = std::fs::read_to_string(&path) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('[') && trimmed.ends_with(']') {
                    let name = trimmed[1..trimmed.len() - 1].to_string();
                    let name = name.strip_prefix("profile ").unwrap_or(&name).to_string();
                    if !profiles.contains(&name) {
                        profiles.push(name);
                    }
                }
            }
        }
    }

    profiles
}
