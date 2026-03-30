import { useState, useCallback } from "react";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { S3Download } from "./pages/S3Download";
import { Scanning } from "./pages/Scanning";
import { Configure } from "./pages/Configure";
import { Execute } from "./pages/Execute";
import { Templates } from "./pages/Templates";
import { Schedules } from "./pages/Schedules";
import type {
  AppScreen,
  ScanResult,
  CondenseConfig,
  DockerConfig,
  Template,
} from "./types";

function App() {
  const [screen, setScreen] = useState<AppScreen>("home");
  const [filePath, setFilePath] = useState<string>("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);

  const [executeMode, setExecuteMode] = useState<"condense" | "run" | "condense_and_run">("condense");
  const [condenseConfig, setCondenseConfig] = useState<CondenseConfig | undefined>();
  const [dockerConfig, setDockerConfig] = useState<DockerConfig | undefined>();
  const [sqlPathForRun, setSqlPathForRun] = useState<string | undefined>();

  const [s3Uri, setS3Uri] = useState("");
  const [awsProfile, setAwsProfile] = useState("default");

  const goHome = useCallback(() => {
    setScreen("home");
    setActiveTemplate(null);
  }, []);

  const handleLocalFile = useCallback((path: string) => {
    setFilePath(path);
    setActiveTemplate(null);
    setScreen("scanning");
  }, []);

  const handleS3Download = useCallback((uri: string, profile: string) => {
    setS3Uri(uri);
    setAwsProfile(profile);
    setScreen("s3download");
  }, []);

  const handleS3Complete = useCallback((sqlPath: string) => {
    setFilePath(sqlPath);
    setScreen("scanning");
  }, []);

  const handleScanComplete = useCallback((result: ScanResult) => {
    setScanResult(result);
    setScreen("configure");
  }, []);

  const handleLoadTemplate = useCallback((template: Template) => {
    setActiveTemplate(template);
    setScreen("home");
  }, []);

  const handleCondense = useCallback((config: CondenseConfig) => {
    setCondenseConfig(config);
    setExecuteMode("condense");
    setScreen("execute");
  }, []);

  const handleRunSql = useCallback((dc: DockerConfig, path: string) => {
    setDockerConfig(dc);
    setSqlPathForRun(path);
    setExecuteMode("run");
    setScreen("execute");
  }, []);

  const handleCondenseAndRun = useCallback((config: CondenseConfig, dc: DockerConfig) => {
    setCondenseConfig(config);
    setDockerConfig(dc);
    setExecuteMode("condense_and_run");
    setScreen("execute");
  }, []);

  const handleNavigate = useCallback((target: AppScreen) => {
    if (target === "home") goHome();
    else setScreen(target);
  }, [goHome]);

  return (
    <Layout activeScreen={screen} onNavigate={handleNavigate}>
      {screen === "home" && (
        <Home
          onLocalFile={handleLocalFile}
          onS3Download={handleS3Download}
          onLoadTemplate={handleLoadTemplate}
          onManageTemplates={() => setScreen("templates")}
          onSchedules={() => setScreen("schedules")}
        />
      )}

      {screen === "s3download" && (
        <S3Download
          s3Uri={s3Uri}
          awsProfile={awsProfile}
          onComplete={handleS3Complete}
          onCancel={goHome}
        />
      )}

      {screen === "scanning" && (
        <Scanning
          filePath={filePath}
          onComplete={handleScanComplete}
          onCancel={goHome}
        />
      )}

      {screen === "configure" && scanResult && (
        <Configure
          scanResult={scanResult}
          filePath={filePath}
          initialTemplate={activeTemplate}
          onCondense={handleCondense}
          onRunSql={handleRunSql}
          onCondenseAndRun={handleCondenseAndRun}
          onBack={goHome}
        />
      )}

      {screen === "execute" && (
        <Execute
          mode={executeMode}
          condenseConfig={condenseConfig}
          dockerConfig={dockerConfig}
          sqlPath={sqlPathForRun}
          onComplete={goHome}
          onCancel={goHome}
        />
      )}

      {screen === "templates" && (
        <Templates
          onBack={goHome}
          onLoadTemplate={(t) => {
            setActiveTemplate(t);
            goHome();
          }}
        />
      )}

      {screen === "schedules" && <Schedules onBack={goHome} />}
    </Layout>
  );
}

export default App;
