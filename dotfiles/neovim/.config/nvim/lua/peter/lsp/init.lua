local M = {}

-- Languages where ctags-lsp should be completely filtered out
local CTAGS_FILTER_LANGUAGES = { "python", "typescript", "javascript" }

local function should_filter_ctags(bufnr)
    local filetype = vim.bo[bufnr].filetype
    return vim.tbl_contains(CTAGS_FILTER_LANGUAGES, filetype)
end

-- Helper function to make LSP requests with client tracking
local function make_lsp_request(method, make_params_fn)
    local bufnr = vim.api.nvim_get_current_buf()
    local filter_ctags = should_filter_ctags(bufnr)

    local all_clients = vim.lsp.get_clients({ bufnr = bufnr, method = method })
    if #all_clients == 0 then
        vim.notify("No LSP clients support " .. method, vim.log.levels.WARN)
        return
    end

    -- Separate ctags from regular clients
    local regular_clients = {}
    local ctags_client = nil

    for _, client in ipairs(all_clients) do
        if client.name == "ctags_lsp" then
            ctags_client = client
        else
            table.insert(regular_clients, client)
        end
    end

    -- Phase 1: Request from regular LSP clients first
    local responses = {}
    local pending = #regular_clients

    -- If no regular clients, go straight to ctags
    if pending == 0 and ctags_client then
        regular_clients = { ctags_client }
        ctags_client = nil
        pending = 1
    end

    local function process_results()
        local seen = {}
        local regular = {}
        local ctags = {}

        for client_id, response in pairs(responses) do
            local client = response.client
            local is_ctags = client.name == "ctags_lsp"
            local result = response.result

            local items = result
            -- Handle both single location and array of locations
            if not vim.islist(items) then
                items = { items }
            end

            for _, item in ipairs(items) do
                local location = item.targetUri and item or item
                local uri = location.uri or location.targetUri
                local range = location.range or location.targetRange

                if uri and range then
                    local filename = vim.uri_to_fname(uri)
                    local lnum = range.start.line + 1
                    local key = string.format("%s:%d", filename, lnum)

                    if not seen[key] then
                        seen[key] = true
                        local qf_item = {
                            filename = filename,
                            lnum = lnum,
                            col = range.start.character + 1,
                            text = item.text or "",
                        }

                        if is_ctags then
                            table.insert(ctags, qf_item)
                        else
                            table.insert(regular, qf_item)
                        end
                    end
                end
            end
        end

        local final_items
        -- ctags as fallback
        if filter_ctags and #regular == 0 and #ctags > 0 then
            final_items = ctags
        else
            -- put ctags at the end
            if not filter_ctags then
                vim.list_extend(regular, ctags)
            end
            final_items = regular
        end

        vim.fn.setqflist({}, " ", { items = final_items, title = method })
        if #final_items > 1 then
            vim.cmd("botright copen")
        elseif #final_items == 1 then
            vim.cmd.cfirst()
        end
    end

    for _, client in ipairs(regular_clients) do
        local params = make_params_fn and make_params_fn(client)
            or vim.lsp.util.make_position_params(0, client.offset_encoding)

        client:request(method, params, function(err, result)
            if not err and result then
                responses[client.id] = { result = result, client = client }
            end

            pending = pending - 1

            -- Phase 2: If regular LSP returned nothing and we need ctags as fallback
            if pending == 0 then
                -- Check if we got any regular results
                local has_regular_results = false
                for _, response in pairs(responses) do
                    if response.client.name ~= "ctags_lsp" then
                        has_regular_results = true
                        break
                    end
                end

                -- Request ctags only if needed
                local should_request_ctags = ctags_client
                    and ((filter_ctags and not has_regular_results) or not filter_ctags)

                if should_request_ctags then
                    pending = 1
                    local params = make_params_fn and make_params_fn(ctags_client)
                        or vim.lsp.util.make_position_params(0, ctags_client.offset_encoding)

                    ctags_client:request(method, params, function(err, result)
                        if not err and result then
                            responses[ctags_client.id] = { result = result, client = ctags_client }
                        end

                        pending = pending - 1
                        if pending == 0 then
                            process_results()
                        end
                    end)
                else
                    process_results()
                end
            end
        end)
    end
end

local methods = vim.lsp.protocol.Methods

local LSP_METHODS = {
    [methods.textDocument_codeAction] = {
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
    [methods.textDocument_declaration] = {
        keymaps = {
            {
                "n",
                "grd",
                function()
                    make_lsp_request(methods.textDocument_declaration)
                end,
                { desc = "Declaration" },
            },
        },
    },
    [methods.textDocument_definition] = {
        keymaps = {
            {
                "n",
                "gd",
                function()
                    make_lsp_request(methods.textDocument_definition)
                end,
                { desc = "Definition" },
            },
        },
    },
    [methods.textDocument_documentSymbol] = {
        callback = function(client, bufnr)
            if vim.b[bufnr].lsp_document_symbols then
                return
            end
            require("nvim-navic").attach(client, bufnr)
            vim.b[bufnr].lsp_document_symbols = true
        end,
    },
    [methods.textDocument_hover] = {
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
    [methods.textDocument_implementation] = {
        keymaps = {
            {
                "n",
                "gri",
                function()
                    make_lsp_request(methods.textDocument_implementation)
                end,
                { desc = "Implementation" },
            },
        },
    },
    [methods.textDocument_inlineCompletion] = {
        callback = function(client, bufnr)
            vim.lsp.inline_completion.enable(true, { bufnr = bufnr })
        end,
    },
    [methods.textDocument_onTypeFormatting] = {
        callback = function(client, bufnr)
            vim.lsp.on_type_formatting.enable(true, {
                client_id = client.id,
            })
        end,
    },
    [methods.textDocument_rename] = {
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
    [methods.textDocument_references] = {
        keymaps = {
            {
                "n",
                "grr",
                function()
                    make_lsp_request(methods.textDocument_references, function(client)
                        local params = vim.lsp.util.make_position_params(0, client.offset_encoding)
                        params.context = { includeDeclaration = true }
                        return params
                    end)
                end,
                { desc = "References" },
            },
        },
    },
    [methods.textDocument_signatureHelp] = {
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
    [methods.textDocument_typeDefinition] = {
        keymaps = {
            {
                "n",
                "grt",
                function()
                    make_lsp_request(methods.textDocument_typeDefinition)
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

local function translate_diagnostic_message(message, code)
    -- If we have a code, prepend it to the message for parsing
    local message_with_code = code and ("TS" .. tostring(code) .. ": " .. message) or message
    local parsed = require("ts-error-translator").parse_errors(message_with_code)
    if #parsed > 0 and parsed[1].improvedError then
        return parsed[1].improvedError.body
    end
    return message
end

local function lsp_setup_handlers()
    local register_capability_handler = vim.lsp.handlers[methods.client_registerCapability]
    vim.lsp.handlers[methods.client_registerCapability] = function(err, result, ctx)
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

    -- require("ts-error-translator.diagnostic").setup({
    --     servers = {
    --         "astro",
    --         "svelte",
    --         "ts_ls",
    --         "tsserver",
    --         "typescript-tools",
    --         "volar",
    --         "vtsls",
    --     },
    -- })

    local publish_diagnostics_handler = vim.lsp.handlers[vim.lsp.protocol.Methods.textDocument_publishDiagnostics]

    local translate_servers = { "vtsls" }

    vim.lsp.handlers[vim.lsp.protocol.Methods.textDocument_publishDiagnostics] = function(err, result, ctx, config)
        if result and result.diagnostics then
            local client = vim.lsp.get_client_by_id(ctx.client_id)
            local client_name = client and client.name or "unknown"

            if vim.tbl_contains(translate_servers, client_name) then
                for _, diag in ipairs(result.diagnostics) do
                    if diag.message then
                        diag.message = translate_diagnostic_message(diag.message, diag.code)
                    end
                end
            end
        end

        return publish_diagnostics_handler(err, result, ctx, config)
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
    }, {
        textDocument = {
            onTypeFormatting = {
                dynamicRegistration = false,
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
        virtual_text = {
            suffix = function(diag)
                return require("rulebook").hasDocs(diag) and "  " or ""
            end,
        },
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
                        if override.config then
                            local config = override.config()
                            vim.lsp.config(server, config)
                        end
                        vim.lsp.enable(server)
                    end,
                    once = true,
                })
            end
        else
            local enabled = true
            local config = override

            if type(override.config) == "function" then
                enabled = not override.disabled
                config = override.config()
            end

            vim.lsp.config(server, config)
            vim.lsp.enable(server, enabled)
        end
    end
end

return M
