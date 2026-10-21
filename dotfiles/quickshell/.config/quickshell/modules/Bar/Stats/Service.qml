pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "../../Common"

// System stats for every bar: one poll of CPU, memory, temperature and GPU,
// however many bars exist. Each tick also adds one sample to the histories of
// the popup graphs, so they are full when the popup opens. The process lists
// and the GPU process poll run only while a stats popup is open.
Singleton {
    id: root

    // True while the stats popup of any screen is open.
    readonly property bool detailed: Popups.active.endsWith(":stats")

    property real cpuUsage: 0
    // True after the second CPU reading: the usage is a delta of two readings.
    property bool cpuUsageAvailable: false
    // Usage in percent per core, indexed by the core number. `coreCount`
    // changes only when the number of cores changes, so a Repeater with it as
    // the model keeps its delegates across polls.
    property var perCoreUsage: []
    property int coreCount: 0
    property string loadAvg: ""
    // Scheduling entities (threads included), from /proc/loadavg.
    property int runningTasks: 0
    property int totalTasks: 0
    // Top 5 executables by CPU share of all cores ({name, usage}) and by
    // summed RSS ({name, memoryMb}).
    property var topCpuApps: []
    property var topMemoryApps: []
    // PID (string) → executable name, from the last process poll.
    property var exeNames: ({})

    property real usedMemory: 0
    property real totalMemory: 0
    property real availableMemory: 0
    readonly property real memoryUsage: root.totalMemory > 0 ? root.usedMemory / root.totalMemory * 100 : 0
    property real swapTotal: 0
    property real swapUsed: 0

    property real temperature: 0
    // True after the first reading of the CPU sensor.
    property bool temperatureAvailable: false
    readonly property bool temperatureCritical: root.temperature >= Config.thresholds.temperature.critical
    readonly property bool temperatureWarning: root.temperature >= Config.thresholds.temperature.warning

    // "amd", "intel" or "nvidia" after the probe. "none" when there is no GPU source.
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
    property bool gpuTemperatureAvailable: false
    // GPU processes of the last poll with usage or memory ({pid, name, usage, memoryMb}).
    property var gpuApps: []
    // `gpuApps` grouped by executable: top 5 by usage, then by memory. The GPU
    // tools report truncated names, so the executable names of the last
    // process poll replace them.
    readonly property var topGpuApps: {
        const groups = {};
        for (const app of root.gpuApps) {
            const name = root.exeNames[String(app.pid)] || root.displayName(String(app.name));
            const group = groups[name] || (groups[name] = {
                    name: name,
                    usage: 0,
                    memoryMb: 0
                });
            group.usage += app.usage;
            group.memoryMb += app.memoryMb;
        }
        return Object.values(groups).sort((a, b) => (b.usage - a.usage) || (b.memoryMb - a.memoryMb)).slice(0, 5);
    }
    // nvidia-smi reports no usage per process.
    readonly property bool gpuAppUsageAvailable: root.gpuBackend !== "nvidia"

    // One sample per tick, oldest first, at most `Config.stats.historySamples`.
    // Usage in percent, temperatures in °C. A history starts when its value
    // first becomes available, so it can be shorter than the others.
    property var cpuHistory: []
    property var memoryHistory: []
    property var gpuHistory: []
    property var cpuTemperatureHistory: []
    property var gpuTemperatureHistory: []

    // Drivers of the CPU temperature sensor, matched against the hwmon name.
    readonly property var cpuTempDrivers: ["coretemp", "k10temp"]
    property string tempPath: ""
    // The edge sensor of the AMD card, or the i915 sensor.
    property string gpuTempPath: ""
    // sysfs device directory of the AMD card, and its PCI address, which
    // selects the same card in the amdgpu_top output.
    property string amdDevicePath: ""
    property string amdPciSlot: ""
    property bool amdgpuTopAvailable: false
    property int pageSize: 4096
    property var prevCpuTimes: ({})
    property bool hasPrevData: false
    // utime+stime per "pid:starttime" and the aggregate CPU time of the last
    // process poll. The start time keeps a reused PID apart.
    property var prevProcessTicks: ({})
    property real prevProcessTotal: 0

    readonly property string nvidiaGpuQuery: "nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name --format=csv,noheader,nounits"
    readonly property string nvidiaAppsQuery: "nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits"

    Timer {
        interval: Config.intervals.stats
        repeat: true
        running: true
        triggeredOnStart: true
        onTriggered: root.tick()
    }
    Timer {
        id: gpuTimer
        // The bar shows the GPU usage too, so NVIDIA and Intel keep a slow
        // poll while the popup is closed. AMD reads sysfs on the tick, and
        // runs amdgpu_top only for the process list of the popup.
        interval: root.detailed ? Config.intervals.gpu : Math.max(Config.intervals.gpu * 6, 30000)
        repeat: true
        running: root.gpuBackend === "amd" ? root.detailed && root.amdgpuTopAvailable : root.gpuBackend === "intel" || root.gpuBackend === "nvidia"
        onTriggered: root.updateGpu()
    }
    Timer {
        interval: Math.max(5000, Config.intervals.stats * 2)
        repeat: true
        running: root.detailed
        onTriggered: root.updateProcesses()
    }
    // The CPU shares need two process polls. This one gives the first values
    // soon after the popup opens.
    Timer {
        id: processesFollowUp
        interval: 1000
        onTriggered: root.updateProcesses()
    }

    onDetailedChanged: {
        if (root.detailed) {
            root.updateProcesses();
            processesFollowUp.restart();
            root.updateGpu();
        } else {
            processesFollowUp.stop();
            // The next open must not compute the shares over the closed time,
            // or show the old shares until the new ones are ready.
            root.prevProcessTicks = {};
            root.prevProcessTotal = 0;
            root.topCpuApps = [];
        }
        // Start the new interval now.
        if (gpuTimer.running)
            gpuTimer.restart();
    }

    // The views block while they load, so `text()` has the new content when
    // `reload()` returns. `onLoaded` would run later, from the event loop.
    FileView {
        id: statView
        path: "/proc/stat"
        blockLoading: true
        watchChanges: false
        printErrors: false
    }
    FileView {
        id: loadView
        path: "/proc/loadavg"
        blockLoading: true
        watchChanges: false
        printErrors: false
    }
    FileView {
        id: memView
        path: "/proc/meminfo"
        blockLoading: true
        watchChanges: false
        printErrors: false
    }
    FileView {
        id: tempView
        path: root.tempPath !== "" ? root.tempPath : "/dev/null"
        blockLoading: true
        watchChanges: false
        printErrors: false
    }
    // AMD and Intel: nvidia-smi reports the GPU temperature itself.
    FileView {
        id: gpuTempView
        path: root.gpuTempPath !== "" ? root.gpuTempPath : "/dev/null"
        blockLoading: true
        watchChanges: false
        printErrors: false
    }
    FileView {
        id: amdBusyView
        path: root.amdDevicePath !== "" ? root.amdDevicePath + "/gpu_busy_percent" : "/dev/null"
        blockLoading: true
        watchChanges: false
        printErrors: false
    }
    FileView {
        id: amdVramView
        path: root.amdDevicePath !== "" ? root.amdDevicePath + "/mem_info_vram_used" : "/dev/null"
        blockLoading: true
        watchChanges: false
        printErrors: false
    }

    // Runs once: finds the temperature sensors, the AMD card and the GPU
    // tools. Prints `key=value` lines.
    Process {
        id: probeProcess
        running: true
        command: ["sh", "-c", ["cpu=; igpu=",
            "for h in /sys/class/hwmon/hwmon*; do",
            "  [ -f \"$h/temp1_input\" ] || continue",
            "  case \"$(cat \"$h/name\" 2>/dev/null)\" in",
            "    " + root.cpuTempDrivers.join("|") + ") [ -n \"$cpu\" ] || cpu=\"$h/temp1_input\" ;;",
            "    i915) [ -n \"$igpu\" ] || igpu=\"$h/temp1_input\" ;;",
            "  esac",
            "done",
            // The AMD card with the most VRAM. Connectors (card1-DP-1) are skipped.
            "amd=; vram=0; amdtemp=",
            "for c in /sys/class/drm/card*; do",
            "  case \"${c##*/}\" in *-*) continue ;; esac",
            "  d=\"$c/device\"",
            "  [ \"$(cat \"$d/vendor\" 2>/dev/null)\" = 0x1002 ] && [ -r \"$d/gpu_busy_percent\" ] || continue",
            "  v=$(cat \"$d/mem_info_vram_total\" 2>/dev/null); v=${v:-0}",
            "  if [ -z \"$amd\" ] || [ \"$v\" -gt \"$vram\" ]; then amd=$d; vram=$v; fi",
            "done",
            "if [ -n \"$amd\" ]; then",
            "  for l in \"$amd\"/hwmon/hwmon*/temp*_label; do",
            "    [ \"$(cat \"$l\" 2>/dev/null)\" = edge ] && amdtemp=\"${l%_label}_input\" && break",
            "  done",
            "  echo \"amd=$amd\"; echo \"amdvram=$vram\"; echo \"amdtemp=$amdtemp\"",
            "  echo \"amdpci=$(basename \"$(readlink -f \"$amd\")\")\"",
            "  command -v amdgpu_top >/dev/null 2>&1 && echo amdgputop=1",
            "fi",
            "echo \"cputemp=$cpu\"; echo \"gputemp=$igpu\"",
            "echo \"pagesize=$(getconf PAGESIZE 2>/dev/null)\"",
            "for t in intel_gpu_top nvidia-smi; do",
            "  if command -v \"$t\" >/dev/null 2>&1; then echo \"gpu=$t\"; break; fi",
            "done"].join("\n")]
        stdout: StdioCollector {
            id: probeOut
            onStreamFinished: root.applyProbe(probeOut.text)
        }
    }

    // /proc/stat for the aggregate CPU time, the stat line of each process,
    // then the executable of each process. The target of an exe that is not
    // readable (kernel threads, processes of other users) is empty.
    Process {
        id: processesProcess
        command: ["sh", "-c", "cat /proc/stat /proc/[0-9]*/stat 2>/dev/null; echo --exe--; find /proc/[0-9]*/exe -maxdepth 0 -printf '%h\\t%l\\n' 2>/dev/null"]
        stdout: StdioCollector {
            id: processesOut
            onStreamFinished: root.parseProcesses(processesOut.text)
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

    function applyProbe(output: string): void {
        const values = {};
        for (const line of output.split("\n")) {
            const eq = line.indexOf("=");
            if (eq > 0)
                values[line.substring(0, eq)] = line.substring(eq + 1).trim();
        }
        root.tempPath = values.cputemp || "";
        root.pageSize = parseInt(values.pagesize) || 4096;
        if (values.amd) {
            root.amdDevicePath = values.amd;
            root.amdPciSlot = values.amdpci || "";
            root.amdgpuTopAvailable = values.amdgputop === "1";
            root.gpuTempPath = values.amdtemp || "";
            root.gpuMemoryTotal = (parseFloat(values.amdvram) || 0) / 1048576;
            root.gpuName = "AMD GPU";
            root.gpuBackend = "amd";
            root.readAmdGpu();
            root.updateGpu();
            return;
        }
        root.gpuTempPath = values.gputemp || "";
        const tools = {
            "intel_gpu_top": "intel",
            "nvidia-smi": "nvidia"
        };
        root.gpuBackend = tools[values.gpu] || "none";
        if (root.gpuBackend === "none") {
            root.gpuAvailable = false;
            root.gpuStatus = "No supported GPU monitor found (install nvidia-smi or intel_gpu_top)";
        } else {
            root.updateGpu();
        }
    }

    function tick(): void {
        statView.reload();
        root.parseCpuStats(statView.text());
        loadView.reload();
        root.parseLoadAvg(loadView.text());
        memView.reload();
        root.parseMeminfo(memView.text());
        if (root.tempPath !== "") {
            tempView.reload();
            const milli = parseInt(tempView.text());
            if (!isNaN(milli)) {
                root.temperature = milli / 1000;
                root.temperatureAvailable = true;
            }
        }
        if (root.gpuTempPath !== "") {
            gpuTempView.reload();
            const milli = parseInt(gpuTempView.text());
            if (!isNaN(milli)) {
                root.gpuTemperature = milli / 1000;
                root.gpuTemperatureAvailable = true;
            }
        }
        if (root.gpuBackend === "amd")
            root.readAmdGpu();
        root.appendHistory();
    }

    function appendSample(history: var, value: real): var {
        const next = history.slice(Math.max(0, history.length - Config.stats.historySamples + 1));
        next.push(value);
        return next;
    }

    function appendHistory(): void {
        if (root.cpuUsageAvailable)
            root.cpuHistory = root.appendSample(root.cpuHistory, root.cpuUsage);
        if (root.totalMemory > 0)
            root.memoryHistory = root.appendSample(root.memoryHistory, root.memoryUsage);
        if (root.temperatureAvailable)
            root.cpuTemperatureHistory = root.appendSample(root.cpuTemperatureHistory, root.temperature);
        // NVIDIA and Intel repeat the last polled value until the next GPU poll.
        if (root.gpuAvailable)
            root.gpuHistory = root.appendSample(root.gpuHistory, root.gpuUsage);
        if (root.gpuAvailable && root.gpuTemperatureAvailable)
            root.gpuTemperatureHistory = root.appendSample(root.gpuTemperatureHistory, root.gpuTemperature);
    }

    function readAmdGpu(): void {
        amdBusyView.reload();
        const busy = parseInt(amdBusyView.text());
        if (isNaN(busy)) {
            root.setGpuFailed("Cannot read " + amdBusyView.path);
            return;
        }
        amdVramView.reload();
        const vramBytes = parseFloat(amdVramView.text());
        root.gpuUsage = busy;
        if (!isNaN(vramBytes))
            root.gpuMemoryUsed = vramBytes / 1048576;
        root.gpuAvailable = true;
        root.gpuStatus = "";
    }

    // Runs the GPU tool directly. A poll that is still running is not
    // restarted: amdgpu_top needs about 1 s.
    function updateGpu(): void {
        if (gpuProcess.running)
            return;
        let command;
        if (root.gpuBackend === "amd") {
            if (!root.detailed || !root.amdgpuTopAvailable)
                return;
            command = ["amdgpu_top", "-J", "-n", "1"];
        } else if (root.gpuBackend === "intel") {
            command = ["intel_gpu_top", "-J", "-s", "200", "-n", "1", "-o", "-"];
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

    function updateProcesses(): void {
        if (!processesProcess.running)
            processesProcess.running = true;
    }

    function parseLoadAvg(output: string): void {
        const parts = output.trim().split(/\s+/);
        if (parts.length >= 3)
            root.loadAvg = parts.slice(0, 3).join(" ");
        if (parts.length >= 5) {
            const tasks = parts[3].split("/");
            root.runningTasks = parseInt(tasks[0]) || 0;
            root.totalTasks = parseInt(tasks[1]) || 0;
        }
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

    // Total and idle time of a /proc/stat "cpu" line, split on whitespace.
    function cpuLineTimes(parts: var): var {
        let total = 0;
        for (let i = 1; i < parts.length; i++)
            total += parseInt(parts[i]);
        return {
            total: total,
            idle: parseInt(parts[4])
        };
    }

    function parseCpuStats(output: string): void {
        if (!output)
            return;
        const prev = root.prevCpuTimes;
        const cores = [];
        let all = null;

        for (const line of output.split("\n")) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 5)
                continue;
            const name = parts[0];
            if (name === "cpu") {
                all = root.cpuLineTimes(parts);
            } else if (/^cpu\d+$/.test(name)) {
                const times = root.cpuLineTimes(parts);
                const last = prev[name];
                let usage = 0;
                if (last && root.hasPrevData && times.total > last.total)
                    usage = ((times.total - last.total) - (times.idle - last.idle)) / (times.total - last.total) * 100;
                prev[name] = times;
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
        const lastAll = prev["_total"];
        if (all && root.hasPrevData && lastAll && all.total > lastAll.total) {
            const dTotal = all.total - lastAll.total;
            root.cpuUsage = (dTotal - (all.idle - lastAll.idle)) / dTotal * 100;
            root.cpuUsageAvailable = true;
        }
        if (all)
            prev["_total"] = all;
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

    // Groups the processes by executable. The CPU share is the delta of
    // utime+stime over the delta of the aggregate CPU time, so the shares of
    // all processes add up to the total CPU usage.
    function parseProcesses(output: string): void {
        // A poll that finishes after the popup closed would set a stale base.
        if (!root.detailed)
            return;
        const separator = output.indexOf("\n--exe--\n");
        const statText = separator >= 0 ? output.substring(0, separator) : output;
        const exeText = separator >= 0 ? output.substring(separator + 9) : "";

        const names = {};
        for (const line of exeText.split("\n")) {
            const tab = line.indexOf("\t");
            if (tab <= 6)
                continue;
            const target = line.substring(tab + 1).replace(/ \(deleted\)$/, "");
            if (target !== "")
                names[line.substring(6, tab)] = root.displayName(target.substring(target.lastIndexOf("/") + 1));
        }

        let total = 0;
        const ticks = {};
        const cpuTotals = {};
        const memoryTotals = {};
        for (const line of statText.split("\n")) {
            if (line.startsWith("cpu ")) {
                total = root.cpuLineTimes(line.trim().split(/\s+/)).total;
                continue;
            }
            // "pid (comm) state …": the name can contain spaces and parentheses.
            const open = line.indexOf(" (");
            const close = line.lastIndexOf(")");
            if (open <= 0 || close < open)
                continue;
            const pid = line.substring(0, open);
            if (!/^\d+$/.test(pid))
                continue;
            // fields[0] is field 3 of proc_pid_stat(5): utime 14, stime 15,
            // starttime 22, rss 24 (pages).
            const fields = line.substring(close + 2).split(" ");
            if (fields.length < 22)
                continue;
            const used = parseInt(fields[11]) + parseInt(fields[12]);
            const key = pid + ":" + fields[19];
            ticks[key] = used;
            const name = names[pid] || root.displayName(line.substring(open + 2, close));
            memoryTotals[name] = (memoryTotals[name] || 0) + parseInt(fields[21]) * root.pageSize / 1048576;
            const last = root.prevProcessTicks[key];
            if (last !== undefined && used >= last)
                cpuTotals[name] = (cpuTotals[name] || 0) + used - last;
        }

        const dTotal = root.prevProcessTotal > 0 ? total - root.prevProcessTotal : 0;
        const cpuApps = [];
        if (dTotal > 0) {
            for (const appName in cpuTotals)
                cpuApps.push({
                    name: appName,
                    usage: cpuTotals[appName] / dTotal * 100
                });
        }
        const memoryApps = [];
        for (const appName in memoryTotals)
            memoryApps.push({
                name: appName,
                memoryMb: memoryTotals[appName]
            });
        cpuApps.sort((a, b) => b.usage - a.usage);
        memoryApps.sort((a, b) => b.memoryMb - a.memoryMb);
        root.topCpuApps = cpuApps.slice(0, 5);
        root.topMemoryApps = memoryApps.slice(0, 5);
        root.exeNames = names;
        root.prevProcessTicks = ticks;
        root.prevProcessTotal = total;
    }

    // base08 from the critical threshold, base0A from the warning threshold,
    // else `normal`. `thresholds` is a group of Config.thresholds.
    function levelColor(value: real, thresholds: var, normal: string): string {
        if (value >= thresholds.critical)
            return Config.colors.base08;
        if (value >= thresholds.warning)
            return Config.colors.base0A;
        return normal;
    }

    function parseGpuStats(output: string): void {
        if (!output) {
            // AMD keeps its sysfs values. Only the process list is gone.
            if (root.gpuBackend === "amd")
                root.gpuApps = [];
            else
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

    function activeGpuApps(apps: var): var {
        return apps.filter(app => app.usage > 0 || app.memoryMb > 0);
    }

    function setGpuFailed(status: string): void {
        root.gpuAvailable = false;
        root.gpuStatus = status;
        root.gpuApps = [];
    }

    // Only the device name and the process list: sysfs gives the usage, VRAM
    // and temperature on each tick. amdgpu_top sometimes reports a null sensor.
    function parseAmdGpuStats(jsonText: string): void {
        try {
            const data = JSON.parse(jsonText);
            const devices = data.devices || [];
            const device = devices.find(d => d.Info && d.Info.PCI === root.amdPciSlot) || devices[0];
            if (!device)
                throw new Error("amdgpu_top found no AMD devices");
            const info = device.Info || {};
            const fdinfo = device.fdinfo || {};

            root.gpuName = info.DeviceName || info["ASIC Name"] || "AMD GPU";

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
            root.gpuApps = root.activeGpuApps(apps);
        } catch (err) {
            // The sysfs values stay. The popup shows "No process data".
            root.gpuApps = [];
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
        const temperature = parseFloat(parts[3]);
        if (!isNaN(temperature)) {
            root.gpuTemperature = temperature;
            root.gpuTemperatureAvailable = true;
        }
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
            root.gpuApps = root.activeGpuApps(apps);
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
            root.gpuApps = root.activeGpuApps(clients);
            root.gpuAvailable = true;
            root.gpuStatus = "";
        } catch (err) {
            root.setGpuFailed("Failed to parse intel_gpu_top output: " + err);
        }
    }
}
