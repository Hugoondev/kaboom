const esbuild = require("esbuild");

function dofile(mod) {
	delete require.cache[require.resolve(mod)];
	return require(mod);
}

let server = null;

esbuild.build({
	bundle: true,
	sourcemap: true,
	target: "es6",
	minify: true,
	keepNames: true,
	jsxFactory: "jsx",
	platform: "node",
	watch: process.env.NODE_ENV === "development" ? {
		onRebuild() {
			server.close();
			server = dofile("./site").default;
		},
	} : false,
	inject: [ "inject.js", ],
	entryPoints: [ "run.tsx" ],
	outfile: "site.js",
}).then(() => {
	server = dofile("./site").default;
});