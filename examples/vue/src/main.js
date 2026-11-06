// The widget comes in through a side-effect import. Once loaded, <fusen-widget> is
// defined and connected to IndexedDB. The prebuilt file is referenced by relative path
// to show that this example is "just paste lite's dist as is".
import "../../../packages/lite/dist/fusen-lite.js";

import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
