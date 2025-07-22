return {
    "cousine/opencode-context.nvim",
    opts = {
        tmux_target = nil,
        auto_detect_pane = true,
    },
    config = function(_, opts)
        if vim.env.TMUX then
            local session_name = vim.fn.system("tmux display-message -p '#{session_name}'"):gsub("%s+", "")
            local window_index = tonumber(vim.fn.system("tmux display-message -p '#{window_index}'"):match("%d+"))
            local pane_index = 1

            local next_window = window_index + 1
            local tmux_target = session_name .. ":" .. next_window .. "." .. pane_index

            opts.tmux_target = tmux_target
        end

        require("opencode-context").setup(opts)
    end,
    keys = {
        { "<leader>oc", "<CMD>OpencodeSend<CR>", desc = "Send prompt to opencode" },
        { "<leader>oc", "<CMD>OpencodeSend<CR>", mode = "v", desc = "Send prompt to opencode" },
        { "<leader>ot", "<CMD>OpencodeSwitchMode<CR>", desc = "Toggle opencode mode" },
        { "<leader>op", "<CMD>OpencodePrompt<CR>", desc = "Open opencode persistent prompt" },
    },
    cmd = { "OpencodeSend", "OpencodeSwitchMode", "OpencodePrompt" },
}
