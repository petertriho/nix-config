return {
    "samir-roy/code-bridge.nvim",
    cmd = {
        "CodeBridgeTmux",
        "CodeBridgeTmuxAll",
        "CodeBridgeTmuxInteractive",
        "CodeBridgeTmuxAllInteractive",
        "CodeBridgeTmuxDiff",
        "CodeBridgeTmuxDiffStaged",
        "CodeBridgeTmuxRecent",
        "CodeBridgeTmuxRecentInteractive",
        "CodeBridgeTmuxDiagnostics",
        "CodeBridgeTmuxDiagnosticsAll",
        "CodeBridgeTmuxDiagnosticsErrors",
        "CodeBridgeTmuxDiagnosticsErrorsAll",
        "CodeBridgeQuery",
        "CodeBridgeChat",
        "CodeBridgeHide",
        "CodeBridgeShow",
        "CodeBridgeWipe",
        "CodeBridgeCancelQuery",
        "CodeBridgeResumePrompt",
    },
    keys = {
        -- send context via tmux
        { "<leader>at", "<CMD>CodeBridgeTmux<CR>", mode = "n", desc = "Send file" },
        { "<leader>at", ":CodeBridgeTmux<CR>", mode = "v", desc = "Send selection" },
        { "<leader>aa", "<CMD>CodeBridgeTmuxAll<CR>", mode = "n", desc = "Send all buffers" },
        { "<leader>aa", ":CodeBridgeTmuxAll<CR>", mode = "v", desc = "Send all buffers" },
        { "<leader>ai", "<CMD>CodeBridgeTmuxInteractive<CR>", mode = "n", desc = "Interactive prompt" },
        { "<leader>ai", ":CodeBridgeTmuxInteractive<CR>", mode = "v", desc = "Interactive prompt" },
        { "<leader>aA", "<CMD>CodeBridgeTmuxAllInteractive<CR>", desc = "Interactive all buffers" },
        { "<leader>ad", "<CMD>CodeBridgeTmuxDiff<CR>", desc = "Send diff" },
        { "<leader>aD", "<CMD>CodeBridgeTmuxDiffStaged<CR>", desc = "Send staged diff" },
        { "<leader>ar", "<CMD>CodeBridgeTmuxRecent<CR>", desc = "Send recent" },
        { "<leader>aR", "<CMD>CodeBridgeTmuxRecentInteractive<CR>", desc = "Interactive recent" },
        { "<leader>ae", "<CMD>CodeBridgeTmuxDiagnostics<CR>", desc = "Send diagnostics" },
        { "<leader>aE", "<CMD>CodeBridgeTmuxDiagnosticsAll<CR>", desc = "Send all diagnostics" },
        { "<leader>ax", "<CMD>CodeBridgeTmuxDiagnosticsErrors<CR>", desc = "Send errors" },
        { "<leader>aX", "<CMD>CodeBridgeTmuxDiagnosticsErrorsAll<CR>", desc = "Send all errors" },
        -- chat interface
        -- { "<leader>aq", "<CMD>CodeBridgeQuery<CR>", mode = "n", desc = "Query with context" },
        -- { "<leader>aq", ":CodeBridgeQuery<CR>", mode = "v", desc = "Query with context" },
        -- { "<leader>ac", "<CMD>CodeBridgeChat<CR>", desc = "Chat" },
        -- { "<leader>ah", "<CMD>CodeBridgeHide<CR>", desc = "Hide chat" },
        -- { "<leader>as", "<CMD>CodeBridgeShow<CR>", desc = "Show chat" },
        -- { "<leader>aw", "<CMD>CodeBridgeWipe<CR>", desc = "Wipe chat" },
        -- { "<leader>ak", "<CMD>CodeBridgeCancelQuery<CR>", desc = "Cancel query" },
        -- { "<leader>ap", "<CMD>CodeBridgeResumePrompt<CR>", desc = "Resume prompt" },
    },
    opts = {
        tmux = {
            switch_to_target = true,
            target_mode = "current_session",
            process_name = {
                "claude",
                "opencode",
                "pi",
            },
        },
    },
    config = function(_, opts)
        -- The native Claude Code binary lives at
        -- ~/.local/share/claude/versions/<version>, so tmux reports the pane's
        -- current command as a bare version like "2.1.258". That string
        -- contains none of the configured process names, so code-bridge cannot
        -- find the pane. Reload the module with `matches_process` taught to
        -- also accept a bare semantic-version command.
        local path = vim.api.nvim_get_runtime_file("lua/code-bridge/init.lua", false)[1]
            or (vim.fn.stdpath("data") .. "/site/pack/core/opt/code-bridge.nvim/lua/code-bridge/init.lua")
        local patched, count = table.concat(vim.fn.readfile(path), "\n"):gsub(
            "local function matches_process%(cmd%)",
            function(signature)
                return signature .. "\n  if cmd and cmd:match('^%d+%.%d+%.%d+$') then return true end"
            end
        )
        if count == 1 then
            package.loaded["code-bridge"] = assert(load(patched, "@" .. path))()
        else
            vim.notify(
                "code-bridge: version-match patch did not apply (" .. count .. " sites)",
                vim.log.levels.WARN
            )
        end

        local bridge = require("code-bridge")
        bridge.setup(opts)
    end,
}
