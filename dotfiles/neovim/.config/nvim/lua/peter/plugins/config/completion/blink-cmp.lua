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

local get_source_name_text = function(ctx)
    return "[" .. string.upper(ctx.source_name) .. "]"
end

return {
    "saghen/blink.cmp",
    build = "nix run .#build-plugin",
    -- build = 'nix develop --command bash -c "cargo build --release"',
    event = { "CmdlineEnter", "InsertEnter" },
    keys = {
        { "<leader>lc", "<CMD>ToggleBlinkCmp<CR>", desc = "Completion Toggle" },
    },
    dependencies = {
        {
            "saghen/blink.compat",
            lazy = true,
            opts = {},
        },
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
            ["<C-e>"] = { "hide", "fallback" },
            cmdline = {
                preset = "default",
                ["<Tab>"] = { "select_next", "fallback" },
                ["<S-Tab>"] = { "select_prev", "fallback" },
            },
        },
        appearance = {
            use_nvim_cmp_as_default = true,
            nerd_font_variant = "mono",
        },
        signature = {
            enabled = false,
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
                        { "label", "label_description", gap = 1 },
                        { "source_name" },
                    },
                    components = {
                        -- customize the drawing of kind icons
                        kind_icon = {
                            text = get_kind_icon_text,
                            highlight = get_kind_icon_highlight,
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
                "lazydev",
                "lsp",
                "path",
                "avante_commands",
                "avante_mentions",
                "avante_files",
                "snippets",
                "buffer",
            },
            providers = {
                lazydev = {
                    name = "LazyDev",
                    module = "lazydev.integrations.blink",
                    score_offset = 100,
                },
                lsp = {
                    async = true,
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
                avante_commands = {
                    name = "avante_commands",
                    module = "blink.compat.source",
                    opts = {},
                },
                avante_files = {
                    name = "avante_commands",
                    module = "blink.compat.source",
                    opts = {},
                },
                avante_mentions = {
                    name = "avante_mentions",
                    module = "blink.compat.source",
                    opts = {},
                },
            },
        },
    },
    opts_extend = { "sources.default" },
}
