use thiserror::Error;

#[derive(Debug, Error)]
pub enum DesktopError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("System metric read error: {0}")]
    MetricRead(String),

    #[error("Application not found: {0}")]
    AppNotFound(String),

    #[error("Application launch failed: {0}")]
    LaunchFailed(String),

    #[error("Desktop environment inspection failed: {0}")]
    InspectionFailed(String),

    #[error("Security policy violation: {0}")]
    SecurityViolation(String),
}
