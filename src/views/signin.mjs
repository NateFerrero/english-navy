import { el, clear, isValidEmail } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getApi } from "../api/index.mjs";
import { setSessionEmail } from "../session.mjs";

export function renderSignin(outlet) {
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
    autocomplete: "current-password",
    placeholder: "Your password",
    required: "",
  });

  const submit = el("button", {
    type: "submit",
    class: "btn btn-primary",
    text: "Sign in",
  });

  function setAlert(kind, message) {
    clear(formAlert);
    if (message) {
      formAlert.append(el("div", { class: `alert alert-${kind}`, text: message }));
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
    if (!passwordInput.value) {
      passwordError.textContent = "Enter your password.";
      ok = false;
    }
    return ok;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setAlert(null, "");
    if (!validate()) return;

    submit.disabled = true;
    submit.textContent = "Signing in...";

    try {
      const user = await getApi().logIn({
        email: emailInput.value,
        password: passwordInput.value,
      });
      setSessionEmail(user.email);
      navigate("/");
    } catch (err) {
      setAlert("error", err.message || "Sign in failed. Please try again.");
      submit.disabled = false;
      submit.textContent = "Sign in";
    }
  }

  const form = el("form", { novalidate: "", onsubmit: onSubmit }, [
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
  ]);

  const card = el("div", { class: "card" }, [
    el("h2", { text: "Sign in" }),
    el("p", { class: "subtitle", text: "Return to your post aboard The English Navy." }),
    form,
    el("p", { class: "form-foot" }, [
      "Need to enlist? ",
      el("a", { href: "/signup", "data-link": "", text: "Create an account" }),
    ]),
  ]);

  clear(outlet);
  outlet.append(page(card));
  emailInput.focus();
}
