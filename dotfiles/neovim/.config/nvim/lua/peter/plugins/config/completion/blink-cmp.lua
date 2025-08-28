local get_kind_icon_text = function(ctx)
    -- default kind icon
    local icon = ctx.kind_icon
    -- if LSP source, check for color derived from documentation
    if ctx.item.source_name == "LSP" then
        local color_item = require("nvim-highlight-colors").format(ctx.item.documentation, { kind = ctx.kind })
        if color_item and color_item.abbr and color_item.abbr ~= "" then
            icon = color_item.abbr
        end
    end
    return icon .. ctx.icon_gap
end

local get_kind_icon_highlight = function(ctx)
    -- default highlight group
    local highlight = "BlinkCmpKind" .. ctx.kind
    -- if LSP source, check for color derived from documentation
    if ctx.item.source_name == "LSP" then
        local color_item = require("nvim-highlight-colors").format(ctx.item.documentation, { kind = ctx.kind })
        if color_item and color_item.abbr_hl_group and color_item.abbr_hl_group ~= "" then
            highlight = color_item.abbr_hl_group
        end
    end
    return highlight
end

local get_lsp_client_name_text = function(ctx)
    if ctx.item.source_id == "lsp" then
        return ctx.item.client_name or ""
    end
    return ""
end

local get_source_name_text = function(ctx)
    return "[" .. string.upper(ctx.source_name) .. "]"
end

-- Higher number means higher priority
local LSP_SORT_PRIORITY = {
    -- python
    pyrefly = 10,
    ty = 1,
    -- js
    vtsls = 100,
    eslint = 10,
    emmet_language_server = 1,
}

return {
    "saghen/blink.cmp",
    build = "nix run .#build-plugin",
    -- build = 'nix develop --command bash -c "cargo build --release"',
    event = { "CmdlineEnter", "InsertEnter" },
    keys = {
        { "<leader>lc", "<CMD>ToggleBlinkCmp<CR>", desc = "Completion Toggle" },
    },
    dependencies = {
        -- {
        --     "saghen/blink.compat",
        --     lazy = true,
        --     opts = {},
        -- },
        {
            "xzbdmw/colorful-menu.nvim",
            lazy = true,
            opt = {},
        },
        "mikavilpas/blink-ripgrep.nvim",
        "fang2hou/blink-copilot",
    },
    init = function()
        vim.g.completion_enabled = true

        local function toggle_completion()
            vim.g.completion_enabled = not vim.g.completion_enabled
        end

        vim.api.nvim_create_user_command("ToggleBlinkCmp", toggle_completion, {})
    end,
    opts = {
        enabled = function()
            return vim.g.completion_enabled and vim.bo.buftype ~= "prompt" and vim.bo.filetype ~= "bigfile"
        end,
        keymap = {
            preset = "default",
            ["<C-e>"] = {
                "hide",
                function()
                    if not vim.lsp.inline_completion.get() then
                        return
                    end
                    -- if vim.g.copilot_model == nil then
                    --     return
                    -- end
                    -- require("copilot.suggestion").accept()
                end,
            },
            ["<Tab>"] = {
                function(cmp)
                    local bufnr = vim.api.nvim_get_current_buf()
                    local state = vim.b[bufnr].nes_state
                    if state then
                        cmp.hide()
                        return (
                            require("copilot-lsp.nes").walk_cursor_start_edit()
                            or (
                                require("copilot-lsp.nes").apply_pending_nes()
                                and require("copilot-lsp.nes").walk_cursor_end_edit()
                            )
                        )
                    end
                    if cmp.snippet_active() then
                        return cmp.accept()
                    else
                        return cmp.select_and_accept()
                    end
                end,
                "snippet_forward",
                "fallback",
            },
        },
        appearance = {
            use_nvim_cmp_as_default = true,
            nerd_font_variant = "mono",
        },
        signature = {
            enabled = false,
        },
        fuzzy = {
            implementation = "prefer_rust",
            sorts = {
                function(a, b)
                    if a.source_name ~= "LSP" or b.source_name ~= "LSP" then
                        return
                    end

                    if a.client_name == b.client_name then
                        return
                    end

                    if not LSP_SORT_PRIORITY[a.client_name] or not LSP_SORT_PRIORITY[b.client_name] then
                        return
                    end

                    return LSP_SORT_PRIORITY[a.client_name] > LSP_SORT_PRIORITY[b.client_name]
                end,
                "score",
                "sort_text",
            },
        },
        completion = {
            documentation = {
                auto_show = true,
                auto_show_delay_ms = 200,
                window = {
                    border = { "╭", "─", "╮", "│", "╯", "─", "╰", "│" },
                    winhighlight = "NormalFloat:NormalFloat,FloatBorder:FloatBorder",
                },
            },
            menu = {
                draw = {
                    columns = {
                        { "kind_icon" },
                        { "label", gap = 1 },
                        { "lsp_client_name" },
                        { "source_name" },
                    },
                    components = {
                        kind_icon = {
                            text = get_kind_icon_text,
                            highlight = get_kind_icon_highlight,
                        },
                        label = {
                            text = function(ctx)
                                return require("colorful-menu").blink_components_text(ctx)
                            end,
                            highlight = function(ctx)
                                return require("colorful-menu").blink_components_highlight(ctx)
                            end,
                        },
                        lsp_client_name = {
                            text = get_lsp_client_name_text,
                            highlight = "Comment",
                        },
                        source_name = {
                            text = get_source_name_text,
                        },
                    },
                },
            },
            list = {
                selection = {
                    preselect = function(ctx)
                        return ctx.mode ~= "cmdline" and not require("blink.cmp").snippet_active({ direction = 1 })
                    end,
                    auto_insert = function(ctx)
                        return ctx.mode == "cmdline"
                    end,
                },
            },
        },
        snippets = {
            preset = "luasnip",
        },
        sources = {
            default = {
                "copilot",
                "lsp",
                "path",
                "snippets",
                "buffer",
                "ripgrep",
            },
            per_filetype = {
                lua = {
                    inherit_defaults = true,
                    "lazydev",
                },
            },
            providers = {
                copilot = {
                    name = "copilot",
                    module = "blink-copilot",
                    score_offset = 150,
                    async = true,
                },
                lazydev = {
                    name = "LazyDev",
                    module = "lazydev.integrations.blink",
                    score_offset = 100,
                    async = true,
                },
                lsp = {
                    async = true,
                    score_offset = 50,
                },
                buffer = {
                    opts = {
                        -- default to all visible buffers
                        get_bufnrs = function()
                            return vim.iter(vim.api.nvim_list_wins())
                                :map(function(win)
                                    return vim.api.nvim_win_get_buf(win)
                                end)
                                :filter(function(buf)
                                    return vim.bo[buf].buftype ~= "nofile" and vim.bo[buf].filetype ~= "bigfile"
                                end)
                                :totable()
                        end,
                    },
                },
                ripgrep = {
                    module = "blink-ripgrep",
                    name = "Ripgrep",
                    async = true,
                    opts = {
                        prefix_min_len = 3,
                        project_root_marker = ".git",
                        fallback_to_regex_highlighting = true,
                        toggles = {
                            on_off = "<leader>tg",
                            debug = nil,
                        },

                        backend = {
                            use = "gitgrep-or-ripgrep",
                            customize_icon_highlight = true,
                            ripgrep = {
                                context_size = 5,
                                max_filesize = "1M",
                                project_root_fallback = true,
                                search_casing = "--ignore-case",
                                additional_rg_options = {},
                                ignore_paths = {},
                                additional_paths = {},
                            },
                        },
                        debug = false,
                    },
                    -- transform_items = function(_, items)
                    --     for _, item in ipairs(items) do
                    --         item.labelDetails = {
                    --             description = "(rg)",
                    --         }
                    --     end
                    --     return items
                    -- end,
                },
            },
        },
    },
    opts_extend = { "sources.default" },
}
