const path = require("path")
const webpack = require("webpack")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const CopyWebpackPlugin = require("copy-webpack-plugin")
const MiniCssExtractPlugin = require("mini-css-extract-plugin")

require("dotenv").config()

module.exports = (env, argv) => {
  // The design lab is a dev-only playground. Shipping it in the store zip is
  // 250KB of dead surface a reviewer will open and question.
  const isProd = argv.mode === "production"

  return {
  devtool: "cheap-module-source-map",

  entry: {
    popup: "./src/popup.tsx",
    background: "./src/background/index.ts",
    ...(isProd ? {} : { "design-lab": "./src/design-lab/index.tsx" }),
  },

  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },

  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    alias: {
      "~": path.resolve(__dirname, "src"),
      "@iconoma-icons/core": path.resolve(__dirname, "node_modules/@iconoma-icons/core"),
      "@iconoma-icons/collection": path.resolve(__dirname, "node_modules/@iconoma-icons/collection"),
    },
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
    ],
  },

  optimization: {
    splitChunks: false,
    runtimeChunk: false,
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: "./src/popup.html",
      filename: "popup.html",
      chunks: ["popup"],
    }),
    new HtmlWebpackPlugin({
      template: "./src/sidebar.html",
      filename: "sidebar.html",
      chunks: ["popup"],
    }),
    ...(isProd
      ? []
      : [
          new HtmlWebpackPlugin({
            template: "./src/design-lab.html",
            filename: "design-lab.html",
            chunks: ["design-lab"],
          }),
        ]),
    new MiniCssExtractPlugin(),
    new webpack.DefinePlugin({
      __ALCHEMY_KEY_1__: JSON.stringify(process.env.ALCHEMY_API_KEY_1 || ""),
      __ALCHEMY_KEY_2__: JSON.stringify(process.env.ALCHEMY_API_KEY_2 || ""),
      __ALCHEMY_KEY_3__: JSON.stringify(process.env.ALCHEMY_API_KEY_3 || ""),
      __ETHERSCAN_KEY__: JSON.stringify(process.env.ETHERSCAN_API_KEY || ""),
      __OPENSEA_KEY_1__: JSON.stringify(process.env.OPENSEA_KEY_1 || ""),
      __OPENSEA_KEY_2__: JSON.stringify(process.env.OPENSEA_KEY_2 || ""),
      // Access-gating (license) backend. LICENSE_API_URL points at the Savant
      // site auth endpoints. LICENSE_ENABLED=false bypasses the gate for local
      // dev so wallet/mint work is never blocked by a missing backend.
      __LICENSE_API_URL__: JSON.stringify(process.env.LICENSE_API_URL || "https://api.imcs.world"),
      __LICENSE_ENABLED__: JSON.stringify(process.env.LICENSE_ENABLED === "true"),
      // Admin/dev bypass code. Leave UNSET in beta/prod builds so no bypass ships.
      __DEV_BYPASS_CODE__: JSON.stringify(process.env.DEV_BYPASS_CODE || ""),
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: "manifest.json", to: "manifest.json" },
        { from: "assets/icon16.png", to: "icon16.png" },
        { from: "assets/icon32.png", to: "icon32.png" },
        { from: "assets/icon48.png", to: "icon48.png" },
        { from: "assets/icon128.png", to: "icon128.png" },
        { from: "assets/icon192.png", to: "icon192.png" },
        { from: "assets/icon512.png", to: "icon512.png" },
      ],
    }),
  ],
  }
}
