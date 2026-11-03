use async_trait::async_trait;
use chrono::{Local, Utc};
use edith_core::{AutonomyClass, SideEffects};
use serde_json::{json, Value};

use crate::error::Result;
use crate::tool::Tool;

pub struct DateTimeTool;

#[async_trait]
impl Tool for DateTimeTool {
    fn name(&self) -> &str {
        "datetime.now"
    }

    fn description(&self) -> &str {
        "Get the current local and UTC system timestamp, date, and timezone offset."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {}
        })
    }

    fn side_effects(&self) -> SideEffects {
        SideEffects::None
    }

    fn default_autonomy(&self) -> AutonomyClass {
        AutonomyClass::Automatic
    }

    async fn execute(&self, _input: Value) -> Result<Value> {
        let utc_now = Utc::now();
        let local_now = Local::now();

        Ok(json!({
            "utc": utc_now.to_rfc3339(),
            "local": local_now.to_rfc3339(),
            "timezone": local_now.offset().to_string(),
            "date": local_now.format("%Y-%m-%d").to_string(),
            "time": local_now.format("%H:%M:%S").to_string(),
        }))
    }
}
