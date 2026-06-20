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

local default_sources = {
    -- "copilot",
    "git",
    "lsp",
    "path",
    "snippets",
    "buffer",
    "ripgrep",
}

-- Higher number means higher priority
local LSP_SORT_PRIORITY = {
    ctags_lsp = 1,
    -- python
    pyrefly = 10,
    ty = 2,
    -- js
    vtsls = 100,
    eslint = 10,
    emmet_language_server = 2,
}

local cursortab_keymaps = {}

local capture_cursortab_keymap = function(name, lhs)
    if not package.loaded["cursortab"] then
        return
    end

    local keymap = vim.fn.maparg(lhs, "i", false, true)
    if type(keymap) ~= "table" or type(keymap.callback) ~= "function" then
        return
    end

    cursortab_keymaps[name] = keymap.callback
    pcall(vim.keymap.del, "i", lhs)
end

local capture_cursortab_keymaps = function()
    capture_cursortab_keymap("accept", "<Tab>")
    capture_cursortab_keymap("partial_accept", "<S-Tab>")
    capture_cursortab_keymap("trigger", "<C-e>")
end

local try_cursortab_accept = function()
    local ok, cursortab = pcall(require, "cursortab")
    if ok and cursortab.accept() then
        return true
    end
end

local try_cursortab_keymap = function(name)
    local callback = cursortab_keymaps[name]
    if not callback then
        return
    end

    local ok, result = pcall(callback)
    if ok and result == "" then
        return true
    end
end

local trigger_cursortab_completion = function()
    local callback = cursortab_keymaps.trigger
    if not callback then
        return
    end

    if pcall(callback) then
        return true
    end
end

local hide_blink_then_trigger_cursortab = function(cmp)
    if cmp.is_visible() then
        cmp.hide({
            callback = function()
                trigger_cursortab_completion()
            end,
        })
        return true
    end

    return trigger_cursortab_completion()
end

return {
    "saghen/blink.cmp",
    branch = "v1",
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
            dir = "~/.config/nvim/plugins/opencode-sources",
        },
        {
            "xzbdmw/colorful-menu.nvim",
            lazy = true,
            opt = {},
        },
        "mikavilpas/blink-ripgrep.nvim",
        -- "fang2hou/blink-copilot",
        "petertriho/cmp-git",
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
            return vim.g.completion_enabled
                and vim.b.completion ~= false
                and vim.bo.buftype ~= "prompt"
                and vim.bo.filetype ~= "bigfile"
        end,
        keymap = {
            preset = "default",
            ["<C-e>"] = {
                hide_blink_then_trigger_cursortab,
            },
            ["<Tab>"] = {
                function()
                    return try_cursortab_accept()
                end,
                "snippet_forward",
                "fallback",
            },
            ["<S-Tab>"] = {
                function()
                    return try_cursortab_keymap("partial_accept")
                end,
                "snippet_backward",
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
            default = default_sources,
            per_filetype = {
                lua = {
                    inherit_defaults = true,
                    "lazydev",
                },
                markdown = {
                    inherit_defaults = true,
                    "path_at",
                    "agent_skills",
                    "opencode_agents",
                    "opencode_skills",
                    "opencode_commands",
                },
                text = {
                    inherit_defaults = true,
                    "path_at",
                    "agent_skills",
                    "opencode_agents",
                    "opencode_skills",
                    "opencode_commands",
                },
                sql = {
                    inherit_defaults = true,
                    "dadbod_grip",
                },
            },
            providers = {
                -- copilot = {
                --     name = "copilot",
                --     module = "blink-copilot",
                --     score_offset = 150,
                --     async = true,
                -- },
                git = {
                    name = "git",
                    module = "cmp_git.blink",
                    opts = {},
                    async = true,
                },
                dadbod_grip = { name = "Grip SQL", module = "dadbod-grip.completion.blink" },
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
                path_at = {
                    module = "blink.cmp.sources.path",
                    name = "PathAt",
                    enabled = function()
                        return vim.bo.filetype == "markdown" or vim.bo.filetype == "text"
                    end,
                    opts = {
                        get_cwd = function(_)
                            return vim.fn.getcwd()
                        end,
                        ignore_root_slash = true,
                    },
                    override = {
                        get_trigger_characters = function(self)
                            local trigger_characters = self:get_trigger_characters()
                            if not vim.tbl_contains(trigger_characters, "@") then
                                table.insert(trigger_characters, "@")
                            end
                            return trigger_characters
                        end,
                        get_completions = function(self, context, callback)
                            local ft = vim.bo[context.bufnr].filetype
                            if ft ~= "markdown" and ft ~= "text" then
                                return callback({
                                    is_incomplete_forward = false,
                                    is_incomplete_backward = false,
                                    items = {},
                                })
                            end

                            local line_before_cursor = context.line:sub(1, context.cursor[2])
                            local at_query = line_before_cursor:match("@([^%s]*)$")
                            if at_query == nil then
                                return callback({
                                    is_incomplete_forward = false,
                                    is_incomplete_backward = false,
                                    items = {},
                                })
                            end

                            local prefix = line_before_cursor:sub(1, #line_before_cursor - #at_query - 1)
                            local adapted_line = prefix .. "/" .. at_query .. context.line:sub(context.cursor[2] + 1)
                            local adapted_context = vim.tbl_extend("force", context, { line = adapted_line })

                            local keyword_range = require("blink.cmp.config").completion.keyword.range
                            local start_col, end_col = require("blink.cmp.fuzzy").get_keyword_range(
                                adapted_context.line,
                                adapted_context.cursor[2],
                                keyword_range
                            )
                            adapted_context.bounds = {
                                line = adapted_context.line,
                                line_number = context.bounds.line_number,
                                start_col = start_col + 1,
                                length = end_col - start_col,
                            }

                            return self:get_completions(adapted_context, callback)
                        end,
                    },
                },
                agent_skills = {
                    name = "Skills",
                    module = "opencode-sources.source.opencode_skills",
                    -- score_offset = 110,
                    opts = {
                        root = vim.fn.expand("~/.agents/skills"),
                    },
                },
                opencode_agents = {
                    name = "Agents",
                    module = "opencode-sources.source.opencode_agents",
                    -- score_offset = 120,
                },
                opencode_skills = {
                    name = "Skills",
                    module = "opencode-sources.source.opencode_skills",
                    -- score_offset = 110,
                },
                opencode_commands = {
                    name = "Commands",
                    module = "opencode-sources.source.opencode_commands",
                    -- score_offset = 105,
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
    config = function(_, opts)
        capture_cursortab_keymaps()
        require("blink.cmp").setup(opts)
    end,
    opts_extend = { "sources.default" },
}
