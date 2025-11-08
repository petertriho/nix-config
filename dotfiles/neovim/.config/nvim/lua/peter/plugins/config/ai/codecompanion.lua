return {
    "olimorris/codecompanion.nvim",
    cmd = {
        "CodeCompanion",
    },
    keys = {
        { "<leader>cc", "<CMD>CodeCompanionCmd<CR>", desc = "Cmd" },
        { "<leader>cp", "<CMD>CodeCompanionActions<CR>", desc = "Palette" },
        {
            "<leader>ct",
            "<CMD>CodeCompanionChat Toggle<CR>",
            desc = "Toggle",
        },
        {
            "<leader>ca",
            "<CMD>CodeCompanionChat Add<CR>",
            mode = {
                "v",
            },
            desc = "Add",
        },
    },
    dependencies = {
        "franco-ruggeri/codecompanion-spinner.nvim",
    },
    opts = {
        -- display = {
        --     chat = {
        --         show_settings = true,
        --     },
        -- },
        extensions = {
            spinner = {},
        },
    },
    config = function(_, opts)
        opts = vim.tbl_deep_extend("force", opts, {
            adapters = {
                acp = {
                    gemini_cli = function()
                        return require("codecompanion.adapters").extend("gemini_cli", {
                            defaults = {
                                auth_method = "oauth-personal",
                            },
                        })
                    end,
                    opencode = function()
                        return {
                            name = "opencode",
                            formatted_name = "OpenCode",
                            type = "acp",
                            roles = {
                                llm = "assistant",
                                user = "user",
                            },
                            opts = {
                                vision = false,
                            },
                            commands = {
                                default = {
                                    "opencode",
                                    "acp",
                                },
                            },
                            defaults = {
                                mcpServers = {},
                                timeout = 20000,
                            },
                            parameters = {
                                protocolVersion = 1,
                                clientCapabilities = {
                                    fs = { readTextFile = true, writeTextFile = true },
                                },
                                clientInfo = {
                                    name = "CodeCompanion.nvim",
                                    version = "1.0.0",
                                },
                            },
                            handlers = {
                                setup = function(self)
                                    return true
                                end,
                                auth = function(self)
                                    return true
                                end,
                                form_messages = function(self, messages, capabilities)
                                    return require("codecompanion.adapters.acp.helpers").form_messages(
                                        self,
                                        messages,
                                        capabilities
                                    )
                                end,
                                on_exit = function(self, code) end,
                            },
                        }
                    end,
                },
            },
        })

        if vim.g.copilot_model then
            opts = vim.tbl_deep_extend("force", opts, {
                adapters = {
                    http = {
                        copilot = function()
                            return require("codecompanion.adapters").extend("copilot", {
                                schema = {
                                    model = {
                                        default = vim.g.copilot_model,
                                    },
                                },
                            })
                        end,
                    },
                },
            })
        end

        require("codecompanion").setup(opts)
    end,
}
