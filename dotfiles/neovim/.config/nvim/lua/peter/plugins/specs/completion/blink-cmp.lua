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

local function is_pi_prompt()
    return vim.fn.fnamemodify(vim.api.nvim_buf_get_name(0), ":t") == "prompt.md"
end

return {
    "saghen/blink.cmp",
    branch = "main",
    build = [[
        set -e
        case "$(uname -s)" in
            Darwin) lib_ext="dylib" ;;
            Linux) lib_ext="so" ;;
            *) echo "Unsupported platform for blink.cmp" >&2; exit 1 ;;
        esac
        nix build .#blink-cmp
        source="result/lib/libblink_cmp_fuzzy.$lib_ext"
        test -f "$source"
        mkdir -p lib
        # Match blink.lib's commit-specific lookup so updates cannot load an old binary.
        revision="$(git -C "$PWD" rev-parse HEAD)"
        target="lib/libblink_cmp_fuzzy.$lib_ext.$(printf '%s' "$revision" | cut -c1-7)"
        cp -L "$source" "$target.tmp"
        chmod u+w "$target.tmp"
        mv -f "$target.tmp" "$target"
        for stale in lib/libblink_cmp_fuzzy."$lib_ext"*; do
            if [ "$stale" != "$target" ]; then rm -f "$stale"; fi
        done
    ]],
    event = { "CmdlineEnter", "InsertEnter" },
    keys = {
        { "<leader>uc", "<CMD>ToggleBlinkCmp<CR>", desc = "Completion Toggle" },
    },
    dependencies = {
        "saghen/blink.lib",
        -- {
        --     "saghen/blink.compat",
        --     lazy = true,
        --     opts = {},
        -- },
        {
            dir = "~/.config/nvim/plugins/ai-sources",
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
        vim.api.nvim_create_user_command("AISourcesRefresh", function()
            local ok, catalog = pcall(require, "ai-sources.catalog")
            if not ok then
                vim.notify("ai-sources catalog is not available", vim.log.levels.WARN)
                return
            end

            catalog.clear_cache()
            vim.notify("AI completion source cache cleared")
        end, {})
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
                    "pi_skills",
                    "oc_agents",
                    "oc_skills",
                    "oc_commands",
                },
                text = {
                    inherit_defaults = true,
                    "path_at",
                    "agent_skills",
                    "pi_skills",
                    "oc_agents",
                    "oc_skills",
                    "oc_commands",
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
                            -- Call the base path source directly; self:get_trigger_characters
                            -- here would recurse into this override.
                            local base = require("blink.cmp.sources.path").get_trigger_characters
                            local trigger_characters = base(self)
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

                            -- Delegate to the base path source; calling
                            -- self:get_completions here would infinitely recurse.
                            local base = require("blink.cmp.sources.path").get_completions
                            return base(self, adapted_context, callback)
                        end,
                    },
                },
                agent_skills = {
                    name = "Skills",
                    module = "ai-sources.source.skills",
                    async = true,
                    -- score_offset = 110,
                    opts = {
                        root = vim.fn.expand("~/.agents/skills"),
                        variants = {
                            {
                                prefix = "",
                                when = function()
                                    return not is_pi_prompt()
                                end,
                            },
                            { prefix = "skill:" },
                        },
                    },
                },
                pi_skills = {
                    name = "Skills",
                    module = "ai-sources.source.skills",
                    async = true,
                    opts = {
                        root = vim.fn.expand("~/.pi/agent/skills"),
                        variants = { { prefix = "skill:" } },
                    },
                },
                oc_agents = {
                    name = "Agents",
                    module = "ai-sources.source.agents",
                    async = true,
                    -- score_offset = 120,
                },
                oc_skills = {
                    name = "Skills",
                    module = "ai-sources.source.skills",
                    async = true,
                    -- score_offset = 110,
                },
                oc_commands = {
                    name = "Commands",
                    module = "ai-sources.source.commands",
                    async = true,
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
                        -- Higher prefix + smaller context: ripgrep scans the repo on
                        -- short words, which stalls large repos.
                        prefix_min_len = 4,
                        project_root_marker = ".git",
                        fallback_to_regex_highlighting = true,
                        toggles = {
                            on_off = "<leader>ug",
                            debug = nil,
                        },

                        backend = {
                            use = "gitgrep-or-ripgrep",
                            customize_icon_highlight = true,
                            ripgrep = {
                                context_size = 3,
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
        require("blink.cmp").setup(opts)
    end,
    opts_extend = { "sources.default" },
}
