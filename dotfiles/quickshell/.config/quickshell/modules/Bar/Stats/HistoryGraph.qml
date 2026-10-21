import QtQuick
import "../../Common"

// Area graph of a stats history on a 0–100 axis, on a dark panel with a
// dashed guide at 50. The newest sample is at the right edge, and a history
// that is shorter than `capacity` fills from the right. The optional second
// series (temperatures in °C on the same axis) is a thin line: base0A, and
// base08 from `secondaryCritical` up.
Canvas {
    id: root

    property var values: []
    property color lineColor: Config.colors.base0D
    property var secondaryValues: []
    property real secondaryCritical: 100
    property int capacity: Config.stats.historySamples

    readonly property real lineWidth: 1.5

    implicitHeight: 40

    onValuesChanged: root.requestPaint()
    onSecondaryValuesChanged: root.requestPaint()
    onLineColorChanged: root.requestPaint()
    onSecondaryCriticalChanged: root.requestPaint()
    onWidthChanged: root.requestPaint()
    onHeightChanged: root.requestPaint()

    // Keeps the line inside the item at 0 and at 100.
    function yOf(value: real): real {
        const inner = root.height - root.lineWidth;
        return root.lineWidth / 2 + inner * (1 - Math.max(0, Math.min(100, value)) / 100);
    }

    function xOf(index: int, count: int): real {
        return root.width - (count - 1 - index) * root.width / Math.max(1, root.capacity - 1);
    }

    function tracePath(ctx: var, series: var): void {
        ctx.beginPath();
        for (let i = 0; i < series.length; i++) {
            const x = root.xOf(i, series.length);
            const y = root.yOf(series[i]);
            if (i === 0)
                ctx.moveTo(x, y);
            else
                ctx.lineTo(x, y);
        }
    }

    onPaint: {
        const ctx = root.getContext("2d");
        const w = root.width;
        const h = root.height;
        ctx.reset();

        // The panel. Everything after it stays inside its rounded corners.
        ctx.beginPath();
        ctx.roundedRect(0, 0, w, h, Config.style.radiusSmall, Config.style.radiusSmall);
        ctx.fillStyle = Config.style.cardColor;
        ctx.fill();
        ctx.clip();

        ctx.strokeStyle = Config.colors.base02;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(0, Math.round(root.yOf(50)) + 0.5);
        ctx.lineTo(w, Math.round(root.yOf(50)) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        const series = root.values || [];
        if (series.length >= 2) {
            root.tracePath(ctx, series);
            ctx.lineTo(root.xOf(series.length - 1, series.length), h);
            ctx.lineTo(root.xOf(0, series.length), h);
            ctx.closePath();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = root.lineColor;
            ctx.fill();
            ctx.globalAlpha = 1;

            root.tracePath(ctx, series);
            ctx.strokeStyle = root.lineColor;
            ctx.lineWidth = root.lineWidth;
            ctx.stroke();
        }

        const secondary = root.secondaryValues || [];
        if (secondary.length >= 2) {
            const yCritical = root.yOf(root.secondaryCritical);
            ctx.lineWidth = 1;
            // One clip region for each color.
            for (const part of [
                    {
                        top: 0,
                        bottom: yCritical,
                        color: Config.colors.base08
                    },
                    {
                        top: yCritical,
                        bottom: h,
                        color: Config.colors.base0A
                    }
                ]) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, part.top, w, part.bottom - part.top);
                ctx.clip();
                root.tracePath(ctx, secondary);
                ctx.strokeStyle = part.color;
                ctx.stroke();
                ctx.restore();
            }
        }
    }
}
