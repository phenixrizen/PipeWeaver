import { createApp } from "vue";
import { createPinia } from "pinia";

import App from "./App.vue";
import router from "./router";
import "./style.css";

// The root app wires together routing and shared state for the editor workflow.
const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
