import assert from "node:assert/strict";
import { test } from "node:test";
import {
	readLaunchProfile as readNeutralProfile,
	writeLaunchProfile as writeNeutralProfile,
} from "./launch-profile.ts";
import { parseExplicitModelSelection as parseNeutralModel } from "./model-picker.ts";
import {
	readLaunchProfile as readTmuxProfile,
	writeLaunchProfile as writeTmuxProfile,
} from "../pi-tmux-subagents/launch-profile.ts";
import { parseExplicitModelSelection as parseTmuxModel } from "../pi-tmux-subagents/model-picker.ts";

test("ordinary tmux imports share the neutral sidecar and model selection implementations", () => {
	assert.strictEqual(readTmuxProfile, readNeutralProfile);
	assert.strictEqual(writeTmuxProfile, writeNeutralProfile);
	assert.strictEqual(parseTmuxModel, parseNeutralModel);
});
