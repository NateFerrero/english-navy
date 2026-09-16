// Application bootstrap.

import { registerRoute, setNotFound, startRouter } from "./router.mjs";
import { syncApiFromUrl } from "./api/index.mjs";
import { renderHome } from "./views/home.mjs";
import { renderLog } from "./views/log.mjs";
import { renderProfile } from "./views/profile.mjs";
import { renderSettings } from "./views/settings.mjs";
import { renderSignin } from "./views/signin.mjs";
import { renderSignup } from "./views/signup.mjs";
import { renderWelcome } from "./views/welcome.mjs";
import { renderNotFound } from "./views/notfound.mjs";
import { applyTheme } from "./theme.mjs";

// Persist the API choice from ?api=... before anything renders, so the whole
// session (across pushState navigation) keeps using the selected API.
syncApiFromUrl();
applyTheme();

registerRoute("/", renderHome);
registerRoute("/log", renderLog);
registerRoute("/profile", renderProfile);
registerRoute("/settings", renderSettings);
registerRoute("/signin", renderSignin);
registerRoute("/signup", renderSignup);
registerRoute("/welcome", renderWelcome);
setNotFound(renderNotFound);

const root = document.getElementById("app");
startRouter(root);
