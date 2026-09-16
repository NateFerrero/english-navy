import { el, clear, isValidEmail } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getApi } from "../api/index.mjs";

export function renderSignup(outlet) {
  const emailError = el("div", { class: "error" });
  const passwordError = el("div", { class: "error" });
  const formAlert = el("div");

  const emailInput = el("input", {
    id: "email",
    name: "email",
    type: "email",
    autocomplete: "email",
    placeholder: "sailor@example.com",
    required: "",
  });

  const passwordInput = el("input", {
    id: "password",
    name: "password",
    type: "password",
    autocomplete: "new-password",
    placeholder: "At least 8 characters",
    required: "",
  });

  const submit = el("button", {
    type: "submit",
    class: "btn btn-primary",
    text: "Create account",
  });

  function setAlert(kind, message) {
    clear(formAlert);
    if (message) {
      formAlert.append(
        el("div", { class: `alert alert-${kind}`, text: message })
      );
    }
  }

  function validate() {
    let ok = true;
    emailError.textContent = "";
    passwordError.textContent = "";

    if (!isValidEmail(emailInput.value)) {
      emailError.textContent = "Enter a valid email address.";
      ok = false;
    }
    if (passwordInput.value.length < 8) {
      passwordError.textContent = "Password must be at least 8 characters.";
      ok = false;
    }
    return ok;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setAlert(null, "");
    if (!validate()) return;

    submit.disabled = true;
    submit.textContent = "Creating account…";

    try {
      const user = await getApi().signUp({
        email: emailInput.value,
        password: passwordInput.value,
      });
      // Persist just enough to greet the user on the welcome screen.
      sessionStorage.setItem("session:email", user.email);
      navigate("/welcome");
    } catch (err) {
      setAlert("error", err.message || "Sign up failed. Please try again.");
      submit.disabled = false;
      submit.textContent = "Create account";
    }
  }

  const form = el(
    "form",
    { novalidate: "", onsubmit: onSubmit },
    [
      formAlert,
      el("div", { class: "field" }, [
        el("label", { for: "email", text: "Email address" }),
        emailInput,
        emailError,
      ]),
      el("div", { class: "field" }, [
        el("label", { for: "password", text: "Password" }),
        passwordInput,
        passwordError,
      ]),
      submit,
    ]
  );

  const card = el("div", { class: "card" }, [
    el("h2", { text: "Create your account" }),
    el("p", { class: "subtitle", text: "Join The English Navy in seconds." }),
    form,
    el("p", { class: "form-foot" }, [
      "Already enlisted? ",
      el("a", { href: "/", "data-link": "", text: "Return home" }),
    ]),
  ]);

  clear(outlet);
  outlet.append(page(card));
  emailInput.focus();
}
