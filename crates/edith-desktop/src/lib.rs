pub mod apps;
pub mod error;
pub mod metrics;
pub mod tools;
pub mod window;

pub use apps::{AppInfo, AppLauncher};
pub use error::DesktopError;
pub use metrics::{SystemMetrics, SystemMetricsCollector};
pub use tools::{
    DesktopActiveWindowTool, DesktopLaunchAppTool, DesktopListAppsTool, DesktopSystemMetricsTool,
};
pub use window::{LinuxDesktopInspector, MockWindowInspector, WindowInfo, WindowInspector};
