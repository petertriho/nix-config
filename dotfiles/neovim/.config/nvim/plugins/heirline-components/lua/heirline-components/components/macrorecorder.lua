return {
    condition = function()
        vim.g.reg_recording = vim.fn.reg_recording()
        return vim.g.reg_recording ~= ""
    end,
    provider = function()
        return " 󰻃 " .. vim.g.reg_recording .. " "
    end,
    hl = { bg = "red", bold = true },
    update = {
        "RecordingEnter",
        "RecordingLeave",
    },
}
