// Dev-variant switch: `APP_VARIANT=development expo run:android` builds under a
// separate package id + distinct labels so the debug (hot-reload) install
// coexists with — and is tellable apart from — the release-signed Obtainium app
// on a device. Everything here is config-driven so it survives `expo prebuild`
// (including --clean); do NOT hand-edit the generated android/ tree. CI/release
// builds never set APP_VARIANT and use app.json verbatim.
const IS_DEV = process.env.APP_VARIANT === 'development';

// Relabel the agenda widget for dev builds so the two "mitsume" entries are
// distinguishable in the launcher's widget picker (react-native-android-widget
// sets the receiver label from widgets[].label).
function withDevWidgetLabel(plugins) {
  return plugins.map((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'react-native-android-widget'
      ? [
          plugin[0],
          {
            ...plugin[1],
            widgets: plugin[1].widgets.map((widget) => ({
              ...widget,
              label: 'agenda (dev)',
            })),
          },
        ]
      : plugin
  );
}

module.exports = ({ config }) => ({
  ...config,
  ...(IS_DEV
    ? {
        // Launcher app label comes from expo.name (@string/app_name).
        name: 'mitsume (dev)',
        android: {
          ...config.android,
          package: 'com.miraiconcepts.mitsume.dev',
        },
        plugins: withDevWidgetLabel(config.plugins),
      }
    : {}),
});
