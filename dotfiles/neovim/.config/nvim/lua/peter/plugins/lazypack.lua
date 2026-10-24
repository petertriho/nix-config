local M = {}

local config_dir = vim.fn.stdpath("config")
-- vim.pack installs every plugin in this folder.
local pack_dir = vim.fn.stdpath("data") .. "/site/pack/core/opt"
local group = vim.api.nvim_create_augroup("LazyPack", { clear = true })

local specs = {}
local loaded = {}
local loading = {}
local build_hooks = {}
local module_loaders = {}
local lazy_names = {}
local missing_modules = {}
local sourced_files = {}
local lazy_module_searcher
local lazy_module_fallback
local base_paths = {}
local rtp_seen = {}
local rtp_insert_pos = 2

local function list(value)
	if value == nil then
		return {}
	end
	if type(value) == "table" then
		return value
	end
	return { value }
end

-- Run `fn` and report an error instead of raising it, so that one broken
-- plugin does not stop the rest of startup.
local function try(fn, msg, ...)
	local ok, err = pcall(fn, ...)
	if not ok then
		vim.notify("lazypack: " .. msg .. ": " .. tostring(err), vim.log.levels.ERROR)
	end
	return ok
end

local function basename(src)
	local name = src:gsub("%.git$", ""):match("([^/]+)$") or src
	return name
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

local function merge_dependencies(target, source)
	for _, dep in ipairs(source.dependencies) do
		if not vim.list_contains(target.dependencies, dep) then
			table.insert(target.dependencies, dep)
		end
	end
end

-- Copy the fields of `source` that `target` does not set. Internal `_` fields
-- stay with their own spec.
local function fill_missing(target, source)
	for key, value in pairs(source) do
		if target[key] == nil and not (type(key) == "string" and vim.startswith(key, "_")) then
			target[key] = value
		end
	end
end

-- Register a spec under its name and merge it with an existing entry.
--
-- A spec in another plugin's `dependencies` is a stub. The dedicated spec file
-- is authoritative, so a full spec wins over a stub, in either order. For
-- example, on-idle depends on nvim-lspconfig, and that stub must not hide the
-- `event` and `config` of the real nvim-lspconfig spec. Like lazy.nvim's spec
-- merge, the stub adds its dependencies and fills the fields that the full
-- spec does not set.
local function register_spec(spec, is_dependency)
	local existing = specs[spec.name]
	if not existing then
		spec._dep = is_dependency or nil
		specs[spec.name] = spec
		return
	end
	if not existing._dep and not is_dependency then
		vim.notify("lazypack: duplicate spec for " .. spec.name .. " (keeping first)", vim.log.levels.WARN)
		return
	end

	local full, stub = existing, spec
	if existing._dep and not is_dependency then
		full, stub = spec, existing
	end
	merge_dependencies(full, stub)
	fill_missing(full, stub)
	specs[spec.name] = full
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
	local name = raw.name or (dir and basename(dir)) or (src and basename(src))
	if not name then
		return nil
	end

	local spec = vim.tbl_extend("force", raw, {
		src = src,
		name = name,
		dependencies = {},
	})
	spec[1] = nil

	for _, dep in ipairs(list(raw.dependencies)) do
		local normalized = normalize(dep)
		if normalized then
			table.insert(spec.dependencies, normalized.name)
			register_spec(normalized, true)
		end
	end

	return spec
end

-- List the .lua files of an import folder. Spec modules can only come from the
-- base rtp folders, because no plugin folder is on rtp yet. A direct scan is
-- much faster than nvim_get_runtime_file().
local function spec_files(dir)
	local files = {}
	for _, path in ipairs(base_paths) do
		local root = path .. "/lua/" .. dir
		local handle = vim.uv.fs_scandir(root)
		while handle do
			local name = vim.uv.fs_scandir_next(handle)
			if not name then
				break
			end
			if name:sub(-4) == ".lua" then
				table.insert(files, root .. "/" .. name)
			end
		end
	end
	table.sort(files)
	return files
end

local function import_specs(imports)
	for _, import in ipairs(imports) do
		local module = import.import or import
		local dir = module:gsub("%.", "/")
		local files = spec_files(dir)

		local mod
		if #files > 0 then
			mod = {}
			for _, file in ipairs(files) do
				local stem = vim.fn.fnamemodify(file, ":t:r")
				table.insert(mod, require(stem == "init" and module or (module .. "." .. stem)))
			end
		else
			mod = require(module)
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
		for _, dep in ipairs(spec.dependencies) do
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

	-- vim.pack.add takes a ref name (commit, tag, or branch) or a
	-- vim.VersionRange. Like lazy.nvim, `version` is a semver range. A string
	-- that is not a range stays a ref name.
	local version = spec.commit or spec.tag
	if version == nil and type(spec.version) == "string" then
		version = vim.version.range(spec.version) or spec.version
	end
	return { src = source_to_url(spec.src), name = spec.name, version = version or spec.branch }
end

local function plugin_dir(spec)
	if spec._dir then
		return spec._dir
	end

	spec._dir = spec.dir and expand_path(spec.dir) or (pack_dir .. "/" .. spec.name)
	return spec._dir
end

local function dir_exists(spec)
	if spec._dir_exists == nil then
		spec._dir_exists = vim.fn.isdirectory(plugin_dir(spec)) == 1
	end
	return spec._dir_exists
end

local function nvim_lib_dir()
	local lib = vim.fn.fnamemodify(vim.v.progpath, ":p:h:h") .. "/lib"
	if vim.uv.fs_stat(lib .. "64") then
		lib = lib .. "64"
	end
	return lib .. "/nvim"
end

local function reset_paths()
	-- Like lazy.nvim's `reset_packpath`. After each rtp change, Neovim rebuilds
	-- its runtime search path and scans `pack/*/start/*` in each packpath
	-- entry, and $XDG_DATA_DIRS adds dozens of entries. Keep the vim.pack
	-- folder (`:packadd` needs it) and the `pack/dist/opt` plugins of
	-- $VIMRUNTIME.
	vim.go.packpath = vim.fn.stdpath("data") .. "/site," .. vim.env.VIMRUNTIME
	base_paths = {
		config_dir,
		vim.fn.stdpath("data") .. "/site",
		vim.env.VIMRUNTIME,
		nvim_lib_dir(),
		config_dir .. "/after",
	}
	vim.opt.rtp = base_paths
	rtp_seen = {}
	for _, path in ipairs(base_paths) do
		rtp_seen[vim.fs.normalize(path)] = true
	end
	rtp_insert_pos = 2
end

-- Insert plugin folders into rtp with one option update. Plugin folders go
-- after config_dir, in load order. Their after/ folders go just before
-- config_dir/after, so the user's after/ files still come last. Marks entries
-- seen so later inserts of the same folder are hash-only no-ops.
local function add_runtime_dirs(dirs)
	local new_dirs, new_after = {}, {}
	for _, dir in ipairs(dirs) do
		local normalized = vim.fs.normalize(dir)
		if not rtp_seen[normalized] then
			rtp_seen[normalized] = true
			table.insert(new_dirs, dir)
			local after = normalized .. "/after"
			if not rtp_seen[after] and vim.fn.isdirectory(after) == 1 then
				rtp_seen[after] = true
				table.insert(new_after, after)
			end
		end
	end
	if #new_dirs == 0 then
		return
	end

	local rtp = vim.opt.rtp:get()
	local pos = math.min(math.max(rtp_insert_pos, 2), #rtp + 1)
	for i, dir in ipairs(new_dirs) do
		table.insert(rtp, pos + i - 1, dir)
	end
	rtp_insert_pos = pos + #new_dirs

	if #new_after > 0 then
		local user_after = vim.fs.normalize(config_dir .. "/after")
		local after_pos = #rtp + 1
		for i, path in ipairs(rtp) do
			if vim.fs.normalize(path) == user_after then
				after_pos = i
				break
			end
		end
		for i, after in ipairs(new_after) do
			table.insert(rtp, after_pos + i - 1, after)
		end
	end
	vim.opt.rtp = rtp
end

-- Put the plugin folder on rtp. Return false when the folder is missing.
local function add_to_rtp(spec)
	if not dir_exists(spec) then
		if spec.dir then
			vim.notify("Local plugin directory does not exist: " .. plugin_dir(spec), vim.log.levels.WARN)
		end
		return false
	end
	add_runtime_dirs({ plugin_dir(spec) })
	return true
end

-- Source each file at most once. The base rtp folders and `dir` specs can
-- overlap, for example a spec with `dir = config_dir`. Callers pass paths
-- below a normalized root, so equal files have equal keys.
local function source_file(file)
	if not sourced_files[file] then
		sourced_files[file] = true
		vim.cmd.source(vim.fn.fnameescape(file))
	end
end

-- List the .vim and .lua files in `root/sub`, and in its subfolders when
-- `deep` is set. Like `:runtime! sub/**/*.{vim,lua}`, the .vim files come
-- first, and each group is sorted. A direct scan is about 3x faster than
-- globpath() for each pattern.
local function runtime_files(root, sub, deep)
	local found = { vim = {}, lua = {} }
	local function scan(dir, depth)
		local handle = vim.uv.fs_scandir(dir)
		while handle do
			local name, kind = vim.uv.fs_scandir_next(handle)
			if not name then
				break
			end
			-- Like glob `*`, skip hidden files and folders.
			if name:sub(1, 1) ~= "." then
				local path = dir .. "/" .. name
				if kind == nil or kind == "link" then
					local stat = vim.uv.fs_stat(path)
					kind = stat and stat.type
				end
				if kind == "directory" and deep and depth < 30 then
					scan(path, depth + 1)
				elseif kind == "file" then
					local files = found[name:match("%.(%w+)$")]
					if files then
						table.insert(files, path)
					end
				end
			end
		end
	end
	scan(vim.fs.normalize(root) .. "/" .. sub, 1)
	table.sort(found.vim)
	table.sort(found.lua)
	return vim.list_extend(found.vim, found.lua)
end

-- NOTE: after/plugin sourcing is per-plugin and immediate (each plugin's
-- plugin/ and after/ files are sourced together at load time). This differs
-- from Vim's two-phase order (all plugin/ first, then all after/plugin/).
-- TODO: consider a two-phase pass for eager plugins; kept as-is for now to
-- avoid regression risk.
local function source_runtime_plugins(root)
	for _, file in ipairs(runtime_files(root, "plugin", true)) do
		source_file(file)
	end
end

-- Source the plugin/ and ftdetect/ files of a plugin folder, then of its
-- after/ folder, in the order that :packadd uses. ftdetect/ files go in the
-- filetypedetect group, like the ftdetect/ files that filetype.lua sources.
local function source_plugin_files(dir)
	for _, root in ipairs({ dir, dir .. "/after" }) do
		source_runtime_plugins(root)
		local ftdetect = runtime_files(root, "ftdetect", false)
		if #ftdetect > 0 then
			vim.cmd("augroup filetypedetect")
			local ok, err = pcall(function()
				for _, file in ipairs(ftdetect) do
					source_file(file)
				end
			end)
			vim.cmd("augroup END")
			if not ok then
				error(err, 0)
			end
		end
	end
end

-- Source the plugin/ files of the base rtp folders, like Vim's startup does
-- when 'loadplugins' is on: first the normal folders, then the after/ folders.
local function source_base_plugins()
	for _, after in ipairs({ false, true }) do
		for _, path in ipairs(base_paths) do
			if vim.endswith(path, "/after") == after then
				try(source_runtime_plugins, "failed to source " .. path .. "/plugin", path)
			end
		end
	end
end

-- Resolve the module whose `.setup()` should be called, mirroring lazy.nvim's
-- `get_main`: scan the plugin's top-level `lua/` modules and pick the one whose
-- normalized name matches the plugin's. This handles repos whose module name
-- differs from the repo name (e.g. chrisgrieser/nvim-lsp-endhints exposes
-- `require("lsp-endhints")`). Resolved after install, when the plugin is on
-- disk, and cached on the spec. Falls back to the source heuristic, then the
-- name.
local function find_main(spec)
	if spec._main == nil then
		spec._main = (spec.src and source_to_main(spec.src)) or spec.name
		-- fs_scandir() returns nil for a missing lua/ folder (vim-only plugins).
		local handle = vim.uv.fs_scandir(plugin_dir(spec) .. "/lua")
		local entries = {}
		while handle do
			local entry = vim.uv.fs_scandir_next(handle)
			if not entry then
				break
			end
			table.insert(entries, entry)
		end
		table.sort(entries)
		local target = normname(spec.name)
		for _, entry in ipairs(entries) do
			local mod = entry:gsub("%.lua$", "")
			if normname(mod) == target then
				spec._main = mod
				break
			end
		end
	end
	return spec._main
end

-- Like lazy.nvim: an `opts` function gets `(plugin, opts)` and can change the
-- table instead of returning one. `config` gets `{}` when there are no `opts`,
-- and `config = false` skips setup.
local function setup_plugin(spec)
	if spec.config == false or (spec.config == nil and spec.opts == nil) then
		return
	end

	local opts = spec.opts
	if type(opts) == "function" then
		local base = {}
		opts = opts(spec, base) or base
	end
	opts = opts or {}

	if type(spec.config) == "function" then
		spec.config(spec, opts)
	else
		require(spec.main or find_main(spec)).setup(opts)
	end
end

local function module_candidates(spec)
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
		-- A remote plugin is off rtp until it loads, so `lazy_module_fallback`
		-- finds its other modules. A `dir` plugin is on rtp from startup, and
		-- vim.loader would find its modules first.
		if spec.dir then
			add(find_main(spec))
		end
		if spec.src then
			add(source_to_main(spec.src))
		end
		add(spec.name)
	end

	return candidates
end

lazy_module_searcher = function(module)
	local name = module_loaders[module] or module_loaders[module:match("^[^%.]+")]
	-- While a plugin loads, its own requires use the normal searchers.
	if not name or loading[name] then
		return nil
	end

	M.load(name)

	-- The load can require the module itself, for example in `config`.
	local value = package.loaded[module]
	if value ~= nil then
		return function()
			return value
		end
	end

	-- Search again without the lazypack searchers, now that the plugin is on
	-- rtp.
	for _, searcher in ipairs(package.searchers or package.loaders) do
		if searcher ~= lazy_module_searcher and searcher ~= lazy_module_fallback then
			local loader = searcher(module)
			if type(loader) == "function" then
				return loader
			end
		end
	end
	return "\n\tlazy-loaded plugin for module '" .. module .. "', but the module was not found"
end

-- Like lazy.nvim, any module of a lazy plugin loads the plugin. The names in
-- module_loaders cover most requires without disk access at startup. This
-- searcher runs after all others and finds the other modules on disk, for
-- example `lsp-endhints` in nvim-lsp-endhints. It remembers misses, because
-- plugins often probe for optional modules with pcall(require, ...).
lazy_module_fallback = function(module)
	if missing_modules[module] then
		return nil
	end
	local rel = "/lua/" .. module:gsub("%.", "/")
	for _, name in ipairs(lazy_names) do
		local spec = specs[name]
		if not loaded[name] and spec.module ~= false then
			local base = plugin_dir(spec) .. rel
			if vim.uv.fs_stat(base .. ".lua") or vim.uv.fs_stat(base .. "/init.lua") then
				module_loaders[module] = name
				return lazy_module_searcher(module)
			end
		end
	end
	missing_modules[module] = true
end

local function register_module_searcher()
	local searchers = package.searchers or package.loaders
	for index = #searchers, 1, -1 do
		if searchers[index] == lazy_module_searcher or searchers[index] == lazy_module_fallback then
			table.remove(searchers, index)
		end
	end
	table.insert(searchers, 2, lazy_module_searcher)
	table.insert(searchers, lazy_module_fallback)
end

local function register_module_triggers(spec)
	for _, module in ipairs(module_candidates(spec)) do
		module_loaders[module] = spec.name
	end
end

-- Delete the shim only while it is still mapped, for example not again after
-- its own key ran. `:unmap` of a missing lhs removes a mapping whose rhs is
-- that lhs instead, so `<leader>/` with the rhs `gcc` lost its mapping when
-- the `gcc` shim was deleted twice.
local function del_key_shim(key)
	for _, mode in ipairs(list(key.modes)) do
		if vim.fn.maparg(key.lhs, mode, false, true).callback == key.callback then
			vim.keymap.del(mode, key.lhs, { buffer = key.opts.buffer })
		end
	end
end

-- Remove the command and key shims of a plugin when it loads, like lazy.nvim,
-- so that the plugin can define its own commands and mappings without a clash.
local function remove_shims(spec)
	for _, name in ipairs(spec._cmd_shims or {}) do
		-- The shim can already be gone, for example after the command ran.
		pcall(vim.api.nvim_del_user_command, name)
	end
	for _, key in ipairs(spec._key_shims or {}) do
		del_key_shim(key)
	end
end

-- Map the keys that have a `rhs` after the load, so that they win over the
-- default mappings of the plugin.
local function map_keys(spec)
	for _, key in ipairs(spec._key_shims or {}) do
		if key.rhs ~= nil then
			vim.keymap.set(key.modes, key.lhs, key.rhs, key.opts)
		end
	end
end

function M.load(name)
	local spec = specs[name]
	if not spec then
		vim.notify("lazypack: unknown plugin " .. tostring(name), vim.log.levels.WARN)
		return
	end
	if loaded[name] then
		return
	end

	for _, dep in ipairs(spec.dependencies) do
		M.load(dep)
	end

	loaded[name] = true
	loading[name] = true
	local ok, err = pcall(function()
		remove_shims(spec)
		if add_to_rtp(spec) then
			source_plugin_files(plugin_dir(spec))
		end
		setup_plugin(spec)
		map_keys(spec)
	end)
	loading[name] = nil
	if not ok then
		loaded[name] = nil
		error(err, 0)
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

-- Return the autocmd groups that have an autocmd for `event`, as a list in
-- creation order and as a set.
local function augroups_for(event)
	local ids, seen = {}, {}
	for _, autocmd in ipairs(vim.api.nvim_get_autocmds({ event = event })) do
		if autocmd.group and not seen[autocmd.group] then
			seen[autocmd.group] = true
			table.insert(ids, autocmd.group)
		end
	end
	return ids, seen
end

-- Neovim does not run autocmds that are created while their event runs. After
-- the load, run the event again for each autocmd group that the load created,
-- so that the plugin sees the event that loaded it (like lazy.nvim).
local function load_on_event(name, args)
	-- Another trigger of the same plugin can fire after the load.
	if loaded[name] then
		return
	end
	local _, before = augroups_for(args.event)
	M.load(name)

	local opts = { data = args.data, modeline = false, pattern = args.match ~= "" and args.match or nil }
	local function replay()
		for _, id in ipairs((augroups_for(args.event))) do
			if not before[id] then
				opts.group = id
				try(vim.api.nvim_exec_autocmds, "failed to replay " .. args.event .. " for " .. name, args.event, opts)
			end
		end
	end
	if args.buf ~= vim.api.nvim_get_current_buf() and vim.api.nvim_buf_is_valid(args.buf) then
		vim.api.nvim_buf_call(args.buf, replay)
	else
		replay()
	end
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
	if type(event_name) ~= "string" then
		vim.notify("lazypack: invalid event for " .. spec.name, vim.log.levels.WARN)
		return
	end
	vim.api.nvim_create_autocmd(event_name, {
		group = group,
		pattern = pattern,
		once = true,
		callback = function(args)
			load_on_event(spec.name, args)
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

-- Command shim: loads the plugin on the first call or the first completion,
-- then replays the call or returns the completion of the real command. The
-- shim has no `bar` and no file completion, because both make Vim change the
-- arguments before the replay: `"` starts a comment, and `%` and `#` expand to
-- file names.
local function register_cmd(spec, name)
	vim.api.nvim_create_user_command(name, function(args)
		pcall(vim.api.nvim_del_user_command, name)
		M.load(spec.name)
		replay_command(name, args)
	end, {
		bang = true,
		complete = function(_, line)
			pcall(vim.api.nvim_del_user_command, name)
			M.load(spec.name)
			return vim.fn.getcompletion(line, "cmdline")
		end,
		nargs = "*",
		range = true,
		desc = "Load " .. spec.name,
	})
	table.insert(spec._cmd_shims, name)
end

-- Insert at the front of typeahead, like lazy.nvim: keys still queued behind
-- the trigger (e.g. a which-key feed of `cRs`) must run after the replay.
local function feed_lhs(lhs)
	local keys = vim.api.nvim_replace_termcodes(lhs, true, false, true)
	vim.api.nvim_feedkeys(keys, "mi", false)
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

	local shim = { lhs = lhs, rhs = rhs, modes = modes, opts = opts }
	shim.callback = function()
		-- Delete the shim first, so that the replay cannot run it again.
		del_key_shim(shim)
		M.load(spec.name)
		if type(rhs) == "function" then
			return rhs()
		end
		feed_lhs(lhs)
	end
	vim.keymap.set(modes, lhs, shim.callback, opts)
	table.insert(spec._key_shims, shim)
end

local function register_eager_keys(spec)
	for _, key in ipairs(list(spec.keys)) do
		register_eager_key(key)
	end
end

-- Like lazy.nvim: `lazy` wins when it is set. Otherwise a plugin is lazy when
-- it is only a dependency or when it has a trigger.
local function is_lazy(spec)
	if spec.lazy ~= nil then
		return spec.lazy == true
	end
	return spec._dep == true or spec.event ~= nil or spec.cmd ~= nil or spec.ft ~= nil or spec.keys ~= nil
end

-- Normalize spec.event into a list of single event items (string or table form).
-- Distinguishes a single table-form event { event=..., pattern=... } or
-- { "Event", "pattern" } from a list of events, and splits the multi-event
-- form { event = { "BufRead", "BufNewFile" }, pattern = ... } into one item
-- per event.
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
	if type(value.event) == "table" then
		local items = {}
		for _, name in ipairs(value.event) do
			table.insert(items, { event = name, pattern = value.pattern })
		end
		return items
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
	spec._cmd_shims, spec._key_shims = {}, {}
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
			vim.api.nvim_exec_autocmds("User", { pattern = "VeryLazy", modeline = false })
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

-- Return true when an enabled spec has this name.
function M.has(name)
	return specs[name] ~= nil
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

-- Put a plugin and all its dependencies on rtp, without sourcing or setup.
local function add_runtime_tree(spec)
	for _, dep in ipairs(spec.dependencies) do
		if specs[dep] then
			add_runtime_tree(specs[dep])
		end
	end
	add_to_rtp(spec)
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
		add_runtime_tree(spec)
		spec.build(spec)
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
		local spec = specs[name]
		if spec then
			run_build(spec)
		else
			vim.notify("lazypack: unknown plugin " .. tostring(name), vim.log.levels.WARN)
		end
	end
end

-- Return true for a session that can run commands before scheduled
-- callbacks: a headless run, or a `+cmd` or `-c cmd` argument. For example,
-- nixcfg runs `nvim --headless "+silent! packdel ++all"`.
local function has_startup_commands()
	if #vim.api.nvim_list_uis() == 0 then
		return true
	end
	for _, arg in ipairs(vim.v.argv) do
		if arg == "-c" or arg:sub(1, 1) == "+" then
			return true
		end
	end
	return false
end

-- vim.pack.add only installs missing plugins and registers the others. When
-- every plugin is on disk, register them after startup. A startup command
-- can need the registration: without it, `packdel ++all` deletes every
-- plugin as inactive.
local function add_packs(install)
	if #install == 0 then
		return
	end
	local function add()
		vim.pack.add(install, { load = function() end })
	end
	local installed = {}
	for name in vim.fs.dir(pack_dir) do
		installed[name] = true
	end
	local missing = vim.tbl_contains(install, function(item)
		return not installed[item.name]
	end, { predicate = true })
	if missing or has_startup_commands() then
		add()
	else
		vim.schedule(function()
			try(add, "vim.pack.add failed")
		end)
	end
end

function M.setup(imports)
	specs = {}
	loaded = {}
	loading = {}
	build_hooks = {}
	module_loaders = {}
	lazy_names = {}
	missing_modules = {}
	sourced_files = {}
	reset_paths()
	import_specs(imports)

	local ordered = ordered_specs()
	for _, spec in ipairs(ordered) do
		if spec.build then
			build_hooks[spec.name] = spec.build
		end
	end

	if vim.env.NVIM_BUILD_HOOKS == "1" then
		return
	end

	local install = {}
	for _, spec in ipairs(ordered) do
		local item = pack_spec(spec)
		if item then
			table.insert(install, item)
		end
	end
	add_packs(install)

	-- lazypack sources plugin/ files itself, here and in M.load. Vim's own
	-- startup pass would source each plugin folder on rtp a second time.
	-- Keep `--noplugin` working for the base rtp folders.
	local load_base_plugins = vim.go.loadplugins
	vim.go.loadplugins = false

	-- Register every lazy trigger before any init hook or eager load, so that
	-- this code can require, call, or map any lazy plugin.
	setup_very_lazy()
	register_module_searcher()
	local eager = {}
	for _, spec in ipairs(ordered) do
		if is_lazy(spec) then
			-- Register module triggers for every lazy plugin, including
			-- dependency stubs, not just `lazy = true` ones. A plugin lazy-loaded
			-- by cmd/keys/ft/event can still be pulled in when another plugin
			-- `require`s one of its submodules -- e.g. neogit's
			-- `diff_viewer = "codediff"` integration does
			-- `require("codediff.core.git")` before any CodeDiff command or key
			-- has run. Mapping each plugin's likely module names to its spec
			-- lets the module searcher load it on demand (the searcher keys on
			-- the root module, so submodules resolve too). `lazy_names` lets
			-- `lazy_module_fallback` find any other module of the plugin on
			-- disk, matching lazy.nvim where any lazy plugin is loadable via
			-- require of one of its modules.
			register_module_triggers(spec)
			table.insert(lazy_names, spec.name)
			register_triggers(spec)
		else
			table.insert(eager, spec)
		end
	end

	-- Source filetype.lua after the triggers, so that LazyPack's BufRead*
	-- autocmds run before filetype detection and a plugin that loads on them
	-- still sees FileType. Source it before the plugin folders go on rtp:
	-- M.load sources the ftdetect/ files of each plugin.
	source_file(vim.fs.normalize(vim.env.VIMRUNTIME) .. "/filetype.lua")

	-- Pre-seed rtp in one option update: dir specs plus eager remote specs.
	-- Lazy remote specs stay off rtp until they load, so that their ftplugin/,
	-- queries, and other runtime files do not apply before the load.
	local startup_dirs = {}
	for _, spec in ipairs(ordered) do
		if spec.dir or not is_lazy(spec) then
			if dir_exists(spec) then
				table.insert(startup_dirs, plugin_dir(spec))
			elseif spec.dir then
				vim.notify("Local plugin directory does not exist: " .. plugin_dir(spec), vim.log.levels.WARN)
			end
		end
	end
	add_runtime_dirs(startup_dirs)

	for _, spec in ipairs(ordered) do
		if spec.init then
			try(spec.init, "init() failed for " .. spec.name, spec)
		end
	end

	for _, spec in ipairs(eager) do
		if dir_exists(spec) then
			try(M.load, "failed to load " .. spec.name, spec.name)
		elseif not spec.dir then
			vim.notify("lazypack: missing plugin, restart after install: " .. spec.name, vim.log.levels.WARN)
		end
		register_eager_keys(spec)
	end

	if load_base_plugins then
		source_base_plugins()
	end
end

return M
