return {
    condition = function()
        return vim.fn.reg_recording() ~= ""
    end,
    provider = function()
        return " 󰻃 " .. vim.fn.reg_recording() .. " "
    end,
    hl = { bg = "red", bold = true },
}
