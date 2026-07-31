-- Code Bridge keeps its tmux finder private, so replace the closure to see
-- through PTY wrappers such as Iris.
local function patch_tmux_target(bridge, opts)
    local seen = {}

    local function replace(fn)
        if seen[fn] then
            return false
        end
        seen[fn] = true

        local index = 1
        while true do
            local name, value = debug.getupvalue(fn, index)
            if not name then
                return false
            end

            if name == "find_tmux_target" then
                local original = value
                debug.setupvalue(fn, index, function()
                    local tmux = opts.tmux or {}
                    if tmux.target_mode == "window_name" then
                        return original()
                    end

                    local flags = {
                        current_session = "-s",
                        find_process = "-a",
                    }
                    local process_names = tmux.process_name or "claude"
                    local pane, find_error = require("peter.core.tmux").find_pane(
                        process_names,
                        flags[tmux.target_mode]
                    )
                    if pane or find_error then
                        return pane, find_error
                    end

                    local label = type(process_names) == "table" and table.concat(process_names, "/") or process_names
                    return nil, "no pane found running " .. label
                end)
                return true
            end

            if type(value) == "function" and replace(value) then
                return true
            end
            index = index + 1
        end
    end

    assert(replace(bridge.send_to_claude_tmux), "Failed to override code-bridge tmux target discovery")
end

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
        local bridge = require("code-bridge")
        bridge.setup(opts)
        patch_tmux_target(bridge, opts)
    end,
}
