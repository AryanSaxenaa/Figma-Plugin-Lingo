const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const InlineSourceWebpackPlugin = require("inline-source-webpack-plugin");

module.exports = (env, argv) => {
    const isDev = argv.mode === "development";

    return [
        // Plugin sandbox entry — outputs dist/code.js
        // Uses tsconfig.plugin.json which includes @figma/plugin-typings and no DOM lib.
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

        // UI entry — outputs a single self-contained dist/ui.html with all JS and CSS inlined.
        // Uses tsconfig.ui.json which has DOM lib and JSX, but NO @figma/plugin-typings.
        // Figma loads plugin UIs from disk and cannot resolve external file references.
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
            },
            resolve: {
                extensions: [".tsx", ".ts", ".js"],
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
                // Inlines all <script src> and <link> tags into the HTML.
                new InlineSourceWebpackPlugin({
                    compress: false,
                    rootpath: path.resolve(__dirname, "dist"),
                    noAssetMatch: "warn",
                }),
            ],
        },
    ];
};
