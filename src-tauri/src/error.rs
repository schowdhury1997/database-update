use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("S3 error: {0}")]
    S3(String),

    #[error("Docker error: {0}")]
    Docker(String),

    #[error("Scanner error: {0}")]
    Scanner(String),

    #[error("Condenser error: {0}")]
    Condenser(String),

    #[error("Template error: {0}")]
    Template(String),

    #[error("Scheduler error: {0}")]
    Scheduler(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("AWS credentials not found. Configure a .env file at {0} or set up an AWS profile in ~/.aws/credentials.")]
    CredentialsNotFound(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
