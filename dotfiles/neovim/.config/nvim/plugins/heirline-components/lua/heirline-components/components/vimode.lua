local colors = require("heirline-components.colors")

return {
    flexible = true,
    init = function(self)
        self.mode = vim.fn.mode(1)
    end,
    static = {
        mode_names = {
            n = "NORMAL",
            no = "OP PENDING",
            nov = "NO VISUAL",
            noV = "NO VISUAL LINE",
            ["no\22"] = "NO VISUAL BLOCK",
            niI = "NORMAL INSERT",
            niR = "NORMAL REPLACE",
            niV = "NORMAL VISUAL",
            nt = "NORMAL TERMINAL",
            v = "VISUAL",
            vs = "VISUAL SELECT",
            V = "VISUAL LINE",
            Vs = "VISUAL LINE SELECT",
            ["\22"] = "VISUAL BLOCK",
            ["\22s"] = "VISUAL BLOCK SELECT",
            s = "SELECT",
            S = "SELECT LINE",
            ["\0019"] = "SELECT BLOCK",
            i = "INSERT",
            ic = "INSERT COMPLETION",
            ix = "INSERT COMPLETION",
            R = "REPLACE",
            Rc = "REPLACE COMPLETION",
            Rx = "REPLACE COMPLETION",
            Rv = "REPLACE VISUAL",
            Rvc = "REPLACE VISUAL COMPLETION",
            Rvx = "REPLACE VISUAL COMPLETION",
            c = "COMMAND",
            cv = "EX COMMAND",
            r = "PROMPT",
            rm = "MORE",
            ["r?"] = "CONFIRM",
            ["!"] = "SHELL",
            t = "TERMINAL",
        },
        short_mode_names = {
            n = "N",
            no = "N?",
            nov = "N?",
            noV = "N?",
            ["no\22"] = "N?",
            niI = "Ni",
            niR = "Nr",
            niV = "Nv",
            nt = "Nt",
            v = "V",
            vs = "Vs",
            V = "V_",
            Vs = "Vs",
            ["\22"] = "^V",
            ["\22s"] = "^V",
            s = "S",
            S = "S_",
            ["\0019"] = "^S",
            i = "I",
            ic = "Ic",
            ix = "Ix",
            R = "R",
            Rc = "Rc",
            Rx = "Rx",
            Rv = "Rv",
            Rvc = "Rv",
            Rvx = "Rv",
            c = "C",
            cv = "Ex",
            r = "...",
            rm = "M",
            ["r?"] = "?",
            ["!"] = "!",
            t = "T",
        },
        mode_colors = {
            n = colors.blue,
            i = colors.green,
            v = colors.purple,
            V = colors.purple,
            ["\22"] = colors.purple,
            c = colors.yellow,
            s = colors.purple,
            S = colors.purple,
            ["\0019"] = colors.purple,
            R = colors.red,
            r = colors.red,
            ["!"] = colors.blue,
            t = colors.blue,
        },
    },
    hl = function(self)
        local mode = self.mode:sub(1, 1)
        vim.g.heirline_mode_color = self.mode_colors[mode]
        return { fg = "bg", bg = vim.g.heirline_mode_color, bold = true }
    end,
    update = {
        "ModeChanged",
        pattern = "*:*",
        callback = vim.schedule_wrap(function()
            vim.cmd.redrawstatus()
        end),
    },
    {
        provider = function(self)
            return " " .. self.mode_names[self.mode] .. " "
        end,
    },
    {
        provider = function(self)
            return " " .. self.short_mode_names[self.mode] .. " "
        end,
    },
}
