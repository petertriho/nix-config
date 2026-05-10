import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

BaseModule {
    id: root
    hoverEnabled: true

    property real cpuUsage: 0
    property var perCoreUsage: []
    property var topCpuApps: []
    property string loadAvg: ""
    property string processCount: ""
    property var prevCpuTimes: ({})
    property bool hasPrevData: false

    property real usedMemory: 0
    property real totalMemory: 0
    property real availableMemory: 0
    property real swapTotal: 0
    property real swapUsed: 0
    property var topMemoryApps: []

    property real temperature: 0
    property bool isCritical: false
    property string tempPath: ""
    property var cpuTempDrivers: ["coretemp", "k10temp"]

    property bool gpuAvailable: false
    property string gpuStatus: "Detecting GPU backend"
    property string gpuBackend: ""
    property string gpuName: ""
    property var gpuBackends: []
    property real gpuUsage: 0
    property real gpuMemoryUsed: 0
    property real gpuMemoryTotal: 0
    property real gpuTemperature: 0
    property var gpuApps: []

    property bool showPopup: false
    property real globalX: 0
    property QtObject intervalsConfig: parent.intervalsConfig
    property QtObject thresholdsConfig: parent.thresholdsConfig

    Timer { interval: intervalsConfig.cpu; repeat: true; running: true; onTriggered: updateCpu() }
    Timer { interval: intervalsConfig.memory; repeat: true; running: true; onTriggered: updateMemoryUsage() }
    Timer { interval: intervalsConfig.temperature; repeat: true; running: true; onTriggered: updateTemperature() }
    Timer { interval: intervalsConfig.gpu; repeat: true; running: true; onTriggered: updateGpu() }

    Component.onCompleted: {
        updateCpu()
        updateMemoryUsage()
        findTempPath()
        updateGpu()
        updatePosition()
    }

    Process { id: cpuProcess; stdout: StdioCollector { onStreamFinished: parseCpuStats(text.trim()) } }
    Process {
        id: loadProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var parts = text.trim().split(/\s+/)
                if (parts.length >= 3) loadAvg = parts.slice(0, 3).join(" ")
                if (parts.length >= 5) processCount = parts[3]
            }
        }
    }
    Process { id: topCpuProcess; stdout: StdioCollector { onStreamFinished: parseTopCpuApps(text.trim()) } }

    Process {
        id: memoryProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = text.trim()
                if (!output) return
                var lines = output.split('\n')
                for (var i = 0; i < lines.length; i++) {
                    var parts = lines[i].split(/\s+/)
                    if (lines[i].startsWith('Mem:') && parts.length >= 7) {
                        totalMemory = parseFloat(parts[1]) / 1024
                        usedMemory = parseFloat(parts[2]) / 1024
                        availableMemory = parseFloat(parts[6]) / 1024
                    } else if (lines[i].startsWith('Swap:') && parts.length >= 3) {
                        swapTotal = parseFloat(parts[1]) / 1024
                        swapUsed = parseFloat(parts[2]) / 1024
                    }
                }
            }
        }
    }
    Process { id: topMemoryProcess; stdout: StdioCollector { onStreamFinished: parseTopMemoryApps(text.trim()) } }

    Process {
        id: findTempPathProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = text.trim()
                if (output) {
                    tempPath = output
                    updateTemperature()
                }
            }
        }
    }
    Process {
        id: tempProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = text.trim()
                if (output) {
                    var temp = parseInt(output)
                    temperature = temp / 1000
                    isCritical = temperature >= thresholdsConfig.temperature.critical
                }
            }
        }
    }

    Process {
        id: gpuProcess
        stdout: StdioCollector { onStreamFinished: parseGpuStats(text.trim()) }
        stderr: StdioCollector { onStreamFinished: if (text.trim() && !gpuAvailable) gpuStatus = text.trim() }
    }

    Timer { id: showTimer; interval: 150; onTriggered: { root.updatePosition(); root.showPopup = true } }
    Timer { id: dismissTimer; interval: 150; onTriggered: root.showPopup = false }

    onHoveredChanged: {
        if (root.hovered) {
            dismissTimer.stop()
            showTimer.restart()
        } else {
            showTimer.stop()
            dismissTimer.restart()
        }
    }

    function parseCpuStats(output) {
        if (!output) return
        var lines = output.split('\n')
        var newCores = []
        var totalIdle = 0, totalAll = 0

        for (var i = 0; i < lines.length; i++) {
            var parts = lines[i].trim().split(/\s+/)
            if (parts.length < 5) continue
            var name = parts[0]

            if (name === 'cpu') {
                totalIdle = parseInt(parts[4])
                for (var j = 1; j < parts.length; j++) totalAll += parseInt(parts[j])
            } else if (/^cpu\d+$/.test(name)) {
                var idle = parseInt(parts[4]), total = 0
                for (var k = 1; k < parts.length; k++) total += parseInt(parts[k])

                var usage = 0
                var prev = prevCpuTimes[name]
                if (prev && hasPrevData && total > prev.total) {
                    var dt = total - prev.total
                    var di = idle - prev.idle
                    usage = dt > 0 ? ((dt - di) / dt) * 100 : 0
                }
                prevCpuTimes[name] = { total: total, idle: idle }
                newCores.push({ core: name.substring(3), usage: usage })
            }
        }

        perCoreUsage = newCores
        if (hasPrevData) {
            var prevTotal = prevCpuTimes['_total']
            if (prevTotal && totalAll > prevTotal.total) {
                var dTotal = totalAll - prevTotal.total
                var dIdle = totalIdle - prevTotal.idle
                cpuUsage = dTotal > 0 ? ((dTotal - dIdle) / dTotal) * 100 : 0
            }
        }
        prevCpuTimes['_total'] = { total: totalAll, idle: totalIdle }
        hasPrevData = true
    }

    function parseTopCpuApps(output) {
        if (!output) { topCpuApps = []; return }
        var apps = []
        var lines = output.split('\n')
        for (var i = 0; i < lines.length && apps.length < 5; i++) {
            var line = lines[i].trim()
            if (!line) continue
            var parts = line.split(/\s+/)
            if (parts.length < 2) continue
            var usage = parseFloat(parts[parts.length - 1])
            if (isNaN(usage)) continue
            apps.push({ name: parts.slice(0, parts.length - 1).join(" "), usage: usage })
        }
        topCpuApps = apps
    }

    function parseTopMemoryApps(output) {
        if (!output) { topMemoryApps = []; return }
        var apps = []
        var lines = output.split('\n')
        for (var i = 0; i < lines.length && apps.length < 5; i++) {
            var line = lines[i].trim()
            if (!line) continue
            var parts = line.split(/\s+/)
            if (parts.length < 2) continue
            var rssMb = parseFloat(parts[parts.length - 1]) / 1024
            if (isNaN(rssMb)) continue
            apps.push({ name: parts.slice(0, parts.length - 1).join(" "), memoryMb: rssMb })
        }
        topMemoryApps = apps
    }

    function parseGpuStats(output) {
        if (!output) {
            gpuAvailable = false
            gpuStatus = "No supported GPU monitor found"
            gpuApps = []
            return
        }

        if (output.indexOf("AMD_JSON\n") === 0) {
            parseAmdGpuStats(output.substring(9))
        } else if (output.indexOf("NVIDIA\n") === 0) {
            parseNvidiaGpuStats(output.substring(7))
        } else if (output.indexOf("INTEL\n") === 0) {
            parseIntelGpuStats(output.substring(6))
        } else {
            gpuAvailable = false
            gpuStatus = output
            gpuBackends = []
            gpuApps = []
        }
    }

    function valueOf(metric) {
        return metric && metric.value !== undefined && metric.value !== null ? Number(metric.value) : 0
    }

    function parseAmdGpuStats(jsonText) {
        try {
            var data = JSON.parse(jsonText)
            if (!data.devices || data.devices.length === 0) throw new Error("amdgpu_top found no AMD devices")
            var device = data.devices[0]
            var info = device.Info || ({})
            var sensors = device.Sensors || ({})
            var activity = device.gpu_activity || ({})
            var vram = device.VRAM || ({})
            var fdinfo = device.fdinfo || ({})

            gpuBackend = "AMD"
            gpuName = info.DeviceName || info["ASIC Name"] || "AMD GPU"
            gpuBackends = [gpuBackend]
            gpuUsage = Math.max(valueOf(activity.GFX), valueOf(activity.MediaEngine), valueOf(activity.Memory))
            gpuMemoryUsed = valueOf(vram["Total VRAM Usage"])
            gpuMemoryTotal = valueOf(vram["Total VRAM"])
            gpuTemperature = valueOf(sensors["Edge Temperature"] || sensors["Junction Temperature"] || sensors["Memory Temperature"])

            var apps = []
            for (var pid in fdinfo) {
                var entry = fdinfo[pid]
                var usage = entry && entry.usage ? entry.usage.usage : null
                if (!usage) continue
                var gfx = valueOf(usage.GFX)
                var media = valueOf(usage.Media) + valueOf(usage.VCN_Unified)
                var mem = valueOf(usage.VRAM)
                if (gfx <= 0 && media <= 0 && mem <= 0) continue
                apps.push({ name: entry.name || pid, pid: pid, usage: Math.max(gfx, media), memoryMb: mem })
            }
            apps.sort(function(a, b) { return (b.usage - a.usage) || (b.memoryMb - a.memoryMb) })
            gpuApps = apps.slice(0, 5)
            gpuAvailable = true
            gpuStatus = ""
        } catch (err) {
            gpuAvailable = false
            gpuStatus = "Failed to parse amdgpu_top output: " + err
            gpuBackends = []
            gpuApps = []
        }
    }

    function parseNvidiaGpuStats(output) {
        var sections = output.split('\n--apps--\n')
        var gpuLine = sections[0].trim().split('\n')[0]
        var parts = gpuLine ? gpuLine.split(/,\s*/) : []
        if (parts.length < 5) {
            gpuAvailable = false
            gpuStatus = "nvidia-smi returned incomplete GPU data"
            gpuBackends = []
            gpuApps = []
            return
        }

        gpuBackend = "NVIDIA"
        gpuBackends = [gpuBackend]
        gpuUsage = parseFloat(parts[0]) || 0
        gpuMemoryUsed = parseFloat(parts[1]) || 0
        gpuMemoryTotal = parseFloat(parts[2]) || 0
        gpuTemperature = parseFloat(parts[3]) || 0
        gpuName = parts.slice(4).join(", ") || "NVIDIA GPU"

        var apps = []
        if (sections.length > 1) {
            var lines = sections[1].trim().split('\n')
            for (var i = 0; i < lines.length && apps.length < 5; i++) {
                var line = lines[i].trim()
                if (!line) continue
                var cols = line.split(/,\s*/)
                if (cols.length < 3) continue
                apps.push({ pid: cols[0], name: cols[1], usage: 0, memoryMb: parseFloat(cols[2]) || 0 })
            }
        }
        gpuApps = apps
        gpuAvailable = true
        gpuStatus = ""
    }

    function firstNumberFromText(text) {
        var match = String(text).match(/-?\d+(\.\d+)?/)
        return match ? parseFloat(match[0]) : 0
    }

    function collectBusyValues(value, values) {
        if (value === null || value === undefined) return
        if (typeof value === "object") {
            for (var key in value) {
                var child = value[key]
                if ((key === "busy" || key === "Busy") && typeof child === "number") values.push(child)
                collectBusyValues(child, values)
            }
        }
    }

    function collectIntelClients(value, clients) {
        if (value === null || value === undefined || typeof value !== "object") return
        if (value.name !== undefined && value.pid !== undefined) {
            var busyValues = []
            collectBusyValues(value, busyValues)
            var usage = 0
            for (var i = 0; i < busyValues.length; i++) usage = Math.max(usage, busyValues[i])
            clients.push({ name: value.name, pid: String(value.pid), usage: usage, memoryMb: 0 })
            return
        }
        for (var key in value) collectIntelClients(value[key], clients)
    }

    function parseIntelGpuStats(output) {
        var sections = output.split('\n--temp--\n')
        try {
            var data = JSON.parse(sections[0].trim())
            var busyValues = []
            collectBusyValues(data.engines || data, busyValues)
            var usage = 0
            for (var i = 0; i < busyValues.length; i++) usage = Math.max(usage, busyValues[i])

            var clients = []
            collectIntelClients(data.clients || ({}), clients)
            clients.sort(function(a, b) { return b.usage - a.usage })

            gpuBackend = "Intel"
            gpuName = data.device || data.name || "Intel GPU"
            gpuBackends = [gpuBackend]
            gpuUsage = usage
            gpuMemoryUsed = 0
            gpuMemoryTotal = 0
            gpuTemperature = sections.length > 1 ? firstNumberFromText(sections[1]) : 0
            gpuApps = clients.filter(function(app) { return app.usage > 0 }).slice(0, 5)
            gpuAvailable = true
            gpuStatus = ""
        } catch (err) {
            gpuAvailable = false
            gpuStatus = "Failed to parse intel_gpu_top output: " + err
            gpuBackends = []
            gpuApps = []
        }
    }

    function parseNvidiaGpuSnapshot(output) {
        var sections = output.split('\n--apps--\n')
        var gpuLine = sections[0].trim().split('\n')[0]
        var parts = gpuLine ? gpuLine.split(/,\s*/) : []
        if (parts.length < 5) return { available: false, status: "nvidia-smi returned incomplete GPU data" }

        var apps = []
        if (sections.length > 1) {
            var lines = sections[1].trim().split('\n')
            for (var i = 0; i < lines.length && apps.length < 5; i++) {
                var line = lines[i].trim()
                if (!line) continue
                var cols = line.split(/,\s*/)
                if (cols.length < 3) continue
                apps.push({ pid: cols[0], name: cols[1], usage: 0, memoryMb: parseFloat(cols[2]) || 0 })
            }
        }

        return {
            available: true,
            backend: "NVIDIA",
            name: parts.slice(4).join(", ") || "NVIDIA GPU",
            usage: parseFloat(parts[0]) || 0,
            memoryUsed: parseFloat(parts[1]) || 0,
            memoryTotal: parseFloat(parts[2]) || 0,
            temperature: parseFloat(parts[3]) || 0,
            apps: apps
        }
    }

    function parseIntelGpuSnapshot(output) {
        var sections = output.split('\n--temp--\n')
        try {
            var data = JSON.parse(sections[0].trim())
            var busyValues = []
            collectBusyValues(data.engines || data, busyValues)
            var usage = 0
            for (var i = 0; i < busyValues.length; i++) usage = Math.max(usage, busyValues[i])

            var clients = []
            collectIntelClients(data.clients || ({}), clients)
            clients.sort(function(a, b) { return b.usage - a.usage })

            return {
                available: true,
                backend: "Intel",
                name: data.device || data.name || "Intel GPU",
                usage: usage,
                memoryUsed: 0,
                memoryTotal: 0,
                temperature: sections.length > 1 ? firstNumberFromText(sections[1]) : 0,
                apps: clients.filter(function(app) { return app.usage > 0 }).slice(0, 5)
            }
        } catch (err) {
            return { available: false, status: "Failed to parse intel_gpu_top output: " + err }
        }
    }

    function coreColumn(index) {
        var half = Math.ceil(perCoreUsage.length / 2)
        return perCoreUsage.slice(index * half, (index + 1) * half)
    }

    function formatMemoryMb(mb) {
        return mb >= 1024 ? (mb / 1024).toFixed(1) + "G" : Math.round(mb) + "M"
    }

    function holdPopup() { dismissTimer.stop(); showPopup = true }
    function releasePopup() { if (!root.hovered) dismissTimer.restart(); else dismissTimer.stop() }
    function updatePosition() { var pos = root.mapToItem(null, 0, 0); root.globalX = pos.x }

    onXChanged: updatePosition()
    onWidthChanged: updatePosition()

    function findTempPath() {
        var pattern = cpuTempDrivers.join("|")
        var cmd = "for hwmon in /sys/class/hwmon/hwmon*; do "
        cmd += "name=$(cat \"$hwmon/name\" 2>/dev/null); "
        cmd += "if echo \"$name\" | grep -qE '^(" + pattern + ")$' && "
        cmd += "[ -f \"$hwmon/temp1_input\" ]; then "
        cmd += "echo \"$hwmon/temp1_input\"; break; fi; done"
        findTempPathProcess.exec({ command: ["bash", "-c", cmd] })
    }

    function updateCpu() {
        cpuProcess.exec({ command: ["sh", "-c", "grep '^cpu' /proc/stat"] })
        loadProcess.exec({ command: ["cat", "/proc/loadavg"] })
        topCpuProcess.exec({ command: ["sh", "-c", "ps -eo comm=,pcpu= | awk '{ cpu=$NF; name=substr($0,1,length($0)-length($NF)); sub(/[[:space:]]+$/, \"\", name); if (name != \"ps\") usage[name] += cpu } END { for (name in usage) printf \"%s\\t%.1f\\n\", name, usage[name] }' | sort -t '\t' -k2,2nr | head -n 5"] })
    }

    function updateMemoryUsage() {
        memoryProcess.exec({ command: ["free", "-m"] })
        topMemoryProcess.exec({ command: ["sh", "-c", "ps -eo comm=,rss= | awk '{ rss=$NF; name=substr($0,1,length($0)-length($NF)); sub(/[[:space:]]+$/, \"\", name); usage[name] += rss } END { for (name in usage) printf \"%s\\t%.0f\\n\", name, usage[name] }' | sort -t '\t' -k2,2nr | head -n 5"] })
    }

    function updateTemperature() {
        if (tempPath) tempProcess.exec({ command: ["cat", tempPath] })
        else findTempPath()
    }

    function updateGpu() {
        var intelCmd = "intel_gpu_top -J -s 1000 -n 1 -o - 2>/dev/null; "
        intelCmd += "printf '\\n--temp--\\n'; for hwmon in /sys/class/hwmon/hwmon*; do name=$(cat \"$hwmon/name\" 2>/dev/null); if [ \"$name\" = i915 ] && [ -f \"$hwmon/temp1_input\" ]; then awk '{ printf \"%.0f\", $1 / 1000 }' \"$hwmon/temp1_input\"; break; fi; done"
        var nvidiaCmd = "nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name --format=csv,noheader,nounits 2>/dev/null; "
        nvidiaCmd += "printf '\\n--apps--\\n'; nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits 2>/dev/null || true"
        var cmd = "if command -v amdgpu_top >/dev/null 2>&1; then printf 'AMD_JSON\\n'; amdgpu_top -J -n 1; "
        cmd += "elif command -v intel_gpu_top >/dev/null 2>&1; then printf 'INTEL\\n'; " + intelCmd + "; "
        cmd += "elif command -v nvidia-smi >/dev/null 2>&1; then printf 'NVIDIA\\n'; "
        cmd += nvidiaCmd + "; "
        cmd += "else printf 'No supported GPU monitor found (install amdgpu_top, nvidia-smi, or intel_gpu_top)'; fi"
        gpuProcess.exec({ command: ["sh", "-c", cmd] })
    }

    text: {
        var parts = ["󰍛 " + Math.round(cpuUsage) + "%", "󰾆 " + usedMemory.toFixed(1) + "G"]
        if (gpuAvailable) parts.push("󰢮 " + Math.round(gpuUsage) + "%")
        parts.push((isCritical ? "󰸁 " : (temperature > 60 ? "󱃃 " : "󰜗 ")) + Math.round(temperature) + "°C")
        return parts.join(" ")
    }

    textColor: isCritical ? colors.red : colors.fg

    onRightClicked: {
        Quickshell.execDetached({ command: ["ghostty", "-e", "btop"] })
    }
}
