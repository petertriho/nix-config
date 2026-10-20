pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "../../Common"

// System stats for every bar: one poll of CPU, memory, temperature and GPU,
// however many bars exist. The top-process lists and the fast GPU poll run only
// while a stats popup is open.
Singleton {
    id: root

    // True while the stats popup of any screen is open.
    readonly property bool detailed: Popups.active.endsWith(":stats")

    property real cpuUsage: 0
    // Usage in percent per core, indexed by the core number. `coreCount`
    // changes only when the number of cores changes, so a Repeater with it as
    // the model keeps its delegates across polls.
    property var perCoreUsage: []
    property int coreCount: 0
    property string loadAvg: ""
    property string processCount: ""
    property var topCpuApps: []

    property real usedMemory: 0
    property real totalMemory: 0
    property real availableMemory: 0
    property real swapTotal: 0
    property real swapUsed: 0
    property var topMemoryApps: []

    property real temperature: 0
    // True after the first reading of the CPU sensor.
    property bool temperatureAvailable: false
    readonly property bool temperatureCritical: root.temperature >= Config.thresholds.temperature.critical
    readonly property bool temperatureWarning: root.temperature >= Config.thresholds.temperature.warning

    // "amd", "intel" or "nvidia" after the probe. "none" when no GPU tool is installed.
    property string gpuBackend: ""
    property bool gpuAvailable: false
    property string gpuStatus: "Detecting GPU backend"
    // stderr of the last GPU poll. It explains an empty stdout.
    property string gpuError: ""
    property string gpuName: ""
    property real gpuUsage: 0
    property real gpuMemoryUsed: 0
    property real gpuMemoryTotal: 0
    property real gpuTemperature: 0
    property var gpuApps: []

    // Drivers of the CPU temperature sensor, matched against the hwmon name.
    readonly property var cpuTempDrivers: ["coretemp", "k10temp"]
    property string tempPath: ""
    property string gpuTempPath: ""
    property var prevCpuTimes: ({})
    property bool hasPrevData: false

    readonly property string nvidiaGpuQuery: "nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name --format=csv,noheader,nounits"
    readonly property string nvidiaAppsQuery: "nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits"

    Timer {
        interval: Config.intervals.cpu
        repeat: true
        running: true
        onTriggered: {
            statView.reload();
            loadView.reload();
        }
    }
    Timer {
        interval: Config.intervals.memory
        repeat: true
        running: true
        onTriggered: memView.reload()
    }
    Timer {
        interval: Config.intervals.temperature
        repeat: true
        running: root.tempPath !== ""
        onTriggered: tempView.reload()
    }
    Timer {
        id: gpuTimer
        // The bar shows the GPU usage too, so it keeps a slow poll while the popup is closed.
        interval: root.detailed ? Config.intervals.gpu : Math.max(Config.intervals.gpu * 6, 30000)
        repeat: true
        running: root.gpuBackend !== "" && root.gpuBackend !== "none"
        onTriggered: root.updateGpu()
    }
    Timer {
        interval: Math.max(5000, Math.min(Config.intervals.cpu, Config.intervals.memory) * 2)
        repeat: true
        running: root.detailed
        onTriggered: root.updateTopApps()
    }

    onDetailedChanged: {
        if (root.detailed) {
            root.updateTopApps();
            root.updateGpu();
        }
        // Start the new interval now.
        if (gpuTimer.running)
            gpuTimer.restart();
    }

    FileView {
        id: statView
        path: "/proc/stat"
        watchChanges: false
        printErrors: false
        onLoaded: root.parseCpuStats(statView.text())
    }
    FileView {
        id: loadView
        path: "/proc/loadavg"
        watchChanges: false
        printErrors: false
        onLoaded: root.parseLoadAvg(loadView.text())
    }
    FileView {
        id: memView
        path: "/proc/meminfo"
        watchChanges: false
        printErrors: false
        onLoaded: root.parseMeminfo(memView.text())
    }
    FileView {
        id: tempView
        path: root.tempPath !== "" ? root.tempPath : "/dev/null"
        watchChanges: false
        printErrors: false
        onLoaded: {
            const milli = parseInt(tempView.text());
            if (!isNaN(milli)) {
                root.temperature = milli / 1000;
                root.temperatureAvailable = true;
            }
        }
    }
    // Intel only: amdgpu_top and nvidia-smi report the GPU temperature themselves.
    FileView {
        id: gpuTempView
        path: root.gpuTempPath !== "" ? root.gpuTempPath : "/dev/null"
        watchChanges: false
        printErrors: false
        onLoaded: {
            const milli = parseInt(gpuTempView.text());
            if (!isNaN(milli))
                root.gpuTemperature = milli / 1000;
        }
    }

    // Runs once: finds the temperature sensors and the GPU tool. Prints
    // `key=value` lines.
    Process {
        id: probeProcess
        running: true
        command: ["sh", "-c", "cpu=; igpu=; "
            + "for h in /sys/class/hwmon/hwmon*; do "
            + "[ -f \"$h/temp1_input\" ] || continue; "
            + "case \"$(cat \"$h/name\" 2>/dev/null)\" in "
            + root.cpuTempDrivers.join("|") + ") [ -n \"$cpu\" ] || cpu=\"$h/temp1_input\" ;; "
            + "i915) [ -n \"$igpu\" ] || igpu=\"$h/temp1_input\" ;; "
            + "esac; done; "
            + "echo \"cputemp=$cpu\"; echo \"gputemp=$igpu\"; "
            + "for t in amdgpu_top intel_gpu_top nvidia-smi; do "
            + "if command -v \"$t\" >/dev/null 2>&1; then echo \"gpu=$t\"; break; fi; done"]
        stdout: StdioCollector {
            id: probeOut
            onStreamFinished: root.applyProbe(probeOut.text)
        }
    }

    Process {
        id: topAppsProcess
        command: ["ps", "-eo", "comm:40,pcpu,rss", "--no-headers"]
        stdout: StdioCollector {
            id: topAppsOut
            onStreamFinished: root.parseTopApps(topAppsOut.text.trim())
        }
    }

    Process {
        id: gpuProcess
        stdout: StdioCollector {
            id: gpuOut
            onStreamFinished: root.parseGpuStats(gpuOut.text.trim())
        }
        // The two streams finish in either order. Both paths end with the
        // stderr text as the status when the poll failed.
        stderr: StdioCollector {
            id: gpuErr
            onStreamFinished: {
                root.gpuError = gpuErr.text.trim();
                if (root.gpuError && !root.gpuAvailable)
                    root.gpuStatus = root.gpuError;
            }
        }
    }

    Process {
        id: gpuNameProcess
        stdout: StdioCollector {
            id: gpuNameOut
            onStreamFinished: root.applyGpuAppNames(gpuNameOut.text.trim())
        }
    }

    function applyProbe(output: string): void {
        const values = {};
        for (const line of output.split("\n")) {
            const eq = line.indexOf("=");
            if (eq > 0)
                values[line.substring(0, eq)] = line.substring(eq + 1).trim();
        }
        root.tempPath = values.cputemp || "";
        root.gpuTempPath = values.gputemp || "";
        const tools = {
            "amdgpu_top": "amd",
            "intel_gpu_top": "intel",
            "nvidia-smi": "nvidia"
        };
        root.gpuBackend = tools[values.gpu] || "none";
        if (root.gpuBackend === "none") {
            root.gpuAvailable = false;
            root.gpuStatus = "No supported GPU monitor found (install amdgpu_top, nvidia-smi, or intel_gpu_top)";
        } else {
            root.updateGpu();
        }
    }

    // Runs the detected GPU tool directly. A poll that is still running is
    // not restarted: amdgpu_top needs about 1 s.
    function updateGpu(): void {
        if (gpuProcess.running)
            return;
        let command;
        if (root.gpuBackend === "amd") {
            command = ["amdgpu_top", "-J", "-n", "1"];
        } else if (root.gpuBackend === "intel") {
            command = ["intel_gpu_top", "-J", "-s", "200", "-n", "1", "-o", "-"];
            if (root.gpuTempPath !== "")
                gpuTempView.reload();
        } else if (root.gpuBackend === "nvidia") {
            // The process list shows only in the popup.
            command = root.detailed ? ["sh", "-c", root.nvidiaGpuQuery + "; printf '\\n--apps--\\n'; " + root.nvidiaAppsQuery] : root.nvidiaGpuQuery.split(" ");
        } else {
            return;
        }
        root.gpuError = "";
        gpuProcess.exec({
            command: command
        });
    }

    function updateTopApps(): void {
        if (!topAppsProcess.running)
            topAppsProcess.running = true;
    }

    function parseLoadAvg(output: string): void {
        const parts = output.trim().split(/\s+/);
        if (parts.length >= 3)
            root.loadAvg = parts.slice(0, 3).join(" ");
        if (parts.length >= 5)
            root.processCount = parts[3];
    }

    function parseMeminfo(output: string): void {
        if (!output)
            return;
        let memTotalKb = 0, memAvailKb = 0, swapTotalKb = 0, swapFreeKb = 0;
        for (const line of output.split("\n")) {
            const m = line.match(/^(\w+):\s+(\d+)/);
            if (!m)
                continue;
            if (m[1] === "MemTotal")
                memTotalKb = parseInt(m[2]);
            else if (m[1] === "MemAvailable")
                memAvailKb = parseInt(m[2]);
            else if (m[1] === "SwapTotal")
                swapTotalKb = parseInt(m[2]);
            else if (m[1] === "SwapFree")
                swapFreeKb = parseInt(m[2]);
        }
        if (memTotalKb > 0) {
            root.totalMemory = memTotalKb / 1048576;
            root.availableMemory = memAvailKb / 1048576;
            root.usedMemory = (memTotalKb - memAvailKb) / 1048576;
        }
        root.swapTotal = swapTotalKb / 1048576;
        root.swapUsed = (swapTotalKb - swapFreeKb) / 1048576;
    }

    function parseCpuStats(output: string): void {
        if (!output)
            return;
        const prev = root.prevCpuTimes;
        const cores = [];
        let totalIdle = 0, totalAll = 0;

        for (const line of output.split("\n")) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 5)
                continue;
            const name = parts[0];
            if (name === "cpu") {
                totalIdle = parseInt(parts[4]);
                for (let j = 1; j < parts.length; j++)
                    totalAll += parseInt(parts[j]);
            } else if (/^cpu\d+$/.test(name)) {
                const idle = parseInt(parts[4]);
                let total = 0;
                for (let k = 1; k < parts.length; k++)
                    total += parseInt(parts[k]);
                const last = prev[name];
                let usage = 0;
                if (last && root.hasPrevData && total > last.total)
                    usage = ((total - last.total) - (idle - last.idle)) / (total - last.total) * 100;
                prev[name] = {
                    total: total,
                    idle: idle
                };
                cores[parseInt(name.substring(3))] = usage;
            }
        }
        // An offline core has no line. Its slot shows 0.
        for (let c = 0; c < cores.length; c++) {
            if (cores[c] === undefined)
                cores[c] = 0;
        }

        root.perCoreUsage = cores;
        if (root.coreCount !== cores.length)
            root.coreCount = cores.length;
        const lastTotal = prev["_total"];
        if (root.hasPrevData && lastTotal && totalAll > lastTotal.total) {
            const dTotal = totalAll - lastTotal.total;
            root.cpuUsage = (dTotal - (totalIdle - lastTotal.idle)) / dTotal * 100;
        }
        prev["_total"] = {
            total: totalAll,
            idle: totalIdle
        };
        root.hasPrevData = true;
    }

    // Nix runs a wrapped program as `.name-wrapped`. The kernel keeps 15
    // characters of a process name, so a long one loses part of the suffix
    // (".firefox-wrappe").
    function displayName(name: string): string {
        if (!name.startsWith("."))
            return name.replace(/-wrapped$/, "");
        const suffix = name.length >= 15 ? /-(?:w(?:r(?:a(?:p(?:p(?:e(?:d)?)?)?)?)?)?)?$/ : /-wrapped$/;
        return name.slice(1).replace(suffix, "");
    }

    function parseTopApps(output: string): void {
        if (!output) {
            root.topCpuApps = [];
            root.topMemoryApps = [];
            return;
        }
        const cpuTotals = {};
        const memoryTotals = {};
        for (const raw of output.split("\n")) {
            const parts = raw.trim().split(/\s+/);
            if (parts.length < 3)
                continue;
            const usage = parseFloat(parts[parts.length - 2]);
            const rssMb = parseFloat(parts[parts.length - 1]) / 1024;
            if (isNaN(usage) || isNaN(rssMb))
                continue;
            // A name can contain spaces: it is everything before the last two columns.
            const name = root.displayName(parts.slice(0, parts.length - 2).join(" "));
            // The poll itself.
            if (name === "ps")
                continue;
            cpuTotals[name] = (cpuTotals[name] || 0) + usage;
            memoryTotals[name] = (memoryTotals[name] || 0) + rssMb;
        }
        const cpuApps = [];
        const memoryApps = [];
        for (const appName in cpuTotals) {
            cpuApps.push({
                name: appName,
                usage: cpuTotals[appName]
            });
            memoryApps.push({
                name: appName,
                memoryMb: memoryTotals[appName]
            });
        }
        cpuApps.sort((a, b) => b.usage - a.usage);
        memoryApps.sort((a, b) => b.memoryMb - a.memoryMb);
        root.topCpuApps = cpuApps.slice(0, 5);
        root.topMemoryApps = memoryApps.slice(0, 5);
    }

    function parseGpuStats(output: string): void {
        if (!output) {
            root.setGpuFailed(root.gpuError || "The GPU monitor returned no data");
            return;
        }
        if (root.gpuBackend === "amd")
            root.parseAmdGpuStats(output);
        else if (root.gpuBackend === "intel")
            root.parseIntelGpuStats(output);
        else if (root.gpuBackend === "nvidia")
            root.parseNvidiaGpuStats(output);
    }

    function metricValue(metric: var): real {
        return metric && metric.value !== undefined && metric.value !== null ? Number(metric.value) : 0;
    }

    // Top 5 by usage, then by memory.
    function topGpuApps(apps: var): var {
        return apps.filter(app => app.usage > 0 || app.memoryMb > 0).sort((a, b) => (b.usage - a.usage) || (b.memoryMb - a.memoryMb)).slice(0, 5);
    }

    function setGpuFailed(status: string): void {
        root.gpuAvailable = false;
        root.gpuStatus = status;
        root.gpuApps = [];
    }

    function parseAmdGpuStats(jsonText: string): void {
        try {
            const data = JSON.parse(jsonText);
            if (!data.devices || data.devices.length === 0)
                throw new Error("amdgpu_top found no AMD devices");
            const device = data.devices[0];
            const info = device.Info || {};
            const sensors = device.Sensors || {};
            const activity = device.gpu_activity || {};
            const vram = device.VRAM || {};
            const fdinfo = device.fdinfo || {};

            root.gpuName = info.DeviceName || info["ASIC Name"] || "AMD GPU";
            root.gpuUsage = Math.max(root.metricValue(activity.GFX), root.metricValue(activity.MediaEngine), root.metricValue(activity.Memory));
            root.gpuMemoryUsed = root.metricValue(vram["Total VRAM Usage"]);
            root.gpuMemoryTotal = root.metricValue(vram["Total VRAM"]);
            root.gpuTemperature = root.metricValue(sensors["Edge Temperature"] || sensors["Junction Temperature"] || sensors["Memory Temperature"]);

            const apps = [];
            for (const pid in fdinfo) {
                const entry = fdinfo[pid];
                const usage = entry && entry.usage ? entry.usage.usage : null;
                if (!usage)
                    continue;
                apps.push({
                    name: entry.name || pid,
                    pid: pid,
                    usage: Math.max(root.metricValue(usage.GFX), root.metricValue(usage.Media) + root.metricValue(usage.VCN_Unified)),
                    memoryMb: root.metricValue(usage.VRAM)
                });
            }
            root.gpuApps = root.topGpuApps(apps);
            root.resolveGpuAppNames();
            root.gpuAvailable = true;
            root.gpuStatus = "";
        } catch (err) {
            root.setGpuFailed("Failed to parse amdgpu_top output: " + err);
        }
    }

    function parseNvidiaGpuStats(output: string): void {
        const sections = output.split("\n--apps--\n");
        const gpuLine = sections[0].trim().split("\n")[0];
        const parts = gpuLine ? gpuLine.split(/,\s*/) : [];
        if (parts.length < 5) {
            root.setGpuFailed("nvidia-smi returned incomplete GPU data");
            return;
        }

        root.gpuUsage = parseFloat(parts[0]) || 0;
        root.gpuMemoryUsed = parseFloat(parts[1]) || 0;
        root.gpuMemoryTotal = parseFloat(parts[2]) || 0;
        root.gpuTemperature = parseFloat(parts[3]) || 0;
        root.gpuName = parts.slice(4).join(", ") || "NVIDIA GPU";

        // Without the process section (popup closed) the last list stays.
        if (sections.length > 1) {
            const apps = [];
            for (const line of sections[1].trim().split("\n")) {
                const cols = line.trim().split(/,\s*/);
                if (cols.length < 3)
                    continue;
                apps.push({
                    pid: cols[0],
                    name: cols[1],
                    usage: 0,
                    memoryMb: parseFloat(cols[2]) || 0
                });
            }
            root.gpuApps = root.topGpuApps(apps);
            root.resolveGpuAppNames();
        }
        root.gpuAvailable = true;
        root.gpuStatus = "";
    }

    function collectBusyValues(value: var, values: var): void {
        if (value === null || value === undefined || typeof value !== "object")
            return;
        for (const key in value) {
            const child = value[key];
            if (key === "busy" || key === "Busy") {
                const num = typeof child === "number" ? child : parseFloat(child);
                if (!isNaN(num))
                    values.push(num);
            }
            root.collectBusyValues(child, values);
        }
    }

    function maxBusy(value: var): real {
        const values = [];
        root.collectBusyValues(value, values);
        return values.reduce((a, b) => Math.max(a, b), 0);
    }

    function collectIntelClients(value: var, clients: var): void {
        if (value === null || value === undefined || typeof value !== "object")
            return;
        if (value.name !== undefined && value.pid !== undefined) {
            const memBytes = value.memory && value.memory.system && value.memory.system.total ? parseFloat(value.memory.system.total) || 0 : 0;
            clients.push({
                name: value.name,
                pid: String(value.pid),
                usage: root.maxBusy(value),
                memoryMb: memBytes / 1048576
            });
            return;
        }
        for (const key in value)
            root.collectIntelClients(value[key], clients);
    }

    // intel_gpu_top -J writes a JSON object, or an array of objects that may be
    // unterminated after `-n 1`.
    function intelGpuJsonText(text: string): string {
        const output = String(text).trim();
        const start = output.indexOf("{");
        const end = output.lastIndexOf("}");
        if (start < 0 || end < start) {
            const detail = output ? ": " + output.substring(0, 120) : "";
            throw new Error("intel_gpu_top returned no JSON data" + detail);
        }
        return output.substring(start, end + 1);
    }

    function parseIntelGpuStats(output: string): void {
        try {
            const data = JSON.parse(root.intelGpuJsonText(output));
            const clients = [];
            root.collectIntelClients(data.clients || {}, clients);

            root.gpuName = data.device || data.name || "Intel GPU";
            root.gpuUsage = root.maxBusy(data.engines || data);
            root.gpuMemoryUsed = 0;
            root.gpuMemoryTotal = 0;
            root.gpuApps = root.topGpuApps(clients);
            root.resolveGpuAppNames();
            root.gpuAvailable = true;
            root.gpuStatus = "";
        } catch (err) {
            root.setGpuFailed("Failed to parse intel_gpu_top output: " + err);
        }
    }

    // The GPU tools report truncated process names. The popup shows the
    // executable name instead.
    function resolveGpuAppNames(): void {
        if (!root.detailed || gpuNameProcess.running)
            return;
        const pids = [];
        for (const app of root.gpuApps) {
            const pid = String(app.pid);
            if (/^\d+$/.test(pid) && pids.indexOf(pid) === -1)
                pids.push(pid);
        }
        if (pids.length === 0)
            return;
        gpuNameProcess.exec({
            command: ["sh", "-c", "for p in \"$@\"; do exe=$(readlink \"/proc/$p/exe\" 2>/dev/null); name=${exe##*/}; name=${name#.}; printf '%s\\t%s\\n' \"$p\" \"$name\"; done", "sh"].concat(pids)
        });
    }

    function applyGpuAppNames(output: string): void {
        if (!output)
            return;
        const names = {};
        for (const line of output.split("\n")) {
            const parts = line.split("\t");
            if (parts.length >= 2 && parts[1])
                names[parts[0]] = parts[1];
        }
        let changed = false;
        const updated = root.gpuApps.map(app => {
            const resolved = names[String(app.pid)] ? root.displayName(names[String(app.pid)]) : "";
            if (!resolved || resolved === app.name)
                return app;
            changed = true;
            return {
                name: resolved,
                pid: app.pid,
                usage: app.usage,
                memoryMb: app.memoryMb
            };
        });
        if (changed)
            root.gpuApps = updated;
    }
}
