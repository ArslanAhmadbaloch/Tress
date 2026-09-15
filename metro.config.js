/**
 * Metro needs telling that a `.tflite` file is an asset.
 *
 * Without this the bundler treats the model as source, fails to parse it
 * and the app dies at import — which looks like a native-module problem
 * and is not one. Bundling it also means the model ships inside the app
 * rather than being fetched on first run, which is what keeps the scan
 * working offline and keeps the file off the network entirely.
 */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflite');

module.exports = config;
