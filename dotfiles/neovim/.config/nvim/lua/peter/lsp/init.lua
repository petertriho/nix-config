local M = {}

local LSP_METHODS = {
    ["textDocument/codeAction"] = {
        keymaps = {
            {
                "n",
                "<leader>k",
                function()
                    vim.lsp.buf.code_action()
                end,
                { desc = "Code Actions" },
            },
            {
                "v",
                "<leader>k",
                function()
                    vim.lsp.buf.range_code_action()
                end,
                { desc = "Code Actions" },
            },
        },
    },
    ["textDocument/declaration"] = {
        keymaps = {
            {
                "n",
                "grd",
                function()
                    vim.lsp.buf.declaration()
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
                    vim.lsp.buf.definition()
                end,
                { desc = "Definition" },
            },
        },
    },
    ["textDocument/documentSymbol"] = {
        callback = function(client, bufnr)
            require("nvim-navic").attach(client, bufnr)
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
                    vim.lsp.buf.implementation()
                end,
                { desc = "Implementation" },
            },
        },
    },
    ["textDocument/signatureHelp"] = {
        keymaps = {
            {
                "",
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
                "gy",
                function()
                    vim.lsp.buf.type_definition()
                end,
                { desc = "Type Definition" },
            },
        },
    },
}

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

    if config == nil then
        return
    end

    local buf_keymap = create_buf_keymap(bufnr)
    if config.keymaps then
        for _, keymap in ipairs(config.keymaps) do
            buf_keymap(unpack(keymap))
        end
    end

    if config.callback then
        config.callback(client, bufnr)
    end
end

local function lsp_attach_callback(args)
    local bufnr = args.buf

    if require("peter.core.utils").file_is_big(bufnr) then
        vim.schedule(function()
            vim.lsp.buf_detach_client(bufnr, args.data.client_id)
        end)
        return
    end

    local client = vim.lsp.get_client_by_id(args.data.client_id)

    if client == nil then
        return
    end

    local buf_keymap = create_buf_keymap(bufnr)

    buf_keymap(
        "n",
        "gh",
        "<CMD>lua vim.diagnostic.open_float(0, { scope = 'line', source = 'always', border = 'rounded' })<CR>",
        { desc = "Diagnostic" }
    )
    buf_keymap("n", "grq", "<CMD>lua vim.diagnostic.setqflist()<CR>", { desc = "QDiagnostics" })
    buf_keymap("n", "grl", "<CMD>lua vim.diagnostic.setloclist()<CR>", { desc = "LDiagnostics" })

    if client.name == "basedpyright" then
        buf_keymap("n", "gro", "<CMD>PyrightOrganizeImports<CR>", { desc = "Organize Imports" })
    elseif client.name == "htmx" then
        client.server_capabilities.hoverProvider = false
    elseif client.name == "ruff" then
        buf_keymap("n", "gro", "<CMD>RuffOrganizeImports<CR>", { desc = "Organize Imports" })
    elseif client.name == "ts_ls" then
        buf_keymap("n", "gro", "<CMD>TSServerOrganizeImports<CR>", { desc = "Organize Imports" })
    end

    for method, _ in pairs(LSP_METHODS) do
        if client.supports_method(method, bufnr) then
            lsp_setup_method(client, bufnr, method)
        end
    end
end

local function make_base_config()
    local capabilities = vim.lsp.protocol.make_client_capabilities()

    local completion = capabilities.textDocument.completion or {}

    local completionItem = completion.completionItem
    completionItem.snippetSupport = true
    completionItem.commitCharactersSupport = true
    completionItem.deprecatedSupport = true
    completionItem.preselectSupport = true
    completionItem.tagSupport = {
        valueSet = {
            1, -- Deprecated
        },
    }
    completionItem.insertReplaceSupport = true
    completionItem.resolveSupport = {
        properties = {
            "documentation",
            "detail",
            "additionalTextEdits",
            "sortText",
            "filterText",
            "insertText",
            "textEdit",
            "insertTextFormat",
            "insertTextMode",
        },
    }
    completionItem.insertTextModeSupport = {
        valueSet = {
            1, -- asIs
            2, -- adjustIndentation
        },
    }
    completionItem.labelDetailsSupport = true

    completion.dynamicRegistration = false
    completion.contextSupport = true
    completion.insertTextMode = 1
    completion.completionList = {
        itemDefaults = {
            "commitCharacters",
            "editRange",
            "insertTextFormat",
            "insertTextMode",
            "data",
        },
    }

    capabilities.textDocument.colorProvider = { dynamicRegistration = false }
    return {
        capabilities = capabilities,
        flags = { allow_incremental_sync = true, debounce_text_changes = 300 },
    }
end

M.setup = function()
    vim.diagnostic.config({
        severity_sort = true,
        signs = {
            text = {
                [vim.diagnostic.severity.ERROR] = "󰅚 ",
                [vim.diagnostic.severity.WARN] = "󰀪 ",
                [vim.diagnostic.severity.HINT] = "󰌶 ",
                [vim.diagnostic.severity.INFO] = " ",
            },
        },
    })

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

    vim.api.nvim_create_autocmd("LspAttach", {
        callback = lsp_attach_callback,
    })

    local lspconfig = require("lspconfig")
    local overrides = require("peter.lsp.overrides")

    local base_config = make_base_config()

    for server, override in pairs(overrides) do
        local config = vim.tbl_extend("force", base_config, override or {})

        if server == "yamlls" then
            config = require("yaml-companion").setup({ lspconfig = config })
        end

        lspconfig[server].setup(config)
    end
end

return M
