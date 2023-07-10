import esbuild from 'esbuild';

await esbuild.build({
    entryPoints: ['source/server.ts'],
    bundle: true,
    platform: "node",
    target: "node16.13",
    format: "esm",
    banner: {
        js: `
            import {createRequire} from 'module';
            const require = createRequire(import.meta.url);
        `
    },
    outfile: 'server.out.js',
    watch: process.argv.slice(2).some(s => s === "--watch"),
});