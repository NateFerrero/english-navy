// Application bootstrap.

import { registerRoute, setNotFound, startRouter } from "./router.mjs";
import { syncApiFromUrl } from "./api/index.mjs";
import { renderHome } from "./views/home.mjs";
import { renderSignup } from "./views/signup.mjs";
import { renderWelcome } from "./views/welcome.mjs";
import { renderNotFound } from "./views/notfound.mjs";

// Persist the API choice from ?api=... before anything renders, so the whole
// session (across pushState navigation) keeps using the selected API.
syncApiFromUrl();

registerRoute("/", renderHome);
registerRoute("/signup", renderSignup);
registerRoute("/welcome", renderWelcome);
setNotFound(renderNotFound);

const root = document.getElementById("app");
startRouter(root);
