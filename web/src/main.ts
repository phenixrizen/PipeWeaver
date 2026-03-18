import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import "./style.css";

// main wires together the app shell, global store, and router.
const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
