local M = {}

local config_dir = vim.fn.stdpath("config")
local group = vim.api.nvim_create_augroup("PeterPack", { clear = true })

local specs = {}
local by_name = {}
local loaded = {}
local build_hooks = {}

local function list(value)
	if value == nil then
		return {}
	end
	if type(value) == "table" then
		return value
	end
	return { value }
end

local function is_array(value)
	return type(value) == "table" and (value[1] ~= nil or next(value) == nil)
end

local function basename(src)
	local name = src:gsub("%.git$", ""):match("([^/]+)$") or src
	return name
end

local function source_to_name(src)
	return basename(src)
end

local function source_to_main(src)
	local name = basename(src)
	name = name:gsub("%.nvim$", "")
	return name
end

-- Normalize a plugin/module name for matching, mirroring lazy.nvim's
-- `Util.normname`: lowercase, strip a leading `vim-`/`nvim-`, strip a trailing
-- `.vim`/`.nvim`, drop `.lua`, and remove every non-letter. So both
-- "nvim-lsp-endhints" and the module "lsp-endhints" collapse to "lspendhints".
local function normname(name)
	return (name:lower():gsub("^n?vim%-", ""):gsub("%.n?vim$", ""):gsub("%.lua", ""):gsub("[^a-z]+", ""))
end

local function source_to_url(src)
	if src:match("^https?://") or src:match("^git@") then
		return src
	end
	return "https://github.com/" .. src
end

local function expand_path(path)
	return vim.fn.fnamemodify(vim.fn.expand(path), ":p")
end

local function is_spec(value)
	return type(value) == "table" and (type(value[1]) == "string" or value.src or value.url or value.dir)
end

local function spec_enabled(spec)
	if spec.enabled == false then
		return false
	end
	if spec.cond == false then
		return false
	end
	if type(spec.cond) == "function" then
		local ok, result = pcall(spec.cond)
		return ok and result ~= false
	end
	return true
end

-- Register a spec under its name, merging with any existing entry.
--
-- A spec referenced via another plugin's `dependencies` is a bare stub: it
-- carries identity (src/name/main) but no triggers or config. The dedicated
-- spec file is authoritative, so a full spec always supersedes a stub --
-- regardless of which is seen first. Without this, the old
-- `specs[name] = specs[name] or spec` kept whichever arrived first, silently
-- dropping the real spec's `event`/`config` when a dependency stub won the race
-- (e.g. garbage-day depends on nvim-lspconfig, so its stub shadowed the real
-- nvim-lspconfig spec and `require("peter.lsp").setup()` never ran).
local function register_spec(spec, is_dependency)
	local existing = specs[spec.name]
	if not existing then
		spec._dep = is_dependency or nil
		specs[spec.name] = spec
		return
	end

	if existing._dep and not is_dependency then
		for _, dep in ipairs(existing.dependencies or {}) do
			table.insert(spec.dependencies, dep)
		end
		specs[spec.name] = spec
	end
end

local function normalize(raw)
	if type(raw) == "string" then
		raw = { raw }
	end
	if type(raw) ~= "table" or not spec_enabled(raw) then
		return nil
	end

	local src = raw.src or raw.url or raw[1]
	local dir = raw.dir
	local name = raw.name or (dir and basename(dir)) or (src and source_to_name(src))
	if not name then
		return nil
	end

	local spec = vim.tbl_extend("force", raw, {
		src = src,
		dir = dir,
		name = name,
		main = raw.main,
		dependencies = {},
	})

	for _, dep in ipairs(list(raw.dependencies)) do
		local normalized = normalize(dep)
		if normalized then
			table.insert(spec.dependencies, normalized.name)
			register_spec(normalized, true)
		end
	end

	return spec
end

local function import_specs(imports)
	for _, import in ipairs(imports) do
		local module = import.import or import
		local dir = module:gsub("%.", "/")
		local files = vim.api.nvim_get_runtime_file("lua/" .. dir .. "/*.lua", true)
		table.sort(files)

		local mod
		if #files > 0 then
			mod = {}
			for _, file in ipairs(files) do
				local stem = vim.fn.fnamemodify(file, ":t:r")
				local child = stem == "init" and module or (module .. "." .. stem)
				local child_ok, child_mod = pcall(require, child)
				if not child_ok then
					error(child_mod)
				end
				table.insert(mod, child_mod)
			end
		else
			local ok
			ok, mod = pcall(require, module)
			if not ok then
				error(mod)
			end
		end

		local modules = is_spec(mod) and { mod } or mod
		for _, raw in ipairs(modules) do
			local raw_specs = is_spec(raw) and { raw } or raw
			for _, raw_spec in ipairs(raw_specs) do
				local spec = normalize(raw_spec)
				if spec then
					register_spec(spec, false)
				end
			end
		end
	end
end

local function visit(name, visiting, visited, ordered)
	if visited[name] then
		return
	end
	if visiting[name] then
		error("dependency cycle involving " .. name)
	end
	visiting[name] = true

	local spec = specs[name]
	if spec then
		for _, dep in ipairs(spec.dependencies or {}) do
			visit(dep, visiting, visited, ordered)
		end
		table.insert(ordered, spec)
	end

	visiting[name] = nil
	visited[name] = true
end

local function ordered_specs()
	local names = vim.tbl_keys(specs)
	table.sort(names, function(a, b)
		local left = specs[a]
		local right = specs[b]
		if (left.priority or 0) == (right.priority or 0) then
			return a < b
		end
		return (left.priority or 0) > (right.priority or 0)
	end)

	local ordered = {}
	local visiting = {}
	local visited = {}
	for _, name in ipairs(names) do
		visit(name, visiting, visited, ordered)
	end
	return ordered
end

local function pack_spec(spec)
	if spec.dir then
		return nil
	end

	local item = { src = source_to_url(spec.src), name = spec.name }
	item.version = spec.version or spec.tag or spec.branch
	return item
end

local function plugin_dir(spec)
	if spec.dir then
		return expand_path(spec.dir)
	end

	local pack_root = vim.fn.stdpath("data") .. "/site/pack/core"
	for _, kind in ipairs({ "opt", "start" }) do
		local dir = pack_root .. "/" .. kind .. "/" .. spec.name
		if vim.fn.isdirectory(dir) == 1 then
			return dir
		end
	end
	return pack_root .. "/opt/" .. spec.name
end

-- Resolve the module whose `.setup()` should be called, mirroring lazy.nvim's
-- `get_main`: scan the plugin's top-level `lua/` modules and pick the one whose
-- normalized name matches the plugin's. This handles repos whose module name
-- differs from the repo name (e.g. chrisgrieser/nvim-lsp-endhints exposes
-- `require("lsp-endhints")`). Resolved lazily at load time, when the plugin is
-- guaranteed to be on disk. Falls back to the source heuristic, then the name.
local function find_main(spec)
	local lua = plugin_dir(spec) .. "/lua"
	if vim.fn.isdirectory(lua) == 1 then
		local target = normname(spec.name)
		for _, entry in ipairs(vim.fn.readdir(lua)) do
			local mod = entry:gsub("%.lua$", "")
			if normname(mod) == target then
				return mod
			end
		end
	end

	return (spec.src and source_to_main(spec.src)) or spec.name
end

local function add_local_dir(spec)
	if not spec.dir then
		return
	end
	local dir = expand_path(spec.dir)
	if vim.fn.isdirectory(dir) == 1 then
		vim.opt.rtp:prepend(dir)
	else
		vim.notify("Local plugin directory does not exist: " .. dir, vim.log.levels.WARN)
	end
end

local function setup_plugin(spec)
	local opts = spec.opts
	if type(opts) == "function" then
		opts = opts(spec)
	end

	if type(spec.config) == "function" then
		spec.config(spec, opts)
	elseif spec.config == true or opts then
		require(spec.main or find_main(spec)).setup(opts or {})
	end
end

function M.load(name)
	local spec = by_name[name] or specs[name]
	if not spec or loaded[spec.name] then
		return
	end

	for _, dep in ipairs(spec.dependencies or {}) do
		M.load(dep)
	end

	if spec.dir then
		add_local_dir(spec)
	else
		vim.cmd.packadd(spec.name)
	end

	loaded[spec.name] = true
	setup_plugin(spec)
end

local function parse_event(event)
	if event == "VeryLazy" then
		return "User", "VeryLazy"
	end

	local name, pattern = event:match("^(%S+)%s+(.+)$")
	if name then
		return name, pattern
	end
	return event, nil
end

local function register_event(spec, event)
	local event_name, pattern = parse_event(event)
	vim.api.nvim_create_autocmd(event_name, {
		group = group,
		pattern = pattern,
		once = true,
		callback = function()
			M.load(spec.name)
		end,
		desc = "Load " .. spec.name,
	})
end

local function command_range(args)
	if args.range == 2 then
		return args.line1 .. "," .. args.line2
	end
	if args.range == 1 then
		return tostring(args.line1)
	end
end

local function replay_command(name, args)
	local parts = {}
	if args.mods and args.mods ~= "" then
		table.insert(parts, args.mods)
	end
	local range = command_range(args)
	if range then
		table.insert(parts, range)
	end
	table.insert(parts, name .. (args.bang and "!" or ""))
	if args.args and args.args ~= "" then
		table.insert(parts, args.args)
	end
	vim.cmd(table.concat(parts, " "))
end

local function register_cmd(spec, name)
	vim.api.nvim_create_user_command(name, function(args)
		pcall(vim.api.nvim_del_user_command, name)
		M.load(spec.name)
		replay_command(name, args)
	end, {
		bang = true,
		bar = true,
		complete = "file",
		nargs = "*",
		range = true,
		desc = "Load " .. spec.name,
	})
end

local function feed_lhs(mode, lhs)
	local keys = vim.api.nvim_replace_termcodes(lhs, true, false, true)
	vim.api.nvim_feedkeys(keys, mode == "i" and "i" or "m", false)
end

local function keymap_opts(key)
	return {
		desc = key.desc,
		noremap = key.noremap ~= false,
		silent = key.silent ~= false,
		expr = key.expr,
		nowait = key.nowait,
	}
end

local function normalize_key(key)
	if type(key) == "string" then
		key = { key }
	end

	local lhs = key[1]
	local rhs = key[2]
	if not lhs then
		return nil
	end
	return lhs, rhs, key.mode or "n", keymap_opts(key)
end

local function register_eager_key(key)
	local lhs, rhs, modes, opts = normalize_key(key)
	if not lhs or rhs == nil then
		return
	end

	vim.keymap.set(modes, lhs, rhs, opts)
end

local function register_key(spec, key)
	local lhs, rhs, modes, opts = normalize_key(key)
	if not lhs then
		return
	end

	vim.keymap.set(modes, lhs, function()
		pcall(vim.keymap.del, modes, lhs)
		M.load(spec.name)
		if rhs ~= nil then
			vim.keymap.set(modes, lhs, rhs, opts)
		end
		if type(rhs) == "function" then
			return rhs()
		end
		if type(rhs) == "string" then
			local mode = type(modes) == "table" and modes[1] or modes
			feed_lhs(mode, rhs)
		elseif rhs == nil then
			local mode = type(modes) == "table" and modes[1] or modes
			feed_lhs(mode, lhs)
		end
	end, opts)
end

local function register_eager_keys(spec)
	for _, key in ipairs(list(spec.keys)) do
		register_eager_key(key)
	end
end

local function has_lazy_trigger(spec)
	return spec.event ~= nil or spec.cmd ~= nil or spec.ft ~= nil or spec.keys ~= nil or spec.lazy == true
end

local function register_triggers(spec)
	for _, event in ipairs(list(spec.event)) do
		register_event(spec, event)
	end
	for _, cmd in ipairs(list(spec.cmd)) do
		register_cmd(spec, cmd)
	end
	for _, ft in ipairs(list(spec.ft)) do
		register_event(spec, "FileType " .. ft)
	end
	for _, key in ipairs(list(spec.keys)) do
		register_key(spec, key)
	end
end

local function setup_very_lazy()
	vim.api.nvim_create_autocmd("VimEnter", {
		group = group,
		once = true,
		callback = function()
			vim.schedule(function()
				vim.api.nvim_exec_autocmds("User", { pattern = "VeryLazy" })
			end)
		end,
		desc = "Fire VeryLazy",
	})
end

function M.build_hooks()
	return vim.deepcopy(build_hooks)
end

local function run_shell_build(spec, command)
	local result = vim.system({ vim.o.shell, vim.o.shellcmdflag, command }, {
		cwd = plugin_dir(spec),
		text = true,
	}):wait()

	if result.stdout and result.stdout ~= "" then
		io.stdout:write(result.stdout)
		if not result.stdout:match("\n$") then
			io.stdout:write("\n")
		end
	end
	if result.stderr and result.stderr ~= "" then
		io.stderr:write(result.stderr)
		if not result.stderr:match("\n$") then
			io.stderr:write("\n")
		end
	end
	if result.code ~= 0 then
		error("Build failed for " .. spec.name .. " with exit code " .. result.code)
	end
end

local function run_build(spec)
	if not spec.build then
		return
	end

	io.stdout:write("Building " .. spec.name .. "\n")
	io.stdout:flush()
	if type(spec.build) == "string" then
		run_shell_build(spec, spec.build)
	elseif type(spec.build) == "function" then
		if spec.dir then
			add_local_dir(spec)
		else
			vim.cmd.packadd(spec.name)
		end
		spec.build()
	end
end

function M.build_hook_names()
	local selected = vim.tbl_keys(build_hooks)
	table.sort(selected)
	return selected
end

function M.print_build_hook_names()
	for _, name in ipairs(M.build_hook_names()) do
		io.stdout:write(name .. "\n")
	end
	io.stdout:flush()
end

function M.run_build_hooks(names)
	local selected = names and list(names) or M.build_hook_names()

	for _, name in ipairs(selected) do
		local spec = by_name[name] or specs[name]
		if spec then
			run_build(spec)
		end
	end
end

function M.setup(imports)
	import_specs(imports)

	local install = {}
	local ordered = ordered_specs()
	for _, spec in ipairs(ordered) do
		by_name[spec.name] = spec
		if spec.build then
			build_hooks[spec.name] = spec.build
		end
	end

	if vim.env.NVIM_BUILD_HOOKS == "1" then
		return
	end

	for _, spec in ipairs(ordered) do
		add_local_dir(spec)
		local item = pack_spec(spec)
		if item then
			table.insert(install, item)
		end
	end

	if #install > 0 then
		vim.pack.add(install)
	end

	for _, spec in ipairs(ordered) do
		if spec.init then
			spec.init()
		end
	end

	setup_very_lazy()

	for _, spec in ipairs(ordered) do
		if has_lazy_trigger(spec) and spec.lazy ~= false then
			register_triggers(spec)
		else
			M.load(spec.name)
			register_eager_keys(spec)
		end
	end
end

return M
