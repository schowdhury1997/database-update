use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "database-update")]
#[command(about = "Condense and import large MySQL dump files")]
pub struct CliArgs {
    /// Path to the template JSON file
    #[arg(long)]
    pub template: Option<String>,

    /// Path to the source SQL file
    #[arg(long)]
    pub source: Option<String>,

    /// Action to perform
    #[arg(long, value_enum)]
    pub action: Option<CliAction>,
}

#[derive(Debug, Clone, clap::ValueEnum)]
pub enum CliAction {
    Condense,
    Run,
    CondenseAndRun,
    FullPipeline,
}

pub fn is_cli_mode() -> bool {
    let args: Vec<String> = std::env::args().collect();
    args.iter()
        .any(|a| a == "--template" || a == "--source" || a == "--action")
}
