import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus, Trash2, Clock, Calendar, CalendarDays,
  XCircle, CheckCircle2, Pause, AlertTriangle, Play, Zap, Cloud,
} from "lucide-react";
import type { ScheduledTask, Template, ScheduleConfig } from "../types";

interface SchedulesProps { onBack: () => void; }

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function Schedules(_props: SchedulesProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [taskName, setTaskName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [action, setAction] = useState("full_pipeline");
  const [scheduleType, setScheduleType] = useState<"one_time" | "daily" | "weekly">("daily");
  const [hour, setHour] = useState(2);
  const [minute, setMinute] = useState(0);
  const [dayOfWeek, setDayOfWeek] = useState(0);

  const refresh = async () => {
    try {
      const [t, tmpl] = await Promise.all([invoke<ScheduledTask[]>("list_schedules"), invoke<Template[]>("list_templates")]);
      setTasks(t); setTemplates(tmpl);
    } catch (e) { setError(typeof e === "string" ? e : String(e)); }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async () => {
    if (!taskName || !selectedTemplate) return;
    try {
      const schedule: ScheduleConfig = { schedule_type: scheduleType, hour, minute, day_of_week: scheduleType === "weekly" ? dayOfWeek : undefined };
      await invoke("create_schedule", { name: taskName, templateName: selectedTemplate, sourcePath: null, action, schedule });
      setShowCreate(false); setTaskName(""); await refresh();
    } catch (e) { setError(typeof e === "string" ? e : String(e)); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this scheduled task?")) return;
    try { await invoke("delete_schedule", { id }); await refresh(); }
    catch (e) { setError(typeof e === "string" ? e : String(e)); }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between" style={{ padding: "40px 48px 20px 48px" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }} className="text-text-primary">Scheduled Tasks</h1>
          <p style={{ fontSize: 14, marginTop: 8 }} className="text-text-secondary">
            Automate database updates with scheduled runs via macOS launchd
          </p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className={`flex items-center rounded-lg font-medium transition-colors shadow-sm ${
            showCreate ? "bg-bg-tertiary text-text-secondary hover:bg-bg-hover" : "bg-accent text-white hover:bg-accent-hover"
          }`}
          style={{ gap: 10, padding: "12px 22px", fontSize: 14 }}>
          {showCreate ? <>Cancel</> : <><Plus size={16} /> New Schedule</>}
        </button>
      </div>

      <div style={{ padding: "0 48px 48px 48px" }} className="flex-1">
        {error && (
          <div className="flex items-start bg-error-muted border border-error/20 rounded-xl"
            style={{ gap: 14, padding: 20, marginBottom: 28 }}>
            <XCircle size={18} className="text-error flex-shrink-0 mt-0.5" />
            <div style={{ fontSize: 14 }} className="text-error">{error}</div>
          </div>
        )}

        {showCreate && (
          <div className="bg-bg-secondary border border-border-default rounded-xl" style={{ padding: 32, marginBottom: 28 }}>
            <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 24 }} className="text-text-primary">Create Schedule</h3>

            <div className="grid grid-cols-2" style={{ gap: 20, marginBottom: 24 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, display: "block" }} className="text-text-secondary">Task Name</label>
                <input type="text" value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="e.g., Nightly DB update" className="w-full" />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, display: "block" }} className="text-text-secondary">Template</label>
                <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)} className="w-full">
                  <option value="">Select a template...</option>
                  {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, display: "block" }} className="text-text-secondary">Action</label>
              <div className="grid grid-cols-4" style={{ gap: 10 }}>
                {[
                  { value: "full_pipeline", label: "Full Pipeline", icon: <Cloud size={15} />, desc: "S3 > Condense > Run" },
                  { value: "condense_and_run", label: "Condense & Run", icon: <Zap size={15} />, desc: "Local file" },
                  { value: "condense", label: "Condense Only", icon: <Zap size={15} />, desc: "No import" },
                  { value: "run", label: "Run Only", icon: <Play size={15} />, desc: "Direct import" },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => setAction(opt.value)}
                    className={`flex flex-col items-start rounded-lg border text-left transition-colors ${
                      action === opt.value ? "border-accent bg-accent-muted text-text-primary" : "border-border-default bg-bg-primary text-text-secondary hover:bg-bg-hover"
                    }`}
                    style={{ padding: 14, gap: 6 }}>
                    <div className="flex items-center" style={{ gap: 8 }}>{opt.icon}<span style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</span></div>
                    <span style={{ fontSize: 11 }} className="text-text-tertiary">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-end" style={{ gap: 20, marginBottom: 28 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, display: "block" }} className="text-text-secondary">Frequency</label>
                <div className="flex items-center bg-bg-tertiary rounded-lg" style={{ padding: 3, gap: 2 }}>
                  {(["daily", "weekly", "one_time"] as const).map((type) => (
                    <button key={type} onClick={() => setScheduleType(type)}
                      className={`flex items-center rounded-md font-medium transition-colors ${
                        scheduleType === type ? "bg-bg-elevated text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
                      }`}
                      style={{ gap: 6, padding: "8px 14px", fontSize: 12 }}>
                      {type === "daily" && <Calendar size={13} />}
                      {type === "weekly" && <CalendarDays size={13} />}
                      {type === "one_time" && <Clock size={13} />}
                      {type === "daily" ? "Daily" : type === "weekly" ? "Weekly" : "One-time"}
                    </button>
                  ))}
                </div>
              </div>
              {scheduleType === "weekly" && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, display: "block" }} className="text-text-secondary">Day</label>
                  <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} style={{ width: 160 }}>
                    {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, display: "block" }} className="text-text-secondary">Time</label>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} style={{ width: 70, textAlign: "center" }} />
                  <span className="text-text-tertiary font-bold" style={{ fontSize: 16 }}>:</span>
                  <input type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Number(e.target.value))} style={{ width: 70, textAlign: "center" }} />
                </div>
              </div>
            </div>

            <button onClick={handleCreate} disabled={!taskName || !selectedTemplate}
              className="flex items-center rounded-lg text-white bg-accent hover:bg-accent-hover font-medium transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ gap: 10, padding: "12px 24px", fontSize: 14 }}>
              <Plus size={16} /> Create Schedule
            </button>
          </div>
        )}

        {tasks.length === 0 && !showCreate ? (
          <div className="flex flex-col items-center justify-center" style={{ paddingTop: 100 }}>
            <div className="rounded-2xl bg-bg-tertiary flex items-center justify-center"
              style={{ width: 72, height: 72, marginBottom: 24 }}>
              <Clock size={32} className="text-text-tertiary" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }} className="text-text-primary">No scheduled tasks</h3>
            <p style={{ fontSize: 14, maxWidth: 380 }} className="text-text-tertiary text-center">
              Create a schedule to automate your database updates. Tasks run in the background using macOS launchd.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {tasks.map((task) => (
              <div key={task.id}
                className="bg-bg-secondary border border-border-default rounded-xl flex items-center group hover:border-border-focus/30 transition-colors"
                style={{ padding: "22px 24px", gap: 20 }}>
                <div className={`rounded-xl flex items-center justify-center flex-shrink-0 ${
                  task.status === "active" ? "bg-success/15" : task.status === "paused" ? "bg-warning/15" : task.status === "failed" ? "bg-error/15" : "bg-bg-tertiary"
                }`} style={{ width: 48, height: 48 }}>
                  {task.status === "active" ? <CheckCircle2 size={22} className="text-success" />
                    : task.status === "paused" ? <Pause size={22} className="text-warning" />
                    : task.status === "failed" ? <AlertTriangle size={22} className="text-error" />
                    : <Clock size={22} className="text-text-tertiary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 15, fontWeight: 500 }} className="text-text-primary">{task.name}</div>
                  <div className="flex items-center flex-wrap" style={{ gap: 14, marginTop: 6 }}>
                    <span style={{ fontSize: 12 }} className="text-text-tertiary">Template: {task.template_name}</span>
                    <span style={{ fontSize: 12 }} className="text-text-tertiary">{task.action.replace(/_/g, " ")}</span>
                    <span className="flex items-center text-text-tertiary" style={{ gap: 5, fontSize: 12 }}>
                      <Clock size={11} />
                      {task.schedule.schedule_type === "daily" ? "Daily"
                        : task.schedule.schedule_type === "weekly" ? `Weekly, ${DAY_NAMES[task.schedule.day_of_week ?? 0]}`
                        : "One-time"}{" at "}
                      {String(task.schedule.hour).padStart(2, "0")}:{String(task.schedule.minute).padStart(2, "0")}
                    </span>
                    <span className={`font-medium uppercase tracking-wider rounded ${
                      task.status === "active" ? "bg-success/15 text-success"
                        : task.status === "failed" ? "bg-error/15 text-error"
                        : "bg-bg-tertiary text-text-tertiary"
                    }`} style={{ fontSize: 10, padding: "3px 8px" }}>
                      {task.status}
                    </span>
                  </div>
                </div>
                <button onClick={() => handleDelete(task.id)}
                  className="rounded-lg text-text-tertiary hover:text-error hover:bg-error-muted transition-colors opacity-0 group-hover:opacity-100"
                  style={{ padding: 10 }} title="Delete schedule">
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
