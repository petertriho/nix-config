local escape = require("heirline-components.utils.statusline").escape

local function DiffCount(key, sign, color)
    return {
        provider = function(self)
            local count = self.diff_summary[key] or 0
            return count > 0 and (" " .. sign .. count)
        end,
        hl = { fg = color },
    }
end

-- Not cached: heirline caches per window, and mini.git and mini.diff send no event when an already
-- tracked buffer enters a window, so a cache would show the previous buffer's counts after `:buffer`.
return {
    condition = function()
        return vim.b.minigit_summary ~= nil
    end,
    init = function(self)
        self.git_summary = vim.b.minigit_summary or {}
        self.diff_summary = vim.b.minidiff_summary or {}
    end,
    {
        provider = function(self)
            local branch = self.git_summary.head_name
            return branch and ("  " .. escape(branch))
        end,
        hl = { bold = true },
    },
    DiffCount("add", "+", "git_add"),
    DiffCount("delete", "-", "git_del"),
    DiffCount("change", "~", "git_change"),
}
