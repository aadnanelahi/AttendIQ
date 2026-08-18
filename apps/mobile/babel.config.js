module.exports = function (api: { cache: (flag: boolean) => void }) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
