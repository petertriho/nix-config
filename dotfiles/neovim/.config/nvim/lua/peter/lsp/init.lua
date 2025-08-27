local M = {}

local on_list = function(options)
    if options.items then
        local seen = {}
        local deduplicated = {}

        for _, item in ipairs(options.items) do
            local key = string.format("%s:%d", item.filename or "", item.lnum or 0)
            if not seen[key] then
                seen[key] = true
                table.insert(deduplicated, item)
            end
        end

        options.items = deduplicated
    end

    vim.fn.setqflist({}, " ", options)
    if options.items and #options.items > 1 then
        vim.cmd("botright copen")
    end
    vim.cmd.cfirst()
end

local LSP_METHODS = {
    ["textDocument/codeAction"] = {
        keymaps = {
            {
                { "n", "x" },
                "gra",
                function()
                    vim.lsp.buf.code_action()
                end,
                { desc = "Code Actions" },
            },
            {
                { "n", "x" },
                "grA",
                function()
                    vim.lsp.buf.code_action({ context = { only = { "source", "refactor", "quickfix" } } })
                end,
                { desc = "Code Actions (ALL)" },
            },
        },
    },
    ["textDocument/declaration"] = {
        keymaps = {
            {
                "n",
                "grd",
                function()
                    vim.lsp.buf.declaration({
                        on_list = on_list,
                    })
                end,
                { desc = "Declaration" },
            },
        },
    },
    ["textDocument/definition"] = {
        keymaps = {
            {
                "n",
                "gd",
                function()
                    vim.lsp.buf.definition({
                        on_list = on_list,
                    })
                end,
                { desc = "Definition" },
            },
        },
    },
    ["textDocument/documentSymbol"] = {
        callback = function(client, bufnr)
            if vim.b.lsp_document_symbols then
                return
            end
            require("nvim-navic").attach(client, bufnr)
            vim.b.lsp_document_symbols = true
        end,
    },
    ["textDocument/hover"] = {
        keymaps = {
            {
                "n",
                "K",
                function()
                    vim.lsp.buf.hover({ border = "rounded" })
                end,
                { desc = "Hover" },
            },
        },
    },
    ["textDocument/implementation"] = {
        keymaps = {
            {
                "n",
                "gri",
                function()
                    vim.lsp.buf.implementation({
                        on_list = on_list,
                    })
                end,
                { desc = "Implementation" },
            },
        },
    },
    ["textDocument/rename"] = {
        keymaps = {
            {
                "n",
                "grn",
                function()
                    vim.lsp.buf.rename()
                end,
                { desc = "Rename" },
            },
        },
    },
    ["textDocument/references"] = {
        keymaps = {
            {
                "n",
                "grr",
                function()
                    vim.lsp.buf.references({
                        on_list = on_list,
                    })
                end,
                { desc = "References" },
            },
        },
    },
    ["textDocument/signatureHelp"] = {
        keymaps = {
            {
                { "n", "i" },
                "<C-s>",
                function()
                    vim.lsp.buf.signature_help({ border = "rounded" })
                end,
                { desc = "Signature Help" },
            },
        },
    },
    ["textDocument/typeDefinition"] = {
        keymaps = {
            {
                "n",
                "grt",
                function()
                    vim.lsp.buf.type_definition({
                        on_list = on_list,
                    })
                end,
                { desc = "Type Definition" },
            },
        },
    },
}

local function lsp_setup_progress()
    ---@type table<number, {token:lsp.ProgressToken, msg:string, done:boolean}[]>
    local progress = vim.defaulttable()
    vim.api.nvim_create_autocmd("LspProgress", {
        ---@param ev {data: {client_id: integer, params: lsp.ProgressParams}}
        callback = function(ev)
            local client = vim.lsp.get_client_by_id(ev.data.client_id)
            local value = ev.data.params.value --[[@as {percentage?: number, title?: string, message?: string, kind: "begin" | "report" | "end"}]]
            if not client or type(value) ~= "table" then
                return
            end
            local p = progress[client.id]

            for i = 1, #p + 1 do
                if i == #p + 1 or p[i].token == ev.data.params.token then
                    p[i] = {
                        token = ev.data.params.token,
                        msg = ("[%3d%%] %s%s"):format(
                            value.kind == "end" and 100 or value.percentage or 100,
                            value.title or "",
                            value.message and (" **%s**"):format(value.message) or ""
                        ),
                        done = value.kind == "end",
                    }
                    break
                end
            end

            local msg = {} ---@type string[]
            progress[client.id] = vim.tbl_filter(function(v)
                return table.insert(msg, v.msg) or not v.done
            end, p)

            local utils = require("peter.core.utils")
            vim.notify(table.concat(msg, "\n"), vim.log.levels.INFO, {
                id = "lsp_progress",
                title = client.name,
                opts = function(notif)
                    notif.icon = #progress[client.id] == 0 and "" or utils.spinner:get_frame()
                end,
            })
        end,
    })
end

local function create_buf_keymap(bufnr)
    local function buf_keymap(mode, lhs, rhs, opts)
        opts = opts or {}
        opts.buffer = bufnr
        vim.keymap.set(mode, lhs, rhs, opts)
    end
    return buf_keymap
end

local function lsp_setup_method(client, bufnr, method)
    local config = LSP_METHODS[method]

    if not config then
        return
    end

    if config.keymaps then
        local buf_keymap = create_buf_keymap(bufnr)
        for _, keymap in ipairs(config.keymaps) do
            buf_keymap(unpack(keymap))
        end
    end

    if config.callback then
        config.callback(client, bufnr)
    end
end

local function lsp_setup_handlers()
    local register_capability_handler = vim.lsp.handlers["client/registerCapability"]
    vim.lsp.handlers["client/registerCapability"] = function(err, result, ctx)
        local client = vim.lsp.get_client_by_id(ctx.client_id)
        if client then
            for _, registration in pairs(result.registrations) do
                local method = registration.method
                if LSP_METHODS[method] then
                    for buffer in pairs(client.attached_buffers) do
                        lsp_setup_method(client, buffer, method)
                    end
                end
            end
        end
        return register_capability_handler(err, result, ctx)
    end
end

local function lsp_attach_callback(args)
    local bufnr = args.buf

    local client = vim.lsp.get_client_by_id(args.data.client_id)

    if not client then
        return
    end

    local buf_keymap = create_buf_keymap(bufnr)

    buf_keymap("n", "gh", function()
        vim.diagnostic.open_float(0, { scope = "line", source = "always", border = "rounded" })
    end, { desc = "Diagnostic" })
    buf_keymap("n", "grq", function()
        vim.diagnostic.setqflist()
    end, { desc = "QDiagnostics" })
    buf_keymap("n", "grl", function()
        vim.diagnostic.setloclist()
    end, { desc = "LDiagnostics" })

    for method, _ in pairs(LSP_METHODS) do
        if client:supports_method(method, bufnr) then
            lsp_setup_method(client, bufnr, method)
        end
    end
end

local function make_base_config()
    local capabilities = vim.tbl_deep_extend("force", vim.lsp.protocol.make_client_capabilities(), {
        -- https://github.com/Saghen/blink.cmp/blob/main/lua/blink/cmp/sources/lib/init.lua
        textDocument = {
            completion = {
                completionItem = {
                    snippetSupport = true,
                    commitCharactersSupport = false, -- todo:
                    documentationFormat = { "markdown", "plaintext" },
                    deprecatedSupport = true,
                    preselectSupport = false, -- todo:
                    tagSupport = { valueSet = { 1 } }, -- deprecated
                    insertReplaceSupport = true, -- todo:
                    resolveSupport = {
                        properties = {
                            "documentation",
                            "detail",
                            "additionalTextEdits",
                            "command",
                            "data",
                            -- todo: support more properties? should test if it improves latency
                        },
                    },
                    insertTextModeSupport = {
                        -- todo: support adjustIndentation
                        valueSet = { 1 }, -- asIs
                    },
                    labelDetailsSupport = true,
                },
                completionList = {
                    itemDefaults = {
                        "commitCharacters",
                        "editRange",
                        "insertTextFormat",
                        "insertTextMode",
                        "data",
                    },
                },

                contextSupport = true,
                insertTextMode = 1, -- asIs
            },
        },
    }, {
        textDocument = {
            colorProvider = {
                dynamicRegistration = false,
            },
        },
    }, {
        workspace = {
            fileOperations = {
                willRename = true,
                didRename = true,
                willCreate = true,
                didCreate = true,
                willDelete = true,
                didDelete = true,
            },
        },
    })

    return {
        capabilities = capabilities,
        flags = { allow_incremental_sync = true, debounce_text_changes = 300 },
    }
end

M.setup = function()
    vim.diagnostic.config({
        virtual_text = true,
        severity_sort = true,
        signs = {
            text = {
                [vim.diagnostic.severity.ERROR] = "",
                [vim.diagnostic.severity.WARN] = "",
                [vim.diagnostic.severity.HINT] = "",
                [vim.diagnostic.severity.INFO] = "",
            },
        },
    })

    lsp_setup_handlers()
    lsp_setup_progress()

    vim.api.nvim_create_autocmd("LspAttach", {
        callback = lsp_attach_callback,
    })

    local base_config = make_base_config()
    vim.lsp.config("*", base_config)

    local overrides = require("peter.lsp.overrides")

    for server, override in pairs(overrides) do
        if override.lazy then
            if override.filetypes and #override.filetypes > 0 then
                vim.api.nvim_create_autocmd("FileType", {
                    pattern = override.filetypes,
                    callback = function()
                        local config = override.config()
                        vim.lsp.config(server, config)
                        vim.lsp.enable(server)
                    end,
                    once = true,
                })
            end
        else
            vim.lsp.config(server, override)
            vim.lsp.enable(server)
        end
    end
end

return M
