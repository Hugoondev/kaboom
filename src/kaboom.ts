import {
	vec2,
	mat4,
	quad,
	rgb,
	hsl2rgb,
	rng,
	rand,
	randi,
	randSeed,
	chance,
	choose,
	clamp,
	lerp,
	map,
	mapc,
	wave,
	testAreaRect,
	testAreaLine,
	testAreaCircle,
	testAreaPolygon,
	testAreaPoint,
	testAreaArea,
	testLineLine,
	testRectRect,
	testRectLine,
	testRectPoint,
	testPolygonPoint,
	testLinePolygon,
	testPolygonPolygon,
	testCircleCircle,
	testCirclePoint,
	testRectPolygon,
	testPolygonPolygonSAT,
	transformArea,
	areaBBox,
	minkDiff,
	vec2FromAngle,
	deg2rad,
	rad2deg,
	isVec2,
} from "./math";

import {
	originPt,
	gfxInit,
} from "./gfx";

import {
	appInit,
} from "./app";

import {
	audioInit,
} from "./audio";

import {
	assetsInit,
	ASCII_CHARS,
	CP437_CHARS,
} from "./assets";

import {
	IDList,
	downloadURL,
	downloadBlob,
	uid,
} from "./utils";

import {
	KaboomCtx,
	KaboomOpt,
	AudioPlay,
	AudioPlayOpt,
	Vec2,
	Mat4,
	DrawSpriteOpt,
	DrawTextOpt,
	GameObj,
	Timer,
	EventCanceller,
	SceneID,
	SceneDef,
	CompList,
	Comp,
	Tag,
	Key,
	MouseButton,
	TouchID,
	Collision,
	PosComp,
	ScaleComp,
	RotateComp,
	ColorComp,
	OpacityComp,
	Origin,
	OriginComp,
	LayerComp,
	ZComp,
	FollowComp,
	MoveComp,
	CleanupComp,
	AreaCompOpt,
	AreaComp,
	Area,
	SpriteData,
	SpriteComp,
	SpriteCompOpt,
	GfxTexture,
	Quad,
	SpriteAnimPlayOpt,
	TextComp,
	TextCompOpt,
	RectComp,
	RectCompOpt,
	UVQuadComp,
	CircleComp,
	Color,
	OutlineComp,
	TimerComp,
	BodyComp,
	BodyCompOpt,
	Uniform,
	ShaderComp,
	SolidComp,
	FixedComp,
	StayComp,
	HealthComp,
	LifespanComp,
	LifespanCompOpt,
	StateComp,
	Debug,
	KaboomPlugin,
	MergeObj,
	Level,
	LevelOpt,
	Cursor,
	Recording,
} from "./types";

import kaboomPlugin from "./plugins/kaboom";

export default (gopt: KaboomOpt = {}): KaboomCtx => {

const audio = audioInit();

const app = appInit({
	width: gopt.width,
	height: gopt.height,
	scale: gopt.scale,
	crisp: gopt.crisp,
	canvas: gopt.canvas,
	root: gopt.root,
	stretch: gopt.stretch,
	touchToMouse: gopt.touchToMouse ?? true,
	audioCtx: audio.ctx,
});

const gfx = gfxInit(app.gl, {
	background: gopt.background ? rgb(gopt.background) : undefined,
	width: gopt.width,
	height: gopt.height,
	scale: gopt.scale,
	texFilter: gopt.texFilter,
	stretch: gopt.stretch,
	letterbox: gopt.letterbox,
});

const {
	width,
	height,
} = gfx;

const assets = assetsInit(gfx, audio);

const DEF_FONT = "apl386o";
const DBG_FONT = "sink";
const DEF_HASH_GRID_SIZE = 64;

function dt() {
	return app.dt() * debug.timeScale;
}

// TODO: clean
function play(id: string, opt: AudioPlayOpt = {}): AudioPlay {
	const pb = audio.play({
		buf: new AudioBuffer({
			length: 1,
			numberOfChannels: 1,
			sampleRate: 44100
		}),
	});
	onLoad(() => {
		const snd = assets.sounds[id];
		if (!snd) {
			throw new Error(`sound not found: "${id}"`);
		}
		const pb2 = audio.play(snd, opt);
		for (const k in pb2) {
			pb[k] = pb2[k];
		}
	});
	return pb;
}

function mousePos(): Vec2 {
	return app.mousePos();
}

function mouseWorldPos(): Vec2 {
	return game.camMousePos;
}

function findAsset<T>(src: string | T, lib: Record<string, T>, def?: string): T | undefined {
	if (src) {
		return typeof src === "string" ? lib[src] : src;
	} else if (def) {
		return lib[def];
	}
}

// wrapper around gfx.drawTexture to integrate with sprite assets mananger / frame anim
function drawSprite(opt: DrawSpriteOpt) {
	if (!opt.sprite) throw new Error(`drawSprite() requires property "sprite"`);
	const spr = findAsset(opt.sprite, assets.sprites);
	if (!spr) throw new Error(`sprite not found: "${opt.sprite}"`);
	const q = spr.frames[opt.frame ?? 0];
	if (!q) throw new Error(`frame not found: ${opt.frame ?? 0}`);
	gfx.drawTexture({
		...opt,
		tex: spr.tex,
		quad: q.scale(opt.quad || quad(0, 0, 1, 1)),
		uniform: {
			...opt.uniform,
			"u_transform": opt.fixed ? mat4() : game.camMatrix,
		},
	});
}

// wrapper around gfx.drawText to integrate with font assets mananger / default font
function drawText(opt: DrawTextOpt) {
	const font = findAsset(opt.font ?? gopt.font, assets.fonts, DEF_FONT);
	if (!font) throw new Error(`font not found: ${opt.font}`);
	gfx.drawText({
		...opt,
		font: font,
		uniform: {
			...opt.uniform,
			"u_transform": opt.fixed ? mat4() : game.camMatrix,
		},
	});
}

// wrapper around gfx.formatText to integrate with font assets mananger / default font
function formatText(opt: DrawTextOpt) {
	const font = findAsset(opt.font ?? gopt.font, assets.fonts, DEF_FONT);
	if (!font) throw new Error(`font not found: ${opt.font}`);
	return gfx.formatText({
		...opt,
		font: font,
	});
}

const DEF_GRAVITY = 1600;
const DEF_ORIGIN = "topleft";

interface Game {
	loaded: boolean,
	events: Record<string, IDList<() => void>>,
	objEvents: Record<string, IDList<TaggedEvent>>,
	root: GameObj,
	timers: IDList<Timer>,
	cam: Camera,
	camMousePos: Vec2,
	camMatrix: Mat4,
	gravity: number,
	layers: Record<string, number>,
	defLayer: string | null,
	on<F>(ev: string, cb: F): EventCanceller,
	trigger(ev: string, ...args),
	scenes: Record<SceneID, SceneDef>,
	paused: boolean,
};

type Camera = {
	pos: Vec2,
	scale: Vec2,
	angle: number,
	shake: number,
};

type Layer = {
	order: number,
}

type TaggedEvent = {
	tag: string,
	cb: (...args) => void,
};

type KeyEvent = {
	key: string,
	cb(),
};

type MouseInputEvent = {
	cb(),
};

type LoadEvent = () => void;
type NextFrameEvent = () => void;
type MouseEvent = () => void;
type CharEvent = (ch: string) => void;

const game: Game = {

	loaded: false,

	// event callbacks
	events: {},
	objEvents: {},

	// in game pool
	root: make([]),
	timers: new IDList(),

	// cam
	cam: {
		pos: center(),
		scale: vec2(1),
		angle: 0,
		shake: 0,
	},

	camMousePos: app.mousePos(),
	camMatrix: mat4(),

	// misc
	layers: {},
	defLayer: null,
	gravity: DEF_GRAVITY,

	on<F>(ev: string, cb: F): EventCanceller {
		if (!this.events[ev]) {
			this.events[ev] = new IDList();
		}
		return this.events[ev].pushd(cb);
	},

	trigger(ev: string, ...args) {
		if (this.events[ev]) {
			this.events[ev].forEach((cb) => cb(...args));
		}
	},

	scenes: {},
	paused: false,

};

function layers(list: string[], def?: string) {

	list.forEach((name, idx) => {
		game.layers[name] = idx + 1;
	});

	if (def) {
		game.defLayer = def;
	}

}

function camPos(...pos): Vec2 {
	if (pos.length > 0) {
		game.cam.pos = vec2(...pos);
	}
	return game.cam.pos.clone();
}

function camScale(...scale): Vec2 {
	if (scale.length > 0) {
		game.cam.scale = vec2(...scale);
	}
	return game.cam.scale.clone();
}

function camRot(angle: number): number {
	if (angle !== undefined) {
		game.cam.angle = angle;
	}
	return game.cam.angle;
}

function shake(intensity: number = 12) {
	game.cam.shake = intensity;
}

function toScreen(p: Vec2): Vec2 {
	return game.camMatrix.multVec2(p);
}

function toWorld(p: Vec2): Vec2 {
	return game.camMatrix.invert().multVec2(p);
}

const COMP_DESC = new Set([
	"id",
	"require",
]);

const COMP_EVENTS = new Set([
	"add",
	"load",
	"update",
	"draw",
	"destroy",
	"inspect",
]);

function make<T>(comps: CompList<T>): GameObj<T> {

	const compStates = new Map();
	const customState = {};
	const events = {};

	const obj = {

		_id: uid(),
		_transform: mat4(),
		hidden: false,
		paused: false,
		children: [],
		parent: null,

		add<T2>(comps: CompList<T2>): GameObj<T2> {
			const obj = make(comps);
			obj.parent = this;
			obj._transform = calcTransform(obj);
			obj.trigger("add");
			onLoad(() => obj.trigger("load"));
			this.children.push(obj);
			return obj;
		},

		readd(obj: GameObj): GameObj {
			this.remove(obj);
			this.children.push(obj);
			return obj;
		},

		remove(obj: GameObj): void {
			const idx = this.children.indexOf(obj);
			if (idx !== -1) {
				obj.parent = null;
				obj.trigger("destroy");
				this.children.splice(idx, 1);
			}
		},

		removeAll(tag: Tag) {
			this.every(tag, (obj) => this.remove(obj));
		},

		update() {
			if (this.paused) return;
			this.revery((child) => child.update());
			this.trigger("update");
		},

		draw() {
			if (this.hidden) return;
			gfx.pushTransform();
			gfx.pushTranslate(this.pos);
			gfx.pushScale(this.scale);
			gfx.pushRotateZ(this.angle);
			this.every((child) => child.draw());
			this.trigger("draw");
			gfx.popTransform();
		},

		// use a comp, or tag
		use(comp: Comp | Tag) {

			if (!comp) {
				return;
			}

			// tag
			if (typeof comp === "string") {
				return this.use({
					id: comp
				});
			}

			// clear if overwrite
			if (comp.id) {
				this.unuse(comp.id);
				compStates.set(comp.id, {});
			}

			// state source location
			const state = comp.id ? compStates.get(comp.id) : customState;

			state.cleanups = [];

			for (const k in comp) {

				if (COMP_DESC.has(k)) {
					continue;
				}

				// event / custom method
				if (typeof comp[k] === "function") {
					const func = comp[k].bind(this);
					if (COMP_EVENTS.has(k)) {
						state.cleanups.push(this.on(k, func));
						state[k] = func;
						continue;
					} else {
						state[k] = func;
					}
				} else {
					state[k] = comp[k];
				}

				if (this[k] === undefined) {
					// assign comp fields to game obj
					Object.defineProperty(this, k, {
						get: () => state[k],
						set: (val) => state[k] = val,
						configurable: true,
						enumerable: true,
					});
				}

			}

			const checkDeps = () => {
				if (!comp.require) {
					return;
				}
				for (const dep of comp.require) {
					if (!this.c(dep)) {
						throw new Error(`comp '${comp.id}' requires comp '${dep}'`);
					}
				}
			};

			// check deps or run add event
			if (this.exists()) {
				if (comp.add) {
					comp.add.call(this);
				}
				if (comp.load) {
					onLoad(() => comp.load.call(this));
				}
				checkDeps();
			} else {
				if (comp.require) {
					state.cleanups.push(this.on("add", () => {
						checkDeps();
					}));
				}
			}

		},

		unuse(id: Tag) {
			if (compStates.has(id)) {
				const comp = compStates.get(id);
				comp.cleanups.forEach((f) => f());
				for (const k in comp) {
					delete comp[k];
				}
			}
			compStates.delete(id);
		},

		c(id: Tag): Comp {
			return compStates.get(id);
		},

		// TODO: a recursive variant
		get(t?: Tag | Tag[]): GameObj[] {
			return this.children
				.filter((child) => t ? child.is(t) : true)
				.sort((o1, o2) => {
					// DEPRECATED: layers
					const l1 = game.layers[o1.layer ?? game.defLayer] ?? 0;
					const l2 = game.layers[o2.layer ?? game.defLayer] ?? 0;
					// if on same layer, use "z" comp to decide which is on top, if given
					if (l1 == l2) {
						return (o1.z ?? 0) - (o2.z ?? 0);
					} else {
						return l1 - l2;
					}
				});
		},

		every<T>(t: Tag | Tag[] | ((obj: GameObj) => T), f?: (obj: GameObj) => T) {
			if (typeof t === "function" && f === undefined) {
				return this.get().forEach((obj) => t(obj));
			} else if (typeof t === "string" || Array.isArray(t)) {
				return this.get(t).forEach((obj) => f(obj));
			}
		},

		revery<T>(t: Tag | Tag[] | ((obj: GameObj) => T), f?: (obj: GameObj) => T) {
			if (typeof t === "function" && f === undefined) {
				return this.get().reverse().forEach((obj) => t(obj));
			} else if (typeof t === "string" || Array.isArray(t)) {
				return this.get(t).reverse().forEach((obj) => f(obj));
			}
		},

		exists(): boolean {
			if (this.parent === game.root) {
				return true;
			} else {
				return this.parent?.exists();
			}
		},

		is(tag: Tag | Tag[]): boolean {
			if (tag === "*") {
				return true;
			}
			if (Array.isArray(tag)) {
				for (const t of tag) {
					if (!this.c(t)) {
						return false;
					}
				}
				return true;
			} else {
				return this.c(tag) != null;
			}
		},

		on(ev: string, cb): EventCanceller {
			if (!events[ev]) {
				events[ev] = new IDList();
			}
			return events[ev].pushd(cb);
		},

		action(...args): EventCanceller {
			return this.onUpdate(...args);
		},

		trigger(ev: string, ...args): void {

			if (events[ev]) {
				events[ev].forEach((cb) => cb.call(this, ...args));
			}

			const gEvents = game.objEvents[ev];

			if (gEvents) {
				gEvents.forEach((e) => {
					if (this.is(e.tag)) {
						e.cb(this, ...args);
					}
				});
			}

		},

		destroy() {
			this.parent?.remove(this);
		},

		inspect() {
			const info = {};
			for (const [tag, comp] of compStates) {
				info[tag] = comp.inspect ? comp.inspect() : null;
			}
			return info;
		},

		onUpdate(cb: () => void): EventCanceller {
			return this.on("update", cb);
		},

		onDraw(cb: () => void): EventCanceller {
			return this.on("draw", cb);
		},

		onDestroy(action: () => void): EventCanceller {
			return this.on("destroy", action);
		},

	};

	for (const comp of comps) {
		obj.use(comp);
	}

	return obj as unknown as GameObj<T>;

}

// add an event to a tag
function on(event: string, tag: Tag, cb: (obj: GameObj, ...args) => void): EventCanceller {
	if (!game.objEvents[event]) {
		game.objEvents[event] = new IDList();
	}
	return game.objEvents[event].pushd({
		tag: tag,
		cb: cb,
	});
}

// TODO: detect if is currently in another action?
// add update event to a tag or global update
function onUpdate(tag: Tag | (() => void), cb?: (obj: GameObj) => void): EventCanceller {
	if (typeof tag === "function" && cb === undefined) {
		return game.root.onUpdate(tag);
	} else if (typeof tag === "string") {
		return on("update", tag, cb);
	}
}

// add draw event to a tag or global draw
function onDraw(tag: Tag | (() => void), cb?: (obj: GameObj) => void) {
	if (typeof tag === "function" && cb === undefined) {
		return game.root.onDraw(tag);
	} else if (typeof tag === "string") {
		return on("draw", tag, cb);
	}
}

// add an event that runs with objs with t1 collides with objs with t2
function onCollide(
	t1: Tag,
	t2: Tag,
	f: (a: GameObj, b: GameObj, col?: Collision) => void,
): EventCanceller {
	return on("collide", t1, (a, b, col) => b.is(t2) && f(a, b, col));
}

// add an event that runs when objs with tag t is clicked
function onClick(tag: Tag | (() => void), cb?: (obj: GameObj) => void): EventCanceller {
	if (typeof tag === "function") {
		return onMousePress(tag);
	} else {
		return onUpdate(tag, (o: GameObj) => {
			if (!o.area) throw new Error("onClick() requires the object to have area() component");
			if (o.isClicked()) {
				cb(o);
			}
		});
	}
}

// add an event that runs when objs with tag t is hovered
function onHover(t: string, onHover: (obj: GameObj) => void, onNotHover?: (obj: GameObj) => void): EventCanceller {
	return onUpdate(t, (o: GameObj) => {
		if (!o.area) throw new Error("onHover() requires the object to have area() component");
		if (o.isHovering()) {
			onHover(o);
		} else {
			if (onNotHover) {
				onNotHover(o);
			}
		}
	});
}

// add an event that'd be run after t
function wait(t: number, f?: () => void): Promise<void> {
	return new Promise((resolve) => {
		game.timers.push({
			time: t,
			action: () => {
				if (f) {
					f();
				}
				resolve();
			},
		});
	});
}

// add an event that's run every t seconds
function loop(t: number, f: () => void): EventCanceller {

	let stopped = false;

	const newF = () => {
		if (stopped) {
			return;
		}
		f();
		wait(t, newF);
	};

	newF();

	return () => stopped = true;

}

// input callbacks
function onKeyDown(k: Key | Key[], f: () => void): EventCanceller {
	if (Array.isArray(k)) {
		const cancellers = k.map((key) => onKeyDown(key, f));
		return () => cancellers.forEach((cb) => cb());
	} {
		return game.on("input", () => app.isKeyDown(k) && f());
	}
}

function onKeyPress(k: Key | Key[] | (() => void), f?: () => void): EventCanceller {
	if (Array.isArray(k)) {
		const cancellers = k.map((key) => onKeyPress(key, f));
		return () => cancellers.forEach((cb) => cb());
	} else if (typeof k === "function") {
		return game.on("input", () => app.isKeyPressed() && k());
	} else {
		return game.on("input", () => app.isKeyPressed(k) && f());
	}
}

function onKeyPressRepeat(k: Key | Key[] | (() => void), f?: () => void): EventCanceller {
	if (Array.isArray(k)) {
		const cancellers = k.map((key) => onKeyPressRepeat(key, f));
		return () => cancellers.forEach((cb) => cb());
	} else if (typeof k === "function") {
		return game.on("input", () => app.isKeyPressed() && k());
	} else {
		return game.on("input", () => app.isKeyPressedRepeat(k) && f());
	}
}

function onKeyRelease(k: Key | Key[] | (() => void), f?: () => void): EventCanceller {
	if (Array.isArray(k)) {
		const cancellers = k.map((key) => onKeyRelease(key, f));
		return () => cancellers.forEach((cb) => cb());
	} else if (typeof k === "function") {
		return game.on("input", () => app.isKeyReleased() && k());
	} else {
		return game.on("input", () => app.isKeyReleased(k) && f());
	}
}

function onMouseDown(
	m: MouseButton | ((pos?: Vec2) => void),
	action?: (pos?: Vec2) => void
): EventCanceller {
	if (typeof m === "function") {
		return game.on("input", () => app.isMouseDown() && m(mousePos()));
	} else {
		return game.on("input", () => app.isMouseDown(m) && action(mousePos()));
	}
}

function onMousePress(
	m: MouseButton | ((pos?: Vec2) => void),
	action?: (pos?: Vec2) => void
): EventCanceller {
	if (typeof m === "function") {
		return game.on("input", () => app.isMousePressed() && m(mousePos()));
	} else {
		return game.on("input", () => app.isMousePressed(m) && action(mousePos()));
	}
}

function onMouseRelease(
	m: MouseButton | ((pos?: Vec2) => void),
	action?: (pos?: Vec2) => void
): EventCanceller {
	if (typeof m === "function") {
		return game.on("input", () => app.isMouseReleased() && m(mousePos()));
	} else {
		return game.on("input", () => app.isMouseReleased(m) && action(mousePos()));
	}
}

function onMouseMove(f: (pos: Vec2, dpos: Vec2) => void): EventCanceller {
	return game.on("input", () => app.isMouseMoved() && f(mousePos(), app.mouseDeltaPos()));
}

function onCharInput(f: (ch: string) => void): EventCanceller {
	return game.on("input", () => app.charInputted().forEach((ch) => f(ch)));
}

// TODO: put this in app.ts's and handle in game loop
app.canvas.addEventListener("touchstart", (e) => {
	[...e.changedTouches].forEach((t) => {
		game.trigger("onTouchStart", t.identifier, vec2(t.clientX, t.clientY).scale(1 / app.scale));
	});
});

app.canvas.addEventListener("touchmove", (e) => {
	[...e.changedTouches].forEach((t) => {
		game.trigger("onTouchMove", t.identifier, vec2(t.clientX, t.clientY).scale(1 / app.scale));
	});
});

app.canvas.addEventListener("touchend", (e) => {
	[...e.changedTouches].forEach((t) => {
		game.trigger("onTouchEnd", t.identifier, vec2(t.clientX, t.clientY).scale(1 / app.scale));
	});
});

function onTouchStart(f: (id: TouchID, pos: Vec2) => void): EventCanceller {
	return game.on("onTouchStart", f);
}

function onTouchMove(f: (id: TouchID, pos: Vec2) => void): EventCanceller {
	return game.on("onTouchMove", f);
}

function onTouchEnd(f: (id: TouchID, pos: Vec2) => void): EventCanceller {
	return game.on("onTouchEnd", f);
}

function enterDebugMode() {

	onKeyPress("f1", () => {
		debug.inspect = !debug.inspect;
	});

	onKeyPress("f2", () => {
		debug.clearLog();
	});

	onKeyPress("f8", () => {
		debug.paused = !debug.paused;
	});

	onKeyPress("f7", () => {
		debug.timeScale = toFixed(clamp(debug.timeScale - 0.2, 0, 2), 1);
	});

	onKeyPress("f9", () => {
		debug.timeScale = toFixed(clamp(debug.timeScale + 0.2, 0, 2), 1);
	});

	onKeyPress("f10", () => {
		debug.stepFrame();
	});

	onKeyPress("f5", () => {
		downloadURL(app.screenshot(), "kaboom.png");
	});

	onKeyPress("f6", () => {
		if (debug.curRecording) {
			debug.curRecording.download();
			debug.curRecording = null;
		} else {
			debug.curRecording = record();
		}
	});

}

function enterBurpMode() {
	onKeyPress("b", audio.burp);
}

// get / set gravity
function gravity(g?: number): number {
	if (g !== undefined) {
		game.gravity = g;
	}
	return game.gravity;
}

function regCursor(c: Cursor, draw: string | ((mpos: Vec2) => void)) {
	// TODO
}

function makeCollision(target: GameObj<any>, dis: Vec2): Collision {
	return {
		target: target,
		displacement: dis,
		resolved: false,
		isTop: () => dis.y > 0,
		isBottom: () => dis.y < 0,
		isLeft: () => dis.x > 0,
		isRight: () => dis.x < 0,
	};
}

// TODO: manage global velocity here?
function pos(...args): PosComp {

	return {

		id: "pos",
		pos: vec2(...args),

		moveBy(...args) {
			this.pos = this.pos.add(...args);
		},

		// move with velocity (pixels per second)
		move(...args) {
			return this.moveBy(vec2(...args).scale(dt()));
		},

		// move to a destination, with optional speed
		moveTo(...args) {
			if (typeof args[0] === "number" && typeof args[1] === "number") {
				return this.moveTo(vec2(args[0], args[1]), args[2]);
			}
			const dest = args[0];
			const speed = args[1];
			if (speed === undefined) {
				this.pos = vec2(dest);
				return;
			}
			const diff = dest.sub(this.pos);
			if (diff.len() <= speed * dt()) {
				this.pos = vec2(dest);
				return;
			}
			this.move(diff.unit().scale(speed));
		},

		// get the screen position (transformed by camera)
		screenPos(): Vec2 {
			if (this.fixed) {
				return this.pos;
			} else {
				return toScreen(this.pos);
			}
		},

		inspect() {
			return `(${Math.round(this.pos.x)}, ${Math.round(this.pos.y)})`;
		},

	};

};

// TODO: allow single number assignment
function scale(...args): ScaleComp {
	if (args.length === 0) {
		return scale(1);
	}
	return {
		id: "scale",
		scale: vec2(...args),
		scaleTo(...args) {
			this.scale = vec2(...args);
		},
		inspect() {
			if (typeof this.scale === "number") {
				return `${toFixed(this.scale, 2)}`;
			} else {
				return `(${toFixed(this.scale.x, 2)}, ${toFixed(this.scale.y, 2)})`;
			}
		},
	};
}

function rotate(r: number): RotateComp {
	return {
		id: "rotate",
		angle: r ?? 0,
		inspect() {
			return `${Math.round(this.angle)}`;
		},
	};
}

function color(...args): ColorComp {
	return {
		id: "color",
		color: rgb(...args),
		inspect() {
			return this.color.str();
		},
	};
}

function toFixed(n: number, f: number) {
	return Number(n.toFixed(f));
}

function opacity(a: number): OpacityComp {
	return {
		id: "opacity",
		opacity: a ?? 1,
		inspect() {
			return `${toFixed(this.opacity, 2)}`;
		},
	};
}

function origin(o: Origin | Vec2): OriginComp {
	if (!o) {
		throw new Error("please define an origin");
	}
	return {
		id: "origin",
		origin: o,
		inspect() {
			if (typeof this.origin === "string") {
				return this.origin;
			} else {
				return this.origin.str();
			}
		},
	};
}

function layer(l: string): LayerComp {
	return {
		id: "layer",
		layer: l,
		inspect() {
			return this.layer ?? game.defLayer;
		},
	};
}

function z(z: number): ZComp {
	return {
		id: "z",
		z: z,
		inspect() {
			return `${this.z}`;
		},
	};
}

function follow(obj: GameObj, offset?: Vec2): FollowComp {
	return {
		id: "follow",
		require: [ "pos", ],
		follow: {
			obj: obj,
			offset: offset ?? vec2(0),
		},
		add() {
			if (obj.exists()) {
				this.pos = this.follow.obj.pos.add(this.follow.offset);
			}
		},
		update() {
			if (obj.exists()) {
				this.pos = this.follow.obj.pos.add(this.follow.offset);
			}
		},
	};
}

function move(dir: number | Vec2, speed: number): MoveComp {
	const d = typeof dir === "number" ? vec2FromAngle(dir) : dir.unit();
	return {
		id: "move",
		require: [ "pos", ],
		update() {
			this.move(d.scale(speed));
		},
	};
}

function cleanup(time: number = 0): CleanupComp {
	let timer = 0;
	return {
		id: "cleanup",
		require: [ "pos", "area", ],
		update() {
			const screenRect = {
				p1: vec2(0, 0),
				p2: vec2(width(), height()),
			}
			if (testAreaRect(this.screenArea(), screenRect)) {
				timer = 0;
			} else {
				timer += dt();
				if (timer >= time) {
					this.destroy();
				}
			}
		},
	};
}

function area(opt: AreaCompOpt = {}): AreaComp {

	const colliding = {};

	return {

		id: "area",
		_worldArea: null,
		_bbox: null,

		add() {
			if (this.area.cursor) {
				this.hovers(() => {
					app.cursor(this.area.cursor);
				});
			}
		},

		load() {
			this._worldArea = transformArea(this.localArea(), this._transform);
		},

		area: {
			shape: "rect",
			offset: opt.offset ?? vec2(0),
			width: opt.width,
			height: opt.height,
			scale: opt.scale ?? vec2(1),
			cursor: opt.cursor,
		},

		isClicked(): boolean {
			return app.isMousePressed() && this.isHovering();
		},

		isHovering() {
			const mpos = this.fixed ? mousePos() : mouseWorldPos();
			return this.hasPoint(mpos);
		},

		checkCollision(other) {
			if (!other.area || !other.exists()) {
				return null;
			}
			const a1 = this.worldArea();
			const a2 = other.worldArea();
			if (a1.shape !== "polygon" || a2.shape !== "polygon") {
				throw new Error("Only support polygon areas for now.");
			}
			return testPolygonPolygonSAT(a1.pts, a2.pts);
		},

		isColliding(other) {
			const res = this.checkCollision(other);
			return res && !res.isZero();
		},

		isTouching(other) {
			return Boolean(this.checkCollision(other));
		},

		onClick(f: () => void): EventCanceller {
			return this.onUpdate(() => {
				if (this.isClicked()) {
					f();
				}
			});
		},

		onHover(onHover: () => void, onNotHover: () => void): EventCanceller {
			return this.onUpdate(() => {
				if (this.isHovering()) {
					onHover();
				} else {
					if (onNotHover) {
						onNotHover();
					}
				}
			});
		},

		// TODO: update whitelist
		onCollide(
			tag: Tag | ((obj: GameObj, col?: Collision) => void),
			cb?: (obj: GameObj, col?: Collision) => void
		): EventCanceller {
			if (typeof tag === "function" && cb === undefined) {
				return this.on("collide", tag);
			} else if (typeof tag === "string") {
				return this.on("collide", (obj) => obj.is(tag) && cb(obj));
			}
		},

		clicks(...args) {
			return this.onClick(...args);
		},

		hovers(...args) {
			return this.onHover(...args);
		},

		collides(...args) {
			return this.onCollide(...args);
		},

		hasPoint(pt: Vec2): boolean {
			return testAreaPoint(this.worldArea(), pt);
		},

		// push an obj out of another if they're overlapped
		pushOut(obj: GameObj): Vec2 | null {
			if (obj === this) {
				return null;
			}
		},

		// push object out of other solid objects
		pushOutAll() {
			game.root.every(this.pushOut);
		},

		// TODO: support custom polygon
		localArea(): Area {

			let w = this.area.width ?? this.width;
			let h = this.area.height ?? this.height;

			if (!w || !h) {
				throw new Error("failed to get area dimension");
			}

			w *= this.area.scale.x;
			h *= this.area.scale.y;

			const orig = originPt(this.origin || DEF_ORIGIN);
			const pos = this.area.offset.sub(orig.add(1, 1).scale(0.5).scale(w, h));

			return {
				shape: "rect",
				p1: pos,
				p2: vec2(pos.x + w, pos.y + h),
			};

		},

		worldArea(): Area {
			if (!this._worldArea) {
				throw new Error("World area not initialized. This should be a bug.");
			}
			return this._worldArea;
		},

		screenArea(): Area {
			const area = this.worldArea();
			if (this.fixed) {
				return area;
			} else {
				return {
					shape: "rect",
					p1: game.camMatrix.multVec2(area.p1),
					p2: game.camMatrix.multVec2(area.p2),
				};
			}
		},

	};

}

// make the list of common render properties from the "pos", "scale", "color", "opacity", "rotate", "origin", "outline", and "shader" components of a character
function getRenderProps(obj: GameObj<any>) {
	return {
		color: obj.color,
		opacity: obj.opacity,
		origin: obj.origin,
		outline: obj.outline,
		fixed: obj.fixed,
		shader: assets.shaders[obj.shader],
		uniform: obj.uniform,
	};
}

interface SpriteCurAnim {
	name: string,
	timer: number,
	loop: boolean,
	speed: number,
	pingpong: boolean,
	onEnd: () => void,
}

// TODO: clean
function sprite(id: string | SpriteData, opt: SpriteCompOpt = {}): SpriteComp {

	let spr = null;
	let curAnim: SpriteCurAnim | null = null;

	function calcTexScale(tex: GfxTexture, q: Quad, w?: number, h?: number): Vec2 {
		const scale = vec2(1, 1);
		if (w && h) {
			scale.x = w / (tex.width * q.w);
			scale.y = h / (tex.height * q.h);
		} else if (w) {
			scale.x = w / (tex.width * q.w);
			scale.y = scale.x;
		} else if (h) {
			scale.y = h / (tex.height * q.h);
			scale.x = scale.y;
		}
		return scale;
	}

	return {

		id: "sprite",
		// TODO: allow update
		width: 0,
		height: 0,
		frame: opt.frame || 0,
		quad: opt.quad || quad(0, 0, 1, 1),
		animSpeed: opt.animSpeed ?? 1,

		load() {

			if (typeof id === "string") {
				spr = assets.sprites[id];
			} else {
				spr = id;
			}

			if (!spr) {
				throw new Error(`sprite not found: "${id}"`);
			}

			let q = { ...spr.frames[0] };

			if (opt.quad) {
				q = q.scale(opt.quad);
			}

			const scale = calcTexScale(spr.tex, q, opt.width, opt.height);

			this.width = spr.tex.width * q.w * scale.x;
			this.height = spr.tex.height * q.h * scale.y;

			if (opt.anim) {
				this.play(opt.anim);
			}

		},

		draw() {
			drawSprite({
				...getRenderProps(this),
				sprite: spr,
				frame: this.frame,
				quad: this.quad,
				flipX: opt.flipX,
				flipY: opt.flipY,
				tiled: opt.tiled,
				width: opt.width,
				height: opt.height,
			});
		},

		update() {

			if (!curAnim) {
				return;
			}

			const anim = spr.anims[curAnim.name];

			if (typeof anim === "number") {
				this.frame = anim;
				return;
			}

			if (anim.speed === 0) {
				throw new Error("sprite anim speed cannot be 0");
			}

			curAnim.timer += dt() * this.animSpeed;

			if (curAnim.timer >= (1 / curAnim.speed)) {
				curAnim.timer = 0;
				// TODO: clean up
				if (anim.from > anim.to) {
					this.frame--;
					if (this.frame < anim.to) {
						if (curAnim.loop) {
							this.frame = anim.from;
						} else {
							this.frame++;
							curAnim.onEnd();
							this.stop();
						}
					}
				} else {
					this.frame++;
					if (this.frame > anim.to) {
						if (curAnim.loop) {
							this.frame = anim.from;
						} else {
							this.frame--;
							curAnim.onEnd();
							this.stop();
						}
					}
				}
			}

		},

		// TODO: this opt should be used instead of the sprite data opt, if given
		play(name: string, opt: SpriteAnimPlayOpt = {}) {

			if (!spr) {
				onLoad(() => {
					this.play(name);
				});
				return;
			}

			const anim = spr.anims[name];

			if (anim == null) {
				throw new Error(`anim not found: ${name}`);
			}

			if (curAnim) {
				this.stop();
			}

			curAnim = {
				name: name,
				timer: 0,
				loop: opt.loop ?? anim.loop ?? false,
				pingpong: opt.pingpong ?? anim.pingpong ?? false,
				speed: opt.speed ?? anim.speed ?? 10,
				onEnd: opt.onEnd ?? (() => {}),
			};

			if (typeof anim === "number") {
				this.frame = anim;
			} else {
				this.frame = anim.from;
			}

			// TODO: "animPlay" is deprecated
			this.trigger("animPlay", name);
			this.trigger("animStart", name);

		},

		stop() {
			if (!curAnim) {
				return;
			}
			const prevAnim = curAnim.name;
			curAnim = null;
			this.trigger("animEnd", prevAnim);
		},

		numFrames() {
			if (!spr) {
				return 0;
			}
			return spr.frames.length;
		},

		curAnim() {
			return curAnim?.name;
		},

		flipX(b: boolean) {
			opt.flipX = b;
		},

		flipY(b: boolean) {
			opt.flipY = b;
		},

		onAnimEnd(name: string, action: () => void): EventCanceller {
			return this.on("animEnd", (anim) => {
				if (anim === name) {
					action();
				}
			});
		},

		onAnimStart(name: string, action: () => void): EventCanceller {
			return this.on("animStart", (anim) => {
				if (anim === name) {
					action();
				}
			});
		},

		inspect() {
			let msg = "";
			if (typeof id === "string") {
				msg += JSON.stringify(id);
			} else {
				msg += "[blob]";
			}
			return msg;
		},

	};

}

function text(t: string, opt: TextCompOpt = {}): TextComp {

	function update(obj: GameObj<TextComp | any>) {

		const ftext = formatText({
			...getRenderProps(obj),
			text: obj.text + "",
			size: obj.textSize,
			font: opt.font,
			width: opt.width,
			letterSpacing: opt.letterSpacing,
			lineSpacing: opt.lineSpacing,
			transform: opt.transform,
			styles: opt.styles,
		});

		obj.width = ftext.width / (obj.scale?.x || 1);
		obj.height = ftext.height / (obj.scale?.y || 1);

		return ftext;

	};

	return {

		id: "text",
		text: t,
		textSize: opt.size,
		font: opt.font,
		width: 0,
		height: 0,

		load() {
			update(this);
		},

		draw() {
			gfx.drawFormattedText(update(this));
		},

	};

}

function rect(w: number, h: number, opt: RectCompOpt = {}): RectComp {
	return {
		id: "rect",
		width: w,
		height: h,
		radius: opt.radius || 0,
		draw() {
			gfx.drawRect({
				...getRenderProps(this),
				width: this.width,
				height: this.height,
				radius: this.radius,
			});
		},
		inspect() {
			return `${Math.ceil(this.width)}, ${Math.ceil(this.height)}`;
		},
	};
}

function uvquad(w: number, h: number): UVQuadComp {
	return {
		id: "rect",
		width: w,
		height: h,
		draw() {
			gfx.drawUVQuad({
				...getRenderProps(this),
				width: this.width,
				height: this.height,
			});
		},
		inspect() {
			return `${Math.ceil(this.width)}, ${Math.ceil(this.height)}`;
		},
	};
}

function circle(radius: number): CircleComp {
	return {
		id: "circle",
		radius: radius,
		draw() {
			gfx.drawCircle({
				...getRenderProps(this),
				radius: this.radius,
			});
		},
		inspect() {
			return `${Math.ceil(this.radius)}`;
		},
	};
}

function outline(width: number = 1, color: Color = rgb(0, 0, 0)): OutlineComp {
	return {
		id: "outline",
		outline: {
			width,
			color,
		},
	};
}

function timer(n?: number, action?: () => void): TimerComp {
	const timers: IDList<Timer> = new IDList();
	if (n && action) {
		timers.pushd({
			time: n,
			action: action,
		});
	}
	return {
		id: "timer",
		wait(n: number, action: () => void): EventCanceller {
			return timers.pushd({
				time: n,
				action: action,
			});
		},
		update() {
			timers.forEach((timer, id) => {
				timer.time -= dt();
				if (timer.time <= 0) {
					timer.action.call(this);
					timers.delete(id);
				}
			});
		},
	};
}

// maximum y velocity with body()
const DEF_JUMP_FORCE = 640;
const MAX_VEL = 65536;

// TODO: land on wall
function body(opt: BodyCompOpt = {}): BodyComp {

	let velY = 0;
	let curPlatform: GameObj | null = null;
	let lastPlatformPos = null;
	let canDouble = true;
	let lastlastPlatform = null;

	return {

		id: "body",
		require: [ "pos", "area", ],
		jumpForce: opt.jumpForce ?? DEF_JUMP_FORCE,
		weight: opt.weight ?? 1,
		solid: opt.solid ?? true,

		add() {

			this.onCollide((other, col) => {
				if (this.solid && other.solid && !col.resolved) {
					col.resolved = true;
					this.pos = this.pos.add(col.displacement);
					this._transform = calcTransform(this);
					this._worldArea = transformArea(this.localArea(), this._transform);
					if (col.isBottom()) {
						curPlatform = other;
						velY = 0;
						this.trigger("ground", curPlatform);
						canDouble = true;
						if (curPlatform.pos) {
							lastPlatformPos = curPlatform.pos.clone();
						}
					} else if (col.isTop()) {
						velY = 0;
						this.trigger("headbutt", other);
					}
				}
			});

		},

		update() {


			if (curPlatform) {
				if (!curPlatform.exists() || !this.isTouching(curPlatform)) {
					this.trigger("fall", curPlatform);
					curPlatform = null;
					lastPlatformPos = null;
				} else {
					if (lastPlatformPos && curPlatform.pos) {
						// sticky platform
						this.pos = this.pos.add(curPlatform.pos.sub(lastPlatformPos));
						lastPlatformPos = curPlatform.pos.clone();
					}
				}
			}

			if (!curPlatform) {
				this.move(0, velY);
				velY += gravity() * this.weight * dt();
				velY = Math.min(velY, opt.maxVel ?? MAX_VEL);
			}

		},

		curPlatform(): GameObj | null {
			return curPlatform;
		},

		isGrounded() {
			return curPlatform !== null;
		},

		grounded(): boolean {
			return this.isGrounded();
		},

		isFalling(): boolean {
			return velY > 0;
		},

		falling(): boolean {
			return this.isFalling();
		},

		jump(force: number) {
			lastlastPlatform = curPlatform;
			curPlatform = null;
			lastPlatformPos = null;
			velY = -force || -this.jumpForce;
		},

		doubleJump(force: number) {
			if (this.isGrounded()) {
				this.jump(force);
			} else if (canDouble) {
				canDouble = false;
				this.jump(force);
				this.trigger("doubleJump");
			}
		},

		onGround(action: () => void): EventCanceller {
			return this.on("ground", action);
		},

		onFall(action: () => void): EventCanceller {
			return this.on("fall", action);
		},

		onHeadbutt(action: () => void): EventCanceller {
			return this.on("headbutt", action);
		},

		onDoubleJump(action: () => void): EventCanceller {
			return this.on("doubleJump", action);
		},

	};

}

function shader(id: string, uniform: Uniform = {}): ShaderComp {
	const shader = assets.shaders[id];
	return {
		id: "shader",
		shader: id,
		uniform: uniform,
	};
}

// TODO: accept weight (0 as anything can push, -1 as nothing can push, otherwise calc)
function solid(): SolidComp {
	const cleanups = [];
	return {
		id: "solid",
		require: [ "pos", "area", ],
		solid: true,
		add() {
			cleanups.push(this.onCollide((other, col) => {
				if (this.solid && other.solid && !col.resolved) {
					col.resolved = true;
					this.pos = this.pos.add(col.displacement);
					this._transform = calcTransform(this);
					this._worldArea = transformArea(this.localArea(), this._transform);
				}
			}));
		},
		destroy() {
			cleanups.forEach((c) => c());
		},
	};
}

function fixed(): FixedComp {
	return {
		id: "fixed",
		fixed: true,
	};
}

function stay(): StayComp {
	return {
		id: "stay",
		stay: true,
	};
}

function health(hp: number): HealthComp {
	if (hp == null) {
		throw new Error("health() requires the initial amount of hp");
	}
	return {
		id: "health",
		hurt(n: number = 1) {
			this.setHP(hp - n);
			this.trigger("hurt");
		},
		heal(n: number = 1) {
			this.setHP(hp + n);
			this.trigger("heal");
		},
		hp(): number {
			return hp;
		},
		setHP(n: number) {
			hp = n;
			if (hp <= 0) {
				this.trigger("death");
			}
		},
		onHurt(action: () => void): EventCanceller {
			return this.on("hurt", action);
		},
		onHeal(action: () => void): EventCanceller {
			return this.on("heal", action);
		},
		onDeath(action: () => void): EventCanceller {
			return this.on("death", action);
		},
		inspect() {
			return `${hp}`;
		},
	};
}

function lifespan(time: number, opt: LifespanCompOpt = {}): LifespanComp {
	if (time == null) {
		throw new Error("lifespan() requires time");
	}
	let timer = 0;
	const fade = opt.fade ?? 0;
	const startFade = Math.max((time - fade), 0);
	return {
		id: "lifespan",
		update() {
			timer += dt();
			// TODO: don't assume 1 as start opacity
			if (timer >= startFade) {
				this.opacity = map(timer, startFade, time, 1, 0);
			}
			if (timer >= time) {
				this.destroy();
			}
		},
	};
}

function state(
	initState: string,
	stateList?: string[],
	transitions?: Record<string, string | string[]>,
): StateComp {

	if (!initState) {
		throw new Error("state() requires an initial state");
	}

	const events = {};

	function initStateHook(state: string) {
		if (!events[state]) {
			events[state] = {
				enter: [],
				leave: [],
				update: [],
				draw: [],
			};
		}
	}

	function on(event, state, action) {
		initStateHook(state);
		events[state][event].push(action);
	}

	function trigger(event, state, ...args) {
		initStateHook(state);
		events[state][event].forEach((action) => action(...args));
	}

	return {

		id: "state",
		state: initState,

		enterState(state: string, ...args) {

			if (stateList && !stateList.includes(state)) {
				throw new Error(`State not found: ${state}`);
			}

			const oldState = this.state;

			// check if the transition is legal, if transition graph is defined
			if (!transitions?.[oldState]) {
				return;
			}

			const available = typeof transitions[oldState] === "string"
				? [transitions[oldState]]
				: transitions[oldState] as string[];

			if (!available.includes(state)) {
				throw new Error(`Cannot transition state from "${oldState}" to "${state}". Available transitions: ${available.map((s) => `"${s}"`).join(", ")}`);
			}

			trigger("leave", oldState, ...args);
			this.state = state;
			trigger("enter", state, ...args);
			trigger("enter", `${oldState} -> ${state}`, ...args);

		},

		onStateTransition(from: string, to: string, action: () => void) {
			on("enter", `${from} -> ${to}`, action);
		},

		onStateEnter(state: string, action: () => void) {
			on("enter", state, action);
		},

		onStateUpdate(state: string, action: () => void) {
			on("update", state, action);
		},

		onStateDraw(state: string, action: () => void) {
			on("draw", state, action);
		},

		onStateLeave(state: string, action: () => void) {
			on("leave", state, action);
		},

		update() {
			trigger("update", this.state);
		},

		draw() {
			trigger("draw", this.state);
		},

		inspect() {
			return this.state;
		},

	};

}

let logs = [];

const debug: Debug = {
	inspect: false,
	timeScale: 1,
	showLog: true,
	fps: app.fps,
	objCount(): number {
		// TODO: recursive count
		return game.root.children.length;
	},
	stepFrame: updateFrame,
	drawCalls: gfx.drawCalls,
	clearLog: () => logs = [],
	log: (msg) => logs.unshift(`[${app.time().toFixed(2)}].time [${msg}].info`),
	error: (msg) => logs.unshift(`[${app.time().toFixed(2)}].time [${msg}].error`),
	curRecording: null,
	get paused() {
		return game.paused;
	},
	set paused(v) {
		game.paused = v;
		if (v) {
			audio.ctx.suspend();
		} else {
			audio.ctx.resume();
		}
	}
};

function onLoad(cb: () => void): void {
	if (game.loaded) {
		cb();
	} else {
		game.on("load", cb);
	}
}

function scene(id: SceneID, def: SceneDef) {
	game.scenes[id] = def;
}

function go(id: SceneID, ...args) {

	if (!game.scenes[id]) {
		throw new Error(`scene not found: ${id}`);
	}

	const cancel = game.on("updateStart", () => {

		game.events = {};

		game.objEvents = {
			add: new IDList(),
			update: new IDList(),
			draw: new IDList(),
			destroy: new IDList(),
		};

		game.root.every((obj) => {
			if (!obj.is("stay")) {
				game.root.remove(obj);
			}
		})

		game.timers = new IDList();

		// cam
		game.cam = {
			pos: center(),
			scale: vec2(1, 1),
			angle: 0,
			shake: 0,
		};

		game.camMousePos = app.mousePos();
		game.camMatrix = mat4();

		game.layers = {};
		game.defLayer = null;
		game.gravity = DEF_GRAVITY;

		game.scenes[id](...args);

		if (gopt.debug !== false) {
			enterDebugMode();
		}

		if (gopt.burp) {
			enterBurpMode();
		}

		cancel();

	});

}

function getData<T>(key: string, def?: T): T {
	try {
		return JSON.parse(window.localStorage[key]);
	} catch {
		if (def) {
			setData(key, def);
			return def;
		} else {
			return null;
		}
	}
}

function setData(key: string, data: any) {
	window.localStorage[key] = JSON.stringify(data);
}

function plug<T>(plugin: KaboomPlugin<T>): MergeObj<T> & KaboomCtx {
	const funcs = plugin(ctx);
	for (const k in funcs) {
		// @ts-ignore
		ctx[k] = funcs[k];
		if (gopt.global !== false) {
			// @ts-ignore
			window[k] = funcs[k];
		}
	}
	return ctx as unknown as MergeObj<T> & KaboomCtx;
}

function center(): Vec2 {
	return vec2(width() / 2, height() / 2);
}

function grid(level: Level, p: Vec2) {

	return {

		id: "grid",
		gridPos: p.clone(),

		setGridPos(...args) {
			const p = vec2(...args);
			this.gridPos = p.clone();
			this.pos = vec2(
				level.offset().x + this.gridPos.x * level.gridWidth(),
				level.offset().y + this.gridPos.y * level.gridHeight()
			);
		},

		moveLeft() {
			this.setGridPos(this.gridPos.add(vec2(-1, 0)));
		},

		moveRight() {
			this.setGridPos(this.gridPos.add(vec2(1, 0)));
		},

		moveUp() {
			this.setGridPos(this.gridPos.add(vec2(0, -1)));
		},

		moveDown() {
			this.setGridPos(this.gridPos.add(vec2(0, 1)));
		},

	};

}

function addLevel(map: string[], opt: LevelOpt): Level {

	if (!opt.width || !opt.height) {
		throw new Error("Must provide level grid width & height.");
	}

	const objs: GameObj[] = [];
	const offset = vec2(opt.pos || vec2(0));
	let longRow = 0;

	const level = {

		offset() {
			return offset.clone();
		},

		gridWidth() {
			return opt.width;
		},

		gridHeight() {
			return opt.height;
		},

		getPos(...args): Vec2 {
			const p = vec2(...args);
			return vec2(
				offset.x + p.x * opt.width,
				offset.y + p.y * opt.height
			);
		},

		spawn(sym: string, ...args): GameObj {

			const p = vec2(...args);

			const comps = (() => {
				if (opt[sym]) {
					if (typeof opt[sym] !== "function") {
						throw new Error("level symbol def must be a function returning a component list");
					}
					return opt[sym](p);
				} else if (opt.any) {
					return opt.any(sym, p);
				}
			})();

			if (!comps) {
				return;
			}

			const posComp = vec2(
				offset.x + p.x * opt.width,
				offset.y + p.y * opt.height
			);

			for (const comp of comps) {
				if (comp.id === "pos") {
					posComp.x += comp.pos.x;
					posComp.y += comp.pos.y;
					break;
				}
			}

			comps.push(pos(posComp));
			comps.push(grid(this, p));

			const obj = game.root.add(comps);

			objs.push(obj);

			return obj;

		},

		width() {
			return longRow * opt.width;
		},

		height() {
			return map.length * opt.height;
		},

		destroy() {
			for (const obj of objs) {
				obj.destroy();
			}
		},

	};

	map.forEach((row, i) => {

		const syms = row.split("");

		longRow = Math.max(syms.length, longRow);

		syms.forEach((sym, j) => {
			level.spawn(sym, vec2(j, i));
		});

	});

	return level;

}

function record(frameRate?): Recording {

	const stream = app.canvas.captureStream(frameRate);
	const audioDest = audio.ctx.createMediaStreamDestination();

	audio.masterNode.connect(audioDest)

	const audioStream = audioDest.stream;
	const [firstAudioTrack] = audioStream.getAudioTracks();

	// TODO: Enabling audio results in empty video if no audio received
	// stream.addTrack(firstAudioTrack);

	const recorder = new MediaRecorder(stream);
	const chunks = [];

	recorder.ondataavailable = (e) => {
		if (e.data.size > 0) {
			chunks.push(e.data);
		}
	};

	recorder.onerror = (e) => {
		audio.masterNode.disconnect(audioDest)
		stream.getTracks().forEach(t => t.stop());
	};

	recorder.start();

	return {

		resume() {
			recorder.resume();
		},

		pause() {
			recorder.pause();
		},

		download(filename = "kaboom.mp4") {

			recorder.onstop = () => {
				downloadBlob(new Blob(chunks, {
					type: "video/mp4",
				}), filename);
			}

			recorder.stop();
			// cleanup
			audio.masterNode.disconnect(audioDest)
			stream.getTracks().forEach(t => t.stop());

		}
	};

}

const ctx: KaboomCtx = {
	// asset load
	loadRoot: assets.loadRoot,
	loadSprite: assets.loadSprite,
	loadSpriteAtlas: assets.loadSpriteAtlas,
	loadSound: assets.loadSound,
	loadFont: assets.loadFont,
	loadShader: assets.loadShader,
	loadAseprite: assets.loadAseprite,
	loadPedit: assets.loadPedit,
	loadBean: assets.loadBean,
	load: assets.load,
	// query
	width,
	height,
	center,
	dt,
	time: app.time,
	screenshot: app.screenshot,
	record: record,
	focused: app.isFocused,
	isFocused: app.isFocused,
	focus: app.focus,
	cursor: app.cursor,
	regCursor,
	fullscreen: app.fullscreen,
	isFullscreen: app.isFullscreen,
	onLoad,
	ready: onLoad,
	isTouch: () => app.isTouch,
	// misc
	layers,
	camPos,
	camScale,
	camRot,
	shake,
	toScreen,
	toWorld,
	gravity,
	// obj
	add: (...args) => game.root.add(...args),
	readd: (...args) => game.root.readd(...args),
	destroy: (obj: GameObj) => obj.destroy(),
	destroyAll: (...args) => game.root.removeAll(...args),
	get: (...args) => game.root.get(...args),
	every: (...args) => game.root.every(...args),
	revery: (...args) => game.root.revery(...args),
	// comps
	pos,
	scale,
	rotate,
	color,
	opacity,
	origin,
	layer,
	area,
	sprite,
	text,
	rect,
	circle,
	uvquad,
	outline,
	body,
	shader,
	timer,
	solid,
	fixed,
	stay,
	health,
	lifespan,
	z,
	move,
	cleanup,
	follow,
	state,
	// group events
	on,
	onUpdate,
	onDraw,
	onCollide,
	onClick,
	onHover,
	action: onUpdate,
	render: onDraw,
	collides: onCollide,
	clicks: onClick,
	hovers: onHover,
	// input
	onKeyDown,
	onKeyPress,
	onKeyPressRepeat,
	onKeyRelease,
	onMouseDown,
	onMousePress,
	onMouseRelease,
	onMouseMove,
	onCharInput,
	onTouchStart,
	onTouchMove,
	onTouchEnd,
	keyDown: onKeyDown,
	keyPress: onKeyPress,
	keyPressRep: onKeyPressRepeat,
	keyRelease: onKeyRelease,
	mouseDown: onMouseDown,
	mouseClick: onMousePress,
	mouseRelease: onMouseRelease,
	mouseMove: onMouseMove,
	charInput: onCharInput,
	touchStart: onTouchStart,
	touchMove: onTouchMove,
	touchEnd: onTouchEnd,
	mousePos,
	mouseWorldPos,
	mouseDeltaPos: app.mouseDeltaPos,
	isKeyDown: app.isKeyDown,
	isKeyPressed: app.isKeyPressed,
	isKeyPressedRepeat: app.isKeyPressedRepeat,
	isKeyReleased: app.isKeyReleased,
	isMouseDown: app.isMouseDown,
	isMousePressed: app.isMousePressed,
	isMouseReleased: app.isMouseReleased,
	isMouseMoved: app.isMouseMoved,
	keyIsDown: app.isKeyDown,
	keyIsPressed: app.isKeyPressed,
	keyIsPressedRep: app.isKeyPressedRepeat,
	keyIsReleased: app.isKeyReleased,
	mouseIsDown: app.isMouseDown,
	mouseIsClicked: app.isMousePressed,
	mouseIsReleased: app.isMouseReleased,
	mouseIsMoved: app.isMouseMoved,
	// timer
	loop,
	wait,
	// audio
	play,
	volume: audio.volume,
	burp: audio.burp,
	audioCtx: audio.ctx,
	// math
	rng,
	rand,
	randi,
	randSeed,
	vec2,
	vec2FromAngle,
	dir: vec2FromAngle,
	rgb,
	hsl2rgb,
	quad,
	choose,
	chance,
	lerp,
	map,
	mapc,
	wave,
	deg2rad,
	rad2deg,
	testAreaRect,
	testAreaLine,
	testAreaCircle,
	testAreaPolygon,
	testAreaPoint,
	testAreaArea,
	testLineLine,
	testRectRect,
	testRectLine,
	testRectPoint,
	testPolygonPoint,
	testLinePolygon,
	testPolygonPolygon,
	testCircleCircle,
	testCirclePoint,
	testRectPolygon,
	// raw draw
	drawSprite,
	drawText,
	formatText,
	// TODO: wrap these to use assets lib for the "shader" prop
	drawRect: gfx.drawRect,
	drawLine: gfx.drawLine,
	drawLines: gfx.drawLines,
	drawTriangle: gfx.drawTriangle,
	drawCircle: gfx.drawCircle,
	drawEllipse: gfx.drawEllipse,
	drawUVQuad: gfx.drawUVQuad,
	drawPolygon: gfx.drawPolygon,
	drawFormattedText: gfx.drawFormattedText,
	pushTransform: gfx.pushTransform,
	popTransform: gfx.popTransform,
	pushTranslate: gfx.pushTranslate,
	pushRotate: gfx.pushRotateZ,
	pushScale: gfx.pushScale,
	// debug
	debug,
	// scene
	scene,
	go,
	// level
	addLevel,
	// storage
	getData,
	setData,
	// plugin
	plug,
	// char sets
	ASCII_CHARS,
	CP437_CHARS,
	// dirs
	LEFT: vec2(-1, 0),
	RIGHT: vec2(1, 0),
	UP: vec2(0, -1),
	DOWN: vec2(0, 1),
	// colors
	RED: rgb(255, 0, 0),
	GREEN: rgb(0, 255, 0),
	BLUE: rgb(0, 0, 255),
	YELLOW: rgb(255, 255, 0),
	MAGENTA: rgb(255, 0, 255),
	CYAN: rgb(0, 255, 255),
	WHITE: rgb(255, 255, 255),
	BLACK: rgb(0, 0, 0),
	// dom
	canvas: app.canvas,
};

plug(kaboomPlugin);

if (gopt.plugins) {
	gopt.plugins.forEach(plug);
}

if (gopt.global !== false) {
	for (const k in ctx) {
		window[k] = ctx[k];
	}
}

let numFrames = 0;

function frames() {
	return numFrames;
}

function updateFrame() {

	game.trigger("updateStart");

	// update timers
	game.timers.forEach((t, id) => {
		t.time -= dt();
		if (t.time <= 0) {
			// TODO: some timer action causes crash on FF when dt is really high, not sure why
			t.action();
			game.timers.delete(id);
		}
	});

	// update every obj
	game.root.update();

}

function calcTransform(obj: GameObj): Mat4 {
	let tr = mat4();
	if (obj.pos) tr = tr.translate(obj.pos)
	if (obj.scale) tr = tr.scale(obj.scale)
	if (obj.angle) tr = tr.rotateZ(obj.angle)
	let p = obj.parent;
	while (p) {
		tr = p._transform.mult(tr);
		p = p.parent;
	}
	return tr;
}

function checkFrame() {

	// start a spatial hash grid for more efficient collision detection
	const grid: Record<number, Record<number, GameObj<AreaComp>[]>> = {};
	const cellSize = gopt.hashGridSize || DEF_HASH_GRID_SIZE;

	// current transform
	let tr = mat4();

	// a local transform stack
	const stack = [];

	function checkObj(obj: GameObj) {

		stack.push(tr);

		// Update object transform here. This will be the transform later used in rendering.
		if (obj.pos) tr = tr.translate(obj.pos);
		if (obj.scale) tr = tr.scale(obj.scale);
		if (obj.angle) tr = tr.rotateZ(obj.angle);
		obj._transform = tr.clone();

		// TODO: this logic should be defined through external interface
		if (obj.is("area")) {

			// TODO: only update worldArea if transform changed
			const aobj = obj as GameObj<AreaComp>;
			const area = transformArea(aobj.localArea(), tr);
			const bbox = areaBBox(area);
			aobj._worldArea = area;
			aobj._bbox = bbox;

			// Get spatial hash grid coverage
			const xmin = Math.floor(bbox.p1.x / cellSize);
			const ymin = Math.floor(bbox.p1.y / cellSize);
			const xmax = Math.ceil((bbox.p2.x) / cellSize);
			const ymax = Math.ceil((bbox.p2.y) / cellSize);

			// Cache objs that are already checked
			const checked = new Set();

			// insert & check against all covered grids
			for (let x = xmin; x <= xmax; x++) {
				for (let y = ymin; y <= ymax; y++) {
					if(!grid[x]) {
						grid[x] = {};
						grid[x][y] = [aobj];
					} else if(!grid[x][y]) {
						grid[x][y] = [aobj];
					} else {
						const cell = grid[x][y];
						for (const other of cell) {
							if (!other.exists()) {
								continue;
							}
							// TODO: whitelist / blacklist?
							if (!checked.has(other._id)) {
								const res = aobj.checkCollision(other);
								if (res && !res.isZero()) {
									const col1 = makeCollision(other, res);
									const col2 = makeCollision(aobj, res.scale(-1));
									aobj.trigger("collide", other, col1);
									if (col1.resolved) {
										col2.resolved = true;
									}
									other.trigger("collide", aobj, col2);
								}
							}
							checked.add(other._id);
						}
						cell.push(aobj);
					}
				}
			}

		}

		obj.revery(checkObj);
		tr = stack.pop();

	}

	checkObj(game.root);

}

function drawFrame() {

	// calculate camera matrix
	const scale = vec2(-2 / width(), 2 / height());
	const cam = game.cam;
	const shake = vec2FromAngle(rand(0, 360)).scale(cam.shake).scale(scale);

	cam.shake = lerp(cam.shake, 0, 5 * dt());
	game.camMatrix = mat4()
		.scale(cam.scale)
		.rotateZ(cam.angle)
		.translate(cam.pos.scale(scale).add(vec2(1, -1)).add(shake))
		;

	game.root.draw();

}

function drawLoadScreen() {

	// if assets are not fully loaded, draw a progress bar
	const progress = assets.loadProgress();

	if (progress === 1) {
		game.loaded = true;
		game.trigger("load");
	} else {

		const w = width() / 2;
		const h = 24 / gfx.scale();
		const pos = vec2(width() / 2, height() / 2).sub(vec2(w / 2, h / 2));

		gfx.drawRect({
			pos: vec2(0),
			width: width(),
			height: height(),
			color: rgb(0, 0, 0),
		});

		gfx.drawRect({
			pos: pos,
			width: w,
			height: h,
			fill: false,
			outline: {
				width: 4 / gfx.scale(),
			},
		});

		gfx.drawRect({
			pos: pos,
			width: w * progress,
			height: h,
		});

	}

}

function drawInspectText(pos, txt) {

	const s = app.scale;
	const pad = vec2(8);

	gfx.pushTransform();
	gfx.pushTranslate(pos);
	gfx.pushScale(1 / s);

	const ftxt = gfx.formatText({
		text: txt,
		font: assets.fonts[DBG_FONT],
		size: 16,
		pos: pad,
		color: rgb(255, 255, 255),
	});

	const bw = ftxt.width + pad.x * 2;
	const bh = ftxt.height + pad.x * 2;

	if (pos.x + bw / s >= width()) {
		gfx.pushTranslate(vec2(-bw, 0));
	}

	if (pos.y + bh / s >= height()) {
		gfx.pushTranslate(vec2(0, -bh));
	}

	gfx.drawRect({
		width: bw,
		height: bh,
		color: rgb(0, 0, 0),
		radius: 4,
		opacity: 0.8,
	});

	gfx.drawFormattedText(ftxt);
	gfx.popTransform();

}

function drawDebug() {

	if (debug.inspect) {

		let inspecting = null;
		const lcolor = rgb(gopt.inspectColor ?? [0, 0, 255]);

		function drawObjDebug(obj: GameObj) {

			obj.every(drawObjDebug);

			if (!obj.area) {
				return;
			}

			if (obj.hidden) {
				return;
			}

			const scale = gfx.scale() * (obj.fixed ? 1: (game.cam.scale.x + game.cam.scale.y) / 2);

			if (!inspecting) {
				if (obj.isHovering()) {
					inspecting = obj;
				}
			}

			const lwidth = (inspecting === obj ? 8 : 4) / scale;
			const a = obj._worldArea;

			gfx.drawArea({
				area: a,
				outline: {
					width: lwidth,
					color: lcolor,
				},
				uniform: {
					"u_transform": mat4(),
				},
				fill: false,
			});

		}

		// draw area outline
		game.root.every(drawObjDebug);

		if (inspecting) {

			const lines = [];
			const data = inspecting.inspect();

			for (const tag in data) {
				if (data[tag]) {
					lines.push(`${tag}: ${data[tag]}`);
				} else {
					lines.push(`${tag}`);
				}
			}

			drawInspectText(mousePos(), lines.join("\n"));

		}

		drawInspectText(vec2(8 / app.scale), `FPS: ${app.fps()}`);

	}

	if (debug.paused) {

		// top right corner
		gfx.pushTransform();
		gfx.pushTranslate(width(), 0);
		gfx.pushScale(1 / app.scale);
		gfx.pushTranslate(-8, 8);

		const size = 32;

		// bg
		gfx.drawRect({
			width: size,
			height: size,
			origin: "topright",
			color: rgb(0, 0, 0),
			opacity: 0.8,
			radius: 4,
		});

		// pause icon
		for (let i = 1; i <= 2; i++) {
			gfx.drawRect({
				width: 4,
				height: size * 0.6,
				origin: "center",
				pos: vec2(-size / 3 * i, size * 0.5),
				color: rgb(255, 255, 255),
				radius: 2,
			});
		}

		gfx.popTransform();

	}

	if (debug.timeScale !== 1) {

		// bottom right corner
		gfx.pushTransform();
		gfx.pushTranslate(width(), height());
		gfx.pushScale(1 / app.scale);
		gfx.pushTranslate(-8, -8);

		const pad = 8;

		// format text first to get text size
		const ftxt = gfx.formatText({
			text: debug.timeScale.toFixed(1),
			font: assets.fonts[DBG_FONT],
			size: 16,
			color: rgb(255, 255, 255),
			pos: vec2(-pad),
			origin: "botright",
		});

		// bg
		gfx.drawRect({
			width: ftxt.width + pad * 2 + pad * 4,
			height: ftxt.height + pad * 2,
			origin: "botright",
			color: rgb(0, 0, 0),
			opacity: 0.8,
			radius: 4,
		});

		// fast forward / slow down icon
		for (let i = 0; i < 2; i++) {
			const flipped = debug.timeScale < 1;
			gfx.drawTriangle({
				p1: vec2(-ftxt.width - pad * (flipped ? 2 : 3.5), -pad),
				p2: vec2(-ftxt.width - pad * (flipped ? 2 : 3.5), -pad - ftxt.height),
				p3: vec2(-ftxt.width - pad * (flipped ? 3.5 : 2), -pad - ftxt.height / 2),
				pos: vec2(-i * pad * 1 + (flipped ? -pad * 0.5 : 0), 0),
				color: rgb(255, 255, 255),
			});
		}

		// text
		gfx.drawFormattedText(ftxt);

		gfx.popTransform();

	}

	if (debug.curRecording) {

		gfx.pushTransform();
		gfx.pushTranslate(0, height());
		gfx.pushScale(1 / app.scale);
		gfx.pushTranslate(24, -24);

		gfx.drawCircle({
			radius: 12,
			color: rgb(255, 0, 0),
			opacity: wave(0, 1, app.time() * 4),
		});

		gfx.popTransform();

	}

	if (debug.showLog && logs.length > 0) {

		gfx.pushTransform();
		gfx.pushTranslate(0, height());
		gfx.pushScale(1 / app.scale);
		gfx.pushTranslate(8, -8);

		const pad = 8;
		const max = gopt.logMax ?? 1;

		if (logs.length > max) {
			logs = logs.slice(0, max);
		}

		const ftext = gfx.formatText({
			text: logs.join("\n"),
			font: assets.fonts[DBG_FONT],
			pos: vec2(pad, -pad),
			origin: "botleft",
			size: 16,
			width: gfx.width() * gfx.scale() * 0.6,
			lineSpacing: pad / 2,
			styles: {
				"time": { color: rgb(127, 127, 127) },
				"info": { color: rgb(255, 255, 255) },
				"error": { color: rgb(255, 0, 127) },
			},
		});

		gfx.drawRect({
			width: ftext.width + pad * 2,
			height: ftext.height + pad * 2,
			origin: "botleft",
			color: rgb(0, 0, 0),
			radius: 4,
			opacity: 0.8,
		});

		gfx.drawFormattedText(ftext);
		gfx.popTransform();

	}

}

app.run(() => {

	numFrames++;

	if (!game.loaded) {
		gfx.frameStart();
		drawLoadScreen();
		gfx.frameEnd();
	} else {

		// TODO: this gives the latest mousePos in input handlers but uses cam matrix from last frame
		game.camMousePos = gfx.toScreen(game.camMatrix.invert().multVec2(gfx.toNDC(app.mousePos())));
		game.trigger("input");

		if (!debug.paused && gopt.debug !== false) {
			updateFrame();
		}

		checkFrame();

		gfx.frameStart();
		drawFrame();

		if (gopt.debug !== false) {
			drawDebug();
		}

		gfx.frameEnd();

	}

});

if (gopt.debug !== false) {
	enterDebugMode();
}

if (gopt.burp) {
	enterBurpMode();
}

window.addEventListener("error", (e) => {
	debug.error(`Error: ${e.error.message}`);
	app.quit();
	app.run(() => {
		if (assets.loadProgress() === 1) {
			gfx.frameStart();
			drawDebug();
			gfx.frameEnd();
		}
	});
});

return ctx;

};
