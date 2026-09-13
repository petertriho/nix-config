local M = {}

local config_dir = vim.fn.stdpath("config")
local group = vim.api.nvim_create_augroup("LazyPack", { clear = true })

local specs = {}
local by_name = {}
local loaded = {}
local plugins_sourced = {}
local loading = {}
local build_hooks = {}
local module_loaders = {}
local lazy_module_searcher
local rtp_seen = {}

local function list(value)
	if value == nil then
		return {}
	end
	if type(value) == "table" then
		return value
	end
	return { value }
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
	local enabled = spec.enabled
	if type(enabled) == "function" then
		local ok, result = pcall(enabled)
		if not ok then
			vim.notify("lazypack: enabled() failed: " .. tostring(result), vim.log.levels.WARN)
			return false
		end
		if result == false or result == nil then
			return false
		end
	elseif enabled == false then
		return false
	end
	if type(spec.cond) == "function" then
		local ok, result = pcall(spec.cond)
		if not ok then
			vim.notify("lazypack: cond() failed: " .. tostring(result), vim.log.levels.WARN)
			return false
		end
		if not result then
			return false
		end
	elseif spec.cond == false then
		return false
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
	elseif existing._dep and is_dependency then
		for _, dep in ipairs(spec.dependencies or {}) do
			-- avoid duplicates
			local found = false
			for _, d in ipairs(existing.dependencies or {}) do
				if d == dep then
					found = true
					break
				end
			end
			if not found then
				table.insert(existing.dependencies, dep)
			end
		end
	elseif not existing._dep and not is_dependency then
		vim.notify("lazypack: duplicate spec for " .. spec.name .. " (keeping first)", vim.log.levels.WARN)
	end
	-- full existing + stub new: do nothing (existing wins), correct
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
	if spec[1] ~= nil then
		spec[1] = nil
	end

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
					error(child_mod, 0)
				end
				table.insert(mod, child_mod)
			end
		else
			local ok
			ok, mod = pcall(require, module)
			if not ok then
				error(mod, 0)
			end
		end

		if mod == nil then
			error("lazypack: expected spec table from import " .. tostring(module) .. ", got nil", 0)
		end
		local modules = is_spec(mod) and { mod } or mod
		if type(modules) ~= "table" then
			error("lazypack: expected spec table from import " .. tostring(module) .. ", got " .. type(modules), 0)
		end
		for _, raw in ipairs(modules) do
			local raw_specs = is_spec(raw) and { raw } or raw
			for _, raw_spec in ipairs(raw_specs) do
				if type(raw_spec) == "table" and raw_spec.import then
					import_specs({ raw_spec })
				else
					local spec = normalize(raw_spec)
					if spec then
						register_spec(spec, false)
					elseif type(raw_spec) == "table" and next(raw_spec) ~= nil then
						-- Only warn for truly invalid entries. Specs disabled via
						-- enabled/cond also normalize to nil but must stay silent.
						local has_identity = type(raw_spec[1]) == "string"
							or raw_spec.src
							or raw_spec.url
							or raw_spec.dir
							or raw_spec.name
						if not has_identity then
							vim.notify("lazypack: ignoring invalid spec", vim.log.levels.WARN)
						end
					end
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
		local chain = {}
		for k, _ in pairs(visiting) do
			table.insert(chain, k)
		end
		table.sort(chain)
		error("dependency cycle involving " .. name .. " (in: " .. table.concat(chain, ", ") .. ")")
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
	-- vim.pack.add uses version for tag/branch/commit.
	item.version = spec.version or spec.tag or spec.branch
	return item
end

local function plugin_dir(spec)
	if spec._dir then
		return spec._dir
	end

	local dir
	if spec.dir then
		dir = expand_path(spec.dir)
	else
		local pack_root = vim.fn.stdpath("data") .. "/site/pack/core"
		dir = pack_root .. "/opt/" .. spec.name
		for _, kind in ipairs({ "opt", "start" }) do
			local candidate = pack_root .. "/" .. kind .. "/" .. spec.name
			if vim.fn.isdirectory(candidate) == 1 then
				dir = candidate
				break
			end
		end
	end
	spec._dir = dir
	return dir
end

local function nvim_lib_dir()
	local lib = vim.fn.fnamemodify(vim.v.progpath, ":p:h:h") .. "/lib"
	if vim.uv.fs_stat(lib .. "64") then
		lib = lib .. "64"
	end
	return lib .. "/nvim"
end

local rtp_insert_pos = 2

local function reset_paths()
	-- Do not clobber packpath: vim.pack.add uses it for install location.
	-- Only reset rtp.
	local paths = {
		config_dir,
		vim.fn.stdpath("data") .. "/site",
		vim.env.VIMRUNTIME,
		nvim_lib_dir(),
		config_dir .. "/after",
	}
	vim.opt.rtp = paths
	rtp_seen = {}
	for _, path in ipairs(paths) do
		rtp_seen[vim.fs.normalize(path)] = true
	end
	rtp_insert_pos = 2
end

local function prepend_runtime_dir(dir)
	local normalized = vim.fs.normalize(dir)
	if rtp_seen[normalized] then
		return
	end
	-- Single-insert path for runtime lazy loads (rare). Startup uses
	-- batch_insert_runtime_dirs below to avoid one option update per plugin.
	local rtp = vim.opt.rtp:get()
	if rtp_insert_pos < 2 then
		rtp_insert_pos = 2
	end
	if rtp_insert_pos > #rtp + 1 then
		rtp_insert_pos = #rtp + 1
	end
	table.insert(rtp, rtp_insert_pos, dir)
	vim.opt.rtp = rtp
	rtp_seen[normalized] = true
	rtp_insert_pos = rtp_insert_pos + 1
end

-- Insert many plugin dirs with a single option update. Preserves order:
-- dirs[1] ends up closest to config_dir. Marks entries seen so later
-- per-plugin prepends become hash-only no-ops.
local function batch_insert_runtime_dirs(dirs)
	local to_add = {}
	for _, dir in ipairs(dirs) do
		local normalized = vim.fs.normalize(dir)
		if not rtp_seen[normalized] then
			rtp_seen[normalized] = true
			table.insert(to_add, dir)
		end
	end
	if #to_add == 0 then
		return
	end
	local rtp = vim.opt.rtp:get()
	for i = #to_add, 1, -1 do
		table.insert(rtp, 2, to_add[i])
	end
	vim.opt.rtp = rtp
	rtp_insert_pos = 2 + #to_add
end

local function source_runtime_files(dir, patterns)
	local root = vim.fs.normalize(dir)
	local root_prefix = root .. "/"
	local sourced = {}

	for _, pattern in ipairs(patterns) do
		local files = vim.fn.globpath(root, pattern, true, true)
		table.sort(files)
		for _, file in ipairs(files) do
			local normalized = vim.fs.normalize(file)
			if not sourced[normalized] and vim.startswith(normalized, root_prefix) then
				sourced[normalized] = true
				vim.cmd.source(vim.fn.fnameescape(file))
			end
		end
	end
end

-- NOTE: after/plugin sourcing is per-plugin and immediate (each plugin's
-- plugin/ and after/ files are sourced together at load time). This differs
-- from Vim's two-phase order (all plugin/ first, then all after/plugin/).
-- TODO: consider a two-phase pass for eager plugins; kept as-is for now to
-- avoid regression risk.
local plugin_patterns = {
	"plugin/**/*.vim",
	"plugin/**/*.lua",
	"ftdetect/*.vim",
	"ftdetect/*.lua",
	"after/plugin/**/*.vim",
	"after/plugin/**/*.lua",
	"after/ftdetect/*.vim",
	"after/ftdetect/*.lua",
}

local function source_plugin_files(spec)
	local dir = plugin_dir(spec)
	if vim.fn.isdirectory(dir) ~= 1 then
		return
	end
	source_runtime_files(dir, plugin_patterns)
end

local function add_plugin_runtime(spec, opts)
	local dir = plugin_dir(spec)
	-- Use cached existence from startup batch when available (saves a stat).
	local exists = spec._dir_exists
	if exists == nil then
		exists = vim.fn.isdirectory(dir) == 1
	end
	if exists ~= true then
		if spec.dir then
			vim.notify("Local plugin directory does not exist: " .. dir, vim.log.levels.WARN)
		end
		return
	end

	prepend_runtime_dir(dir)

	if not opts or opts.plugins ~= false then
		source_runtime_files(dir, plugin_patterns)
	end
end

-- Resolve the module whose `.setup()` should be called, mirroring lazy.nvim's
-- `get_main`: scan the plugin's top-level `lua/` modules and pick the one whose
-- normalized name matches the plugin's. This handles repos whose module name
-- differs from the repo name (e.g. chrisgrieser/nvim-lsp-endhints exposes
-- `require("lsp-endhints")`). Resolved lazily at load time, when the plugin is
-- guaranteed to be on disk. Falls back to the source heuristic, then the name.
local function find_main(spec, lua_dir)
	local lua = lua_dir
	if lua == nil then
		lua = plugin_dir(spec) .. "/lua"
		if vim.fn.isdirectory(lua) ~= 1 then
			return (spec.src and source_to_main(spec.src)) or spec.name
		end
	end
	-- When lua_dir is passed, the caller (cached_main) already verified it
	-- exists. Call readdir directly: pcall would still leak E484 messages
	-- for missing dirs even while catching the error.
	local target = normname(spec.name)
	local entries = vim.fn.readdir(lua)
	if type(entries) == "table" then
		table.sort(entries)
		for _, entry in ipairs(entries) do
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
	local dir = plugin_dir(spec) -- memoized expand_path
	local exists = spec._dir_exists
	if exists == nil then
		exists = vim.fn.isdirectory(dir) == 1
	end
	if exists == true then
		prepend_runtime_dir(dir)
	else
		vim.notify("Local plugin directory does not exist: " .. dir, vim.log.levels.WARN)
	end
end

local function cached_main(spec)
	if spec._main_resolved then
		return spec._main
	end
	local lua = plugin_dir(spec) .. "/lua"
	if vim.fn.isdirectory(lua) == 1 then
		spec._main = find_main(spec, lua)
		spec._main_resolved = true
		return spec._main
	end
	-- No lua/ dir (vim-only plugins like vim-abolish): return the heuristic
	-- directly. Never call readdir on a missing dir; even pcall leaks E484.
	return (spec.src and source_to_main(spec.src)) or spec.name
end

local function setup_plugin(spec)
	local opts = spec.opts
	if type(opts) == "function" then
		opts = opts(spec)
	end

	if type(spec.config) == "function" then
		spec.config(spec, opts)
	elseif spec.config == true or opts then
		require(spec.main or cached_main(spec)).setup(opts or {})
	end
end

local function module_candidates(spec)
	if spec._main_resolved and spec._module_candidates then
		return spec._module_candidates
	end

	local candidates = {}
	local seen = {}

	local function add(module)
		if type(module) ~= "string" or module == "" or seen[module] then
			return
		end
		seen[module] = true
		table.insert(candidates, module)
	end

	if spec.module ~= false then
		add(spec.main)
		add(cached_main(spec))
		if spec.src then
			add(source_to_main(spec.src))
		end
		add(spec.name)
	end

	spec._module_candidates = nil
	if spec._main_resolved then
		spec._module_candidates = candidates
	end
	return candidates
end

local function resolve_loaded_module(module)
	local searchers = package.searchers or package.loaders
	for _, searcher in ipairs(searchers) do
		if searcher ~= lazy_module_searcher then
			local loader, param = searcher(module)
			if type(loader) == "function" then
				return function(...)
					if package.loaded[module] == true then
						package.loaded[module] = nil
					end
					return loader(...)
				end, param
			end
		end
	end

	return "\n\tlazy-loaded plugin for module '" .. module .. "', but the module was not found"
end

lazy_module_searcher = function(module)
	local root = module:match("^[^%.]+")
	local name = module_loaders[module] or module_loaders[root]
	if not name then
		return nil
	end
	if loading[name] then
		return nil
	end

	local module_loading = package.loaded[module] == true
	if module_loading then
		package.loaded[module] = nil
	end

	local ok, err = pcall(M.load, name, { plugins = false })
	if not ok then
		if module_loading and package.loaded[module] == nil then
			package.loaded[module] = true
		end
		error(err)
	end

	if package.loaded[module] ~= nil and package.loaded[module] ~= true then
		local loaded_module = package.loaded[module]
		return function()
			return loaded_module
		end
	end

	local loader, param = resolve_loaded_module(module)
	if type(loader) ~= "function" then
		return loader
	end

	if package.loaded[module] == true then
		package.loaded[module] = nil
	end
	local result = loader(module, param)
	if result ~= nil then
		package.loaded[module] = result
	end

	if package.loaded[module] ~= nil and package.loaded[module] ~= true then
		local loaded_module = package.loaded[module]
		return function()
			return loaded_module
		end
	end

	return function()
		return result
	end
end

local function register_module_searcher()
	local searchers = package.searchers or package.loaders
	for index = #searchers, 1, -1 do
		if searchers[index] == lazy_module_searcher then
			table.remove(searchers, index)
		end
	end
	table.insert(searchers, 2, lazy_module_searcher)
end

local function register_module_triggers(spec)
	for _, module in ipairs(module_candidates(spec)) do
		module_loaders[module] = spec.name
	end
	spec._has_module_triggers = true
end

local function suspend_module_triggers(spec)
	local suspended = {}
	for _, module in ipairs(module_candidates(spec)) do
		suspended[module] = module_loaders[module]
		module_loaders[module] = nil
	end
	return suspended
end

local function restore_module_triggers(suspended)
	for module, name in pairs(suspended) do
		module_loaders[module] = name
	end
end

function M.load(name, opts)
	local spec = by_name[name] or specs[name]
	if not spec then
		vim.notify("lazypack: unknown plugin " .. tostring(name), vim.log.levels.WARN)
		return
	end

	local wants_plugins = not opts or opts.plugins ~= false

	if loaded[spec.name] then
		if wants_plugins and not plugins_sourced[spec.name] then
			for _, dep in ipairs(spec.dependencies or {}) do
				M.load(dep, opts)
			end
			-- No trigger suspend here: sourcing plugin files does not need
				-- module candidates (avoids a lua/ readdir per call). The
				-- loading[] guard in the searcher already prevents re-entry.
				local ok, err = pcall(source_plugin_files, spec)
			if not ok then
				error(err)
			end
			plugins_sourced[spec.name] = true
		end
		return
	end

	for _, dep in ipairs(spec.dependencies or {}) do
		M.load(dep, opts)
	end

	loaded[spec.name] = true
	loading[spec.name] = true
	-- Only specs with registered module triggers need suspend (avoids a
	-- lua/ readdir for every eager plugin via module_candidates).
	local suspended = spec._has_module_triggers and suspend_module_triggers(spec) or nil
	local ok, err = pcall(function()
		add_plugin_runtime(spec, opts)
		setup_plugin(spec)
	end)
	if suspended then
		restore_module_triggers(suspended)
	end
	loading[spec.name] = nil
	if not ok then
		loaded[spec.name] = nil
		error(err)
	end
	if wants_plugins then
		plugins_sourced[spec.name] = true
	end
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
	local event_name, pattern = nil, nil
	if type(event) == "table" then
		event_name = event.event or event[1]
		pattern = event.pattern or event[2]
		-- Allow "VeryLazy" and "Event pattern" shorthands inside table form.
		if pattern == nil and type(event_name) == "string" then
			event_name, pattern = parse_event(event_name)
		elseif event_name == "VeryLazy" then
			event_name, pattern = "User", "VeryLazy"
		end
	else
		event_name, pattern = parse_event(event)
	end
	if type(event_name) == "table" then
		-- Multi-event table form: { event = { "BufRead", "BufNewFile" }, pattern = ... }.
		for _, name in ipairs(event_name) do
			if type(name) == "string" then
				register_event(spec, { event = name, pattern = pattern })
			else
				vim.notify("lazypack: invalid event for " .. spec.name, vim.log.levels.WARN)
				return
			end
		end
		return
	end
	if type(event_name) ~= "string" then
		vim.notify("lazypack: invalid event for " .. spec.name, vim.log.levels.WARN)
		return
	end
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

-- Command shim: registered with generic complete=file, nargs=*, range=true
-- placeholders; the real command's own completion/validation applies after
-- the first invocation loads the plugin and replays the command.
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
	local remap = key.remap
	if remap == nil and key.noremap ~= nil then
		remap = key.noremap == false
	end
	return {
		desc = key.desc,
		remap = remap,
		silent = key.silent ~= false,
		expr = key.expr,
		nowait = key.nowait,
		replace_keycodes = key.replace_keycodes,
		buffer = key.buffer,
		script = key.script,
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
		local mode = type(modes) == "table" and modes[1] or modes
		feed_lhs(mode, lhs)
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

-- Normalize spec.event into a list of single event items (string or table form).
-- Distinguishes a single table-form event { event=..., pattern=... } or
-- { "Event", "pattern" } from a list of events.
local function event_items(value)
	if value == nil then
		return {}
	end
	if type(value) == "string" then
		return { value }
	end
	if type(value) ~= "table" then
		return {}
	end
	if value.event ~= nil then
		return { value }
	end
	-- Positional single pair { "Event", "pattern" }: the pattern looks like a
	-- glob/path (contains *, ?, ., /), while a list of two events does not.
	if type(value[1]) == "string" and type(value[2]) == "string" and #value == 2 and value[2]:find("[*?%.%/]") then
		return { value }
	end
	return value
end

local function register_triggers(spec)
	for _, event in ipairs(event_items(spec.event)) do
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
	local function fire()
		vim.schedule(function()
			vim.api.nvim_exec_autocmds("User", { pattern = "VeryLazy" })
		end)
	end
	if vim.v.vim_did_enter ~= 0 then
		fire()
		return
	end
	vim.api.nvim_create_autocmd("VimEnter", {
		group = group,
		once = true,
		callback = fire,
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
		add_plugin_runtime(spec, { plugins = false })
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
		else
			vim.notify("lazypack: unknown plugin " .. tostring(name), vim.log.levels.WARN)
		end
	end
end

function M.setup(imports)
	specs = {}
	by_name = {}
	loaded = {}
	loading = {}
	build_hooks = {}
	module_loaders = {}
	plugins_sourced = {}
	reset_paths()
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
		local item = pack_spec(spec)
		if item then
			table.insert(install, item)
		end
	end

	-- Pre-seed rtp in one option update (fast path) after install, so fresh
	-- clones are on disk and included. Later per-plugin prepends become
	-- hash-only no-ops via rtp_seen. Order follows `ordered`.
	if #install > 0 then
		vim.pack.add(install, { load = function() end })
		-- Install may have created dirs; drop memoized fallback paths so
		-- re-resolution picks the real opt/start location.
		for _, spec in ipairs(ordered) do
			spec._dir = nil
		end
	end

	do
		local rtp_batch = {}
		for _, spec in ipairs(ordered) do
			-- Mirror startup rtp behavior: dir specs (add_local_dir adds all)
			-- plus eager remote specs (added by M.load). Do NOT include lazy
			-- remote specs: pre-seeding them lets Vim's "loading rtp plugins"
			-- phase source their plugin/ files at startup, defeating laziness.
			local eager = not spec._dep and not (has_lazy_trigger(spec) and spec.lazy ~= false)
			if spec.dir or eager then
				local dir = plugin_dir(spec)
				local exists = vim.fn.isdirectory(dir) == 1
				spec._dir_exists = exists
				if exists then
					table.insert(rtp_batch, dir)
				end
			end
		end
		batch_insert_runtime_dirs(rtp_batch)
	end

	for _, spec in ipairs(ordered) do
		add_local_dir(spec)
	end

	for _, spec in ipairs(ordered) do
		if spec.init then
			spec.init()
		end
	end

	setup_very_lazy()
	register_module_searcher()

	for _, spec in ipairs(ordered) do
		if spec._dep then
			-- Dependency stubs are installed and loaded through their parent specs.
		elseif has_lazy_trigger(spec) and spec.lazy ~= false then
			-- Register module triggers for every lazy plugin, not just `lazy = true`
			-- ones. A plugin lazy-loaded by cmd/keys/ft/event can still be pulled in
			-- when another plugin `require`s one of its submodules -- e.g. neogit's
			-- `diff_viewer = "codediff"` integration does `require("codediff.core.git")`
			-- before any CodeDiff command or key has run. Mapping each plugin's main
			-- module to its spec lets the module searcher load it on demand, matching
			-- lazy.nvim where any lazy plugin is loadable via require of one of its
			-- modules (the searcher keys on the root module, so submodules resolve too).
			register_module_triggers(spec)
			register_triggers(spec)
		else
			-- Existence was recorded during batch pre-seed (no syscall here).
			-- Fall back to a live check only when the flag is absent
			-- (e.g. specs created after batch, which does not happen at
				-- startup but keeps the guard correct if reused later).
			local dir_ok = spec._dir_exists
			if dir_ok == nil then
				dir_ok = vim.fn.isdirectory(plugin_dir(spec)) == 1
			end
			if not dir_ok then
				if not spec.dir then
					vim.notify("lazypack: missing plugin, restart after install: " .. spec.name, vim.log.levels.WARN)
				end
			end
			if dir_ok then
				M.load(spec.name)
			end
			register_eager_keys(spec)
		end
	end
end

return M
