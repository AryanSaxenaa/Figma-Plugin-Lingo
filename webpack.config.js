const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const fs = require("fs");

/**
 * A minimal webpack plugin that post-processes the HtmlWebpackPlugin output.
 * It reads the emitted JS bundle, removes the <script src> tag, and embeds
 * the JS content directly inside a <script> tag in the HTML.
 *
 * Figma requires the plugin UI to be a single self-contained file —
 * it loads ui.html from disk and cannot resolve relative file references.
 */
class FigmaInlinePlugin {
    apply(compiler) {
        compiler.hooks.compilation.tap("FigmaInlinePlugin", (compilation) => {
            HtmlWebpackPlugin.getHooks(compilation).beforeEmit.tapAsync(
                "FigmaInlinePlugin",
                (data, cb) => {
                    let html = data.html;

                    // Find all <script src="..."> tags and replace them with inline scripts.
                    html = html.replace(
                        /<script(?:[^>]*?) src="([^"]+)"(?:[^>]*)><\/script>/gi,
                        (match, src) => {
                            const assetName = src.replace(/^\//, "");
                            const asset = compilation.assets[assetName];
                            if (asset) {
                                const code = asset.source();
                                return `<script>${code}</script>`;
                            }
                            return match;
                        }
                    );

                    data.html = html;
                    cb(null, data);
                }
            );
        });
    }
}

module.exports = (env, argv) => {
    const isDev = argv.mode === "development";

    return [
        // Plugin sandbox entry — outputs dist/code.js
        // Uses tsconfig.plugin.json: includes @figma/plugin-typings, no DOM lib.
        {
            name: "plugin",
            target: "web",
            entry: {
                code: "./src/plugin/code.ts",
            },
            output: {
                filename: "[name].js",
                path: path.resolve(__dirname, "dist"),
                clean: false,
            },
            resolve: {
                extensions: [".ts", ".js"],
            },
            module: {
                rules: [
                    {
                        test: /\.tsx?$/,
                        use: {
                            loader: "ts-loader",
                            options: {
                                configFile: path.resolve(__dirname, "tsconfig.plugin.json"),
                            },
                        },
                        exclude: /node_modules/,
                    },
                ],
            },
            devtool: isDev ? "inline-source-map" : false,
        },

        // UI entry — outputs a single self-contained dist/ui.html with all JS inlined.
        // Uses tsconfig.ui.json: DOM lib + JSX, no @figma/plugin-typings.
        {
            name: "ui",
            target: "web",
            entry: {
                ui: "./src/ui/index.tsx",
            },
            output: {
                filename: "[name].js",
                path: path.resolve(__dirname, "dist"),
                clean: false,
                publicPath: "",
            },
            resolve: {
                extensions: [".tsx", ".ts", ".js"],
                fallback: {
                    "util": false,
                    "fs": false,
                    "path": false,
                    "os": false,
                    "vm": false,
                    "stream": false,
                    "constants": false,
                    "crypto": false,
                    "http": false,
                    "https": false,
                    "zlib": false,
                    "tls": false,
                    "net": false,
                    "child_process": false,
                    "url": false,
                    "buffer": false,
                    "string_decoder": false,
                    "events": false,
                    "assert": false
                }
            },
            module: {
                rules: [
                    {
                        test: /\.tsx?$/,
                        use: {
                            loader: "ts-loader",
                            options: {
                                configFile: path.resolve(__dirname, "tsconfig.ui.json"),
                            },
                        },
                        exclude: /node_modules/,
                    },
                    {
                        test: /\.css$/,
                        use: ["style-loader", "css-loader"],
                    },
                ],
            },
            devtool: false,
            plugins: [
                new HtmlWebpackPlugin({
                    template: "./src/ui/index.html",
                    filename: "ui.html",
                    chunks: ["ui"],
                    inject: "body",
                    scriptLoading: "blocking",
                }),
                new FigmaInlinePlugin(),
            ],
        },
    ];
};
