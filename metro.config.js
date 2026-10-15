const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The SÚKL reference database (assets/db/sukl.db) is bundled as an asset.
config.resolver.assetExts.push('db');

module.exports = config;
